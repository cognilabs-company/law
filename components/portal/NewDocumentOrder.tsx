"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  requestCustomDraft,
  requestExistingDocumentReview,
  type DocumentRequest,
} from "@/lib/services/backend";
import { ApiError, isPaymentRequired, logApiError } from "@/lib/http";
import { Notice } from "@/components/admin/AdminBits";
import { Link } from "@/i18n/navigation";
import Select from "@/components/Select";
import DocumentRequestPanel from "./DocumentRequestPanel";
import ManualDocPlanGate from "./ManualDocPlanGate";
import AttachmentPicker, { type VoiceNoteItem } from "./AttachmentPicker";
import {
  IconChevronLeft,
  IconEdit,
  IconClipboardCheck,
  IconEye,
  IconUpload,
  IconArrowRight,
  IconLock,
} from "@/components/icons";

// lexgo_frontend_custom_doc_flows.md: two ways into the call-center pool
// that need no template at all — the advocate writes the document from a
// blank page, or checks one the client already has. Both are the same
// multipart request (need + files + voice notes) and both track their status
// through the ordinary document-request panel afterwards, so nothing here
// re-implements the "waiting / claimed / ready" screens.
const LANGS = ["uz", "ru", "en"] as const;
type LangCode = (typeof LANGS)[number];
type Flow = "" | "scratch" | "review";

const MAX_FILE_MB = 25;
const MAX_FILES = 10;

export default function NewDocumentOrder({ onClose }: { onClose?: () => void }) {
  const t = useTranslations("portal.client.newDoc");
  const td = useTranslations("portal.client.documents");
  const locale = useLocale();

  const [flow, setFlow] = useState<Flow>("");
  const [need, setNeed] = useState("");
  const [lang, setLang] = useState<LangCode>(LANGS.includes(locale as LangCode) ? (locale as LangCode) : "uz");
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

  const canSubmit = !!need.trim() && (flow === "scratch" || !!mainFile) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    const payload = { need: need.trim(), language: lang, files, voiceFiles: voices.map((v) => v.blob) };
    try {
      const r =
        flow === "review" && mainFile
          ? await requestExistingDocumentReview({ ...payload, mainFile })
          : await requestCustomDraft(payload);
      setResult(r);
    } catch (e) {
      if (isPaymentRequired(e)) {
        setPlanRequired(e instanceof ApiError && e.detail ? e.detail : td("planRequired"));
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
          <p className="advmuted">{t("poolLead")}</p>
        </div>
      </div>

      {/* The main document is what the advocate opens in the editor — a DOCX
          goes straight in, anything else rides along beside a blank page. */}
      {flow === "review" ? (
        <section className="docassist__sec">
          <label htmlFor="newdoc-main">{t("mainFileLabel")}</label>
          <input ref={mainRef} id="newdoc-main" type="file" hidden accept=".doc,.docx,.pdf,.jpg,.jpeg,.png" onChange={(e) => pickMain(e.target.files)} />
          <button type="button" className="docpick" onClick={() => mainRef.current?.click()}>
            <span className="docpick__i"><IconUpload /></span>
            <span className="docpick__t">
              <b>{mainFile ? mainFile.name : t("mainFilePick")}</b>
              <small>{mainFile ? t("mainFileChange") : t("mainFileHint", { mb: MAX_FILE_MB })}</small>
            </span>
          </button>
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
        <label>{td("langLabel")}</label>
        <Select
          value={lang}
          onChange={(v) => setLang((LANGS.includes(v as LangCode) ? v : "uz") as LangCode)}
          options={LANGS.map((l) => ({ value: l, label: td(`lang_${l}`) }))}
          ariaLabel={td("langLabel")}
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
