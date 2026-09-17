"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import {
  listFolders,
  createFolder,
  deleteFolder,
  listFiles,
  createFile,
  uploadWorkspaceFile,
  deleteFile,
  analyzeDocument,
  listFileVersions,
  addFileVersion,
  listFileComments,
  addFileComment,
  requestClientDocument,
  getLawyerClients,
  type WorkspaceFile,
  type DocAnalysis,
  getPlatformPolicies,
} from "@/lib/services/backend";
import { useResource, useResourceOne } from "@/lib/useResource";
import { getWorkspaceFileSignedUrl } from "@/lib/services/backend";
import { httpBlob } from "@/lib/http";

// Open a workspace file on this device: a 15-minute signed backend URL in a
// new tab (works on phones and without the auth header); if that fails, the
// bytes are fetched with the session and handed to the browser as a download.
async function openWorkspaceFile(fileId: string, fallback: { url: string; name: string }) {
  const w = window.open("", "_blank");
  try {
    const s = await getWorkspaceFileSignedUrl(fileId);
    if (!s.url) throw new Error("no url");
    if (w) w.location.href = s.url; else window.location.href = s.url;
  } catch {
    if (w) w.close();
    if (!fallback.url) throw new Error("no url");
    const blob = await httpBlob(fallback.url);
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = fallback.name || "file"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  }
}
import { Skeleton, EmptyState } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import {
  IconFileText, IconPlus, IconClose, IconExternal, IconDocLines,
  IconSparkle, IconAlert, IconCheck, IconChat, IconUsers,
} from "@/components/icons";

function fmtSize(n: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU");
}

export default function WorkspacePanel() {
  const t = useTranslations("portal.workspace");
  const { session } = useAuth();
  const isSeller = session?.role === "advocate" || session?.role === "lawyer";
  const [key, setKey] = useState(0);
  const reload = () => setKey((k) => k + 1);
  const folders = useResource(() => listFolders(), [key]);
  const files = useResource<WorkspaceFile>(() => listFiles(), [key]);
  const [sel, setSel] = useState<string>("");
  const [type, setType] = useState<"all" | "docs" | "media">("all");
  const [aiOpen, setAiOpen] = useState(false);

  const [folderName, setFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [detail, setDetail] = useState<WorkspaceFile | null>(null);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [reqOpen, setReqOpen] = useState(false);

  const isMedia = (m: string) => /^(audio|video)\//i.test(m || "");
  const shown = files.data.filter(
    (f) =>
      (!sel || f.folderId === sel) &&
      (type === "all" || (type === "media" ? isMedia(f.mimeType) : !isMedia(f.mimeType))),
  );

  async function addFolder(e: React.FormEvent) {
    e.preventDefault();
    if (folderBusy || !folderName.trim()) return;
    setFolderBusy(true);
    try {
      await createFolder({ name: folderName.trim() });
      setFolderName("");
      reload();
    } catch {
      /* ignore */
    } finally {
      setFolderBusy(false);
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn--soft btn--sm" type="button" onClick={() => setAiOpen((v) => !v)}>
            <IconSparkle />
            {t("aiToggle")}
          </button>
          {isSeller ? (
            <button className="btn btn--soft btn--sm" type="button" onClick={() => setReqOpen(true)}>
              <IconUsers />
              {t("reqDoc")}
            </button>
          ) : null}
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setFileOpen(true)}>
            <IconPlus />
            {t("addFile")}
          </button>
        </div>
      </div>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      <p className="advmuted" style={{ marginBottom: 14 }}>{t("lead")}</p>

      {aiOpen ? <Analyzer /> : null}

      <form className="wsp__folders" onSubmit={addFolder}>
        <button type="button" className={`fchip${sel === "" ? " on" : ""}`} aria-pressed={sel === ""} onClick={() => setSel("")}>
          {t("allFiles")}
        </button>
        {folders.data.map((f) => (
          <span key={f.id} className={`wsp__folder${sel === f.id ? " on" : ""}`}>
            <button type="button" className="wsp__folder-b" onClick={() => setSel(f.id)}>
              <IconDocLines />
              {f.name}
            </button>
            <button type="button" className="wsp__folder-x" aria-label={t("remove")} onClick={() => deleteFolder(f.id).then(reload).catch(() => {})}>
              <IconClose />
            </button>
          </span>
        ))}
        <span className="wsp__newfolder">
          <input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder={t("folderPh")} />
          <button className="btn btn--line btn--sm" type="submit" disabled={folderBusy}>
            <IconPlus />
            {t("addFolder")}
          </button>
        </span>
      </form>

      <div className="chiprow" style={{ margin: "0 0 12px" }}>
        {(["all", "docs", "media"] as const).map((tp) => (
          <button key={tp} type="button" className="fchip" aria-pressed={type === tp} onClick={() => setType(tp)}>
            {t(tp === "all" ? "filterAll" : tp === "docs" ? "filterDocs" : "filterMedia")}
          </button>
        ))}
      </div>

      {files.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !shown.length ? (
        <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="wsp__files">
          {shown.map((f) => (
            <div className="prow" key={f.id}>
              <span className="prow__i" style={{ background: "var(--grad)", color: "#fff" }}>
                <IconFileText />
              </span>
              <button type="button" className="prow__m wsp__filebtn" onClick={() => setDetail(f)}>
                <b>{f.fileName}</b>
                <span>
                  {[f.mimeType, fmtSize(f.size)].filter(Boolean).join(" · ")}
                  {f.scan ? <em className={`wsp__scan wsp__scan--${f.scan.status || "pending"}`} title={f.scan.engine}>{t.has(`scan.${f.scan.status}`) ? t(`scan.${f.scan.status}`) : f.scan.status || t("scan.pending")}</em> : null}
                </span>
              </button>
              <div style={{ display: "flex", gap: 8, flex: "none" }}>
                {f.fileUrl || f.downloadUrl ? (
                  <button className="btn btn--line btn--sm" type="button" aria-label={t("open")} title={t("open")} onClick={() => openWorkspaceFile(f.id, { url: f.fileUrl, name: f.fileName }).catch(() => setNote({ ok: false, msg: t("openError") }))}>
                    <IconExternal style={{ width: 15, height: 15 }} />
                  </button>
                ) : null}
                <button className="btn btn--line btn--sm" type="button" aria-label={t("remove")} onClick={() => deleteFile(f.id).then(reload).catch(() => {})}>
                  <IconClose style={{ width: 15, height: 15 }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddFileModal
        open={fileOpen}
        onClose={() => setFileOpen(false)}
        folders={folders.data.map((f) => ({ value: f.id, label: f.name }))}
        defaultFolder={sel}
        onSaved={reload}
      />
      {detail ? <FileDetail file={detail} onClose={() => setDetail(null)} /> : null}
      {isSeller ? <RequestDocModal open={reqOpen} onClose={() => setReqOpen(false)} /> : null}
    </div>
  );
}

// AI Document Analysis (module 10): paste text → key points + risks + recs.
function Analyzer() {
  const t = useTranslations("portal.workspace");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DocAnalysis | null>(null);
  const [err, setErr] = useState(false);

  async function run() {
    if (busy || text.trim().length < 20) return;
    setBusy(true);
    setErr(false);
    setRes(null);
    try {
      setRes(await analyzeDocument(text.trim()));
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wsp__ai">
      <b className="wsp__ai-t"><IconSparkle />{t("aiTitle")}</b>
      <p className="advmuted" style={{ margin: "2px 0 10px" }}>{t("aiLead")}</p>
      <textarea className="intake__ta" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("aiPh")} />
      <button className="btn btn--pri btn--sm" type="button" style={{ marginTop: 8 }} disabled={busy || text.trim().length < 20} onClick={run}>
        <IconSparkle />
        {busy ? t("aiRunning") : t("aiRun")}
      </button>
      {err ? <Notice ok={false} msg={t("aiError")} /> : null}
      {res ? (
        <div className="wsp__ai-res">
          {res.pointsCount ? <span className="wsp__ai-points">{t("aiPoints", { n: res.pointsCount })}</span> : null}
          {res.summary ? <p className="wsp__ai-sum"><b>{t("aiSummary")}:</b> {res.summary}</p> : null}
          {res.risks.length ? (
            <>
              <b className="wsp__ai-h">{t("aiRisks")}</b>
              <ul className="wsp__ai-risks">
                {res.risks.map((r, i) => (
                  <li key={i} className={`wsp__risk wsp__risk--${r.level}`}><IconAlert />{r.text}</li>
                ))}
              </ul>
            </>
          ) : null}
          {res.recommendations.length ? (
            <>
              <b className="wsp__ai-h">{t("aiRecs")}</b>
              <ul className="wsp__ai-recs">
                {res.recommendations.map((r, i) => (
                  <li key={i}><IconCheck />{r}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// File detail: version history + comments.
function FileDetail({ file, onClose }: { file: WorkspaceFile; onClose: () => void }) {
  const t = useTranslations("portal.workspace");
  const [key, setKey] = useState(0);
  const versions = useResource(() => listFileVersions(file.id), [file.id, key]);
  const comments = useResource(() => listFileComments(file.id), [file.id, key]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (busy || !comment.trim()) return;
    setBusy(true);
    try {
      await addFileComment(file.id, comment.trim());
      setComment("");
      setKey((k) => k + 1);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }
  async function newVersion() {
    if (busy || !file.fileUrl) return;
    setBusy(true);
    try {
      await addFileVersion(file.id, { file_url: file.fileUrl, note: `v${versions.data.length + 1}` });
      setKey((k) => k + 1);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={file.fileName}>
      <div className="cform" style={{ maxWidth: "none" }}>
        <div className="wsp__sect">
          <div className="wsp__sect-h">
            <b>{t("versions")}</b>
            <button className="btn btn--line btn--sm" type="button" onClick={newVersion} disabled={busy}>
              <IconPlus />{t("addVersion")}
            </button>
          </div>
          {versions.status === "loading" ? (
            <Skeleton rows={1} />
          ) : !versions.data.length ? (
            <p className="advmuted">{t("noVersions")}</p>
          ) : (
            <ul className="wsp__vers">
              {versions.data.map((v) => (
                <li key={v.id}>
                  <span className="wsp__ver-n">v{v.version || 1}</span>
                  <span>{v.note || v.fileName}</span>
                  <small>{fmtDate(v.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="wsp__sect">
          <b>{t("comments")}</b>
          {comments.status === "loading" ? (
            <Skeleton rows={1} />
          ) : !comments.data.length ? (
            <p className="advmuted">{t("noComments")}</p>
          ) : (
            <ul className="wsp__cmts">
              {comments.data.map((c) => (
                <li key={c.id}>
                  <span className="wsp__cmt-a">{c.authorName || "—"}</span>
                  <span>{c.text}</span>
                  <small>{fmtDate(c.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
          <div className="wsp__cmtbar">
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("commentPh")} />
            <button className="btn btn--pri btn--sm" type="button" onClick={send} disabled={busy || !comment.trim()}>
              <IconChat />{t("send")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Advocate/lawyer requests a document from one of their clients.
function RequestDocModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("portal.workspace");
  const clients = useResource(getLawyerClients, []);
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  const opts = clients.data.filter((c) => c.id).map((c) => ({ value: c.id, label: `${c.name || "—"}${c.phone ? ` · ${c.phone}` : ""}` }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = clientId || opts[0]?.value;
    if (busy || !cid || !title.trim()) {
      setNote({ ok: false, msg: t("error") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await requestClientDocument({ client_user_id: cid, title: title.trim() });
      setNote({ ok: true, msg: t("reqSent") });
      setTitle("");
      setTimeout(onClose, 900);
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("reqDoc")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
        <div>
          <label>{t("reqClient")}</label>
          {clients.status === "loading" ? (
            <Skeleton rows={1} />
          ) : !opts.length ? (
            <p className="advmuted">{t("reqNoClients")}</p>
          ) : (
            <Select value={clientId || opts[0]?.value || ""} onChange={setClientId} options={opts} ariaLabel={t("reqClient")} />
          )}
        </div>
        <div>
          <label>{t("reqTitle")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("reqTitlePh")} />
        </div>
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={busy || !opts.length}>
          {busy ? t("saving") : t("reqSend")}
        </button>
      </form>
    </Modal>
  );
}

function AddFileModal({
  open,
  onClose,
  folders,
  defaultFolder,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  folders: { value: string; label: string }[];
  defaultFolder: string;
  onSaved: () => void;
}) {
  const t = useTranslations("portal.workspace");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sizeErr, setSizeErr] = useState(false);
  // Allowed types and size limits come from the backend policy store.
  const policy = useResourceOne(getPlatformPolicies, []).data;
  const [folder, setFolder] = useState(defaultFolder);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  const opts = [{ value: "", label: t("noFolder") }, ...folders];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!file && !name.trim()) {
      setNote({ ok: false, msg: t("error") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      if (file) {
        await uploadWorkspaceFile(file, { folderId: folder || undefined });
      } else {
        await createFile({ file_name: name.trim(), file_url: url.trim() || undefined, folder_id: folder || undefined });
      }
      setNote({ ok: true, msg: t("saved") });
      setName("");
      setUrl("");
      setFile(null);
      onSaved();
      setTimeout(onClose, 800);
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("addFile")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
        <div>
          <label>{t("uploadFile")}</label>
          <input type="file" accept={policy?.workspace.allowedExtensions.join(",") || undefined} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setSizeErr(f && policy ? f.size > (/\.(mp4|mov)$/i.test(f.name) ? policy.workspace.videoMaxMb : policy.workspace.fileMaxMb) * 1024 * 1024 : false); }} />
          {policy ? <p className="rf__hint">{t("uploadRules", { max: policy.workspace.fileMaxMb, video: policy.workspace.videoMaxMb, ext: policy.workspace.allowedExtensions.map((x) => x.replace(/^\./, "")).join(", ") })}</p> : null}
          {sizeErr ? <Notice ok={false} msg={t("tooBig")} /> : null}
        </div>
        <div className="wsp__or">{t("orUrl")}</div>
        <div>
          <label>{t("fileName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("fileNamePh")} disabled={!!file} />
        </div>
        <div>
          <label>{t("fileUrl")}</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("fileUrlPh")} disabled={!!file} />
        </div>
        <div>
          <label>{t("folder")}</label>
          <Select value={folder} onChange={setFolder} options={opts} ariaLabel={t("folder")} />
        </div>
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button className="btn btn--pri btn--full" type="submit" disabled={busy || sizeErr}>
          {busy ? t("saving") : t("save")}
        </button>
      </form>
    </Modal>
  );
}
