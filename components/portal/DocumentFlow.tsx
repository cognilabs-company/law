"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getDocumentTemplates,
  listDocumentRequests,
  createDocumentRequest,
  getDocumentRequest,
  listWorkspaceDocRequests,
  fulfillDocRequest,
  type BackendTemplate,
  type DocumentRequest,
  type WorkspaceDocRequest,
} from "@/lib/services/backend";
import { httpBlob } from "@/lib/http";
import { fetchAndDeliver } from "@/lib/download";
import DocumentRequestPanel from "./DocumentRequestPanel";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { IconDocLines } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "");

export default function DocumentFlow() {
  const t = useTranslations("portal.client.documents");
  const tpls = useResource(getDocumentTemplates, []);
  const clientTpls = tpls.data.filter((x) => x.visibility === "client");

  const [req, setReq] = useState<DocumentRequest | null>(null);
  const [activeTpl, setActiveTpl] = useState("");
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

  // The template behind the open request — the document body and question
  // list the builder needs. `activeTpl` is set by open()/start() before the
  // request exists; fall back to the request's own template id on a resume.
  const openTpl = useMemo(
    () => tpls.data.find((x) => x.id === activeTpl) || tpls.data.find((x) => x.id === req?.templateId),
    [tpls.data, activeTpl, req],
  );

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
      bump();
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
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
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

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

      <Modal open={!!req} onClose={close} title={req?.title || t("title")} wide>
        {req ? (
          <DocumentRequestPanel
            key={req.id}
            initialReq={req}
            // The template carries the document body the live pane fills in,
            // and its questions as a fallback for a request that came back
            // without them.
            fields={openTpl?.questionnaire}
            templateText={openTpl?.templateText}
            onBump={bump}
            onStartNew={openTpl && openTpl.questionnaire.length ? () => start(openTpl) : undefined}
          />
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
