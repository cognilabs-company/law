"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getDocumentTemplates,
  listDocumentRequests,
  createDocumentRequest,
  updateDocumentAnswers,
  payDocumentRequest,
  getDocumentRequest,
  listWorkspaceDocRequests,
  fulfillDocRequest,
  type BackendTemplate,
  type DocumentRequest,
  type WorkspaceDocRequest,
} from "@/lib/services/backend";
import { isProviderUnavailable } from "@/lib/http";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { IconDocLines, IconDownload, IconExternal, IconCheck, IconClock } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

type Stage = "answers" | "pay" | "pending" | "done";

// Map a request's backend status to the modal stage. Anything already paid
// (not draft / awaiting_payment) resolves to pending or done — never back to
// the pay step, so a paid document can't be paid for twice.
// Backend statuses: questionnaire -> awaiting_payment -> payment_pending ->
// file_ready. Anything past awaiting_payment is already paid, so it resolves to
// pending/done — never the pay step (no double payment).
function stageFor(r: DocumentRequest): Stage {
  if (r.status === "file_ready" && r.contractFile) return "done";
  if (!r.status || r.status === "questionnaire" || r.status === "draft") return "answers";
  if (r.status === "awaiting_payment") return "pay";
  return "pending";
}

function openPdf(f: DocumentRequest["contractFile"], download = false) {
  if (!f) return;
  try {
    const bytes = Uint8Array.from(atob(f.fileBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: f.mimeType || "application/pdf" });
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement("a");
      a.href = url;
      a.download = f.fileName || "document.pdf";
      a.click();
    } else {
      window.open(url, "_blank");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    /* ignore */
  }
}

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
      setAnswers({});
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
      setAnswers({});
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

  async function pay() {
    if (!req || busy) return;
    setBusy(true);
    setNote(null);
    try {
      let r = await payDocumentRequest(req.id, "payme", req.price);
      if (r.paymentUrl) {
        // Real provider checkout: same-tab navigation (a popup after an await
        // is blocked). The card shows the request as pending on return.
        window.location.assign(r.paymentUrl);
        return;
      }
      if (r.status !== "file_ready") r = await getDocumentRequest(req.id);
      setReq(r);
      setStage(r.status === "file_ready" ? "done" : "pending");
      bump();
    } catch (e) {
      // 503 = Payme/Click not configured on the backend yet.
      setNote({ ok: false, msg: isProviderUnavailable(e) ? tcommon("paymentUnavailable") : t("error") });
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!req) return;
    setBusy(true);
    try {
      const r = await getDocumentRequest(req.id);
      setReq(r);
      bump();
      if (r.status === "file_ready") {
        setStage("done");
        setNote(null);
      }
    } finally {
      setBusy(false);
    }
  }

  // While a payment is processing, poll so the document opens automatically.
  useEffect(() => {
    if (stage !== "pending" || !req) return;
    let alive = true;
    const timer = setInterval(async () => {
      const r = await getDocumentRequest(req.id).catch(() => null);
      if (!alive || !r) return;
      setReq(r);
      if (r.status === "file_ready") {
        setStage("done");
        setNote(null);
        bump();
      }
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, req]);

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
                  <small>{[tpl.category, tpl.price ? `${som(tpl.price)} ${t("som")}` : t("free")].filter(Boolean).join(" · ")}</small>
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
                <p className="advmuted">{t("answersLead")}</p>
                {req.questionnaire.length ? (
                  req.questionnaire.map((f) => (
                    <div key={f.name}>
                      <label>{f.label}{f.required ? " *" : ""}</label>
                      <input
                        value={answers[f.name] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [f.name]: e.target.value }))}
                      />
                    </div>
                  ))
                ) : (
                  <p className="advmuted">{t("noFields")}</p>
                )}
                {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
                <button className="btn btn--pri btn--full" type="button" onClick={saveAnswers} disabled={busy}>
                  {busy ? t("saving") : t("continue")}
                </button>
              </>
            ) : null}

            {stage === "pay" ? (
              <>
                <div className="oprice">
                  <span>{t("price")}</span>
                  <b>{req.price ? `${som(req.price)} ${t("som")}` : t("free")}</b>
                </div>
                <p className="advmuted">{t("payLead")}</p>
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
                <button className="btn btn--soft btn--full" type="button" onClick={refresh} disabled={busy}>
                  {busy ? t("processingShort") : t("checkStatus")}
                </button>
              </div>
            ) : null}

            {stage === "done" && req.contractFile ? (
              <div className="docdone">
                <span className="docdone__i"><IconCheck /></span>
                <b>{t("ready")}</b>
                <span className="docdone__f">{req.contractFile.fileName}</span>
                <div className="docdone__act">
                  <button className="btn btn--pri" type="button" onClick={() => openPdf(req.contractFile)}>
                    <IconExternal />
                    {t("open")}
                  </button>
                  <button className="btn btn--line" type="button" onClick={() => openPdf(req.contractFile, true)}>
                    <IconDownload />
                    {t("download")}
                  </button>
                </div>
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
                  <a className="btn btn--line btn--sm" href={r.file.fileUrl} target="_blank" rel="noreferrer">{t("reqOpen")}</a>
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
