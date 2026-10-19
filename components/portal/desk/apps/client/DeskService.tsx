"use client";

import { useContext, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  docTypeApplies,
  getRequestedDocumentTypes,
  getServiceTemplateSourceFile,
  requestServiceDocumentLawyerGated,
  requestServiceDocumentLawyerWithFilesGated,
  type DocLawyerFlow,
  type DocLawyerSubmitResult,
  type RequestedDocTypes,
  type ServiceDocumentFields,
} from "@/lib/services/backend";
import { errDetail, isConflict, isPaymentRequired, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { DocChromeContext, type DocServiceView } from "@/components/portal/DocFill";
import DocumentRequestPanel from "@/components/portal/DocumentRequestPanel";
import { defaultDocLang, docLangOptions } from "@/components/portal/NewDocumentOrder";
import { IconAlert, IconArrowRight, IconChevronLeft, IconEye, IconHeadset, IconList, IconLock, IconRefresh, IconShieldCheck } from "@/components/icons";
import { Banner, Btn, Check, Dialog, Empty, Field, Loading, Select, TextArea } from "../../kit/kit";
import FileViewer from "../FileViewer";
import { Attach, type VoiceNote } from "./DocOrder";

// The builder's steps before the form, as desktop pages: how to fill the
// document (the builder, or an advocate), the intro with its price, the
// advocate already holding it, and the advocate-help form. What each does
// is ServiceDocumentRequest's (a skin, see DocServiceView).

export default function DeskService({ v }: { v: DocServiceView }) {
  const t = useTranslations("portal.client.documents");
  const price = v.price ? `${fmtUzs(v.price)} ${t("som")}` : t("free");
  if (v.state === "loading") return <Loading label={t("processingShort")} />;
  if (v.state === "plan")
    return (
      <div className="dxcr">
        <Plan text={v.plan} />
      </div>
    );
  if (v.state === "error") return <Empty icon={<IconAlert />} title={t("startFailed")} action={<Btn icon={<IconRefresh />} onClick={v.retry}>{t("checkStatus")}</Btn>} />;
  if (v.state === "request") return <>{v.request}</>;
  if (v.state === "assist" && v.lawyerFlow) return <Assist flow={v.lawyerFlow} sourceFile={v.sourceFile} onBack={v.back} />;
  if (v.state === "unavailable")
    return (
      <div className="dxcr">
        <Banner tone="info">{t("lawyerNotAvailable")}</Banner>
      </div>
    );
  if (v.state === "held")
    return (
      <div className="dxcr">
        <section className="dxcr-card is-lawyer">
          <span className="dxcr-card__ic" aria-hidden>
            <IconHeadset />
          </span>
          <b>{t("lawyerPendingTitle")}</b>
          <p>{v.lawyerBlock || t("lawyerPendingLead")}</p>
          <small className="dxcs-lead">{[t("lawyerPendingStatus", { status: v.heldStatus }), v.heldWorkId ? t("lawyerPendingWork", { id: v.heldWorkId }) : ""].filter(Boolean).join(" · ")}</small>
          <span className="dxcr-acts">
            {v.canBack ? (
              <Btn icon={<IconChevronLeft />} onClick={v.back}>
                {t("backToChoices")}
              </Btn>
            ) : null}
            {v.constructorOffer ? (
              <Btn icon={<IconList />} disabled={!v.resumed} onClick={v.gate.openConstructor}>
                {v.resumed ? t("lawyerGateOpen") : t("processingShort")}
              </Btn>
            ) : null}
          </span>
        </section>
        {v.request}
      </div>
    );
  if (v.state === "choose")
    return (
      <div className="dxcr">
        <section className="dxcr-intro">
          <b>{v.title}</b>
          {v.description ? <p>{v.description}</p> : null}
          <span className="dxcr-price">{price}</span>
        </section>
        <div className="dxcu-flows dxcr-ways">
          <button type="button" onClick={v.chooseManual}>
            <IconList aria-hidden />
            <b>{t("chooseManual")}</b>
            <small>{t("chooseManualSub")}</small>
          </button>
          <button type="button" className={v.canSendLawyer ? "" : "is-held"} onClick={v.chooseLawyer}>
            <IconHeadset aria-hidden />
            <b>{t("chooseLawyer")}</b>
            <small>{v.canSendLawyer ? t("chooseLawyerSub") : v.lawyerBlock || t("lawyerPendingStatus", { status: v.heldStatus })}</small>
          </button>
        </div>
        {v.gate.open ? (
          <Dialog
            open
            title={v.gate.title}
            onClose={v.gate.close}
            actions={
              <>
                <Btn onClick={v.gate.wait}>{t("lawyerGateWait")}</Btn>
                <Btn kind="primary" disabled={!v.resumed} onClick={v.gate.openConstructor}>
                  {v.resumed ? t("lawyerGateOpen") : t("processingShort")}
                </Btn>
              </>
            }
          >
            <p className="dx-dlg__text">{v.gate.message}</p>
            <small className="dxcs-lead">{[t("lawyerPendingStatus", { status: v.heldStatus }), v.heldWorkId ? t("lawyerPendingWork", { id: v.heldWorkId }) : ""].filter(Boolean).join(" · ")}</small>
          </Dialog>
        ) : null}
      </div>
    );
  // The intro: what the document is, its price, and "Continue".
  return (
    <div className="dxcr">
      <section className="dxcr-intro">
        <b>{v.title}</b>
        {v.description ? <p>{v.description}</p> : null}
        <span className="dxcr-price">{price}</span>
        <span className="dxcr-acts">
          {v.canBack ? (
            <Btn icon={<IconChevronLeft />} onClick={v.back}>
              {t("backToChoices")}
            </Btn>
          ) : null}
          <Btn kind="primary" icon={<IconArrowRight />} busy={v.busy || !v.resumed} onClick={v.start}>
            {t("continue")}
          </Btn>
        </span>
      </section>
    </div>
  );
}

function Plan({ text }: { text: string }) {
  const t = useTranslations("portal.client.documents");
  const chrome = useContext(DocChromeContext);
  return (
    <section className="dxcr-card is-off">
      <span className="dxcr-card__ic" aria-hidden>
        <IconLock />
      </span>
      <b>{t("planGateTitle")}</b>
      <p>{text}</p>
      <Btn kind="primary" onClick={() => chrome?.openRoute?.("/portal/client/subscription")}>
        {t("choosePlan")}
      </Btn>
    </section>
  );
}

// Asking an advocate to prepare this template: what is needed, a note,
// files and voice notes, the language, consent to be contacted.
function Assist({ flow, sourceFile, onBack }: { flow: DocLawyerFlow; sourceFile: ServiceDocumentFields | null; onBack: () => void }) {
  const t = useTranslations("portal.client.documents");
  const tn = useTranslations("portal.client.newDoc");
  const tt = useTranslations("portal.client.docType");
  const locale = useLocale();
  const [need, setNeed] = useState("");
  const [note, setNote] = useState("");
  const [lang, setLang] = useState<string>(() => defaultDocLang(locale));
  const [files, setFiles] = useState<File[]>([]);
  const [voices, setVoices] = useState<VoiceNote[]>([]);
  const [consent, setConsent] = useState(false);
  const [missing, setMissing] = useState<"" | "need" | "consent">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<DocLawyerSubmitResult | null>(null);
  const [plan, setPlan] = useState("");
  const [types, setTypes] = useState<RequestedDocTypes | null>(null);
  const [docType, setDocType] = useState("");
  const [view, setView] = useState(false);
  useEffect(() => {
    let alive = true;
    getRequestedDocumentTypes()
      .then((o) => alive && setTypes(o))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const serviceId = sourceFile?.serviceId || "";
  const cleanUrl = sourceFile?.cleanSourceFileInlineUrl || sourceFile?.cleanSourceFileUrl || "";

  async function send() {
    if (busy) return;
    if (!need.trim()) return setMissing("need");
    if (!consent) return setMissing("consent");
    setMissing("");
    setBusy(true);
    setErr("");
    try {
      const body = {
        need: note.trim() ? `${need.trim()}\n\n${t("lawyerNoteLabel")}: ${note.trim()}` : need.trim(),
        answers: { contact_consent: true, contact_consent_text: t("consentLabel") },
        language: lang,
        requestedDocumentType: docType || undefined,
      };
      const r =
        (files.length || voices.length) && serviceId
          ? await requestServiceDocumentLawyerWithFilesGated(serviceId, { ...body, files, voiceFiles: voices.map((x) => x.blob) })
          : await requestServiceDocumentLawyerGated(flow.requestUrl, body);
      setResult(r);
    } catch (e) {
      if (isPaymentRequired(e)) setPlan(errDetail(e) || t("planRequired"));
      else if (isConflict(e)) setErr(t("lawyerPendingLead"));
      else {
        logApiError("document-lawyer request", e);
        setErr(t("lawyerSendFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <>
        {result.alreadyExists || !result.canSendLawyerRequest ? (
          <div className="dxcr">
            <Banner tone="warn">{result.message || t("lawyerPendingLead")}</Banner>
          </div>
        ) : null}
        <DocumentRequestPanel key={result.request.id} initialReq={result.request} initialGate={result.gate} fields={[]} sourceFile={sourceFile} onRetry={() => setResult(null)} />
      </>
    );
  if (plan)
    return (
      <div className="dxcr">
        <Plan text={plan} />
      </div>
    );
  return (
    <div className="dxcr">
      <section className="dxcr-form">
        <header>
          <span className="dxcr-card__ic" aria-hidden>
            <IconHeadset />
          </span>
          <span>
            <b>{t("chooseLawyer")}</b>
            <small>{t("lawyerLead")}</small>
          </span>
        </header>
        {types && docTypeApplies(types, "template_lawyer_assisted") && types.items.length ? (
          <Field label={tt("label")} hint={types.optional ? tt("hintOptional") : tt("hint")}>
            <Select value={docType} onChange={setDocType} ariaLabel={tt("label")} options={[{ value: "", label: tt("none") }, ...types.items.map((x) => ({ value: x, label: x }))]} />
          </Field>
        ) : null}
        <Field label={t("lawyerNeedLabel")} error={missing === "need" ? t("lawyerNeedRequired") : undefined}>
          <TextArea value={need} onChange={(x) => (setNeed(x), x.trim() && setMissing((m) => (m === "need" ? "" : m)))} placeholder={tn("needPlaceholder")} rows={4} />
        </Field>
        <Field label={t("lawyerNoteLabel")}>
          <TextArea value={note} onChange={setNote} placeholder={t("lawyerNotePlaceholder")} rows={2} />
        </Field>
        <Attach files={files} voices={voices} onFiles={setFiles} onVoices={setVoices} onError={setErr} />
        <Field label={t("langLabel")}>
          <Select value={lang} onChange={setLang} ariaLabel={t("langLabel")} options={docLangOptions(lang).map((o) => ({ value: o.value, label: o.key ? t(o.key) : o.value }))} />
        </Field>
        <div className={`dxcr-consent${missing === "consent" ? " is-bad" : ""}`}>
          <b>
            <IconShieldCheck aria-hidden /> {t("consentTitle")}
          </b>
          <Check checked={consent} onChange={(x) => (setConsent(x), x && setMissing(""))} label={t("consentLabel")}>
            {t("consentLabel")}
          </Check>
          <small>{missing === "consent" ? t("consentRequired") : t("consentHint")}</small>
        </div>
        {err ? <Banner tone="err">{err}</Banner> : null}
        <span className="dxcr-acts">
          <Btn icon={<IconChevronLeft />} onClick={onBack}>
            {t("backToChoices")}
          </Btn>
          {cleanUrl ? (
            <Btn icon={<IconEye />} onClick={() => setView(true)}>
              {t("viewSource")}
            </Btn>
          ) : null}
          <Btn kind="primary" icon={<IconHeadset />} busy={busy} onClick={() => void send()}>
            {t("lawyerSubmit")}
          </Btn>
        </span>
      </section>
      <FileViewer open={view} onClose={() => setView(false)} title={sourceFile?.sourceFileName || t("fileGeneric")} fetchBlob={cleanUrl ? () => getServiceTemplateSourceFile(cleanUrl) : null} fileName={sourceFile?.sourceFileName || t("fileGeneric")} />
    </div>
  );
}
