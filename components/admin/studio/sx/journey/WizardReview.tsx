"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../sx-form.css";
import "../editor/sx-editor.css";
import "./sx-journey.css";
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { StudioCreationJourney } from "@/lib/services/studio";
import type { SchemaOnly } from "../contract";
import { EditorDialogs } from "../editor/EditorDialogs";
import { useEditorState } from "../editor/useEditorState";
import { SxFormContext } from "../form/formPolicy";
import { SxButton } from "../Button";
import { CheckCircleIcon, CircleDashedIcon, glyph } from "../icons";
import { SxNote } from "../layout/Note";
import { SchemaForm } from "../schema/SchemaForm";
import { useSchemaModel } from "../schema/useSchemaModel";
import { sxStatus } from "../status";
import { useStudioLabels } from "../useStudioLabels";
import { stepOfPath, type JourneyStep } from "./steps";
import { StepProblem, StepShell, StepSkeleton, type StepApi } from "./WizardStep";

export type WizardReviewProps = {
  journey: StudioCreationJourney;
  steps: readonly JourneyStep[];
  objectId: string;
  code: string;
  onSubmitted: () => Promise<void>;
  onGoStep: (key: string) => void;
  register: (api: StepApi | null) => void;
  onCreated?: (objectId: string, submitted: boolean) => void;
  onLater?: (objectId: string) => Promise<void>;
};

const noop = () => undefined;
const NO_FIELDS: readonly string[] = [];

export function reviewErrorSteps(steps: readonly JourneyStep[], paths: readonly string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const key = stepOfPath(steps, p);
    if (key && !out.includes(key)) out.push(key);
  }
  return steps.filter((s) => out.includes(s.key)).map((s) => s.key);
}

export function WizardReview({ journey, steps, objectId, code, onSubmitted, onGoStep, register, onCreated, onLater }: WizardReviewProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const step = steps.find((s) => s.submit) ?? steps[steps.length - 1];
  const fields = step?.fields ?? NO_FIELDS;
  const fieldsKey = fields.join("\n");
  const only = useMemo<SchemaOnly>(() => ({ fields: fieldsKey ? fieldsKey.split("\n") : [] }), [fieldsKey]);
  const seedTitle = journey.title;
  const initialPayload = useMemo(() => (objectId ? undefined : { title: seedTitle }), [objectId, seedTitle]);
  const runningRef = useRef(false);
  const firedRef = useRef(false);
  const fromRef = useRef("");
  const laterRef = useRef(false);
  const createdRef = useRef("");
  const [running, setRunning] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState<{ from: string } | null>(null);

  const st = useEditorState(
    { code, id: objectId || null, initialPayload },
    {
      idPrefix: "sx-jr-review",
      heartbeat: true,
      live: true,
      onCreated: (d) => {
        if (laterRef.current) {
          createdRef.current = d.id;
          return;
        }
        onCreated?.(d.id, sxStatus(d.statusRaw || d.status).stage >= 1);
      },
    },
  );
  const view = useSchemaModel({ ctor: st.full, layout: st.layout, runtimeTarget: st.runtimeTarget, idPrefix: st.idPrefix, only });

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
  const stage = sxStatus(st.status).stage;

  const primary = () =>
    run(async () => {
      if (!ready) return;
      if (objectId && st.detail && stage >= 1 && !st.dirty) {
        firedRef.current = true;
        await onSubmitted();
        return;
      }
      setTried(true);
      const ok = await st.prepareSubmit();
      if (ok) {
        setTried(false);
        fromRef.current = st.status;
        setDialog(true);
      }
    });

  const later = () =>
    run(async () => {
      let id = objectId;
      if (ready && !st.readOnly && st.dirty) {
        laterRef.current = !objectId;
        createdRef.current = "";
        let ok = false;
        try {
          ok = await st.save();
        } finally {
          laterRef.current = false;
        }
        if (!ok) return;
        id = objectId || createdRef.current;
      }
      await onLater?.(id);
    });

  useEffect(() => {
    if (!sent || firedRef.current || !st.detail) return;
    if (st.status !== sent.from && sxStatus(st.status).stage >= 1) {
      firedRef.current = true;
      void onSubmitted();
    }
  }, [sent, st.status, st.detail, onSubmitted]);

  const errorSteps = tried ? reviewErrorSteps(steps, Object.keys(st.errors)) : [];
  const errorKey = errorSteps.join("\n");

  useEffect(() => {
    register({
      changed: st.changed && !st.readOnly,
      busy: running || st.busy !== "",
      ready,
      primary: () => void primary(),
      later: () => void later(),
      errorSteps: errorKey ? errorKey.split("\n") : [],
    });
  });
  useEffect(() => () => register(null), [register]);

  const closeDialog = () => {
    setDialog(false);
    setSent({ from: fromRef.current });
  };

  const others = steps.filter((s) => !s.submit);
  const errorNames = errorSteps.map((k) => steps.find((s) => s.key === k)?.label ?? k);

  let body: ReactNode;
  if (st.phase === "loading") body = <StepSkeleton />;
  else if (st.phase !== "ready" || st.blocked || st.schemaFailed) body = <StepProblem st={st} />;
  else if (!view) body = <StepSkeleton />;
  else {
    body = (
      <SxFormContext.Provider value={st.policy}>
        <div className="sx-jr__form">
          <SchemaForm
            model={view}
            payload={st.payload}
            onChange={st.setPayload}
            onDraftError={st.setDraftError}
            errors={st.errors}
            warnings={st.warnings}
            readOnly={st.readOnly}
            mode={st.formMode}
            recordId={st.recordId}
            recordTitle={null}
            only={only}
          />
        </div>
      </SxFormContext.Provider>
    );
  }

  if (!step) return <StepSkeleton />;

  return (
    <StepShell step={step}>
      <p className="sx-jr-review__lead">{t("sx.journeyRun.reviewLead")}</p>
      <ul className="sx-jr-review__steps" aria-label={t("sx.journeyRun.steps")}>
        {others.map((s) => (
          <li key={s.key}>
            <button type="button" className="sx-jr-review__step" data-state={s.state === "done" ? "done" : "todo"} onClick={() => onGoStep(s.key)} data-ai-id={`admin.studio.wizard.review.step.${s.key}`} data-ai-type="button" data-ai-label={s.label}>
              {glyph(s.state === "done" ? CheckCircleIcon : CircleDashedIcon, { size: 16, className: "sx-jr-review__mark" })}
              <span className="sx-jr-review__name">{s.label}</span>
              <span className="sx-vh">{t(s.state === "done" ? "sx.guide.done" : "sx.guide.notDone")}</span>
            </button>
          </li>
        ))}
      </ul>
      {errorSteps.length ? (
        <SxNote tone="error" title={t("sx.journeyRun.reviewErrors", { list: labels.list(errorNames) })}>
          <span className="sx-jr-review__fix">
            {errorSteps.map((k, i) => (
              <SxButton key={k} variant="ghost" size="sm" onClick={() => onGoStep(k)} aiId={`admin.studio.wizard.review.fix.${k}`}>
                {errorNames[i]}
              </SxButton>
            ))}
          </span>
        </SxNote>
      ) : null}
      {body}
      <EditorDialogs st={st} dialog={dialog ? { kind: "submit" } : null} onClose={closeDialog} onCloned={noop} onRollback={noop} />
    </StepShell>
  );
}
