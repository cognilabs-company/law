import type { StudioCreationJourney, StudioJourneyType } from "@/lib/services/studio";

export type JourneyStepDef = { key: string; fields: readonly string[]; submit?: boolean; link?: { labelKey: string; href: string } };

export const JOURNEY_STEPS: Readonly<Record<StudioJourneyType, readonly JourneyStepDef[]>> = {
  service: [
    { key: "category", fields: ["title", "slug", "category_id"], link: { labelKey: "sx.journeyRun.newCategory", href: "/admin/studio/o/new?new=K01" } },
    { key: "pricing", fields: ["base_price", "max_price", "price_factor_ids", "negotiation_allowed"] },
    { key: "requirements", fields: ["seller_requirements", "executor_type"] },
    { key: "delivery", fields: ["duration_value", "duration_unit", "duration_calendar"] },
    { key: "template", fields: ["template_mode", "template_source", "document_template_id"] },
    { key: "checklist", fields: ["checklist_template_id", "guarantee_ids"] },
    { key: "discovery", fields: ["description", "client_value", "discovery_terms"] },
    { key: "review", fields: ["is_active"], submit: true },
  ],
  package: [
    { key: "category", fields: ["title", "category_id", "description"] },
    { key: "composition", fields: ["components", "custom_items", "duration"] },
    { key: "tiers", fields: ["tiers"] },
    { key: "pricing", fields: ["price_factor_ids"] },
    { key: "eligibility", fields: ["eligibility_rule_ids", "visibility"] },
    { key: "review", fields: ["is_active"], submit: true },
  ],
};

const CONTEXT_FIELDS: Readonly<Record<StudioJourneyType, readonly string[]>> = {
  service: ["service_id"],
  package: ["package_id"],
};

const KNOWN: ReadonlySet<string> = new Set([...JOURNEY_STEPS.service, ...JOURNEY_STEPS.package].map((s) => s.key));

export type JourneyStep = {
  key: string;
  label: string;
  fields: readonly string[];
  submit: boolean;
  known: boolean;
  state: "done" | "current" | "todo";
  link?: { labelKey: string; href: string };
};

export function stepLabelKey(key: string): string {
  return KNOWN.has(key) ? `sx.journeyRun.step.${key}` : "sx.journeyRun.stepOther";
}

export function stepLabel(key: string, t: (key: string) => string): string {
  return key ? t(stepLabelKey(key)) : "";
}

export function leftoverFields(type: StudioJourneyType, topLevelKeys: readonly string[]): string[] {
  const listed = new Set(JOURNEY_STEPS[type].flatMap((s) => s.fields));
  const skip = new Set(CONTEXT_FIELDS[type]);
  const out: string[] = [];
  for (const raw of topLevelKeys) {
    const k = raw.trim();
    if (k && !listed.has(k) && !skip.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

type Draft = Omit<JourneyStep, "state">;

export function journeySteps(
  type: StudioJourneyType,
  j: Pick<StudioCreationJourney, "completedSteps" | "missingSteps" | "currentStep">,
  leftovers: readonly string[],
  label: (key: string) => string,
): JourneyStep[] {
  const defs = JOURNEY_STEPS[type];
  const own = new Set(defs.map((d) => d.key));
  const extra: string[] = [];
  for (const k of [...j.completedSteps, ...j.missingSteps, j.currentStep]) {
    const key = k.trim();
    if (key && !own.has(key) && !extra.includes(key)) extra.push(key);
  }
  const unknown = (key: string): Draft => ({ key, label: label(key), fields: [], submit: false, known: false });
  const list: Draft[] = [];
  let placed = false;
  for (const d of defs) {
    if (d.submit && !placed) {
      list.push(...extra.map(unknown));
      placed = true;
    }
    const fields = d.submit ? [...d.fields, ...leftovers.filter((f) => !d.fields.includes(f))] : d.fields;
    list.push(d.link ? { key: d.key, label: label(d.key), fields, submit: !!d.submit, known: true, link: d.link } : { key: d.key, label: label(d.key), fields, submit: !!d.submit, known: true });
  }
  if (!placed) list.push(...extra.map(unknown));
  const done = new Set(j.completedSteps.map((s) => s.trim()));
  const cur = j.currentStep.trim();
  const current = cur && !done.has(cur) && list.some((s) => s.key === cur) ? cur : (list.find((s) => !done.has(s.key))?.key ?? "");
  return list.map((s) => ({ ...s, state: done.has(s.key) ? "done" : s.key === current ? "current" : "todo" }));
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
