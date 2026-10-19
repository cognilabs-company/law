"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createFolder, deleteFile, deleteFolder, getWorkspaceFileBlob, getWorkspaceTree, updateFile, updateFolder, uploadWorkspaceFile, type WorkspaceFile, type WorkspaceFolder } from "@/lib/services/backend";
import { closeTab, preopenTab, saveBlob, showBlob } from "@/lib/download";
import { dateOnly } from "@/lib/date";
import { IconAlert, IconChevronRight, IconClock, IconDownload, IconEdit, IconEye, IconFileText, IconFolder, IconFolderPlus, IconGrid, IconHome, IconImage, IconList, IconStarRate, IconTrash, IconUpload } from "@/components/icons";
import { App, Btn, Dialog, Empty, Field, Input, Loading, Progress, Search, Seg, Select, Tool, Toolbar, useConfirm, useHost, useOs, useToast } from "../kit/kit";
import type { NativeProps } from "../native";
import "./files.css";

// Files as a desktop program: Finder on the Mac, File Explorer on Windows.
// Places and folders on the side; icons or a details list; the path as an
// address bar (Windows) or a path bar (Mac); a preview pane; files dropped
// in from the computer are uploaded where they land, items dragged onto a
// folder move into it; rename, star, download and delete from the menu.

type Item = { id: string; kind: "folder" | "file"; name: string; parent: string; starred: boolean; at: number; size: number; ext: string; mime: string; count: number };
type Place = "home" | "recent" | "starred";
const toFolder = (f: WorkspaceFolder): Item => ({ id: f.id, kind: "folder", name: f.name, parent: f.parentId ?? "", starred: f.starred, at: Date.parse(f.createdAt) || 0, size: f.size, ext: "", mime: "", count: f.fileCount + f.folderCount });
const toFile = (f: WorkspaceFile): Item => ({ id: f.id, kind: "file", name: f.fileName, parent: f.folderId ?? "", starred: f.starred, at: Date.parse(f.createdAt) || 0, size: f.size, ext: f.extension.replace(/^\./, "").toLowerCase(), mime: f.mimeType, count: 0 });
const kindOf = (x: Item) => (x.kind === "folder" ? "folder" : x.ext === "pdf" ? "pdf" : /^(docx?|rtf|odt|txt)$/.test(x.ext) ? "doc" : /^(xlsx?|csv|ods)$/.test(x.ext) ? "sheet" : /^(png|jpe?g|gif|webp|heic)$/.test(x.ext) ? "image" : "file");
const size = (n: number) => (!n ? "—" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);

export default function FilesApp(_props: NativeProps) {
  void _props;
  const t = useTranslations("portal.files");
  const d = useTranslations("portal.desk.files");
  const locale = useLocale();
  const os = useOs();
  const { menu } = useHost();
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [quota, setQuota] = useState<{ usedBytes: number; quotaBytes: number } | null>(null);
  const [place, setPlace] = useState<Place | "">("home");
  const [folder, setFolder] = useState("");
  const [hist, setHist] = useState<{ back: string[]; fwd: string[] }>({ back: [], fwd: [] });
  const [view, setView] = useState<"icons" | "list">("icons");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [preview, setPreview] = useState(true);
  const [dropping, setDropping] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [ask, setAsk] = useState<{ kind: "new" | "rename" | "move"; item?: Item; value: string } | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const drag = useRef("");
  const [confirmNode, confirm] = useConfirm();
  const [toast, say] = useToast();

  const reload = () =>
    getWorkspaceTree()
      .then((tr) => {
        setItems([...tr.folders.map(toFolder), ...tr.files.map(toFile)]);
        setQuota(tr.quota);
      })
      .catch(() => setFailed(true));
  useEffect(() => {
    let alive = true;
    getWorkspaceTree()
      .then((tr) => {
        if (!alive) return;
        setItems([...tr.folders.map(toFolder), ...tr.files.map(toFile)]);
        setQuota(tr.quota);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const all = useMemo(() => items ?? [], [items]);
  const byId = useMemo(() => new Map(all.map((x) => [x.id, x])), [all]);
  const crumbs = useMemo(() => {
    const out: Item[] = [];
    let c = folder ? byId.get(folder) : undefined;
    while (c) {
      out.unshift(c);
      c = c.parent ? byId.get(c.parent) : undefined;
    }
    return out;
  }, [folder, byId]);
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    let l: Item[];
    if (needle) l = all.filter((x) => x.name.toLowerCase().includes(needle));
    else if (place === "recent") l = all.filter((x) => x.kind === "file").sort((a, b) => b.at - a.at).slice(0, 40);
    else if (place === "starred") l = all.filter((x) => x.starred);
    else l = all.filter((x) => x.parent === folder);
    if (place === "recent" && !needle) return l;
    return [...l].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
  }, [all, needle, place, folder]);
  const current = sel ? byId.get(sel) ?? null : null;
  const roots = all.filter((x) => x.kind === "folder" && !x.parent).sort((a, b) => a.name.localeCompare(b.name));
  const where = needle ? d("results") : place === "recent" ? d("recent") : place === "starred" ? d("starred") : crumbs.at(-1)?.name ?? d("home");

  const go = (f: string, p: Place | "" = "") => {
    setHist((h) => ({ back: [...h.back, `${place}|${folder}`], fwd: [] }));
    setFolder(f);
    setPlace(p || (f ? "" : "home"));
    setSel("");
    setQ("");
  };
  const travel = (dir: -1 | 1) =>
    setHist((h) => {
      const from = dir === -1 ? h.back : h.fwd;
      const to = from.at(-1);
      if (to === undefined) return h;
      const [p, f] = to.split("|");
      setPlace(p as Place | "");
      setFolder(f);
      setSel("");
      const here = `${place}|${folder}`;
      return dir === -1 ? { back: h.back.slice(0, -1), fwd: [...h.fwd, here] } : { back: [...h.back, here], fwd: h.fwd.slice(0, -1) };
    });

  // ── actions ─────────────────────────────────────────────────────────────
  async function upload(files: FileList | File[] | null) {
    const l = [...(files ?? [])];
    if (!l.length) return;
    const into = place ? "" : folder;
    setUploading((n) => n + l.length);
    let ok = 0;
    for (const f of l) {
      try {
        const up = await uploadWorkspaceFile(f, { folderId: into || undefined });
        setItems((cur) => [...(cur ?? []), toFile(up)]);
        ok++;
      } catch {
        say(d("uploadFailed", { name: f.name }), "err");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (ok) say(d("uploaded", { n: ok }));
  }
  async function open(x: Item) {
    if (x.kind === "folder") return go(x.id);
    const tab = preopenTab();
    try {
      showBlob(await getWorkspaceFileBlob(x.id), x.name, tab);
    } catch {
      closeTab(tab);
      say(d("openFailed"), "err");
    }
  }
  async function download(x: Item) {
    try {
      saveBlob(await getWorkspaceFileBlob(x.id), x.name);
    } catch {
      say(d("openFailed"), "err");
    }
  }
  async function star(x: Item) {
    setItems((l) => (l ?? []).map((y) => (y.id === x.id ? { ...y, starred: !x.starred } : y)));
    try {
      if (x.kind === "folder") await updateFolder(x.id, { starred: !x.starred });
      else await updateFile(x.id, { starred: !x.starred });
    } catch {
      setItems((l) => (l ?? []).map((y) => (y.id === x.id ? { ...y, starred: x.starred } : y)));
      say(d("saveFailed"), "err");
    }
  }
  async function move(x: Item, to: string) {
    if (x.id === to || x.parent === to) return;
    // A folder never moves into itself or below itself.
    for (let c = to ? byId.get(to) : undefined; c; c = c.parent ? byId.get(c.parent) : undefined) if (c.id === x.id) return;
    setItems((l) => (l ?? []).map((y) => (y.id === x.id ? { ...y, parent: to } : y)));
    try {
      if (x.kind === "folder") await updateFolder(x.id, { parent_id: to || null });
      else await updateFile(x.id, { folder_id: to || null });
      say(d("moved", { name: x.name }));
    } catch {
      setItems((l) => (l ?? []).map((y) => (y.id === x.id ? { ...y, parent: x.parent } : y)));
      say(d("saveFailed"), "err");
    }
  }
  async function remove(x: Item) {
    const ok = await confirm({ title: d("deleteTitle"), text: x.kind === "folder" ? d("deleteFolderText", { name: x.name }) : d("deleteFileText", { name: x.name }), ok: d("delete"), cancel: d("cancel"), danger: true });
    if (!ok) return;
    try {
      if (x.kind === "folder") await deleteFolder(x.id);
      else await deleteFile(x.id);
      setSel("");
      if (x.kind === "folder") void reload();
      else setItems((l) => (l ?? []).filter((y) => y.id !== x.id));
      say(d("deleted", { name: x.name }));
    } catch {
      say(d("deleteFailed"), "err");
    }
  }
  async function submitAsk() {
    if (!ask) return;
    const v = ask.value.trim();
    try {
      if (ask.kind === "new" && v) {
        const f = await createFolder({ name: v, parent_id: place ? undefined : folder || undefined });
        setItems((l) => [...(l ?? []), toFolder(f)]);
        setSel(f.id);
      } else if (ask.kind === "rename" && ask.item && v && v !== ask.item.name) {
        const x = ask.item;
        if (x.kind === "folder") await updateFolder(x.id, { name: v });
        else await updateFile(x.id, { file_name: v });
        setItems((l) => (l ?? []).map((y) => (y.id === x.id ? { ...y, name: v } : y)));
      } else if (ask.kind === "move" && ask.item) {
        await move(ask.item, ask.value);
      }
      setAsk(null);
    } catch {
      say(d("saveFailed"), "err");
    }
  }

  const itemMenu = (e: MouseEvent, x: Item) =>
    menu?.(e, x.name, [
      { id: "open", label: d("open"), icon: x.kind === "folder" ? <IconFolder /> : <IconEye />, hint: "Enter", onSelect: () => void open(x) },
      ...(x.kind === "file" ? [{ id: "dl", label: d("download"), icon: <IconDownload />, onSelect: () => void download(x) }] : []),
      { sep: true, id: "s1" },
      { id: "star", label: x.starred ? d("unstar") : d("star"), icon: <IconStarRate />, onSelect: () => void star(x) },
      { id: "ren", label: d("rename"), icon: <IconEdit />, hint: "F2", onSelect: () => setAsk({ kind: "rename", item: x, value: x.name }) },
      { id: "mv", label: d("moveTo"), icon: <IconFolder />, onSelect: () => setAsk({ kind: "move", item: x, value: x.parent }) },
      { sep: true, id: "s2" },
      { id: "del", label: d("delete"), icon: <IconTrash />, danger: true, hint: "Del", onSelect: () => void remove(x) },
    ]);
  const bgMenu = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-item]")) return;
    e.preventDefault();
    menu?.(e, where, [
      { id: "nf", label: d("newFolder"), icon: <IconFolderPlus />, disabled: !!place, onSelect: () => setAsk({ kind: "new", value: "" }) },
      { id: "up", label: d("upload"), icon: <IconUpload />, onSelect: () => pick.current?.click() },
      { sep: true, id: "s" },
      { id: "vi", label: d("viewIcons"), checked: view === "icons", onSelect: () => setView("icons") },
      { id: "vl", label: d("viewList"), checked: view === "list", onSelect: () => setView("list") },
      { id: "pv", label: d("previewPane"), checked: preview, onSelect: () => setPreview((v) => !v) },
    ]);
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input,textarea") || !current) return;
    if (e.key === "Delete") void remove(current);
    else if (e.key === "F2") setAsk({ kind: "rename", item: current, value: current.name });
    else if (e.key === "Enter") void open(current);
    else if (e.key === "Backspace" && folder) go(crumbs.at(-2)?.id ?? "");
  };
  const dragProps = (x: Item) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      drag.current = x.id;
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: x.kind === "folder" ? (e: DragEvent) => (drag.current || e.dataTransfer.types.includes("Files")) && (e.preventDefault(), e.stopPropagation()) : undefined,
    onDrop:
      x.kind === "folder"
        ? (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const m = drag.current && byId.get(drag.current);
            drag.current = "";
            if (m) void move(m, x.id);
          }
        : undefined,
  });

  const icon = (x: Item, big = false) => <FileIcon kind={kindOf(x)} ext={x.ext} big={big} />;
  const quotaPct = quota && quota.quotaBytes ? (quota.usedBytes / quota.quotaBytes) * 100 : 0;
  const storage = quota ? (
    <div className="dxf-quota">
      <span>{d("storage", { used: size(quota.usedBytes), total: size(quota.quotaBytes) })}</span>
      <Progress value={quotaPct} label={d("storageLabel")} />
    </div>
  ) : null;

  const side = (
    <aside className="dx-side dxf-side" aria-label={t("title")}>
      <div className="dx-side__drag" aria-hidden />
      <nav className="dx-side__nav">
        <div className="dx-side__sec">
          {os === "mac" ? <p className="dx-side__t">{d("favorites")}</p> : null}
          {(
            [
              ["home", <IconHome key="h" />, d("home")],
              ["recent", <IconClock key="r" />, d("recent")],
              ["starred", <IconStarRate key="s" />, d("starred")],
            ] as const
          ).map(([p, ic, label]) => (
            <button key={p} type="button" className={`dx-side__i${place === p && !needle ? " is-on" : ""}`} onClick={() => go("", p)}>
              <span className="dx-side__ic">{ic}</span>
              <span className="dx-side__l">{label}</span>
            </button>
          ))}
        </div>
        <div className="dx-side__sec">
          <p className="dx-side__t">{os === "mac" ? d("locations") : d("folders")}</p>
          {roots.map((f) => (
            <button key={f.id} type="button" className={`dx-side__i${!place && (folder === f.id || crumbs[0]?.id === f.id) && !needle ? " is-on" : ""}`} onClick={() => go(f.id)} onContextMenu={(e) => (e.preventDefault(), itemMenu(e, f))} {...dragProps(f)}>
              <span className="dx-side__ic">
                <IconFolder />
              </span>
              <span className="dx-side__l">{f.name}</span>
            </button>
          ))}
          {!roots.length && items ? <p className="dxf-none">{d("noFolders")}</p> : null}
        </div>
      </nav>
      <div className="dx-side__foot">{storage}</div>
    </aside>
  );

  const path =
    os === "win" ? (
      <div className="dxf-addr">
        <button type="button" onClick={() => go("", "home")}>
          <IconHome aria-hidden />
        </button>
        <IconChevronRight className="dxf-addr__sep" aria-hidden />
        {needle || place === "recent" || place === "starred" ? (
          <span className="dxf-addr__c is-last">{where}</span>
        ) : (
          <>
            <button type="button" className={`dxf-addr__c${!crumbs.length ? " is-last" : ""}`} onClick={() => go("", "home")}>
              {d("home")}
            </button>
            {crumbs.map((c, i) => (
              <span key={c.id} className="dxf-addr__seg">
                <IconChevronRight className="dxf-addr__sep" aria-hidden />
                <button type="button" className={`dxf-addr__c${i === crumbs.length - 1 ? " is-last" : ""}`} onClick={() => go(c.id)}>
                  {c.name}
                </button>
              </span>
            ))}
          </>
        )}
      </div>
    ) : null;

  let body;
  if (items === null) body = failed ? <Empty icon={<IconAlert />} title={t("loadError")} /> : <Loading label={d("loading")} />;
  else if (!list.length) body = <Empty icon={<IconFolder />} title={needle ? d("noResults") : place === "starred" ? d("noStarred") : d("empty")} text={needle || place ? undefined : d("emptyHint")} action={needle || place ? undefined : <Btn kind="primary" icon={<IconUpload />} onClick={() => pick.current?.click()}>{d("upload")}</Btn>} />;
  else if (view === "icons")
    body = (
      <div className="dxf-grid" role="listbox" aria-label={where}>
        {list.map((x) => (
          <button key={x.id} type="button" data-item role="option" aria-selected={sel === x.id} className={`dxf-cell${sel === x.id ? " is-on" : ""}`} onClick={() => setSel(x.id)} onDoubleClick={() => void open(x)} onContextMenu={(e) => (e.preventDefault(), setSel(x.id), itemMenu(e, x))} {...dragProps(x)}>
            {icon(x, true)}
            <span className="dxf-cell__n">{x.name}</span>
            {x.starred ? <IconStarRate className="dxf-star" aria-hidden /> : null}
          </button>
        ))}
      </div>
    );
  else
    body = (
      <div className="dxf-table">
        <div className="dxf-tr dxf-th">
          <span>{d("name")}</span>
          <span>{d("modified")}</span>
          <span>{d("kind")}</span>
          <span className="is-end">{d("size")}</span>
        </div>
        <div className="dxf-tb" role="listbox" aria-label={where}>
          {list.map((x) => (
            <div key={x.id} data-item role="option" tabIndex={sel === x.id ? 0 : -1} aria-selected={sel === x.id} className={`dxf-tr${sel === x.id ? " is-on" : ""}`} onClick={() => setSel(x.id)} onDoubleClick={() => void open(x)} onContextMenu={(e) => (e.preventDefault(), setSel(x.id), itemMenu(e, x))} {...dragProps(x)}>
              <span className="dxf-name">
                {icon(x)}
                <b>{x.name}</b>
                {x.starred ? <IconStarRate className="dxf-star" aria-hidden /> : null}
              </span>
              <span>{x.at ? dateOnly(new Date(x.at).toISOString(), locale) : "—"}</span>
              <span>{d(`kinds.${kindOf(x)}`)}</span>
              <span className="is-end">{x.kind === "folder" ? d("items", { n: x.count }) : size(x.size)}</span>
            </div>
          ))}
        </div>
      </div>
    );

  const pane =
    preview && current ? (
      <Preview x={current} onOpen={() => void open(current)} onDownload={() => void download(current)} onStar={() => void star(current)} onRename={() => setAsk({ kind: "rename", item: current, value: current.name })} onDelete={() => void remove(current)} kindName={d(`kinds.${kindOf(current)}`)} sizeText={current.kind === "folder" ? d("items", { n: current.count }) : size(current.size)} icon={icon(current, true)} />
    ) : undefined;

  const folderOptions = [{ value: "", label: d("home") }, ...all.filter((x) => x.kind === "folder" && x.id !== ask?.item?.id).map((f) => ({ value: f.id, label: pathOf(f, byId) }))];

  return (
    <App name="files" sidebar={side} inspector={pane}>
      <Toolbar
        title={where}
        back={{ label: d("back"), onClick: () => travel(-1), disabled: !hist.back.length }}
        forward={{ label: d("forward"), onClick: () => travel(1), disabled: !hist.fwd.length }}
        end={<Search value={q} onChange={setQ} placeholder={os === "win" ? d("search", { where }) : d("searchShort")} />}
      >
        <Tool icon={<IconFolderPlus />} label={d("newFolder")} onClick={() => setAsk({ kind: "new", value: "" })} disabled={!!place || !!needle} />
        <Tool icon={<IconUpload />} label={d("upload")} onClick={() => pick.current?.click()} />
        {os === "win" ? (
          <>
            <span className="dx-sep" aria-hidden />
            <Tool icon={<IconEdit />} label={d("rename")} disabled={!current} onClick={() => current && setAsk({ kind: "rename", item: current, value: current.name })} />
            <Tool icon={<IconStarRate />} label={current?.starred ? d("unstar") : d("star")} disabled={!current} onClick={() => current && void star(current)} />
            <Tool icon={<IconTrash />} label={d("delete")} disabled={!current} onClick={() => current && void remove(current)} />
            <span className="dx-sep" aria-hidden />
          </>
        ) : null}
        <Seg
          label={d("view")}
          small
          value={view}
          onChange={setView}
          items={[
            { id: "icons", label: os === "mac" ? "" : d("viewIcons"), icon: <IconGrid /> },
            { id: "list", label: os === "mac" ? "" : d("viewList"), icon: <IconList /> },
          ]}
        />
        <Tool icon={<IconEye />} label={d("previewPane")} active={preview} onClick={() => setPreview((v) => !v)} />
      </Toolbar>
      {path}
      <div
        className={`dxf-body${dropping ? " is-drop" : ""}`}
        tabIndex={-1}
        onKeyDown={onKey}
        onContextMenu={bgMenu}
        onClick={(e) => !(e.target as HTMLElement).closest("[data-item]") && setSel("")}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
        onDrop={(e) => {
          setDropping(false);
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          void upload(e.dataTransfer.files);
        }}
      >
        {body}
        {dropping ? (
          <div className="dxf-dropnote">
            <IconUpload aria-hidden />
            {d("dropHere", { where })}
          </div>
        ) : null}
      </div>
      <footer className="dxf-status">
        {os === "mac" && crumbs.length && !place ? (
          <span className="dxf-pathbar">
            <button type="button" onClick={() => go("", "home")}>
              <IconHome aria-hidden />
              {d("home")}
            </button>
            {crumbs.map((c) => (
              <span key={c.id}>
                <IconChevronRight aria-hidden />
                <button type="button" onClick={() => go(c.id)}>
                  <IconFolder aria-hidden />
                  {c.name}
                </button>
              </span>
            ))}
          </span>
        ) : (
          <span>{d("count", { n: list.length })}</span>
        )}
        {uploading ? <span className="dxf-up">{d("uploading", { n: uploading })}</span> : current ? <span>{d("selected", { name: current.name })}</span> : null}
        {os === "mac" && quota ? <span className="dxf-free">{d("free", { size: size(Math.max(0, quota.quotaBytes - quota.usedBytes)) })}</span> : null}
      </footer>
      <input ref={pick} type="file" multiple hidden onChange={(e) => (void upload(e.target.files), (e.target.value = ""))} />
      <Dialog
        open={!!ask}
        title={ask?.kind === "new" ? d("newFolder") : ask?.kind === "rename" ? d("rename") : d("moveTo")}
        onClose={() => setAsk(null)}
        onSubmit={() => void submitAsk()}
        width={420}
        actions={
          <>
            <Btn onClick={() => setAsk(null)}>{d("cancel")}</Btn>
            <Btn kind="primary" type="submit" disabled={ask?.kind !== "move" && !ask?.value.trim()}>
              {ask?.kind === "new" ? d("create") : ask?.kind === "rename" ? d("rename") : d("move")}
            </Btn>
          </>
        }
      >
        {ask?.kind === "move" ? (
          <Field label={d("moveInto", { name: ask.item?.name ?? "" })}>
            <Select ariaLabel={d("moveTo")} value={ask.value} onChange={(v) => setAsk({ ...ask, value: v })} options={folderOptions} />
          </Field>
        ) : (
          <Field label={d("name")}>
            <Input value={ask?.value ?? ""} onChange={(v) => ask && setAsk({ ...ask, value: v })} placeholder={ask?.kind === "new" ? d("folderPh") : ""} maxLength={200} autoFocus />
          </Field>
        )}
      </Dialog>
      {confirmNode}
      {toast}
    </App>
  );
}

const pathOf = (f: Item, byId: Map<string, Item>) => {
  const names: string[] = [];
  for (let c: Item | undefined = f; c; c = c.parent ? byId.get(c.parent) : undefined) names.unshift(c.name);
  return names.join(" / ");
};

// A file's icon: a folder, or a page with its kind's colour and extension.
function FileIcon({ kind, ext, big }: { kind: string; ext: string; big?: boolean }) {
  if (kind === "folder")
    return (
      <span className={`dxf-ic dxf-ic--folder${big ? " is-big" : ""}`} aria-hidden>
        <i />
      </span>
    );
  return (
    <span className={`dxf-ic dxf-ic--file dxf-ic--${kind}${big ? " is-big" : ""}`} aria-hidden>
      {kind === "image" ? <IconImage /> : <IconFileText />}
      {big && ext ? <em>{ext.slice(0, 4).toUpperCase()}</em> : null}
    </span>
  );
}

// The preview pane (the Mac's Quick Look / Windows' details pane): a picture
// or a PDF shown as it is, everything else as its icon, the details, and
// what can be done with it.
function Preview({ x, icon, kindName, sizeText, onOpen, onDownload, onStar, onRename, onDelete }: { x: Item; icon: ReactNode; kindName: string; sizeText: string; onOpen: () => void; onDownload: () => void; onStar: () => void; onRename: () => void; onDelete: () => void }) {
  const d = useTranslations("portal.desk.files");
  const locale = useLocale();
  const [url, setUrl] = useState<{ id: string; src: string } | null>(null);
  const showable = x.kind === "file" && (kindOf(x) === "image" || kindOf(x) === "pdf") && x.size < 15 * 1048576;
  useEffect(() => {
    if (!showable) return;
    let alive = true;
    let made = "";
    getWorkspaceFileBlob(x.id)
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(kindOf(x) === "pdf" ? new Blob([b], { type: "application/pdf" }) : b);
        setUrl({ id: x.id, src: made });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [x, showable]);
  const src = url?.id === x.id ? url.src : "";
  return (
    <aside className="dxf-pv" aria-label={d("previewPane")}>
      <div className="dxf-pv__img">
        {!src ? (
          icon
        ) : kindOf(x) === "pdf" ? (
          <iframe src={src} title={x.name} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob, nothing to optimise
          <img src={src} alt={x.name} />
        )}
      </div>
      <b className="dxf-pv__n">{x.name}</b>
      <small>
        {kindName} · {sizeText}
      </small>
      <dl>
        <div>
          <dt>{d("modified")}</dt>
          <dd>{x.at ? dateOnly(new Date(x.at).toISOString(), locale) : "—"}</dd>
        </div>
        <div>
          <dt>{d("kind")}</dt>
          <dd>{x.kind === "folder" ? kindName : x.mime || kindName}</dd>
        </div>
        <div>
          <dt>{d("starred")}</dt>
          <dd>{x.starred ? d("yes") : d("no")}</dd>
        </div>
      </dl>
      <div className="dxf-pv__acts">
        <Btn kind="primary" onClick={onOpen}>
          {d("open")}
        </Btn>
        {x.kind === "file" ? <Btn icon={<IconDownload />} title={d("download")} onClick={onDownload} /> : null}
        <Btn icon={<IconStarRate />} title={x.starred ? d("unstar") : d("star")} onClick={onStar} />
        <Btn icon={<IconEdit />} title={d("rename")} onClick={onRename} />
        <Btn icon={<IconTrash />} title={d("delete")} onClick={onDelete} />
      </div>
    </aside>
  );
}
