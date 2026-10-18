"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeInternalEvents } from "@/lib/internalSocket";
import { getStudioMonitoring, listStudioAudit, normStudioActivity, type StudioAuditEvent, type StudioMonitoringSummary, type StudioMonitoringUser } from "@/lib/services/studio";
import type { UserEvent } from "@/lib/userSocket";
import { useStudioLive } from "../live";
import { POLL_MS, auditQueryOf, channelEvent, eventRaw, queryOf, rangeIsOpen, rangeOf, sessionKey, type MonPeriod, type MonRange, type MonRow } from "./model";

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
};

const EMPTY: MonState = { phase: "loading", rows: [], users: [], summary: null, events: null, error: null, range: { from: null, to: null }, loadedAt: 0, key: "" };

export function useMonitoring(period: MonPeriod, dateFrom: string, dateTo: string, enabled: boolean) {
  const [st, setSt] = useState<MonState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const live = useRef<{ rows: MonRow[]; range: MonRange }>({ rows: [], range: EMPTY.range });
  const soon = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    if (!enabled) return;
    const my = ++seq.current;
    const range = rangeOf(period, dateFrom, dateTo, Date.now());
    const key = `${period}|${dateFrom}|${dateTo}`;
    try {
      const [m, events] = await Promise.all([getStudioMonitoring(queryOf(range)), listStudioAudit(auditQueryOf(range)).catch(() => null)]);
      if (my !== seq.current) return;
      const at = Date.now();
      setSt({ phase: "ready", rows: m.items.map((a) => ({ a, at })), users: m.users, summary: m.summary, events, error: null, range, loadedAt: at, key });
    } catch (e) {
      if (my !== seq.current) return;
      setSt((cur) => (cur.phase === "ready" && cur.key === key ? { ...cur, error: e } : { ...EMPTY, phase: "error", error: e, range, key }));
    }
  }, [period, dateFrom, dateTo, enabled]);

  useEffect(() => {
    void load();
    return () => clearTimeout(soon.current);
  }, [load]);

  useEffect(() => {
    live.current = { rows: st.phase === "ready" ? st.rows : [], range: st.range };
  });

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!rangeIsOpen(live.current.range, Date.now())) return;
      void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

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
    const key = sessionKey(raw);
    const ended = e.event === "studio.activity_ended";
    if (!key || !live.current.rows.some((r) => r.a.sessionId === key)) {
      if (rangeIsOpen(live.current.range, Date.now())) refetchSoon();
      return;
    }
    const at = Date.now();
    setSt((cur) => {
      const idx = cur.rows.findIndex((r) => r.a.sessionId === key);
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

  const settled = st.key === `${period}|${dateFrom}|${dateTo}`;
  return { ...st, busy, refresh, settled };
}
