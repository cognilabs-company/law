"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { asDict, asStr } from "@/lib/http";
import { subscribeInternalEvents, type InternalEvent } from "@/lib/internalSocket";
import { getOfficeDirectory, getOfficeEvents } from "@/lib/services/liveOffice";
import type { DirectoryUser, RawEvent } from "@/lib/liveOffice/model";

// The audit trail has no "since" filter, so the whole day is re-read; 20 s
// keeps the office current without hammering a heavy endpoint, and a hidden
// tab does not poll at all.
export const POLL_MS = 20_000;
const DIRECTORY_MS = 10 * 60_000;

type Phase = "loading" | "ready" | "error";

// A Studio editor reports itself on the studio:activity channel right away,
// long before the next audit read: seat that person in Studio now.
function studioEvent(e: InternalEvent, seq: number): RawEvent | null {
  if (/ended|end$|close|stop|offline/i.test(e.event)) return null;
  const d = asDict(e.data ?? e.payload ?? e.activity ?? e.session ?? e);
  const userId = asStr(d.user_id ?? d.userId);
  if (!userId) return null;
  const step = asStr(d.last_action ?? d.action ?? d.screen, "edit").toLowerCase().replace(/[^a-z_]/g, "") || "edit";
  return { id: `live-${seq}`, userId, action: `studio_object_${step}`, targetType: "studio_object", detail: asStr(d.object_name ?? d.constructor_code), title: "", at: Date.now() };
}

export function useOffice(enabled = true) {
  const [rows, setRows] = useState<RawEvent[]>([]);
  const [dir, setDir] = useState<Map<string, DirectoryUser>>(() => new Map());
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<unknown>(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<RawEvent[]>([]);
  const inFlight = useRef(false);
  const dirAt = useRef(0);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const now = Date.now();
      const needDir = now - dirAt.current > DIRECTORY_MS;
      const [events, directory] = await Promise.all([getOfficeEvents(now), needDir ? getOfficeDirectory() : Promise.resolve(null)]);
      if (directory) {
        dirAt.current = now;
        setDir(directory);
      }
      setRows(events);
      setUpdatedAt(Date.now());
      setError(null);
      setPhase("ready");
    } catch (e) {
      setError(e);
      setPhase((p) => (p === "ready" ? p : "error"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(() => void load(), 0);
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onShow = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [load, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let seq = 0;
    return subscribeInternalEvents("studio:activity", (e) => {
      const ev = studioEvent(e, ++seq);
      if (ev) setLive((cur) => [...cur.slice(-200), ev]);
    });
  }, [enabled]);

  const all = live.length ? [...rows, ...live] : rows;
  return { rows: all, dir, phase, error, updatedAt, busy, reload: load };
}
