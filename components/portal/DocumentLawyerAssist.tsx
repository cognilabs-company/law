"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  requestServiceDocumentLawyer,
  getServiceTemplateSourceFile,
  type DocLawyerFlow,
  type DocumentRequest,
  type ServiceDocumentFields,
} from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { Notice } from "@/components/admin/AdminBits";
import DocumentRequestPanel from "./DocumentRequestPanel";
import DocTemplateViewer from "./DocTemplateViewer";
import { IconChevronLeft, IconEye, IconHeadset } from "@/components/icons";

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
  const locale = useLocale();
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<DocumentRequest | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  async function submit() {
    if (busy || !need.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await requestServiceDocumentLawyer(lawyerFlow.requestUrl, {
        need: need.trim(),
        language: locale,
      });
      setResult(r);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 422 ? t("aiNeedRequired") : e instanceof ApiError && e.status === 404 ? t("lawyerNotAvailable") : t("error"));
    } finally {
      setBusy(false);
    }
  }

  if (result) return <DocumentRequestPanel key={result.id} initialReq={result} fields={[]} sourceFile={sourceFile} />;

  const cleanUrl = sourceFile?.cleanSourceFileInlineUrl || sourceFile?.cleanSourceFileUrl;

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
          <label htmlFor="lawyer-need">{t("aiNeedLabel")}</label>
          {cleanUrl ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => setViewOpen(true)}>
              <IconEye />
              {t("viewSource")}
            </button>
          ) : null}
        </div>
        <textarea id="lawyer-need" rows={4} value={need} onChange={(e) => setNeed(e.target.value)} placeholder={t("aiNeedPlaceholder")} />
      </section>

      {err ? <Notice ok={false} msg={err} /> : null}

      <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={busy || !need.trim()}>
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
