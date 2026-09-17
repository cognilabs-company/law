"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getPlatformPolicies,
  getDocumentTemplates,
  listDocumentRequests,
  createDocumentRequest,
  updateDocumentAnswers,
  payDocumentRequest,
  getDocumentRequest,
  getDocumentUnlockPolicy,
  generateDocumentRequest,
  getDocumentRequestFile,
  listWorkspaceDocRequests,
  fulfillDocRequest,
  type BackendTemplate,
  type DocumentRequest,
  type WorkspaceDocRequest,
} from "@/lib/services/backend";
import { ApiError, httpBlob, isProviderUnavailable } from "@/lib/http";
import { base64Blob, closeTab, fetchAndDeliver, preopenTab, saveBlob, showBlob } from "@/lib/download";
import ContractSign from "./ContractSign";
import DocWizard, { loadDraft, clearDraft } from "./DocWizard";
import { useResource, useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { Link } from "@/i18n/navigation";
import { IconDocLines, IconDownload, IconExternal, IconCheck, IconClock } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

type Stage = "answers" | "pay" | "pending" | "done";

// Map a request's backend status to the modal stage.
// Backend statuses: questionnaire -> awaiting_payment -> payment_pending ->
// file_ready. Anything past awaiting_payment has a payment under way, so it
// resolves to pending/done — never back to the pay step (no double payment).
// The PDF itself comes from GET …/file, so file_ready is enough for "done".
function stageFor(r: DocumentRequest): Stage {
  if (r.status === "file_ready") return "done";
  if (!r.status || r.status === "questionnaire" || r.status === "draft") return "answers";
  if (r.status === "awaiting_payment") return "pay";
  return "pending";
}

// Show (in a tab pre-opened in the click handler) or save a PDF blob.
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

export default function DocumentFlow() {
  const t = useTranslations("portal.client.documents");
  const tcommon = useTranslations("common");
  const tpls = useResource(getDocumentTemplates, []);
  const clientTpls = tpls.data.filter((x) => x.visibility === "client");

  const [req, setReq] = useState<DocumentRequest | null>(null);
  const [activeTpl, setActiveTpl] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<Stage>("answers");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // Server-backed request history (GET /document-requests, newest first) →
  // map each template to its latest request so the card shows its status and
  // resumes instead of starting a new (re-payable) request.
  const [reqKey, setReqKey] = useState(0);
  const reqs = useResource(() => listDocumentRequests(), [reqKey]);
  // Output formats the backend offers for this request (PDF always; DOCX when
  // the template supports it) — read from the unlock policy.
  const [formats, setFormats] = useState<string[]>(["pdf"]);
  // Generated documents this month (S-35: 3 free a month, then a fee or a plan).
  // Lawyer review fee comes from the backend policy store (nothing hard-coded).
  const policies = useResourceOne(getPlatformPolicies, []).data;
  const monthDownloads = useMemo(() => {
    const now = new Date();
    return reqs.data.filter((r) => r.status === "file_ready" && r.createdAt && new Date(r.createdAt).getMonth() === now.getMonth() && new Date(r.createdAt).getFullYear() === now.getFullYear()).length;
  }, [reqs.data]);
  async function getDocx() {
    if (!req) return;
    setPdfBusy(true);
    try { saveBlob(await httpBlob(`/document-requests/${req.id}/file?format=docx`, { headers: { Accept: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } }), `lexgo-${req.id}.docx`); }
    catch { setNote({ ok: false, msg: t("fileError") }); }
    finally { setPdfBusy(false); }
  }
  const bump = () => setReqKey((k) => k + 1);
  const byTpl = useMemo(() => {
    const m: Record<string, { id: string; status: string }> = {};
    for (const r of reqs.data) {
      if (r.templateId && !m[r.templateId]) m[r.templateId] = { id: r.id, status: r.status };
    }
    return m;
  }, [reqs.data]);

  function close() {
    setReq(null);
    setActiveTpl("");
    setNote(null);
  }

  // Open a template: resume its existing request (so you don't pay twice) or
  // create a fresh one when there's none.
  async function open(tpl: BackendTemplate) {
    if (busy) return;
    setActiveTpl(tpl.id);
    setNote(null);
    const existing = byTpl[tpl.id];
    if (!existing) {
      await start(tpl);
      return;
    }
    setBusy(true);
    try {
      const r = await getDocumentRequest(existing.id);
      setReq(r);
      // Saved answers from the server, then the local draft on top (T1-14 resume).
      const saved: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.answers || {})) if (v != null && v !== "") saved[k] = String(v);
      setAnswers({ ...saved, ...(loadDraft(r.id) || {}) });
      setStage(stageFor(r));
      bump();
    } catch {
      // Stale/deleted request → start fresh.
      await start(tpl);
    } finally {
      setBusy(false);
    }
  }

  async function start(tpl: BackendTemplate) {
    setBusy(true);
    setNote(null);
    setActiveTpl(tpl.id);
    try {
      const r = await createDocumentRequest({
        template_id: tpl.id,
        document_type: tpl.category || "document",
        title: tpl.name,
        questionnaire: tpl.questionnaire,
        price: tpl.price,
      });
      setReq(r);
      setAnswers(loadDraft(r.id) || {});
      setStage(stageFor(r));
      bump();
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  async function saveAnswers() {
    if (!req || busy) return;
    setBusy(true);
    try {
      const r = await updateDocumentAnswers(req.id, answers);
      clearDraft(req.id);
      setReq(r);
      // After answers the backend moves to awaiting_payment → pay step.
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
  // Returns the updated request, or null while the payment is still pending.
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
    if (!req || busy) return;
    setBusy(true);
    setNote(null);
    let leaving = false; // stay busy while the browser opens the checkout
    try {
      let r = await payDocumentRequest(req.id, "payme", req.price);
      if (r.paymentUrl) {
        // Real provider checkout: same-tab navigation (a popup after an await
        // is blocked). The card shows the request as pending on return.
        leaving = true;
        window.location.assign(r.paymentUrl);
        return;
      }
      r = (await unlock(r).catch(() => null)) ?? r;
      setReq(r);
      setStage(r.status === "file_ready" ? "done" : "pending");
      bump();
    } catch (e) {
      // 503 = Payme/Click not configured on the backend yet.
      setNote({ ok: false, msg: isProviderUnavailable(e) ? tcommon("paymentUnavailable") : t("error") });
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  async function refresh() {
    if (!req) return;
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
  const pendingId = stage === "pending" ? req?.id : undefined;
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
  }, [pendingId]);

  // GET …/file returns the PDF itself. 409 = not generated yet → generate once
  // and retry; 402 = unpaid → back to the pay step.
  const [pdfBusy, setPdfBusy] = useState(false);
  async function getPdf(download: boolean) {
    if (!req || pdfBusy) return;
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

  function badgeFor(status?: string): { txt: string; cls: string } | null {
    if (!status || status === "questionnaire" || status === "draft") return null;
    if (status === "file_ready") return { txt: t("badgeReady"), cls: "ready" };
    if (status === "awaiting_payment") return { txt: t("badgeToPay"), cls: "topay" };
    return { txt: t("pendingStatus"), cls: "pending" };
  }

  return (
    <>
    <IncomingRequests />
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{clientTpls.length}</span>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("lead")}</p>

      {tpls.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !clientTpls.length ? (
        <EmptyState icon={<IconDocLines />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="svsel__grid">
          {clientTpls.map((tpl) => {
            const b = badgeFor(byTpl[tpl.id]?.status);
            return (
              <button
                key={tpl.id}
                type="button"
                className={`svcard${b ? ` svcard--${b.cls}` : ""}`}
                onClick={() => open(tpl)}
                disabled={busy}
              >
                <span className="svcard__i"><IconDocLines /></span>
                <span className="svcard__t">
                  <b>{tpl.name}</b>
                  <small>{[tpl.category ? (t.has(`categories.${tpl.category}`) ? t(`categories.${tpl.category}`) : humanizeSlug(tpl.category)) : "", tpl.price ? `${som(tpl.price)} ${t("som")}` : t("free")].filter(Boolean).join(" · ")}</small>
                </span>
                {b ? <span className={`svcard__badge svcard__badge--${b.cls}`}>{b.txt}</span> : null}
              </button>
            );
          })}
        </div>
      )}

      <Modal open={!!req} onClose={close} title={req?.title || t("title")}>
        {req ? (
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
        ) : null}
      </Modal>
    </div>
    </>
  );
}

// Documents an advocate/lawyer requested from this client — upload to fulfil.
function IncomingRequests() {
  const t = useTranslations("portal.client.documents");
  const [key, setKey] = useState(0);
  const reqs = useResource(() => listWorkspaceDocRequests(), [key]);
  const [busyId, setBusyId] = useState("");
  const [openId, setOpenId] = useState("");
  const [failedId, setFailedId] = useState("");

  // The uploaded file lives behind an authed backend route: fetch it with the
  // token as a blob instead of linking to it.
  async function openFile(r: WorkspaceDocRequest) {
    const url = r.file?.fileUrl || "";
    if (!url || openId) return;
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setOpenId(r.id);
    setFailedId("");
    const ok = await fetchAndDeliver(() => httpBlob(url.startsWith("/") ? url : "/" + url), r.file?.fileName || r.title, false);
    if (!ok) setFailedId(r.id);
    setOpenId("");
  }

  async function upload(r: WorkspaceDocRequest, file: File | null) {
    if (!file || busyId) return;
    setBusyId(r.id);
    try {
      await fulfillDocRequest(r.id, file);
      setKey((k) => k + 1);
    } catch {
      /* ignore */
    } finally {
      setBusyId("");
    }
  }

  if (reqs.status !== "ready" || !reqs.data.length) return null;

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("reqInboxTitle")}</b>
        <span className="advmuted">{reqs.data.length}</span>
      </div>
      <div className="alist">
        {reqs.data.map((r) => {
          const done = r.status === "fulfilled";
          return (
            <div className="dreq" key={r.id}>
              <span className={`dreq__st dreq__st--${done ? "done" : "wait"}`} />
              <div className="dreq__m">
                <b>{r.title}</b>
                <span>{[t("reqFrom", { name: r.requestedByName || "—" }), done ? t("reqFulfilled") : t("reqRequested")].join(" · ")}</span>
              </div>
              {done ? (
                r.file?.fileUrl ? (
                  <button className="btn btn--line btn--sm" type="button" onClick={() => openFile(r)} disabled={openId === r.id} title={failedId === r.id ? t("fileError") : undefined}>
                    {openId === r.id ? t("fileLoading") : failedId === r.id ? t("fileError") : t("reqOpen")}
                  </button>
                ) : <span className="dreq__badge dreq__badge--done">{t("reqFulfilled")}</span>
              ) : (
                <label className="btn btn--pri btn--sm dreq__up">
                  {busyId === r.id ? t("reqUploading") : t("reqUpload")}
                  <input type="file" hidden onChange={(e) => upload(r, e.target.files?.[0] ?? null)} disabled={!!busyId} />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
