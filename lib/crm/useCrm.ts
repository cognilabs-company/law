"use client";

// Shared CRM state for every /admin/crm page: the backend's meta (one read,
// kept for the session), the realtime events of /ws/users/me turned into
// cache invalidations, the socket's own state for the "Live" dot, and the
// background export jobs tray, which survives page changes.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isAborted, logApiError, parseServerTime } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents, subscribeUserSocketState } from "@/lib/userSocket";
import { crmEventOf, getCrmExport, getCrmMeta, exportDone, type CrmEvent, type CrmExport, type CrmMeta } from "@/lib/services/crm";

// ── meta ──
type MetaState = { meta: CrmMeta | null; error: unknown; loading: boolean };
let metaState: MetaState = { meta: null, error: null, loading: false };
let metaReq: Promise<void> | null = null;
const metaSubs = new Set<() => void>();
const metaEmit = () => metaSubs.forEach((f) => f());

export function loadCrmMeta(force = false): Promise<void> {
  if (metaReq && !force) return metaReq;
  metaState = { ...metaState, loading: true };
  metaEmit();
  metaReq = getCrmMeta()
    .then((m) => {
      metaState = { meta: m, error: null, loading: false };
    })
    .catch((e) => {
      logApiError("crm.meta", e);
      metaState = { meta: metaState.meta, error: e, loading: false };
      metaReq = null;
    })
    .finally(metaEmit);
  return metaReq;
}
export function forgetCrmMeta(): void {
  metaState = { meta: null, error: null, loading: false };
  metaReq = null;
  metaEmit();
}

export function useCrmMeta(): MetaState {
  const s = useSyncExternalStore(
    (f) => {
      metaSubs.add(f);
      return () => metaSubs.delete(f);
    },
    () => metaState,
    () => metaState,
  );
  useEffect(() => {
    if (!s.meta && !s.loading && !s.error) void loadCrmMeta();
  }, [s.meta, s.loading, s.error]);
  return s;
}

// ── realtime ──
// `handler` gets every CRM event; a socket reconnect is a full resync (§10).
export function useCrmEvents(handler: (ev: CrmEvent) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const off = subscribeUserEvents((raw) => {
      const ev = crmEventOf(raw);
      if (ev) ref.current(ev);
    });
    const offResync = onUserSocketResync(() => ref.current({ name: "crm.resync", leadId: "", runId: "", exportId: "", customerId: "", callId: "", toStatus: "", position: 0, title: "", body: "", invalidate: ["all"] }));
    return () => {
      off();
      offResync();
    };
  }, []);
}

export type LiveState = "offline" | "connecting" | "online";
export function useLiveState(): LiveState {
  const [s, setS] = useState<LiveState>("connecting");
  useEffect(() => subscribeUserSocketState(setS), []);
  return s;
}

// A clock for relative times ("in 25 min", "overdue 3 h"), redrawn each 30 s.
export function useNow(stepMs = 30_000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, stepMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [stepMs]);
  return now;
}

// Minutes from now to an ISO time (negative: overdue); null without one.
export function minutesUntil(iso: string, now: number): number | null {
  if (!iso || !now) return null;
  const at = parseServerTime(iso);
  return Number.isFinite(at) ? Math.round((at - now) / 60_000) : null;
}

// ── export jobs tray ──
// Driven by polling the job and by crm.export.ready; kept across pages.
let jobs: CrmExport[] = [];
const jobSubs = new Set<() => void>();
const jobEmit = () => jobSubs.forEach((f) => f());
const polling = new Map<string, number>();
const POLL_MS = [1500, 2500, 4000, 6000, 10000];

function setJob(e: CrmExport) {
  const i = jobs.findIndex((j) => j.id === e.id);
  jobs = i < 0 ? [e, ...jobs].slice(0, 6) : jobs.map((j) => (j.id === e.id ? { ...j, ...e } : j));
  jobEmit();
}
function poll(id: string, attempt = 0) {
  if (polling.has(id)) return;
  const run = async () => {
    polling.delete(id);
    try {
      const e = await getCrmExport(id);
      setJob(e);
      if (!exportDone(e)) {
        polling.set(id, window.setTimeout(() => void run(), POLL_MS[Math.min(attempt + 1, POLL_MS.length - 1)]));
        attempt++;
      }
    } catch (e) {
      if (!isAborted(e)) logApiError("crm.export.poll", e);
    }
  };
  polling.set(id, window.setTimeout(() => void run(), POLL_MS[Math.min(attempt, POLL_MS.length - 1)]));
}
export function trackCrmExport(e: CrmExport): void {
  setJob(e);
  if (!exportDone(e)) poll(e.id);
}
export function refreshCrmExport(id: string): void {
  const t = polling.get(id);
  if (t) window.clearTimeout(t);
  polling.delete(id);
  void getCrmExport(id).then(setJob, (e) => logApiError("crm.export", e));
}
export function dismissCrmExport(id: string): void {
  const t = polling.get(id);
  if (t) window.clearTimeout(t);
  polling.delete(id);
  jobs = jobs.filter((j) => j.id !== id);
  jobEmit();
}
export function useCrmExports(): CrmExport[] {
  return useSyncExternalStore(
    (f) => {
      jobSubs.add(f);
      return () => jobSubs.delete(f);
    },
    () => jobs,
    () => jobs,
  );
}
