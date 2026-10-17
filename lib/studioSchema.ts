// Checks and clean-up for a payload against a constructor's typed schema
// (definition version 3). Pure functions: no React, no fetch.
//
// Paths are written with dots only ("prices.monthly", "backgrounds.2.key");
// the backend may answer with brackets ("sections[0].fields[0].type"), which
// normPath turns into the same form so an error lands next to its field.
import type { StudioFieldErrors, StudioSchemaField } from "@/lib/services/studio";

type Dict = Record<string, unknown>;

// Error tokens the editor turns into words (studio.fieldErr / editors.err).
export const SCHEMA_ERR = {
  required: "@required",
  min: "@min",
  max: "@max",
  option: "@option",
  minItems: "@minItems",
  duplicate: "@duplicate",
  number: "@number",
  object: "@object",
  list: "@list",
} as const;

export const normPath = (p: string) => p.replace(/\[(\d+)\]/g, ".$1").replace(/^\.+|\.+$/g, "").replace(/\.{2,}/g, ".");
export const joinPath = (...parts: (string | number)[]) => parts.filter((x) => x !== "").join(".");

export function normErrorPaths(errors: StudioFieldErrors): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  for (const [k, v] of Object.entries(errors)) {
    const key = normPath(k);
    out[key] = out[key] ? `${out[key]}; ${v}` : v;
  }
  return out;
}

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
export const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0) || (isDict(v) && Object.values(v).every((x) => isEmpty(x)));

// The value a list item's uniqueness is judged by.
function uniqueValue(item: unknown, by: string): string {
  const v = isDict(item) ? item[by] : item;
  return typeof v === "string" ? v.trim().toLowerCase() : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
}

function checkField(f: StudioSchemaField, value: unknown, path: string, required: boolean, out: StudioFieldErrors) {
  if (isEmpty(value)) {
    if (required) out[path] = SCHEMA_ERR.required;
    // An optional object may still be half-filled: its own required children
    // only matter once it holds anything.
    return;
  }
  switch (f.type) {
    case "number":
    case "money": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) out[path] = SCHEMA_ERR.number;
      else if (f.min !== null && n < f.min) out[path] = SCHEMA_ERR.min;
      else if (f.max !== null && n > f.max) out[path] = SCHEMA_ERR.max;
      return;
    }
    case "text":
    case "textarea":
    case "richtext":
    case "code": {
      const len = typeof value === "string" ? value.trim().length : 0;
      if (f.min !== null && len < f.min) out[path] = SCHEMA_ERR.min;
      else if (f.max !== null && len > f.max) out[path] = SCHEMA_ERR.max;
      return;
    }
    case "select":
      if (f.options.length && !f.options.includes(String(value))) out[path] = SCHEMA_ERR.option;
      return;
    case "multiselect":
      if (!Array.isArray(value)) out[path] = SCHEMA_ERR.list;
      else if (f.options.length && value.some((x) => !f.options.includes(String(x)))) out[path] = SCHEMA_ERR.option;
      return;
    case "object": {
      if (!isDict(value)) {
        out[path] = SCHEMA_ERR.object;
        return;
      }
      const need = new Set(f.requiredFields);
      for (const p of f.properties) if (!p.hidden && fieldVisible(p, value)) checkField(p, value[p.key], joinPath(path, p.key), p.required || need.has(p.key), out);
      return;
    }
    case "list": {
      if (!Array.isArray(value)) {
        out[path] = SCHEMA_ERR.list;
        return;
      }
      if (f.minItems && value.length < f.minItems) out[path] = SCHEMA_ERR.minItems;
      if (f.item) {
        const itemReq = f.item.type !== "object";
        value.forEach((item, i) => checkField(f.item!, item, joinPath(path, i), itemReq, out));
      }
      if (f.uniqueBy) {
        const by = f.uniqueBy;
        const seen = new Map<string, number>();
        value.forEach((item, i) => {
          const key = uniqueValue(item, by);
          if (!key) return;
          const where = isDict(item) ? joinPath(path, i, by) : joinPath(path, i);
          if (seen.has(key)) out[where] = SCHEMA_ERR.duplicate;
          else seen.set(key, i);
        });
      }
      return;
    }
  }
}

// Every rule the schema states: required (top level and required_fields),
// a required object or list that is still empty, min/max, options,
// min_items, unique_by — nested as deep as the schema goes.
export function schemaValidate(fields: StudioSchemaField[], payload: Dict, required: string[] = []): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  const need = new Set(required);
  // A field the backend fills from the route context is not the user's to fill.
  for (const f of fields) if (!f.hidden && fieldVisible(f, payload)) checkField(f, payload[f.key], f.key, f.required || need.has(f.key), out);
  return out;
}

function cleanValue(f: StudioSchemaField | null, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (!f) return value;
  if ((f.type === "number" || f.type === "money") && (value === "" || value === null)) return undefined;
  if (f.type === "object" && isDict(value)) {
    const known = new Map(f.properties.map((p) => [p.key, p]));
    const out: Dict = {};
    for (const [k, v] of Object.entries(value)) {
      const p = known.get(k);
      const c = cleanValue(p ?? null, v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  if (f.type === "list" && Array.isArray(value)) return value.map((v) => cleanValue(f.item, v)).filter((v) => v !== undefined);
  return value;
}

export function cleanPayload(fields: StudioSchemaField[], payload: Dict): Dict {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: Dict = {};
  for (const [k, v] of Object.entries(pruneInvisible(fields, payload))) {
    const c = cleanValue(byKey.get(k) ?? null, v);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

// An empty item of a list: an object item starts from its fields' defaults.
export function emptyItem(item: StudioSchemaField | null): unknown {
  if (!item) return "";
  if (item.type === "object") {
    const out: Dict = {};
    for (const p of item.properties) if (p.default !== undefined && p.default !== null) out[p.key] = JSON.parse(JSON.stringify(p.default));
    return out;
  }
  if (item.type === "boolean") return false;
  if (item.type === "number" || item.type === "money") return null;
  return "";
}

const sameValue = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");

export function fieldVisible(f: StudioSchemaField, scope: Dict): boolean {
  const w = f.visibleWhen;
  if (!w) return true;
  const v = scope[w.field];
  if (w.in) return w.in.some((x) => sameValue(x, v));
  if ("equals" in w) return sameValue(w.equals, v);
  if ("notEquals" in w) return !sameValue(w.notEquals, v);
  return !isEmpty(v);
}

function pruneValue(f: StudioSchemaField, value: unknown): unknown {
  if (f.type === "object" && isDict(value) && f.properties.length) return pruneFields(f.properties, value);
  const props = f.item?.type === "object" ? f.item.properties : [];
  if (f.type === "list" && Array.isArray(value) && props.length) {
    let changed = false;
    const next = value.map((x) => {
      const y = isDict(x) ? pruneFields(props, x) : x;
      if (y !== x) changed = true;
      return y;
    });
    return changed ? next : value;
  }
  return value;
}

function pruneFields(fields: StudioSchemaField[], obj: Dict): Dict {
  let out = obj;
  for (const f of fields) {
    if (!(f.key in obj)) continue;
    const v = obj[f.key];
    if (!fieldVisible(f, obj) || (f.generated && isEmpty(v))) {
      if (out === obj) out = { ...obj };
      delete out[f.key];
      continue;
    }
    const nv = pruneValue(f, v);
    if (nv !== v) {
      if (out === obj) out = { ...obj };
      out[f.key] = nv;
    }
  }
  return out;
}

// A value whose field is not shown (visible_when) is not kept or sent, and a
// backend-generated id left empty is omitted so the backend makes one.
export function pruneInvisible(fields: StudioSchemaField[], payload: Dict): Dict {
  return pruneFields(fields, payload);
}

const TARGET_ROOTS = new Set(["", "_", "target", "target_id", "target_type"]);

// An error about the target as a whole lands on the field the person picks:
// the service or package select for target_required, the type for
// conflicting_target.
export function targetErrors(errors: StudioFieldErrors, payload: Dict): StudioFieldErrors {
  let out = errors;
  for (const [k, v] of Object.entries(errors)) {
    const to = v === "@code:target_required" && TARGET_ROOTS.has(k) ? (payload.target_type === "package" ? "package_id" : "service_id") : v === "@code:conflicting_target" && TARGET_ROOTS.has(k) && k !== "target_type" ? "target_type" : "";
    if (!to) continue;
    if (out === errors) out = { ...errors };
    delete out[k];
    out[to] = out[to] || v;
  }
  return out;
}

// The root field of an error path, for scrolling to it.
export const rootOf = (path: string) => normPath(path).split(".")[0] ?? "";

// Top-level keys whose value differs between two payloads.
export function changedRoots(a: Dict, b: Dict): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
