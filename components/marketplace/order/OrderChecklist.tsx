"use client";

import { useRef, useState, type ReactElement } from "react";
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
import { checklistItemRef, checklistStatusOf, marketErrorInfo, updateChecklistItem, type ChecklistItem, type ChecklistStatus, type MarketFileRef, type OrderChecklist as OrderChecklistData } from "@/lib/services/marketRuntime";
import { useMarketError } from "../useMarketError";
import { canEditChecklist, draftOf, itemProblems, mergeChecklistItem, sortedItems, type ItemDraft } from "./checklistRules";
import { ForwardIcon, CircleCheckIcon, CircleDashedIcon, DownloadIcon, FileTextIcon, PaperclipIcon, PencilIcon, CircleAlertIcon, XIcon, glyph } from "./icons";
import { SECTION_ID, type LoadState, type OrderView } from "./types";
import { ORDER_FILE_MB, ORDER_FILES_MAX, uploadOrderFile, type UploadedFile } from "./upload";
import "./checklist.css";

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

type Add = { key: string; file: File; state: "wait" | "up" | "done" | "fail"; uploaded: UploadedFile | null };
type Errs = { status?: string; comment?: string; file?: string };

function signatureOf(c: OrderChecklistData | null): string {
  if (!c) return "";
  return c.items.map((i) => `${i.id}:${i.status}:${i.updatedAt}:${i.comment.length}:${i.files.length}`).join("|");
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
  if (/file/.test(k)) return "file";
  if (/status/.test(k)) return "status";
  return "";
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
  const sig = signatureOf(checklist);
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    if (view === "client" && prevSig && sig) setLive(t("checklist.live"));
  }

  if (state === "none" || state === "idle") return null;
  const items = checklist ? sortedItems(checklist.items) : [];
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
}) {
  const t = useTranslations("marketplace.orderDetail.checklist");
  const locale = useLocale();
  const editorId = `mck-${item.id}-editor`;
  const title = item.title || "—";
  const skipped = item.status === "skipped_with_reason";
  const marks = [item.required ? "required" : "", item.commentRequired ? "comment" : "", item.fileRequired ? "file" : ""].filter(Boolean);
  return (
    <li id={`mck-${item.id}`} className="mck-item" data-status={item.status} data-open={open ? "" : undefined} data-ai-id={itemAi} data-ai-type="list_item" data-ai-label={title}>
      <div className="mck-item__head">
        <span className="mck-status" data-tone={STATUS_TONE[item.status]}>
          {glyph(STATUS_ICON[item.status], { size: 16 })}
          <span>{t(`status.${item.status}`)}</span>
        </span>
        <div className="mck-item__titles">
          <h3 className="mck-item__title">{title}</h3>
          {item.description ? <p className="mck-item__desc">{item.description}</p> : null}
        </div>
        {editable ? (
          <SxButton
            id={editBtnId(item)}
            size="sm"
            variant="ghost"
            icon={PencilIcon}
            aria-label={t("editAria", { title })}
            aria-expanded={open}
            aria-controls={open ? editorId : undefined}
            onClick={onToggle}
            aiId={`${itemAi}.edit`}
            aiLabel={t("edit")}
            className="mck-item__edit"
          >
            {t("edit")}
          </SxButton>
        ) : null}
      </div>
      {marks.length ? (
        <ul className="mck-marks">
          {marks.map((m) => (
            <li key={m} className="mck-mark" data-tone={m === "required" ? "approved" : "draft"}>
              {t(`mark.${m}`)}
            </li>
          ))}
        </ul>
      ) : null}
      {item.comment.trim() ? (
        <p className="mck-item__comment">
          {skipped ? <b>{t("reasonPrefix")}: </b> : null}
          {item.comment}
        </p>
      ) : null}
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
  const filesLabelId = `${base}-files-label`;
  const attachId = `${base}-attach`;
  const hintId = `${base}-files-hint`;
  const fileErrId = `${base}-files-err`;
  const noteId = `${base}-note`;
  const [draft, setDraft] = useState<ItemDraft>(() => draftOf(item));
  const [adds, setAdds] = useState<Add[]>([]);
  const [errs, setErrs] = useState<Errs>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const done = draft.status === "done";
  const skip = draft.status === "skipped_with_reason";
  const commentNeeded = skip || (done && item.commentRequired);
  const commentLabel = skip ? t("reason") : done && item.commentRequired ? t("commentRequired") : t("comment");
  const fileCount = draft.files.length + adds.length;
  const canAttach = !!o.roomId && !busy && fileCount < ORDER_FILES_MAX;

  const skippable = item.skipAllowed || item.status === "skipped_with_reason";
  const options: ChoiceCard[] = [
    { value: "done", title: t("opt.done"), icon: CircleCheckIcon },
    ...(skippable ? [{ value: "skipped_with_reason", title: t("opt.skip"), icon: ForwardIcon }] : []),
    { value: "pending", title: t("opt.pending"), icon: CircleDashedIcon },
  ];

  function add(list: FileList | null) {
    if (!list) return;
    const next = [...adds];
    let tooBig = false;
    for (const f of Array.from(list)) {
      if (draft.files.length + next.length >= ORDER_FILES_MAX) break;
      if (f.size > ORDER_FILE_MB * 1024 * 1024) {
        tooBig = true;
        continue;
      }
      next.push({ key: `${f.name}-${f.size}-${f.lastModified}-${next.length}`, file: f, state: "wait", uploaded: null });
    }
    setAdds(next);
    setErrs((e) => ({ ...e, file: tooBig ? tc("tooBig", { mb: ORDER_FILE_MB }) : undefined }));
    if (input.current) input.current.value = "";
  }

  function place(found: Errs) {
    setErrs(found);
    setNote("");
    if (found.comment) focusById(commentId);
    else if (found.file) focusById(attachId);
    else if (found.status && typeof document !== "undefined") document.querySelector<HTMLInputElement>(`[id="${statusId}"] input`)?.focus();
  }

  async function save() {
    if (busy) return;
    const planned: ItemDraft = { ...draft, files: [...draft.files, ...adds.map((a) => a.uploaded ?? { id: "", name: a.file.name, url: "" })] };
    const problems = itemProblems(item, planned);
    if (problems.length) {
      const found: Errs = {};
      if (problems.includes("reason")) found.comment = t("needReason");
      if (problems.includes("comment")) found.comment = t("needComment");
      if (problems.includes("file")) found.file = t("needFile");
      if (problems.includes("skip")) found.status = t("noSkipRequired");
      place(found);
      return;
    }
    setBusy(true);
    setErrs({});
    setNote("");
    try {
      const uploaded: UploadedFile[] = [];
      if (done) {
        for (const a of adds) {
          if (a.uploaded) {
            uploaded.push(a.uploaded);
            continue;
          }
          setAdds((cur) => cur.map((x) => (x.key === a.key ? { ...x, state: "up" } : x)));
          try {
            const u = await uploadOrderFile(o.roomId, a.file, tc("caption"));
            uploaded.push(u);
            setAdds((cur) => cur.map((x) => (x.key === a.key ? { ...x, state: "done", uploaded: u } : x)));
          } catch (e) {
            setAdds((cur) => cur.map((x) => (x.key === a.key ? { ...x, state: "fail" } : x)));
            throw e;
          }
        }
      }
      const files = done ? [...draft.files, ...uploaded] : [];
      const comment = draft.comment.trim();
      const r = await updateChecklistItem(o.id, checklistItemRef(item), { status: draft.status, comment, files: files.map(({ id: fid, name }) => ({ id: fid, name })) });
      const local: ChecklistItem = {
        ...item,
        status: draft.status,
        statusRaw: draft.status,
        comment,
        files: files.map((f) => ({ id: f.id, name: f.name, url: f.url })),
        raw: { id: item.id, status: draft.status, comment, files },
      };
      const next = r.checklist ?? mergeChecklistItem(checklist, r.item ?? local);
      onSaved(next);
    } catch (e) {
      const info = marketErrorInfo(e);
      const msg = marketErr(e, t("saveError"));
      const code = (info?.code ?? "").toLowerCase();
      const found: Errs = {};
      if (/comment|reason/.test(code)) found.comment = skip ? t("needReason") : t("needComment");
      else if (/file/.test(code)) found.file = t("needFile");
      for (const [k, v] of Object.entries(info?.fieldErrors ?? {})) {
        const key = k === "field" ? fieldOf(v) : fieldOf(k);
        if (key && !found[key]) found[key] = k === "field" ? msg : v;
      }
      if (found.comment || found.file || found.status) place(found);
      else setNote(msg);
    } finally {
      setBusy(false);
    }
  }

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
      <Field id={commentId} label={commentLabel} error={errs.comment}>
        {(a) => (
          <TextArea
            {...a}
            aria-required={commentNeeded || undefined}
            value={draft.comment}
            onChange={(v) => {
              setDraft((d) => ({ ...d, comment: v.slice(0, COMMENT_MAX) }));
              if (errs.comment) setErrs((e) => ({ ...e, comment: undefined }));
            }}
            maxLength={COMMENT_MAX}
            counter
            minRows={2}
            placeholder={skip ? t("reasonPh") : t("commentPh")}
            aiId={`${itemAi}.comment`}
            aiLabel={commentLabel}
          />
        )}
      </Field>
      {done ? (
        <div className="mck-fileset" role="group" aria-labelledby={filesLabelId}>
          <div className="mck-fileset__top">
            <span className="sx-field__label" id={filesLabelId}>
              {item.fileRequired ? t("filesRequired") : t("files")}
            </span>
            <SxButton
              id={attachId}
              size="sm"
              variant="secondary"
              icon={PaperclipIcon}
              aria-disabled={!canAttach || undefined}
              aria-invalid={errs.file ? true : undefined}
              aria-describedby={[errs.file ? fileErrId : "", hintId].filter(Boolean).join(" ")}
              onClick={() => {
                if (canAttach) input.current?.click();
              }}
              aiId={`${itemAi}.attach`}
            >
              {t("attach")}
            </SxButton>
            <input ref={input} type="file" multiple hidden tabIndex={-1} onChange={(e) => add(e.target.files)} />
          </div>
          <p className="sx-field__help" id={hintId}>
            {o.roomId ? t("filesHint", { mb: ORDER_FILE_MB }) : t("noRoom")}
          </p>
          {fileCount ? (
            <ul className="mck-flist">
              {draft.files.map((f, i) => (
                <li key={`k-${f.id}-${i}`} data-state="done">
                  {glyph(FileTextIcon, { size: 16 })}
                  <span>{f.name || f.id}</span>
                  {busy ? null : (
                    <SxButton
                      size="sm"
                      variant="ghost"
                      icon={XIcon}
                      aria-label={`${tc("remove")}: ${f.name || f.id}`}
                      onClick={() => setDraft((d) => ({ ...d, files: d.files.filter((_, j) => j !== i) }))}
                    />
                  )}
                </li>
              ))}
              {adds.map((a) => (
                <li key={a.key} data-state={a.state}>
                  {glyph(FileTextIcon, { size: 16 })}
                  <span>{a.file.name}</span>
                  <em>{tc(`state.${a.state}`)}</em>
                  {a.state === "done" || busy ? null : (
                    <SxButton size="sm" variant="ghost" icon={XIcon} aria-label={`${tc("remove")}: ${a.file.name}`} onClick={() => setAdds((cur) => cur.filter((x) => x.key !== a.key))} />
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {errs.file ? (
            <p className="sx-field__err" id={fileErrId}>
              {glyph(CircleAlertIcon, { size: 14 })}
              <span>{errs.file}</span>
            </p>
          ) : null}
        </div>
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
