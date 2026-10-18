import type { SchemaModel, SxValues } from "../../contract";
import { stableJson } from "../../editor/model";
import { codeLike } from "../../labels";
import { effectiveSource, labelTrail, layoutFieldFor, optionTextOf, patternOf, rowSummaryText, schemaFieldAt, scopeAt, type SchemaTr } from "../../schema/model";
import type { StudioLabels } from "../../useStudioLabels";

export type DiffChange = "added" | "removed" | "changed";
export type DiffEntry = { path: string; top: string; change: DiffChange; before: unknown; after: unknown };
export type DiffLine = { path: string; label: string; change: DiffChange; before: string; after: string; long: boolean };
export type DiffLabelCtx = { model: SchemaModel | null; code: string; labels: StudioLabels; t: SchemaTr; refName: (source: string, value: string) => string; root?: SxValues };

type Dict = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG = 160;

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const hidden = (key: string): boolean => key.startsWith("_");

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  if (isDict(v)) return Object.keys(v).length === 0;
  return false;
}

function keysOf(after: Dict, before: Dict): string[] {
  return [...Object.keys(after), ...Object.keys(before).filter((k) => !(k in after))];
}

function changeOf(before: unknown, after: unknown): DiffChange {
  if (isEmptyValue(before)) return "added";
  if (isEmptyValue(after)) return "removed";
  return "changed";
}

export function payloadDiff(before: SxValues | null, after: SxValues, skip?: (top: string) => boolean): DiffEntry[] {
  const out: DiffEntry[] = [];
  const cur: Dict = isDict(after) ? after : {};
  const keep = (k: string) => !hidden(k) && !(skip && skip(k));
  if (before === null) {
    for (const k of Object.keys(cur)) if (keep(k) && !isEmptyValue(cur[k])) out.push({ path: k, top: k, change: "added", before: undefined, after: cur[k] });
    return out;
  }
  const walk = (b: unknown, a: unknown, path: string, top: string) => {
    if (isEmptyValue(a) && isEmptyValue(b)) return;
    if (stableJson(a) === stableJson(b)) return;
    const nest = (isDict(a) || isEmptyValue(a)) && (isDict(b) || isEmptyValue(b)) && (isDict(a) || isDict(b));
    if (nest) {
      const ad: Dict = isDict(a) ? a : {};
      const bd: Dict = isDict(b) ? b : {};
      for (const k of keysOf(ad, bd)) if (!hidden(k)) walk(bd[k], ad[k], `${path}.${k}`, top);
      return;
    }
    out.push({ path, top, change: changeOf(b, a), before: b, after: a });
  };
  const prev: Dict = isDict(before) ? before : {};
  for (const k of keysOf(cur, prev)) if (keep(k)) walk(prev[k], cur[k], k, k);
  return out;
}

function segsOf(path: string): string[] {
  return String(path ?? "")
    .split(".")
    .filter(Boolean);
}

function cleanLabel(label: string, segs: readonly string[]): string | null {
  const s = label.trim();
  if (!s) return null;
  const parts = s.split(" · ").map((p) => p.trim());
  if (parts.some((p) => !p || codeLike(p) || segs.includes(p))) return null;
  return s;
}

export function diffLabel(path: string, ctx: DiffLabelCtx): string | null {
  const segs = segsOf(path);
  const top = segs[0] ?? "";
  if (!top || hidden(top)) return null;
  const { model, labels, t, code } = ctx;
  if (model) {
    const known = !!schemaFieldAt(model.ctor.typed, patternOf(top)) || !!layoutFieldFor(model, top)?.virtual;
    if (!known) return null;
    return cleanLabel(labelTrail(model, path, labels, t), segs);
  }
  const parts: string[] = [];
  let concrete = "";
  for (const s of segs) {
    concrete = concrete ? `${concrete}.${s}` : s;
    if (/^\d+$/.test(s)) {
      parts.push(String(Number(s) + 1));
      continue;
    }
    const name = labels.field(s, { ctor: code, path: concrete }).trim();
    if (!name || name === s || codeLike(name)) {
      if (!parts.length) return null;
      break;
    }
    parts.push(name);
  }
  return cleanLabel(parts.join(" · "), segs);
}

function plainText(v: string): string {
  return v
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

function numOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function leafKey(segs: readonly string[]): string {
  for (let i = segs.length - 1; i >= 0; i--) if (!/^\d+$/.test(segs[i])) return segs[i];
  return "";
}

export function sourceAt(path: string, ctx: Pick<DiffLabelCtx, "model" | "code" | "root">): string {
  const { model } = ctx;
  if (!model) return "";
  const pattern = patternOf(path);
  const field = schemaFieldAt(model.ctor.typed, pattern);
  if (!field) return "";
  return effectiveSource(ctx.code, { pattern, field }, scopeAt(ctx.root ?? {}, path));
}

export function diffSources(entries: readonly DiffEntry[], ctx: Pick<DiffLabelCtx, "model" | "code" | "root">): string[] {
  const out = new Set<string>();
  for (const e of entries) {
    const s = sourceAt(e.path, ctx);
    if (s) out.add(s);
  }
  return [...out].sort();
}

export function diffValue(value: unknown, path: string, ctx: DiffLabelCtx): string {
  const { model, code, labels, t } = ctx;
  if (isEmptyValue(value)) return t("sx.ui.notSet");
  if (typeof value === "boolean") return labels.display(value);
  const segs = segsOf(path);
  const key = leafKey(segs);
  const pattern = patternOf(path);
  const field = model ? schemaFieldAt(model.ctor.typed, pattern) : null;
  const layout = model ? layoutFieldFor(model, pattern) : null;
  const source = sourceAt(path, ctx);
  const list = Array.isArray(value) ? value : null;
  if (source) {
    const vals = (list ?? [value]).map(str).filter(Boolean);
    return labels.list(vals.map((v) => ctx.refName(source, v) || labels.unknownRef(v)), 3) || t("sx.ui.notSet");
  }
  const type = field?.type ?? "";
  const opt = (v: unknown) => optionTextOf(str(v), { layout, field, code, key, labels, t });
  const pick = type === "select" || !!layout?.optionLabel || !!layout?.optionKey;
  if (pick && !list && !isDict(value)) return opt(value);
  if (list && (type === "multiselect" || (type === "list" && field?.item?.type === "select") || pick) && !list.some(isDict)) return labels.list(list.map(opt).filter(Boolean), 3);
  if (type === "money") {
    const n = numOf(value);
    if (n !== null) return labels.money(n);
  }
  if (type === "number" && !list && !isDict(value)) {
    const n = numOf(value);
    if (n !== null) return labels.num(n);
  }
  if (typeof value === "number") return labels.num(value);
  if (typeof value === "string") {
    const v = value.trim();
    if (type === "date") return labels.date(v);
    if (type === "datetime") return labels.dateTime(v);
    if (type === "richtext" || type === "textarea" || type === "code" || /<[a-z][^>]*>/i.test(v)) return plainText(v) || t("sx.ui.notSet");
    if (UUID.test(v)) return labels.unknownRef(v);
    return labels.display(v) || v;
  }
  if (list) {
    if (list.some(isDict)) return labels.list(list.map((item, i) => rowSummaryText(item, i, { field, code, labels, t, pattern })), 3);
    return labels.display(list);
  }
  if (isDict(value)) return t("sx.appr.dw.items", { n: Object.keys(value).length });
  return labels.display(value);
}

function samePrimitive(a: unknown, b: unknown): boolean {
  const prim = (v: unknown) => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
  return prim(a) && prim(b) && String(a).trim() === String(b).trim();
}

function isLong(text: string): boolean {
  return text.length > LONG || text.includes("\n");
}

export function diffLines(entries: readonly DiffEntry[], ctx: DiffLabelCtx): { lines: DiffLine[]; other: number } {
  const lines: DiffLine[] = [];
  let other = 0;
  for (const e of entries) {
    const label = diffLabel(e.path, ctx);
    if (label === null) {
      other += 1;
      continue;
    }
    const before = e.change === "added" ? "" : diffValue(e.before, e.path, ctx);
    const after = e.change === "removed" ? "" : diffValue(e.after, e.path, ctx);
    if (e.change === "changed" && before === after && samePrimitive(e.before, e.after)) continue;
    lines.push({ path: e.path, label, change: e.change, before, after, long: isLong(before) || isLong(after) });
  }
  return { lines, other };
}

export function changedNames(entries: readonly DiffEntry[], ctx: DiffLabelCtx): string[] {
  const out: string[] = [];
  let other = false;
  for (const e of entries) {
    const label = diffLabel(e.path, ctx);
    if (label === null) other = true;
    else {
      const head = label.split(" · ")[0];
      if (!out.includes(head)) out.push(head);
    }
  }
  if (other) out.push(ctx.t("sx.appr.dw.other"));
  return out;
}
