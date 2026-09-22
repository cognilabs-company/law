"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  type TemplateQuestion,
  type ServiceDocumentFields,
} from "@/lib/services/backend";
import { ApiError, isProviderUnavailable } from "@/lib/http";
import { base64Blob, closeTab, extFromMime, mimeFromName, preopenTab, saveBlob, showBlob } from "@/lib/download";
import { normalizeAnswers } from "@/lib/docTemplate";
import ContractSign from "./ContractSign";
import DocFill, { loadDraft, clearDraft } from "./DocFill";
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

// The generated file — PDF or DOCX, whichever the template produces — either
// opened in the pre-opened tab or saved straight to disk.
function deliverFile(blob: Blob, fileName: string, download: boolean, win: Window | null) {
  if (download) {
    closeTab(win);
    saveBlob(blob, fileName);
  } else {
    showBlob(blob, fileName, win);
  }
}

// Older requests may still carry the file inline as base64.
const inlineBlob = (f: DocumentRequest["contractFile"]) => base64Blob(f?.fileBase64, f?.mimeType || mimeFromName(f?.fileName || ""));

const statusOf = (e: unknown) => (e instanceof ApiError ? e.status : 0);

// The full answers → live document → pay → generate → download lifecycle for
// one document request, as a self-contained panel — used by a catalog
// service that has a document_template_id (ServiceDocumentRequest).
function answersFrom(r: DocumentRequest): Record<string, string> {
  const saved: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.answers || {})) if (v != null && v !== "") saved[k] = String(v);
  return { ...saved, ...(loadDraft(r.id) || {}) };
}

export default function DocumentRequestPanel({
  initialReq,
  fields,
  templateText,
  sourceFile,
  onBump,
  onStartNew,
}: {
  initialReq: DocumentRequest;
  // The template's own questions and text. The request normally echoes the
  // questions back, but only the template carries the document body the live
  // pane renders — without it there is nothing to fill in as you type.
  fields?: TemplateQuestion[];
  templateText?: string;
  // The template's own source DOCX (service-scoped flow only — the standalone
  // template list has no equivalent endpoint), so the client can look at the
  // blank template itself alongside the live filled-in preview.
  sourceFile?: ServiceDocumentFields | null;
  onBump?: () => void;
  // "Resume the existing request" (below) means a template you've already
  // finished once always reopens that same finished copy — good for not
  // re-charging a paid document, but it also means there was previously no
  // way to fill the same template again with different facts (a different
  // case, a different counterparty). This lets the "done" screen start over.
  onStartNew?: () => void;
}) {
  const t = useTranslations("portal.client.documents");
  const tcommon = useTranslations("common");

  const [req, setReq] = useState(initialReq);
  const [answers, setAnswers] = useState<Record<string, string>>(() => answersFrom(initialReq));
  const [stage, setStage] = useState<Stage>(stageFor(initialReq));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Whichever field list is actually populated. The service-scoped create
  // relies on the backend echoing the questionnaire onto the request; the
  // template's own list is the fallback so an empty echo can never present
  // the client with a document that has nothing to fill in.
  const qs = useMemo(
    () => (req.questionnaire.length ? req.questionnaire : fields || []),
    [req.questionnaire, fields],
  );

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

  async function saveAnswers() {
    if (busy) return;
    setBusy(true);
    try {
      // Canonical values, matching character for character what the live
      // document pane showed — the backend interpolates this straight into
      // the template, so anything else would generate a file that differs
      // from the preview the client just approved.
      const r = await updateDocumentAnswers(req.id, normalizeAnswers(qs, answers));
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

  // One generate at a time. The poll below and the manual "check status"
  // button both run unlock(), and POST …/generate is not idempotent — two
  // overlapping calls would build the document twice for one payment.
  const generating = useRef(false);

  // Payment confirmed (unlock-policy) → build the PDF (POST …/generate).
  async function unlock(r: DocumentRequest): Promise<DocumentRequest | null> {
    if (r.status === "file_ready") return r;
    // Claimed before the first await, not after it: the poll and the manual
    // "check status" button can both be inside the unlock-policy request at
    // the same moment, and both would then pass a check made after it.
    if (generating.current) return null;
    generating.current = true;
    try {
      const policy = await getDocumentUnlockPolicy(r.id);
      if (!policy.canGenerate) return null;
      return await generateDocumentRequest(r.id);
    } catch (e) {
      if (statusOf(e) === 402) return null; // payment not settled yet
      throw e;
    } finally {
      generating.current = false;
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
  // It stops after ~10 minutes rather than polling a stuck payment forever.
  const pendingId = stage === "pending" ? req.id : undefined;
  useEffect(() => {
    if (!pendingId) return;
    let alive = true;
    let running = false;
    let left = 150; // 150 × 4s ≈ 10 min
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
    // Give up after the budget rather than polling a stuck payment forever.
    const timer = setInterval(() => {
      if (left-- > 0) {
        void tick();
        return;
      }
      clearInterval(timer);
      if (alive) setNote({ ok: false, msg: t("stillPending") });
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);

  // The document itself should be visible the moment it's ready, not only
  // after an extra "Ochish" click — fetch it once and show it inline.
  // A request that HAS questions but no answers was generated blank; one with
  // no questions at all is simply a fixed-text document and not stale.
  const isStale =
    stage === "done" && qs.length > 0 && !Object.values(req.answers || {}).some((v) => v != null && String(v).trim() !== "");

  // GET …/file returns the generated file itself — PDF or DOCX, whichever the
  // template produces; never assume one. 409 = not generated yet → generate
  // once and retry; 402 = unpaid → back to the pay step.
  async function getFile(download: boolean) {
    if (pdfBusy) return;
    const win = download ? null : preopenTab();
    setPdfBusy(true);
    setNote(null);
    try {
      let blob: Blob;
      try {
        blob = await getDocumentRequestFile(req.id);
      } catch (e) {
        if (statusOf(e) !== 409) throw e;
        setReq(await generateDocumentRequest(req.id));
        blob = await getDocumentRequestFile(req.id);
      }
      const name = req.contractFile?.fileName || `lexgo-${req.id}.${extFromMime(blob.type) || "pdf"}`;
      deliverFile(blob, name, download, win);
    } catch (e) {
      const inline = inlineBlob(req.contractFile);
      if (inline && statusOf(e) !== 402) {
        const name = req.contractFile?.fileName || `lexgo-${req.id}.${extFromMime(inline.type) || "pdf"}`;
        deliverFile(inline, name, download, win);
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
    <div className={`cform${stage === "answers" ? " cform--doc" : ""}`} style={{ maxWidth: "none" }}>
      {stage === "answers" ? (
        <>
          <DocFill
            req={req}
            fields={qs}
            templateText={templateText || ""}
            sourceFile={sourceFile}
            answers={answers}
            onChange={setAnswers}
            onSubmit={saveAnswers}
            busy={busy}
            submitLabel={t("generate")}
          />
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
          {qs.length ? (
            <button className="rf__link" type="button" onClick={() => setStage("answers")} disabled={busy}>
              {t("backToAnswers")}
            </button>
          ) : null}
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
          {/* Reopening a request created before this template had any fields
              (or simply never filled in) shows the same blank contractFile it
              generated back then — nothing here re-checks that against the
              template's current fields. Flag it plainly instead of presenting
              an unfilled document as a finished result, and lead with "start
              over" rather than burying it under the download buttons. */}
          {isStale ? (
            <>
              <Notice ok={false} msg={t("staleNotice")} />
              {onStartNew ? (
                <button className="btn btn--pri btn--full" type="button" onClick={onStartNew}>
                  {t("startNew")}
                </button>
              ) : null}
            </>
          ) : null}
          <span className="docdone__i"><IconCheck /></span>
          <b>{t("ready")}</b>
          <span className="docdone__f">{req.contractFile?.fileName || t("fileGeneric")}</span>
          <div className="docdone__act">
            <button className="btn btn--pri" type="button" onClick={() => getFile(false)} disabled={pdfBusy}>
              <IconExternal />
              {t("open")}
            </button>
            <button className="btn btn--line" type="button" onClick={() => getFile(true)} disabled={pdfBusy}>
              <IconDownload />
              {pdfBusy ? t("fileLoading") : t("download")}
            </button>
          </div>
          <small className="advmuted">{t("keptInCabinet")}</small>
          {onStartNew && !isStale ? (
            <button className="rf__link" type="button" onClick={onStartNew}>
              {t("startNew")}
            </button>
          ) : null}
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
