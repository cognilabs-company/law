"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-editor.css";
import "./sx-editor-neon.css";
import { useId, type ReactElement } from "react";
import { ArchiveRestoreIcon, EllipsisVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import Menu, { menuSeparator, tidyMenu, type MenuEntry } from "@/components/ui/Menu";
import { SxButton } from "../Button";
import {
  ArchiveIcon,
  RefreshCwIcon,
  MessageSquareTextIcon,
  HistoryIcon,
  CopyIcon,
  SaveIcon,
  GitBranchIcon,
  InfoIcon,
  SendIcon,
  PaperclipIcon,
  PencilIcon,
  RocketIcon,
  BadgeCheckIcon,
  ClockIcon,
  Undo2Icon,
  XIcon,
  glyph,
} from "../icons";
import { SxNote } from "../layout/Note";
import { useNow } from "../live";
import { StatusPill } from "../StatusPill";
import { StatusRail } from "../StatusRail";
import { sxStatus } from "../status";
import type { SxCrumb, SxIcon } from "../types";
import { useStudioLabels, type StudioLabels } from "../useStudioLabels";
import { useEditorErrorText } from "./useEditorErrorText";
import { SAVE_SHORTCUT, editableOf } from "./model";
import type { EditorAlert, EditorPrimary, EditorState } from "./useEditorState";

export type EditorMenuKey = "save" | "saveNote" | "versions" | "comments" | "files" | "steps" | "guide" | "clone" | "newVersion" | "archive" | "withdraw" | "restore";

const AI = "admin.studio.editor";
const NOW_MS = 30_000;

type PrimaryLook = { key: string; icon: SxIcon; ai: string };

const PRIMARY: Readonly<Record<Exclude<EditorPrimary, null>, PrimaryLook>> = {
  saveSubmit: { key: "sx.editor.saveSubmit", icon: SendIcon, ai: `${AI}.submit` },
  submit: { key: "sx.editor.submit", icon: SendIcon, ai: `${AI}.submit` },
  publishDirect: { key: "sx.editor.publish", icon: RocketIcon, ai: `${AI}.submit` },
  publish: { key: "sx.editor.publish", icon: RocketIcon, ai: `${AI}.publish` },
  openReview: { key: "sx.editor.openReview", icon: SendIcon, ai: `${AI}.open-review` },
  edit: { key: "sx.ui.edit", icon: PencilIcon, ai: `${AI}.edit` },
  save: { key: "sx.ui.save", icon: SaveIcon, ai: `${AI}.save` },
  restore: { key: "sx.editor.restore", icon: ArchiveRestoreIcon, ai: `${AI}.restore` },
};

const RUNTIME_PILL = new Set(["active", "inactive", "archived", "deleted"]);

function hasObject(st: EditorState): boolean {
  return st.mode === "object" && !!st.detail;
}

function railShown(st: EditorState): boolean {
  return (st.mode === "object" || st.mode === "create" || st.mode === "clone") && !st.blocked;
}

function cloneLocked(st: EditorState): boolean {
  return st.mode === "object" ? st.dirty : st.changed;
}

function saveOff(st: EditorState): boolean {
  return (st.mode === "object" && !st.dirty) || st.busy !== "";
}

export function editorCrumbs(st: EditorState, labels: StudioLabels): SxCrumb[] {
  if (!st.code) return [];
  const ctor = st.full ?? st.ctor;
  return [{ label: labels.ctorName(st.code, ctor?.title), href: `/admin/studio/c/${encodeURIComponent(st.code)}` }];
}

export function EditorMeta({ st }: { st: EditorState }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const now = useNow(NOW_MS);
  if (st.mode === "runtime-view" || st.mode === "runtime-edit") {
    const s = st.runtimeStatus;
    return <span className="sx-ed-meta">{RUNTIME_PILL.has(s) ? <StatusPill status={s} source="runtime" size="sm" label={t(`sx.editor.runtime.${s}`)} /> : null}</span>;
  }
  if (st.mode === "create" || st.mode === "clone") {
    return (
      <span className="sx-ed-meta">
        <span className="sx-ed-meta__save">{t("sx.editor.notSaved")}</span>
      </span>
    );
  }
  const version = st.detail?.currentVersion ?? "";
  const unsaved = st.dirty && !st.readOnly;
  return (
    <span className="sx-ed-meta">
      {version ? <span className="sx-code sx-ed-meta__ver">{t("sx.editor.versionTag", { v: version })}</span> : null}
      {unsaved ? (
        <span className="sx-ed-meta__save" data-unsaved="">
          <span className="sx-ed__dot" aria-hidden="true" />
          {t("sx.editor.unsaved")}
        </span>
      ) : st.savedAt ? (
        <span className="sx-ed-meta__save" title={labels.dateTime(st.savedAt)}>
          {glyph(ClockIcon, { size: 15 })}
          {t("sx.editor.savedAt", { when: labels.ago(st.savedAt, now) })}
        </span>
      ) : null}
    </span>
  );
}

function menuEntries(st: EditorState, narrow: boolean, t: (key: string, values?: Record<string, string | number>) => string, onMenu: (item: EditorMenuKey) => void): MenuEntry[] {
  const obj = hasObject(st);
  const busy = st.busy !== "";
  const out: MenuEntry[] = [];
  const nothing = t("sx.editor.nothingToSave");
  if (narrow && st.can.save && st.primary !== "save") {
    out.push({
      key: "save",
      label: busy && st.busy === "save" ? t("sx.ui.saving") : t("sx.ui.save"),
      icon: glyph(SaveIcon, { size: 16 }),
      disabled: st.mode === "object" && !st.dirty ? nothing : busy || undefined,
      onSelect: () => onMenu("save"),
      aiId: `${AI}.menu.save`,
    });
  }
  if (obj && st.can.save) {
    out.push({
      key: "saveNote",
      label: t("sx.editor.saveNote"),
      icon: glyph(SaveIcon, { size: 16 }),
      disabled: !st.dirty ? nothing : busy || undefined,
      onSelect: () => onMenu("saveNote"),
      aiId: `${AI}.menu.save-note`,
    });
  }
  out.push(menuSeparator("s1"));
  if (obj) {
    const versions = st.detail?.versions.length ?? 0;
    const comments = st.comments.items?.filter((c) => !c.deleted).length ?? 0;
    out.push({
      key: "versions",
      label: t("sx.editor.tab.versions"),
      icon: glyph(HistoryIcon, { size: 16 }),
      hint: versions ? String(versions) : undefined,
      onSelect: () => onMenu("versions"),
      aiId: `${AI}.menu.versions`,
    });
    out.push({
      key: "comments",
      label: t("sx.editor.tab.comments"),
      icon: glyph(MessageSquareTextIcon, { size: 16 }),
      hint: comments ? String(comments) : undefined,
      onSelect: () => onMenu("comments"),
      aiId: `${AI}.menu.comments`,
    });
  }
  const fileMissing = st.fileRequired && !st.hasFile && !st.pendingFile;
  if (obj) {
    out.push({
      key: "files",
      label: t("sx.editor.tab.files"),
      icon: glyph(PaperclipIcon, { size: 16 }),
      description: fileMissing ? t("sx.editor.alert.fileTitle") : undefined,
      onSelect: () => onMenu("files"),
      aiId: `${AI}.menu.files`,
    });
  }
  if (obj) {
    out.push({
      key: "steps",
      label: t("sx.editor.tab.steps"),
      icon: glyph(BadgeCheckIcon, { size: 16 }),
      onSelect: () => onMenu("steps"),
      aiId: `${AI}.menu.steps`,
    });
  }
  if (narrow && st.code) {
    out.push({
      key: "guide",
      label: t("sx.guide.title"),
      icon: glyph(InfoIcon, { size: 16 }),
      onSelect: () => onMenu("guide"),
      aiId: `${AI}.menu.guide`,
    });
  }
  out.push(menuSeparator("s2"));
  const locked = cloneLocked(st) ? t("sx.editor.saveFirst") : undefined;
  if (st.can.clone) {
    out.push({
      key: "clone",
      label: t("sx.ui.clone"),
      icon: glyph(CopyIcon, { size: 16 }),
      disabled: locked ?? (busy || undefined),
      onSelect: () => onMenu("clone"),
      aiId: `${AI}.menu.clone`,
    });
  }
  if (st.can.newVersion) {
    out.push({
      key: "newVersion",
      label: t("sx.editor.newVersion"),
      icon: glyph(GitBranchIcon, { size: 16 }),
      disabled: locked ?? (busy || undefined),
      onSelect: () => onMenu("newVersion"),
      aiId: `${AI}.menu.new-version`,
    });
  }
  out.push(menuSeparator("s3"));
  if (st.can.withdraw) {
    out.push({
      key: "withdraw",
      label: st.busy === "withdraw" ? t("sx.editor.withdrawing") : t("sx.editor.withdraw"),
      icon: glyph(Undo2Icon, { size: 16 }),
      description: t("sx.editor.withdrawHint"),
      disabled: busy || undefined,
      onSelect: () => onMenu("withdraw"),
      aiId: `${AI}.menu.withdraw`,
    });
  }
  if (st.can.restore && st.primary !== "restore") {
    out.push({
      key: "restore",
      label: t("sx.editor.restore"),
      icon: glyph(ArchiveRestoreIcon, { size: 16 }),
      disabled: busy || undefined,
      onSelect: () => onMenu("restore"),
      aiId: `${AI}.menu.restore`,
    });
  }
  if (st.can.archive) {
    out.push({
      key: "archive",
      label: t("sx.ui.archive"),
      icon: glyph(ArchiveIcon, { size: 16 }),
      danger: true,
      disabled: busy || undefined,
      onSelect: () => onMenu("archive"),
      aiId: `${AI}.menu.archive`,
    });
  }
  return tidyMenu(out);
}

export function EditorActions({
  st,
  narrow,
  onSave,
  onPrimary,
  onMenu,
}: {
  st: EditorState;
  narrow: boolean;
  onSave: () => void;
  onPrimary: () => void;
  onMenu: (item: EditorMenuKey) => void;
}): ReactElement {
  const t = useTranslations("studio");
  const riskId = useId();
  const saveWhyId = useId();
  const busy = st.busy !== "";
  const look = st.primary ? PRIMARY[st.primary] : null;
  const showSave = !narrow && st.can.save && st.primary !== "save";
  const off = saveOff(st);
  const saveLabel = t("sx.ui.save");
  const saveWhy = off && !busy;
  const risky = (st.full ?? st.ctor)?.experience.risk === "high";
  const items = menuEntries(st, narrow, t, onMenu);
  const primaryBusy = st.busy === "check" || (st.primary === "save" && st.busy === "save") || (st.primary === "restore" && st.busy === "restore");
  const unlockable = st.readOnlyReason === "live" && editableOf(st.access, st.lifecycle) && st.phase === "ready";
  const onUnlock = () => {
    st.unlock();
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
    const form = `${st.idPrefix}-form`;
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const target = document.getElementById(form)?.querySelector<HTMLElement>(UNLOCK_FOCUS);
        target?.focus({ preventScroll: true });
      }),
    );
  };
  return (
    <>
      {unlockable ? (
        <SxButton
          variant={look ? "secondary" : "primary"}
          icon={PencilIcon}
          onClick={onUnlock}
          title={t("sx.ed2.unlockHint")}
          aiId={`${AI}.unlock`}
          aiLabel={t("sx.ed2.unlock")}
          className={look ? "sx-ed__unlock" : "sx-ed__primary sx-ed__unlock"}
        >
          {t("sx.ed2.unlock")}
        </SxButton>
      ) : null}
      {showSave ? (
        <SxButton
          variant="secondary"
          icon={SaveIcon}
          busy={st.busy === "save"}
          aria-disabled={off || undefined}
          aria-keyshortcuts={SAVE_SHORTCUT}
          aria-describedby={saveWhy ? saveWhyId : undefined}
          title={saveWhy ? `${saveLabel} — ${t("sx.editor.nothingToSave")}` : `${saveLabel} (Ctrl+S)`}
          onClick={onSave}
          aiId={`${AI}.save`}
          aiLabel={saveLabel}
        >
          {st.busy === "save" ? t("sx.ui.saving") : saveLabel}
        </SxButton>
      ) : null}
      {showSave && saveWhy ? (
        <span id={saveWhyId} className="sx-vh">
          {t("sx.editor.nothingToSave")}
        </span>
      ) : null}
      {look ? (
        <SxButton
          variant="primary"
          icon={look.icon}
          busy={primaryBusy}
          aria-disabled={(busy && !primaryBusy) || undefined}
          aria-keyshortcuts={st.primary === "save" ? SAVE_SHORTCUT : undefined}
          onClick={onPrimary}
          aiId={look.ai}
          className="sx-ed__primary"
        >
          {t(look.key)}
        </SxButton>
      ) : null}
      {!narrow && st.code ? (
        <>
          <IconButton
            className="sx-ibtn sx-ed__guide"
            label={t("sx.guide.title")}
            icon={glyph(InfoIcon)}
            tipAlign="end"
            onClick={() => onMenu("guide")}
            aria-describedby={risky ? riskId : undefined}
            data-risk={risky ? "" : undefined}
            aiId={`${AI}.guide`}
          />
          {risky ? (
            <span id={riskId} className="sx-vh">
              {t("sx.editor.guideRisk")}
            </span>
          ) : null}
        </>
      ) : null}
      {items.length ? (
        <Menu
          items={items}
          label={t("sx.editor.menuLabel")}
          className="sx-pop sx-menu"
          triggerClassName="sx-ibtn sx-ed__more"
          icon={glyph(EllipsisVerticalIcon, { strokeWidth: 2.25 })}
          align="end"
          tipAlign="end"
          aiId={`${AI}.menu`}
        />
      ) : null}
    </>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("studio");
  return <IconButton className="sx-ibtn sx-note__close" size="sm" label={t("sx.ui.close")} icon={glyph(XIcon)} onClick={onClick} aiId={`${AI}.alert.dismiss`} />;
}

function AlertSlot({ alert, st, onAction }: { alert: NonNullable<EditorAlert>; st: EditorState; onAction: (kind: NonNullable<EditorAlert>["kind"]) => void }) {
  const t = useTranslations("studio");
  const errorText = useEditorErrorText();
  if (alert.kind === "action") {
    const e = errorText(alert.error);
    return (
      <SxNote tone="error" role="alert" title={e.title} action={<DismissButton onClick={st.dismissAlert} />}>
        {e.text}
      </SxNote>
    );
  }
  if (alert.kind === "locked") {
    return (
      <SxNote
        tone="warn"
        role="alert"
        title={t(alert.review ? "sx.ap4.ed.lockedTitle" : "sx.editor.alert.lockedTitle")}
        action={
          <span className="sx-ed__alert-acts">
            {alert.withdraw ? (
              <SxButton variant="ghost" size="sm" icon={Undo2Icon} busy={st.busy === "withdraw"} onClick={() => onAction("locked")} aiId={`${AI}.locked.withdraw`}>
                {t("sx.editor.withdraw")}
              </SxButton>
            ) : null}
            <DismissButton onClick={st.dismissAlert} />
          </span>
        }
      >
        {t(alert.review ? "sx.ap4.ed.lockedText" : alert.withdraw ? "sx.editor.alert.lockedText" : "sx.editor.alert.lockedNoWithdraw")}
      </SxNote>
    );
  }
  if (alert.kind === "publishFail") {
    return (
      <SxNote tone="error" role="alert" title={t("sx.editor.alert.publishFailTitle")} action={<DismissButton onClick={st.dismissAlert} />}>
        {alert.text || t("sx.editor.alert.publishFailText")}
      </SxNote>
    );
  }
  if (alert.kind === "remote") {
    return (
      <SxNote
        tone="warn"
        role="status"
        title={t(alert.conflict ? "sx.editor.alert.conflictTitle" : "sx.editor.alert.remoteTitle")}
        action={
          <span className="sx-ed__alert-acts">
            {alert.conflict && st.can.save ? (
              <SxButton variant="ghost" size="sm" icon={SaveIcon} busy={st.busy === "save"} onClick={() => void st.overwrite()} aiId={`${AI}.remote.overwrite`}>
                {t("sx.editor.conflictDlg.overwrite")}
              </SxButton>
            ) : null}
            <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => onAction("remote")} aiId={`${AI}.remote.load`}>
              {t("sx.editor.alert.loadNew")}
            </SxButton>
          </span>
        }
      >
        {t(alert.conflict ? "sx.editor.alert.conflictKeep" : "sx.editor.alert.remoteText")}
      </SxNote>
    );
  }
  return (
    <SxNote
      tone="warn"
      role="status"
      title={t("sx.editor.alert.fileTitle")}
      action={
        <SxButton variant="ghost" size="sm" icon={PaperclipIcon} onClick={() => onAction("file")} aiId={`${AI}.goto-file`}>
          {t("sx.k06.alert.action")}
        </SxButton>
      }
    >
      {t(alert.isNew ? "sx.k06.alert.new" : "sx.k06.alert.text")}
    </SxNote>
  );
}

const UNLOCK_FOCUS = 'input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),[contenteditable="true"]';

const GENERIC_NEXT: ReadonlySet<string> = new Set([
  "sx.editor.next.new",
  "sx.editor.next.submitted",
  "sx.editor.next.inReview",
  "sx.editor.next.returnedNoNote",
  "sx.editor.next.rejectedNoNote",
  "sx.editor.next.archived",
  "sx.editor.next.clone",
]);
const SHORT_NEXT: Readonly<Record<string, string>> = {
  "sx.editor.next.returned": "sx.ed2.next.note",
  "sx.editor.next.rejected": "sx.ed2.next.note",
  "sx.editor.next.approvedPublisher": "sx.ed2.next.approvedPublisher",
  "sx.editor.next.approvedWait": "sx.ed2.next.approvedWait",
  "sx.editor.next.published": "sx.ed2.next.published",
  "sx.editor.next.runtimeEdit": "sx.ed2.next.runtimeEdit",
  "sx.editor.next.runtimeView": "sx.ed2.next.runtimeView",
};

function stateKeyOf(st: EditorState): string {
  if (st.mode === "runtime-view" || st.mode === "runtime-edit") return "runtime";
  if (st.mode === "create") return "new";
  if (st.mode === "clone") return "clone";
  return sxStatus(st.status).key;
}

function StateCard({ st }: { st: EditorState }): ReactElement {
  const t = useTranslations("studio");
  const key = stateKeyOf(st);
  const tone = st.mode === "object" ? sxStatus(st.status).tone : "draft";
  const nextKey = st.next.key;
  const title = t(`sx.ed2.state.${key}.title`);
  const text = nextKey && !GENERIC_NEXT.has(nextKey) ? t(SHORT_NEXT[nextKey] ?? nextKey, st.next.values) : t(`sx.ed2.state.${key}.text`);
  return (
    <div className="sx-ed-sp__info" data-tone={tone} role="note" aria-label={title}>
      <span className="sx-ed-sp__i" aria-hidden="true">
        {glyph(InfoIcon, { size: 20 })}
      </span>
      <div className="sx-ed-sp__txt">
        <p className="sx-ed-sp__title">{title}</p>
        <p className="sx-ed__note">{text}</p>
      </div>
    </div>
  );
}

export function EditorBelow({ st, narrow = false, onAlertAction }: { st: EditorState; narrow?: boolean; onAlertAction: (kind: NonNullable<EditorAlert>["kind"]) => void }): ReactElement {
  const t = useTranslations("studio");
  const loading = st.phase === "loading";
  const rail = railShown(st);
  const ready = st.phase === "ready";
  const info = ready && !st.blocked && !!st.next.key;
  const showRail = rail && ready;
  return (
    <div className="sx-ed__below">
      {loading && st.mode !== "runtime-view" && st.mode !== "runtime-edit" ? (
        <div className="sx-ed-sp" data-loading="" aria-hidden="true">
          <div className="sx-ed__rail">
            <span className="sx-sk sx-ed__railsk" />
          </div>
          <span className="sx-sk sx-ed-sp__sk" />
        </div>
      ) : showRail || info ? (
        <section className="sx-ed-sp" data-solo={showRail ? undefined : ""} aria-label={t("sx.rail.label")}>
          {showRail ? (
            <div className="sx-ed__rail" data-ai-id={`${AI}.rail`} data-ai-type="section" data-ai-label={t("sx.rail.label")}>
              <StatusRail status={st.status} direct={st.direct} variant="full" celebrateOnPublish announce />
            </div>
          ) : null}
          {info ? <StateCard st={st} /> : null}
        </section>
      ) : null}
      {narrow && !loading ? (
        <div className="sx-ed__meta-row">
          <EditorMeta st={st} />
        </div>
      ) : null}
      {st.alert ? (
        <div className="sx-ed__alert">
          <AlertSlot alert={st.alert} st={st} onAction={onAlertAction} />
        </div>
      ) : null}
    </div>
  );
}
