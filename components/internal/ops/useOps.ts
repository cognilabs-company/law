"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, asDict, asStr } from "@/lib/http";
import { subscribeUserEvents, type UserEvent } from "@/lib/userSocket";
import { getEmployeeDetail } from "@/lib/services/hrmOps";

// One operational read: abortable, read again on reload(), and read again
// when a realtime event about this module arrives (contract §2: invalidate
// on an internal.* event, never poll). `topics` names the module: an
// internal.hrm.record.* event counts when its domain is one of them, any
// other internal.* event when its name mentions one of them.
export function eventTouches(e: UserEvent, topics: string[]): boolean {
  if (!e.event.startsWith("internal.")) return false;
  if (e.event.startsWith("internal.hrm.record")) {
    const data = asDict(e.data);
    const domain = asStr(e.domain) || asStr(data.domain) || asStr(asDict(data.record).domain);
    return !domain || topics.includes(domain);
  }
  return topics.some((k) => e.event.includes(k));
}

export function useOps<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[], topics: string[] = []) {
  const [state, setState] = useState<{ key: string; data: T | null; error: unknown }>({ key: "", data: null, error: null });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(deps);
  useEffect(() => {
    const c = new AbortController();
    load(c.signal)
      .then((data) => !c.signal.aborted && setState({ key, data, error: null }))
      .catch((error: unknown) => {
        if (c.signal.aborted || (error instanceof ApiError && error.detail === "aborted")) return;
        setState((s) => ({ key, data: s.key === key ? s.data : null, error }));
      });
    return () => c.abort();
    // `load` is a fresh closure each render; `key` and `tick` say when to read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const topicKey = topics.join(",");
  useEffect(() => {
    if (!topicKey) return;
    let h: ReturnType<typeof setTimeout> | null = null;
    const list = topicKey.split(",");
    const off = subscribeUserEvents((e) => {
      if (!eventTouches(e, list)) return;
      if (h) clearTimeout(h);
      h = setTimeout(() => setTick((n) => n + 1), 400);
    });
    return () => {
      off();
      if (h) clearTimeout(h);
    };
  }, [topicKey]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const fresh = state.key === key;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, loading: !fresh, reload, stale: state.data };
}

// The backend's own words for a refusal, when it sent some.
export function opsError(e: unknown): string {
  if (!(e instanceof ApiError)) return "";
  const d = asDict(e.data?.detail);
  const msg = asStr(d.message) || (typeof e.data?.detail === "string" ? e.data.detail : "") || asStr(asDict(e.data).message);
  return msg && !/^\d{3}$|aborted|network_error/.test(msg) ? msg : "";
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// A date picked on the page is that day in the user's own timezone.
export const dayToIso = (day: string, time = "00:00") => (day ? new Date(`${day}T${time}`).toISOString() : "");

// Names of people the directory does not list (inactive ones still sit in
// old schedules and sheets): looked up one by one, once per page load.
const names = new Map<string, Promise<{ name: string; code: string } | null>>();
export function useMissingNames(ids: string[], ready: boolean): Record<string, { name: string; code: string }> {
  const [got, setGot] = useState<Record<string, { name: string; code: string }>>({});
  const key = ready ? [...new Set(ids)].sort().join(",") : "";
  useEffect(() => {
    if (!key) return;
    let live = true;
    for (const id of key.split(",").slice(0, 20)) {
      let p = names.get(id);
      if (!p) {
        p = getEmployeeDetail(id)
          .then((d) => ({ name: asStr(d.employee.display_name) || [asStr(d.employee.first_name), asStr(d.employee.last_name)].filter(Boolean).join(" "), code: asStr(d.employee.employee_code) }))
          .catch(() => null);
        names.set(id, p);
      }
      void p.then((v) => live && v && setGot((g) => (g[id] ? g : { ...g, [id]: v })));
    }
    return () => {
      live = false;
    };
  }, [key]);
  return got;
}
