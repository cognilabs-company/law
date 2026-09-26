"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  requestServiceDocumentLawyer,
  requestServiceDocumentLawyerWithFiles,
  getServiceTemplateSourceFile,
  type DocLawyerFlow,
  type DocumentRequest,
  type ServiceDocumentFields,
} from "@/lib/services/backend";
import { ApiError, isPaymentRequired, logApiError, errDetail } from "@/lib/http";
import { Notice } from "@/components/admin/AdminBits";
import DocumentRequestPanel from "./DocumentRequestPanel";
import DocTemplateViewer from "./DocTemplateViewer";
import ManualDocPlanGate from "./ManualDocPlanGate";
import AttachmentPicker, { type VoiceNoteItem } from "./AttachmentPicker";
import Select from "@/components/Select";
import CheckBox from "@/components/CheckBox";
import { IconChevronLeft, IconCheck, IconEye, IconHeadset, IconLock, IconShieldCheck } from "@/components/icons";

const LANGS = ["uz", "ru", "en"] as const;
type LangCode = (typeof LANGS)[number];
type LawyerRequestBody = { need: string; answers: Record<string, unknown>; language: string };

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
  const [lang, setLang] = useState<LangCode>(LANGS.includes(locale as LangCode) ? (locale as LangCode) : "uz");
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<DocumentRequest | null>(null);
  const [sent, setSent] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  // The request only opens the form once the client's plan allows it
  // ("Agar plan/entitlement bo'lmasa, tarif sotib olish flow chiqadi") —
  // reacted to on the backend's own 402 rather than pre-checked.
  const [planRequired, setPlanRequired] = useState("");
  const [planGateOpen, setPlanGateOpen] = useState(false);

  async function submit() {
    if (busy || !need.trim() || !consent) return;
    setBusy(true);
    setErr("");
    try {
      // The multipart endpoint is used only when there is something to
      // attach: the plain JSON one is the long-proven path, and keeping it
      // for the empty case leaves a service whose backend predates
      // request-with-files working exactly as it did.
      const send =
        (files.length || voices.length) && serviceId
          ? (b: LawyerRequestBody) => requestServiceDocumentLawyerWithFiles(serviceId, { ...b, files, voiceFiles: voices.map((v) => v.blob) })
          : (b: LawyerRequestBody) => requestServiceDocumentLawyer(lawyerFlow.requestUrl, b);
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
      });
      setSent(true);
      setResult(r);
    } catch (e) {
      if (isPaymentRequired(e)) {
        setPlanRequired(errDetail(e) || t("planRequired"));
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
            call-center pool, not to a particular advocate. */}
        {sent ? (
          <p className="cform__ok" style={{ margin: "0 0 12px" }}>
            <IconCheck style={{ width: 16, height: 16 }} /> {t("lawyerSubmitted")}
          </p>
        ) : null}
        <DocumentRequestPanel key={result.id} initialReq={result} fields={[]} sourceFile={sourceFile} />
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
    <div className="cform docassist" style={{ maxWidth: "none" }}>
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

      <section className="docassist__sec">
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
        <textarea id="lawyer-need" rows={4} value={need} onChange={(e) => setNeed(e.target.value)} placeholder={tn("needPlaceholder")} />

        {/* The marginTop:10 that used to sit inline on each of the labels
            below is gone: label→control and group→group were then the same
            10px and nothing grouped. Spacing is in CSS now (wp-cbx), where
            the two distances can differ. Nothing about the fields changed. */}
        <label htmlFor="lawyer-note">{t("lawyerNoteLabel")}</label>
        <textarea id="lawyer-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("lawyerNotePlaceholder")} />

        <label>{tn("extrasLabel")}</label>
        <AttachmentPicker files={files} voices={voices} onFiles={setFiles} onVoices={setVoices} onError={setErr} />

        <label>{t("langLabel")}</label>
        <Select
          value={lang}
          onChange={(v) => setLang((LANGS.includes(v as LangCode) ? v : "uz") as LangCode)}
          options={LANGS.map((l) => ({ value: l, label: t(`lang_${l}`) }))}
          ariaLabel={t("langLabel")}
        />
      </section>

      {/* Its own card between the fields and the send button: it is a gate on
          the send, not one more thing to fill in. */}
      <div className="cbxcard">
        <b className="cbxcard__t">
          <IconShieldCheck />
          {t("consentTitle")}
        </b>
        <CheckBox id="lawyer-consent" checked={consent} onChange={setConsent} hint={t("consentHint")}>
          {t("consentLabel")}
        </CheckBox>
      </div>

      {err ? <Notice ok={false} msg={err} /> : null}

      <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={busy || !need.trim() || !consent}>
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
