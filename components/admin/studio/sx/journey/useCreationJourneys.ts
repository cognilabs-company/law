"use client";

import { useEffect, useRef, useState } from "react";
import { logApiError } from "@/lib/http";
import { listCreationJourneys, normCreationJourney, rememberCreationJourney, type StudioCreationJourney, type StudioCreationJourneys, type StudioJourneyQuery } from "@/lib/services/studio";
import type { UserEvent } from "@/lib/userSocket";
import { useStudioLive } from "../live";
import { isJourneyEvent } from "./journeyApi";
import { isFullJourneyPayload, mergeJourney } from "./model";

export type CreationJourneysState = {
  items: StudioCreationJourney[];
  total: number;
  incompleteCount: number | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
  apply: (j: StudioCreationJourney) => void;
};

type Loaded = { key: string; data: StudioCreationJourneys | null; error: unknown };

const EVENT_DEBOUNCE_MS = 300;
const NO_ITEMS: StudioCreationJourney[] = [];
const DRAFT = "draft";

export function journeyEventData(e: UserEvent): Record<string, unknown> {
  const d = e.data;
  return d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : e;
}

export function applyJourneyTo(data: StudioCreationJourneys, next: StudioCreationJourney, status: string): StudioCreationJourneys | null {
  const at = data.items.findIndex((x) => x.id === next.id);
  if (at < 0) return null;
  const prev = data.items[at];
  const merged = mergeJourney(prev, next);
  const keep = !status || !merged.status || merged.status === status;
  const items = keep ? data.items.map((x, n) => (n === at ? merged : x)) : data.items.filter((_, n) => n !== at);
  const wasDraft = prev.status === DRAFT;
  const isDraft = merged.status === DRAFT;
  const count = data.incompleteCount === null || wasDraft === isDraft ? data.incompleteCount : Math.max(0, data.incompleteCount + (isDraft ? 1 : -1));
  return { items, total: keep ? data.total : Math.max(0, data.total - 1), incompleteCount: count };
}

export function useCreationJourneys(q: StudioJourneyQuery, enabled = true): CreationJourneysState {
  const status = q.status ?? "";
  const type = q.type ?? "";
  const limit = q.limit ?? null;
  const offset = q.offset ?? null;
  const key = JSON.stringify([status, type, limit, offset]);
  const [loaded, setLoaded] = useState<Loaded>({ key: "", data: null, error: null });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Loaded>(loaded);

  useEffect(() => {
    latest.current = loaded;
  });

  useEffect(() => {
    if (!enabled) return;
    const my = ++seq.current;
    const ac = new AbortController();
    const query: StudioJourneyQuery = {};
    if (status) query.status = status;
    if (type === "service" || type === "package") query.type = type;
    if (limit !== null) query.limit = limit;
    if (offset !== null) query.offset = offset;
    listCreationJourneys(query, ac.signal)
      .then((data) => {
        if (my === seq.current) setLoaded({ key, data, error: null });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        logApiError("studio.journeys.list", e);
        if (my === seq.current) setLoaded((s) => ({ key, data: s.key === key ? s.data : null, error: e }));
      });
    return () => ac.abort();
  }, [enabled, key, status, type, limit, offset, tick]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const refetchSoon = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setTick((n) => n + 1);
    }, EVENT_DEBOUNCE_MS);
  };

  const applyLocal = (j: StudioCreationJourney): boolean => {
    const cur = latest.current.key === key ? latest.current.data : null;
    if (!cur || !cur.items.some((x) => x.id === j.id)) return false;
    setLoaded((s) => {
      if (s.key !== key || !s.data) return s;
      const next = applyJourneyTo(s.data, j, status);
      return next ? { ...s, data: next } : s;
    });
    return true;
  };

  useStudioLive((e) => {
    if (e.event === "studio.resync") {
      setTick((n) => n + 1);
      return;
    }
    if (!isJourneyEvent(e.event)) return;
    const d = journeyEventData(e);
    const cur = latest.current.key === key ? latest.current.data : null;
    if (!isFullJourneyPayload(d) || !cur) {
      refetchSoon();
      return;
    }
    const j = normCreationJourney(d);
    rememberCreationJourney(j);
    if (!applyLocal(j)) refetchSoon();
  }, enabled);

  const apply = (j: StudioCreationJourney) => {
    rememberCreationJourney(j);
    if (!applyLocal(j)) refetchSoon();
  };

  const current = enabled && loaded.key === key;
  const data = current ? loaded.data : null;
  return {
    items: data?.items ?? NO_ITEMS,
    total: data?.total ?? 0,
    incompleteCount: data?.incompleteCount ?? null,
    loading: enabled && (!current || (!loaded.data && !loaded.error)),
    error: current ? loaded.error : null,
    reload: () => setTick((n) => n + 1),
    apply,
  };
}
