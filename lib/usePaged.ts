"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAborted } from "./http";

export type Page<T> = { items: T[]; total: number; hasMore: boolean };
export type PagedStatus = "loading" | "ready" | "error";

type State<T> = { items: T[]; total: number; hasMore: boolean; status: PagedStatus; error: unknown };
const initial = <T,>(): State<T> => ({ items: [], total: 0, hasMore: false, status: "loading", error: null });

export function usePaged<T>(
  fetcher: (offset: number, limit: number, signal: AbortSignal) => Promise<Page<T>>,
  key: string,
  limit = 20,
  keyOf?: (item: T) => string,
) {
  const [st, setSt] = useState<State<T>>(initial);
  const [prevKey, setPrevKey] = useState(key);
  const [more, setMore] = useState(false);
  const [tick, setTick] = useState(0);
  if (prevKey !== key) {
    setPrevKey(key);
    setSt(initial());
  }
  const fetcherRef = useRef(fetcher);
  const keyRef = useRef(keyOf);
  const ctrl = useRef<AbortController | null>(null);
  const moreCtrl = useRef<AbortController | null>(null);
  const loaded = useRef(0);
  const quiet = useRef(false);

  useEffect(() => {
    fetcherRef.current = fetcher;
    keyRef.current = keyOf;
  });

  useEffect(() => {
    ctrl.current?.abort();
    moreCtrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const silent = quiet.current;
    quiet.current = false;
    const size = silent ? Math.max(limit, loaded.current) : limit;
    fetcherRef
      .current(0, size, c.signal)
      .then((p) => {
        if (c.signal.aborted) return;
        loaded.current = p.items.length;
        setSt({ items: p.items, total: p.total, hasMore: p.hasMore, status: "ready", error: null });
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setSt((cur) => (silent ? { ...cur, error: e } : { ...initial<T>(), status: "error", error: e }));
      });
    return () => c.abort();
  }, [key, tick, limit]);

  const loadMore = useCallback(async () => {
    if (more || !st.hasMore) return;
    const c = new AbortController();
    moreCtrl.current = c;
    setMore(true);
    try {
      const p = await fetcherRef.current(loaded.current, limit, c.signal);
      if (c.signal.aborted) return;
      loaded.current += p.items.length;
      const k = keyRef.current;
      setSt((cur) => {
        const seen = k ? new Set(cur.items.map(k)) : null;
        const next = seen && k ? p.items.filter((x) => !seen.has(k(x))) : p.items;
        return { ...cur, items: cur.items.concat(next), total: p.total, hasMore: p.hasMore && p.items.length > 0 };
      });
    } catch (e) {
      if (!isAborted(e)) setSt((cur) => ({ ...cur, error: e }));
    } finally {
      if (moreCtrl.current === c) setMore(false);
    }
  }, [more, st.hasMore, limit]);

  const refresh = useCallback(() => {
    quiet.current = true;
    setTick((n) => n + 1);
  }, []);
  const reload = useCallback(() => {
    setSt(initial());
    setTick((n) => n + 1);
  }, []);
  const setItems = useCallback((next: T[] | ((cur: T[]) => T[])) => {
    setSt((cur) => ({ ...cur, items: typeof next === "function" ? next(cur.items) : next }));
  }, []);

  return { ...st, setItems, loadingMore: more, loadMore, refresh, reload };
}
