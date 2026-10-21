import { studioDetailSnapshot, type StudioSchemaField } from "@/lib/services/studio";
import { carryRowKey } from "../../form/logic";
import type { SxPayload, SxValues } from "../../contract";
import type { SxErrors } from "../../types";

type Dict = Record<string, unknown>;

export const INTAKE = "intake_questions";
export const SERVICE_TERMS = "service_terms_text";
export const INTAKE_LABEL = "label";
export const INTAKE_TYPE = "type";
export const INTAKE_REQUIRED = "required";
export const INTAKE_OPTIONS = "options";
export const INTAKE_PLACEHOLDER = "placeholder";
export const INTAKE_TEXT_KEYS: readonly string[] = [INTAKE_LABEL, "question", "title", "text", "prompt"];
export const INTAKE_TYPE_KEYS: readonly string[] = [INTAKE_TYPE, "answer_type", "input_type", "field_type"];
export const INTAKE_REQUIRED_KEYS: readonly string[] = [INTAKE_REQUIRED, "is_required"];
export const INTAKE_CHOICE_KEYS: readonly string[] = [INTAKE_OPTIONS, "choices"];
export const INTAKE_ORDER_KEYS: readonly string[] = ["order", "sort_order", "position"];
export const INTAKE_HIDDEN_KEYS: readonly string[] = ["id", ...INTAKE_ORDER_KEYS];
export const INTAKE_CHOICE_TYPES: ReadonlySet<string> = new Set(["select", "multiselect", "single_choice", "multiple_choice", "choice", "radio", "checkbox", "checkboxes", "dropdown", "multi_select"]);
export const INTAKE_MIN_CHOICES = 2;

const CANONICAL: readonly (readonly [string, readonly string[]])[] = [
  [INTAKE_LABEL, INTAKE_TEXT_KEYS],
  [INTAKE_TYPE, INTAKE_TYPE_KEYS],
  [INTAKE_REQUIRED, INTAKE_REQUIRED_KEYS],
  [INTAKE_OPTIONS, INTAKE_CHOICE_KEYS],
];

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const own = (row: SxValues, key: string): boolean => Object.prototype.hasOwnProperty.call(row, key);

function firstOwn(row: SxValues, keys: readonly string[]): string {
  return keys.find((k) => own(row, k)) ?? "";
}

export function intakeItemOf(code = "K02"): StudioSchemaField | null {
  const ctor = studioDetailSnapshot(code || "K02");
  const f: StudioSchemaField | undefined = ctor?.typed.find((x) => x.key === INTAKE);
  return f?.type === "list" && f.item?.type === "object" ? f.item : null;
}

function itemSchemaKeys(code: string): string[] {
  return intakeItemOf(code)?.properties.map((p) => p.key) ?? [];
}

export function schemaChoiceTypes(code = "K02"): ReadonlySet<string> | null {
  const item = intakeItemOf(code);
  if (!item) return null;
  const opt = item.properties.find((p) => INTAKE_CHOICE_KEYS.includes(p.key));
  const w = opt?.visibleWhen;
  if (!w || !INTAKE_TYPE_KEYS.includes(w.field)) return null;
  const list = Array.isArray(w.in) ? w.in : "equals" in w ? [w.equals] : null;
  if (!list) return null;
  const out = new Set(list.map((x) => str(x).toLowerCase()).filter(Boolean));
  return out.size ? out : null;
}

export function intakeTypeOf(row: unknown): string {
  if (!isDict(row)) return "";
  for (const k of INTAKE_TYPE_KEYS) {
    const v = str(row[k]).toLowerCase();
    if (v) return v;
  }
  return "";
}

export function isChoiceType(type: string, code = "K02"): boolean {
  const t = String(type ?? "").trim().toLowerCase();
  return (schemaChoiceTypes(code) ?? INTAKE_CHOICE_TYPES).has(t);
}

function choiceText(v: unknown): string {
  if (isDict(v)) return str(v.label) || str(v.value) || str(v.title) || str(v.text);
  return str(v);
}

export function intakeChoicesOf(row: unknown): unknown[] {
  if (!isDict(row)) return [];
  for (const k of INTAKE_CHOICE_KEYS) if (Array.isArray(row[k])) return row[k] as unknown[];
  return [];
}

export function intakeQuestionOf(row: unknown): string {
  if (!isDict(row)) return "";
  for (const k of INTAKE_TEXT_KEYS) {
    const v = str(row[k]);
    if (v) return v;
  }
  return "";
}

export function showIntakeChoices(row: unknown, code = "K02"): boolean {
  const type = intakeTypeOf(row);
  if (type) return isChoiceType(type, code);
  return intakeChoicesOf(row).length > 0;
}

export function canonicalRow(row: Dict, declared: readonly string[]): Dict {
  let out: Dict | null = null;
  for (const [key, all] of CANONICAL) {
    if (own(row, key) || (declared.length > 0 && !declared.includes(key))) continue;
    const legacy = all.find((k) => k !== key && own(row, k) && !declared.includes(k));
    if (!legacy) continue;
    if (!out) out = { ...row };
    out[key] = row[legacy];
    delete out[legacy];
  }
  if (!out) return row;
  carryRowKey(row, out);
  return out;
}

export function intakeOrderKey(rows: readonly unknown[], code = "K02"): string {
  const known = itemSchemaKeys(code);
  const fromSchema = INTAKE_ORDER_KEYS.find((k) => known.includes(k));
  if (fromSchema) return fromSchema;
  for (const r of rows) {
    if (!isDict(r)) continue;
    const k = firstOwn(r, INTAKE_ORDER_KEYS);
    if (k) return k;
  }
  return "";
}

function tidyRow(row: Dict, index: number, orderKey: string, code: string): Dict {
  let out: Dict | null = null;
  const edit = (): Dict => {
    if (!out) out = { ...row };
    return out;
  };
  if (orderKey && row[orderKey] !== index + 1) edit()[orderKey] = index + 1;
  const type = intakeTypeOf(row);
  if (type && !isChoiceType(type, code)) {
    for (const k of INTAKE_CHOICE_KEYS) if (Array.isArray(row[k]) && (row[k] as unknown[]).length) edit()[k] = [];
  }
  if (!out) return row;
  carryRowKey(row, out);
  return out;
}

function needsCanonical(rows: readonly unknown[], declared: readonly string[]): boolean {
  return rows.some((r) => isDict(r) && canonicalRow(r, declared) !== r);
}

export function intakeTidy(next: SxPayload, prev: SxValues, code = "K02"): SxPayload {
  const rows = next[INTAKE];
  if (!Array.isArray(rows)) return next;
  const declared = itemSchemaKeys(code);
  const same = rows === prev[INTAKE];
  if (same && !needsCanonical(rows, declared)) return next;
  const orderKey = same ? "" : intakeOrderKey(rows, code);
  let changed = false;
  const out = rows.map((r, i) => {
    if (!isDict(r)) return r;
    const c = canonicalRow(r, declared);
    const t = same ? c : tidyRow(c, i, orderKey, code);
    if (t !== r) changed = true;
    return t;
  });
  return changed ? { ...next, [INTAKE]: out } : next;
}

export function intakeErrors(payload: SxValues, code = "K02"): SxErrors {
  const out: Record<string, string> = {};
  const rows = payload[INTAKE];
  if (!Array.isArray(rows)) return out;
  rows.forEach((row, i) => {
    if (!isDict(row)) return;
    const base = `${INTAKE}.${i}`;
    const textKey = firstOwn(row, INTAKE_TEXT_KEYS);
    if (textKey && !str(row[textKey])) out[`${base}.${textKey}`] = "@required";
    if (!isChoiceType(intakeTypeOf(row), code)) return;
    const choiceKey = firstOwn(row, INTAKE_CHOICE_KEYS) || INTAKE_OPTIONS;
    const list = intakeChoicesOf(row);
    const filled = list.map(choiceText).filter(Boolean);
    if (filled.length < INTAKE_MIN_CHOICES) {
      out[`${base}.${choiceKey}`] = `@code:intake_choices_min:${INTAKE_MIN_CHOICES}`;
      return;
    }
    const seen = new Set<string>();
    list.forEach((c, j) => {
      const s = choiceText(c).toLocaleLowerCase();
      if (!s) {
        out[`${base}.${choiceKey}.${j}`] = "@required";
        return;
      }
      if (seen.has(s)) out[`${base}.${choiceKey}.${j}`] = "@duplicate";
      seen.add(s);
    });
  });
  return out;
}
