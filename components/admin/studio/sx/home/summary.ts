"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { http, logApiError } from "@/lib/http";
import { useStudioAccess, type StudioConstructor } from "@/lib/services/studio";
import { useStudioLive } from "../live";
import { isCtorVisited, normCtorUsageToday, type CtorUsageToday } from "./ctorUsage";
import { normEntityCards, type EntityCard } from "./entityModel";
import { touchesStudioObjects } from "./useActionItems";

export type CtorSummary = {
  code: string;
  title: string;
  total: number;
  active: number | null;
  runtime: number | null;
  byStatus: Readonly<Record<string, number>>;
  lastAt: string;
  lastObjectId: string;
};
export type GroupSummary = { key: string; title: string; total: number; active: number | null; runtime: number | null; ctorCount: number | null; codes: readonly string[] };
export type LastActivity = { at: string; objectId: string; code: string };
export type NeedCounts = { returned: number; review: number; publish: number };
export type GroupTotals = { total: number; active: number | null; runtime: number | null };
export type StudioSummary = {
  total: number;
  activeTotal: number | null;
  incompleteTotal: number | null;
  generatedAt: string;
  byStatus: Readonly<Record<string, number>>;
  byCtor: Readonly<Record<string, number>>;
  ctors: Readonly<Record<string, CtorSummary>>;
  groups: Readonly<Record<string, GroupSummary>>;
  entityCards: readonly EntityCard[] | null;
  usageToday: CtorUsageToday | null;
  detailed: boolean;
};
export type StudioSummaryState = { data: StudioSummary | null; error: unknown; loading: boolean; reload: () => void };

type Store = { data: StudioSummary | null; error: unknown; busy: boolean; at: number };

const FRESH_MS = 30_000;
const LIVE_MS = 600;
const EMPTY: Store = { data: null, error: null, busy: false, at: 0 };

let store: Store = EMPTY;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();

function put(next: Partial<Store>): void {
  store = { ...store, ...next };
  subs.forEach((f) => f());
}

function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

const snapshot = () => store;
const serverSnapshot = () => EMPTY;

function numOf(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function countsOf(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (k) out[k] = numOf(v);
  return out;
}

function dictOf(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function strOf(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

function optNum(v: unknown): number | null {
  return v === undefined || v === null || v === "" ? null : numOf(v);
}

function timeOf(v: unknown): number {
  const n = Date.parse(strOf(v));
  return Number.isFinite(n) ? n : 0;
}

const keyOf = (code: string) => code.trim().toUpperCase();

function normCtorSummary(raw: unknown): CtorSummary | null {
  const d = dictOf(raw);
  const code = strOf(d.constructor_code ?? d.code);
  if (!code) return null;
  const at = strOf(d.last_activity_at);
  return {
    code,
    title: strOf(d.title),
    total: numOf(d.total),
    active: optNum(d.active_total),
    runtime: optNum(d.runtime_total),
    byStatus: countsOf(d.by_status),
    lastAt: timeOf(at) ? at : "",
    lastObjectId: strOf(d.last_activity_object_id),
  };
}

function codeOfEntry(v: unknown): string {
  if (v && typeof v === "object") {
    const d = dictOf(v);
    return strOf(d.constructor_code ?? d.code);
  }
  return strOf(v);
}

function normGroupSummary(raw: unknown): GroupSummary | null {
  const d = dictOf(raw);
  const key = strOf(d.group_key ?? d.key);
  if (!key) return null;
  const codes = (Array.isArray(d.constructors) ? d.constructors : []).map(codeOfEntry).filter(Boolean);
  return { key, title: strOf(d.title), total: numOf(d.total), active: optNum(d.active_total), runtime: optNum(d.runtime_total), ctorCount: optNum(d.constructor_count), codes };
}

export function normStudioSummary(raw: unknown): StudioSummary {
  const d = dictOf(raw);
  const byStatus = countsOf(d.by_status);
  const byCtor = countsOf(d.by_constructor);
  const total = d.total === undefined || d.total === null ? Object.values(byStatus).reduce((a, b) => a + b, 0) : numOf(d.total);
  const ctors: Record<string, CtorSummary> = {};
  for (const r of Array.isArray(d.by_constructor_detail) ? d.by_constructor_detail : []) {
    const c = normCtorSummary(r);
    if (c && !ctors[keyOf(c.code)]) ctors[keyOf(c.code)] = c;
  }
  const groups: Record<string, GroupSummary> = {};
  for (const r of Array.isArray(d.by_group) ? d.by_group : []) {
    const g = normGroupSummary(r);
    if (g && !groups[g.key]) groups[g.key] = g;
  }
  return {
    total,
    activeTotal: optNum(d.active_total),
    incompleteTotal: optNum(d.incomplete_total),
    generatedAt: strOf(d.generated_at),
    byStatus,
    byCtor,
    ctors,
    groups,
    entityCards: normEntityCards(d.entity_cards),
    usageToday: normCtorUsageToday(d.constructor_usage_today),
    detailed: Array.isArray(d.by_constructor_detail),
  };
}

export function ctorSummary(code: string, s: StudioSummary | null): CtorSummary | null {
  return s && code ? (s.ctors[keyOf(code)] ?? null) : null;
}

export function groupSummary(key: string, s: StudioSummary | null): GroupSummary | null {
  return s && key ? (s.groups[key] ?? null) : null;
}

function groupCodes(key: string, codes: readonly string[], s: StudioSummary | null): string[] {
  const out: string[] = [];
  for (const c of [...codes, ...(groupSummary(key, s)?.codes ?? [])]) if (c && !out.some((x) => keyOf(x) === keyOf(c))) out.push(c);
  return out;
}

export function lastActivityOf(codes: readonly string[], s: StudioSummary | null, key = ""): LastActivity | null {
  let best: LastActivity | null = null;
  let bestAt = 0;
  for (const code of key ? groupCodes(key, codes, s) : codes) {
    const c = ctorSummary(code, s);
    const at = c ? timeOf(c.lastAt) : 0;
    if (c && at > bestAt) {
      bestAt = at;
      best = { at: c.lastAt, objectId: c.lastObjectId, code: c.code };
    }
  }
  return best;
}

export function needCountsOf(key: string, codes: readonly string[], s: StudioSummary | null, allow: Readonly<Record<keyof NeedCounts, boolean>>): NeedCounts | null {
  if (!s || !s.detailed) return null;
  const out: NeedCounts = { returned: 0, review: 0, publish: 0 };
  for (const code of groupCodes(key, codes, s)) {
    const st = ctorSummary(code, s)?.byStatus;
    if (!st) continue;
    out.returned += st.changes_requested ?? 0;
    out.review += (st.submitted ?? 0) + (st.in_review ?? 0);
    out.publish += st.approved ?? 0;
  }
  return { returned: allow.returned ? out.returned : 0, review: allow.review ? out.review : 0, publish: allow.publish ? out.publish : 0 };
}

export function groupTotalsOf(key: string, codes: readonly string[], s: StudioSummary | null): GroupTotals | null {
  const g = groupSummary(key, s);
  if (g) return { total: g.total, active: g.active, runtime: g.runtime };
  if (!s || !s.detailed) return null;
  let total = 0;
  let active: number | null = null;
  let runtime: number | null = null;
  let any = false;
  for (const code of codes) {
    const c = ctorSummary(code, s);
    if (!c) continue;
    any = true;
    total += c.total;
    if (c.active !== null) active = (active ?? 0) + c.active;
    if (c.runtime !== null) runtime = (runtime ?? 0) + c.runtime;
  }
  return any ? { total, active, runtime } : null;
}

export function statusCount(s: StudioSummary, ...keys: string[]): number {
  return keys.reduce((sum, k) => sum + (s.byStatus[k] ?? 0), 0);
}

export function ctorRecords(code: string, ctor: StudioConstructor | null, s: StudioSummary | null): number | null {
  const detail = ctorSummary(code, s);
  if (detail) return detail.total;
  if (s) {
    if (Object.prototype.hasOwnProperty.call(s.byCtor, code)) return s.byCtor[code];
    const up = code.toUpperCase();
    const hit = Object.keys(s.byCtor).find((k) => k.toUpperCase() === up);
    if (hit) return s.byCtor[hit];
    if (Object.keys(s.byCtor).length) return 0;
  }
  return ctor?.recordCount ?? null;
}

export function sumRecords(rows: readonly { code: string; ctor: StudioConstructor | null }[], s: StudioSummary | null): number | null {
  let sum = 0;
  let any = false;
  for (const r of rows) {
    const n = ctorRecords(r.code, r.ctor, s);
    if (n === null) continue;
    any = true;
    sum += n;
  }
  return any ? sum : null;
}

export function loadStudioSummary(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && store.data && Date.now() - store.at < FRESH_MS) return Promise.resolve();
  put({ busy: true });
  inflight = http("/studio/objects/summary")
    .then(
      (raw) => put({ data: normStudioSummary(raw), error: null, busy: false, at: Date.now() }),
      (e: unknown) => {
        logApiError("studio.summary", e);
        put({ error: e ?? new Error("failed"), busy: false, at: Date.now() });
      },
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useStudioSummary(): StudioSummaryState {
  const acc = useStudioAccess();
  const ready = acc.avail === "on" && acc.any;
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (ready) void loadStudioSummary();
  }, [ready]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useStudioLive((e) => {
    if (!touchesStudioObjects(e) && !isCtorVisited(e)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void loadStudioSummary(true), LIVE_MS);
  }, ready);

  return {
    data: s.data,
    error: s.data ? null : s.error,
    loading: !s.data && !s.error && (acc.avail === "checking" || ready),
    reload: () => void loadStudioSummary(true),
  };
}
