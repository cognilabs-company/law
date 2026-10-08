"use client";

import { useId } from "react";
import { isApprovalFree, useStudioRegistry, type StudioFieldErrors } from "@/lib/services/studio";
import { STUDIO_CODES, ctorOrder } from "@/lib/studio/constructors";
import { STUDIO_ERR, type StudioEditorProps, type StudioPayload } from "./types";
import { AddBtn, ED_ERR, EdSection, EdShell, ErrLine, Fld, RowTools, SelectIn, TextIn, edAi, moveItem, normErrors, recList, str, useEd, type Dict } from "./parts/kit";
import { IconArrowRight, IconCircleCheck, IconEdit, IconPower, IconRocket, IconShieldCheck } from "@/components/icons";

const CODE = "K20";
export const K20_ROLES = ["studio_reviewer", "studio_publisher", "studio_admin", "admin"] as const;
const STATUSES = ["active", "inactive"] as const;

function stepsOf(v: unknown): Dict[] {
  return recList(v).map((s) => ({ ...s, role: str(s.role), title: str(s.title ?? s.name) }));
}

function statusOf(v: unknown): string {
  const s = str(v).trim().toLowerCase();
  if (!s) return "active";
  if (s === "enabled" || s === "on") return "active";
  if (s === "disabled" || s === "off") return "inactive";
  return s;
}

export function emptyPayload(): StudioPayload {
  return {
    constructor_code: "",
    title: "",
    steps: [
      { role: "studio_reviewer", title: "" },
      { role: "studio_publisher", title: "" },
    ],
    status: "active",
  };
}

export function validate(payload: StudioPayload): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  if (!str(payload.constructor_code).trim()) out.constructor_code = STUDIO_ERR.required;
  if (!str(payload.title).trim()) out.title = STUDIO_ERR.required;
  const steps = stepsOf(payload.steps);
  if (!steps.length) out.steps = ED_ERR.minOne;
  steps.forEach((s, i) => {
    if (!str(s.role).trim()) out[`steps.${i}.role`] = STUDIO_ERR.required;
    if (!str(s.title).trim()) out[`steps.${i}.title`] = STUDIO_ERR.required;
  });
  return out;
}

export default function K20Editor({ payload, onChange, errors, readOnly }: StudioEditorProps) {
  const { e, ctorName, role } = useEd();
  const uid = useId();
  const reg = useStudioRegistry();
  const errs = normErrors(errors);
  const steps = stepsOf(payload.steps);
  const status = statusOf(payload.status);
  const code = str(payload.constructor_code);
  const set = (k: string, v: unknown) => onChange({ ...payload, [k]: v });
  const setSteps = (next: Dict[]) => set("steps", next);
  const patch = (i: number, p: Dict) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));

  const fromReg = reg.items.filter((c) => c.code !== CODE && !isApprovalFree(c.code, c)).map((c) => ({ code: c.code, title: c.title }));
  const pool = fromReg.length ? fromReg : STUDIO_CODES.filter((c) => c !== CODE && !isApprovalFree(c)).map((c) => ({ code: c, title: "" }));
  const ctorOpts = pool
    .slice()
    .sort((a, b) => ctorOrder(a.code) - ctorOrder(b.code))
    .map((c) => ({ value: c.code, label: `${c.code} · ${ctorName(c.code, c.title)}` }));
  const roleOpts = K20_ROLES.map((r) => ({ value: r, label: role(r) }));
  const freeSelected = Boolean(code) && isApprovalFree(code, reg.items.find((c) => c.code === code) ?? null);

  return (
    <EdShell code={CODE} icon={IconShieldCheck} title={ctorName(CODE)} lead={e("k20.lead")} payload={payload} errors={errs} known={["constructor_code", "title", "steps", "status"]}>
      <div className="stu-fe-grid">
        <Fld label={e("k20.ctor")} required error={errs.constructor_code} hint={freeSelected ? e("k20.freeWarn") : e("k20.ctorHint")}>
          <SelectIn value={code} onChange={(v) => set("constructor_code", v)} options={ctorOpts} readOnly={readOnly} label={e("k20.ctor")} ai={edAi(CODE, "constructor_code")} invalid={Boolean(errs.constructor_code)} placeholder={e("k20.pickCtor")} />
        </Fld>
        <Fld id={`${uid}-title`} label={e("k20.title")} required error={errs.title}>
          <TextIn id={`${uid}-title`} value={str(payload.title)} onChange={(v) => set("title", v)} readOnly={readOnly} invalid={Boolean(errs.title)} placeholder={e("k20.titlePh")} label={e("k20.title")} ai={edAi(CODE, "title")} />
        </Fld>
        <Fld label={e("k20.status")} error={errs.status} hint={status === "active" ? e("k20.activeHint") : e("k20.inactiveHint")} wide>
          <div className="stu-seg" role="tablist" aria-label={e("k20.status")}>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                className="stu-seg__b"
                disabled={readOnly && status !== s}
                onClick={() => !readOnly && set("status", s)}
                data-ai-id={edAi(CODE, "status", s)}
                data-ai-type="tab"
                data-ai-label={e(`k20.st.${s}`)}
              >
                {s === "active" ? <IconCircleCheck aria-hidden /> : <IconPower aria-hidden />}
                {e(`k20.st.${s}`)}
              </button>
            ))}
          </div>
        </Fld>
      </div>

      <EdSection icon={IconShieldCheck} title={e("k20.steps")} hint={e("k20.stepsHint")} count={steps.length} error={errs.steps}>
        <ol className="stu-fe-route" aria-label={e("k20.steps")}>
          <li className="stu-fe-route__edge">
            <span className="stu-fe-route__dot">
              <IconEdit aria-hidden />
            </span>
            <span>{e("k20.start")}</span>
          </li>
          {steps.map((s, i) => {
            const ai = edAi(CODE, "step", i);
            const rErr = errs[`steps.${i}.role`] ?? "";
            const tErr = errs[`steps.${i}.title`] ?? "";
            return (
              <li key={i} className={`stu-fe-route__step${rErr || tErr ? " is-bad" : ""}`}>
                <span className="stu-fe-route__dot stu-fe-route__dot--n">{i + 1}</span>
                <div className="stu-fe-route__body">
                  <div className="stu-fe-cell">
                    <span className="stu-fe-cell__l">{e("k20.role")}</span>
                    <SelectIn value={str(s.role)} onChange={(v) => patch(i, { role: v })} options={roleOpts} readOnly={readOnly} label={e("k20.role")} ai={`${ai}.role`} invalid={Boolean(rErr)} placeholder={e("k20.pickRole")} />
                    <ErrLine msg={rErr} />
                  </div>
                  <div className="stu-fe-cell">
                    <span className="stu-fe-cell__l">{e("k20.stepTitle")}</span>
                    <TextIn value={str(s.title)} onChange={(v) => patch(i, { title: v })} readOnly={readOnly} invalid={Boolean(tErr)} placeholder={s.role ? role(str(s.role)) : e("k20.stepTitlePh")} label={e("k20.stepTitle")} ai={`${ai}.title`} />
                    <ErrLine msg={tErr} />
                  </div>
                </div>
                {readOnly ? null : <RowTools index={i} count={steps.length} onMove={(d) => setSteps(moveItem(steps, i, d))} onRemove={() => setSteps(steps.filter((_, j) => j !== i))} ai={ai} what={e("what.step")} />}
              </li>
            );
          })}
          <li className="stu-fe-route__edge stu-fe-route__edge--end">
            <span className="stu-fe-route__dot">
              <IconRocket aria-hidden />
            </span>
            <span>{e("k20.end")}</span>
          </li>
        </ol>
        {readOnly ? null : <AddBtn label={e("k20.add")} onClick={() => setSteps([...steps, { role: "studio_reviewer", title: "" }])} ai={edAi(CODE, "step", "add")} />}
        {steps.length ? (
          <p className="stu-fe-path" aria-label={e("k20.preview")}>
            <span>{e("k20.start")}</span>
            {steps.map((s, i) => (
              <span key={i} className="stu-fe-path__s">
                <IconArrowRight aria-hidden />
                <b>{str(s.title).trim() || (s.role ? role(str(s.role)) : "—")}</b>
              </span>
            ))}
            <span className="stu-fe-path__s">
              <IconArrowRight aria-hidden />
              {e("k20.end")}
            </span>
          </p>
        ) : null}
      </EdSection>
    </EdShell>
  );
}
