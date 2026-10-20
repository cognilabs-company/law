import { aiId, aiSeg } from "@/lib/ai/ids";
import { studioSectionsOf, studioReferenceKey, type StudioConstructor, type StudioSchemaField } from "@/lib/services/studio";
import { fieldVisible, isEmpty, normPath, schemaValidate } from "@/lib/studioSchema";
import { fieldSource } from "../ctor/sources";
import { carryRowKey } from "../form/logic";
import { codeLike } from "../labels";
import type { SxOutlineItem } from "../layout/Outline";
import type { SxFormPolicy } from "../form/formPolicy";
import type { SxErrors } from "../types";
import type { StudioLabels } from "../useStudioLabels";
import type {
  SchemaFieldModel,
  SchemaModel,
  SchemaOnly,
  SchemaSectionModel,
  SxControlKind,
  SxCtorLayout,
  SxEditMode,
  SxLayoutCtx,
  SxLayoutField,
  SxPayload,
  SxValues,
} from "../contract";

type Dict = Record<string, unknown>;

export type SchemaTr = { (key: string, values?: Record<string, string | number>): string; has(key: string): boolean };

export type BuildSchemaInput = {
  ctor: StudioConstructor;
  layout: SxCtorLayout;
  runtimeTarget: string;
  idPrefix: string;
  only?: SchemaOnly;
  labels: StudioLabels;
  t?: SchemaTr;
};

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");

const ONLY = new WeakMap<SchemaModel, SchemaOnly>();

export const RECORD_TITLE_PATH = "$title";

export function patternOf(path: string): string {
  const p = String(path ?? "");
  if (p === RECORD_TITLE_PATH) return p;
  return normPath(p)
    .split(".")
    .map((s) => (/^\d+$/.test(s) ? "*" : s))
    .join(".");
}

function segs(path: string): string[] {
  return normPath(String(path ?? "")).split(".").filter(Boolean);
}

export function getAt(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const s of segs(path)) {
    if (Array.isArray(cur)) cur = /^\d+$/.test(s) ? cur[Number(s)] : undefined;
    else if (isDict(cur)) cur = cur[s];
    else return undefined;
  }
  return cur;
}

function setIn(cur: unknown, parts: readonly string[], value: unknown): unknown {
  const [head, ...rest] = parts;
  const index = /^\d+$/.test(head) ? Number(head) : -1;
  if (Array.isArray(cur) && index >= 0) {
    const out = cur.slice();
    if (!rest.length) {
      if (value === undefined) out.splice(index, 1);
      else {
        out[index] = value;
        carryRowKey(cur[index], value);
      }
      return out;
    }
    out[index] = setIn(cur[index], rest, value);
    carryRowKey(cur[index], out[index]);
    return out;
  }
  const base: Dict = isDict(cur) ? { ...cur } : {};
  if (!rest.length) {
    if (value === undefined) delete base[head];
    else base[head] = value;
    return base;
  }
  const child = base[head];
  const nextIsIndex = /^\d+$/.test(rest[0]);
  base[head] = setIn(child === undefined || child === null ? (nextIsIndex ? [] : {}) : child, rest, value);
  return base;
}

export function setAt(obj: SxValues, path: string, value: unknown): SxPayload {
  const parts = segs(path);
  if (!parts.length) return { ...obj };
  return setIn(obj, parts, value) as SxPayload;
}

export function parentPath(path: string): string {
  const parts = segs(path);
  parts.pop();
  return parts.join(".");
}

export function lastKey(path: string): string {
  const parts = segs(path);
  return parts[parts.length - 1] ?? "";
}

export function scopeAt(root: SxValues, path: string): SxValues {
  const parent = parentPath(path);
  if (!parent) return root;
  const v = getAt(root, parent);
  return isDict(v) ? v : {};
}

export function schemaFieldAt(fields: readonly StudioSchemaField[], pattern: string): StudioSchemaField | null {
  const parts = String(pattern ?? "")
    .split(".")
    .filter(Boolean);
  let list: readonly StudioSchemaField[] = fields;
  let found: StudioSchemaField | null = null;
  let i = 0;
  while (i < parts.length) {
    const key = parts[i];
    found = list.find((f) => f.key === key) ?? null;
    if (!found) return null;
    i += 1;
    if (i >= parts.length) return found;
    if (found.type === "list") {
      if (parts[i] !== "*" || !found.item) return null;
      i += 1;
      if (i >= parts.length) return found.item;
      list = found.item.properties;
    } else if (found.type === "object") {
      list = found.properties;
    } else return null;
  }
  return found;
}

function parentRequired(fields: readonly StudioSchemaField[], pattern: string, key: string): boolean {
  const parts = pattern.split(".");
  if (parts.length < 2) return false;
  let parent = parts.slice(0, -1).join(".");
  let owner = schemaFieldAt(fields, parent);
  if (owner?.type === "object") return owner.requiredFields.includes(key);
  if (parent.endsWith(".*")) {
    parent = parent.slice(0, -2);
    owner = schemaFieldAt(fields, parent);
    return !!owner?.item && owner.item.requiredFields.includes(key);
  }
  return false;
}

export function layoutFieldFor(model: Pick<SchemaModel, "layout">, pattern: string): SxLayoutField | null {
  const p = patternOf(pattern);
  return model.layout.fields?.find((f) => patternOf(f.path) === p) ?? null;
}

function layoutIndex(layout: SxCtorLayout): Map<string, SxLayoutField> {
  const map = new Map<string, SxLayoutField>();
  for (const f of layout.fields ?? []) map.set(patternOf(f.path), f);
  return map;
}

function sectionTitle(input: BuildSchemaInput, titleKey: string): string {
  const t = input.t;
  if (t && t.has(titleKey)) return t(titleKey);
  const m = /^sx\.section\.(.+)$/.exec(titleKey);
  return m ? input.labels.section(m[1], "") : titleKey;
}

export function buildSchemaModel(input: BuildSchemaInput): SchemaModel {
  const { ctor, layout, runtimeTarget, idPrefix, only } = input;
  const code = ctor.code || layout.code;
  const byPattern = layoutIndex(layout);
  const requiredTop = new Set(ctor.schema.required);
  const groups = studioSectionsOf(ctor);
  const layoutHidden = (pattern: string) => byPattern.get(pattern)?.hidden === true;
  const visibleTop = (f: StudioSchemaField) => !f.hidden && !layoutHidden(f.key);

  const fieldModel = (pattern: string): SchemaFieldModel | null => {
    const lf = byPattern.get(pattern) ?? null;
    if (lf?.hidden) return null;
    const f = schemaFieldAt(ctor.typed, pattern);
    if (!f && !lf?.virtual) return null;
    if (f?.hidden) return null;
    const parts = pattern.split(".");
    const key = parts[parts.length - 1];
    const required = f ? (parts.length === 1 ? f.required || requiredTop.has(key) : f.required || parentRequired(ctor.typed, pattern, key)) : false;
    return { pattern, key, field: f, layout: lf, required };
  };

  const domOf = (id: string) => `${idPrefix}-sec-${aiSeg(id)}`;
  const mkSection = (id: string, title: string, fields: SchemaFieldModel[], visible?: SchemaSectionModel["visible"]): SchemaSectionModel => {
    const domId = domOf(id);
    return visible ? { id, domId, headingId: `${domId}-h`, title, fields, visible } : { id, domId, headingId: `${domId}-h`, title, fields };
  };

  let sections: SchemaSectionModel[] = [];
  if (!ctor.typed.length) {
    sections = [mkSection("asosiy", input.labels.section("asosiy", ""), [])];
  } else if (layout.sections?.length) {
    const listed = new Set<string>();
    for (const s of layout.sections) for (const p of s.fields) listed.add(patternOf(p).split(".")[0]);
    for (const s of layout.sections) {
      const fields = s.fields.map((p) => fieldModel(patternOf(p))).filter((x): x is SchemaFieldModel => !!x);
      sections.push(mkSection(s.id, sectionTitle(input, s.titleKey), fields, s.visible));
    }
    for (const g of groups) {
      const rest = g.fields.filter((f) => visibleTop(f) && !listed.has(f.key)).map((f) => fieldModel(f.key)).filter((x): x is SchemaFieldModel => !!x);
      if (!rest.length) continue;
      const id = g.section.key || "main";
      const at = sections.findIndex((s) => s.id === id);
      if (at >= 0) sections[at] = { ...sections[at], fields: [...sections[at].fields, ...rest] };
      else sections.push(mkSection(id, input.labels.section(id, g.section.title), rest));
    }
  } else {
    for (const g of groups) {
      const fields = g.fields.filter(visibleTop).map((f) => fieldModel(f.key)).filter((x): x is SchemaFieldModel => !!x);
      if (!fields.length) continue;
      const id = g.section.key || "main";
      sections.push(mkSection(id, input.labels.section(id, g.section.title), fields));
    }
  }

  if (only && (only.sections?.length || only.fields?.length)) {
    const ids = new Set(only.sections ?? []);
    const pats = new Set((only.fields ?? []).map(patternOf));
    sections = sections
      .map((s) => (ids.has(s.id) ? s : { ...s, fields: s.fields.filter((f) => pats.has(f.pattern)) }))
      .filter((s) => s.fields.length > 0 || (ids.has(s.id) && !ctor.typed.length));
  } else sections = sections.filter((s) => s.fields.length > 0 || !ctor.typed.length);

  const titleTop = ctor.typed.find((f) => f.key === "title");
  const titleField = layout.titleField !== undefined ? layout.titleField : titleTop && visibleTop(titleTop) ? "title" : null;

  const model: SchemaModel = {
    code,
    runtimeTarget,
    ctor,
    layout,
    idPrefix,
    aiBase: aiId("admin.studio.editor", aiSeg(code.toLowerCase())),
    sections,
    titleField,
    typedEmpty: ctor.typed.length === 0,
  };
  if (only) ONLY.set(model, only);
  return model;
}

export function modelOnly(model: SchemaModel): SchemaOnly | undefined {
  return ONLY.get(model);
}

export function layoutCtx(model: SchemaModel, root: SxValues, scope: SxValues, mode: SxEditMode = "edit", recordId = ""): SxLayoutCtx {
  return { code: model.code, runtimeTarget: model.runtimeTarget, mode, recordId, root, scope };
}

export function dyn<T>(v: T | ((ctx: SxLayoutCtx) => T) | undefined, ctx: SxLayoutCtx): T | undefined {
  return typeof v === "function" ? (v as (ctx: SxLayoutCtx) => T)(ctx) : v;
}

function fieldIsShown(model: SchemaModel, pattern: string, concrete: string, root: SxValues): boolean {
  const pparts = pattern.split(".");
  const cparts = segs(concrete);
  for (let n = 1; n <= pparts.length; n++) {
    const sub = pparts.slice(0, n).join(".");
    if (pparts[n - 1] === "*") continue;
    const lf = layoutFieldFor(model, sub);
    if (!lf) continue;
    if (lf.hidden && n === pparts.length) return false;
    if (lf.visible) {
      const scope = n === 1 ? root : (() => {
        const v = getAt(root, cparts.slice(0, n - 1).join("."));
        return isDict(v) ? v : {};
      })();
      if (!lf.visible(layoutCtx(model, root, scope))) return false;
    }
  }
  return true;
}

function renderedFields(model: SchemaModel): { section: SchemaSectionModel; field: SchemaFieldModel }[] {
  const out: { section: SchemaSectionModel; field: SchemaFieldModel }[] = [];
  for (const s of model.sections) for (const f of s.fields) out.push({ section: s, field: f });
  return out;
}

function ownerOf(model: SchemaModel, path: string): { section: SchemaSectionModel; field: SchemaFieldModel } | null {
  const pat = patternOf(path);
  let best: { section: SchemaSectionModel; field: SchemaFieldModel } | null = null;
  for (const r of renderedFields(model)) {
    if (pat === r.field.pattern || pat.startsWith(`${r.field.pattern}.`)) {
      if (!best || r.field.pattern.length > best.field.pattern.length) best = r;
    }
  }
  return best;
}

export function errorShown(model: SchemaModel, path: string, root: SxValues): boolean {
  const owner = ownerOf(model, path);
  if (!owner) return false;
  if (owner.section.visible && !owner.section.visible(layoutCtx(model, root, root))) return false;
  return fieldIsShown(model, patternOf(path), normPath(path), root);
}

function knownPattern(model: SchemaModel, path: string): boolean {
  const pat = patternOf(path);
  const top = pat.split(".")[0];
  return model.ctor.typed.some((f) => f.key === top);
}

export function validatePayload(model: SchemaModel, payload: SxValues, recordTitle: string | null): SxErrors {
  const out: Record<string, string> = {};
  const root = payload as Dict;
  if (model.typedEmpty) {
    for (const key of model.ctor.schema.required) if (isEmpty(root[key])) out[key] = "@required";
  } else {
    const raw = schemaValidate(model.ctor.typed, root, model.ctor.schema.required);
    for (const [path, token] of Object.entries(raw)) if (errorShown(model, path, payload)) out[normPath(path)] = token;
  }
  const extra = model.layout.validate?.(payload) ?? {};
  const filtered = !!modelOnly(model);
  for (const [path, token] of Object.entries(extra)) {
    if (!token) continue;
    const norm = path === RECORD_TITLE_PATH ? path : normPath(path);
    if (ownerOf(model, norm)) {
      if (errorShown(model, norm, payload)) out[norm] = token;
    } else if (!filtered || !knownPattern(model, norm)) out[norm] = token;
  }
  if (recordTitle !== null && !String(recordTitle ?? "").trim()) out[RECORD_TITLE_PATH] = "@required";
  return out;
}

export function invalidOptionPaths(model: SchemaModel, payload: SxValues): string[] {
  return Object.entries(validatePayload(model, payload, null))
    .filter(([, token]) => token === "@option")
    .map(([path]) => path);
}

function filled(v: unknown): boolean {
  if (typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  return !isEmpty(v);
}

function sameAsDefault(v: unknown, def: unknown): boolean {
  if (def === undefined || def === null) return false;
  if (typeof def !== "object") return v === def;
  try {
    return JSON.stringify(v) === JSON.stringify(def);
  } catch {
    return false;
  }
}

function touchedValue(f: StudioSchemaField, v: unknown): boolean {
  if (v === false || f.readOnly || f.generated) return false;
  if (sameAsDefault(v, f.default)) return false;
  if (f.type === "object" && f.properties.length && isDict(v)) return f.properties.some((p) => touchedValue(p, v[p.key]));
  return filled(v);
}

function countsAsFilled(f: SchemaFieldModel, v: unknown, ctx: SxLayoutCtx): boolean {
  if (f.layout?.virtual) return false;
  if (f.field?.readOnly || f.field?.generated) return false;
  if (f.layout?.locked?.(ctx)) return false;
  if (ctx.mode === "create") return f.field ? touchedValue(f.field, v) : filled(v);
  return filled(v);
}

function rowsExist(root: SxValues, path: string): boolean {
  let cur: unknown = root;
  for (const s of segs(path)) {
    if (/^\d+$/.test(s) && (!Array.isArray(cur) || Number(s) >= cur.length)) return false;
    cur = Array.isArray(cur) ? cur[Number(s)] : isDict(cur) ? cur[s] : undefined;
  }
  return true;
}

export function outlineItems(
  model: SchemaModel,
  payload: SxValues,
  errors: SxErrors,
  policy: Pick<SxFormPolicy, "visibleCount">,
  ctx: { mode: SxEditMode; recordId: string },
  labels: StudioLabels,
): SxOutlineItem[] {
  void labels;
  const live: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors)) if (k === RECORD_TITLE_PATH || rowsExist(payload, k)) live[k] = v;
  const out: SxOutlineItem[] = [];
  for (const s of model.sections) {
    if (s.visible && !s.visible(layoutCtx(model, payload, payload, ctx.mode, ctx.recordId))) continue;
    let errs = 0;
    let missing = false;
    let any = false;
    const lctx = layoutCtx(model, payload, payload, ctx.mode, ctx.recordId);
    const shown = s.fields.filter((f) => fieldIsShown(model, f.pattern, f.pattern, payload) && (!f.field || fieldVisible(f.field, payload as Dict)));
    for (const f of shown) {
      errs += policy.visibleCount(f.pattern, live);
      const v = getAt(payload, f.pattern);
      if (countsAsFilled(f, v, lctx)) any = true;
      else if (f.required && !filled(v)) missing = true;
    }
    if (s === model.sections[0] && live[RECORD_TITLE_PATH]) errs += policy.visibleCount(RECORD_TITLE_PATH, live);
    const state: SxOutlineItem["state"] = errs > 0 ? "error" : !missing && any ? "done" : "todo";
    out.push({ id: s.domId, label: s.title, state, errors: errs });
  }
  return out;
}

const SOURCE_TYPES = new Set(["select", "text", "multiselect", "list"]);
const MONO_KEY = /^(slug|code|rule_key)$|_key$/;
const DATETIME_KEY = /(_at|_until)$/;
const ISO_DT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

export function effectiveSource(code: string, fm: Pick<SchemaFieldModel, "pattern" | "field">, scope: SxValues): string {
  const f = fm.field;
  if (!f) return "";
  if (!SOURCE_TYPES.has(f.type)) return "";
  if (f.type === "list" && f.item?.type === "object") return "";
  const schemaSource = f.source || f.item?.source || "";
  return String(fieldSource(code, fm.pattern, scope, schemaSource) ?? "").trim();
}

export function isCategorySource(source: string): boolean {
  return !!source && studioReferenceKey(source).key === "service-categories";
}

export function controlFor(code: string, fm: Pick<SchemaFieldModel, "pattern" | "key" | "field" | "layout">, value: unknown, ctx: SxLayoutCtx): SxControlKind {
  const lf = fm.layout;
  const own = dyn(lf?.control, ctx);
  if (own) return own;
  const v = lf?.virtual;
  if (v && !fm.field) {
    if (v.display) return "display";
    if (v.type === "boolean") return "switch";
    if (v.type === "number") return "number";
    if (v.type === "money") return "money";
    if (v.type === "select") return "picker";
    return "text";
  }
  const f = fm.field;
  if (!f) return typeof value === "string" ? "text" : "display";
  const source = effectiveSource(code, fm, ctx.scope);
  if (source) return f.type === "multiselect" || f.type === "list" ? "pickerMulti" : "picker";
  switch (f.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
      if (f.type === "text" && MONO_KEY.test(f.key)) return "mono";
      if (f.type === "text" && (DATETIME_KEY.test(f.key) || (typeof value === "string" && ISO_DT.test(value)))) return "datetime";
      return "text";
    case "textarea":
      return "textarea";
    case "code":
      return "textarea";
    case "richtext":
      return "richtext";
    case "number":
      return "number";
    case "money":
      return "money";
    case "boolean":
      return "switch";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "select":
      return f.options.length ? "picker" : "text";
    case "multiselect":
      return "pickerMulti";
    case "list":
      if (f.key === "discovery_terms") return "tags";
      if (f.item?.type === "select" && f.item.options.length) return "pickerMulti";
      if (f.item?.type === "object") return "repeater";
      return "repeaterInline";
    case "object":
      return f.properties.length ? "object" : "keyValue";
    default:
      return typeof value === "string" ? "text" : "display";
  }
}

const WIDE: ReadonlySet<SxControlKind> = new Set<SxControlKind>(["textarea", "richtext", "object", "repeater", "repeaterInline", "pickerMulti", "tags", "keyValue", "choices", "switch"]);

export function spanFor(control: SxControlKind, key: string, lf: SxLayoutField | null): 1 | 2 {
  if (lf?.span) return lf.span;
  if (WIDE.has(control)) return 2;
  if ((control === "text" || control === "mono") && (key === "title" || key === "name" || key === "label")) return 2;
  return 1;
}

export function optionTextOf(
  value: string,
  opts: { layout: SxLayoutField | null; field: StudioSchemaField | null; code: string; key: string; labels: StudioLabels; t: SchemaTr },
): string {
  const { layout, field, code, key, labels, t } = opts;
  if (layout?.optionLabel) {
    const s = layout.optionLabel(value, labels);
    if (s) return s;
  }
  if (layout?.optionKey) {
    const k = layout.optionKey(value);
    if (k && t.has(k)) return t(k);
  }
  return labels.option(value, { ctor: code, field: key, backend: field?.optionLabels?.[value] }) || value;
}

export function rowSummaryText(
  item: unknown,
  index: number,
  opts: { field: StudioSchemaField | null; code: string; labels: StudioLabels; t: SchemaTr; refName?: (source: string, value: string) => string; scopeSource?: (pattern: string, p: StudioSchemaField) => string; pattern: string },
): string {
  const { field, code, labels, t } = opts;
  const fallback = t("sx.rep.item", { n: index + 1 });
  if (!isDict(item)) return str(item).trim() || fallback;
  const props = field?.item?.properties ?? [];
  const pick = (raw: string, key: string): string => {
    const v = raw.trim();
    if (!v) return "";
    const p = props.find((x) => x.key === key);
    const opt = p ? labels.option(v, { ctor: code, field: key, backend: p.optionLabels?.[v] }) : v;
    if (codeLike(v) && (!opt || opt === v)) return "";
    return opt || v;
  };
  for (const k of ["title", "name", "label", "question", "text"]) {
    const s = pick(str(item[k]), k);
    if (s) return s;
  }
  for (const p of props) {
    if (p.type !== "select") continue;
    const v = str(item[p.key]).trim();
    if (!v) continue;
    const s = labels.option(v, { ctor: code, field: p.key, backend: p.optionLabels?.[v] });
    if (s && (s !== v || !codeLike(v))) return s;
  }
  if (opts.refName && opts.scopeSource) {
    for (const p of props) {
      const v = str(item[p.key]).trim();
      if (!v) continue;
      const source = opts.scopeSource(`${opts.pattern}.*.${p.key}`, p);
      if (!source) continue;
      const name = opts.refName(source, v);
      if (name) return name;
    }
  }
  return fallback;
}

export function fieldLabelOf(model: SchemaModel, key: string, concrete: string, f: StudioSchemaField | null, lf: SxLayoutField | null, labels: StudioLabels, t: SchemaTr, ctx?: SxLayoutCtx): string {
  const own = dyn(lf?.label, ctx ?? layoutCtx(model, {}, {}));
  if (own && t.has(own)) return t(own);
  const vk = lf?.virtual?.labelKey;
  if (vk && t.has(vk)) return t(vk);
  return labels.field(key, { ctor: model.code, path: concrete, backend: f?.label });
}

export function labelTrail(model: SchemaModel, path: string, labels: StudioLabels, t: SchemaTr): string {
  const general = t("sx.editor.errGeneral");
  if (path === RECORD_TITLE_PATH) return t("sx.form.recordTitle");
  const parts = segs(path);
  if (!parts.length || parts[0] === "_") return general;
  const out: string[] = [];
  let list: readonly StudioSchemaField[] = model.ctor.typed;
  let pattern = "";
  let concrete = "";
  let current: StudioSchemaField | null = null;
  for (const s of parts) {
    concrete = concrete ? `${concrete}.${s}` : s;
    if (/^\d+$/.test(s)) {
      pattern = pattern ? `${pattern}.*` : "*";
      out.push(String(Number(s) + 1));
      if (current?.type === "list" && current.item) {
        list = current.item.properties;
        current = current.item;
      }
      continue;
    }
    pattern = pattern ? `${pattern}.${s}` : s;
    const f = list.find((x) => x.key === s) ?? null;
    const lf = layoutFieldFor(model, pattern);
    if (!f && !lf?.virtual) break;
    out.push(fieldLabelOf(model, s, concrete, f, lf, labels, t));
    current = f;
    list = f?.type === "object" ? f.properties : [];
  }
  return out.length ? out.join(" · ") : general;
}
