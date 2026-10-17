import { matchesSearch, normalizeSearchText } from "@/lib/searchText";
import { groupedMoney } from "../labels";
import type { SxOption } from "../types";

export type NumberParse = { value: number | undefined; valid: boolean };

const SPACES = /[\s  ]/g;
const BAD: NumberParse = { value: undefined, valid: false };

export function parseNumberText(text: string): NumberParse {
  const s = String(text ?? "").replace(SPACES, "");
  if (s === "" || s === "-") return { value: undefined, valid: true };
  if (/[^0-9.,-]/.test(s)) return BAD;
  if (s.indexOf("-", 1) !== -1) return BAD;
  const commas = s.split(",").length - 1;
  let t = s;
  if (commas > 0 && (s.includes(".") || commas > 1)) t = t.replace(/,/g, "");
  else if (commas === 1) t = t.replace(",", ".");
  if (t.split(".").length > 2 || !/\d/.test(t)) return BAD;
  const n = Number(t);
  return Number.isFinite(n) ? { value: n, valid: true } : BAD;
}

export function numberText(value: number | null | undefined, locale: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const s = String(value);
  return locale === "en" ? s : s.replace(".", ",");
}

export function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  const x = typeof a === "number" && Number.isFinite(a) ? a : undefined;
  const y = typeof b === "number" && Number.isFinite(b) ? b : undefined;
  return x === y;
}

export function moneySeparator(sample: string): string {
  return String(sample ?? "").replace(/[\d-]/g, "").charAt(0) || " ";
}

export function moneyDecimal(separator: string): string {
  return separator === "," ? "." : ",";
}

export function moneyText(value: number | null | undefined, separator: string, decimal = "."): string {
  return typeof value === "number" && Number.isFinite(value) ? groupedMoney(String(value), separator).replace(".", decimal) : "";
}

export type MoneyEdit = { text: string; value: number | undefined; invalid: boolean; caret: number };

const KEPT = /[\d.,-]/;

export function moneyEdit(input: string, caret: number, separator: string, decimal = "."): MoneyEdit {
  let before = 0;
  for (const ch of input.slice(0, Math.max(0, caret))) if (ch !== separator && KEPT.test(ch)) before += 1;
  const raw = input.split(separator).join("").replace(/[^\d.,-]/g, "").replace(",", ".");
  const text = groupedMoney(raw, separator);
  const plain = text.split(separator).join("");
  let value: number | undefined;
  let invalid = false;
  if (plain !== "" && plain !== "-") {
    const n = Number(plain);
    if (Number.isFinite(n)) value = n;
    else invalid = true;
  }
  let pos = 0;
  let seen = 0;
  while (pos < text.length && seen < before) {
    if (text[pos] !== separator) seen += 1;
    pos += 1;
  }
  return { text: decimal === "." ? text : text.replace(".", decimal), value, invalid, caret: pos };
}

export function optionText(o: SxOption): string {
  return [o.label, o.description, o.code].filter(Boolean).join(" ");
}

export function dedupeOptions(list: readonly SxOption[]): SxOption[] {
  const seen = new Set<string>();
  const out: SxOption[] = [];
  for (const o of list) {
    if (seen.has(o.value)) continue;
    seen.add(o.value);
    out.push(o);
  }
  return out;
}

export function filterOptions(list: readonly SxOption[], query: string): SxOption[] {
  const q = query.trim();
  return q ? list.filter((o) => matchesSearch(optionText(o), q)) : list.slice();
}

export type OptionPages = Readonly<Record<string, readonly SxOption[]>>;

export function remoteOptions(pages: OptionPages, query: string): SxOption[] {
  const q = query.trim();
  const first = pages[""] ?? [];
  if (!q) return dedupeOptions(first);
  const pool: SxOption[] = [...first];
  for (const [k, rows] of Object.entries(pages)) if (k !== "") pool.push(...rows);
  const local = pool.filter((o) => matchesSearch(optionText(o), q));
  return dedupeOptions([...local, ...(pages[q] ?? [])]);
}

export type NavKey = "ArrowDown" | "ArrowUp" | "PageDown" | "PageUp" | "Home" | "End";

export function isNavKey(key: string): key is NavKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "PageDown" || key === "PageUp" || key === "Home" || key === "End";
}

export function navIndex(enabled: readonly number[], current: number, key: NavKey, page = 8): number {
  const n = enabled.length;
  if (!n) return -1;
  const at = enabled.indexOf(current);
  const last = n - 1;
  switch (key) {
    case "ArrowDown":
      return enabled[at < 0 ? 0 : (at + 1) % n];
    case "ArrowUp":
      return enabled[at < 0 ? last : (at - 1 + n) % n];
    case "PageDown":
      return enabled[Math.min(last, (at < 0 ? -1 : at) + page)];
    case "PageUp":
      return enabled[Math.max(0, (at < 0 ? 0 : at) - page)];
    case "Home":
      return enabled[0];
    case "End":
      return enabled[last];
  }
}

export type TypeBuffer = { text: string; at: number };

export function typeAhead(
  labels: readonly string[],
  enabled: readonly number[],
  current: number,
  buffer: TypeBuffer,
  key: string,
  time: number,
  ms = 700,
): { buffer: TypeBuffer; index: number } {
  const text = (time - buffer.at > ms ? "" : buffer.text) + key;
  const next = { text, at: time };
  const same = [...text].every((c) => c === text[0]);
  const needle = normalizeSearchText(same ? text[0] : text);
  if (!needle || !enabled.length) return { buffer: next, index: current };
  const pos = enabled.indexOf(current);
  const start = same ? pos + 1 : Math.max(pos, 0);
  for (let s = 0; s < enabled.length; s++) {
    const i = enabled[(start + s) % enabled.length];
    if (normalizeSearchText(labels[i] ?? "").startsWith(needle)) return { buffer: next, index: i };
  }
  return { buffer: next, index: current };
}

export type OptionRun = { group: string; rows: { option: SxOption; index: number }[] };

export function optionRuns(list: readonly SxOption[]): OptionRun[] {
  const out: OptionRun[] = [];
  list.forEach((option, index) => {
    const group = option.group ?? "";
    const last = out[out.length - 1];
    if (last && last.group === group) last.rows.push({ option, index });
    else out.push({ group, rows: [{ option, index }] });
  });
  return out;
}

export function toggleValue(values: readonly string[], value: string, max?: number): string[] {
  if (values.includes(value)) return values.filter((v) => v !== value);
  if (max !== undefined && max !== null && values.length >= max) return values.slice();
  return [...values, value];
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  if (target === from) return out;
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

export function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  const at = Math.max(0, Math.min(list.length, index));
  return [...list.slice(0, at), item, ...list.slice(at)];
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function dropTarget(mids: readonly number[], y: number): number {
  let n = 0;
  for (const m of mids) if (m < y) n += 1;
  return n;
}

const ROW_IDS = new WeakMap<object, string>();
let rowSeq = 0;

function rowKey(item: unknown, index: number): string {
  if (item !== null && typeof item === "object") {
    let k = ROW_IDS.get(item);
    if (!k) {
      rowSeq += 1;
      k = `r${rowSeq}`;
      ROW_IDS.set(item, k);
    }
    return k;
  }
  return `i${index}`;
}

export function rowKeys(items: readonly unknown[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item, i) => {
    const k = rowKey(item, i);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n ? `${k}~${n}` : k;
  });
}

export function carryRowKey(prev: unknown, next: unknown): void {
  if (prev === next || prev === null || next === null || typeof prev !== "object" || typeof next !== "object") return;
  const k = ROW_IDS.get(prev);
  if (k && !ROW_IDS.has(next)) ROW_IDS.set(next, k);
}

export type KvKind = "boolean" | "number" | "string" | "empty" | "nested";

export function kvKind(value: unknown): KvKind {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (value === null || value === undefined) return "empty";
  return "nested";
}

export function renameKey(obj: Readonly<Record<string, unknown>>, from: string, to: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k === from ? to : k] = v;
  return out;
}

export function withoutKey(obj: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (k !== key) out[k] = v;
  return out;
}

export function hasKey(obj: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

const pad2 = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");

export function zonedIso(date: string, time: string): string {
  if (!date) return "";
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (time || "00:00").split(":").map(Number);
  const local = new Date(y, mo - 1, d, h || 0, mi || 0, 0);
  const off = -local.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${date}T${pad2(h || 0)}:${pad2(mi || 0)}:00${sign}${pad2(off / 60)}:${pad2(off % 60)}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function splitDateValue(value: string, withTime: boolean): { date: string; time: string } {
  const v = String(value ?? "").trim();
  if (!v) return { date: "", time: "" };
  if (DAY.test(v)) return { date: v, time: "" };
  if (!withTime) return /^\d{4}-\d{2}-\d{2}/.test(v) ? { date: v.slice(0, 10), time: "" } : { date: "", time: "" };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}
