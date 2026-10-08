"use client";

import { useId, useState, type FormEvent } from "react";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { aiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { STUDIO_ROLES, saveApprovalRoute, studioErrorOf, type StudioRoute, type StudioRouteInput, type StudioRouteStep } from "@/lib/services/studio";
import { StudioErrorNote, useStudioText } from "../bits";
import { IconChevronLeft, IconChevronRight, IconCircleCheck, IconMinus, IconPlus } from "@/components/icons";

export type RouteMode = { kind: "new"; code?: string } | { kind: "edit"; route: StudioRoute };
export type RouteSaved = { input: StudioRouteInput; route: StudioRoute };

const AI = "admin.studio.settings.routes.modal";
const MAX_STEPS = 6;
const STEP_ROLES = [...STUDIO_ROLES, "admin"];
export const ROUTE_STATUSES = ["active", "inactive"] as const;
export const DEFAULT_STEPS: StudioRouteStep[] = [
  { role: "studio_reviewer", title: "" },
  { role: "studio_publisher", title: "" },
];

type Step = StudioRouteStep & { key: number };

export default function RouteModal({
  mode,
  codes,
  taken,
  onClose,
  onSaved,
}: {
  mode: RouteMode | null;
  codes: { code: string; label: string; approvalFree: boolean }[];
  taken: string[];
  onClose: () => void;
  onSaved: (s: RouteSaved) => void;
}) {
  const { t } = useStudioText();
  const title = mode?.kind === "edit" ? t("settings.routes.editTitle") : t("settings.routes.newTitle");
  const key = mode ? (mode.kind === "edit" ? `e-${mode.route.id || mode.route.constructorCode}` : `n-${mode.code ?? ""}`) : "";
  return (
    <Modal open={mode !== null} onClose={onClose} title={title} aiId={AI}>
      {mode ? <RouteForm key={key} mode={mode} codes={codes} taken={taken} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function RouteForm({
  mode,
  codes,
  taken,
  onClose,
  onSaved,
}: {
  mode: RouteMode;
  codes: { code: string; label: string; approvalFree: boolean }[];
  taken: string[];
  onClose: () => void;
  onSaved: (s: RouteSaved) => void;
}) {
  const { t, role, fieldErr } = useStudioText();
  const uid = useId();
  const base = mode.kind === "edit" ? mode.route : null;
  const [code, setCode] = useState(base?.constructorCode ?? (mode.kind === "new" ? mode.code ?? "" : ""));
  const [title, setTitle] = useState(base?.title ?? "");
  const [status, setStatus] = useState<string>(base && (ROUTE_STATUSES as readonly string[]).includes(base.status) ? base.status : "active");
  const [steps, setSteps] = useState<Step[]>(() => (base?.steps.length ? base.steps : DEFAULT_STEPS).map((s, i) => ({ ...s, key: i + 1 })));
  const [nextKey, setNextKey] = useState(100);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [serverErr, setServerErr] = useState<Record<string, string>>({});

  const picked = codes.find((c) => c.code === code);
  const errs: Record<string, string> = {};
  if (!code) errs.constructor_code = t("settings.routes.errCode");
  if (!title.trim()) errs.title = t("fieldErr.required");
  if (!steps.length) errs.steps = t("settings.routes.errSteps");
  steps.forEach((s, i) => {
    if (!s.role) errs[`steps.${i}.role`] = t("fieldErr.required");
  });
  const show = (k: string) => (tried ? errs[k] : "") || fieldErr(serverErr[k] || "");

  const codeOpts = codes.map((c) => ({ value: c.code, label: c.label }));
  const roleOpts = STEP_ROLES.map((r) => ({ value: r, label: role(r) }));
  const statusOpts = ROUTE_STATUSES.map((s) => ({ value: s, label: t(`settings.routes.status_${s}`) }));

  function patch(i: number, p: Partial<StudioRouteStep>) {
    setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, ...p } : s)));
  }
  function move(i: number, d: -1 | 1) {
    setSteps((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addStep() {
    if (steps.length >= MAX_STEPS) return;
    const used = new Set(steps.map((s) => s.role));
    const r = STEP_ROLES.find((x) => !used.has(x)) ?? "studio_reviewer";
    setSteps((cur) => [...cur, { role: r, title: "", key: nextKey }]);
    setNextKey((k) => k + 1);
  }
  function dropStep(i: number) {
    setSteps((cur) => cur.filter((_, j) => j !== i));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errs).length) return;
    const input: StudioRouteInput = {
      constructorCode: code,
      title: title.trim(),
      steps: steps.map((s) => ({ role: s.role, title: s.title.trim() || role(s.role) })),
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stu-sform" onSubmit={submit} noValidate>
      <div className="stu-sform__grid">
        <div className="stu-fld" data-ai-id={`${AI}.constructor`} data-ai-type="select" data-ai-label={t("settings.routes.constructor")}>
          <span className="stu-fld__l">
            {t("settings.routes.constructor")}
            <em className="stu-req">*</em>
          </span>
          {base ? (
            <input type="text" value={picked?.label ?? code} readOnly aria-label={t("settings.routes.constructor")} />
          ) : (
            <Select value={code} onChange={setCode} options={codeOpts} placeholder={t("settings.routes.pickCtor")} ariaLabel={t("settings.routes.constructor")} />
          )}
          {show("constructor_code") ? <p className="stu-ferr">{show("constructor_code")}</p> : null}
          {!base && code && taken.includes(code) ? <p className="stu-hint">{t("settings.routes.replaces")}</p> : null}
          {picked?.approvalFree ? <p className="stu-hint">{t("settings.routes.freeHint")}</p> : null}
        </div>
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
        <legend className="stu-fld__l">
          {t("settings.routes.steps")}
          <em className="stu-req">*</em>
        </legend>
        <p className="stu-hint">{t("settings.routes.stepsHint")}</p>
        <ol className="stu-srsteps">
          {steps.map((s, i) => (
            <li key={s.key} className="stu-srstep" data-ai-id={aiId(`${AI}.step`, i + 1)} data-ai-type="section" data-ai-label={t("settings.routes.stepN", { n: i + 1 })}>
              <span className="stu-srstep__n" aria-hidden>
                {i + 1}
              </span>
              <div className="stu-srstep__f">
                <div className="stu-fld">
                  <span className="stu-fld__l">{t("settings.routes.stepRole")}</span>
                  <Select value={s.role} onChange={(v) => patch(i, { role: v })} options={roleOpts} ariaLabel={`${t("settings.routes.stepN", { n: i + 1 })} · ${t("settings.routes.stepRole")}`} />
                  {show(`steps.${i}.role`) ? <p className="stu-ferr">{show(`steps.${i}.role`)}</p> : null}
                </div>
                <div className="stu-fld">
                  <label className="stu-fld__l" htmlFor={`${uid}-st-${s.key}`}>
                    {t("settings.routes.stepTitle")}
                  </label>
                  <input
                    id={`${uid}-st-${s.key}`}
                    type="text"
                    value={s.title}
                    onChange={(e) => patch(i, { title: e.target.value.slice(0, 80) })}
                    placeholder={role(s.role)}
                    autoComplete="off"
                    data-ai-id={aiId(`${AI}.step`, i + 1, "title")}
                    data-ai-type="input"
                    data-ai-label={t("settings.routes.stepTitle")}
                  />
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
                  onClick={() => dropStep(i)}
                  disabled={steps.length <= 1}
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
        {show("steps") ? <p className="stu-ferr">{show("steps")}</p> : null}
        {steps.length < MAX_STEPS ? (
          <button type="button" className="btn btn--soft btn--sm stu-srsteps__add" onClick={addStep} data-ai-id={`${AI}.add-step`} data-ai-type="button" data-ai-label={t("settings.routes.addStep")}>
            <IconPlus aria-hidden />
            {t("settings.routes.addStep")}
          </button>
        ) : null}
      </fieldset>

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
