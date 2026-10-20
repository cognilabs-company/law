"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, asArr, asDict, asNum, http } from "@/lib/http";
import type { UserEvent } from "@/lib/userSocket";
import { useStudioLive } from "../live";

export type CtorUsageItem = { code: string; title: string; groupKey: string; opens: number; users: number | null; lastAt: string; lastBy: string };
export type CtorUsage = { date: string; usedCount: number; totalOpens: number; items: readonly CtorUsageItem[] };
export type CtorUsageToday = { date: string; usedCount: number; totalOpens: number };
export type CtorUsageState = { data: CtorUsage | null; loading: boolean; error: boolean; reload: () => void };
export type CtorVisitScreen = "records" | "editor" | "create";

export const CTOR_VISITED = "studio.constructor.visited";

const VISIT_GAP_MS = 60_000;
const LIVE_MS = 800;

let visitsOff = false;
const sentAt = new Map<string, number>();
const skipCodes = new Set<string>();

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const count = (v: unknown): number => Math.max(0, Math.round(asNum(v)));
const optCount = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : count(v));

export const isCtorVisited = (e: UserEvent): boolean => e.event === CTOR_VISITED;

export function normCtorUsageToday(raw: unknown): CtorUsageToday | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = asDict(raw);
  return { date: str(d.date), usedCount: count(d.used_count), totalOpens: count(d.total_opens) };
}

function normUsage(raw: unknown): CtorUsage {
  const d = asDict(raw);
  const items = asArr(d.items)
    .map(asDict)
    .map((r) => ({
      code: str(r.code),
      title: str(r.title),
      groupKey: str(r.group_key),
      opens: count(r.opens),
      users: optCount(r.users_count),
      lastAt: str(r.last_opened_at),
      lastBy: str(asDict(r.last_opened_by).name),
    }))
    .filter((r) => r.code);
  return {
    date: str(d.date ?? d.date_to),
    usedCount: optCount(d.used_count) ?? items.length,
    totalOpens: optCount(d.total_opens) ?? items.reduce((n, r) => n + r.opens, 0),
    items,
  };
}

export function useCtorUsage(enabled: boolean, nonce: number): CtorUsageState {
  const [state, setState] = useState<{ data: CtorUsage | null; done: boolean; error: boolean }>({ data: null, done: false, error: false });
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    http("/studio/constructors/usage").then(
      (raw) => {
        if (live) setState({ data: normUsage(raw), done: true, error: false });
      },
      () => {
        if (live) setState((s) => ({ data: s.data, done: true, error: true }));
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, nonce, tick]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useStudioLive((e) => {
    if (!isCtorVisited(e) && e.event !== "studio.resync") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTick((n) => n + 1), LIVE_MS);
  }, enabled);
  return { data: state.data, loading: enabled && !state.done, error: state.error && !state.data, reload: () => setTick((n) => n + 1) };
}

export function useCtorVisit(code: string, screen: CtorVisitScreen): void {
  useEffect(() => {
    if (!code || visitsOff || skipCodes.has(code)) return;
    const now = Date.now();
    if (now - (sentAt.get(code) ?? 0) < VISIT_GAP_MS) return;
    sentAt.set(code, now);
    http(`/studio/constructors/${encodeURIComponent(code)}/visits`, { method: "POST", body: JSON.stringify({ screen }) }).catch((e: unknown) => {
      if (!(e instanceof ApiError)) return;
      if (e.status === 405 || e.status === 501) visitsOff = true;
      else if (e.status === 403 || e.status === 404 || e.status === 422) skipCodes.add(code);
    });
  }, [code, screen]);
}
