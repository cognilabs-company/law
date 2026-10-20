"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../sx-form.css";
import "../editor/sx-editor.css";
import "./sx-journey.css";
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { getStudioConstructorDetail, studioDetailSnapshot, useStudioRegistry, type StudioCreationJourney } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import type { SchemaOnly } from "../contract";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { useEditorState, type EditorState } from "../editor/useEditorState";
import { SxFormContext } from "../form/formPolicy";
import { ArrowRightIcon, ExternalLinkIcon, RefreshCwIcon } from "../icons";
import { SxNote } from "../layout/Note";
import { SxPanel, SxSectionHeader } from "../layout/Panel";
import { SchemaErrorSummary } from "../schema/ErrorSummary";
import { focusFieldPath } from "../schema/focus";
import { SchemaForm } from "../schema/SchemaForm";
import { inlineCodeOf } from "../ctor/sources";
import { ManagePanel } from "../inline/ManagePanel";
import { inlineKindOf, newDraftOwner, objectOwner, topKeysOf } from "../inline/model";
import { movePendingOwner } from "../inline/pending";
import { useInlineAccess } from "../inline/useInlineEditing";
import { useStudioLabels } from "../useStudioLabels";
import type { JourneyStep } from "./steps";

export type StepApi = { changed: boolean; busy: boolean; ready: boolean; primary: () => void; later: () => void; errorSteps?: readonly string[] };

export type WizardStepProps = {
  journey: StudioCreationJourney;
  step: JourneyStep;
  steps: readonly JourneyStep[];
  objectId: string;
  code: string;
  onSaved: (objectId: string) => Promise<boolean>;
  onLater: (objectId: string) => Promise<void>;
  register: (api: StepApi | null) => void;
};

const SK_FIELDS = [0, 1, 2];

export function stepHeadingId(key: string): string {
  return `sx-jr-h-${key}`;
}

export function StepSkeleton(): ReactElement {
  const t = useTranslations("studio");
  return (
    <div className="sx-ed__sk sx-jr-sk" role="status" aria-busy="true">
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

export function useStepLinkLabel(): (code: string) => string {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  return (code: string) => {
    if (code.toUpperCase() === "K01") return t("sx.journeyRun.newCategory");
    return t("sx.journeyRun.newOf", { name: labels.ctorName(code, reg.items.find((x) => x.code === code)?.title) });
  };
}

export function StepShell({ step, hideLink = false, children }: { step: JourneyStep; hideLink?: boolean; children: ReactNode }): ReactElement {
  const t = useTranslations("studio");
  const linkLabel = useStepLinkLabel();
  return (
    <SxPanel as="div" id={step.key} className="sx-jr__panel">
      <SxSectionHeader
        as="h2"
        id={stepHeadingId(step.key)}
        title={step.label}
        lead={step.known && !step.required && !step.submit ? t("sx.journeyRun.optionalLead") : undefined}
        actions={
          step.link && !hideLink ? (
            <SxLinkButton variant="ghost" size="sm" href={step.link.href} target="_blank" iconEnd={ExternalLinkIcon} aiId={`admin.studio.wizard.link.${step.key}`}>
              {linkLabel(step.link.code)}
            </SxLinkButton>
          ) : undefined
        }
      />
      <div className="sx-jr__body">{children}</div>
    </SxPanel>
  );
}

export function StepProblem({ st }: { st: EditorState }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const errorText = useEditorErrorText();
  const retry = (
    <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={st.retryLoad} aiId="admin.studio.wizard.retry">
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
    const names = st.missing.map((c) => labels.ctorName(c, reg.items.find((x) => x.code === c)?.title));
    const first = st.missing[0] ?? "";
    return (
      <SxNote
        tone="warn"
        title={t("sx.editor.blockedTitle")}
        action={
          first ? (
            <SxLinkButton variant="secondary" size="sm" iconEnd={ArrowRightIcon} href={`/admin/studio/c/${encodeURIComponent(first)}`} aiId="admin.studio.wizard.goto-missing">
              {t("sx.cpage.goTo", { name: names[0] ?? first })}
            </SxLinkButton>
          ) : undefined
        }
      >
        {t("sx.guide.blocked", { list: labels.list(names) })}
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

const PANEL_KINDS: ReadonlySet<string> = new Set(["rule", "guarantee"]);

function panelCodeOf(step: JourneyStep): string {
  const code = (step.link?.code || step.code || "").trim().toUpperCase();
  const kind = inlineKindOf(code);
  return kind && PANEL_KINDS.has(kind) ? code : "";
}

function ExtraStep({ step, objectId, code, onSaved, onLater, register }: WizardStepProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const run = async (fn: () => Promise<unknown>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      await fn();
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  useEffect(() => {
    register({ changed: false, busy: running, ready: true, primary: () => void run(() => onSaved(objectId)), later: () => void run(() => onLater(objectId)) });
  });
  useEffect(() => () => register(null), [register]);

  const note = (
    <SxNote tone="info" role="note">
      {step.known && step.link ? t("sx.journeyRun.stepNoFields", { name: labels.ctorName(step.link.code, reg.items.find((x) => x.code === step.link?.code)?.title) }) : t("sx.journeyRun.stepOtherText")}
    </SxNote>
  );
  const panelCode = step.known ? panelCodeOf(step) : "";
  const managed = useInlineAccess(panelCode);

  return (
    <StepShell step={step} hideLink={!!panelCode && managed}>
      {panelCode ? <ManagePanel code={panelCode} mainCode={code} objectId={objectId} stepKey={step.key} fallback={note} /> : note}
    </StepShell>
  );
}

function FormStep({ journey, step, objectId, code, onSaved, onLater, register }: WizardStepProps): ReactElement {
  const fieldsKey = step.fields.join("\n");
  const only = useMemo<SchemaOnly>(() => ({ fields: fieldsKey ? fieldsKey.split("\n") : [] }), [fieldsKey]);
  const seedTitle = journey.title;
  const initialPayload = useMemo(() => (objectId ? undefined : { title: seedTitle }), [objectId, seedTitle]);
  const createdRef = useRef("");
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [draft] = useState(newDraftOwner);
  const owner = objectOwner(objectId) || draft;

  const st = useEditorState(
    { code, id: objectId || null, initialPayload },
    {
      only,
      idPrefix: `sx-jr-${step.key}`,
      heartbeat: true,
      live: true,
      onCreated: (d) => {
        createdRef.current = d.id;
        movePendingOwner(draft, objectOwner(d.id));
      },
    },
  );

  const run = async (fn: () => Promise<unknown>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      await fn();
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const ready = st.phase === "ready" && !!st.model && !st.blocked && !st.schemaFailed;

  const saveIfNeeded = async (): Promise<string | null> => {
    createdRef.current = "";
    const ok = await st.save();
    if (!ok) return null;
    return createdRef.current || objectId;
  };

  const primary = () =>
    run(async () => {
      if (!ready) return;
      st.policy.markSubmitted();
      const bad = Object.keys({ ...st.clientErrors, ...st.draftErrors });
      if (bad.length) {
        focusFieldPath(st.idPrefix, bad[0]);
        return;
      }
      if (st.readOnly) {
        if (objectId) await onSaved(objectId);
        return;
      }
      if (!objectId || st.dirty) {
        const id = await saveIfNeeded();
        if (id) await onSaved(id);
        return;
      }
      await onSaved(objectId);
    });

  const later = () =>
    run(async () => {
      let id = objectId;
      if (ready && !st.readOnly && st.dirty) {
        const saved = await saveIfNeeded();
        if (!saved) return;
        id = saved;
      }
      await onLater(id);
    });

  useEffect(() => {
    register({ changed: st.changed && !st.readOnly, busy: running || st.busy !== "", ready, primary: () => void primary(), later: () => void later() });
  });
  useEffect(() => () => register(null), [register]);

  const problem = <StepProblem st={st} />;
  let body: ReactNode;
  if (st.phase === "loading") body = <StepSkeleton />;
  else if (st.phase !== "ready" || st.blocked || st.schemaFailed) body = problem;
  else if (!st.model) body = <StepSkeleton />;
  else {
    const model = st.model;
    body = (
      <SxFormContext.Provider value={st.policy}>
        {st.showSummary ? <SchemaErrorSummary model={model} errors={st.errors} onPick={(path) => focusFieldPath(st.idPrefix, path)} /> : null}
        <div className="sx-jr__form">
          <SchemaForm
            model={model}
            payload={st.payload}
            onChange={st.setPayload}
            onDraftError={st.setDraftError}
            errors={st.errors}
            warnings={st.warnings}
            readOnly={st.readOnly}
            mode={st.formMode}
            recordId={st.recordId}
            recordTitle={model.titleField ? null : { value: st.recordTitle, onChange: st.setRecordTitle, placeholderKey: st.layout.recordTitlePlaceholderKey }}
            only={only}
            inlineOwner={owner}
          />
        </div>
      </SxFormContext.Provider>
    );
  }

  const linkCode = step.link?.code.trim().toUpperCase() ?? "";
  const inlineHere = !!linkCode && step.fields.some((f) => inlineCodeOf("", f) === linkCode);
  const managed = useInlineAccess(inlineHere ? linkCode : "");

  return (
    <StepShell step={step} hideLink={inlineHere && managed}>
      {body}
    </StepShell>
  );
}

function useSchemaHas(code: string, fields: readonly string[], enabled: boolean): boolean {
  const [loaded, setLoaded] = useState<{ code: string; keys: ReadonlySet<string> } | null>(null);
  useEffect(() => {
    if (!enabled || !code) return;
    let live = true;
    void getStudioConstructorDetail(code).then((c) => {
      if (live && c) setLoaded({ code, keys: topKeysOf(c) });
    });
    return () => {
      live = false;
    };
  }, [code, enabled]);
  if (!enabled) return false;
  const snap = loaded && loaded.code === code ? null : studioDetailSnapshot(code);
  const keys = loaded && loaded.code === code ? loaded.keys : snap ? topKeysOf(snap) : null;
  return !!keys && fields.some((f) => keys.has(f));
}

export function WizardStep(props: WizardStepProps): ReactElement {
  const panel = props.step.form && props.step.known && !props.step.submit && !!panelCodeOf(props.step);
  const has = useSchemaHas(props.code, props.step.fields, panel);
  if (!props.step.form || (panel && !has)) return <ExtraStep {...props} />;
  return <FormStep {...props} />;
}
