"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getServiceDocumentLawyerCandidates,
  requestServiceDocumentLawyer,
  getServiceTemplateSourceFile,
  type DocAssistCandidate,
  type DocLawyerFlow,
  type DocumentRequest,
  type ServiceDocumentFields,
} from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { preopenTab, showBlob, closeTab } from "@/lib/download";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "./DataState";
import DocumentRequestPanel from "./DocumentRequestPanel";
import { initials } from "@/lib/lawyers";
import { IconChevronLeft, IconCheck, IconEye, IconHeadset } from "@/components/icons";

// LEXGO_SERVICE_DOCUMENT_ASSIST_FLOW.md: describe the need, optionally pick
// a specific advocate/lawyer/call-center candidate (or leave it to the
// backend's own auto-assign), submit. The resulting request has no file yet
// (status "lawyer_review") — DocumentRequestPanel's own stageFor() already
// maps that to its "pending" stage, which already polls for file_ready, so
// this screen has no "submitted!" state of its own to build.
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
  const locale = useLocale();
  const [need, setNeed] = useState("");
  const [candidates, setCandidates] = useState<DocAssistCandidate[] | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<DocumentRequest | null>(null);
  const [srcBusy, setSrcBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getServiceDocumentLawyerCandidates(lawyerFlow.lawyersUrl)
      .then((rows) => alive && setCandidates(rows))
      .catch(() => alive && setCandidates([]));
    return () => {
      alive = false;
    };
  }, [lawyerFlow.lawyersUrl]);

  async function submit() {
    if (busy || !need.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await requestServiceDocumentLawyer(lawyerFlow.requestUrl, {
        need: need.trim(),
        lawyer_user_id: selected || undefined,
        language: locale,
      });
      setResult(r);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 422 ? t("aiNeedRequired") : e instanceof ApiError && e.status === 404 ? t("lawyerNotAvailable") : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function viewClean() {
    const url = sourceFile?.cleanSourceFileInlineUrl || sourceFile?.cleanSourceFileUrl;
    if (!url || srcBusy) return;
    const win = preopenTab();
    setSrcBusy(true);
    try {
      const blob = await getServiceTemplateSourceFile(url);
      showBlob(blob, sourceFile?.sourceFileName || t("fileGeneric"), win);
    } catch {
      closeTab(win);
    } finally {
      setSrcBusy(false);
    }
  }

  if (result) return <DocumentRequestPanel key={result.id} initialReq={result} fields={[]} sourceFile={sourceFile} />;

  const cleanUrl = sourceFile?.cleanSourceFileInlineUrl || sourceFile?.cleanSourceFileUrl;

  return (
    <div className="cform" style={{ maxWidth: "none" }}>
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
      {cleanUrl ? (
        <button type="button" className="btn btn--line btn--sm" onClick={viewClean} disabled={srcBusy} style={{ justifySelf: "start" }}>
          <IconEye />
          {srcBusy ? t("processingShort") : t("viewSource")}
        </button>
      ) : null}

      <div>
        <label>{t("aiNeedLabel")}</label>
        <textarea rows={4} value={need} onChange={(e) => setNeed(e.target.value)} placeholder={t("aiNeedPlaceholder")} />
      </div>

      <div>
        <label>{t("lawyerPick")}</label>
        {candidates === null ? (
          <Skeleton rows={2} />
        ) : (
          <div className="advpick">
            <button type="button" className={`advpick__c${selected === "" ? " on" : ""}`} onClick={() => setSelected("")}>
              <span className="advpick__av"><IconHeadset /></span>
              <span className="advpick__m">
                <b>{t("lawyerAuto")}</b>
                <span className="advpick__stats">{t("lawyerAutoSub")}</span>
              </span>
              {selected === "" ? <IconCheck className="advpick__ck" /> : null}
            </button>
            {candidates.map((c) => (
              <button type="button" key={c.id} className={`advpick__c${selected === c.id ? " on" : ""}`} onClick={() => setSelected(c.id)}>
                <span className="advpick__av">{initials(c.name || "?")}</span>
                <span className="advpick__m">
                  <b>{c.name || t("lawyerAuto")}</b>
                  {c.phone ? <span className="advpick__stats">{c.phone}</span> : null}
                </span>
                {selected === c.id ? <IconCheck className="advpick__ck" /> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {err ? <Notice ok={false} msg={err} /> : null}

      <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={busy || !need.trim()}>
        {busy ? t("processingShort") : t("lawyerSubmit")}
      </button>
    </div>
  );
}
