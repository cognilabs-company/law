import { normPath } from "@/lib/studioSchema";
import type { SxPayload, SxValues } from "../../contract";
import type { SxErrors } from "../../types";
import { intakeErrors } from "./intake";

type Dict = Record<string, unknown>;

export type Adjustment = "fixed" | "percent";
export type OverrideMode = "shared" | Adjustment;
export type SharedFactor = { type: Adjustment | ""; value: number | null };
export type ProofMethod = "checkbox" | "comment" | "image" | "file";
export type EvidenceMethod = Exclude<ProofMethod, "checkbox">;
export type SuggestLang = "uz_latn" | "uz_cyrl" | "ru" | "other";
export type SuggestGroup = { lang: SuggestLang; items: string[] };
export type ServiceSuggest = { groups: SuggestGroup[]; autoSaved: boolean };

export const FACTOR_IDS = "price_factor_ids";
export const FACTOR_OVERRIDES = "price_factor_overrides";
export const CHECKLIST = "completion_checklist";
export const TEMPLATE_MODE = "template_mode";
export const TEMPLATE_ID = "document_template_id";
export const TEMPLATE_SOURCE = "template_source";
export const TEMPLATE_SKIP = "not_required";
export type TemplateMode = "required" | "optional" | typeof TEMPLATE_SKIP;
export const CHECKLIST_LEGACY = "checklist_template_id";
export const PROOF_METHODS: readonly ProofMethod[] = ["checkbox", "comment", "image", "file"];
export const EVIDENCE_METHODS: readonly EvidenceMethod[] = ["comment", "image", "file"];
export const REQUIRED_KEY: Readonly<Record<EvidenceMethod, string>> = { comment: "comment_required", image: "image_required", file: "file_required" };
export const PERCENT_MAX = 100;
export const SUGGEST_LANGS: readonly SuggestLang[] = ["uz_latn", "uz_cyrl", "ru"];

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const numOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const fold = (s: string) => s.trim().toLocaleLowerCase();

export function idsOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = str(x);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function overridesOf(v: unknown): Dict {
  return isDict(v) ? v : {};
}

export function adjustmentOf(v: unknown): Adjustment | "" {
  const s = str(v).toLowerCase();
  return s === "fixed" || s === "percent" ? s : "";
}

export function modeOf(overrides: unknown, id: string): OverrideMode {
  const o = overridesOf(overrides)[id];
  if (!isDict(o)) return "shared";
  return adjustmentOf(o.adjustment_type) || "shared";
}

export function overrideValueOf(overrides: unknown, id: string): number | undefined {
  const o = overridesOf(overrides)[id];
  if (!isDict(o)) return undefined;
  const n = numOf(o.value);
  return n === null ? undefined : n;
}

export function withOverride(overrides: unknown, id: string, mode: OverrideMode, value?: number | null): Dict {
  const out: Dict = { ...overridesOf(overrides) };
  if (mode === "shared") {
    delete out[id];
    return out;
  }
  const entry: Dict = { adjustment_type: mode };
  if (typeof value === "number" && Number.isFinite(value)) entry.value = value;
  out[id] = entry;
  return out;
}

export function switchMode(overrides: unknown, id: string, mode: OverrideMode): Dict {
  if (mode === "shared") return withOverride(overrides, id, "shared");
  const before = modeOf(overrides, id);
  const keep = overrideValueOf(overrides, id);
  const value = keep === undefined || (mode === "percent" && before !== "percent" && keep > PERCENT_MAX) ? undefined : keep;
  return withOverride(overrides, id, mode, value);
}

export function pruneOverrides(overrides: unknown, ids: readonly string[]): Dict | null {
  const o = overridesOf(overrides);
  const keep = new Set(ids);
  const gone = Object.keys(o).filter((k) => !keep.has(k));
  if (!gone.length) return null;
  const out: Dict = { ...o };
  for (const k of gone) delete out[k];
  return out;
}

export function sharedFactorOf(raw: unknown): SharedFactor {
  const r = isDict(raw) ? raw : {};
  const p = isDict(r.payload) ? r.payload : {};
  const type = adjustmentOf(p.adjustment_type) || adjustmentOf(r.adjustment_type);
  const value = numOf(p.value) ?? numOf(r.adjustment_value) ?? numOf(r.value_amount) ?? (typeof r.value === "number" ? numOf(r.value) : null);
  return { type, value };
}

export function overrideErrors(payload: SxValues): Record<string, string> {
  const out: Record<string, string> = {};
  const ids = new Set(idsOf(payload[FACTOR_IDS]));
  for (const [id, raw] of Object.entries(overridesOf(payload[FACTOR_OVERRIDES]))) {
    const base = `${FACTOR_OVERRIDES}.${id}`;
    if (!ids.has(id)) {
      out[base] = "@code:factor_not_selected";
      continue;
    }
    if (!isDict(raw)) {
      out[base] = "@object";
      continue;
    }
    const type = adjustmentOf(raw.adjustment_type);
    if (!type) {
      out[`${base}.adjustment_type`] = "@code:invalid_option";
      continue;
    }
    const n = numOf(raw.value);
    if (raw.value === undefined || raw.value === null || raw.value === "") out[`${base}.value`] = "@required";
    else if (n === null) out[`${base}.value`] = "@number";
    else if (n < 0) out[`${base}.value`] = "@code:minimum:0";
    else if (type === "percent" && n > PERCENT_MAX) out[`${base}.value`] = `@code:maximum:${PERCENT_MAX}`;
  }
  return out;
}

export function methodsOf(row: unknown): ProofMethod[] {
  const r = isDict(row) ? row : {};
  const raw = Array.isArray(r.verification_methods) ? r.verification_methods.map((x) => str(x)) : [];
  return PROOF_METHODS.filter((m) => m === "checkbox" || raw.includes(m));
}

export function hasMethod(row: unknown, m: ProofMethod): boolean {
  return methodsOf(row).includes(m);
}

export function isMustHave(row: unknown, m: EvidenceMethod): boolean {
  const r = isDict(row) ? row : {};
  return r[REQUIRED_KEY[m]] === true;
}

export function toggleMethod(row: Dict, m: EvidenceMethod, on: boolean): Dict {
  const have = new Set(methodsOf(row));
  if (on) have.add(m);
  else have.delete(m);
  const out: Dict = { ...row, verification_methods: PROOF_METHODS.filter((x) => x === "checkbox" || have.has(x)) };
  if (!on) out[REQUIRED_KEY[m]] = false;
  else if (typeof out[REQUIRED_KEY[m]] !== "boolean") out[REQUIRED_KEY[m]] = false;
  return out;
}

export function setMustHave(row: Dict, m: EvidenceMethod, on: boolean): Dict {
  if (on && !hasMethod(row, m)) return row;
  return { ...row, verification_methods: methodsOf(row), [REQUIRED_KEY[m]]: on };
}

export function newCheckRow(defaults: unknown): Dict {
  const d = isDict(defaults) ? defaults : {};
  const out: Dict = { ...d };
  delete out.id;
  out.title = str(d.title);
  out.description = str(d.description);
  out.required = typeof d.required === "boolean" ? d.required : true;
  out.verification_methods = methodsOf(d);
  for (const m of EVIDENCE_METHODS) out[REQUIRED_KEY[m]] = d[REQUIRED_KEY[m]] === true && hasMethod(d, m);
  return out;
}

export function checklistErrors(payload: SxValues): Record<string, string> {
  const out: Record<string, string> = {};
  const list = payload[CHECKLIST];
  if (!Array.isArray(list)) return out;
  list.forEach((row, i) => {
    if (!isDict(row)) return;
    const raw = Array.isArray(row.verification_methods) ? row.verification_methods.map((x) => str(x)) : null;
    const base = `${CHECKLIST}.${i}`;
    if (raw && !raw.includes("checkbox")) out[`${base}.verification_methods`] = "@code:checkbox_required";
    for (const m of EVIDENCE_METHODS) if (row[REQUIRED_KEY[m]] === true && !(raw ?? []).includes(m)) out[`${base}.${REQUIRED_KEY[m]}`] = "@code:verification_method_missing";
  });
  return out;
}

export function templateModeOf(v: unknown): TemplateMode | "" {
  const s = str(v).toLowerCase();
  return s === "required" || s === "optional" || s === TEMPLATE_SKIP ? s : "";
}

export function templateSkipped(payload: SxValues): boolean {
  return templateModeOf(payload[TEMPLATE_MODE]) === TEMPLATE_SKIP;
}

export function templateErrors(payload: SxValues): Record<string, string> {
  if (templateSkipped(payload) || str(payload[TEMPLATE_ID])) return {};
  return { [TEMPLATE_MODE]: "@code:template_required" };
}

export function templatePatch(payload: SxValues, change: { skip: boolean; remembered?: TemplateMode | "" } | { pick: string }): Dict {
  const mode = templateModeOf(payload[TEMPLATE_MODE]);
  if ("pick" in change) {
    const out: Dict = { [TEMPLATE_ID]: change.pick || undefined };
    if (change.pick && (!mode || mode === TEMPLATE_SKIP)) out[TEMPLATE_MODE] = "required";
    if (change.pick && !str(payload[TEMPLATE_SOURCE])) out[TEMPLATE_SOURCE] = "catalog";
    return out;
  }
  if (change.skip) return { [TEMPLATE_MODE]: TEMPLATE_SKIP };
  const back = change.remembered && change.remembered !== TEMPLATE_SKIP ? change.remembered : "required";
  return { [TEMPLATE_MODE]: back };
}

export function k02Validate(payload: SxValues): SxErrors {
  return { ...overrideErrors(payload), ...checklistErrors(payload), ...intakeErrors(payload) };
}

export function k02FormValidate(payload: SxValues): SxErrors {
  return { ...k02Validate(payload), ...templateErrors(payload) };
}

export function k03mValidate(payload: SxValues): SxErrors {
  return overrideErrors(payload);
}

const sameIds = (a: unknown, b: unknown) => idsOf(a).join("\n") === idsOf(b).join("\n");

export function k02Prune(next: SxPayload, prev: SxValues): SxPayload {
  if (sameIds(next[FACTOR_IDS], prev[FACTOR_IDS]) || !isDict(next[FACTOR_OVERRIDES])) return next;
  const pruned = pruneOverrides(next[FACTOR_OVERRIDES], idsOf(next[FACTOR_IDS]));
  return pruned ? { ...next, [FACTOR_OVERRIDES]: pruned } : next;
}

export function checklistValueAfter(next: readonly unknown[], absentAtStart: boolean): unknown[] | undefined {
  return next.length === 0 && absentAtStart ? undefined : [...next];
}

function stepsOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (isDict(x) ? str(x.title) || str(x.text) || str(x.label) : str(x))).filter(Boolean);
}

function inlineOf(v: unknown, keys: readonly string[]): Dict[] {
  if (!Array.isArray(v)) return [];
  const out: Dict[] = [];
  for (const x of v) {
    if (!isDict(x)) continue;
    const row: Dict = {};
    for (const k of keys) if (str(x[k])) row[k] = str(x[k]);
    if (Object.keys(row).length) out.push(row);
  }
  return out;
}

export function canSuggest(root: SxValues): boolean {
  return !!str(root.title) && !!str(root.description);
}

export function suggestBody(root: SxValues): Dict {
  return {
    title: str(root.title),
    description: str(root.description),
    client_value: str(root.client_value),
    category_id: str(root.category_id),
    usage_steps: stepsOf(root.usage_steps),
    inline_rules: inlineOf(root.inline_rules, ["title", "body"]),
    inline_guarantees: inlineOf(root.inline_guarantees, ["title", "description"]),
    discovery_terms: Array.isArray(root.discovery_terms) ? root.discovery_terms.map((x) => str(x)).filter(Boolean) : [],
  };
}

function termOf(x: unknown): string {
  if (isDict(x)) return str(x.value) || str(x.term) || str(x.text) || str(x.label);
  return str(x);
}

export function parseServiceSuggest(raw: unknown): ServiceSuggest {
  const d = isDict(raw) ? raw : {};
  const data = isDict(d.data) ? d.data : d;
  const by = isDict(data.by_language) ? data.by_language : {};
  const seen = new Set<string>();
  const groups: SuggestGroup[] = [];
  const take = (lang: SuggestLang, list: unknown) => {
    if (!Array.isArray(list)) return;
    const items: string[] = [];
    for (const x of list) {
      const s = termOf(x);
      if (!s || seen.has(fold(s))) continue;
      seen.add(fold(s));
      items.push(s);
    }
    const at = groups.findIndex((g) => g.lang === lang);
    if (at >= 0) groups[at] = { lang, items: [...groups[at].items, ...items] };
    else if (items.length) groups.push({ lang, items });
  };
  for (const lang of SUGGEST_LANGS) take(lang, by[lang]);
  for (const [k, v] of Object.entries(by)) if (!SUGGEST_LANGS.includes(k as SuggestLang)) take("other", v);
  const flat = Array.isArray(data.suggestions) ? data.suggestions : Array.isArray(data.items) ? data.items : [];
  take("other", flat);
  return { groups: groups.filter((g) => g.items.length), autoSaved: data.auto_saved === true };
}

export function freshGroups(groups: readonly SuggestGroup[], current: readonly string[]): SuggestGroup[] {
  const have = new Set(current.map(fold));
  return groups.map((g) => ({ lang: g.lang, items: g.items.filter((s) => !have.has(fold(s))) })).filter((g) => g.items.length);
}

const SUGGEST_ERR: Readonly<Record<string, string>> = {
  service_context_required: "sx.k02t.err.context",
  ai_provider_unavailable: "sx.k02t.err.unavailable",
  ai_generation_failed: "sx.k02t.err.failed",
  ai_response_invalid: "sx.k02t.err.invalid",
  ai_response_empty: "sx.k02t.err.empty",
};

export function suggestErrorKey(status: number, code: string): string {
  const c = String(code ?? "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SUGGEST_ERR, c)) return SUGGEST_ERR[c];
  if (status === 422) return "sx.k02t.err.context";
  if (status === 503) return "sx.k02t.err.unavailable";
  if (status === 502) return "sx.k02t.err.failed";
  return "sx.k02t.err.other";
}

export function suggestRetryable(key: string): boolean {
  return key !== "sx.k02t.err.context" && key !== "sx.k02t.err.unavailable";
}

export function errorsUnder(errors: SxErrors, prefix: string): [string, string][] {
  const base = normPath(prefix);
  return Object.entries(errors).filter(([k, v]) => {
    const n = normPath(k);
    return !!v && (n === base || n.startsWith(`${base}.`));
  });
}
