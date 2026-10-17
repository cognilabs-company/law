"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logApiError } from "@/lib/http";
import { listStudioRecords, type StudioRecord, type StudioRecordSource, type StudioRecords } from "@/lib/services/studio";
import type { UserEvent } from "@/lib/userSocket";
import { useDebouncedValue } from "../hooks";
import { studioEventCode, useStudioLive } from "../live";
import type { CtorQuery } from "./CtorPage";
import { ctorQueryString, EMPTY_CTOR_QUERY } from "./urlState";

export type CtorRecordsState = {
  query: CtorQuery;
  setQ: (q: string) => void;
  setStatus: (s: string) => void;
  setSource: (s: "" | StudioRecordSource) => void;
  setPlacement: (p: string) => void;
  setPage: (p: number) => void;
  reset: () => void;
  data: StudioRecords | null;
  rows: StudioRecord[];
  current: boolean;
  loading: boolean;
  error: unknown;
  retry: () => Promise<void>;
  retrying: boolean;
  refetch: () => void;
  paged: boolean;
  limit: number;
};

export type CtorRecordsOptions = { limit?: number; all?: boolean; local?: boolean };

export const CTOR_PAGE = 50;
export const CTOR_ALL = 200;
const LIVE_MS = 400;

type ListState = { key: string; data: StudioRecords | null; error: unknown };

const NONE: ListState = { key: "", data: null, error: null };

export function isRecordEvent(name: string): boolean {
  return name.startsWith("studio.object_") || name.startsWith("studio.approval_") || name === "studio.resync";
}

export function recordsKey(code: string, status: string, source: string, term: string, offset: number, limit: number): string {
  return `${code}|${status}|${source}|${term}|${offset}|${limit}`;
}

function writeUrl(q: CtorQuery): void {
  if (typeof window === "undefined") return;
  const qs = ctorQueryString(q);
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== now) window.history.replaceState(window.history.state, "", next);
}

export function useCtorRecords(code: string, initial: CtorQuery, opts?: CtorRecordsOptions): CtorRecordsState {
  const all = opts?.all === true;
  const local = opts?.local === true;
  const limit = all ? CTOR_ALL : (opts?.limit ?? CTOR_PAGE);
  const [query, setQuery] = useState<CtorQuery>(initial);
  const [list, setList] = useState<ListState>(NONE);
  const [retrying, setRetrying] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settled = useDebouncedValue(query.q.trim(), 350);
  const term = query.q.trim() ? settled : "";
  const [seenTerm, setSeenTerm] = useState(term);
  if (seenTerm !== term) {
    setSeenTerm(term);
    if (query.page !== 0) setQuery({ ...query, page: 0 });
  }

  const page = all ? 0 : query.page;
  const status = local ? "" : query.status;
  const sent = local ? "" : term;
  const source = local ? "" : query.source;
  const offset = page * limit;
  const key = recordsKey(code, status, source, sent, offset, limit);

  const fetchRows = useCallback(async (): Promise<boolean> => {
    const k = recordsKey(code, status, source, sent, offset, limit);
    const my = ++seq.current;
    try {
      const data = await listStudioRecords(code, { q: sent, status, source, limit, offset });
      if (my !== seq.current) return true;
      setList({ key: k, data, error: null });
      return true;
    } catch (e) {
      if (my !== seq.current) return true;
      logApiError("studio.records", e);
      setList((cur) => (cur.key === k && cur.data ? { ...cur, error: e } : { key: k, data: null, error: e }));
      return false;
    }
  }, [code, status, source, sent, offset, limit]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const qs = ctorQueryString(query);
  useEffect(() => {
    writeUrl(query);
  }, [qs, query]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useStudioLive((e: UserEvent) => {
    if (!isRecordEvent(e.event)) return;
    const c = studioEventCode(e);
    if (c && c.toUpperCase() !== code.toUpperCase()) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void fetchRows(), LIVE_MS);
  });

  const setQ = useCallback((q: string) => setQuery((cur) => ({ ...cur, q })), []);
  const setStatus = useCallback((s: string) => setQuery((cur) => ({ ...cur, status: s, page: 0 })), []);
  const setSource = useCallback((s: "" | StudioRecordSource) => setQuery((cur) => ({ ...cur, source: s, page: 0 })), []);
  const setPlacement = useCallback((p: string) => setQuery((cur) => ({ ...cur, placement: p })), []);
  const setPage = useCallback((p: number) => setQuery((cur) => ({ ...cur, page: Math.max(0, Math.floor(p) || 0) })), []);
  const reset = useCallback(() => setQuery(EMPTY_CTOR_QUERY), []);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await fetchRows();
    } finally {
      setRetrying(false);
    }
  }, [fetchRows]);

  const refetch = useCallback(() => void fetchRows(), [fetchRows]);

  const current = list.key === key;
  return {
    query,
    setQ,
    setStatus,
    setSource,
    setPlacement,
    setPage,
    reset,
    data: list.data,
    rows: list.data?.items ?? [],
    current,
    loading: !current && !list.data,
    error: current ? list.error : null,
    retry,
    retrying,
    refetch,
    paged: !all,
    limit,
  };
}
