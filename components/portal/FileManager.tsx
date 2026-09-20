"use client";

// Standalone "File Manager" page for the lawyer/advocate portals. Frontend
// only: everything below lives in local state seeded with mock data — there
// is no backend endpoint for this yet (see WorkspacePanel for the real,
// backend-backed file store). Kept separate on purpose: the visual brief
// (dark, compact, premium file-manager look) doesn't match the existing
// `.ppanel`/`.prow` seller pages, so this owns its own `.fmgr` CSS block.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { shortDateTime } from "@/lib/date";
import Modal from "@/components/admin/Modal";
import {
  IconFolder,
  IconFileText,
  IconImage,
  IconClock,
  IconStar,
  IconUsers,
  IconSearch,
  IconGrid,
  IconList,
  IconUpload,
  IconChevronRight,
  IconMoreHorizontal,
  IconEdit,
  IconTrash,
  IconDownload,
  IconFolderPlus,
} from "@/components/icons";

type Filter = "all" | "recent" | "starred" | "shared";
type View = "grid" | "list";

type FMItem = {
  id: string;
  type: "folder" | "file";
  name: string;
  parentId: string | null;
  starred: boolean;
  sharedWith: number;
  updatedAt: number;
  size?: number;
  ext?: string;
};

const HOUR = 3_600_000;
const now = Date.now();

function seed(): FMItem[] {
  return [
    { id: "documents", type: "folder", name: "Documents", parentId: null, starred: false, sharedWith: 3, updatedAt: now - 2 * HOUR },
    { id: "images", type: "folder", name: "Images", parentId: null, starred: false, sharedWith: 0, updatedAt: now - 26 * HOUR },
    { id: "projects", type: "folder", name: "Projects", parentId: null, starred: true, sharedWith: 5, updatedAt: now - 5 * HOUR },
    { id: "reports", type: "folder", name: "Reports", parentId: null, starred: false, sharedWith: 0, updatedAt: now - 70 * HOUR },
    { id: "archive", type: "folder", name: "Archive", parentId: null, starred: false, sharedWith: 0, updatedAt: now - 400 * HOUR },
    { id: "quick-notes", type: "file", name: "Quick Notes.txt", parentId: null, starred: true, sharedWith: 0, updatedAt: now - HOUR, size: 2_400, ext: "txt" },
    { id: "deploy-checklist", type: "file", name: "Deployment Checklist.md", parentId: null, starred: false, sharedWith: 2, updatedAt: now - 4 * HOUR, size: 5_800, ext: "md" },

    { id: "doc-contract", type: "file", name: "Contract Template.docx", parentId: "documents", starred: false, sharedWith: 3, updatedAt: now - 20 * HOUR, size: 48_000, ext: "docx" },
    { id: "doc-nda", type: "file", name: "NDA Agreement.pdf", parentId: "documents", starred: true, sharedWith: 0, updatedAt: now - 30 * HOUR, size: 112_000, ext: "pdf" },
    { id: "doc-intake", type: "file", name: "Client Intake Form.docx", parentId: "documents", starred: false, sharedWith: 0, updatedAt: now - 96 * HOUR, size: 31_000, ext: "docx" },

    { id: "img-logo", type: "file", name: "Logo.png", parentId: "images", starred: false, sharedWith: 0, updatedAt: now - 200 * HOUR, size: 84_000, ext: "png" },
    { id: "img-banner", type: "file", name: "Banner.jpg", parentId: "images", starred: false, sharedWith: 0, updatedAt: now - 210 * HOUR, size: 240_000, ext: "jpg" },

    { id: "proj-brief", type: "file", name: "Case Brief.docx", parentId: "projects", starred: false, sharedWith: 5, updatedAt: now - 3 * HOUR, size: 22_000, ext: "docx" },
    { id: "proj-plan", type: "file", name: "Discovery Plan.pdf", parentId: "projects", starred: false, sharedWith: 5, updatedAt: now - 8 * HOUR, size: 66_000, ext: "pdf" },

    { id: "rep-q1", type: "file", name: "Q1 Report.pdf", parentId: "reports", starred: false, sharedWith: 0, updatedAt: now - 500 * HOUR, size: 150_000, ext: "pdf" },
    { id: "rep-q2", type: "file", name: "Q2 Report.pdf", parentId: "reports", starred: false, sharedWith: 0, updatedAt: now - 300 * HOUR, size: 158_000, ext: "pdf" },

    { id: "arc-old-notes", type: "file", name: "Old Notes.txt", parentId: "archive", starred: false, sharedWith: 0, updatedAt: now - 1000 * HOUR, size: 1_200, ext: "txt" },
  ];
}

function fmtSize(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

function isImageExt(ext?: string): boolean {
  return !!ext && /^(png|jpe?g|gif|webp|svg)$/i.test(ext);
}

export default function FileManager() {
  const t = useTranslations("portal.files");
  const locale = useLocale();
  const [items, setItems] = useState<FMItem[]>(seed);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("grid");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameItem, setRenameItem] = useState<FMItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuFor(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

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
    if (filter === "shared") return items.filter((i) => i.sharedWith > 0);
    return items.filter((i) => i.parentId === currentFolderId);
  }, [items, filter, currentFolderId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? baseList.filter((i) => i.name.toLowerCase().includes(q)) : baseList;
    return [...list].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1));
  }, [baseList, search]);

  const usedBytes = useMemo(() => items.reduce((sum, i) => sum + (i.size || 0), 0), [items]);
  const totalGB = 500;
  const usedGB = 128.4 + usedBytes / 1_000_000_000;
  const usedPct = Math.min(100, (usedGB / totalGB) * 100);

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

  function toggleStar(id: string) {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, starred: !i.starred } : i)));
    setMenuFor(null);
  }

  function removeItem(id: string) {
    const target = byId.get(id);
    if (!target) return;
    if (!window.confirm(t("deleteConfirm", { name: target.name }))) return;
    setItems((cur) => {
      const drop = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const i of cur) {
          if (i.parentId && drop.has(i.parentId) && !drop.has(i.id)) {
            drop.add(i.id);
            grew = true;
          }
        }
      }
      return cur.filter((i) => !drop.has(i.id));
    });
    setMenuFor(null);
  }

  function startRename(item: FMItem) {
    setRenameItem(item);
    setRenameValue(item.name);
    setMenuFor(null);
  }

  function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameItem || !renameValue.trim()) return;
    setItems((cur) => cur.map((i) => (i.id === renameItem.id ? { ...i, name: renameValue.trim() } : i)));
    setRenameItem(null);
  }

  function submitNewFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setItems((cur) => [
      ...cur,
      {
        id: `folder-${Date.now()}`,
        type: "folder",
        name: newFolderName.trim(),
        parentId: currentFolderId,
        starred: false,
        sharedWith: 0,
        updatedAt: Date.now(),
      },
    ]);
    setNewFolderName("");
    setNewFolderOpen(false);
    setFilter("all");
  }

  function onUpload(list: FileList | null) {
    if (!list || !list.length) return;
    const added: FMItem[] = Array.from(list).map((f, idx) => ({
      id: `file-${Date.now()}-${idx}`,
      type: "file",
      name: f.name,
      parentId: currentFolderId,
      starred: false,
      sharedWith: 0,
      updatedAt: Date.now(),
      size: f.size,
      ext: extOf(f.name),
    }));
    setItems((cur) => [...cur, ...added]);
    setFilter("all");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function downloadFile(item: FMItem) {
    const blob = new Blob([`${item.name}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setMenuFor(null);
  }

  function iconFor(item: FMItem) {
    if (item.type === "folder") return <IconFolder />;
    if (isImageExt(item.ext)) return <IconImage />;
    return <IconFileText />;
  }

  const emptyText =
    filter === "recent" ? t("recentEmpty") : filter === "starred" ? t("starredEmpty") : filter === "shared" ? t("sharedEmpty") : t("emptyText");

  return (
    <div className="fmgr-page" ref={rootRef}>
      <div className="fmgr-page__head">
        <h2>{t("title")}</h2>
        <p>{t("subtitle")}</p>
      </div>

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
            <button type="button" className={`fmgr__navbtn${filter === "shared" ? " on" : ""}`} onClick={() => selectFilter("shared")}>
              <IconUsers />
              {t("navShared")}
            </button>
          </nav>
          <div className="fmgr__storage">
            <span className="fmgr__storage-l">{t("storageLabel")}</span>
            <div className="fmgr__storage-bar">
              <div className="fmgr__storage-fill" style={{ width: `${usedPct}%` }} />
            </div>
            <span className="fmgr__storage-t">{t("storageUsed", { used: `${usedGB.toFixed(1)} GB`, total: `${totalGB} GB` })}</span>
          </div>
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
            <button type="button" className="fmgr__btn" onClick={() => setNewFolderOpen(true)}>
              <IconFolderPlus />
              {t("newFolder")}
            </button>
            <button type="button" className="fmgr__btn fmgr__btn--upload" onClick={() => fileInputRef.current?.click()}>
              <IconUpload />
              {t("upload")}
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => onUpload(e.target.files)} />
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
              <span className="fmgr__crumb fmgr__crumb--static">
                {filter === "recent" ? t("navRecent") : filter === "starred" ? t("navStarred") : t("navShared")}
              </span>
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
              {visible.map((item) => (
                <div key={item.id} className="fmgr__card" onDoubleClick={() => item.type === "folder" && openFolder(item.id)}>
                  <div className="fmgr__card-top">
                    <span className={`fmgr__ic fmgr__ic--${item.type === "folder" ? "folder" : "file"}`}>
                      {iconFor(item)}
                      {item.starred ? (
                        <span className="fmgr__star">
                          <IconStar />
                        </span>
                      ) : null}
                    </span>
                    <button type="button" className="fmgr__more" aria-label="menu" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === item.id ? null : item.id); }}>
                      <IconMoreHorizontal />
                    </button>
                    {menuFor === item.id ? <ItemMenu item={item} t={t} onOpen={openFolder} onRename={startRename} onStar={toggleStar} onDelete={removeItem} onDownload={downloadFile} /> : null}
                  </div>
                  <button type="button" className="fmgr__card-name" onClick={() => (item.type === "folder" ? openFolder(item.id) : undefined)}>
                    {item.name}
                  </button>
                  <div className="fmgr__card-meta">
                    <span>{item.type === "folder" ? t("items", { n: childCount(item.id) }) : fmtSize(item.size)}</span>
                    {item.sharedWith > 0 ? (
                      <span className="fmgr__shared">
                        <IconUsers />
                        {item.sharedWith}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
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
                  <button type="button" className="fmgr__lrow-name" onClick={() => (item.type === "folder" ? openFolder(item.id) : undefined)}>
                    {item.name}
                  </button>
                  <span className="fmgr__lrow-meta">{item.type === "folder" ? t("items", { n: childCount(item.id) }) : fmtSize(item.size)}</span>
                  <span className="fmgr__lrow-meta">{shortDateTime(new Date(item.updatedAt).toISOString(), locale)}</span>
                  {item.sharedWith > 0 ? (
                    <span className="fmgr__shared">
                      <IconUsers />
                      {item.sharedWith}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="fmgr__lrow-menu">
                    <button type="button" className="fmgr__more" aria-label="menu" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === item.id ? null : item.id); }}>
                      <IconMoreHorizontal />
                    </button>
                    {menuFor === item.id ? <ItemMenu item={item} t={t} onOpen={openFolder} onRename={startRename} onStar={toggleStar} onDelete={removeItem} onDownload={downloadFile} /> : null}
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
          <button className="btn btn--pri btn--full" type="submit" disabled={!newFolderName.trim()}>
            {t("create")}
          </button>
        </form>
      </Modal>

      <Modal open={!!renameItem} onClose={() => setRenameItem(null)} title={t("renameTitle")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submitRename}>
          <div>
            <label>{t("renameTitle")}</label>
            <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          </div>
          <button className="btn btn--pri btn--full" type="submit" disabled={!renameValue.trim()}>
            {t("save")}
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
  onRename,
  onStar,
  onDelete,
  onDownload,
}: {
  item: FMItem;
  t: ReturnType<typeof useTranslations>;
  onOpen: (id: string) => void;
  onRename: (item: FMItem) => void;
  onStar: (id: string) => void;
  onDelete: (id: string) => void;
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
        <button type="button" onClick={() => onDownload(item)}>
          <IconDownload />
          {t("menuDownload")}
        </button>
      )}
      <button type="button" onClick={() => onRename(item)}>
        <IconEdit />
        {t("menuRename")}
      </button>
      <button type="button" onClick={() => onStar(item.id)}>
        <IconStar />
        {item.starred ? t("menuUnstar") : t("menuStar")}
      </button>
      <button type="button" className="fmgr__menu-danger" onClick={() => onDelete(item.id)}>
        <IconTrash />
        {t("menuDelete")}
      </button>
    </div>
  );
}
