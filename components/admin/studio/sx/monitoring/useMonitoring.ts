"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeInternalEvents } from "@/lib/internalSocket";
import { logApiError } from "@/lib/http";
import { listStudioAudit, normStudioActivity, type StudioAuditEvent, type StudioMonitoringSummary, type StudioMonitoringUser } from "@/lib/services/studio";
import type { UserEvent } from "@/lib/userSocket";
import { useStudioLive } from "../live";
import { auditQueryOf, channelEvent, eventRaw, queryOf, rangeIsOpen, rangeOf, sessionKey, type MonPeriod, type MonRange, type MonRow } from "./model";
import { MON_PAGE, MON_PAGE_MAX, fetchMonitoring } from "./monitoringApi";

export type MonPhase = "loading" | "ready" | "error";

export type MonState = {
  phase: MonPhase;
  rows: MonRow[];
  users: StudioMonitoringUser[];
  summary: StudioMonitoringSummary | null;
  events: StudioAuditEvent[] | null;
  error: unknown;
  range: MonRange;
  loadedAt: number;
  key: string;
  total: number;
  hasMore: boolean;
};

const EMPTY: MonState = { phase: "loading", rows: [], users: [], summary: null, events: null, error: null, range: { from: null, to: null }, loadedAt: 0, key: "", total: 0, hasMore: false };

function mergeRows(prev: readonly MonRow[], next: readonly MonRow[]): MonRow[] {
  const seen = new Set(prev.map((r) => r.a.sessionId).filter(Boolean));
  return [...prev, ...next.filter((r) => !r.a.sessionId || !seen.has(r.a.sessionId))];
}

export function useMonitoring(period: MonPeriod, dateFrom: string, dateTo: string, enabled: boolean) {
  const [st, setSt] = useState<MonState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const seq = useRef(0);
  const live = useRef<{ rows: MonRow[]; range: MonRange; key: string }>({ rows: [], range: EMPTY.range, key: "" });
  const soon = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = `${period}|${dateFrom}|${dateTo}`;

  const load = useCallback(async () => {
    if (!enabled) return;
    const my = ++seq.current;
    const range = rangeOf(period, dateFrom, dateTo, Date.now());
    const same = live.current.key === key;
    const limit = Math.min(MON_PAGE_MAX, Math.max(MON_PAGE, same ? live.current.rows.length : 0));
    try {
      const [m, events] = await Promise.all([fetchMonitoring({ ...queryOf(range), limit, offset: 0 }), listStudioAudit(auditQueryOf(range)).catch(() => null)]);
      if (my !== seq.current) return;
      const at = Date.now();
      setMoreError(null);
      setSt({ phase: "ready", rows: m.items.map((a) => ({ a, at })), users: m.users, summary: m.summary, events, error: null, range, loadedAt: at, key, total: m.total, hasMore: m.hasMore });
    } catch (e) {
      if (my !== seq.current) return;
      logApiError("studio.sx.monitoring.load", e);
      setSt((cur) => (cur.phase === "ready" && cur.key === key ? { ...cur, error: e } : { ...EMPTY, phase: "error", error: e, range, key }));
    }
  }, [period, dateFrom, dateTo, enabled, key]);

  useEffect(() => {
    void load();
    return () => clearTimeout(soon.current);
  }, [load]);

  useEffect(() => {
    live.current = { rows: st.phase === "ready" ? st.rows : [], range: st.range, key: st.key };
  });

  const more = useCallback(async () => {
    if (!enabled || moreBusy || st.phase !== "ready" || st.key !== key || !st.hasMore) return;
    const my = seq.current;
    const range = st.range;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const m = await fetchMonitoring({ ...queryOf(range), limit: MON_PAGE, offset: st.rows.length });
      if (my !== seq.current) return;
      const at = Date.now();
      setSt((cur) => {
        if (cur.key !== key || cur.phase !== "ready") return cur;
        const rows = mergeRows(cur.rows, m.items.map((a) => ({ a, at })));
        const grew = rows.length > cur.rows.length;
        return { ...cur, rows, total: Math.max(m.total, rows.length), hasMore: m.hasMore && grew, summary: m.summary, users: m.users.length ? m.users : cur.users };
      });
    } catch (e) {
      logApiError("studio.sx.monitoring.more", e);
      if (my === seq.current) setMoreError(e);
    } finally {
      setMoreBusy(false);
    }
  }, [enabled, moreBusy, st, key]);

  const refetchSoon = useCallback(() => {
    clearTimeout(soon.current);
    soon.current = setTimeout(() => void load(), 400);
  }, [load]);

  const onLive = (e: UserEvent) => {
    if (e.event === "studio.resync") {
      refetchSoon();
      return;
    }
    if (e.event !== "studio.activity" && e.event !== "studio.activity_ended") return;
    const raw = eventRaw(e);
    const sid = sessionKey(raw);
    const ended = e.event === "studio.activity_ended";
    if (!sid || !live.current.rows.some((r) => r.a.sessionId === sid)) {
      if (rangeIsOpen(live.current.range, Date.now())) refetchSoon();
      return;
    }
    const at = Date.now();
    setSt((cur) => {
      const idx = cur.rows.findIndex((r) => r.a.sessionId === sid);
      if (cur.phase !== "ready" || idx < 0) return cur;
      const prevRow = cur.rows[idx];
      const merged: Record<string, unknown> = { ...prevRow.a.raw, ...raw };
      if (ended) {
        merged.online = false;
        merged.status = "ended";
        if (!merged.ended_at && !merged.endedAt) merged.ended_at = new Date(at).toISOString();
        if (merged.duration_seconds == null && merged.worked_seconds == null && merged.active_seconds == null && merged.duration == null) {
          const extra = prevRow.a.online && prevRow.at ? Math.max(0, (at - prevRow.at) / 1000) : 0;
          merged.duration_seconds = Math.round(prevRow.a.durationSec + extra);
        }
      }
      const next = [...cur.rows];
      next[idx] = { a: normStudioActivity(merged, at), at };
      const liveUsers = new Set(next.filter((r) => r.a.online).map((r) => r.a.userId));
      const users = cur.users.map((u) => (u.online === liveUsers.has(u.id) ? u : { ...u, online: liveUsers.has(u.id) }));
      return { ...cur, rows: next, users };
    });
  };
  useStudioLive(onLive, enabled);

  const liveRef = useRef(onLive);
  useEffect(() => {
    liveRef.current = onLive;
  });
  useEffect(() => {
    if (!enabled) return;
    return subscribeInternalEvents("studio:activity", (e) => {
      const ev = channelEvent(e);
      if (ev) liveRef.current(ev);
    });
  }, [enabled]);

  const refresh = useCallback(async () => {
    setBusy(true);
    await load();
    setBusy(false);
  }, [load]);

  const settled = st.key === key;
  return { ...st, busy, refresh, settled, more, moreBusy, moreError };
}
