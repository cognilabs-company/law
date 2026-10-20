"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../sx-form.css";
import "../editor/sx-editor.css";
import "./sx-inline.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { getStudioConstructorDetail, studioDetailSnapshot, useStudioRegistry, type StudioDetail } from "@/lib/services/studio";
import { layerCount } from "@/lib/layers";
import { SxButton, SxLinkButton } from "../Button";
import { ConflictDialog } from "../editor/EditorDialogs";
import { isSaveShortcut } from "../editor/model";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { useEditorState, type EditorInit, type EditorState } from "../editor/useEditorState";
import { SxFormContext } from "../form/formPolicy";
import { ExternalLinkIcon, RefreshCwIcon, SaveIcon, SendIcon, Undo2Icon, ctorGlyph } from "../icons";
import { SxDrawer } from "../layout/Drawer";
import { SxNote } from "../layout/Note";
import { SchemaErrorSummary } from "../schema/ErrorSummary";
import { focusFieldPath } from "../schema/focus";
import { SchemaForm } from "../schema/SchemaForm";
import { StatusPill } from "../StatusPill";
import { useStudioLabels } from "../useStudioLabels";
import { InlineDepth } from "./context";
import { inlineKeys, inlineKindOf, objectHref, prefillOf, topKeysOf, withRuleKey, type InlineTarget } from "./model";

export type InlineSettled = { objectId: string; title: string; status: string; submitted: boolean; isNew: boolean; value: string };

type Props = { target: InlineTarget; onClose: () => void; onSettled: (r: InlineSettled) => void };
type Flags = { busy: boolean; dirty: boolean };

const AI = "admin.studio.inline";
const SK_FIELDS = [0, 1, 2];

function Skeleton(): ReactElement {
  const t = useTranslations("studio");
  return (
    <div className="sx-ed__sk sx-inl-dw__sk" role="status" aria-busy="true">
      <span className="sx-vh">{t("sx.ui.loading")}</span>
      {SK_FIELDS.map((i) => (
        <span key={i} className="sx-ed__skfield" aria-hidden="true">
          <span className="sx-sk sx-ed__sklabel" />
          <span className="sx-sk sx-ed__skinput" />
        </span>
      ))}
    </div>
  );
}

function Problem({ st }: { st: EditorState }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errorText = useEditorErrorText();
  const retry = (
    <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={st.retryLoad} aiId={`${AI}.retry`}>
      {t("sx.ui.retry")}
    </SxButton>
  );
  if (st.phase === "unknown-ctor") return <SxNote tone="error" title={t("sx.editor.unknownTitle")}>{t("sx.editor.unknownText")}</SxNote>;
  if (st.phase === "not-found") return <SxNote tone="error" title={t("sx.editor.notFoundTitle")}>{t("sx.editor.notFoundText")}</SxNote>;
  if (st.phase === "load-error") {
    const e = errorText(st.loadError);
    return (
      <SxNote tone="error" title={e.title} action={retry}>
        {e.text}
      </SxNote>
    );
  }
  if (st.blocked) {
    return (
      <SxNote tone="warn" title={t("sx.editor.blockedTitle")}>
        {t("sx.guide.blocked", { list: labels.list(st.missing.map((c) => labels.ctorName(c))) })}
      </SxNote>
    );
  }
  if (st.schemaFailed) {
    return (
      <SxNote tone="error" title={t("sx.form.schemaFail")} action={retry}>
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  }
  return null;
}

function useCtorKeys(code: string): ReadonlySet<string> | null {
  const [state, setState] = useState<{ code: string; keys: ReadonlySet<string> } | null>(() => {
    const snap = studioDetailSnapshot(code);
    return snap ? { code, keys: topKeysOf(snap) } : null;
  });
  useEffect(() => {
    let live = true;
    void getStudioConstructorDetail(code).then((c) => {
      if (live) setState({ code, keys: topKeysOf(c) });
    });
    return () => {
      live = false;
    };
  }, [code]);
  return state && state.code === code ? state.keys : null;
}

function valueOf(target: InlineTarget): string {
  return target.kind === "new" ? "" : target.value;
}

function initOf(target: InlineTarget, keys: ReadonlySet<string>): EditorInit {
  if (target.kind === "new") return { code: target.code, id: null, initialPayload: prefillOf(target.code, keys, target.title, target.context) };
  if (target.kind === "edit") return { code: target.code, id: null, ctx: target.ctx };
  return { code: target.code, id: target.id };
}

export function InlineDrawer({ target, onClose, onSettled }: Props): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const [cur, setCur] = useState<{ n: number; target: InlineTarget }>({ n: 0, target });
  const [foot, setFoot] = useState<HTMLDivElement | null>(null);
  const [flags, setFlags] = useState<Flags>({ busy: false, dirty: false });
  const code = cur.target.code;
  const keys = useCtorKeys(code);
  const kind = inlineKindOf(code) ?? "factor";
  const k = inlineKeys(kind);
  const isNew = cur.target.kind === "new" || (cur.target.kind === "object" && cur.target.isNew);
  const ctorName = labels.ctorName(code, reg.items.find((c) => c.code === code)?.title);
  const swap = (next: InlineTarget) => setCur((c) => ({ n: c.n + 1, target: next }));

  return (
    <SxDrawer
      open
      onClose={onClose}
      size="lg"
      title={t(isNew ? k.newTitle : k.editTitle)}
      description={
        <span className="sx-inl-dw__ctor">
          {ctorGlyph(code, undefined, { size: 16 })}
          <span>{ctorName}</span>
        </span>
      }
      footer={<div ref={setFoot} className="sx-inl-dw__foot" />}
      busy={flags.busy}
      dirty={flags.dirty}
      aiId={`${AI}.drawer`}
    >
      <InlineDepth.Provider value={1}>
        {keys ? (
          <InlineEditor key={cur.n} target={cur.target} keys={keys} foot={foot} onFlags={setFlags} onSwap={swap} onSettled={onSettled} onClose={onClose} />
        ) : (
          <Skeleton />
        )}
      </InlineDepth.Provider>
    </SxDrawer>
  );
}

type EditorProps = {
  target: InlineTarget;
  keys: ReadonlySet<string>;
  foot: HTMLDivElement | null;
  onFlags: (f: Flags) => void;
  onSwap: (next: InlineTarget) => void;
  onSettled: (r: InlineSettled) => void;
  onClose: () => void;
};

function InlineEditor({ target, keys, foot, onFlags, onSwap, onSettled, onClose }: EditorProps): ReactElement {
  const t = useTranslations("studio");
  const [init] = useState(() => initOf(target, keys));
  const createdRef = useRef<StudioDetail | null>(null);
  const value = valueOf(target);
  const isNew = target.kind === "new" || (target.kind === "object" && target.isNew);
  const label = target.kind === "new" ? target.title : target.label;

  const st = useEditorState(init, {
    idPrefix: "sx-inl",
    heartbeat: true,
    live: true,
    onCreated: (d) => {
      createdRef.current = d;
    },
    onRedirect: (objectId) => onSwap({ kind: "object", code: target.code, id: objectId, label, value, isNew: false }),
  });

  const busy = st.busy !== "";
  const dirty = st.changed && !st.readOnly;
  useEffect(() => {
    onFlags({ busy, dirty });
  }, [busy, dirty, onFlags]);

  const ready = st.phase === "ready" && !!st.model && !st.blocked && !st.schemaFailed;
  const objectId = st.mode === "object" ? (st.detail?.id ?? (target.kind === "object" ? target.id : "")) : "";
  const canSave = ready && st.can.save && (st.mode !== "object" || st.dirty);
  const canSubmit = ready && st.can.submit;

  const settle = (id: string, status: string, submitted: boolean, title: string) => {
    if (!id) return;
    onSettled({ objectId: id, title: title || st.title || label, status, submitted, isNew, value });
  };

  const save = async () => {
    if (!canSave) return;
    createdRef.current = null;
    const ok = await st.save();
    if (!ok) return;
    const created = createdRef.current as StudioDetail | null;
    if (created) {
      settle(created.id, created.statusRaw || created.status || "draft", false, created.title);
      onSwap({ kind: "object", code: target.code, id: created.id, label: created.title || label, value, isNew });
      return;
    }
    settle(objectId, st.detail?.statusRaw || "draft", false, st.title);
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (!(await st.prepareSubmit())) return;
    createdRef.current = null;
    const ok = await st.submit();
    const created = createdRef.current as StudioDetail | null;
    const id = created?.id || objectId;
    if (ok) {
      settle(id, created?.statusRaw || "submitted", true, created?.title ?? st.title);
      onClose();
      return;
    }
    if (created) {
      settle(created.id, created.statusRaw || "draft", false, created.title);
      onSwap({ kind: "object", code: target.code, id: created.id, label: created.title || label, value, isNew });
    }
  };

  const keyRef = useRef(save);
  useEffect(() => {
    keyRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSaveShortcut(e)) return;
      e.preventDefault();
      if (e.repeat || layerCount("overlay") > 1) return;
      void keyRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onChange = (next: Parameters<EditorState["setPayload"]>[0], path: string) => {
    if (!isNew) {
      st.setPayload(next, path);
      return;
    }
    const known = keys.size ? keys : topKeysOf(st.full);
    st.setPayload(withRuleKey(target.code, known, st.payload, next, path), path);
  };

  const buttons = (
    <>
      <SxButton variant="secondary" onClick={onClose} disabled={busy} aiId={`${AI}.cancel`}>
        {t(ready && !st.readOnly ? "sx.ui.cancel" : "sx.ui.close")}
      </SxButton>
      {ready && !st.readOnly ? (
        <>
          <SxButton variant="secondary" icon={SaveIcon} busy={st.busy === "save"} disabled={!canSave || (busy && st.busy !== "save")} onClick={() => void save()} aiId={`${AI}.save`}>
            {t("sx.ui.save")}
          </SxButton>
          <SxButton
            variant="primary"
            icon={SendIcon}
            busy={st.busy === "submit" || st.busy === "check"}
            disabled={!canSubmit || (busy && st.busy !== "submit" && st.busy !== "check")}
            onClick={() => void submit()}
            aiId={`${AI}.submit`}
          >
            {t("sx.editor.submit")}
          </SxButton>
        </>
      ) : null}
    </>
  );

  let body: ReactElement;
  if (st.phase === "loading" || (st.phase === "ready" && !st.model && !st.schemaFailed && !st.blocked)) body = <Skeleton />;
  else if (!ready) body = <Problem st={st} />;
  else {
    const model = st.model!;
    body = (
      <SxFormContext.Provider value={st.policy}>
        {st.showSummary ? <SchemaErrorSummary model={model} errors={st.errors} onPick={(path) => focusFieldPath(st.idPrefix, path)} /> : null}
        <div className="sx-inl-dw__form">
          <SchemaForm
            model={model}
            payload={st.payload}
            onChange={onChange}
            onDraftError={st.setDraftError}
            errors={st.errors}
            warnings={st.warnings}
            readOnly={st.readOnly}
            mode={st.formMode}
            recordId={st.recordId}
            recordTitle={model.titleField ? null : { value: st.recordTitle, onChange: st.setRecordTitle, placeholderKey: st.layout.recordTitlePlaceholderKey }}
          />
        </div>
      </SxFormContext.Provider>
    );
  }

  return (
    <div className="sx-inl-dw" data-ai-id={`${AI}.editor`} data-ai-type="section" data-ai-label={t(inlineKeys(inlineKindOf(target.code) ?? "factor")[isNew ? "newTitle" : "editTitle"])}>
      <StateLine st={st} isNew={isNew} objectId={objectId} list={target.kind === "new" && target.context.list === true} />
      <AlertLine st={st} />
      {body}
      {foot ? createPortal(buttons, foot) : null}
      <ConflictDialog st={st} />
    </div>
  );
}

function StateLine({ st, isNew, objectId, list }: { st: EditorState; isNew: boolean; objectId: string; list: boolean }): ReactElement | null {
  const t = useTranslations("studio");
  if (st.phase !== "ready" || st.blocked) return null;
  const hasObject = st.mode === "object" && !!st.detail;
  const text = t(isNew && !hasObject ? (list ? "sx.inline.lead.newList" : "sx.inline.lead.new") : st.mode === "runtime-edit" ? "sx.inline.lead.edit" : "sx.inline.lead.object");
  const next = st.next.key && t.has(st.next.key) && hasObject ? t(st.next.key, st.next.values) : "";
  return (
    <div className="sx-inl-dw__state" role="note">
      {hasObject ? <StatusPill status={st.status} size="sm" /> : null}
      <p className="sx-inl-dw__lead">{next || text}</p>
      {objectId ? (
        <SxLinkButton variant="ghost" size="sm" href={objectHref(objectId)} target="_blank" iconEnd={ExternalLinkIcon} className="sx-inl-dw__full" aiId={`${AI}.open-full`}>
          {t("sx.inline.openFull")}
        </SxLinkButton>
      ) : null}
    </div>
  );
}

function AlertLine({ st }: { st: EditorState }): ReactElement | null {
  const t = useTranslations("studio");
  const errorText = useEditorErrorText();
  const a = st.alert;
  if (!a || a.kind === "file") return null;
  if (a.kind === "action") {
    const e = errorText(a.error);
    return (
      <SxNote tone="error" role="alert" title={e.title} onDismiss={st.dismissAlert}>
        {e.text}
      </SxNote>
    );
  }
  if (a.kind === "locked") {
    return (
      <SxNote
        tone="warn"
        role="alert"
        title={t("sx.editor.alert.lockedTitle")}
        onDismiss={st.dismissAlert}
        action={
          a.withdraw ? (
            <SxButton variant="ghost" size="sm" icon={Undo2Icon} busy={st.busy === "withdraw"} onClick={() => void st.withdraw()} aiId={`${AI}.withdraw`}>
              {t("sx.editor.withdraw")}
            </SxButton>
          ) : undefined
        }
      >
        {t(a.withdraw ? "sx.editor.alert.lockedText" : "sx.editor.alert.lockedNoWithdraw")}
      </SxNote>
    );
  }
  if (a.kind === "publishFail") {
    return (
      <SxNote tone="error" role="alert" title={t("sx.editor.alert.publishFailTitle")} onDismiss={st.dismissAlert}>
        {a.text || t("sx.editor.alert.publishFailText")}
      </SxNote>
    );
  }
  return (
    <SxNote
      tone="warn"
      role="status"
      title={t(a.conflict ? "sx.editor.alert.conflictTitle" : "sx.editor.alert.remoteTitle")}
      action={
        <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={st.loadRemote} aiId={`${AI}.remote.load`}>
          {t("sx.editor.alert.loadNew")}
        </SxButton>
      }
    >
      {t(a.conflict ? "sx.editor.alert.conflictKeep" : "sx.editor.alert.remoteText")}
    </SxNote>
  );
}
