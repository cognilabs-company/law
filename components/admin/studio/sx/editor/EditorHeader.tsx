"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-editor.css";
import { useId, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import Menu, { menuSeparator, tidyMenu, type MenuEntry } from "@/components/ui/Menu";
import { SxButton } from "../Button";
import {
  ArchiveIcon,
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  ChatCircleTextIcon,
  ClockCounterClockwiseIcon,
  CopyIcon,
  FloppyDiskIcon,
  GitBranchIcon,
  InfoIcon,
  PaperPlaneTiltIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  RocketLaunchIcon,
  SealCheckIcon,
  XIcon,
  glyph,
  moreGlyph,
} from "../icons";
import { SxNote } from "../layout/Note";
import { useNow } from "../live";
import { StatusPill } from "../StatusPill";
import { StatusRail } from "../StatusRail";
import type { SxCrumb, SxIcon } from "../types";
import { useStudioLabels, type StudioLabels } from "../useStudioLabels";
import { useEditorErrorText } from "./useEditorErrorText";
import { SAVE_SHORTCUT } from "./model";
import type { EditorAlert, EditorPrimary, EditorState } from "./useEditorState";

export type EditorMenuKey = "save" | "saveNote" | "versions" | "comments" | "files" | "steps" | "guide" | "clone" | "newVersion" | "archive";

const AI = "admin.studio.editor";
const NOW_MS = 30_000;

type PrimaryLook = { key: string; icon: SxIcon; ai: string };

const PRIMARY: Readonly<Record<Exclude<EditorPrimary, null>, PrimaryLook>> = {
  saveSubmit: { key: "sx.editor.saveSubmit", icon: PaperPlaneTiltIcon, ai: `${AI}.submit` },
  submit: { key: "sx.editor.submit", icon: PaperPlaneTiltIcon, ai: `${AI}.submit` },
  publishDirect: { key: "sx.editor.publish", icon: RocketLaunchIcon, ai: `${AI}.submit` },
  publish: { key: "sx.editor.publish", icon: RocketLaunchIcon, ai: `${AI}.publish` },
  openReview: { key: "sx.editor.openReview", icon: ArrowSquareOutIcon, ai: `${AI}.open-review` },
  edit: { key: "sx.ui.edit", icon: PencilSimpleIcon, ai: `${AI}.edit` },
  save: { key: "sx.ui.save", icon: FloppyDiskIcon, ai: `${AI}.save` },
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
      {version ? <span className="sx-code">{t("sx.editor.versionTag", { v: version })}</span> : null}
      {unsaved ? (
        <span className="sx-ed-meta__save" data-unsaved="">
          <span className="sx-ed__dot" aria-hidden="true" />
          {t("sx.editor.unsaved")}
        </span>
      ) : st.savedAt ? (
        <span className="sx-ed-meta__save" title={labels.dateTime(st.savedAt)}>
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
      icon: glyph(FloppyDiskIcon, { size: 16 }),
      disabled: st.mode === "object" && !st.dirty ? nothing : busy || undefined,
      onSelect: () => onMenu("save"),
      aiId: `${AI}.menu.save`,
    });
  }
  if (obj && st.can.save) {
    out.push({
      key: "saveNote",
      label: t("sx.editor.saveNote"),
      icon: glyph(FloppyDiskIcon, { size: 16 }),
      disabled: !st.dirty ? nothing : busy || undefined,
      onSelect: () => onMenu("saveNote"),
      aiId: `${AI}.menu.save-note`,
    });
  }
  out.push(menuSeparator("s1"));
  if (obj) {
    const versions = st.detail?.versions.length ?? 0;
    const comments = st.comments.items?.length ?? 0;
    out.push({
      key: "versions",
      label: t("sx.editor.tab.versions"),
      icon: glyph(ClockCounterClockwiseIcon, { size: 16 }),
      hint: versions ? String(versions) : undefined,
      onSelect: () => onMenu("versions"),
      aiId: `${AI}.menu.versions`,
    });
    out.push({
      key: "comments",
      label: t("sx.editor.tab.comments"),
      icon: glyph(ChatCircleTextIcon, { size: 16 }),
      hint: comments ? String(comments) : undefined,
      onSelect: () => onMenu("comments"),
      aiId: `${AI}.menu.comments`,
    });
  }
  const fileMissing = st.fileRequired && !st.hasFile;
  if (obj || fileMissing) {
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
      icon: glyph(SealCheckIcon, { size: 16 }),
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
  const primaryBusy = st.busy === "check" || (st.primary === "save" && st.busy === "save");
  return (
    <>
      {showSave ? (
        <SxButton
          variant="secondary"
          icon={FloppyDiskIcon}
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
          triggerClassName="sx-ibtn"
          icon={moreGlyph()}
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
          <SxButton variant="ghost" size="sm" icon={ArrowsClockwiseIcon} onClick={() => onAction("remote")} aiId={`${AI}.remote.load`}>
            {t("sx.editor.alert.loadNew")}
          </SxButton>
        }
      >
        {t(alert.conflict ? "sx.editor.alert.conflictText" : "sx.editor.alert.remoteText")}
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
          {t("sx.editor.alert.fileAction")}
        </SxButton>
      }
    >
      {t(alert.isNew ? "sx.editor.alert.fileNew" : "sx.editor.alert.fileText")}
    </SxNote>
  );
}

export function EditorBelow({ st, narrow = false, onAlertAction }: { st: EditorState; narrow?: boolean; onAlertAction: (kind: NonNullable<EditorAlert>["kind"]) => void }): ReactElement {
  const t = useTranslations("studio");
  const loading = st.phase === "loading";
  const rail = railShown(st);
  const ready = st.phase === "ready";
  const note = ready && !st.blocked && st.next.key ? t(st.next.key, st.next.values) : "";
  return (
    <div className="sx-ed__below">
      {loading && st.mode !== "runtime-view" && st.mode !== "runtime-edit" ? (
        <div className="sx-ed__rail" aria-hidden="true">
          <span className="sx-sk sx-ed__railsk" />
        </div>
      ) : rail && ready ? (
        <div className="sx-ed__rail" data-ai-id={`${AI}.rail`} data-ai-type="section" data-ai-label={t("sx.rail.label")}>
          <StatusRail status={st.status} direct={st.direct} variant="full" celebrateOnPublish />
        </div>
      ) : null}
      {narrow && !loading ? (
        <div className="sx-ed__meta-row">
          <EditorMeta st={st} />
        </div>
      ) : null}
      {note ? <p className="sx-ed__note">{note}</p> : null}
      {st.alert ? (
        <div className="sx-ed__alert">
          <AlertSlot alert={st.alert} st={st} onAction={onAlertAction} />
        </div>
      ) : null}
    </div>
  );
}
