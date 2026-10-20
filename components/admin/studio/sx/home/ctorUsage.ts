"use client";

import { useEffect, useState } from "react";
import { ApiError, asArr, asDict, asNum, http } from "@/lib/http";
import { MON_PAGE_MAX, fetchMonitoring, type MonPage } from "../monitoring/monitoringApi";
import { localDayKey } from "../monitoring/model";
import type { StudioSummary } from "./summary";

export type CtorUsageSource = "usage" | "sessions" | "changes";
export type CtorUsageItem = { code: string; title: string; groupKey: string; opens: number | null; users: number | null; lastAt: string };
export type CtorUsage = { date: string; source: CtorUsageSource; usedCount: number; totalOpens: number | null; items: readonly CtorUsageItem[] };
export type CtorUsageState = { data: CtorUsage | null; loading: boolean };
export type CtorVisitScreen = "records" | "editor" | "create";

const VISIT_GAP_MS = 60_000;

let usageOff = false;
let visitsOff = false;
const sentAt = new Map<string, number>();

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const optCount = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Math.max(0, Math.round(asNum(v))));
const missing = (e: unknown): boolean => e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);
const later = (a: string, b: string): string => (Date.parse(b) > Date.parse(a) || !a ? b : a);

function sortItems(items: CtorUsageItem[]): CtorUsageItem[] {
  return items.sort((a, b) => (b.opens ?? 0) - (a.opens ?? 0) || Date.parse(b.lastAt || "0") - Date.parse(a.lastAt || "0"));
}

function fromUsage(raw: unknown, date: string): CtorUsage {
  const d = asDict(raw);
  const items = sortItems(
    asArr(d.items)
      .map(asDict)
      .map((r) => ({
        code: str(r.code ?? r.constructor_code),
        title: str(r.title),
        groupKey: str(r.group_key),
        opens: optCount(r.opens ?? r.visits ?? r.count) ?? 0,
        users: optCount(r.users_count ?? r.users),
        lastAt: str(r.last_opened_at ?? r.last_at),
      }))
      .filter((r) => r.code),
  );
  const sum = items.reduce((n, r) => n + (r.opens ?? 0), 0);
  return { date: str(d.date) || date, source: "usage", usedCount: optCount(d.used_count) ?? items.length, totalOpens: optCount(d.total_opens) ?? sum, items };
}

function fromSessions(page: MonPage, date: string): CtorUsage {
  const by = new Map<string, { opens: number; users: Set<string>; lastAt: string }>();
  for (const a of page.items) {
    if (!a.constructorCode) continue;
    const row = by.get(a.constructorCode) ?? { opens: 0, users: new Set<string>(), lastAt: "" };
    row.opens += 1;
    if (a.userId) row.users.add(a.userId);
    row.lastAt = later(row.lastAt, a.startedAt || a.lastSeenAt);
    by.set(a.constructorCode, row);
  }
  const items = sortItems([...by].map(([code, r]) => ({ code, title: "", groupKey: "", opens: r.opens, users: r.users.size || null, lastAt: r.lastAt })));
  return { date, source: "sessions", usedCount: items.length, totalOpens: items.reduce((n, r) => n + (r.opens ?? 0), 0), items };
}

function fromChanges(summary: StudioSummary, date: string): CtorUsage {
  const items = sortItems(
    Object.values(summary.ctors)
      .filter((c) => c.lastAt && localDayKey(Date.parse(c.lastAt)) === date)
      .map((c) => ({ code: c.code, title: c.title, groupKey: "", opens: null, users: null, lastAt: c.lastAt })),
  );
  return { date, source: "changes", usedCount: items.length, totalOpens: null, items };
}

async function loadRemote(date: string, admin: boolean): Promise<CtorUsage | null> {
  if (!usageOff) {
    try {
      return fromUsage(await http(`/studio/constructors/usage?date=${date}`), date);
    } catch (e) {
      if (missing(e)) usageOff = true;
    }
  }
  if (!admin) return null;
  try {
    return fromSessions(await fetchMonitoring({ date, limit: MON_PAGE_MAX, offset: 0 }), date);
  } catch {
    return null;
  }
}

export function useCtorUsage(admin: boolean, summary: StudioSummary | null, nonce: number): CtorUsageState {
  const [remote, setRemote] = useState<{ data: CtorUsage | null; done: boolean; date: string }>({ data: null, done: false, date: "" });
  useEffect(() => {
    let live = true;
    const date = localDayKey(Date.now());
    loadRemote(date, admin).then(
      (data) => {
        if (live) setRemote({ data, done: true, date });
      },
      () => {
        if (live) setRemote({ data: null, done: true, date });
      },
    );
    return () => {
      live = false;
    };
  }, [admin, nonce]);
  const data = remote.data ?? (remote.done && summary ? fromChanges(summary, remote.date) : null);
  return { data, loading: !remote.done && !data };
}

export function useCtorVisit(code: string, screen: CtorVisitScreen): void {
  useEffect(() => {
    if (!code || visitsOff) return;
    const now = Date.now();
    if (now - (sentAt.get(code) ?? 0) < VISIT_GAP_MS) return;
    sentAt.set(code, now);
    http(`/studio/constructors/${encodeURIComponent(code)}/visits`, { method: "POST", body: JSON.stringify({ screen }) }).catch((e: unknown) => {
      if (missing(e)) visitsOff = true;
    });
  }, [code, screen]);
}
