"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { aiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import {
  listApprovalUsers,
  saveApprovalRoute,
  studioErrorOf,
  type StudioApprovalMode,
  type StudioDeadlineUnit,
  type StudioPerson,
  type StudioRoute,
  type StudioRouteGroup,
  type StudioRouteInput,
  type StudioRouteScope,
} from "@/lib/services/studio";
import { StudioErrorNote } from "../bits";
import { useStudioHuman } from "../human";
import { useStudioLabels } from "../sx/useStudioLabels";
import { IconAlert, IconChevronLeft, IconChevronRight, IconCircleCheck, IconMinus, IconPlus } from "@/components/icons";

// A route is written for one of three levels (contract §16): everything, a
// section, or a single constructor. Editing keeps the level it was saved at.
export type RouteMode = { kind: "new"; scope?: StudioRouteScope; key?: string } | { kind: "edit"; route: StudioRoute };
export type RouteSaved = { input: StudioRouteInput; route: StudioRoute };

const AI = "admin.studio.settings.routes.modal";
const MAX_STEPS = 8;
const SCOPES: StudioRouteScope[] = ["global", "group", "constructor"];
const MODES: StudioApprovalMode[] = ["any", "all", "quorum"];
const UNITS: StudioDeadlineUnit[] = ["minute", "hour", "day"];
export const ROUTE_STATUSES = ["active", "archived"] as const;

type Step = { key: number; title: string; approverIds: string[]; mode: StudioApprovalMode; required: string; sla: string; unit: StudioDeadlineUnit };
type Props = {
  mode: RouteMode;
  codes: { code: string; label: string }[];
  groups: StudioRouteGroup[];
  taken: string[];
  superadmin: StudioPerson | null;
  onClose: () => void;
  onSaved: (s: RouteSaved) => void;
};

export default function RouteModal({ mode, ...rest }: Omit<Props, "mode"> & { mode: RouteMode | null }) {
  const { t } = useStudioHuman();
  const title = mode?.kind === "edit" ? t("settings.routes.editTitle") : t("settings.routes.newTitle");
  const key = mode ? (mode.kind === "edit" ? `e-${mode.route.id || mode.route.scopeKey}` : `n-${mode.scope ?? ""}-${mode.key ?? ""}`) : "";
  return (
    <Modal open={mode !== null} onClose={rest.onClose} title={title} aiId={AI} wide>
      {mode ? <RouteForm key={key} mode={mode} {...rest} /> : null}
    </Modal>
  );
}

const whole = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

function RouteForm({ mode, codes, groups, taken, superadmin, onClose, onSaved }: Props) {
  const { t, fieldErr, role } = useStudioHuman();
  const labels = useStudioLabels();
  const uid = useId();
  const base = mode.kind === "edit" ? mode.route : null;
  const locked = Boolean(base) || (mode.kind === "new" && Boolean(mode.scope));
  const [scope, setScope] = useState<StudioRouteScope>(base?.scopeType ?? (mode.kind === "new" ? mode.scope ?? "constructor" : "constructor"));
  const [scopeKey, setScopeKey] = useState(base ? base.scopeKey : mode.kind === "new" ? mode.key ?? "" : "");
  const [title, setTitle] = useState(base?.title ?? (mode.kind === "new" && mode.scope === "global" ? t("settings.routes.globalName") : ""));
  const [status, setStatus] = useState<string>(base?.status === "archived" || base?.status === "inactive" ? "archived" : "active");
  // A stage written before approvers were people (a role only) opens with
  // nobody picked: the admin names the people.
  const [steps, setSteps] = useState<Step[]>(() =>
    (base?.steps ?? []).map((s, i) => ({ key: i + 1, title: s.title || (s.role ? role(s.role) : ""), approverIds: s.approverIds, mode: s.mode, required: String(s.required || 1), sla: s.deadlineValue ? String(s.deadlineValue) : "", unit: s.deadlineUnit })),
  );
  const [hours, setHours] = useState(String(base?.deadlineHours ?? 24));
  const [needSuper, setNeedSuper] = useState(base?.requireSuperadmin ?? true);
  const [autoPublish, setAutoPublish] = useState(base?.autoPublishWhenEmpty ?? true);
  const [nextKey, setNextKey] = useState(100);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [serverErr, setServerErr] = useState<Record<string, string>>({});
  const key = scope === "global" ? "*" : scopeKey;
  const ctorCode = scope === "constructor" ? scopeKey : "";
  // Who may approve: the backend's own list for this constructor (active
  // staff with Studio access), searched inside the picker. People already on
  // the route keep their names even if they are no longer in that list.
  const [people, setPeople] = useState<{ code: string; items: SearchOption[] } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    listApprovalUsers("", ctorCode, c.signal)
      .then((users) => setPeople({ code: ctorCode, items: users.map((u) => ({ value: u.id, label: u.name, sub: [u.employeeCode, u.roles.map(role).join(", ")].filter(Boolean).join(" · ") })) }))
      .catch((e: unknown) => {
        if (!c.signal.aborted) logApiError("studio.route.approvers", e);
      });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctorCode]);
  const listed = people?.code === ctorCode ? people.items : [];
  const saved = (base?.steps ?? []).flatMap((x) => x.approvers).filter((x) => x.name && !listed.some((o) => o.value === x.id)).map((x) => ({ value: x.id, label: x.name }));
  const approverOpts = [...listed, ...saved.filter((x, n) => saved.findIndex((y) => y.value === x.value) === n)];

  const errs: Record<string, string> = {};
  if (scope === "constructor" && !scopeKey) errs.scope_key = t("settings.routes.errCode");
  if (scope === "group" && !scopeKey) errs.scope_key = t("settings.routes.errGroup");
  if (!title.trim()) errs.title = t("fieldErr.required");
  if (!Number.isFinite(whole(hours)) || whole(hours) < 1) errs.deadline_hours = t("settings.routes.errSla");
  steps.forEach((s, i) => {
    if (!s.title.trim()) errs[`steps.${i}.title`] = t("fieldErr.required");
    if (!s.approverIds.length) errs[`steps.${i}.approver_user_ids`] = t("settings.routes.errApprovers");
    if (s.mode === "quorum" && !(whole(s.required) >= 1 && whole(s.required) <= Math.max(1, s.approverIds.length))) errs[`steps.${i}.required_approvals`] = t("settings.routes.errQuorum", { n: Math.max(1, s.approverIds.length) });
    if (s.sla.trim() && !(whole(s.sla) >= 1)) errs[`steps.${i}.deadline_value`] = t("settings.routes.errSla");
  });
  const show = (k: string) => (tried ? errs[k] : "") || fieldErr(serverErr[k] || "");
  // Nothing checks the record at all: no stages and no superadmin at the end.
  const unchecked = !steps.length && !needSuper && autoPublish;

  const patch = (i: number, p: Partial<Step>) => setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  function addStep() {
    if (steps.length >= MAX_STEPS) return;
    setSteps((cur) => [...cur, { key: nextKey, title: "", approverIds: [], mode: "all", required: "1", sla: "", unit: "hour" }]);
    setNextKey((k) => k + 1);
  }

  async function save() {
    const input: StudioRouteInput = {
      scopeType: scope,
      scopeKey: key,
      title: title.trim(),
      steps: steps.map((s) => ({ title: s.title.trim(), approverIds: s.approverIds, mode: s.mode, required: s.mode === "quorum" ? whole(s.required) : 1, deadlineValue: s.sla.trim() ? whole(s.sla) : null, deadlineUnit: s.unit })),
      finalAction: base?.finalAction ?? "publish",
      deadlineHours: whole(hours),
      requireSuperadmin: needSuper,
      autoPublishWhenEmpty: autoPublish,
      changeRequestRestart: base?.changeRequestRestart ?? "current",
      status,
    };
    setBusy(true);
    setError(null);
    setServerErr({});
    try {
      const route = await saveApprovalRoute(input);
      onSaved({ input, route });
    } catch (err) {
      logApiError("studio.route.save", err);
      setServerErr(studioErrorOf(err).fieldErrors);
      setError(err);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errs).length) return;
    if (unchecked && !confirm) {
      setConfirm(true);
      return;
    }
    void save();
  }

  const groupOpts = groups.map((g) => ({ value: g.key, label: labels.groupName(g.key, g.title) }));
  const codeOpts = codes.map((c) => ({ value: c.code, label: c.label }));
  const statusOpts = ROUTE_STATUSES.map((s) => ({ value: s, label: t(`settings.routes.status_${s}`) }));
  const unitOpts = UNITS.map((u) => ({ value: u, label: t(`settings.routes.slaUnit.${u}`) }));
  const scopeName = scope === "group" ? groupOpts.find((g) => g.value === scopeKey)?.label : codeOpts.find((c) => c.value === scopeKey)?.label;

  if (confirm) {
    return (
      <div className="stu-sform" role="alertdialog" aria-labelledby={`${uid}-ce`}>
        <div className="stu-rwarn">
          <IconAlert aria-hidden />
          <div>
            <b id={`${uid}-ce`}>{t("settings.routes.confirmEmptyTitle")}</b>
            <p>{t("settings.routes.confirmEmptyText")}</p>
          </div>
        </div>
        <div className="stu-sform__acts">
          <button type="button" className="btn btn--line btn--sm" onClick={() => setConfirm(false)} disabled={busy} data-ai-id={`${AI}.confirm.back`} data-ai-type="button" data-ai-label={t("actions.cancel")}>
            {t("actions.cancel")}
          </button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => void save()} disabled={busy} data-ai-id={`${AI}.confirm.save`} data-ai-type="button" data-ai-label={t("settings.routes.confirmEmptyYes")}>
            {busy ? <span className="stu-spin" aria-hidden /> : <IconCircleCheck aria-hidden />}
            {t("settings.routes.confirmEmptyYes")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="stu-sform" onSubmit={submit} noValidate>
      <div className="stu-fld" data-ai-id={`${AI}.scope`} data-ai-type="group" data-ai-label={t("settings.routes.scopeLabel")}>
        <span className="stu-fld__l">{t("settings.routes.scopeLabel")}</span>
        <div className="stu-seg stu-rseg" role="radiogroup" aria-label={t("settings.routes.scopeLabel")}>
          {SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={scope === s}
              className={`stu-seg__b${scope === s ? " on" : ""}`}
              disabled={locked && scope !== s}
              onClick={() => {
                setScope(s);
                setScopeKey("");
              }}
            >
              {t(`settings.routes.scope.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="stu-sform__grid">
        {scope !== "global" ? (
          <div className="stu-fld" data-ai-id={`${AI}.target`} data-ai-type="select" data-ai-label={scope === "group" ? t("settings.routes.group") : t("settings.routes.constructor")}>
            <span className="stu-fld__l">
              {scope === "group" ? t("settings.routes.group") : t("settings.routes.constructor")}
              <em className="stu-req">*</em>
            </span>
            {locked && scopeKey ? (
              <input type="text" value={scopeName ?? ""} readOnly aria-label={scope === "group" ? t("settings.routes.group") : t("settings.routes.constructor")} />
            ) : (
              <Select
                value={scopeKey}
                onChange={setScopeKey}
                options={scope === "group" ? groupOpts : codeOpts}
                placeholder={scope === "group" ? t("settings.routes.pickGroup") : t("settings.routes.pickCtor")}
                ariaLabel={scope === "group" ? t("settings.routes.group") : t("settings.routes.constructor")}
              />
            )}
            {show("scope_key") ? <p className="stu-ferr">{show("scope_key")}</p> : null}
            {!base && scopeKey && taken.includes(`${scope}:${scopeKey}`) ? <p className="stu-hint">{t("settings.routes.replaces")}</p> : null}
          </div>
        ) : null}
        <div className="stu-fld" data-ai-id={`${AI}.status`} data-ai-type="select" data-ai-label={t("settings.routes.status")}>
          <span className="stu-fld__l">{t("settings.routes.status")}</span>
          <Select value={status} onChange={setStatus} options={statusOpts} ariaLabel={t("settings.routes.status")} />
          {show("status") ? <p className="stu-ferr">{show("status")}</p> : null}
        </div>
        <div className="stu-fld stu-fld--textarea">
          <label className="stu-fld__l" htmlFor={`${uid}-title`}>
            <span>
              {t("settings.routes.routeTitle")}
              <em className="stu-req">*</em>
            </span>
          </label>
          <input
            id={`${uid}-title`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            placeholder={t("settings.routes.titlePh")}
            aria-invalid={Boolean(show("title"))}
            autoComplete="off"
            data-ai-id={`${AI}.title`}
            data-ai-type="input"
            data-ai-label={t("settings.routes.routeTitle")}
          />
          {show("title") ? <p className="stu-ferr">{show("title")}</p> : null}
        </div>
      </div>

      <fieldset className="stu-sfset" data-ai-id={`${AI}.steps`} data-ai-type="section" data-ai-label={t("settings.routes.steps")}>
        <legend className="stu-fld__l">{t("settings.routes.steps")}</legend>
        <p className="stu-hint">{t("settings.routes.stepsHint")}</p>
        <ol className="stu-srsteps">
          {steps.map((s, i) => (
            <li key={s.key} className="stu-srstep stu-srstep--wide" data-ai-id={aiId(`${AI}.step`, i + 1)} data-ai-type="section" data-ai-label={t("settings.routes.stepN", { n: i + 1 })}>
              <span className="stu-srstep__n" aria-hidden>
                {i + 1}
              </span>
              <div className="stu-srstep__f stu-srstep__f--stack">
                <div className="stu-fld">
                  <label className="stu-fld__l" htmlFor={`${uid}-st-${s.key}`}>
                    <span>
                      {t("settings.routes.stepTitle")}
                      <em className="stu-req">*</em>
                    </span>
                  </label>
                  <input
                    id={`${uid}-st-${s.key}`}
                    type="text"
                    value={s.title}
                    onChange={(e) => patch(i, { title: e.target.value.slice(0, 80) })}
                    placeholder={t("settings.routes.stepTitlePh")}
                    aria-invalid={Boolean(show(`steps.${i}.title`))}
                    autoComplete="off"
                    data-ai-id={aiId(`${AI}.step`, i + 1, "title")}
                    data-ai-type="input"
                    data-ai-label={t("settings.routes.stepTitle")}
                  />
                  {show(`steps.${i}.title`) ? <p className="stu-ferr">{show(`steps.${i}.title`)}</p> : null}
                </div>
                <div className="stu-fld" data-ai-id={aiId(`${AI}.step`, i + 1, "approvers")} data-ai-type="select" data-ai-label={t("settings.routes.approvers")}>
                  <span className="stu-fld__l">
                    {t("settings.routes.approvers")}
                    <em className="stu-req">*</em>
                  </span>
                  <SearchSelect
                    value={s.approverIds}
                    onChange={(v) => patch(i, { approverIds: v })}
                    options={[...approverOpts, ...s.approverIds.filter((id) => !approverOpts.some((o) => o.value === id)).map((id) => ({ value: id, label: t("generic.referenceSelected") }))]}
                    placeholder={t("settings.routes.approversPh")}
                    searchPlaceholder={t("settings.routes.approversSearch")}
                    emptyText={t("settings.routes.approversEmpty")}
                    ariaLabel={`${t("settings.routes.stepN", { n: i + 1 })} · ${t("settings.routes.approvers")}`}
                    invalid={Boolean(show(`steps.${i}.approver_user_ids`))}
                    hint={t("settings.routes.approversHint")}
                  />
                  {show(`steps.${i}.approver_user_ids`) ? <p className="stu-ferr">{show(`steps.${i}.approver_user_ids`)}</p> : null}
                </div>
                <div className="stu-fld">
                  <span className="stu-fld__l">{t("settings.routes.mode.label")}</span>
                  <div className="stu-rmode">
                    <div className="stu-seg stu-rseg" role="radiogroup" aria-label={t("settings.routes.mode.label")}>
                      {MODES.map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={s.mode === m} className={`stu-seg__b${s.mode === m ? " on" : ""}`} onClick={() => patch(i, { mode: m })}>
                          {t(`settings.routes.mode.${m}`)}
                        </button>
                      ))}
                    </div>
                    {s.mode === "quorum" ? (
                      <input
                        className="stu-rnum"
                        type="text"
                        inputMode="numeric"
                        value={s.required}
                        onChange={(e) => patch(i, { required: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                        aria-label={t("settings.routes.required")}
                        title={t("settings.routes.required")}
                        aria-invalid={Boolean(show(`steps.${i}.required_approvals`))}
                      />
                    ) : null}
                  </div>
                  <p className="stu-hint">{t(`settings.routes.modeHint.${s.mode}`)}</p>
                  {show(`steps.${i}.required_approvals`) ? <p className="stu-ferr">{show(`steps.${i}.required_approvals`)}</p> : null}
                </div>
                <div className="stu-fld">
                  <label className="stu-fld__l" htmlFor={`${uid}-sla-${s.key}`}>
                    {t("settings.routes.sla")}
                  </label>
                  <div className="stu-rsla">
                    <input
                      id={`${uid}-sla-${s.key}`}
                      className="stu-rnum"
                      type="text"
                      inputMode="numeric"
                      value={s.sla}
                      onChange={(e) => patch(i, { sla: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      placeholder="—"
                      aria-invalid={Boolean(show(`steps.${i}.deadline_value`))}
                    />
                    <Select value={s.unit} onChange={(v) => patch(i, { unit: v as StudioDeadlineUnit })} options={unitOpts} ariaLabel={t("settings.routes.sla")} />
                  </div>
                  <p className="stu-hint">{t("settings.routes.slaHint")}</p>
                  {show(`steps.${i}.deadline_value`) ? <p className="stu-ferr">{show(`steps.${i}.deadline_value`)}</p> : null}
                </div>
              </div>
              <div className="stu-srstep__acts">
                <button type="button" className="stu-sibtn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("settings.routes.up")} title={t("settings.routes.up")}>
                  <IconChevronLeft className="stu-srot" aria-hidden />
                </button>
                <button type="button" className="stu-sibtn" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={t("settings.routes.down")} title={t("settings.routes.down")}>
                  <IconChevronRight className="stu-srot" aria-hidden />
                </button>
                <button
                  type="button"
                  className="stu-sibtn"
                  onClick={() => setSteps((cur) => cur.filter((_, j) => j !== i))}
                  aria-label={t("settings.routes.dropStep")}
                  title={t("settings.routes.dropStep")}
                  data-ai-id={aiId(`${AI}.step`, i + 1, "remove")}
                  data-ai-type="button"
                  data-ai-label={t("settings.routes.dropStep")}
                >
                  <IconMinus aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ol>
        {steps.length < MAX_STEPS ? (
          <button type="button" className="btn btn--soft btn--sm stu-srsteps__add" onClick={addStep} data-ai-id={`${AI}.add-step`} data-ai-type="button" data-ai-label={t("settings.routes.addStep")}>
            <IconPlus aria-hidden />
            {t("settings.routes.addStep")}
          </button>
        ) : null}
      </fieldset>

      <div className="stu-rtoggles">
        <button type="button" role="switch" aria-checked={needSuper} className={`stu-sw${needSuper ? " on" : ""}`} onClick={() => setNeedSuper(!needSuper)} data-ai-id={`${AI}.superadmin`} data-ai-type="switch" data-ai-label={t("settings.routes.superadmin")}>
          <i aria-hidden />
          <span>{t("settings.routes.superadmin")}</span>
        </button>
        <p className="stu-hint">{t("settings.routes.superadminHint", { name: superadmin?.name || t("settings.routes.superadminStep") })}</p>
        <button type="button" role="switch" aria-checked={autoPublish} className={`stu-sw${autoPublish ? " on" : ""}`} onClick={() => setAutoPublish(!autoPublish)} data-ai-id={`${AI}.auto-publish`} data-ai-type="switch" data-ai-label={t("settings.routes.autoPublish")}>
          <i aria-hidden />
          <span>{t("settings.routes.autoPublish")}</span>
        </button>
        <p className="stu-hint">{t("settings.routes.autoPublishHint")}</p>
        {!steps.length && !needSuper ? (
          <p className={`stu-rnote${autoPublish ? " is-warn" : ""}`}>
            <IconAlert aria-hidden />
            {autoPublish ? t("settings.routes.noStepsAuto") : t("settings.routes.noStepsWait")}
          </p>
        ) : null}
      </div>

      <div className="stu-fld stu-rhours">
        <label className="stu-fld__l" htmlFor={`${uid}-hours`}>
          {t("settings.routes.deadlineHours")}
        </label>
        <input id={`${uid}-hours`} className="stu-rnum" type="text" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-invalid={Boolean(show("deadline_hours"))} data-ai-id={`${AI}.deadline-hours`} data-ai-type="input" data-ai-label={t("settings.routes.deadlineHours")} />
        <p className="stu-hint">{t("settings.routes.deadlineHoursHint")}</p>
        {show("deadline_hours") ? <p className="stu-ferr">{show("deadline_hours")}</p> : null}
      </div>

      {error ? <StudioErrorNote error={error} compact /> : null}

      <div className="stu-sform__acts">
        <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy} data-ai-id={`${AI}.cancel`} data-ai-type="button" data-ai-label={t("actions.cancel")}>
          {t("actions.cancel")}
        </button>
        <button type="submit" className="btn btn--pri btn--sm" disabled={busy} data-ai-id={`${AI}.save`} data-ai-type="button" data-ai-label={t("settings.routes.save")}>
          {busy ? <span className="stu-spin" aria-hidden /> : <IconCircleCheck aria-hidden />}
          {t("settings.routes.save")}
        </button>
      </div>
    </form>
  );
}
