"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, asDict, asStr } from "@/lib/http";
import { subscribeLiveOffice, type LiveEvent } from "@/lib/liveOfficeSocket";
import { getLiveBoard, normActivity, normBusy, normPerson, normRoom, type LiveActivity, type LiveBoard, type LivePerson } from "@/lib/services/internalLive";

type Phase = "loading" | "ready" | "error";
export type LiveFilter = { unitId: string; roomId: string; status: string; q: string };

const EMPTY: LiveBoard = { units: [], rooms: [], people: [], statuses: {}, wsPath: "", heartbeatSeconds: 30, generatedAt: "", grants: [], raw: {} };
const employeeOf = (d: Record<string, unknown>) => asStr(d.employee_id ?? asDict(d.employee).id ?? asDict(d.presence).employee_id);

// The board, kept current by the socket (§9): a presence, activity or busy
// event updates that one card; a room or membership event that one room or
// person. The whole board is read once on open, when a filter changes and
// once after every reconnect — never polled.
export function useLiveBoard({ unitId, roomId, status, q }: LiveFilter, onActivity?: (employeeId: string, a: LiveActivity) => void) {
  const [board, setBoard] = useState<LiveBoard>(EMPTY);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<unknown>(null);
  const [live, setLive] = useState(false);
  const seq = useRef(0);
  const onActivityRef = useRef(onActivity);
  useEffect(() => {
    onActivityRef.current = onActivity;
  });

  const load = useCallback(
    async (quiet = false) => {
      const my = ++seq.current;
      if (!quiet) setPhase((p) => (p === "ready" ? p : "loading"));
      try {
        const b = await getLiveBoard({ unitId, roomId, status, q });
        if (my !== seq.current) return;
        setBoard(b);
        setPhase("ready");
        setError(null);
      } catch (e) {
        if (my !== seq.current || (e instanceof ApiError && e.detail === "aborted")) return;
        setError(e);
        setPhase((p) => (p === "ready" ? p : "error"));
      }
    },
    [unitId, roomId, status, q],
  );

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const upsert = useCallback((id: string, patch: (p: LivePerson | undefined) => LivePerson | null) => {
    setBoard((b) => {
      const idx = b.people.findIndex((p) => p.id === id);
      const next = patch(idx >= 0 ? b.people[idx] : undefined);
      if (!next) return b;
      const people = [...b.people];
      if (idx >= 0) people[idx] = next;
      else people.push(next);
      return { ...b, people };
    });
  }, []);

  useEffect(() => {
    const onEvent = (e: LiveEvent) => {
      const d = e.data;
      const name = e.event.replace(/^internal\.live_office\./, "");
      if (name.startsWith("presence")) {
        const p = normPerson(d);
        if (!p.id) return;
        upsert(p.id, (cur) => (cur ? { ...cur, ...p, raw: { ...cur.raw, ...p.raw }, name: p.name || cur.name, code: p.code || cur.code, position: p.position || cur.position, unitId: p.unitId || cur.unitId, roomId: p.roomId || cur.roomId, activity: p.activity ?? cur.activity, busy: p.status === "busy" ? (p.busy ?? cur.busy) : p.busy } : p));
      } else if (name.startsWith("activity")) {
        const id = employeeOf(d);
        const a = normActivity(asDict(d.activity ?? d.event ?? d));
        if (!id || !a) return;
        upsert(id, (cur) => (cur ? { ...cur, activity: a, lastSeenAt: a.at || cur.lastSeenAt } : null));
        onActivityRef.current?.(id, a);
      } else if (name.startsWith("context")) {
        // A safe workflow switch (§18): only the virtual monitor changes.
        const id = employeeOf(d);
        const screen = d.virtual_monitor ?? d.monitor ?? d.screen_context ?? d.context;
        if (!id || !screen || typeof screen !== "object") return;
        upsert(id, (cur) => (cur ? { ...cur, raw: { ...cur.raw, virtual_monitor: screen, parallel_contexts: d.parallel_contexts ?? d.work_contexts ?? cur.raw.parallel_contexts } } : null));
      } else if (name === "busy.started" || name === "busy.ended") {
        const id = employeeOf(d);
        if (!id) return;
        const started = name === "busy.started";
        const busy = started ? normBusy(asDict(d.busy ?? d.interval ?? d)) : null;
        upsert(id, (cur) => (cur ? { ...cur, busy, status: started ? "busy" : cur.status === "busy" ? "working" : cur.status } : null));
      } else if (name.startsWith("room")) {
        const r = normRoom(asDict(d.room ?? d));
        if (!r.id) return;
        setBoard((b) => {
          const i = b.rooms.findIndex((x) => x.id === r.id);
          const rooms = [...b.rooms];
          if (i >= 0) rooms[i] = r;
          else rooms.push(r);
          return { ...b, rooms };
        });
      } else if (name.startsWith("membership")) {
        const m = asDict(d.membership ?? d);
        const id = asStr(m.employee_id);
        if (!id || asStr(m.membership_type) !== "primary" || (asStr(m.status) && asStr(m.status) !== "active")) return;
        upsert(id, (cur) => (cur ? { ...cur, unitId: asStr(m.org_unit_id) || cur.unitId, roomId: asStr(m.room_id) } : null));
      }
    };
    const unsub = subscribeLiveOffice(onEvent, () => void load(true));
    const on = setTimeout(() => setLive(true), 0);
    return () => {
      clearTimeout(on);
      unsub();
    };
  }, [upsert, load]);

  return { board, phase, error, live, reload: () => void load(true), setBoard, upsert };
}
