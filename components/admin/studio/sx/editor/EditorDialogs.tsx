"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-editor-panels.css";
import { useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import type { StudioVersion } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { Field } from "../form/Field";
import { TextArea } from "../form/TextArea";
import { TextInput } from "../form/TextInput";
import { SxFormContext, useSxFormPolicy } from "../form/formPolicy";
import { SxDrawer } from "../layout/Drawer";
import { SxNote } from "../layout/Note";
import { useStudioLabels, type StudioLabels } from "../useStudioLabels";
import { RotateCcwIcon, CopyIcon, SaveIcon, GitBranchIcon, SendIcon, RocketIcon, TriangleAlertIcon, RefreshCwIcon, glyph } from "../icons";
import type { SxLayoutCtx, SxTranslate, SxWarning } from "../contract";
import { useSchemaModel } from "../schema/useSchemaModel";
import { SchemaForm } from "../schema/SchemaForm";
import type { EditorAlert, EditorState } from "./useEditorState";
import { useEditorErrorText } from "./useEditorErrorText";
import { changedKeys, nextMinor, versionOk } from "./model";
import { isSlugPath } from "./slug";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "./SxDialog";
import { SubmitPreview } from "./SubmitPreview";
import { VersionLine, canRollbackVersion } from "./drawer/VersionsTab";

export type EditorDialog =
  | { kind: "submit" }
  | { kind: "publish" }
  | { kind: "saveNote" }
  | { kind: "rollback"; version: StudioVersion }
  | { kind: "clone"; newVersion: boolean }
  | { kind: "preview"; version: StudioVersion }
  | null;

export const NOTE_MAX = 1000;
export const SUMMARY_MAX = 300;
export const VERSION_MAX = 14;
export const CLONE_NAME_MAX = 200;

const noop = () => undefined;

export function cleanVersionInput(raw: string): string {
  return raw.replace(/,/g, ".").replace(/[^\d.]/g, "").slice(0, VERSION_MAX);
}

export function saveMeta(summary: string, version: string): { summary?: string; version?: string } {
  const s = summary.trim();
  const v = version.trim();
  return { ...(s ? { summary: s } : {}), ...(v ? { version: v } : {}) };
}

export function cloneDefaultName(t: SxTranslate, title: string): string {
  return t("sx.editor.cloneDlg.nameDefault", { title }).slice(0, CLONE_NAME_MAX);
}

type LabelSource = Pick<EditorState, "model" | "code" | "runtimeTarget" | "formMode" | "recordId" | "payload">;

export function fieldNameOf(st: LabelSource, key: string, labels: StudioLabels, t: SxTranslate): string {
  const fm = st.model?.sections.flatMap((s) => s.fields).find((f) => f.pattern === key) ?? null;
  const own = fm?.layout?.label;
  if (own) {
    const ctx: SxLayoutCtx = { code: st.code, runtimeTarget: st.runtimeTarget, mode: st.formMode, recordId: st.recordId, root: st.payload, scope: st.payload };
    const k = typeof own === "function" ? own(ctx) : own;
    if (k) return t(k);
  }
  if (fm?.layout?.virtual?.labelKey) return t(fm.layout.virtual.labelKey);
  return labels.field(key, { ctor: st.code, backend: fm?.field?.label });
}

export function fieldNamesOf(st: LabelSource, keys: readonly string[], labels: StudioLabels, t: SxTranslate): string[] {
  const out: string[] = [];
  for (const k of keys) {
    if (isSlugPath(k)) continue;
    const name = fieldNameOf(st, k, labels, t);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function dialogErrorOf(alert: EditorAlert, hasServerErrors: boolean, errText: (e: unknown) => { title: string; text: string }, t: SxTranslate): NonNullable<SxDialogErrorText> {
  if (alert?.kind === "action") return errText(alert.error);
  if (alert?.kind === "publishFail") return { title: t("sx.editor.alert.publishFailTitle"), text: alert.text || t("sx.editor.alert.publishFailText") };
  return { title: t("sx.editor.alert.actionTitle"), text: t(hasServerErrors ? "sx.editor.err.validation" : "sx.editor.err.other") };
}

function useTr(): SxTranslate {
  const t = useTranslations("studio");
  return (key, values) => t(key, values);
}

function useActionError(st: EditorState): [SxDialogErrorText, (failed: boolean) => void] {
  const t = useTr();
  const errText = useEditorErrorText();
  const [failed, setFailed] = useState(false);
  const error = failed ? dialogErrorOf(st.alert, Object.keys(st.serverErrors).length > 0, errText, t) : null;
  return [error, setFailed];
}

function ChangeList({ st, paths }: { st: EditorState; paths: readonly string[] | null }): ReactElement {
  const t = useTr();
  const labels = useStudioLabels();
  const names = paths ? fieldNamesOf(st, paths, labels, t) : [];
  return (
    <section className="sx-dlg__sec" aria-label={t("sx.editor.submitDlg.changed")}>
      <p className="sx-dlg__h">{t("sx.editor.submitDlg.changed")}</p>
      {paths === null ? (
        <p className="sx-dlg__muted">{t("sx.editor.submitDlg.newRecord")}</p>
      ) : names.length ? (
        <ul className="sx-dlg__list">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : (
        <p className="sx-dlg__muted">{t("sx.editor.submitDlg.noChanges")}</p>
      )}
    </section>
  );
}

function WarningList({ warnings }: { warnings: readonly SxWarning[] }): ReactElement | null {
  const t = useTr();
  if (!warnings.length) return null;
  return (
    <section className="sx-dlg__sec sx-dlg__warns" aria-label={t("sx.editor.dlg.warnings")}>
      <p className="sx-dlg__h">{t("sx.editor.dlg.warnings")}</p>
      <ul className="sx-dlg__list" data-warn="">
        {warnings.map((w) => (
          <li key={`${w.key}|${w.path ?? ""}`} data-tone={w.tone}>
            {glyph(TriangleAlertIcon, { size: 16 })}
            <span>{t(w.key, w.values ? { ...w.values } : undefined)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer({ aiId, busy, onCancel, confirm, icon, formId, variant = "primary" }: { aiId: string; busy: boolean; onCancel: () => void; confirm: string; icon: typeof SaveIcon; formId: string; variant?: "primary" | "danger" }): ReactElement {
  const t = useTr();
  return (
    <>
      <SxButton variant="secondary" onClick={onCancel} disabled={busy} aiId={`${aiId}.cancel`}>
        {t("sx.ui.cancel")}
      </SxButton>
      <SxButton type="submit" form={formId} variant={variant} icon={icon} busy={busy} aiId={`${aiId}.confirm`}>
        {confirm}
      </SxButton>
    </>
  );
}

function SubmitDialog({ st, onClose }: { st: EditorState; onClose: () => void }): ReactElement {
  const t = useTr();
  const uid = useId();
  const formId = `${uid}-form`;
  const [running, setRunning] = useState(false);
  const [error, setFailed] = useActionError(st);
  const direct = st.direct;
  const aiId = direct ? "admin.studio.editor.submit-modal" : "admin.studio.editor.submit-review-modal";
  const persist = st.mode !== "object" || st.dirty;

  async function run(e: FormEvent) {
    e.preventDefault();
    if (running) return;
    setRunning(true);
    setFailed(false);
    const ok = await st.submit();
    setRunning(false);
    if (ok) onClose();
    else setFailed(true);
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={t(direct ? "sx.editor.submitDlg.directTitle" : "sx.editor.submitDlg.title")}
      description={t(direct ? "sx.editor.submitDlg.directLead" : "sx.editor.submitDlg.lead")}
      busy={running}
      aiId={aiId}
      footer={<Footer aiId={aiId} busy={running} onCancel={onClose} confirm={t(direct ? "sx.editor.submitDlg.directConfirm" : "sx.editor.submitDlg.confirm")} icon={direct ? RocketIcon : SendIcon} formId={formId} />}
    >
      <form id={formId} className="sx-dlg__form" onSubmit={run} noValidate>
        {persist ? (
          <p className="sx-dlg__muted" data-icon="">
            {glyph(SaveIcon, { size: 16 })}
            <span>{t("sx.editor.submitDlg.saveFirst")}</span>
          </p>
        ) : null}
        <ChangeList st={st} paths={st.changedPaths} />
        <WarningList warnings={st.warnings} />
        <SubmitPreview st={st} />
        <SxDialogError error={error} />
      </form>
    </SxDialog>
  );
}

function PublishDialog({ st, onClose }: { st: EditorState; onClose: () => void }): ReactElement {
  const t = useTr();
  const uid = useId();
  const formId = `${uid}-form`;
  const noteId = `${uid}-note`;
  const aiId = "admin.studio.editor.publish-modal";
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setFailed] = useActionError(st);
  const version = st.currentVersion;

  async function run(e: FormEvent) {
    e.preventDefault();
    if (running) return;
    setRunning(true);
    setFailed(false);
    const ok = await st.publish(note.trim());
    setRunning(false);
    if (ok) onClose();
    else setFailed(true);
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={t("sx.editor.publishDlg.title")}
      description={t("sx.editor.publishDlg.lead")}
      busy={running}
      aiId={aiId}
      footer={<Footer aiId={aiId} busy={running} onCancel={onClose} confirm={t("sx.editor.publishDlg.confirm")} icon={RocketIcon} formId={formId} />}
    >
      <form id={formId} className="sx-dlg__form" onSubmit={run} noValidate>
        {version ? <VersionLine version={version} detail={st.detail} /> : null}
        <ChangeList st={st} paths={st.changedPaths} />
        <WarningList warnings={st.warnings} />
        <Field id={noteId} label={t("sx.editor.publishDlg.note")} labelAside={<span className="sx-dlg__opt">{t("sx.ui.optional")}</span>}>
          {(a11y) => (
            <TextArea
              {...a11y}
              value={note}
              onChange={setNote}
              maxLength={NOTE_MAX}
              counter
              minRows={3}
              placeholder={t("sx.editor.publishDlg.notePh")}
              disabled={running}
              aiId={`${aiId}.note`}
              aiLabel={t("sx.editor.publishDlg.note")}
            />
          )}
        </Field>
        <SxDialogError error={error} />
      </form>
    </SxDialog>
  );
}

function SaveNoteDialog({ st, onClose }: { st: EditorState; onClose: () => void }): ReactElement {
  const t = useTr();
  const uid = useId();
  const formId = `${uid}-form`;
  const aiId = "admin.studio.editor.save-modal";
  const summaryRef = useRef<HTMLInputElement>(null);
  const versionRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState("");
  const [version, setVersion] = useState("");
  const [bad, setBad] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setFailed] = useActionError(st);
  const showBad = bad && !versionOk(version);
  const suggest = nextMinor(st.detail?.currentVersion || "1.0");

  async function run(e: FormEvent) {
    e.preventDefault();
    if (running) return;
    if (!versionOk(version)) {
      setBad(true);
      versionRef.current?.focus();
      return;
    }
    if (st.cascadeWarning && !(await confirmCascade(st.cascadeWarning, t))) return;
    setRunning(true);
    setFailed(false);
    const ok = await st.save(saveMeta(summary, version));
    setRunning(false);
    if (ok) onClose();
    else setFailed(true);
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={t("sx.editor.saveDlg.title")}
      busy={running}
      size="sm"
      aiId={aiId}
      initialFocus={summaryRef}
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={running} aiId={`${aiId}.cancel`}>
            {t("sx.ui.cancel")}
          </SxButton>
          <SxButton type="submit" form={formId} variant="primary" icon={SaveIcon} busy={running} aiId="admin.studio.editor.save.confirm">
            {t("sx.ui.save")}
          </SxButton>
        </>
      }
    >
      <form id={formId} className="sx-dlg__form" onSubmit={run} noValidate>
        <Field id={`${uid}-s`} label={t("sx.editor.saveDlg.summary")} labelAside={<span className="sx-dlg__opt">{t("sx.ui.optional")}</span>}>
          {(a11y) => (
            <TextInput
              {...a11y}
              ref={summaryRef}
              value={summary}
              onChange={setSummary}
              maxLength={SUMMARY_MAX}
              placeholder={t("sx.editor.saveDlg.summaryPh")}
              disabled={running}
              aiId="admin.studio.editor.save.summary"
              aiLabel={t("sx.editor.saveDlg.summary")}
            />
          )}
        </Field>
        <Field
          id={`${uid}-v`}
          label={t("sx.editor.saveDlg.version")}
          labelAside={<span className="sx-dlg__opt">{t("sx.ui.optional")}</span>}
          hint={showBad ? "" : t("sx.editor.saveDlg.versionHint")}
          error={showBad ? t("sx.editor.saveDlg.versionBad") : ""}
        >
          {(a11y) => (
            <TextInput
              {...a11y}
              ref={versionRef}
              value={version}
              onChange={(v) => setVersion(cleanVersionInput(v))}
              inputMode="decimal"
              maxLength={VERSION_MAX}
              placeholder={suggest}
              mono
              disabled={running}
              aiId="admin.studio.editor.save.version"
              aiLabel={t("sx.editor.saveDlg.version")}
            />
          )}
        </Field>
        <SxDialogError error={error} />
      </form>
    </SxDialog>
  );
}

function RollbackDialog({ st, version, onClose }: { st: EditorState; version: StudioVersion; onClose: () => void }): ReactElement {
  const t = useTr();
  const uid = useId();
  const formId = `${uid}-form`;
  const aiId = "admin.studio.editor.rollback-modal";
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setFailed] = useActionError(st);

  async function run(e: FormEvent) {
    e.preventDefault();
    if (running) return;
    setRunning(true);
    setFailed(false);
    const ok = await st.rollback(version, reason.trim());
    setRunning(false);
    if (ok) onClose();
    else setFailed(true);
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={t("sx.editor.rollbackDlg.title", { v: version.version || "—" })}
      description={t("sx.editor.rollbackDlg.lead")}
      busy={running}
      aiId={aiId}
      footer={<Footer aiId={aiId} busy={running} onCancel={onClose} confirm={t("sx.editor.rollbackDlg.confirm")} icon={RotateCcwIcon} formId={formId} />}
    >
      <form id={formId} className="sx-dlg__form" onSubmit={run} noValidate>
        <VersionLine version={version} detail={st.detail} />
        <Field id={`${uid}-r`} label={t("sx.editor.rollbackDlg.reason")} labelAside={<span className="sx-dlg__opt">{t("sx.ui.optional")}</span>}>
          {(a11y) => (
            <TextArea
              {...a11y}
              value={reason}
              onChange={setReason}
              maxLength={NOTE_MAX}
              counter
              minRows={3}
              placeholder={t("sx.editor.rollbackDlg.reasonPh")}
              disabled={running}
              aiId={`${aiId}.note`}
              aiLabel={t("sx.editor.rollbackDlg.reason")}
            />
          )}
        </Field>
        <SxDialogError error={error} />
      </form>
    </SxDialog>
  );
}

function CloneDialog({ st, newVersion, onClose, onCloned }: { st: EditorState; newVersion: boolean; onClose: () => void; onCloned: (id: string, newVersion: boolean) => void }): ReactElement {
  const t = useTr();
  const uid = useId();
  const formId = `${uid}-form`;
  const aiId = newVersion ? "admin.studio.editor.new-version-modal" : "admin.studio.editor.clone-modal";
  const baseTitle = st.title || st.detail?.title || "";
  const [name, setName] = useState(() => (newVersion ? baseTitle : cloneDefaultName(t, baseTitle)));
  const [tried, setTried] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setFailed] = useActionError(st);
  const nameRef = useRef<HTMLInputElement>(null);
  const missing = !newVersion && !name.trim();
  const nameErr = tried && missing ? t("sx.err.required") : "";

  async function run(e: FormEvent) {
    e.preventDefault();
    if (running) return;
    setTried(true);
    if (missing) {
      nameRef.current?.focus();
      return;
    }
    setRunning(true);
    setFailed(false);
    const id = await st.clone((newVersion ? baseTitle : name).trim().slice(0, CLONE_NAME_MAX));
    setRunning(false);
    if (id) onCloned(id, newVersion);
    else setFailed(true);
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={t(newVersion ? "sx.editor.newVersionDlg.title" : "sx.editor.cloneDlg.title")}
      description={t(newVersion ? "sx.editor.newVersionDlg.lead" : "sx.editor.cloneDlg.lead")}
      busy={running}
      size="sm"
      aiId={aiId}
      initialFocus={newVersion ? undefined : nameRef}
      footer={<Footer aiId={aiId} busy={running} onCancel={onClose} confirm={t(newVersion ? "sx.editor.newVersionDlg.confirm" : "sx.editor.cloneDlg.confirm")} icon={newVersion ? GitBranchIcon : CopyIcon} formId={formId} />}
    >
      <form id={formId} className="sx-dlg__form" onSubmit={run} noValidate>
        {newVersion ? (
          <SxNote tone="warn" role="note">
            {t("sx.warn.K31__reaccept")}
          </SxNote>
        ) : (
          <Field id={`${uid}-n`} label={t("sx.editor.cloneDlg.name")} required error={nameErr}>
            {(a11y) => (
              <TextInput
                {...a11y}
                ref={nameRef}
                value={name}
                onChange={setName}
                maxLength={CLONE_NAME_MAX}
                disabled={running}
                aiId={`${aiId}.name`}
                aiLabel={t("sx.editor.cloneDlg.name")}
              />
            )}
          </Field>
        )}
        <SxDialogError error={error} />
      </form>
    </SxDialog>
  );
}

function VersionPreview({ st, version, onClose, onRollback }: { st: EditorState; version: StudioVersion; onClose: () => void; onRollback: (v: StudioVersion) => void }): ReactElement {
  const t = useTr();
  const labels = useStudioLabels();
  const policy = useSxFormPolicy(`pv:${version.id}`);
  const model = useSchemaModel({ ctor: st.full, layout: st.layout, runtimeTarget: st.runtimeTarget, idPrefix: "sx-ed-pv" });
  const diff = fieldNamesOf(st, changedKeys(version.payload, st.payload), labels, t);
  const rollback = canRollbackVersion(st.can.rollback, st.detail, version);
  const saveFirstId = `sx-ed-pv-${version.id}-savefirst`;
  return (
    <SxDrawer
      open
      onClose={onClose}
      size="lg"
      title={t("sx.layout.version", { n: version.version || "—" })}
      description={st.title || undefined}
      aiId="admin.studio.editor.preview"
      footer={
        rollback ? (
          <>
            {st.dirty ? (
              <span className="sx-vh" id={saveFirstId}>
                {t("sx.editor.saveFirst")}
              </span>
            ) : null}
            <SxButton
              variant="secondary"
              icon={RotateCcwIcon}
              disabled={Boolean(st.busy)}
              aria-disabled={st.dirty || undefined}
              aria-describedby={st.dirty ? saveFirstId : undefined}
              title={st.dirty ? t("sx.editor.saveFirst") : undefined}
              onClick={() => onRollback(version)}
              aiId="admin.studio.editor.versions.rollback"
            >
              {t("sx.editor.versions.rollback")}
            </SxButton>
          </>
        ) : undefined
      }
    >
      <VersionLine version={version} detail={st.detail} />
      <p className="sx-dlg__muted">{diff.length ? t("sx.editor.versions.diff", { list: labels.list(diff, 6) }) : t("sx.editor.versions.same")}</p>
      {model ? (
        <SxFormContext.Provider value={policy}>
          <SchemaForm model={model} payload={version.payload} onChange={noop} errors={{}} readOnly mode="view" recordId={st.recordId} recordTitle={null} />
        </SxFormContext.Provider>
      ) : null}
    </SxDrawer>
  );
}

export function EditorDialogs({
  st,
  dialog,
  onClose,
  onCloned,
  onRollback,
}: {
  st: EditorState;
  dialog: EditorDialog;
  onClose: () => void;
  onCloned: (id: string, newVersion: boolean) => void;
  onRollback: (v: StudioVersion) => void;
}): ReactElement | null {
  if (!dialog) return null;
  switch (dialog.kind) {
    case "submit":
      return <SubmitDialog st={st} onClose={onClose} />;
    case "publish":
      return <PublishDialog st={st} onClose={onClose} />;
    case "saveNote":
      return <SaveNoteDialog st={st} onClose={onClose} />;
    case "rollback":
      return <RollbackDialog key={dialog.version.id} st={st} version={dialog.version} onClose={onClose} />;
    case "clone":
      return <CloneDialog key={dialog.newVersion ? "nv" : "cl"} st={st} newVersion={dialog.newVersion} onClose={onClose} onCloned={onCloned} />;
    case "preview":
      return <VersionPreview key={dialog.version.id} st={st} version={dialog.version} onClose={onClose} onRollback={onRollback} />;
    default:
      return null;
  }
}

export function ConflictDialog({ st }: { st: EditorState }): ReactElement | null {
  const t = useTr();
  const labels = useStudioLabels();
  const aiId = "admin.studio.editor.conflict-modal";
  const conflict = st.conflict;
  if (!conflict) return null;
  const names = fieldNamesOf(st, conflict.fields, labels, t);
  const saving = st.busy === "save";
  return (
    <SxDialog
      open
      onClose={st.closeConflict}
      title={t("sx.editor.conflictDlg.title")}
      description={t("sx.editor.conflictDlg.lead")}
      busy={saving}
      size="sm"
      aiId={aiId}
      footer={
        <>
          <SxButton variant="secondary" icon={RefreshCwIcon} onClick={st.loadRemote} disabled={saving} aiId={`${aiId}.reload`}>
            {t("sx.editor.conflictDlg.reload")}
          </SxButton>
          <SxButton variant="primary" icon={SaveIcon} busy={saving} onClick={() => void st.overwrite()} aiId={`${aiId}.overwrite`}>
            {t("sx.editor.conflictDlg.overwrite")}
          </SxButton>
        </>
      }
    >
      <section className="sx-dlg__sec" aria-label={t("sx.editor.conflictDlg.fields")}>
        <p className="sx-dlg__h">{t("sx.editor.conflictDlg.fields")}</p>
        {names.length ? (
          <ul className="sx-dlg__list">
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="sx-dlg__muted">{t("sx.editor.conflictDlg.same")}</p>
        )}
      </section>
      <p className="sx-dlg__muted">{t("sx.editor.conflictDlg.note")}</p>
    </SxDialog>
  );
}

export async function confirmWithdraw(st: EditorState, t: SxTranslate): Promise<void> {
  await confirmDialog({
    title: t("sx.editor.withdrawDlg.title"),
    text: t("sx.editor.withdrawDlg.text"),
    confirmLabel: t("sx.editor.withdrawDlg.confirm"),
    cancelLabel: t("sx.ui.cancel"),
    tone: "primary",
    onConfirm: () => st.withdraw().then(noop, noop),
  });
}

export async function confirmRestore(st: EditorState, t: SxTranslate): Promise<void> {
  await confirmDialog({
    title: t("sx.editor.restoreDlg.title"),
    text: t("sx.editor.restoreDlg.text"),
    confirmLabel: t("sx.editor.restoreDlg.confirm"),
    cancelLabel: t("sx.ui.cancel"),
    tone: "primary",
    onConfirm: () => st.restore().then(noop, noop),
  });
}

export async function confirmArchive(st: EditorState, t: SxTranslate): Promise<void> {
  const text = st.dirty ? `${t("sx.editor.archiveDlg.text")} ${t("sx.editor.archiveDlg.dirty")}` : t("sx.editor.archiveDlg.text");
  await confirmDialog({
    title: t("sx.editor.archiveDlg.title"),
    text,
    confirmLabel: t("sx.editor.archiveDlg.confirm"),
    cancelLabel: t("sx.ui.cancel"),
    tone: "danger",
    onConfirm: () => st.archive().then(noop, noop),
  });
}

export function confirmCascade(w: SxWarning, t: SxTranslate): Promise<boolean> {
  return confirmDialog({
    title: t("sx.editor.cascade.title"),
    text: t(w.key, w.values ? { ...w.values } : undefined),
    confirmLabel: t("sx.editor.cascade.confirm"),
    cancelLabel: t("sx.ui.cancel"),
    tone: "primary",
  });
}
