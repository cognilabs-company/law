"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-journey.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { useRouter } from "@/i18n/navigation";
import { getStudioConstructorDetail, studioDetailSnapshot, type StudioConstructor, type StudioJourneyType } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { useLeaveGuard } from "../editor/useLeaveGuard";
import { Picker } from "../form/Picker";
import { prefersReducedMotion } from "../hooks";
import { ArrowsClockwiseIcon, CheckCircleIcon, MagnifyingGlassIcon } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxOutline } from "../layout/Outline";
import { SxPage } from "../layout/Page";
import { SxPanel } from "../layout/Panel";
import { SxProgress } from "../shared/Progress";
import { CREATE_HOME_HREF, JOURNEY_CODE, journeyObjectId } from "../shared/journeyLinks";
import { journeyPatchFor, laterPatchFor, outlineStateOf, unionSteps } from "./model";
import { journeySteps, leftoverFields, nextStepKey, stepLabelKey, type JourneyStep } from "./steps";
import { useWizardJourney, type JourneyPatch } from "./useWizardJourney";
import { WizardReview } from "./WizardReview";
import { WizardStep, stepHeadingId, type StepApi } from "./WizardStep";

type Flags = { changed: boolean; busy: boolean; ready: boolean; errorSteps: string };
type After = { kind: "step"; key: string } | { kind: "home" } | { kind: "done" } | null;
type FullFor = { code: string; ctor: StudioConstructor | null };

const NO_FLAGS: Flags = { changed: false, busy: false, ready: false, errorSteps: "" };

function topLevelKeys(ctor: StudioConstructor | null): string[] {
  if (!ctor) return [];
  const ctx = new Set(ctor.contextFields);
  return ctor.typed.filter((f) => !f.hidden && !ctx.has(f.key)).map((f) => f.key);
}

function objectHref(id: string): string {
  return `/admin/studio/o/${encodeURIComponent(id)}`;
}

export function Wizard({ id }: { id: string }): ReactElement {
  const t = useTranslations("studio");
  const router = useRouter();
  const errText = useEditorErrorText();
  const wj = useWizardJourney(id);
  const journey = wj.journey;
  const jtype: StudioJourneyType = journey?.type ?? "service";
  const code = JOURNEY_CODE[jtype];
  const [createdId, setCreatedId] = useState("");
  const [picked, setPicked] = useState("");
  const [finished, setFinished] = useState(false);
  const [flags, setFlags] = useState<Flags>(NO_FLAGS);
  const [fullFor, setFullFor] = useState<FullFor>({ code: "", ctor: null });
  const apiRef = useRef<StepApi | null>(null);
  const afterRef = useRef<After>(null);
  const focusRef = useRef(false);

  const objectId = createdId || (journey ? journeyObjectId(journey) : "");

  const hasJourney = journey !== null;
  useEffect(() => {
    if (!hasJourney) return;
    let alive = true;
    void getStudioConstructorDetail(code).then((c) => {
      if (alive) setFullFor({ code, ctor: c });
    });
    return () => {
      alive = false;
    };
  }, [code, hasJourney]);

  const full = fullFor.code === code ? fullFor.ctor : studioDetailSnapshot(code);
  const keysText = topLevelKeys(full).join("\n");
  const leftovers = useMemo(() => leftoverFields(jtype, keysText ? keysText.split("\n") : []), [jtype, keysText]);
  const steps: JourneyStep[] = useMemo(() => (journey ? journeySteps(jtype, journey, leftovers, (k) => t(stepLabelKey(k))) : []), [journey, jtype, leftovers, t]);

  const fallback = steps.find((s) => s.state === "current")?.key ?? steps[0]?.key ?? "";
  const active = picked && steps.some((s) => s.key === picked) ? picked : fallback;
  const activeStep = steps.find((s) => s.key === active) ?? null;
  const done = finished || journey?.status === "completed";
  const busy = flags.busy || wj.patching;

  const guard = useLeaveGuard(flags.changed && !busy && !done, {
    title: t("sx.editor.leave.title"),
    text: t("sx.editor.leave.text"),
    confirmLabel: t("sx.editor.leave.confirm"),
    cancelLabel: t("sx.editor.leave.stay"),
  });

  const register = useCallback((api: StepApi | null) => {
    apiRef.current = api;
    const next: Flags = { changed: !!api?.changed, busy: !!api?.busy, ready: !!api?.ready, errorSteps: (api?.errorSteps ?? []).join("\n") };
    setFlags((f) => (f.changed === next.changed && f.busy === next.busy && f.ready === next.ready && f.errorSteps === next.errorSteps ? f : next));
  }, []);

  useEffect(() => {
    if (!focusRef.current || !active) return;
    focusRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const panel = document.getElementById(active);
      const heading = document.getElementById(stepHeadingId(active));
      panel?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      heading?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  const moveTo = (key: string) => {
    if (!key) return;
    focusRef.current = true;
    setPicked(key);
  };

  const go = (key: string) => {
    if (!key || key === active) return;
    if (!flags.changed) {
      moveTo(key);
      return;
    }
    void confirmDialog({
      title: t("sx.editor.leave.title"),
      text: t("sx.journeyRun.leaveText"),
      confirmLabel: t("sx.journeyRun.leaveConfirm"),
      cancelLabel: t("sx.editor.leave.stay"),
      tone: "danger",
    }).then((ok) => {
      if (ok) moveTo(key);
    });
  };

  const leaveHome = async () => {
    afterRef.current = null;
    await guard.release();
    router.push(CREATE_HOME_HREF);
  };

  const finish = async () => {
    afterRef.current = null;
    await guard.release();
    setFinished(true);
  };

  const runAfter = async (after: After) => {
    if (!after) return;
    if (after.kind === "step") {
      afterRef.current = null;
      moveTo(after.key);
    } else if (after.kind === "home") await leaveHome();
    else await finish();
  };

  const send = async (input: JourneyPatch, after: After): Promise<boolean> => {
    afterRef.current = after;
    const ok = await wj.patch(input);
    if (ok) await runAfter(after);
    return ok;
  };

  const onSaved = async (step: JourneyStep, objId: string): Promise<boolean> => {
    if (!journey) return false;
    if (objId && objId !== objectId) setCreatedId(objId);
    const next = nextStepKey(steps, step.key);
    return send(journeyPatchFor(journey, step.key, next, objId, code), { kind: "step", key: next });
  };

  const onLater = async (step: JourneyStep, objId: string): Promise<void> => {
    if (!journey) return;
    if (objId && objId !== objectId) setCreatedId(objId);
    await send(laterPatchFor(journey, step.key, objId), { kind: "home" });
  };

  const submitted = async (objId: string): Promise<void> => {
    if (!journey) return;
    if (objId && objId !== objectId) setCreatedId(objId);
    const known = steps.filter((s) => s.known).map((s) => s.key);
    const context = objId ? { ...journey.context, studio_object_id: objId, constructor_code: code } : { ...journey.context };
    await send({ completedSteps: unionSteps(journey.completedSteps, known), currentStep: "", context }, { kind: "done" });
  };

  const onReviewCreated = (objId: string, isSubmitted: boolean) => {
    if (!journey || !objId) return;
    if (isSubmitted) {
      void submitted(objId);
      return;
    }
    setCreatedId(objId);
    void wj.patch(laterPatchFor(journey, activeStep?.key ?? "", objId));
  };

  const retry = async () => {
    const ok = await wj.retryPatch();
    if (ok) await runAfter(afterRef.current);
  };

  const errorSteps = useMemo(() => new Set(flags.errorSteps ? flags.errorSteps.split("\n") : []), [flags.errorSteps]);
  const total = journey ? (journey.totalCount ?? steps.length) : 0;
  const percent = journey?.progress ?? null;
  const progressText = journey ? t("sx.journeyRun.progress", { done: journey.completedCount, total }) : "";

  const title = journey?.title || (wj.phase === "missing" ? t("sx.journeyRun.crumb") : wj.phase === "error" ? t("sx.ui.errorTitle") : "");
  const crumbs = [{ label: t("sx.journeyRun.crumb"), href: CREATE_HOME_HREF }];

  let body: ReactNode;
  let actions: ReactNode;
  let below: ReactNode;

  if (wj.phase === "loading") {
    body = (
      <div className="sx-jr" data-loading="">
        <SxPanel as="div" className="sx-jr__panel">
          <div className="sx-ed__sk sx-jr-sk" role="status" aria-busy="true">
            <span className="sx-vh">{t("sx.ui.loading")}</span>
            <span className="sx-sk sx-jr-sk__line" />
            <span className="sx-sk sx-jr-sk__line" />
          </div>
        </SxPanel>
      </div>
    );
  } else if (wj.phase === "missing") {
    body = (
      <SxEmpty
        icon={MagnifyingGlassIcon}
        title={t("sx.journeyRun.missingTitle")}
        text={t("sx.journeyRun.missingText")}
        action={
          <SxLinkButton variant="secondary" href={CREATE_HOME_HREF} aiId="admin.studio.wizard.back-list">
            {t("sx.journeyRun.backList")}
          </SxLinkButton>
        }
      />
    );
  } else if (wj.phase === "error" || !journey) {
    const e = errText(wj.error);
    body = (
      <SxNote
        tone="error"
        title={e.title}
        action={
          <SxButton variant="ghost" size="sm" icon={ArrowsClockwiseIcon} onClick={wj.reload} aiId="admin.studio.wizard.retry">
            {t("sx.ui.retry")}
          </SxButton>
        }
      >
        {e.text}
      </SxNote>
    );
  } else if (done) {
    body = (
      <SxEmpty
        icon={CheckCircleIcon}
        title={t("sx.journeyRun.doneTitle")}
        text={t("sx.journeyRun.doneText")}
        action={
          <span className="sx-jr-doneacts">
            {objectId ? (
              <SxLinkButton variant="primary" href={objectHref(objectId)} aiId="admin.studio.wizard.open-record">
                {t("sx.journeyRun.openRecord")}
              </SxLinkButton>
            ) : null}
            <SxLinkButton variant="secondary" href={CREATE_HOME_HREF} aiId="admin.studio.wizard.back-list">
              {t("sx.journeyRun.backList")}
            </SxLinkButton>
          </span>
        }
      />
    );
  } else {
    const outline = steps.map((s) => ({ id: s.key, label: s.label, state: outlineStateOf(s.state, s.key, errorSteps) }));
    const blockedByPatch = wj.patchError !== null && wj.patchError !== undefined;
    const isReview = !!activeStep?.submit;
    actions = (
      <>
        <SxButton variant="secondary" className="sx-jr__later" disabled={busy} onClick={() => apiRef.current?.later()} aiId="admin.studio.wizard.later">
          {t("sx.journeyRun.later")}
        </SxButton>
        <SxButton
          variant="primary"
          busy={busy}
          aria-disabled={blockedByPatch || !flags.ready || undefined}
          onClick={() => {
            if (!blockedByPatch && !busy && flags.ready) apiRef.current?.primary();
          }}
          aiId="admin.studio.wizard.next"
        >
          {t(isReview ? "sx.editor.submit" : "sx.journeyRun.saveNext")}
        </SxButton>
      </>
    );
    below = (
      <div className="sx-jr-prog">
        <div className="sx-jr-prog__row">
          <span className="sx-jr-prog__text sx-num">{progressText}</span>
          <SxProgress value={percent} label={progressText} size="md" className="sx-jr-prog__bar" />
          <span className="sx-jr-prog__pct sx-num">{percent === null ? "—" : t("sx.journeyRun.percent", { n: Math.round(percent) })}</span>
        </div>
        {wj.remoteChanged ? (
          <SxNote
            tone="info"
            role="status"
            action={
              <SxButton variant="ghost" size="sm" icon={ArrowsClockwiseIcon} onClick={wj.adopt} aiId="admin.studio.wizard.refresh">
                {t("sx.journeyRun.refresh")}
              </SxButton>
            }
          >
            {t("sx.journeyRun.changedElsewhere")}
          </SxNote>
        ) : blockedByPatch ? (
          <SxNote
            tone="error"
            action={
              <SxButton variant="ghost" size="sm" icon={ArrowsClockwiseIcon} busy={wj.patching} onClick={() => void retry()} aiId="admin.studio.wizard.retry">
                {t("sx.ui.retry")}
              </SxButton>
            }
          >
            {t("sx.journeyRun.patchFail")}
          </SxNote>
        ) : null}
      </div>
    );
    body = (
      <div className="sx-jr">
        <aside className="sx-jr__aside">
          <SxOutline items={outline} label={t("sx.journeyRun.steps")} activeId={active} onSelect={go} aiId="admin.studio.wizard.steps" />
        </aside>
        <div className="sx-jr__main">
          <div className="sx-jr__pick">
            <Picker
              label={t("sx.journeyRun.stepPick")}
              size="sm"
              options={steps.map((s) => ({ value: s.key, label: s.label }))}
              value={active}
              clearable={false}
              onChange={(v) => go(v)}
              aiId="admin.studio.wizard.step-pick"
            />
          </div>
          <div className="sx-jr__anchors">
            {steps
              .filter((s) => s.key !== active)
              .map((s) => (
                <span key={s.key} id={s.key} className="sx-jr__anchor" />
              ))}
          </div>
          {activeStep ? (
            activeStep.submit ? (
              <WizardReview
                key={`${objectId || "new"}:${activeStep.key}`}
                journey={journey}
                steps={steps}
                objectId={objectId}
                code={code}
                onSubmitted={() => submitted(objectId)}
                onGoStep={go}
                register={register}
                onCreated={onReviewCreated}
                onLater={(objId) => onLater(activeStep, objId)}
              />
            ) : (
              <WizardStep
                key={`${objectId || "new"}:${activeStep.key}`}
                journey={journey}
                step={activeStep}
                steps={steps}
                objectId={objectId}
                code={code}
                onSaved={(objId) => onSaved(activeStep, objId)}
                onLater={(objId) => onLater(activeStep, objId)}
                register={register}
              />
            )
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <SxPage layout="record" title={title} crumbs={crumbs} need="edit" aiId="admin.studio.wizard" actions={actions} below={below}>
      {body}
    </SxPage>
  );
}
