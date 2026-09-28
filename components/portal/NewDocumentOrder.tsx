"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  requestCustomDraft,
  requestExistingDocumentReview,
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
  IconClipboardList,
  IconEye,
  IconFileText,
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

// backend.ts's docFlowForm has always forwarded a `title` and the call-center
// inbox lists requests by it, but no call site ever sent one — every
// from-scratch order reaches an advocate untitled. Nothing extra is asked of
// the client for it: the document type they picked plus the opening line of
// what they wrote already reads like the MD's own example title ("Menga
// ijara shartnomasi kerak").
function draftTitle(docType: string, need: string): string {
  const firstLine = need.split("\n").find((l) => l.trim()) || "";
  const s = [docType.trim(), firstLine.trim()].filter(Boolean).join(" — ").replace(/\s+/g, " ");
  if (s.length <= TITLE_MAX) return s;
  const cut = s.slice(0, TITLE_MAX - 1);
  const sp = cut.lastIndexOf(" ");
  // Cut on a word boundary, unless that would throw away half the title.
  return `${(sp > TITLE_MAX / 2 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export default function NewDocumentOrder({ onClose }: { onClose?: () => void }) {
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
  const [result, setResult] = useState<DocumentRequest | null>(null);

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
  const canSubmit = mainReady && described && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    const payload = { need: need.trim(), language: lang, files, voiceFiles: voices.map((v) => v.blob) };
    const title = draftTitle(docType, need);
    try {
      const r =
        flow === "review" && mainFile
          ? await requestExistingDocumentReview({ ...payload, mainFile })
          : await requestCustomDraft({ ...payload, title: title || undefined, requestedDocumentType: docType || undefined });
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
        <p className="cform__ok" style={{ margin: "0 0 12px" }}>{t("submitted")}</p>
        <DocumentRequestPanel key={result.id} initialReq={result} fields={[]} />
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
  // MD §5 names four ways a document can come into being, and only two of
  // them start here. The template-backed pair — an advocate filling a
  // catalogue template, and the client filling it in the builder themselves —
  // belong to ServiceDocumentRequest, which needs a chosen service before it
  // can offer either. So they are named but link into the catalogue: a client
  // who cannot see them here concludes the two flows do not exist, and a card
  // that pretended to start them would dead-end.
  if (!flow)
    return (
      <div className="cform" style={{ maxWidth: "none" }}>
        <p className="advmuted" style={{ margin: 0 }}>{t("lead")}</p>
        <div className="docchoose">
          <Link href="/portal/client/services" className="docchoose__c" onClick={onClose}>
            <span className="docchoose__i"><IconFileText /></span>
            <b>{t("templateTitle")}</b>
            <span>{t("templateSub")}</span>
            <span className="docchoose__go">{t("catalogHint")}<IconArrowRight /></span>
          </Link>
          <button type="button" className="docchoose__c" onClick={() => setFlow("scratch")}>
            <span className="docchoose__i"><IconEdit /></span>
            <b>{t("scratchTitle")}</b>
            <span>{t("scratchSub")}</span>
          </button>
          <Link href="/portal/client/services" className="docchoose__c" onClick={onClose}>
            <span className="docchoose__i"><IconClipboardList /></span>
            <b>{t("selfTitle")}</b>
            <span>{t("selfSub")}</span>
            <span className="docchoose__go">{t("catalogHint")}<IconArrowRight /></span>
          </Link>
          <button type="button" className="docchoose__c" onClick={() => setFlow("review")}>
            <span className="docchoose__i"><IconClipboardCheck /></span>
            <b>{t("reviewTitle")}</b>
            <span>{t("reviewSub")}</span>
          </button>
          {/* The AI analysis page used to be a sidebar item of its own; it
              lives here now so both document journeys start in one place. */}
          <Link href="/portal/client/doc-analysis" className="docchoose__c" onClick={onClose}>
            <span className="docchoose__i"><IconEye /></span>
            <b>{t("analysisTitle")}</b>
            <span>{t("analysisSub")}</span>
          </Link>
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
          <button type="button" className="docpick" onClick={() => mainRef.current?.click()}>
            <span className="docpick__i"><IconPaperclip /></span>
            <span className="docpick__t">
              <b>{mainFile ? mainFile.name : t("mainFilePick")}</b>
              <small>{mainFile ? t("mainFileChange") : t("mainFileHint", { mb: MAX_FILE_MB })}</small>
            </span>
          </button>
        </section>
      ) : null}

      {flow === "scratch" ? (
        <section className="docassist__sec">
          <DocTypePicker flow="custom_from_scratch" value={docType} onChange={setDocType} />
        </section>
      ) : null}

      <section className="docassist__sec">
        <label htmlFor="newdoc-need">{t("needLabel")}</label>
        <textarea id="newdoc-need" rows={5} value={need} onChange={(e) => setNeed(e.target.value)} placeholder={t("needPlaceholder")} />
      </section>

      <section className="docassist__sec">
        <label>{t("extrasLabel")}</label>
        <AttachmentPicker files={files} voices={voices} onFiles={setFiles} onVoices={setVoices} onError={setErr} maxFileMb={MAX_FILE_MB} maxFiles={MAX_FILES} />
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

      <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={!canSubmit}>
        {busy ? td("processingShort") : t("submit")}
        {busy ? null : <IconArrowRight />}
      </button>
    </div>
  );
}
