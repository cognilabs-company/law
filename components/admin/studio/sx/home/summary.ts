"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { http, logApiError } from "@/lib/http";
import { useStudioAccess, type StudioConstructor } from "@/lib/services/studio";
import { useStudioLive } from "../live";
import { touchesStudioObjects } from "./useActionItems";

export type StudioSummary = { total: number; byStatus: Readonly<Record<string, number>>; byCtor: Readonly<Record<string, number>> };
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

export function normStudioSummary(raw: unknown): StudioSummary {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const byStatus = countsOf(d.by_status);
  const byCtor = countsOf(d.by_constructor);
  const total = d.total === undefined || d.total === null ? Object.values(byStatus).reduce((a, b) => a + b, 0) : numOf(d.total);
  return { total, byStatus, byCtor };
}

export function statusCount(s: StudioSummary, ...keys: string[]): number {
  return keys.reduce((sum, k) => sum + (s.byStatus[k] ?? 0), 0);
}

export function ctorRecords(code: string, ctor: StudioConstructor | null, s: StudioSummary | null): number | null {
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
    if (!touchesStudioObjects(e)) return;
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
