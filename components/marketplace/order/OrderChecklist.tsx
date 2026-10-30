"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxButton } from "@/components/admin/studio/sx/Button";
import CopilotLauncher from "@/components/copilot/CopilotLauncher";
import { SxProgress } from "@/components/admin/studio/sx/shared/Progress";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { ChoiceCards, type ChoiceCard } from "@/components/admin/studio/sx/form/ChoiceCards";
import type { SxIcon } from "@/components/admin/studio/sx/types";
import { aiId } from "@/lib/ai/ids";
import { shortDateTime } from "@/lib/date";
import { saveBlob } from "@/lib/download";
import { getSecureMessageFileAt } from "@/lib/services/backend";
import type { MarketOrder, MarketPhase } from "@/lib/services/marketplace";
import { checklistItemRef, checklistStatusOf, clientChecklistItem, marketErrorInfo, updateChecklistItem, uploadChecklistEvidence, type ChecklistItem, type ChecklistStatus, type MarketFileRef, type OrderChecklist as OrderChecklistData } from "@/lib/services/marketRuntime";
import { useMarketError } from "../useMarketError";
import { canEditChecklist, draftOf, evidenceOf, itemProblems, mergeChecklistItem, sortedItems, type ItemDraft } from "./checklistRules";
import { ForwardIcon, CheckIcon, EyeIcon, EyeOffIcon, CircleCheckIcon, CircleDashedIcon, DownloadIcon, FileTextIcon, ImageIcon, ImagePlusIcon, MessageSquareTextIcon, PaperclipIcon, PencilIcon, CircleAlertIcon, XIcon, glyph } from "./icons";
import { SECTION_ID, type LoadState, type OrderView } from "./types";
import { ORDER_FILE_MB, ORDER_FILES_MAX, uploadOrderFile, type UploadedFile } from "./upload";
import "./checklist.css";
import { useGuardedField } from "@/components/ui/ContactGuardNote";

const COMMENT_MAX = 1000;

const STATUS_ICON: Readonly<Record<ChecklistStatus, SxIcon>> = {
  pending: CircleDashedIcon,
  done: CircleCheckIcon,
  skipped_with_reason: ForwardIcon,
};

const STATUS_TONE: Readonly<Record<ChecklistStatus, string>> = {
  pending: "draft",
  done: "published",
  skipped_with_reason: "submitted",
};

const MARK_ICON: Readonly<Record<string, SxIcon>> = {
  required: CircleAlertIcon,
  comment: MessageSquareTextIcon,
  image: ImageIcon,
  file: PaperclipIcon,
};

type Kind = "image" | "file";
type Add = { key: string; file: File; kind: Kind; preview: string; state: "wait" | "up" | "done" | "fail"; uploaded: UploadedFile | null };
type Errs = { status?: string; comment?: string; file?: string; image?: string };

function itemSig(i: ChecklistItem): string {
  return `${i.status}:${i.updatedAt}:${i.comment.length}:${i.files.length}:${(i.images ?? []).length}:${i.title}`;
}

function signatureOf(items: readonly ChecklistItem[] | null): string {
  if (!items) return "";
  return items.map((i) => `${i.id}:${itemSig(i)}`).join("|");
}

function sigMap(items: readonly ChecklistItem[] | null): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const i of items ?? []) if (i.id) out[i.id] = itemSig(i);
  return out;
}

// How long a just-changed item stays highlighted for the client.
const FRESH_MS = 6000;

// Whether the client sees a piece of evidence, shown to the performer
// beside it; nothing when the item does not say.
function ClientSees({ shown }: { shown: boolean | undefined }) {
  const t = useTranslations("marketplace.orderDetail.checklist");
  if (shown === undefined) return null;
  return (
    <span className="mck-sees" data-shown={shown ? "" : undefined}>
      {glyph(shown ? EyeIcon : EyeOffIcon, { size: 13 })}
      {t(shown ? "seesYes" : "seesNo")}
    </span>
  );
}

function editBtnId(item: ChecklistItem): string {
  return `mck-${item.id}-edit`;
}

function focusById(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.focus();
}

function fieldOf(key: string): keyof Errs | "" {
  const k = key.toLowerCase();
  if (/comment|reason|note/.test(k)) return "comment";
  if (/image|photo/.test(k)) return "image";
  if (/file/.test(k)) return "file";
  if (/status/.test(k)) return "status";
  return "";
}

function isImageFile(f: File): boolean {
  return /^image\//i.test(f.type) || /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(f.name);
}

function previewOf(f: File): string {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
  try {
    return URL.createObjectURL(f);
  } catch {
    return "";
  }
}

function dropPreview(url: string) {
  if (!url || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try {
    URL.revokeObjectURL(url);
  } catch {}
}

export default function OrderChecklist({
  o,
  phase,
  view,
  aiBase,
  checklist,
  state,
  onChange,
  onRetry,
}: {
  o: MarketOrder;
  phase: MarketPhase;
  view: OrderView;
  aiBase: string;
  checklist: OrderChecklistData | null;
  state: LoadState;
  onChange: (next: OrderChecklistData) => void;
  onRetry: () => void;
}): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail");
  const tc = useTranslations("copilot");
  const [openId, setOpenId] = useState("");
  const [live, setLive] = useState("");
  // The client sees only the client wording and the evidence the service
  // lets them see, live as the performer works.
  const seen = checklist ? (view === "client" ? checklist.items.map(clientChecklistItem) : checklist.items) : null;
  const sig = signatureOf(seen);
  const [prevSig, setPrevSig] = useState(sig);
  const [prevMap, setPrevMap] = useState(() => sigMap(seen));
  const [fresh, setFresh] = useState<readonly string[]>([]);
  if (sig !== prevSig) {
    const now = sigMap(seen);
    const changed = Object.keys(now).filter((k) => prevMap[k] !== undefined && prevMap[k] !== now[k]);
    setPrevSig(sig);
    setPrevMap(now);
    if (view === "client" && prevSig && sig) {
      setLive(t("checklist.live"));
      if (changed.length) setFresh(changed);
    }
  }
  useEffect(() => {
    if (!fresh.length) return;
    const tm = window.setTimeout(() => setFresh([]), FRESH_MS);
    return () => window.clearTimeout(tm);
  }, [fresh]);

  if (state === "none" || state === "idle") return null;
  const items = seen ? sortedItems(seen) : [];
  const loading = state === "loading" && !checklist;
  const failed = state === "error" && !checklist;
  if (!loading && !failed && !items.length && (view === "client" || phase !== "in_progress")) return null;

  const editable = canEditChecklist(view, phase);
  const progress = checklist?.progress;

  function saved(next: OrderChecklistData, item: ChecklistItem) {
    onChange(next);
    setLive(t("checklist.saved", { title: item.title || "—" }));
    setOpenId("");
    focusById(editBtnId(item));
  }

  function cancel(item: ChecklistItem) {
    setOpenId("");
    focusById(editBtnId(item));
  }

  let body: ReactElement;
  if (loading) {
    body = (
      <div className="mck-sk">
        <span className="sx-sk" aria-hidden="true" />
        <span className="sx-sk" aria-hidden="true" />
        <span className="sx-vh" role="status">
          {t("checklist.loading")}
        </span>
      </div>
    );
  } else if (failed) {
    body = (
      <SxNote
        tone="error"
        role="note"
        action={
          <SxButton size="sm" variant="secondary" onClick={onRetry} aiId={`${aiBase}.checklist.retry`}>
            {t("retry")}
          </SxButton>
        }
      >
        {t("checklist.error")}
      </SxNote>
    );
  } else if (!items.length) {
    body = (
      <SxNote tone="info" role="note">
        {t("checklist.empty")}
      </SxNote>
    );
  } else {
    body = (
      <>
        {progress ? (
          <div className="mck-progress">
            <SxProgress value={progress.percent} label={t("checklist.progressLabel")} size="md" />
            <p className="mck-progress__text">
              <span className="sx-num">{t("checklist.progress", { done: progress.done, total: progress.total })}</span>
              {progress.requiredTotal > 0 ? <span className="sx-num">{t("checklist.progressRequired", { done: progress.requiredDone, total: progress.requiredTotal })}</span> : null}
            </p>
          </div>
        ) : null}
        {phase === "review" ? (
          <SxNote tone="info" role="note" className="mck-note">
            {t("checklist.paused")}
          </SxNote>
        ) : phase === "completed" || phase === "rated" ? (
          <SxNote tone="info" role="note" className="mck-note">
            {t("checklist.locked")}
          </SxNote>
        ) : null}
        <ol className="mck-list">
          {items.map((item, i) => (
            <ChecklistRow
              key={item.id || `${item.title}-${i}`}
              o={o}
              item={item}
              itemAi={aiId(`${aiBase}.checklist.item`, item.id || String(i + 1))}
              editable={editable && !!item.id}
              open={openId === item.id && !!item.id}
              onToggle={() => setOpenId((cur) => (cur === item.id ? "" : item.id))}
              checklist={checklist}
              onSaved={(next) => saved(next, item)}
              onCancel={() => cancel(item)}
              seller={view === "seller"}
              fresh={fresh.includes(item.id)}
            />
          ))}
        </ol>
      </>
    );
  }

  return (
    <div id={SECTION_ID.checklist} className="mck" tabIndex={-1}>
      <SxPanel
        title={t("checklist.title")}
        lead={editable ? t("checklist.leadSeller") : view === "client" ? t("checklist.leadClient") : undefined}
        actions={
          view === "seller" && items.length > 0 && phase !== "cancelled" ? (
            <CopilotLauncher
              surface="lawyer_checklist"
              entity={{ type: "service_order", id: o.id, title: [o.workId ? `#${o.workId}` : "", o.serviceTitle || o.packageTitle].filter(Boolean).join(" · ") }}
              context={{ work_id: o.workId || undefined, phase }}
              prompt={tc("prompt.completionCheck")}
              label={tc("place.checkReady")}
              aiId={`${aiBase}.checklist.copilot`}
            />
          ) : undefined
        }
        aiId={`${aiBase}.checklist`}
        className="mck-panel"
      >
        <p className="sx-vh" role="status" aria-live="polite">
          {live}
        </p>
        {body}
      </SxPanel>
    </div>
  );
}

function ChecklistRow({
  o,
  item,
  itemAi,
  editable,
  open,
  onToggle,
  checklist,
  onSaved,
  onCancel,
  seller,
  fresh,
}: {
  o: MarketOrder;
  item: ChecklistItem;
  itemAi: string;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  checklist: OrderChecklistData | null;
  onSaved: (next: OrderChecklistData) => void;
  onCancel: () => void;
  seller: boolean;
  fresh: boolean;
}) {
  const t = useTranslations("marketplace.orderDetail.checklist");
  const locale = useLocale();
  const editorId = `mck-${item.id}-editor`;
  const vis = seller ? item.showToClient : null;
  const clientName = seller && item.clientTitle && item.clientTitle !== item.title ? item.clientTitle : "";
  const title = item.title || "—";
  const skipped = item.status === "skipped_with_reason";
  const images = item.images ?? [];
  const marks = [item.required ? "required" : "", item.commentRequired ? "comment" : "", item.imageRequired ? "image" : "", item.fileRequired ? "file" : ""].filter(Boolean);
  return (
    <li id={`mck-${item.id}`} className="mck-item" data-status={item.status} data-open={open ? "" : undefined} data-fresh={fresh ? "" : undefined} data-ai-id={itemAi} data-ai-type="list_item" data-ai-label={title}>
      <div className="mck-item__head">
        <span className="mck-dot" data-tone={STATUS_TONE[item.status]} aria-hidden="true">
          {glyph(STATUS_ICON[item.status], { size: 18 })}
        </span>
        <div className="mck-item__titles">
          <h3 className="mck-item__title">{title}</h3>
          {clientName ? (
            <p className="mck-item__client">
              {glyph(EyeIcon, { size: 13 })}
              <span>{t("clientSees", { title: clientName })}</span>
            </p>
          ) : null}
          {item.description ? <p className="mck-item__desc">{item.description}</p> : null}
          <div className="mck-item__tags">
            <span className="mck-status" data-tone={STATUS_TONE[item.status]}>
              {t(`status.${item.status}`)}
            </span>
            {fresh ? (
              <span className="mck-fresh" role="status">
                {t("fresh")}
              </span>
            ) : null}
            {marks.length ? (
              <ul className="mck-marks">
                {marks.map((m) => (
                  <li key={m} className="mck-mark" data-mark={m} data-tone={m === "required" ? "approved" : "draft"}>
                    {glyph(MARK_ICON[m], { size: 13 })}
                    {t(`mark.${m}`)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {editable ? (
          <SxButton
            id={editBtnId(item)}
            size="sm"
            variant={item.status === "pending" && !open ? "primary" : "ghost"}
            icon={item.status === "pending" ? CheckIcon : PencilIcon}
            aria-label={t("editAria", { title })}
            aria-expanded={open}
            aria-controls={open ? editorId : undefined}
            onClick={onToggle}
            aiId={`${itemAi}.edit`}
            aiLabel={t("edit")}
            className="mck-item__edit"
          >
            {item.status === "pending" ? t("act") : t("edit")}
          </SxButton>
        ) : null}
      </div>
      {item.comment.trim() ? (
        <p className="mck-item__comment">
          {skipped ? <b>{t("reasonPrefix")}: </b> : null}
          {item.comment}
          {vis ? <ClientSees shown={vis.comment} /> : null}
        </p>
      ) : null}
      {images.length && vis ? <ClientSees shown={vis.images} /> : null}
      {images.length ? (
        <ul className="mck-thumbs" aria-label={t("images")}>
          {images.map((f, i) => (
            <ItemImage key={`${f.id || f.url}-${i}`} f={f} />
          ))}
        </ul>
      ) : null}
      {item.files.length && vis ? <ClientSees shown={vis.files} /> : null}
      {item.files.length ? (
        <ul className="mck-files">
          {item.files.map((f, i) => (
            <ItemFile key={`${f.id || f.url}-${i}`} f={f} />
          ))}
        </ul>
      ) : null}
      {item.updatedAt ? <p className="mck-item__meta">{t("updatedAt", { date: shortDateTime(item.updatedAt, locale) })}</p> : null}
      {open && checklist ? <ItemEditor id={editorId} o={o} item={item} itemAi={itemAi} checklist={checklist} onSaved={onSaved} onCancel={onCancel} /> : null}
    </li>
  );
}

function ItemFile({ f }: { f: MarketFileRef }) {
  const t = useTranslations("marketplace.orderExtras");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const name = f.name || t("result.file");
  async function get() {
    if (busy || !f.url) return;
    setBusy(true);
    setErr(false);
    try {
      saveBlob(await getSecureMessageFileAt(f.url), name);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li>
      {glyph(FileTextIcon, { size: 16 })}
      <span>{name}</span>
      {f.url ? (
        <SxButton size="sm" variant="ghost" icon={DownloadIcon} busy={busy} onClick={() => void get()} aria-label={`${busy ? t("result.downloading") : err ? t("result.retry") : t("result.download")}: ${name}`}>
          {busy ? t("result.downloading") : err ? t("result.retry") : t("result.download")}
        </SxButton>
      ) : null}
    </li>
  );
}

function ItemImage({ f }: { f: MarketFileRef }) {
  const t = useTranslations("marketplace.orderDetail.checklist");
  const name = f.name || t("imageFallback");
  const [shown, setShown] = useState<{ url: string; src: string } | null>(null);
  const src = shown && shown.url === f.url ? shown.src : "";
  useEffect(() => {
    if (!f.url) return;
    let alive = true;
    let made = "";
    getSecureMessageFileAt(f.url).then(
      (blob) => {
        if (!alive) return;
        made = typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : "";
        setShown({ url: f.url, src: made });
      },
      () => {
        if (alive) setShown({ url: f.url, src: "" });
      },
    );
    return () => {
      alive = false;
      dropPreview(made);
    };
  }, [f.url]);
  async function get() {
    if (!f.url) return;
    try {
      saveBlob(await getSecureMessageFileAt(f.url), name);
    } catch {}
  }
  return (
    <li className="mck-thumb">
      {f.url ? (
        <button type="button" className="mck-thumb__btn" onClick={() => void get()} aria-label={t("imageDownload", { name })}>
          {src ? <img src={src} alt="" /> : glyph(ImageIcon, { size: 20 })}
        </button>
      ) : (
        <span className="mck-thumb__btn" role="img" aria-label={name}>
          {glyph(ImageIcon, { size: 20 })}
        </span>
      )}
      <span className="mck-thumb__name">{name}</span>
    </li>
  );
}

function ItemEditor({
  id,
  o,
  item,
  itemAi,
  checklist,
  onSaved,
  onCancel,
}: {
  id: string;
  o: MarketOrder;
  item: ChecklistItem;
  itemAi: string;
  checklist: OrderChecklistData;
  onSaved: (next: OrderChecklistData) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("marketplace.orderDetail.checklist");
  const tc = useTranslations("marketplace.complete");
  const marketErr = useMarketError();
  const base = `mck-${item.id}`;
  const statusId = `${base}-status`;
  const commentId = `${base}-comment`;
  const noteId = `${base}-note`;
  const [draft, setDraft] = useState<ItemDraft>(() => (item.status === "pending" ? { ...draftOf(item), status: "done" } : draftOf(item)));
  const commentGuard = useGuardedField(draft.comment, (v) => setDraft((d) => ({ ...d, comment: v.slice(0, COMMENT_MAX) })), "client");
  const [adds, setAdds] = useState<Add[]>([]);
  const [errs, setErrs] = useState<Errs>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const addsRef = useRef<Add[]>([]);

  useEffect(() => {
    addsRef.current = adds;
  });
  useEffect(
    () => () => {
      for (const a of addsRef.current) dropPreview(a.preview);
    },
    [],
  );

  const upload = checklist.fileUpload ?? null;
  const ev = evidenceOf(item);
  const done = draft.status === "done";
  const skip = draft.status === "skipped_with_reason";
  const showComment = skip || ev.comment || draft.comment.trim().length > 0 || !!errs.comment;
  const commentNeeded = skip || (done && item.commentRequired);
  const commentLabel = skip ? t("reason") : done && item.commentRequired ? t("commentRequired") : t("comment");
  const maxMb = upload && upload.maxBytes > 0 ? Math.max(1, Math.round(upload.maxBytes / (1024 * 1024))) : ORDER_FILE_MB;
  const maxBytes = upload && upload.maxBytes > 0 ? upload.maxBytes : ORDER_FILE_MB * 1024 * 1024;
  const canUpload = !!upload || !!o.roomId;
  const imageAdds = adds.filter((a) => a.kind === "image");
  const fileAdds = adds.filter((a) => a.kind === "file");

  const skippable = item.skipAllowed || item.status === "skipped_with_reason";
  const options: ChoiceCard[] = [
    { value: "done", title: t("opt.done"), icon: CircleCheckIcon },
    ...(skippable ? [{ value: "skipped_with_reason", title: t("opt.skip"), icon: ForwardIcon }] : []),
    { value: "pending", title: t("opt.pending"), icon: CircleDashedIcon },
  ];

  function add(kind: Kind, list: FileList | null) {
    if (!list) return;
    const saved = kind === "image" ? (draft.images ?? []).length : draft.files.length;
    const next: Add[] = [];
    let tooBig = false;
    let notImage = false;
    for (const f of Array.from(list)) {
      if (saved + adds.filter((a) => a.kind === kind).length + next.length >= ORDER_FILES_MAX) break;
      if (f.size > maxBytes) {
        tooBig = true;
        continue;
      }
      if (kind === "image" && !isImageFile(f)) {
        notImage = true;
        continue;
      }
      next.push({ key: `${kind}-${f.name}-${f.size}-${f.lastModified}-${adds.length + next.length}`, file: f, kind, preview: kind === "image" ? previewOf(f) : "", state: "wait", uploaded: null });
    }
    setAdds((cur) => [...cur, ...next]);
    const msg = tooBig ? tc("tooBig", { mb: maxMb }) : notImage ? t("imageOnly") : undefined;
    setErrs((e) => ({ ...e, [kind]: msg }));
  }

  function removeAdd(key: string) {
    setAdds((cur) => {
      const hit = cur.find((x) => x.key === key);
      if (hit) dropPreview(hit.preview);
      return cur.filter((x) => x.key !== key);
    });
  }

  function place(found: Errs) {
    setErrs(found);
    setNote("");
    if (found.comment) focusById(commentId);
    else if (found.image) focusById(`${base}-image-attach`);
    else if (found.file) focusById(`${base}-attach`);
    else if (found.status && typeof document !== "undefined") document.querySelector<HTMLInputElement>(`[id="${statusId}"] input`)?.focus();
  }

  async function send(a: Add): Promise<UploadedFile> {
    if (upload) {
      const r = await uploadChecklistEvidence(upload, a.file, tc("caption"));
      return { id: r.id, name: r.name || a.file.name, url: r.url };
    }
    return uploadOrderFile(o.roomId, a.file, tc("caption"));
  }

  async function save() {
    if (busy) return;
    const pending = (kind: Kind) => adds.filter((a) => a.kind === kind).map((a) => a.uploaded ?? { id: "", name: a.file.name, url: "" });
    const planned: ItemDraft = { ...draft, files: [...draft.files, ...pending("file")], images: [...(draft.images ?? []), ...pending("image")] };
    const problems = itemProblems(item, planned);
    if (problems.length) {
      const found: Errs = {};
      if (problems.includes("reason")) found.comment = t("needReason");
      if (problems.includes("comment")) found.comment = t("needComment");
      if (problems.includes("image")) found.image = t("needImage");
      if (problems.includes("file")) found.file = t("needFile");
      if (problems.includes("skip")) found.status = t("noSkipRequired");
      place(found);
      return;
    }
    setBusy(true);
    setErrs({});
    setNote("");
    try {
      const got: Record<Kind, UploadedFile[]> = { image: [], file: [] };
      if (done) {
        for (const a of adds) {
          if (a.uploaded) {
            got[a.kind].push(a.uploaded);
            continue;
          }
          setAdds((cur) => cur.map((x) => (x.key === a.key ? { ...x, state: "up" } : x)));
          try {
            const u = await send(a);
            got[a.kind].push(u);
            setAdds((cur) => cur.map((x) => (x.key === a.key ? { ...x, state: "done", uploaded: u } : x)));
          } catch (e) {
            setAdds((cur) => cur.map((x) => (x.key === a.key ? { ...x, state: "fail" } : x)));
            throw e;
          }
        }
      }
      const files = done ? [...draft.files, ...got.file] : [];
      const images = done ? [...(draft.images ?? []), ...got.image] : [];
      const sendImages = ev.image || images.length > 0 || (item.images ?? []).length > 0;
      const comment = draft.comment.trim();
      const pick = (list: UploadedFile[]) => list.map(({ id: fid, name }) => ({ id: fid, name }));
      const r = await updateChecklistItem(o.id, checklistItemRef(item), { status: draft.status, comment, files: pick(files), images: sendImages ? pick(images) : undefined });
      const local: ChecklistItem = {
        ...item,
        status: draft.status,
        statusRaw: draft.status,
        comment,
        files: files.map((f) => ({ id: f.id, name: f.name, url: f.url })),
        images: images.map((f) => ({ id: f.id, name: f.name, url: f.url })),
        raw: sendImages ? { id: item.id, status: draft.status, comment, files, images } : { id: item.id, status: draft.status, comment, files },
      };
      const next = r.checklist ?? mergeChecklistItem(checklist, r.item ?? local);
      onSaved(next);
    } catch (e) {
      const info = marketErrorInfo(e);
      const msg = marketErr(e, t("saveError"));
      const code = (info?.code ?? "").toLowerCase();
      const found: Errs = {};
      if (/comment|reason/.test(code)) found.comment = skip ? t("needReason") : t("needComment");
      else if (/image|photo/.test(code)) found.image = t("needImage");
      else if (/file/.test(code)) found.file = t("needFile");
      for (const [k, v] of Object.entries(info?.fieldErrors ?? {})) {
        const key = k === "field" ? fieldOf(v) : fieldOf(k);
        if (key && !found[key]) found[key] = k === "field" ? msg : v;
      }
      if (found.comment || found.file || found.image || found.status) place(found);
      else setNote(msg);
    } finally {
      setBusy(false);
    }
  }

  const hint = !canUpload ? t("noRoom") : upload ? t("uploadHint", { mb: maxMb }) : t("filesHint", { mb: maxMb });

  return (
    <div id={id} className="mck-editor">
      <Field id={statusId} as="fieldset" label={t("statusLabel")} error={errs.status}>
        {(a) => (
          <ChoiceCards
            id={statusId}
            value={draft.status}
            onChange={(v) => {
              setDraft((d) => ({ ...d, status: checklistStatusOf(v) }));
              setErrs({});
            }}
            options={options}
            columns={options.length === 3 ? 3 : 2}
            aria-describedby={a["aria-describedby"]}
            aria-invalid={a["aria-invalid"]}
            aiId={`${itemAi}.status`}
          />
        )}
      </Field>
      {showComment ? (
        <Field id={commentId} label={commentLabel} error={errs.comment} labelAside={<ClientSees shown={item.showToClient?.comment} />}>
          {(a) => (
            <TextArea
              {...a}
              aria-required={commentNeeded || undefined}
              value={draft.comment}
              onChange={(v) => {
                commentGuard.change(v);
                if (errs.comment) setErrs((e) => ({ ...e, comment: undefined }));
              }}
              onBlur={commentGuard.blur}
              maxLength={COMMENT_MAX}
              counter
              minRows={2}
              placeholder={skip ? t("reasonPh") : t("commentPh")}
              aiId={`${itemAi}.comment`}
              aiLabel={commentLabel}
            />
          )}
        </Field>
      ) : null}
      {showComment ? (
        commentGuard.note
      ) : null}
      {done && (ev.image || !!errs.image) ? (
        <EvidenceSet
          kind="image"
          base={base}
          itemAi={itemAi}
          label={item.imageRequired ? t("imagesRequired") : t("images")}
          sees={item.showToClient?.images}
          attachLabel={t("attachImage")}
          accept={(upload?.accept ?? []).filter((x) => /^image\//i.test(x)).join(",") || "image/*"}
          saved={draft.images ?? []}
          adds={imageAdds}
          busy={busy}
          canAttach={canUpload && !busy && (draft.images ?? []).length + imageAdds.length < ORDER_FILES_MAX}
          hint={hint}
          error={errs.image}
          onPick={(l) => add("image", l)}
          onRemoveSaved={(i) => setDraft((d) => ({ ...d, images: (d.images ?? []).filter((_, j) => j !== i) }))}
          onRemoveAdd={removeAdd}
        />
      ) : null}
      {done && (ev.file || !!errs.file) ? (
        <EvidenceSet
          kind="file"
          base={base}
          itemAi={itemAi}
          label={item.fileRequired ? t("filesRequired") : t("files")}
          sees={item.showToClient?.files}
          attachLabel={t("attach")}
          accept={(upload?.accept ?? []).join(",")}
          saved={draft.files}
          adds={fileAdds}
          busy={busy}
          canAttach={canUpload && !busy && draft.files.length + fileAdds.length < ORDER_FILES_MAX}
          hint={hint}
          error={errs.file}
          onPick={(l) => add("file", l)}
          onRemoveSaved={(i) => setDraft((d) => ({ ...d, files: d.files.filter((_, j) => j !== i) }))}
          onRemoveAdd={removeAdd}
        />
      ) : null}
      {note ? (
        <SxNote tone="error" id={noteId}>
          {note}
        </SxNote>
      ) : null}
      <div className="mck-editor__acts">
        <SxButton variant="primary" busy={busy} onClick={() => void save()} aria-describedby={note ? noteId : undefined} aiId={`${itemAi}.save`} aiLabel={t("save")}>
          {busy ? t("saving") : t("save")}
        </SxButton>
        <SxButton variant="ghost" disabled={busy} onClick={onCancel}>
          {t("cancel")}
        </SxButton>
      </div>
    </div>
  );
}

function EvidenceSet({
  kind,
  base,
  itemAi,
  label,
  attachLabel,
  accept,
  saved,
  adds,
  busy,
  canAttach,
  hint,
  error,
  sees,
  onPick,
  onRemoveSaved,
  onRemoveAdd,
}: {
  kind: Kind;
  base: string;
  itemAi: string;
  label: string;
  attachLabel: string;
  accept: string;
  saved: UploadedFile[];
  adds: Add[];
  busy: boolean;
  canAttach: boolean;
  hint: string;
  error?: string;
  sees?: boolean;
  onPick: (list: FileList | null) => void;
  onRemoveSaved: (i: number) => void;
  onRemoveAdd: (key: string) => void;
}) {
  const tcm = useTranslations("common");
  const tc = useTranslations("marketplace.complete");
  const input = useRef<HTMLInputElement>(null);
  const image = kind === "image";
  const slot = image ? "images" : "files";
  const labelId = `${base}-${slot}-label`;
  const attachId = image ? `${base}-image-attach` : `${base}-attach`;
  const hintId = `${base}-${slot}-hint`;
  const errId = `${base}-${slot}-err`;
  const icon = image ? ImageIcon : FileTextIcon;
  const count = saved.length + adds.length;
  return (
    <div className="mck-fileset" data-kind={kind} role="group" aria-labelledby={labelId}>
      <div className="mck-fileset__top">
        <span className="mck-fileset__name">
          <span className="sx-field__label" id={labelId}>
            {label}
          </span>
          <ClientSees shown={sees} />
        </span>
        <SxButton
          id={attachId}
          size="sm"
          variant="secondary"
          icon={image ? ImagePlusIcon : PaperclipIcon}
          aria-disabled={!canAttach || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? errId : "", hintId].filter(Boolean).join(" ")}
          onClick={() => {
            if (canAttach) input.current?.click();
          }}
          aiId={`${itemAi}.${image ? "attach-image" : "attach"}`}
        >
          {attachLabel}
        </SxButton>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          accept={accept || undefined}
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="sx-field__help" id={hintId}>
        {hint}
      </p>
      {count ? (
        <ul className={image ? "mck-flist mck-flist--img" : "mck-flist"}>
          {saved.map((f, i) => (
            <li key={`k-${f.id}-${i}`} data-state="done">
              {glyph(icon, { size: 16 })}
              <span>{f.name || tcm("file")}</span>
              {busy ? null : <SxButton size="sm" variant="ghost" icon={XIcon} aria-label={`${tc("remove")}: ${f.name || tcm("file")}`} onClick={() => onRemoveSaved(i)} />}
            </li>
          ))}
          {adds.map((a) => (
            <li key={a.key} data-state={a.state}>
              {image && a.preview ? <img className="mck-flist__pv" src={a.preview} alt="" /> : glyph(icon, { size: 16 })}
              <span>{a.file.name}</span>
              <em>{tc(`state.${a.state}`)}</em>
              {a.state === "done" || busy ? null : <SxButton size="sm" variant="ghost" icon={XIcon} aria-label={`${tc("remove")}: ${a.file.name}`} onClick={() => onRemoveAdd(a.key)} />}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="sx-field__err" id={errId}>
          {glyph(CircleAlertIcon, { size: 14 })}
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
