"use client";

import "./sx-rule-aud.css";
import { useCallback, type ReactElement, type ReactNode } from "react";
import { BriefcaseBusiness, ScrollText, ShoppingCart, PlayCircle, Power, Trash2, UserRound, type LucideIcon } from "lucide-react";
import type { SxFormPolicy } from "../../form/formPolicy";
import { Field } from "../../form/Field";
import { TextArea } from "../../form/TextArea";
import { TextInput } from "../../form/TextInput";
import { SxButton } from "../../Button";
import { PlusIcon } from "../../icons";
import type { SxControlA11y, SxErrors } from "../../types";
import type { SxValues } from "../../contract";
import { RefPicker } from "../RefPicker";
import { audienceOf, learnRuleAudience, useRuleAudiences, type RuleAudience } from "./ruleAudience";

// The service's rules, one panel per side. Every rule is saved with the side
// it is written for — a shared K31 rule carries its own `audience`, a rule
// written for this service only carries it on its inline_rules row — and the
// marketplace shows each side its own: executor rules when a lawyer turns the
// service on and while they do the work, client rules before a purchase and
// while the order runs. Neither panel ever lists the other side's rules.

export const RULE_IDS = "rule_ids";
export const INLINE_RULES = "inline_rules";
export const SELLER_RULES = "seller_rules_allowed";
export const SERVICE_TERMS = "service_terms_text";
// Fields this board draws itself, inside the panel they belong to.
export const BOARD_FIELDS = new Set([INLINE_RULES, SELLER_RULES, SERVICE_TERMS]);

type Tr = ((key: string, values?: Record<string, string | number>) => string) & { has: (key: string) => boolean };

type Side = { audience: RuleAudience; who: "performer" | "client"; icon: LucideIcon; stages: readonly [LucideIcon, string][]; extra: string };
const SIDES: readonly Side[] = [
  { audience: "executor", who: "performer", icon: BriefcaseBusiness, stages: [[Power, "activation"], [PlayCircle, "work"]], extra: SELLER_RULES },
  { audience: "client", who: "client", icon: UserRound, stages: [[ShoppingCart, "purchase"], [PlayCircle, "work"]], extra: SERVICE_TERMS },
];

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rows = (v: unknown): SxValues[] => (Array.isArray(v) ? v.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? (x as SxValues) : {})) : []);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : []);
// A row saved before rules had a side is an executor rule — the backend's
// own default for a service rule.
export const rowAudience = (row: SxValues): RuleAudience => audienceOf(row.audience) ?? "executor";

export function RuleAudienceBoard({
  id,
  ai,
  root,
  source,
  readOnly,
  errors,
  policy,
  t,
  errorText,
  emit,
  renderField,
  code,
  recordId,
  owner,
  categoryId,
}: {
  id: string;
  ai: string;
  root: SxValues;
  source: string;
  readOnly: boolean;
  errors: SxErrors;
  policy: SxFormPolicy;
  t: Tr;
  errorText: (token: string, path: string) => string;
  emit: (path: string, value: unknown) => void;
  renderField: (pattern: string) => ReactNode;
  code: string;
  recordId: string;
  owner: string;
  categoryId: string;
}): ReactElement {
  const picked = ids(root[RULE_IDS]);
  const inline = rows(root[INLINE_RULES]);
  const map = useRuleAudiences(true, picked);
  const sideOf = useCallback((value: string): RuleAudience => map.get(value) ?? "executor", [map]);
  const keepExecutor = useCallback((v: string) => sideOf(v) === "executor", [sideOf]);
  const keepClient = useCallback((v: string) => sideOf(v) === "client", [sideOf]);

  const setShared = (aud: RuleAudience, next: string[]) => {
    const fresh = next.filter((v) => !picked.includes(v));
    if (fresh.length) learnRuleAudience(fresh, aud);
    const others = picked.filter((v) => sideOf(v) !== aud);
    emit(RULE_IDS, [...others, ...next]);
    policy.touch(RULE_IDS);
  };
  const setRow = (i: number, patch: SxValues) => emit(INLINE_RULES, inline.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = (aud: RuleAudience) => {
    emit(INLINE_RULES, [...inline, { title: "", audience: aud, body: "" }]);
    const at = inline.length;
    requestAnimationFrame(() => document.getElementById(`${id}-r${at}-title`)?.focus());
  };
  const dropRow = (i: number) => emit(INLINE_RULES, inline.filter((_, k) => k !== i));
  const err = (path: string): string => {
    const tok = policy.visible(path, errors);
    return tok ? errorText(tok, path) : "";
  };
  const sharedErr = err(RULE_IDS);

  return (
    <div className="sx-ra" data-ai-id={ai} data-ai-type="section">
      <p className="sx-ra__intro">
        <ScrollText aria-hidden size={16} />
        <span>{t("sx.k02.ra.intro")}</span>
      </p>
      <div className="sx-ra__grid">
        {SIDES.map((side) => {
          const Icon = side.icon;
          const mine = picked.filter((v) => sideOf(v) === side.audience);
          const own = inline.map((row, i) => ({ row, i })).filter((x) => rowAudience(x.row) === side.audience);
          const total = mine.length + own.length;
          const pid = `${id}-${side.audience}`;
          const a11y: SxControlA11y = { id: `${pid}-shared`, "aria-labelledby": `${pid}-shared-l`, "aria-describedby": sharedErr ? `${pid}-shared-e` : undefined, "aria-invalid": sharedErr ? true : undefined };
          return (
            <section key={side.audience} className="sx-ra__panel" data-who={side.who} aria-labelledby={`${pid}-h`} data-ai-id={`${ai}.${side.audience}`} data-ai-type="section">
              <header className="sx-ra__head">
                <span className="sx-ra__badge" aria-hidden>
                  <Icon size={18} strokeWidth={2.1} />
                </span>
                <span className="sx-ra__ht">
                  <b id={`${pid}-h`}>
                    {t(`sx.k02.ra.${side.audience}.title`)}
                    <span className="sx-ra__count" aria-label={t("sx.k02.ra.count", { n: total })}>
                      {total}
                    </span>
                  </b>
                  <small>{t(`sx.k02.ra.${side.audience}.lead`)}</small>
                </span>
              </header>
              <ul className="sx-ra__stages" aria-label={t("sx.k02.ra.stages")}>
                {side.stages.map(([SIcon, k]) => (
                  <li key={k}>
                    <SIcon aria-hidden size={13} />
                    {t(`sx.k02.ra.stage.${k}`)}
                  </li>
                ))}
              </ul>

              <div className="sx-ra__block">
                <p className="sx-ra__lbl" id={`${pid}-shared-l`}>
                  {t("sx.k02.ra.shared")}
                </p>
                <RefPicker
                  multiple
                  a11y={a11y}
                  label={t(`sx.k02.ra.${side.audience}.shared`)}
                  source={source}
                  value={mine}
                  onChange={(next) => setShared(side.audience, next)}
                  required={false}
                  readOnly={readOnly}
                  invalid={!!sharedErr}
                  placeholder={t(`sx.k02.ra.${side.audience}.pick`)}
                  onBlur={() => policy.touch(RULE_IDS)}
                  aiId={`${ai}.${side.audience}.shared`}
                  code={code}
                  pattern={RULE_IDS}
                  recordId={recordId}
                  emptyId={`${pid}-shared-src`}
                  inlineContext={{ categoryId, audience: side.audience }}
                  inlineOwner={owner}
                  inlineAddKey={`sx.k02.ra.${side.audience}.addShared`}
                  keep={side.audience === "executor" ? keepExecutor : keepClient}
                />
                {sharedErr && side.audience === "executor" ? (
                  <p className="sx-ra__err" id={`${pid}-shared-e`} role="alert">
                    {sharedErr}
                  </p>
                ) : null}
              </div>

              <div className="sx-ra__block">
                <p className="sx-ra__lbl">{t("sx.k02.ra.own")}</p>
                {own.length ? (
                  <ol className="sx-ra__rows">
                    {own.map(({ row, i }, n) => {
                      const tPath = `${INLINE_RULES}.${i}.title`;
                      const bPath = `${INLINE_RULES}.${i}.body`;
                      const tErr = err(tPath);
                      const bErr = err(bPath);
                      const rid = `${id}-r${i}`;
                      return (
                        <li key={i} className="sx-ra__row" data-invalid={tErr || bErr ? "" : undefined} data-ai-id={`${ai}.${side.audience}.rule.${n + 1}`} data-ai-type="card">
                          <span className="sx-ra__n" aria-hidden>
                            {n + 1}
                          </span>
                          {readOnly ? (
                            <div className="sx-ra__ro">
                              <b>{str(row.title) || t("sx.ui.untitled")}</b>
                              {str(row.body) ? <p>{str(row.body)}</p> : null}
                            </div>
                          ) : (
                            <div className="sx-ra__fields">
                              <Field id={`${rid}-title`} label={t("sx.k02.f.inlineTitle")} error={tErr} required>
                                {(a) => (
                                  <TextInput
                                    {...a}
                                    value={str(row.title)}
                                    onChange={(v) => setRow(i, { title: v })}
                                    onBlur={() => policy.touch(tPath)}
                                    placeholder={t("sx.k02.ph.ruleTitle")}
                                    invalid={!!tErr}
                                    aiId={`${ai}.${side.audience}.rule.${n + 1}.title`}
                                  />
                                )}
                              </Field>
                              <Field id={`${rid}-body`} label={t("sx.k02.f.inlineBody")} error={bErr} required>
                                {(a) => (
                                  <TextArea
                                    {...a}
                                    value={str(row.body)}
                                    onChange={(v) => setRow(i, { body: v })}
                                    onBlur={() => policy.touch(bPath)}
                                    minRows={2}
                                    maxRows={8}
                                    placeholder={t(`sx.k02.ra.${side.audience}.bodyPh`)}
                                    invalid={!!bErr}
                                    aiId={`${ai}.${side.audience}.rule.${n + 1}.body`}
                                  />
                                )}
                              </Field>
                            </div>
                          )}
                          {readOnly ? null : (
                            <button type="button" className="sx-ra__del" onClick={() => dropRow(i)} aria-label={t("sx.k02.ra.remove", { n: n + 1 })} title={t("sx.k02.ra.remove", { n: n + 1 })}>
                              <Trash2 aria-hidden size={16} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="sx-ra__empty">{t(`sx.k02.ra.${side.audience}.empty`)}</p>
                )}
                {readOnly ? null : (
                  <SxButton variant="secondary" size="sm" icon={PlusIcon} onClick={() => addRow(side.audience)} aiId={`${ai}.${side.audience}.add`}>
                    {t(`sx.k02.ra.${side.audience}.add`)}
                  </SxButton>
                )}
              </div>

              <div className="sx-ra__extra">{renderField(side.extra)}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
