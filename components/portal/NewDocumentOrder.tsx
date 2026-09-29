"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  requestCustomDraft,
  requestExistingDocumentReviewGated,
  type DocLawyerSubmitResult,
  type DocumentRequest,
} from "@/lib/services/backend";
import { ApiError, isPaymentRequired, logApiError, errDetail } from "@/lib/http";
import { Notice } from "@/components/admin/AdminBits";
import { Link } from "@/i18n/navigation";
import Select from "@/components/Select";
import DocumentRequestPanel from "./DocumentRequestPanel";
import ManualDocPlanGate from "./ManualDocPlanGate";
import AttachmentPicker, { type VoiceNoteItem } from "./AttachmentPicker";
import DocTypePicker from "./DocTypePicker";
import {
  IconChevronLeft,
  IconEdit,
  IconClipboardCheck,
  IconEye,
  IconPaperclip,
  IconArrowRight,
  IconLock,
} from "@/components/icons";

// lexgo_frontend_custom_doc_flows.md: two ways into the call-center pool
// that need no template at all — the advocate writes the document from a
// blank page, or checks one the client already has. Both are the same
// multipart request (need + files + voice notes) and both track their status
// through the ordinary document-request panel afterwards, so nothing here
// re-implements the "waiting / claimed / ready" screens.
type Flow = "" | "scratch" | "review";

const MAX_FILE_MB = 25;
const MAX_FILES = 10;
const TITLE_MAX = 120;

// ── Document language, shared with DocumentLawyerAssist ──────────────
// The backend stores `language` verbatim and validates nothing: across 110
// document requests production holds "uz" (26) and "ru" (1) and no other
// value, while the script codes live on a different field entirely
// (DocumentTemplate.language, 988 rows of "uz-cyrl"). So what travels on the
// wire is this form's decision alone, and the product asks the client for a
// script — hence the three below. Both request forms read this one list
// instead of each keeping its own, which is how they drifted apart before.
export const DOC_LANGS = ["uz-latn", "uz-cyrl", "ru"] as const;
export type DocLang = (typeof DOC_LANGS)[number];

// Message key per stored code, in the portal.client.documents namespace both
// forms already translate with. "uz" and "en" are read-only leftovers: never
// sent again, but a request saved before the script choice existed still has
// to name its language instead of showing a bare code.
const DOC_LANG_KEY: Record<string, string> = {
  "uz-latn": "lang_uz_latn",
  "uz-cyrl": "lang_uz_cyrl",
  ru: "lang_ru",
  uz: "lang_uz",
  en: "lang_en",
};

// The three offered options, plus whatever code the request already carries
// when that is not one of them — a value missing from the list would make
// Select fall back to showing its first option, i.e. silently rewrite the
// client's stored choice on the next save. An empty `key` means "no label
// exists for this code"; the caller shows the code itself rather than
// mislabelling it as a language it is not.
export type DocLangOption = { value: string; key: string };
export function docLangOptions(current: string): DocLangOption[] {
  const values: string[] = [...DOC_LANGS];
  if (current && !values.includes(current)) values.push(current);
  return values.map((v) => ({ value: v, key: DOC_LANG_KEY[v] || "" }));
}

// The UI locale is uz | ru | en; only Russian is a document language of its
// own here, and Latin is the script the Uzbek UI itself is written in.
export function defaultDocLang(locale: string): DocLang {
  return locale.startsWith("ru") ? "ru" : "uz-latn";
}

// ── The wait clock (wp-hourglass) ────────────────────────────────────
// A clock face whose two hands sweep at different rates, shown inside the
// submit button for as long as a request is actually in flight. Before this
// the three order forms only swapped the button's own label, so the one
// moment a client is most likely to press twice had no motion in it at all —
// while the login button next door has had a spinner since it was written.
//
// It lives in this file, and the other two forms import it, for the same
// reason DOC_LANGS above lives here: DocumentLawyerAssist already reads
// defaultDocLang/docLangOptions from this module, so this is already the
// shared module of the three order forms, and a loader copy-pasted into three
// files is a loader that will be three slightly different loaders by the
// spring. The house precedent is RateStar, defined in DocRatingBox and
// imported by UrgentAdvocatePanel so the two rating rows cannot drift apart.
//
// Decoration, not information: aria-hidden, because the button's label
// already says "Yuborilmoqda…" and the button carries aria-busy. All of its
// geometry, colour and motion is in globals.css (wp-hourglass), including the
// reduced-motion pose.
export function WaitClock() {
  return (
    <span className="wclock" aria-hidden="true">
      <span className="wclock__hand wclock__hand--m" />
      <span className="wclock__hand wclock__hand--h" />
      <span className="wclock__hub" />
    </span>
  );
}

// backend.ts's docFlowForm has always forwarded a `title` and the call-center
// inbox lists requests by it, but no call site ever sent one — every
// from-scratch order reaches an advocate untitled. Nothing extra is asked of
// the client for it: the document type they picked plus the opening line of
// what they wrote already reads like the MD's own example title ("Menga
// ijara shartnomasi kerak").
// A request from an endpoint that has no payment gate, in the shape the
// gated ones answer in — so the screen below reads one field, `paymentRequired`,
// whichever flow sent the request.
function ungated(request: DocumentRequest): DocLawyerSubmitResult {
  return { request, paymentRequired: false, gate: null, alreadyExists: false, canSendLawyerRequest: true, message: "", constructorAction: null };
}

function draftTitle(docType: string, need: string): string {
  const firstLine = need.split("\n").find((l) => l.trim()) || "";
  const s = [docType.trim(), firstLine.trim()].filter(Boolean).join(" — ").replace(/\s+/g, " ");
  if (s.length <= TITLE_MAX) return s;
  const cut = s.slice(0, TITLE_MAX - 1);
  const sp = cut.lastIndexOf(" ");
  // Cut on a word boundary, unless that would throw away half the title.
  return `${(sp > TITLE_MAX / 2 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export default function NewDocumentOrder({
  onClose,
  // The AI analysis card is a link out to its own page, not one of the two
  // flows this component runs. The Tezkor Advokat grid opens this dialog to
  // offer exactly the advocate-written pair, so it turns the link off rather
  // than sending a client who came looking for an advocate to a robot.
  showAnalysis = true,
}: { onClose?: () => void; showAnalysis?: boolean }) {
  const t = useTranslations("portal.client.newDoc");
  const td = useTranslations("portal.client.documents");
  const locale = useLocale();

  const [flow, setFlow] = useState<Flow>("");
  const [need, setNeed] = useState("");
  const [lang, setLang] = useState<string>(() => defaultDocLang(locale));
  // Optional metadata: which kind of document the advocate is being asked
  // for. Empty is a valid answer and nothing is sent then.
  const [docType, setDocType] = useState("");
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [voices, setVoices] = useState<VoiceNoteItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [planRequired, setPlanRequired] = useState("");
  const [planGateOpen, setPlanGateOpen] = useState(false);
  // The whole answer of the send, not only the request row — past the free
  // allowance review-existing opens a payment gate and the request has NOT
  // reached the advocates (LEXGO_FRONTEND_DOC_ANALYSIS_PAYMENT_GATE_
  // 2026-09-28.md L124). The from-scratch flow is not one of the four gated
  // endpoints, so its plain request is wrapped into the same shape rather
  // than given a second state to carry it.
  const [result, setResult] = useState<DocLawyerSubmitResult | null>(null);
  // The page count of the document being handed over. Optional: MD L81-84
  // says this endpoint's backend derives it from the file when it is absent
  // (PDF: the real count; DOCX/TXT: 2 500 characters per page), which is a
  // better number than a guess — so this is an override for when the client
  // knows better, and an empty field keeps exactly today's behaviour.
  // Which control refused the last press, "" when none did. Same shape and
  // same rules as DocumentLawyerAssist's `missing`, which is the instance of
  // this pattern that shipped first.
  const [missing, setMissing] = useState<"" | "main" | "need">("");

  const mainRef = useRef<HTMLInputElement>(null);

  function pickMain(list: FileList | null) {
    const f = list?.[0];
    // Reset so picking the same file twice still fires onChange.
    if (mainRef.current) mainRef.current.value = "";
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setErr(t("fileTooBig", { mb: MAX_FILE_MB }));
      return;
    }
    setErr("");
    setMainFile(f);
    setMissing((m) => (m === "main" ? "" : m));
  }

  // The review flow is defined by the document being reviewed, so that file
  // stays mandatory there — and is itself what the request says, which is why
  // the second line lets a review through with nothing typed.
  const mainReady = flow === "scratch" || !!mainFile;
  // A recorded voice note or an attached document says what is needed as well
  // as typing does — the advocate opens the request and listens or reads it —
  // so the text box is no longer the only way to fill this form in. The
  // backend may still insist on `need`; its 422 is caught below and says so.
  const described = !!need.trim() || files.length > 0 || voices.length > 0 || flow === "review";

  async function submit() {
    if (busy) return;
    // GM 2026-09-29: "to'ldirmasdan so'rov yuborishni bossa, to'ldirilmagan
    // joyi qizilda ogohlantirish sifatida chiqishi kerak."
    //
    // Until now this button was `disabled={!canSubmit}`, i.e. dead for a
    // review with no file attached and dead for a from-scratch order with
    // nothing typed and nothing recorded — which are exactly the two states a
    // first-time client arrives in. A dead button that is pressed answers
    // nothing: there is no click event, no message, no focus move, and the
    // client is left deciding whether the page is broken. So the press is
    // allowed and each gate below marks its own control and takes focus to
    // it, in the order the fields are read down the form.
    if (!mainReady) {
      setMissing("main");
      document.getElementById("newdoc-main-btn")?.focus();
      return;
    }
    if (!described) {
      setMissing("need");
      document.getElementById("newdoc-need")?.focus();
      return;
    }
    setMissing("");
    setBusy(true);
    setErr("");
    const payload = { need: need.trim(), language: lang, files, voiceFiles: voices.map((v) => v.blob) };
    const title = draftTitle(docType, need);
    try {
      const r =
        flow === "review" && mainFile
          ? // MD §4: page_count is optional and is never appended — the
            // backend counts the pages of main_file itself, which is the
            // behaviour this flow has always had when the field was left
            // empty, and now the only one.
            await requestExistingDocumentReviewGated({ ...payload, mainFile })
          : // "0 dan hujjat yasash" is not one of the four endpoints that can
            // open a gate (there is no document to charge by the page for),
            // so its plain answer is lifted into the same shape by hand —
            // normDocLawyerSubmit reads a RAW backend dict and would mangle
            // an already-normalised request.
            ungated(await requestCustomDraft({ ...payload, title: title || undefined, requestedDocumentType: docType || undefined }));
      setResult(r);
    } catch (e) {
      if (isPaymentRequired(e)) {
        setPlanRequired(errDetail(e) || td("planRequired"));
      } else {
        logApiError(`document-services ${flow}`, e);
        setErr(e instanceof ApiError && e.status === 422 ? t("needRequired") : t("error"));
      }
    } finally {
      setBusy(false);
    }
  }

  // Once submitted, the ordinary request panel owns the screen: it already
  // polls for the advocate claiming the work and for the finished file.
  if (result)
    return (
      <>
        {/* MD L124: while the fee is unapproved the request has NOT reached
            the advocates, so the green "yuborildi" line is withheld and the
            panel below shows the wait instead — the request itself comes back
            `payment_required` (MD L112-114) and carries the amount and page
            breakdown the answer gave, which no later GET can produce. */}
        {result.paymentRequired || result.alreadyExists || !result.canSendLawyerRequest ? null : (
          <p className="cform__ok" style={{ margin: "0 0 12px" }}>{t("submitted")}</p>
        )}
        {/* `already_exists` is the constructor endpoint's own refusal, but it
            travels in the shape all four answers share — and if this one ever
            starts sending it, "yuborildi" above would be a lie. Shown in the
            backend's words rather than invented here. */}
        {result.alreadyExists || !result.canSendLawyerRequest ? (
          <Notice ok={false} msg={result.message || td("lawyerPendingLead")} />
        ) : null}
        <DocumentRequestPanel
          key={result.request.id}
          initialReq={result.request}
          initialGate={result.gate}
          fields={[]}
          onRetry={() => setResult(null)}
        />
      </>
    );

  if (planRequired)
    return (
      <div className="cform docassist" style={{ maxWidth: "none" }}>
        <div className="docassist__head">
          <span className="docassist__i docassist__i--lawyer"><IconLock /></span>
          <div>
            <b>{td("planGateTitle")}</b>
            <p className="advmuted">{planRequired}</p>
          </div>
        </div>
        <button className="btn btn--grad btn--full btn--lg" type="button" onClick={() => setPlanGateOpen(true)}>
          {td("choosePlan")}
        </button>
        <ManualDocPlanGate open={planGateOpen} onClose={() => setPlanGateOpen(false)} message={planRequired} />
      </div>
    );

  // ── The picker ─────────────────────────────────────────────────
  // Three ways in, and every one of them starts here.
  //
  // It used to offer five. Two of those — "Tayyor shablondan hujjat" and
  // "O'zim to'ldiraman" — were not flows at all: both were links that shut
  // this dialog and dropped the client on the catalogue to go and find a
  // service, which is the same journey the page's own catalogue already is.
  // A card that only restates the page behind it makes the choice look wider
  // than it is and buries the two that actually do something, so they are
  // gone. Nothing is lost: the catalogue is the screen this dialog opens on
  // top of.
  if (!flow)
    return (
      <div className="cform" style={{ maxWidth: "none" }}>
        <p className="advmuted" style={{ margin: 0 }}>{t("lead")}</p>
        <div className="docchoose">
          <button type="button" className="docchoose__c" onClick={() => setFlow("scratch")}>
            <span className="docchoose__i"><IconEdit /></span>
            <b>{t("scratchTitle")}</b>
            <span>{t("scratchSub")}</span>
          </button>
          <button type="button" className="docchoose__c" onClick={() => setFlow("review")}>
            <span className="docchoose__i"><IconClipboardCheck /></span>
            <b>{t("reviewTitle")}</b>
            <span>{t("reviewSub")}</span>
          </button>
          {/* The AI analysis page used to be a sidebar item of its own; it
              lives here now so both document journeys start in one place. */}
          {showAnalysis ? (
            <Link href="/portal/client/doc-analysis" className="docchoose__c" onClick={onClose}>
              <span className="docchoose__i"><IconEye /></span>
              <b>{t("analysisTitle")}</b>
              <span>{t("analysisSub")}</span>
            </Link>
          ) : null}
        </div>
      </div>
    );

  return (
    <div className="cform docassist" style={{ maxWidth: "none" }}>
      <button type="button" className="rf__link" onClick={() => setFlow("")}>
        <IconChevronLeft />
        {td("backToChoices")}
      </button>

      <div className="docassist__head">
        <span className="docassist__i docassist__i--lawyer">{flow === "review" ? <IconClipboardCheck /> : <IconEdit />}</span>
        <div>
          <b>{flow === "review" ? t("reviewTitle") : t("scratchTitle")}</b>
          <p className="advmuted">{flow === "review" ? t("reviewSub") : t("scratchSub")}</p>
        </div>
      </div>

      {/* The main document is what the advocate opens in the editor — a DOCX
          goes straight in, anything else rides along beside a blank page. */}
      {flow === "review" ? (
        <section className="docassist__sec">
          <label htmlFor="newdoc-main">{t("mainFileLabel")}</label>
          <input ref={mainRef} id="newdoc-main" type="file" hidden accept=".doc,.docx,.pdf,.jpg,.jpeg,.png" onChange={(e) => pickMain(e.target.files)} />
          {/* The one field on this form that is genuinely mandatory: the
              review flow IS this document, and without it there is nothing to
              send. Marked with .is-bad and described by the alert below
              rather than with aria-invalid — the control the client presses
              is a <button>, and ARIA 1.2 does not support aria-invalid on
              role=button (the real form control is the file input, which is
              `hidden` and therefore not in the accessibility tree at all). */}
          <button
            id="newdoc-main-btn"
            type="button"
            className={`docpick${missing === "main" ? " is-bad" : ""}`}
            aria-describedby={missing === "main" ? "newdoc-main-bad" : undefined}
            onClick={() => mainRef.current?.click()}
          >
            <span className="docpick__i"><IconPaperclip /></span>
            <span className="docpick__t">
              <b>{mainFile ? mainFile.name : t("mainFilePick")}</b>
              <small>{mainFile ? t("mainFileChange") : t("mainFileHint", { mb: MAX_FILE_MB })}</small>
            </span>
          </button>
          {missing === "main" ? (
            <p className="cform__bad" role="alert" id="newdoc-main-bad">{t("mainFileRequired")}</p>
          ) : null}
        </section>
      ) : null}

      {/* GM 2026-09-29: "agar Hujjat turi mavjud bo'lsa, u hujjat turi
          1-chida turishi shart." Already true here and left alone — this
          section has sat above the request text since the picker was added,
          and the only thing that can precede it is the review flow's own
          document, which never shows a picker (DocTypePicker is asked for
          flow "custom_from_scratch" and this block renders only for it). The
          section renders only when the flow asks for it, so an unsupported
          backend leaves no empty card either. */}
      {flow === "scratch" ? (
        <section className="docassist__sec">
          <DocTypePicker flow="custom_from_scratch" value={docType} onChange={setDocType} />
        </section>
      ) : null}

      <section className="docassist__sec">
        <label htmlFor="newdoc-need">{t("needLabel")}</label>
        <textarea
          id="newdoc-need"
          rows={5}
          value={need}
          onChange={(e) => { setNeed(e.target.value); if (e.target.value.trim()) setMissing((m) => (m === "need" ? "" : m)); }}
          placeholder={t("needPlaceholder")}
          aria-invalid={missing === "need" || undefined}
          className={missing === "need" ? "is-bad" : undefined}
        />
        {/* "described" is satisfied by an attachment or a voice note as well
            as by typing, so the sentence names all three ways out rather than
            only the box it is standing under. */}
        {missing === "need" ? <p className="cform__bad" role="alert">{t("needRequired")}</p> : null}
      </section>

      <section className="docassist__sec">
        <label>{t("extrasLabel")}</label>
        {/* An attachment or a voice note describes the request as well as
            typing does (see `described`), so adding one has to clear the mark
            on the text box too — otherwise the form would still be shouting
            about an empty field it no longer needs. */}
        <AttachmentPicker
          files={files}
          voices={voices}
          onFiles={(f) => { setFiles(f); if (f.length) setMissing((m) => (m === "need" ? "" : m)); }}
          onVoices={(v) => { setVoices(v); if (v.length) setMissing((m) => (m === "need" ? "" : m)); }}
          onError={setErr}
          maxFileMb={MAX_FILE_MB}
          maxFiles={MAX_FILES}
        />
      </section>

      <section className="docassist__sec">
        <label htmlFor="newdoc-lang">{t("langHint")}</label>
        <Select
          value={lang}
          onChange={setLang}
          options={docLangOptions(lang).map((o) => ({ value: o.value, label: o.key ? td(o.key) : o.value }))}
          ariaLabel={t("langHint")}
        />
      </section>

      {err ? <Notice ok={false} msg={err} /> : null}

      {/* `disabled` used to cover two different things — a form that is not
          filled in yet, and a request that is out. Only the second is a wait
          and only the second is a reason to refuse the press, so `busy` is
          all that is left in it; an unfilled form is answered by the marks
          above. The clock still keys off `busy` and takes the slot the
          forward arrow vacates, which is why the busy button is exactly as
          tall as the idle one: measured 49.2px in both states. */}
      <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={busy} aria-busy={busy || undefined}>
        {busy ? <WaitClock /> : null}
        {busy ? td("processingShort") : t("submit")}
        {busy ? null : <IconArrowRight />}
      </button>
    </div>
  );
}
