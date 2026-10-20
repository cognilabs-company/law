import type { StudioCreationJourney, StudioJourneyType } from "@/lib/services/studio";
import { STUDIO_RETIRED_CODES, isRetiredStudioCode } from "@/lib/studio/retired";
import type { JourneyDef, JourneyDefStep, JourneyDefs } from "./journeyApi";

export type JourneyStepDef = { key: string; title: string; code: string; fields: readonly string[]; required: boolean; formCode?: string };

const REVIEW_KEY = "review";

export const FALLBACK_STEP_KEYS: Readonly<Record<StudioJourneyType, readonly string[]>> = {
  service: ["category", "pricing", "requirements", "duration", "template", "checklist", "rules", "guarantees", "review"],
  package: ["category", "services", "tiers", "eligibility", "price_factors", "rules", "guarantees", "review"],
};

const FIELD_HINTS: Readonly<Record<StudioJourneyType, Readonly<Record<string, readonly string[]>>>> = {
  service: {
    category: ["title", "category_id"],
    pricing: ["base_price", "max_price", "price_factor_ids", "price_factor_overrides", "negotiation_allowed"],
    requirements: ["seller_requirements", "executor_type", "intake_questions"],
    duration: ["duration_value", "duration_unit", "duration_calendar"],
    delivery: ["duration_value", "duration_unit", "duration_calendar"],
    template: ["template_mode", "template_source", "document_template_id"],
    checklist: ["completion_checklist", "checklist_template_id"],
    rules: ["rule_ids", "inline_rules", "service_terms_text"],
    guarantees: ["guarantee_ids", "inline_guarantees"],
    discovery: ["description", "client_value", "discovery_terms"],
    review: ["is_active"],
  },
  package: {
    category: ["title", "category_id", "description"],
    services: ["components", "custom_items", "duration"],
    composition: ["components", "custom_items", "duration"],
    tiers: ["tiers"],
    eligibility: ["eligibility_rule_ids", "visibility"],
    price_factors: ["price_factor_ids"],
    pricing: ["price_factor_ids"],
    rules: ["rule_ids"],
    guarantees: ["guarantee_ids"],
    review: ["is_active"],
  },
};

const COMPANIONS: Readonly<Record<StudioJourneyType, Readonly<Record<string, string>>>> = {
  service: { price_factor_ids: "price_factor_overrides", rule_ids: "inline_rules", guarantee_ids: "inline_guarantees" },
  package: {},
};

export function withCompanions(type: StudioJourneyType, fields: readonly string[]): string[] {
  const pairs = COMPANIONS[type];
  const out: string[] = [];
  for (const f of fields) {
    if (!out.includes(f)) out.push(f);
    const mate = Object.prototype.hasOwnProperty.call(pairs, f) ? pairs[f] : "";
    if (mate && !fields.includes(mate) && !out.includes(mate)) out.push(mate);
  }
  return out;
}

const HOMES: Readonly<Record<StudioJourneyType, Readonly<Record<string, string>>>> = {
  service: { intake_questions: "requirements", service_terms_text: "rules" },
  package: {},
};

export const RETIRED_CODES: ReadonlySet<string> = new Set(STUDIO_RETIRED_CODES);

export function isRetiredCode(code: string): boolean {
  return isRetiredStudioCode(code);
}

function withHomes(type: StudioJourneyType, defs: JourneyStepDef[]): JourneyStepDef[] {
  const listed = new Set(defs.flatMap((d) => d.fields));
  const add = new Map<string, string[]>();
  for (const [field, home] of Object.entries(HOMES[type])) {
    if (listed.has(field) || !defs.some((d) => d.key === home && d.fields.length > 0)) continue;
    add.set(home, [...(add.get(home) ?? []), field]);
  }
  if (!add.size) return defs;
  return defs.map((d) => (add.has(d.key) ? { ...d, fields: [...d.fields, ...(add.get(d.key) ?? [])] } : d));
}

const FALLBACK_CODES: Readonly<Record<string, string>> = {
  category: "K01",
  rules: "K31",
  guarantees: "K32",
  eligibility: "K26",
  price_factors: "K34",
};

const LABEL_KEYS: Readonly<Record<string, string>> = {
  category: "sx.journeyRun.step.category",
  pricing: "sx.journeyRun.step.pricing",
  requirements: "sx.journeyRun.step.requirements",
  duration: "sx.journeyRun.step.duration",
  delivery: "sx.journeyRun.step.delivery",
  template: "sx.journeyRun.step.template",
  checklist: "sx.journeyRun.step.checklistOnly",
  rules: "sx.journeyRun.step.rules",
  guarantees: "sx.journeyRun.step.guarantees",
  discovery: "sx.journeyRun.step.discovery",
  services: "sx.journeyRun.step.services",
  composition: "sx.journeyRun.step.composition",
  tiers: "sx.journeyRun.step.tiers",
  eligibility: "sx.journeyRun.step.eligibility",
  price_factors: "sx.journeyRun.step.priceFactors",
  review: "sx.journeyRun.step.review",
};

const CONTEXT_FIELDS: Readonly<Record<StudioJourneyType, readonly string[]>> = {
  service: ["service_id"],
  package: ["package_id"],
};

export type JourneyStep = {
  key: string;
  label: string;
  fields: readonly string[];
  code: string;
  required: boolean;
  submit: boolean;
  known: boolean;
  form: boolean;
  state: "done" | "current" | "todo";
  link?: { code: string; href: string };
};

export function stepLabelKey(key: string): string {
  return LABEL_KEYS[key] ?? "sx.journeyRun.stepOther";
}

export function stepTitleOf(defs: JourneyDefs | null | undefined, type: StudioJourneyType, key: string): string {
  return defs?.[type]?.steps.find((s) => s.key === key)?.title ?? "";
}

export function stepLabel(key: string, t: (key: string) => string, title = ""): string {
  if (!key) return "";
  if (LABEL_KEYS[key]) return t(LABEL_KEYS[key]);
  return title.trim() || t("sx.journeyRun.stepOther");
}

function fromDef(type: StudioJourneyType, s: JourneyDefStep): JourneyStepDef {
  const hint = FIELD_HINTS[type][s.key] ?? [];
  const code = isRetiredCode(s.code) ? "" : s.code;
  const out: JourneyStepDef = { key: s.key, title: s.title, code, fields: s.fields.length ? withCompanions(type, s.fields) : hint, required: s.required };
  return s.formCode && !isRetiredCode(s.formCode) ? { ...out, formCode: s.formCode } : out;
}

function fallbackStep(type: StudioJourneyType, key: string): JourneyStepDef {
  return { key, title: "", code: FALLBACK_CODES[key] ?? "", fields: FIELD_HINTS[type][key] ?? [], required: true };
}

export function stepDefsFor(type: StudioJourneyType, def: JourneyDef | null | undefined, journeyKeys: readonly string[] = []): JourneyStepDef[] {
  if (def?.steps.length) return withHomes(type, def.steps.map((s) => fromDef(type, s)));
  const keys = journeyKeys.map((k) => k.trim()).filter(Boolean);
  const list = keys.length ? keys : FALLBACK_STEP_KEYS[type];
  const out: JourneyStepDef[] = [];
  for (const k of list) if (!out.some((s) => s.key === k)) out.push(fallbackStep(type, k));
  return out;
}

export function journeyStepKeys(j: Pick<StudioCreationJourney, "raw"> | null | undefined): string[] {
  const raw = j?.raw?.steps;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const k = typeof item === "string" ? item.trim() : item && typeof item === "object" ? String((item as Record<string, unknown>).key ?? "").trim() : "";
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

function submitKeyOf(defs: readonly JourneyStepDef[]): string {
  return defs.find((d) => d.key === REVIEW_KEY)?.key ?? defs[defs.length - 1]?.key ?? "";
}

export function leftoverFields(type: StudioJourneyType, defs: readonly JourneyStepDef[], topLevelKeys: readonly string[]): string[] {
  const listed = new Set(defs.flatMap((s) => s.fields));
  const skip = new Set(CONTEXT_FIELDS[type]);
  const out: string[] = [];
  for (const raw of topLevelKeys) {
    const k = raw.trim();
    if (k && !listed.has(k) && !skip.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

type Draft = Omit<JourneyStep, "state">;

export type JourneyStepsInput = {
  defs: readonly JourneyStepDef[];
  mainCode: string;
  journey: Pick<StudioCreationJourney, "completedSteps" | "missingSteps" | "currentStep">;
  leftovers: readonly string[];
  topKeys: ReadonlySet<string>;
  label: (key: string, title: string) => string;
};

function newHref(code: string): string {
  return `/admin/studio/o/new?new=${encodeURIComponent(code)}`;
}

export function journeySteps({ defs, mainCode, journey: j, leftovers, topKeys, label }: JourneyStepsInput): JourneyStep[] {
  const own = new Set(defs.map((d) => d.key));
  const extra: string[] = [];
  for (const k of [...j.completedSteps, ...j.missingSteps, j.currentStep]) {
    const key = k.trim();
    if (key && !own.has(key) && !extra.includes(key)) extra.push(key);
  }
  const submitKey = submitKeyOf(defs);
  const main = mainCode.trim().toUpperCase();
  const unknown = (key: string): Draft => ({ key, label: label(key, ""), fields: [], code: "", required: false, submit: false, known: false, form: false });
  const list: Draft[] = [];
  let placed = false;
  for (const d of defs) {
    const submit = d.key === submitKey;
    if (submit && !placed) {
      list.push(...extra.map(unknown));
      placed = true;
    }
    const fields = submit ? [...d.fields, ...leftovers.filter((f) => !d.fields.includes(f))] : [...d.fields];
    const ownForm = !d.formCode || d.formCode.trim().toUpperCase() === main;
    const form = submit || (ownForm && fields.length > 0 && (topKeys.size === 0 || fields.some((f) => topKeys.has(f))));
    const code = d.code.trim();
    const linked = code && code.toUpperCase() !== main && !submit;
    const draft: Draft = { key: d.key, label: label(d.key, d.title), fields, code, required: d.required, submit, known: true, form };
    list.push(linked ? { ...draft, link: { code, href: newHref(code) } } : draft);
  }
  if (!placed) list.push(...extra.map(unknown));
  const done = new Set(j.completedSteps.map((s) => s.trim()));
  const cur = j.currentStep.trim();
  const current = cur && !done.has(cur) && list.some((s) => s.key === cur) ? cur : (list.find((s) => !done.has(s.key))?.key ?? "");
  return list.map((s) => ({ ...s, state: done.has(s.key) ? "done" : s.key === current ? "current" : "todo" }));
}

export function missingRequired(steps: readonly JourneyStep[], completed: readonly string[]): JourneyStep[] {
  const done = new Set(completed.map((s) => s.trim()));
  return steps.filter((s) => s.known && s.required && !s.submit && !done.has(s.key));
}

export function stepOfPath(steps: readonly JourneyStep[], path: string): string | null {
  const root = path === "$title" ? "title" : (path.split(/[.[]/)[0] ?? "").trim();
  if (!root) return null;
  return steps.find((s) => s.fields.includes(root))?.key ?? null;
}

export function nextStepKey(steps: readonly JourneyStep[], key: string): string {
  const at = steps.findIndex((s) => s.key === key);
  const open = (s: JourneyStep) => s.key !== key && s.state !== "done";
  const after = steps.slice(at + 1).find(open);
  if (after) return after.key;
  const before = steps.slice(0, Math.max(0, at)).find(open);
  if (before) return before.key;
  return steps.find((s) => s.submit)?.key ?? "";
}
