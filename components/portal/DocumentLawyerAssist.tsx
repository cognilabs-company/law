"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  requestServiceDocumentLawyerGated,
  requestServiceDocumentLawyerWithFilesGated,
  getServiceTemplateSourceFile,
  type DocLawyerFlow,
  type DocLawyerSubmitResult,
  type ServiceDocumentFields,
} from "@/lib/services/backend";
import { ApiError, isConflict, isPaymentRequired, logApiError, errDetail } from "@/lib/http";
import { Notice } from "@/components/admin/AdminBits";
import DocumentRequestPanel from "./DocumentRequestPanel";
import DocTemplateViewer from "./DocTemplateViewer";
import ManualDocPlanGate from "./ManualDocPlanGate";
import AttachmentPicker, { type VoiceNoteItem } from "./AttachmentPicker";
import DocTypePicker from "./DocTypePicker";
// Imported, not re-declared: this form and the from-scratch order write the
// same `language` field of the same record, and each keeping its own list is
// exactly how they came to offer different values for it.
// WaitClock rides along for the same reason: it is the one mark the three
// order forms show while a request is out, and it has to be the same mark.
import { defaultDocLang, docLangOptions, WaitClock } from "./NewDocumentOrder";
import Select from "@/components/Select";
import CheckBox from "@/components/CheckBox";
import { IconChevronLeft, IconCheck, IconEye, IconHeadset, IconLock, IconShieldCheck } from "@/components/icons";
import { useAiField } from "@/lib/ai/registry";

type LawyerRequestBody = {
  need: string;
  answers: Record<string, unknown>;
  language: string;
  editorMode?: "ai_draft";
  extraInstructions?: string;
  requestedDocumentType?: string;
  pageCount?: number;
};

// LEXGO_FRONTEND_DOCUMENT_CALLCENTER_EDITOR_FLOW.md: the old per-service
// advocate picker is gone — the client never chooses who handles this, and
// the request body never sends lawyer_user_id. It lands in the call-center
// pool (assignment_mode: "callcenter_pool") and whichever call-center
// advocate claims it first takes it from there. The resulting request has
// no file yet (status "lawyer_review"/open_pool) — DocumentRequestPanel's
// own stageFor() already maps that to its "pending" stage, which already
// polls for file_ready, so this screen has no "submitted!" state of its own
// to build.
export default function DocumentLawyerAssist({
  lawyerFlow,
  sourceFile,
  onBack,
}: {
  lawyerFlow: DocLawyerFlow;
  sourceFile: ServiceDocumentFields | null;
  onBack: () => void;
}) {
  const t = useTranslations("portal.client.documents");
  const tn = useTranslations("portal.client.newDoc");
  const locale = useLocale();
  // request-with-files is service-scoped, unlike lawyerFlow.requestUrl.
  const serviceId = sourceFile?.serviceId || "";
  const [need, setNeed] = useState("");
  // MD2 §"Request form" lists four fields: the request text, an OPTIONAL
  // extra note, a language select defaulting to uz, and submit. "Optional"
  // there describes whether the client must fill it, not whether the form
  // renders it.
  const [note, setNote] = useState("");
  const [lang, setLang] = useState<string>(() => defaultDocLang(locale));
  // lexgo_frontend_doc_chat_update.md §1: the client can hand over documents
  // and voice notes with the request itself. They become chat messages the
  // moment an advocate claims the work, so nothing is re-sent later.
  const [files, setFiles] = useState<File[]>([]);
  const [voices, setVoices] = useState<VoiceNoteItem[]>([]);
  // Whoever sends this is handing a call-center advocate their phone number
  // and case facts, and the advocate's first move is to call or open a
  // meeting — so that has to be agreed to explicitly, before the send, not
  // buried in the terms accepted at sign-up months earlier.
  //
  // Client-side only: the request body this screen posts
  // (lexgo_frontend_doc_chat_update.md §1 — need / title / language /
  // answers_json / files / voice_files, and the JSON
  // POST .../document-lawyer/request) has no consent field, and no md/ doc
  // describes one, so there is nothing to send it in yet. Recorded as a
  // backend ask rather than invented here; until it exists the tick is a
  // gate, not a stored record.
  const [consent, setConsent] = useState(false);
  // Set by a press that could not go through, cleared the moment the client
  // fixes what it pointed at. "pages" joined it on 2026-09-29: the page box
  // paints anything over 500 red, but the send used to drop such a value
  // without a word and quote the advocate a different document.
  const [missing, setMissing] = useState<"" | "need" | "consent">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // The whole answer, not only the request row: past the free allowance the
  // backend opens a payment gate and the request has NOT reached the
  // advocates (LEXGO_FRONTEND_DOC_ANALYSIS_PAYMENT_GATE_2026-09-28.md L124),
  // and only `payment_required` in the answer says so.
  const [result, setResult] = useState<DocLawyerSubmitResult | null>(null);
  const [sent, setSent] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  // The request only opens the form once the client's plan allows it
  // ("Agar plan/entitlement bo'lmasa, tarif sotib olish flow chiqadi") —
  // reacted to on the backend's own 402 rather than pre-checked.
  const [planRequired, setPlanRequired] = useState("");
  const [planGateOpen, setPlanGateOpen] = useState(false);
  // editor_mode "ai_draft" (backend 2026-09-28): the advocate opens a draft
  // the AI has already written instead of a clean template. Off by default,
  // which is the unchanged behaviour.
  const [docType, setDocType] = useState("");

  const formShown = !result && !planRequired;
  useAiField(formShown ? "documents.lawyer.need" : "", {
    get: () => need,
    set: (v) => {
      setNeed(v);
      if (v.trim()) setMissing((m) => (m === "need" ? "" : m));
    },
    sensitive: true,
    fillable: true,
  });
  useAiField(formShown ? "documents.lawyer.note" : "", { get: () => note, set: setNote, sensitive: true, fillable: true });

  async function submit() {
    if (busy) return;
    if (!need.trim()) {
      setMissing("need");
      document.getElementById("lawyer-need")?.focus();
      return;
    }
    // Walked in the order the fields are read, so the first thing the client
    // is sent back to is the highest one on the screen that is wrong.
    if (!consent) {
      setMissing("consent");
      document.getElementById("lawyer-consent")?.focus();
      return;
    }
    setMissing("");
    setBusy(true);
    setErr("");
    try {
      // The multipart endpoint is used only when there is something to
      // attach: the plain JSON one is the long-proven path, and keeping it
      // for the empty case leaves a service whose backend predates
      // request-with-files working exactly as it did.
      const send =
        (files.length || voices.length) && serviceId
          ? (b: LawyerRequestBody) => requestServiceDocumentLawyerWithFilesGated(serviceId, { ...b, files, voiceFiles: voices.map((v) => v.blob) })
          : (b: LawyerRequestBody) => requestServiceDocumentLawyerGated(lawyerFlow.requestUrl, b);
      const r = await send({
        need: note.trim() ? `${need.trim()}\n\n${t("lawyerNoteLabel")}: ${note.trim()}` : need.trim(),
        // The consent the client just gave is recorded with the request, not
        // only enforced in the browser. Neither document-lawyer endpoint has a
        // consent field of its own, but both carry `answers` verbatim
        // (serialised as answers_json on the multipart path), so the advocate
        // and any later audit can see it was given and when — instead of the
        // gate leaving no trace at all.
        answers: { contact_consent: true, contact_consent_text: t("consentLabel") },
        language: lang,
        requestedDocumentType: docType || undefined,
      });
      setSent(true);
      setResult(r);
    } catch (e) {
      if (isPaymentRequired(e)) {
        setPlanRequired(errDetail(e) || t("planRequired"));
      } else if (isConflict(e)) {
        // ServiceDocumentRequest keeps this form off screen entirely while an
        // advocate holds the document, so today a 409 cannot happen: the
        // backend has no duplicate guard (two live lawyer_review rows on one
        // template were found in production on 2026-09-28). If it grows one,
        // a 409 here means exactly what the gate upstream says, and the
        // client should read that rather than "something went wrong".
        setErr(t("lawyerPendingLead"));
      } else {
        logApiError("document-lawyer request", e);
        setErr(e instanceof ApiError && e.status === 422 ? t("aiNeedRequired") : e instanceof ApiError && e.status === 404 ? t("lawyerNotAvailable") : t("error"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <>
        {/* MD2 §"Success holat" — the client is told the request went to the
            call-center pool, not to a particular advocate.

            Unless the payment gate opened: LEXGO_FRONTEND_DOC_ANALYSIS_
            PAYMENT_GATE_2026-09-28.md L124 is explicit that the frontend must
            NOT say the request went to the advocates while the fee is
            unapproved. The panel below then renders the wait itself (the
            request comes back `payment_required`, MD L112-114), carrying the
            amount and page breakdown from the answer — nothing else on the
            client can produce them, since no GET returns a gate. */}
        {sent && !result.paymentRequired ? (
          <p className="cform__ok" style={{ margin: "0 0 12px" }}>
            <IconCheck style={{ width: 16, height: 16 }} /> {t("lawyerSubmitted")}
          </p>
        ) : null}
        {result.alreadyExists || !result.canSendLawyerRequest ? (
          <Notice ok={false} msg={result.message || t("lawyerPendingLead")} />
        ) : null}
        <DocumentRequestPanel
          key={result.request.id}
          initialReq={result.request}
          initialGate={result.gate}
          fields={[]}
          sourceFile={sourceFile}
          onRetry={() => { setResult(null); setSent(false); }}
        />
      </>
    );

  const cleanUrl = sourceFile?.cleanSourceFileInlineUrl || sourceFile?.cleanSourceFileUrl;

  // "Agar plan/entitlement bo'lmasa, tarif sotib olish flow chiqadi."
  if (planRequired)
    return (
      <div className="cform docassist" style={{ maxWidth: "none" }}>
        <button type="button" className="rf__link" onClick={onBack}>
          <IconChevronLeft />
          {t("backToChoices")}
        </button>
        <div className="docassist__head">
          <span className="docassist__i docassist__i--lawyer"><IconLock /></span>
          <div>
            <b>{t("planGateTitle")}</b>
            <p className="advmuted">{planRequired}</p>
          </div>
        </div>
        <button className="btn btn--grad btn--full btn--lg" type="button" onClick={() => setPlanGateOpen(true)}>
          {t("choosePlan")}
        </button>
        <ManualDocPlanGate open={planGateOpen} onClose={() => setPlanGateOpen(false)} message={planRequired} />
      </div>
    );

  return (
    <div className="cform docassist" style={{ maxWidth: "none" }} data-ai-id="documents.lawyer.form" data-ai-type="section" data-ai-label={t("chooseLawyer")}>
      <button type="button" className="rf__link" onClick={onBack}>
        <IconChevronLeft />
        {t("backToChoices")}
      </button>

      <div className="docassist__head">
        <span className="docassist__i docassist__i--lawyer"><IconHeadset /></span>
        <div>
          <b>{t("chooseLawyer")}</b>
          <p className="advmuted">{t("lawyerLead")}</p>
        </div>
      </div>

      {/* GM 2026-09-29: "agar Hujjat turi mavjud bo'lsa, u hujjat turi
          1-chida turishi shart." It used to sit in its own card below the
          language select, four fields down — so the advocate's first question
          ("what am I being asked to write?") was the client's last. It is
          also the cheapest field on the form to answer, which makes it the
          right one to open with. Nothing but the order changed: measured on
          the live form 2026-09-29, the card is 1008px tall either way and
          every child keeps its height (34 / 68 / 146 / 520 / 113 / 49) — the
          146px document-type section and the 520px request-text section
          simply trade places, at 199px and 363px instead of 737px and 199px.

          Which kind of document is being asked for — read by the advocate
          before they open anything. Optional; the picker hides itself on a
          backend that does not offer the field (docTypeApplies /
          getRequestedDocumentTypes both have to say yes), and then this
          section has no child nodes at all and wp-forms' `.docassist__sec:empty`
          rule collapses it, so "first" degrades to "absent" rather than to an
          empty grey card above the request text. */}
      <section className="docassist__sec">
        <DocTypePicker flow="template_lawyer_assisted" value={docType} onChange={setDocType} />
      </section>

      <section className="docassist__sec" data-ai-private>
        <div className="docassist__sech">
          <label htmlFor="lawyer-need">{t("lawyerNeedLabel")}</label>
          {cleanUrl ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => setViewOpen(true)}>
              <IconEye />
              {t("viewSource")}
            </button>
          ) : null}
        </div>
        {/* lexgo_frontend_doc_chat_update.md §1 prescribes this placeholder
            verbatim for the request-with-files form. */}
        <textarea
          id="lawyer-need"
          rows={4}
          value={need}
          onChange={(e) => { setNeed(e.target.value); if (e.target.value.trim()) setMissing((m) => (m === "need" ? "" : m)); }}
          placeholder={tn("needPlaceholder")}
          aria-invalid={missing === "need" || undefined}
          className={missing === "need" ? "is-bad" : undefined}
          data-ai-id="documents.lawyer.need"
          data-ai-label={t("lawyerNeedLabel")}
          data-ai-private
        />
        {/* The red border alone left the press mute: it marked the box and
            moved focus into it, and the client was never told in words what
            was wrong — while the consent tick two cards down has had a
            sentence since it was written. One vocabulary for both. */}
        {missing === "need" ? <p className="cform__bad" role="alert">{t("lawyerNeedRequired")}</p> : null}

        {/* The marginTop:10 that used to sit inline on each of the labels
            below is gone: label→control and group→group were then the same
            10px and nothing grouped. Spacing is in CSS now (wp-cbx), where
            the two distances can differ. Nothing about the fields changed. */}
        <label htmlFor="lawyer-note">{t("lawyerNoteLabel")}</label>
        <textarea
          id="lawyer-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("lawyerNotePlaceholder")}
          data-ai-id="documents.lawyer.note"
          data-ai-label={t("lawyerNoteLabel")}
          data-ai-private
        />

        <label>{tn("extrasLabel")}</label>
        <AttachmentPicker files={files} voices={voices} onFiles={setFiles} onVoices={setVoices} onError={setErr} />


        <label>{t("langLabel")}</label>
        <Select
          value={lang}
          onChange={setLang}
          options={docLangOptions(lang).map((o) => ({ value: o.value, label: o.key ? t(o.key) : o.value }))}
          ariaLabel={t("langLabel")}
        />
      </section>

      {/* Its own card between the fields and the send button: it is a gate on
          the send, not one more thing to fill in. */}
      <div className="cbxcard" data-ai-id="documents.lawyer.consent" data-ai-label={t("consentTitle")}>
        <b className="cbxcard__t">
          <IconShieldCheck />
          {t("consentTitle")}
        </b>
        <CheckBox
          id="lawyer-consent"
          checked={consent}
          onChange={(v) => { setConsent(v); if (v) setMissing(""); }}
          invalid={missing === "consent"}
          hint={t("consentHint")}
        >
          {t("consentLabel")}
        </CheckBox>
      </div>

      {err ? <Notice ok={false} msg={err} /> : null}

      {/* This is literally the "ariza berish" the clock was asked for: the
          document, the attachments and the voice notes all leave here for the
          Navbatchi advokat in one multipart POST, which is the longest wait
          this screen has. `disabled` is `busy` and nothing else — an unfilled
          request text, a bad page count and an unticked consent all let the
          press through and are answered by the marks above, because a
          disabled button that is pressed says nothing at all. */}
      {missing === "consent" ? <p className="cform__bad" role="alert">{t("consentRequired")}</p> : null}

      <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={busy} aria-busy={busy || undefined} data-ai-id="documents.lawyer.submit">
        {busy ? <WaitClock /> : null}
        {busy ? t("processingShort") : t("lawyerSubmit")}
      </button>

      <DocTemplateViewer
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={sourceFile?.sourceFileName || t("fileGeneric")}
        fetchBlob={cleanUrl ? () => getServiceTemplateSourceFile(cleanUrl) : null}
        fileName={sourceFile?.sourceFileName || t("fileGeneric")}
      />
    </div>
  );
}
