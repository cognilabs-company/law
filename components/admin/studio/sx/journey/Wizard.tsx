"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-journey.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import Menu, { type MenuEntry } from "@/components/ui/Menu";
import { useRouter } from "@/i18n/navigation";
import { getStudioConstructorDetail, studioDetailSnapshot, useStudioAccess, useStudioRegistry, type StudioConstructor, type StudioCreationJourney, type StudioJourneyType } from "@/lib/services/studio";
import { notify } from "@/lib/toast";
import { SxButton, SxLinkButton } from "../Button";
import { eligibilityProducerOf } from "../ctor/sources";
import { useLeaveGuard } from "../editor/useLeaveGuard";
import { Picker } from "../form/Picker";
import { prefersReducedMotion } from "../hooks";
import { ArchiveIcon, ArrowRightIcon, BanIcon, CircleCheckIcon, glyph, moreGlyph, RefreshCwIcon, RotateCcwIcon, SearchIcon } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxOutline } from "../layout/Outline";
import { SxPage } from "../layout/Page";
import { SxPanel } from "../layout/Panel";
import { SxProgress } from "../shared/Progress";
import { CREATE_HOME_HREF, JOURNEY_CODE, journeyObjectId } from "../shared/journeyLinks";
import { useStudioLabels } from "../useStudioLabels";
import { canContinueJourney, isJourneyClosed, journeyActionsFor, journeyCapsOf, journeyConfirmTextKey, journeyStatusOf, useJourneyDefinitions, type JourneyAction } from "./journeyApi";
import { useJourneyErrorText } from "./journeyErrors";
import { useJourneyOwnerLabel } from "./JourneyTable";
import { JourneyStatusPill } from "./JourneyStatusPill";
import { journeyPatchFor, laterPatchFor, outlineStateOf, unionSteps } from "./model";
import { journeyStepKeys, journeySteps, leftoverFields, missingRequired, nextStepKey, stepDefsFor, stepLabel, type JourneyStep } from "./steps";
import { useWizardJourney, type JourneyPatch } from "./useWizardJourney";
import { WizardReview } from "./WizardReview";
import { WizardStep, stepHeadingId, type StepApi } from "./WizardStep";

type Flags = { changed: boolean; busy: boolean; ready: boolean; errorSteps: string };
type After = { kind: "step"; key: string } | { kind: "home" } | { kind: "done" } | null;
type FullFor = { code: string; ctor: StudioConstructor | null };

const NO_FLAGS: Flags = { changed: false, busy: false, ready: false, errorSteps: "" };
const AI = "admin.studio.wizard";
const ACTION_ICON = { abandon: BanIcon, archive: ArchiveIcon, restore: RotateCcwIcon } as const;

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
  const labels = useStudioLabels();
  const access = useStudioAccess();
  const errText = useJourneyErrorText();
  const ownerOf = useJourneyOwnerLabel();
  const wj = useWizardJourney(id);
  const journey = wj.journey;
  const jtype: StudioJourneyType = journey?.type ?? "service";
  const code = JOURNEY_CODE[jtype];
  const defsState = useJourneyDefinitions(journey !== null);
  const [createdId, setCreatedId] = useState("");
  const [picked, setPicked] = useState("");
  const [finished, setFinished] = useState(false);
  const [unfinished, setUnfinished] = useState<string[]>([]);
  const [flags, setFlags] = useState<Flags>(NO_FLAGS);
  const [fullFor, setFullFor] = useState<FullFor>({ code: "", ctor: null });
  const [reopened, setReopened] = useState(false);
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
  const journeyKeysText = journeyStepKeys(journey).join("\n");
  const def = defsState.defs?.[jtype] ?? null;
  const registry = useStudioRegistry();
  const eligibilityCode = eligibilityProducerOf(registry.items);
  const stepDefs = useMemo(() => stepDefsFor(jtype, def, journeyKeysText ? journeyKeysText.split("\n") : [], { eligibilityCode }), [jtype, def, journeyKeysText, eligibilityCode]);
  const topKeys = useMemo(() => new Set(keysText ? keysText.split("\n") : []), [keysText]);
  const leftovers = useMemo(() => leftoverFields(jtype, stepDefs, keysText ? keysText.split("\n") : []), [jtype, stepDefs, keysText]);
  const steps: JourneyStep[] = useMemo(
    () => (journey ? journeySteps({ defs: stepDefs, mainCode: code, journey, leftovers, topKeys, label: (k, title) => stepLabel(k, (key) => t(key), title) }) : []),
    [journey, stepDefs, code, leftovers, topKeys, t],
  );

  const fallback = steps.find((s) => s.state === "current")?.key ?? steps[0]?.key ?? "";
  const active = picked && steps.some((s) => s.key === picked) ? picked : fallback;
  const activeStep = steps.find((s) => s.key === active) ?? null;
  const status = journeyStatusOf(journey?.status ?? "");
  const canAct = access.canEdit && !!journey;
  const caps = journeyCapsOf(journey);
  const canContinue = canAct && canContinueJourney(status, caps);
  const closed = journey ? isJourneyClosed(journey.status) && !(reopened && canContinue) : false;
  const done = !closed && (finished || status === "completed");
  const busy = flags.busy || wj.patching || wj.acting !== "";
  const missing = useMemo(() => (journey ? missingRequired(steps, journey.completedSteps) : []), [steps, journey]);

  const guard = useLeaveGuard(flags.changed && !busy && !done && !closed, {
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

  const finish = async (res: StudioCreationJourney | null) => {
    afterRef.current = null;
    const st = journeyStatusOf(res?.status ?? "");
    if (res && st && st !== "completed") {
      const left = missingRequired(steps, res.completedSteps).map((s) => s.key);
      const named = res.missingSteps.filter((k) => steps.some((s) => s.key === k && s.required && !s.submit));
      const list = left.length ? left : named;
      setUnfinished(list.length ? list : ["?"]);
      if (list[0]) moveTo(list[0]);
      return;
    }
    setUnfinished([]);
    await guard.release();
    setFinished(true);
  };

  const runAfter = async (after: After, res: StudioCreationJourney | null) => {
    if (!after) return;
    if (after.kind === "step") {
      afterRef.current = null;
      moveTo(after.key);
    } else if (after.kind === "home") await leaveHome();
    else await finish(res);
  };

  const send = async (input: JourneyPatch, after: After): Promise<boolean> => {
    afterRef.current = after;
    const res = await wj.patch(input);
    if (res) await runAfter(after, res);
    return !!res;
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
    const review = steps.find((s) => s.submit)?.key ?? "";
    const context = objId ? { ...journey.context, studio_object_id: objId, constructor_code: code } : { ...journey.context };
    await send({ completedSteps: unionSteps(journey.completedSteps, review ? [review] : []), currentStep: "", context }, { kind: "done" });
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
    const res = await wj.retryPatch();
    if (res) await runAfter(afterRef.current, res);
  };

  const runAction = async (action: JourneyAction) => {
    if (!journey || busy) return;
    if (action !== "restore") {
      const ok = await confirmDialog({
        title: t(`sx.journeyRun.confirm.${action}Title`, { name: journey.title || t("sx.ui.untitled") }),
        text: t(journeyConfirmTextKey(action, caps)),
        confirmLabel: t(`sx.journeyRun.act.${action}`),
        cancelLabel: t("sx.ui.cancel"),
        tone: action === "abandon" ? "danger" : "primary",
      });
      if (!ok) return;
    }
    const res = await wj.act(action);
    if (!res) return;
    setReopened(false);
    notify.success(t(`sx.journeyRun.toast.${action}`));
    if (action === "restore") {
      setFinished(false);
      setUnfinished([]);
    }
  };

  const errorSteps = useMemo(() => new Set(flags.errorSteps ? flags.errorSteps.split("\n") : []), [flags.errorSteps]);
  const total = journey ? (journey.totalCount ?? steps.length) : 0;
  const percent = journey?.progress ?? null;
  const progressText = journey ? t("sx.journeyRun.progress", { done: journey.completedCount, total }) : "";
  const allowed = canAct ? journeyActionsFor(journey?.status ?? "", caps) : [];
  const menuActions = allowed.filter((a) => a !== "restore" || !closed);
  const canRestore = allowed.includes("restore");
  const actFailed = wj.actError ? errText(wj.actError) : null;

  const title = journey?.title || (wj.phase === "missing" ? t("sx.journeyRun.crumb") : wj.phase === "error" ? t("sx.ui.errorTitle") : "");
  const crumbs = [{ label: t("sx.journeyRun.crumb"), href: CREATE_HOME_HREF }];
  const owner = journey ? ownerOf(journey) : null;
  const pill = journey && wj.phase === "ready" ? <JourneyStatusPill status={finished && status !== "completed" && !closed ? "completed" : journey.status} size="sm" /> : null;
  const meta = journey ? (
    <span className="sx-jr-meta">
      {pill}
      {owner && owner.text !== "—" ? (
        <span title={owner.title}>
          {t("sx.journeyRun.ownerLine", { name: owner.text })}
        </span>
      ) : null}
      {journey.createdAt ? <span>{t("sx.journeyRun.startedOn", { when: labels.date(journey.createdAt) })}</span> : null}
    </span>
  ) : undefined;

  const menu = (items: readonly JourneyAction[]): ReactNode => {
    if (!items.length) return null;
    const entries: MenuEntry[] = items.map((a) => ({
      key: a,
      label: t(`sx.journeyRun.act.${a}`),
      icon: glyph(ACTION_ICON[a], { size: 16 }),
      danger: a === "abandon",
      disabled: busy || undefined,
      onSelect: () => void runAction(a),
      aiId: `${AI}.menu.${a}`,
    }));
    return (
      <Menu
        items={entries}
        label={t("sx.ui.more")}
        className="sx-pop sx-menu"
        triggerClassName="sx-ibtn"
        icon={moreGlyph()}
        align="end"
        tipAlign="end"
        busy={wj.acting !== ""}
        aiId={`${AI}.menu`}
      />
    );
  };

  const actNote = actFailed ? (
    <SxNote tone="error" title={actFailed.title}>
      {actFailed.text}
    </SxNote>
  ) : null;

  let body: ReactNode;
  let actions: ReactNode;
  let below: ReactNode;

  const waitingDefs = wj.phase === "ready" && defsState.phase === "loading";

  if (wj.phase === "loading" || waitingDefs) {
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
        icon={SearchIcon}
        title={t("sx.journeyRun.missingTitle")}
        text={t("sx.journeyRun.missingText")}
        action={
          <SxLinkButton variant="secondary" href={CREATE_HOME_HREF} aiId={`${AI}.back-list`}>
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
          <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={wj.reload} aiId={`${AI}.retry`}>
            {t("sx.ui.retry")}
          </SxButton>
        }
      >
        {e.text}
      </SxNote>
    );
  } else if (closed) {
    actions = menu(menuActions);
    below = actNote;
    body = (
      <SxEmpty
        icon={status === "archived" ? ArchiveIcon : BanIcon}
        title={t(status === "archived" ? "sx.journeyRun.archivedTitle" : "sx.journeyRun.abandonedTitle")}
        text={t(!canAct ? "sx.journeyRun.closedTextRead" : canContinue ? "sx.journeyRun.closedTextContinue" : canRestore ? "sx.journeyRun.closedText" : "sx.journeyRun.closedTextLocked")}
        action={
          <span className="sx-jr-doneacts">
            {canContinue ? (
              <SxButton variant="primary" iconEnd={ArrowRightIcon} aria-disabled={busy || undefined} onClick={() => !busy && setReopened(true)} aiId={`${AI}.continue`}>
                {t("sx.journeyRun.resume")}
              </SxButton>
            ) : canRestore ? (
              <SxButton variant="primary" icon={RotateCcwIcon} busy={wj.acting === "restore"} aria-disabled={busy || undefined} onClick={() => void runAction("restore")} aiId={`${AI}.restore`}>
                {t("sx.journeyRun.act.restore")}
              </SxButton>
            ) : null}
            {objectId ? (
              <SxLinkButton variant="secondary" href={objectHref(objectId)} aiId={`${AI}.open-record`}>
                {t("sx.journeyRun.openRecord")}
              </SxLinkButton>
            ) : null}
            <SxLinkButton variant="secondary" href={CREATE_HOME_HREF} aiId={`${AI}.back-list`}>
              {t("sx.journeyRun.backList")}
            </SxLinkButton>
          </span>
        }
      />
    );
  } else if (done) {
    actions = menu(menuActions);
    below = actNote;
    body = (
      <SxEmpty
        icon={CircleCheckIcon}
        title={t("sx.journeyRun.doneTitle")}
        text={t("sx.journeyRun.doneText")}
        action={
          <span className="sx-jr-doneacts">
            {objectId ? (
              <SxLinkButton variant="primary" href={objectHref(objectId)} aiId={`${AI}.open-record`}>
                {t("sx.journeyRun.openRecord")}
              </SxLinkButton>
            ) : null}
            <SxLinkButton variant="secondary" href={CREATE_HOME_HREF} aiId={`${AI}.back-list`}>
              {t("sx.journeyRun.backList")}
            </SxLinkButton>
          </span>
        }
      />
    );
  } else {
    const outline = steps.map((s) => ({ id: s.key, label: s.required || s.submit ? s.label : t("sx.journeyRun.optionalLabel", { name: s.label }), state: outlineStateOf(s.state, s.key, errorSteps) }));
    const blockedByPatch = wj.patchError !== null && wj.patchError !== undefined;
    const patchText = blockedByPatch ? errText(wj.patchError) : null;
    const isReview = !!activeStep?.submit;
    const unfinishedNames = unfinished.filter((k) => k !== "?").map((k) => steps.find((s) => s.key === k)?.label ?? k);
    actions = (
      <>
        <SxButton variant="secondary" className="sx-jr__later" disabled={busy} onClick={() => apiRef.current?.later()} aiId={`${AI}.later`}>
          {t("sx.journeyRun.later")}
        </SxButton>
        <SxButton
          variant="primary"
          busy={busy}
          aria-disabled={blockedByPatch || !flags.ready || undefined}
          onClick={() => {
            if (!blockedByPatch && !busy && flags.ready) apiRef.current?.primary();
          }}
          aiId={`${AI}.next`}
        >
          {t(isReview ? "sx.editor.submit" : "sx.journeyRun.saveNext")}
        </SxButton>
        {menu(menuActions)}
      </>
    );
    below = (
      <div className="sx-jr-prog">
        <div className="sx-jr-prog__row">
          <span className="sx-jr-prog__text sx-num">{progressText}</span>
          <SxProgress value={percent} label={progressText} size="md" className="sx-jr-prog__bar" />
          <span className="sx-jr-prog__pct sx-num">{percent === null ? "—" : t("sx.journeyRun.percent", { n: Math.round(percent) })}</span>
        </div>
        {defsState.phase === "fallback" ? (
          <SxNote tone="info" role="note">
            {t("sx.journeyRun.defsFallback")}
          </SxNote>
        ) : null}
        {actNote}
        {unfinished.length ? (
          <SxNote tone="warn" role="status" title={t("sx.journeyRun.notCompletedTitle")}>
            {unfinishedNames.length ? t("sx.journeyRun.notCompletedText", { list: labels.list(unfinishedNames) }) : t("sx.journeyRun.notCompletedGeneric")}
          </SxNote>
        ) : null}
        {wj.remoteChanged ? (
          <SxNote
            tone="info"
            role="status"
            action={
              <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={wj.adopt} aiId={`${AI}.refresh`}>
                {t("sx.journeyRun.refresh")}
              </SxButton>
            }
          >
            {t("sx.journeyRun.changedElsewhere")}
          </SxNote>
        ) : blockedByPatch ? (
          <SxNote
            tone="error"
            title={t("sx.journeyRun.patchFail")}
            action={
              <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} busy={wj.patching} onClick={() => void retry()} aiId={`${AI}.retry`}>
                {t("sx.ui.retry")}
              </SxButton>
            }
          >
            {patchText?.text}
          </SxNote>
        ) : null}
      </div>
    );
    body = (
      <div className="sx-jr">
        <aside className="sx-jr__aside">
          <SxOutline items={outline} label={t("sx.journeyRun.steps")} activeId={active} onSelect={go} aiId={`${AI}.steps`} />
        </aside>
        <div className="sx-jr__main">
          <div className="sx-jr__pick">
            <Picker
              label={t("sx.journeyRun.stepPick")}
              size="sm"
              options={outline.map((s) => ({ value: s.id, label: s.label }))}
              value={active}
              clearable={false}
              onChange={(v) => go(v)}
              aiId={`${AI}.step-pick`}
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
                missing={missing}
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
    <SxPage
      layout="record"
      title={title}
      crumbs={crumbs}
      need="edit"
      aiId={AI}
      meta={meta}
      actions={actions}
      below={below}
    >
      {body}
    </SxPage>
  );
}
