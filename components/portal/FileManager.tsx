"use client";

// "File Manager" page for the lawyer/advocate portals — backed by the real
// workspace storage API (LEXGO_WORKSPACE_STORAGE_FRONTEND.md, 2026-09-20):
// GET /workspace/tree for folders+files+quota, PATCH for rename/star/archive,
// POST /workspace/files/upload, DELETE for both. Gated server-side to
// approved advokat/yurist/advokat_tashkiloti (403 for pending sellers and
// clients) — PortalShell already keeps a *pending* seller off this route,
// but the 403 is still handled here as a defensive fallback.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { shortDateTime } from "@/lib/date";
import { ApiError } from "@/lib/http";
import { preopenTab, showBlob, saveBlob, closeTab } from "@/lib/download";
import {
  getWorkspaceTree,
  createFolder,
  updateFolder,
  deleteFolder,
  uploadWorkspaceFile,
  updateFile,
  deleteFile,
  getWorkspaceFileBlob,
  type WorkspaceFolder,
  type WorkspaceFile,
} from "@/lib/services/backend";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import {
  IconFolder,
  IconFileText,
  IconImage,
  IconClock,
  IconStar,
  IconLock,
  IconSearch,
  IconGrid,
  IconList,
  IconUpload,
  IconChevronRight,
  IconMoreHorizontal,
  IconEdit,
  IconTrash,
  IconDownload,
  IconExternal,
  IconFolderPlus,
} from "@/components/icons";

type Filter = "all" | "recent" | "starred";
type View = "grid" | "list";

type FMItem = {
  id: string;
  type: "folder" | "file";
  name: string;
  parentId: string | null;
  starred: boolean;
  updatedAt: number;
  size?: number;
  ext?: string;
};

function toItem(f: WorkspaceFolder): FMItem {
  return { id: f.id, type: "folder", name: f.name, parentId: f.parentId ?? null, starred: f.starred, updatedAt: Date.parse(f.createdAt) || 0, size: f.size };
}
function toFileItem(f: WorkspaceFile): FMItem {
  return { id: f.id, type: "file", name: f.fileName, parentId: f.folderId ?? null, starred: f.starred, updatedAt: Date.parse(f.createdAt) || 0, size: f.size, ext: f.extension.replace(/^\./, "") };
}

function fmtSize(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Which folder colour a card wears. The grid draws every item as the same
// 3D folder (see .ffold in globals.css) — the type only decides the accent
// and the tag on the front flap, so a page of files still reads as one set.
type FMKind = "folder" | "pdf" | "doc" | "sheet" | "image" | "file";
function kindOf(item: FMItem): FMKind {
  if (item.type === "folder") return "folder";
  const e = (item.ext || "").toLowerCase();
  if (e === "pdf") return "pdf";
  if (/^(docx?|rtf|odt|txt)$/.test(e)) return "doc";
  if (/^(xlsx?|csv|ods)$/.test(e)) return "sheet";
  if (isImageExt(e)) return "image";
  return "file";
}

function isImageExt(ext?: string): boolean {
  return !!ext && /^(png|jpe?g|gif|webp|heic)$/i.test(ext);
}

const errStatus = (e: unknown) => (e instanceof ApiError ? e.status : 0);

export default function FileManager() {
  const t = useTranslations("portal.files");
  const locale = useLocale();
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [quota, setQuota] = useState<{ usedBytes: number; quotaBytes: number; limitGb: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let alive = true;
    getWorkspaceTree()
      .then((tree) => {
        if (!alive) return;
        setFolders(tree.folders);
        setFiles(tree.files);
        setQuota(tree.quota);
        setStatus("ready");
      })
      .catch((e) => {
        if (!alive) return;
        setStatus(errStatus(e) === 403 ? "forbidden" : "error");
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("grid");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameItem, setRenameItem] = useState<FMItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuFor(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const items = useMemo<FMItem[]>(() => [...folders.map(toItem), ...files.map(toFileItem)], [folders, files]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const childCount = (folderId: string) => items.filter((i) => i.parentId === folderId).length;

  const crumbs = useMemo(() => {
    const chain: FMItem[] = [];
    let cur = currentFolderId ? byId.get(currentFolderId) : undefined;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  }, [currentFolderId, byId]);

  const baseList = useMemo(() => {
    if (filter === "recent") return [...items].filter((i) => i.type === "file").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10);
    if (filter === "starred") return items.filter((i) => i.starred);
    return items.filter((i) => i.parentId === currentFolderId);
  }, [items, filter, currentFolderId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? baseList.filter((i) => i.name.toLowerCase().includes(q)) : baseList;
    return [...list].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1));
  }, [baseList, search]);

  const usedPct = quota && quota.quotaBytes ? Math.min(100, (quota.usedBytes / quota.quotaBytes) * 100) : 0;

  function openFolder(id: string) {
    setFilter("all");
    setCurrentFolderId(id);
    setSearch("");
    setMenuFor(null);
  }
  function goToCrumb(id: string | null) {
    setFilter("all");
    setCurrentFolderId(id);
    setMenuFor(null);
  }
  function selectFilter(f: Filter) {
    setFilter(f);
    setSearch("");
    setMenuFor(null);
  }

  async function toggleStar(item: FMItem) {
    setMenuFor(null);
    setNote(null);
    try {
      if (item.type === "folder") await updateFolder(item.id, { starred: !item.starred });
      else await updateFile(item.id, { starred: !item.starred });
      reload();
    } catch {
      setNote({ ok: false, msg: t("actionError") });
    }
  }

  async function removeItem(item: FMItem) {
    setMenuFor(null);
    if (!window.confirm(t("deleteConfirm", { name: item.name }))) return;
    setNote(null);
    try {
      if (item.type === "folder") await deleteFolder(item.id);
      else await deleteFile(item.id);
      reload();
    } catch {
      setNote({ ok: false, msg: t("actionError") });
    }
  }

  function startRename(item: FMItem) {
    setRenameItem(item);
    setRenameValue(item.name);
    setMenuFor(null);
  }
  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameItem || !renameValue.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (renameItem.type === "folder") await updateFolder(renameItem.id, { name: renameValue.trim() });
      else await updateFile(renameItem.id, { file_name: renameValue.trim() });
      setRenameItem(null);
      reload();
    } catch {
      setNote({ ok: false, msg: t("actionError") });
    } finally {
      setBusy(false);
    }
  }

  async function submitNewFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await createFolder({ name: newFolderName.trim(), parent_id: currentFolderId ?? undefined });
      setNewFolderName("");
      setNewFolderOpen(false);
      setFilter("all");
      reload();
    } catch {
      setNote({ ok: false, msg: t("actionError") });
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(list: FileList | null) {
    if (!list || !list.length || busy) return;
    setBusy(true);
    setNote(null);
    let failed = 0;
    for (const file of Array.from(list)) {
      try {
        await uploadWorkspaceFile(file, { folderId: currentFolderId ?? undefined });
      } catch (e) {
        failed += 1;
        if (errStatus(e) === 413) setNote({ ok: false, msg: t("quotaExceeded") });
      }
    }
    if (failed && !note) setNote({ ok: false, msg: t("uploadError", { n: failed }) });
    setFilter("all");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setBusy(false);
    reload();
  }

  // Clicking a file opens/previews it; downloading is its own separate
  // action (menu). Both fetch the same bytes through the authed proxy — a
  // plain navigation to the file's URL always forces a download server-side,
  // regardless of which of these two the frontend meant.
  async function openFile(item: FMItem) {
    setMenuFor(null);
    setNote(null);
    const win = preopenTab();
    try {
      const blob = await getWorkspaceFileBlob(item.id);
      showBlob(blob, item.name, win);
    } catch {
      closeTab(win);
      setNote({ ok: false, msg: t("actionError") });
    }
  }
  async function downloadFile(item: FMItem) {
    setMenuFor(null);
    setNote(null);
    try {
      const blob = await getWorkspaceFileBlob(item.id);
      saveBlob(blob, item.name);
    } catch {
      setNote({ ok: false, msg: t("actionError") });
    }
  }

  function iconFor(item: FMItem) {
    if (item.type === "folder") return <IconFolder />;
    if (isImageExt(item.ext)) return <IconImage />;
    return <IconFileText />;
  }

  const emptyText = filter === "recent" ? t("recentEmpty") : filter === "starred" ? t("starredEmpty") : t("emptyText");

  if (status === "loading") {
    return (
      <div className="fmgr-page">
        <div className="fmgr-page__head">
          <h2>{t("title")}</h2>
          <p>{t("subtitle")}</p>
        </div>
        <Skeleton rows={4} />
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="fmgr-page">
        <div className="fmgr-page__head">
          <h2>{t("title")}</h2>
          <p>{t("subtitle")}</p>
        </div>
        <div className="fmgr__empty">
          <IconLock />
          <b>{t("forbiddenTitle")}</b>
          <span>{t("forbiddenText")}</span>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="fmgr-page">
        <div className="fmgr-page__head">
          <h2>{t("title")}</h2>
          <p>{t("subtitle")}</p>
        </div>
        <Notice ok={false} msg={t("loadError")} />
      </div>
    );
  }

  return (
    <div className="fmgr-page" ref={rootRef}>
      <div className="fmgr-page__head">
        <h2>{t("title")}</h2>
        <p>{t("subtitle")}</p>
      </div>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

      <div className="fmgr">
        <aside className="fmgr__side">
          <nav className="fmgr__nav">
            <button type="button" className={`fmgr__navbtn${filter === "all" ? " on" : ""}`} onClick={() => selectFilter("all")}>
              <IconFolder />
              {t("navAll")}
            </button>
            <button type="button" className={`fmgr__navbtn${filter === "recent" ? " on" : ""}`} onClick={() => selectFilter("recent")}>
              <IconClock />
              {t("navRecent")}
            </button>
            <button type="button" className={`fmgr__navbtn${filter === "starred" ? " on" : ""}`} onClick={() => selectFilter("starred")}>
              <IconStar />
              {t("navStarred")}
            </button>
          </nav>
          {quota ? (
            <div className="fmgr__storage">
              <span className="fmgr__storage-l">{t("storageLabel")}</span>
              <div className="fmgr__storage-bar">
                <div className="fmgr__storage-fill" style={{ width: `${usedPct}%` }} />
              </div>
              <span className="fmgr__storage-t">{t("storageUsed", { used: fmtSize(quota.usedBytes) || "0 B", total: `${quota.limitGb} GB` })}</span>
            </div>
          ) : null}
        </aside>

        <div className="fmgr__main">
          <div className="fmgr__toolbar">
            <div className="fmgr__search">
              <IconSearch />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} />
            </div>
            <div className="fmgr__viewtoggle" role="group">
              <button type="button" className={`fmgr__viewbtn${view === "grid" ? " on" : ""}`} aria-label={t("gridView")} title={t("gridView")} onClick={() => setView("grid")}>
                <IconGrid />
              </button>
              <button type="button" className={`fmgr__viewbtn${view === "list" ? " on" : ""}`} aria-label={t("listView")} title={t("listView")} onClick={() => setView("list")}>
                <IconList />
              </button>
            </div>
            <button type="button" className="fmgr__btn" onClick={() => setNewFolderOpen(true)} disabled={busy}>
              <IconFolderPlus />
              {t("newFolder")}
            </button>
            <button type="button" className="fmgr__btn fmgr__btn--upload" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <IconUpload />
              {busy ? t("uploading") : t("upload")}
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => void onUpload(e.target.files)} />
          </div>

          {filter === "all" ? (
            <div className="fmgr__crumbs">
              <button type="button" className="fmgr__crumb" onClick={() => goToCrumb(null)}>
                {t("breadcrumbRoot")}
              </button>
              {crumbs.map((c) => (
                <span key={c.id} className="fmgr__crumb-w">
                  <IconChevronRight />
                  <button type="button" className="fmgr__crumb" onClick={() => goToCrumb(c.id)}>
                    {c.name}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="fmgr__crumbs">
              <span className="fmgr__crumb fmgr__crumb--static">{filter === "recent" ? t("navRecent") : t("navStarred")}</span>
            </div>
          )}

          {!visible.length ? (
            <div className="fmgr__empty">
              <IconFolder />
              <b>{t("emptyTitle")}</b>
              <span>{emptyText}</span>
            </div>
          ) : view === "grid" ? (
            <div className="fmgr__grid">
              {visible.map((item) => {
                const kind = kindOf(item);
                return (
                  <div key={item.id} className={`ffcard ffcard--${kind}`}>
                    {/* One hit area for the whole folder: a single click opens
                        it, which is what people try first — the old card only
                        responded to a double click on the tile itself. */}
                    <button
                      type="button"
                      className="ffcard__hit"
                      onClick={() => (item.type === "folder" ? openFolder(item.id) : void openFile(item))}
                      aria-label={item.name}
                    >
                      <span className="ffold" aria-hidden>
                        <span className="ffold__back" />
                        <span className="ffold__s ffold__s--3" />
                        <span className="ffold__s ffold__s--2" />
                        <span className="ffold__s ffold__s--1" />
                        <span className="ffold__front">
                          <span className="ffold__tag">
                            {iconFor(item)}
                            {item.type === "folder" ? null : <i>{(item.ext || "").toUpperCase().slice(0, 4)}</i>}
                          </span>
                        </span>
                      </span>
                    </button>

                    {item.starred ? (
                      <span className="ffcard__star" aria-label={t("navStarred")}>
                        <IconStar />
                      </span>
                    ) : null}
                    <button type="button" className="ffcard__more" aria-label="menu" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === item.id ? null : item.id); }}>
                      <IconMoreHorizontal />
                    </button>
                    {menuFor === item.id ? <ItemMenu item={item} t={t} onOpen={openFolder} onOpenFile={openFile} onRename={startRename} onStar={toggleStar} onDelete={removeItem} onDownload={downloadFile} /> : null}

                    <b className="ffcard__name" title={item.name}>{item.name}</b>
                    <small className="ffcard__meta">
                      {item.type === "folder" ? t("items", { n: childCount(item.id) }) : fmtSize(item.size)}
                    </small>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="fmgr__list">
              {visible.map((item) => (
                <div key={item.id} className="fmgr__lrow" onDoubleClick={() => item.type === "folder" && openFolder(item.id)}>
                  <span className={`fmgr__ic fmgr__ic--${item.type === "folder" ? "folder" : "file"} fmgr__ic--sm`}>
                    {iconFor(item)}
                    {item.starred ? (
                      <span className="fmgr__star">
                        <IconStar />
                      </span>
                    ) : null}
                  </span>
                  <button type="button" className="fmgr__lrow-name" onClick={() => (item.type === "folder" ? openFolder(item.id) : void openFile(item))}>
                    {item.name}
                  </button>
                  <span className="fmgr__lrow-meta">{item.type === "folder" ? t("items", { n: childCount(item.id) }) : fmtSize(item.size)}</span>
                  <span className="fmgr__lrow-meta">{item.updatedAt ? shortDateTime(new Date(item.updatedAt).toISOString(), locale) : ""}</span>
                  <span className="fmgr__lrow-menu">
                    <button type="button" className="fmgr__more" aria-label="menu" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === item.id ? null : item.id); }}>
                      <IconMoreHorizontal />
                    </button>
                    {menuFor === item.id ? <ItemMenu item={item} t={t} onOpen={openFolder} onOpenFile={openFile} onRename={startRename} onStar={toggleStar} onDelete={removeItem} onDownload={downloadFile} /> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title={t("newFolderTitle")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submitNewFolder}>
          <div>
            <label>{t("newFolderPh")}</label>
            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder={t("newFolderPh")} autoFocus />
          </div>
          <button className="btn btn--pri btn--full" type="submit" disabled={busy || !newFolderName.trim()}>
            {busy ? t("saving") : t("create")}
          </button>
        </form>
      </Modal>

      <Modal open={!!renameItem} onClose={() => setRenameItem(null)} title={t("renameTitle")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submitRename}>
          <div>
            <label>{t("renameTitle")}</label>
            <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          </div>
          <button className="btn btn--pri btn--full" type="submit" disabled={busy || !renameValue.trim()}>
            {busy ? t("saving") : t("save")}
          </button>
        </form>
      </Modal>
    </div>
  );
}

function ItemMenu({
  item,
  t,
  onOpen,
  onOpenFile,
  onRename,
  onStar,
  onDelete,
  onDownload,
}: {
  item: FMItem;
  t: ReturnType<typeof useTranslations>;
  onOpen: (id: string) => void;
  onOpenFile: (item: FMItem) => void;
  onRename: (item: FMItem) => void;
  onStar: (item: FMItem) => void;
  onDelete: (item: FMItem) => void;
  onDownload: (item: FMItem) => void;
}) {
  return (
    <div className="fmgr__menu" onClick={(e) => e.stopPropagation()}>
      {item.type === "folder" ? (
        <button type="button" onClick={() => onOpen(item.id)}>
          <IconFolder />
          {t("menuOpen")}
        </button>
      ) : (
        <>
          <button type="button" onClick={() => void onOpenFile(item)}>
            <IconExternal />
            {t("menuOpen")}
          </button>
          <button type="button" onClick={() => void onDownload(item)}>
            <IconDownload />
            {t("menuDownload")}
          </button>
        </>
      )}
      <button type="button" onClick={() => onRename(item)}>
        <IconEdit />
        {t("menuRename")}
      </button>
      <button type="button" onClick={() => void onStar(item)}>
        <IconStar />
        {item.starred ? t("menuUnstar") : t("menuStar")}
      </button>
      <button type="button" className="fmgr__menu-danger" onClick={() => void onDelete(item)}>
        <IconTrash />
        {t("menuDelete")}
      </button>
    </div>
  );
}
