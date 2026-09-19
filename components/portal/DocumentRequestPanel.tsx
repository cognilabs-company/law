"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getPlatformPolicies,
  updateDocumentAnswers,
  payDocumentRequest,
  getDocumentRequest,
  getDocumentUnlockPolicy,
  generateDocumentRequest,
  getDocumentRequestFile,
  listDocumentRequests,
  type DocumentRequest,
} from "@/lib/services/backend";
import { ApiError, httpBlob, isProviderUnavailable } from "@/lib/http";
import { base64Blob, closeTab, preopenTab, saveBlob, showBlob } from "@/lib/download";
import ContractSign from "./ContractSign";
import DocWizard, { loadDraft, clearDraft } from "./DocWizard";
import { useResource, useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Notice } from "@/components/admin/AdminBits";
import { Link } from "@/i18n/navigation";
import { IconDownload, IconExternal, IconCheck, IconClock } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

type Stage = "answers" | "pay" | "pending" | "done";

// Map a request's backend status to the modal stage. Shared by every entry
// point (standalone template list, service "Create document" button) so the
// pay/generate/download lifecycle behaves identically everywhere.
function stageFor(r: DocumentRequest): Stage {
  if (r.status === "file_ready") return "done";
  if (!r.status || r.status === "questionnaire" || r.status === "draft") return "answers";
  if (r.status === "awaiting_payment") return "pay";
  return "pending";
}

function showPdf(blob: Blob, fileName: string, download: boolean, win: Window | null) {
  if (download) {
    closeTab(win);
    saveBlob(blob, fileName);
  } else {
    showBlob(blob, fileName, win);
  }
}

// Older requests may still carry the PDF inline as base64.
const inlineBlob = (f: DocumentRequest["contractFile"]) => base64Blob(f?.fileBase64, f?.mimeType || "application/pdf");

const statusOf = (e: unknown) => (e instanceof ApiError ? e.status : 0);

// The full answers → preview/wizard → pay → generate → download lifecycle for
// one document request, as a self-contained panel. Used both by the
// standalone template list (DocumentFlow) and by the "Create document"
// button on a catalog service that has a document_template_id.
function answersFrom(r: DocumentRequest): Record<string, string> {
  const saved: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.answers || {})) if (v != null && v !== "") saved[k] = String(v);
  return { ...saved, ...(loadDraft(r.id) || {}) };
}

export default function DocumentRequestPanel({
  initialReq,
  onBump,
}: {
  initialReq: DocumentRequest;
  onBump?: () => void;
}) {
  const t = useTranslations("portal.client.documents");
  const tcommon = useTranslations("common");

  const [req, setReq] = useState(initialReq);
  const [answers, setAnswers] = useState<Record<string, string>>(() => answersFrom(initialReq));
  const [stage, setStage] = useState<Stage>(stageFor(initialReq));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [formats, setFormats] = useState<string[]>(["pdf"]);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Reset local state whenever a different request is opened — adjusted
  // during render (not an effect) so it lands before the first paint of the
  // new request instead of flashing the previous one's stage.
  const [prevReqId, setPrevReqId] = useState(initialReq.id);
  if (initialReq.id !== prevReqId) {
    setPrevReqId(initialReq.id);
    setReq(initialReq);
    setAnswers(answersFrom(initialReq));
    setStage(stageFor(initialReq));
    setNote(null);
  }

  // 3 free downloads a month (S-35), for the pay-step reminder text.
  const reqs = useResource(listDocumentRequests, [req.status]);
  const policies = useResourceOne(getPlatformPolicies, []).data;
  const monthDownloads = useMemo(() => {
    const now = new Date();
    return reqs.data.filter((r) => r.status === "file_ready" && r.createdAt && new Date(r.createdAt).getMonth() === now.getMonth() && new Date(r.createdAt).getFullYear() === now.getFullYear()).length;
  }, [reqs.data]);

  const bump = () => onBump?.();

  async function getDocx() {
    setPdfBusy(true);
    try { saveBlob(await httpBlob(`/document-requests/${req.id}/file?format=docx`, { headers: { Accept: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } }), `lexgo-${req.id}.docx`); }
    catch { setNote({ ok: false, msg: t("fileError") }); }
    finally { setPdfBusy(false); }
  }

  async function saveAnswers() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await updateDocumentAnswers(req.id, answers);
      clearDraft(req.id);
      setReq(r);
      setStage(stageFor(r) === "answers" ? "pay" : stageFor(r));
      bump();
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  // Back from the checkout page may restore this page from the bfcache with the
  // button still busy (it stays busy while the browser navigates away).
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Payment confirmed (unlock-policy) → build the PDF (POST …/generate).
  async function unlock(r: DocumentRequest): Promise<DocumentRequest | null> {
    if (r.status === "file_ready") return r;
    const policy = await getDocumentUnlockPolicy(r.id);
    if (policy.formats.length) setFormats(policy.formats);
    if (!policy.canGenerate) return null;
    try {
      return await generateDocumentRequest(r.id);
    } catch (e) {
      if (statusOf(e) === 402) return null; // payment not settled yet
      throw e;
    }
  }

  async function pay() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    let leaving = false;
    try {
      let r = await payDocumentRequest(req.id, "payme", req.price);
      if (r.paymentUrl) {
        leaving = true;
        window.location.assign(r.paymentUrl);
        return;
      }
      r = (await unlock(r).catch(() => null)) ?? r;
      setReq(r);
      setStage(r.status === "file_ready" ? "done" : "pending");
      bump();
    } catch (e) {
      setNote({ ok: false, msg: isProviderUnavailable(e) ? tcommon("paymentUnavailable") : t("error") });
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      let r = await getDocumentRequest(req.id);
      r = (await unlock(r)) ?? r;
      setReq(r);
      bump();
      if (r.status === "file_ready") setStage("done");
      else if (stage === "pending") setNote({ ok: false, msg: t("stillPending") });
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  // While a payment is processing, poll so the PDF is generated and opens
  // automatically once the provider confirms it (first check right away).
  const pendingId = stage === "pending" ? req.id : undefined;
  useEffect(() => {
    if (!pendingId) return;
    let alive = true;
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const cur = await getDocumentRequest(pendingId);
        const r = (await unlock(cur)) ?? cur;
        if (!alive) return;
        setReq(r);
        if (r.status === "file_ready") {
          setStage("done");
          setNote(null);
          bump();
        }
      } catch {
        /* keep polling */
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);

  // GET …/file returns the PDF itself. 409 = not generated yet → generate once
  // and retry; 402 = unpaid → back to the pay step.
  async function getPdf(download: boolean) {
    if (pdfBusy) return;
    const win = download ? null : preopenTab();
    setPdfBusy(true);
    setNote(null);
    const name = req.contractFile?.fileName || `lexgo-${req.id}.pdf`;
    try {
      let blob: Blob;
      try {
        blob = await getDocumentRequestFile(req.id);
      } catch (e) {
        if (statusOf(e) !== 409) throw e;
        setReq(await generateDocumentRequest(req.id));
        blob = await getDocumentRequestFile(req.id);
      }
      showPdf(blob, name, download, win);
    } catch (e) {
      const inline = inlineBlob(req.contractFile);
      if (inline && statusOf(e) !== 402) {
        showPdf(inline, name, download, win);
      } else {
        closeTab(win);
        if (statusOf(e) === 402) {
          setStage("pay");
          setNote({ ok: false, msg: t("payFirst") });
        } else {
          setNote({ ok: false, msg: t("fileError") });
        }
      }
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="cform" style={{ maxWidth: "none" }}>
      {stage === "answers" ? (
        <>
          <DocWizard req={req} answers={answers} onChange={setAnswers} onSubmit={saveAnswers} busy={busy} submitLabel={t("continue")} />
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        </>
      ) : null}

      {stage === "pay" ? (
        <>
          <div className="oprice">
            <span>{t("price")}</span>
            <b>{req.price ? `${som(req.price)} ${t("som")}` : t("free")}</b>
          </div>
          <p className="advmuted">{t("payLead")}</p>
          <p className="dwiz__policy">{t("downloadPolicy", { n: monthDownloads, limit: 3 })}</p>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--grad btn--full btn--lg" type="button" onClick={pay} disabled={busy}>
            {busy ? t("processingShort") : t("pay")}
          </button>
          <button className="rf__link rf__link--muted" type="button" onClick={refresh} disabled={busy}>
            {t("checkStatus")}
          </button>
        </>
      ) : null}

      {stage === "pending" ? (
        <div className="docpend">
          <span className="docpend__ic"><IconClock /></span>
          <b>{t("pendingTitle")}</b>
          <span className="docpend__sub">{t("pendingSub")}</span>
          <span className="docpend__badge">
            <span className="docpend__dot" />
            {t("pendingStatus")}
          </span>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--soft btn--full" type="button" onClick={refresh} disabled={busy}>
            {busy ? t("processingShort") : t("checkStatus")}
          </button>
        </div>
      ) : null}

      {stage === "done" ? (
        <div className="docdone">
          <span className="docdone__i"><IconCheck /></span>
          <b>{t("ready")}</b>
          <span className="docdone__f">{req.contractFile?.fileName || `lexgo-${req.id}.pdf`}</span>
          <div className="docdone__act">
            <button className="btn btn--pri" type="button" onClick={() => getPdf(false)} disabled={pdfBusy}>
              <IconExternal />
              {t("open")}
            </button>
            <button className="btn btn--line" type="button" onClick={() => getPdf(true)} disabled={pdfBusy}>
              <IconDownload />
              {pdfBusy ? t("fileLoading") : t("download")}
            </button>
            {formats.includes("docx") ? (
              <button className="btn btn--line" type="button" onClick={() => getDocx()} disabled={pdfBusy}>
                <IconDownload />
                DOCX
              </button>
            ) : null}
          </div>
          <small className="advmuted">{t("keptInCabinet")}</small>
          <div className="docoffer">
            <b>{t("offerTitle")}</b>
            <span>{t("offerLead")}</span>
            <div className="docoffer__btns">
              <Link href={`/portal/client/doc-analysis?request=${encodeURIComponent(req.id)}`} className="btn btn--pri btn--sm">{t("offerReview", { price: fmtUzs(policies?.documentAnalysis.ranges[0]?.amount || 149000) })}</Link>
              <Link href="/portal/client/services?q=shablon" className="btn btn--line btn--sm">{t("offerHelp", { price: fmtUzs(399000) })}</Link>
            </div>
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          {/* T1-13: the generated document is a contract to sign with a Telegram code. */}
          {req.contractId ? <ContractSign contractId={req.contractId} /> : null}
        </div>
      ) : null}
    </div>
  );
}
