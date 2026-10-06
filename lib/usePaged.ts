"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAborted } from "./http";

export type Page<T> = { items: T[]; total: number; hasMore: boolean };
export type PagedStatus = "loading" | "ready" | "error";

type State<T> = { items: T[]; total: number; hasMore: boolean; status: PagedStatus; error: unknown; dirty: boolean };
const initial = <T,>(): State<T> => ({ items: [], total: 0, hasMore: false, status: "loading", error: null, dirty: false });

export function usePaged<T>(
  fetcher: (offset: number, limit: number, signal: AbortSignal) => Promise<Page<T>>,
  key: string,
  limit = 20,
  keyOf?: (item: T) => string,
  maxLimit = 100,
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
  const edits = useRef(0);
  const shown = useRef(0);
  const resyncs = useRef(0);

  useEffect(() => {
    fetcherRef.current = fetcher;
    keyRef.current = keyOf;
    shown.current = st.items.length;
  });

  useEffect(() => {
    ctrl.current?.abort();
    moreCtrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const silent = quiet.current;
    quiet.current = false;
    const at = edits.current;
    const size = silent ? Math.min(maxLimit, Math.max(limit, loaded.current, shown.current)) : limit;
    fetcherRef
      .current(0, size, c.signal)
      .then((p) => {
        if (c.signal.aborted) return;
        const again = edits.current !== at && resyncs.current < 2;
        resyncs.current = again ? resyncs.current + 1 : 0;
        const resync = () => {
          if (!again) return;
          quiet.current = true;
          setTick((n) => n + 1);
        };
        if (silent && loaded.current > size) {
          const k = keyRef.current;
          setSt((cur) => {
            const head = p.items;
            const seen = k ? new Set(head.map(k)) : null;
            const tail = cur.items.slice(size).filter((x) => !(seen && k && seen.has(k(x))));
            return { items: head.concat(tail), total: p.total, hasMore: cur.hasMore, status: "ready", error: null, dirty: true };
          });
          resync();
          return;
        }
        loaded.current = p.items.length;
        setSt({ items: p.items, total: p.total, hasMore: p.hasMore, status: "ready", error: null, dirty: edits.current !== at });
        resync();
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setSt((cur) => (silent ? { ...cur, error: e } : { ...initial<T>(), status: "error", error: e }));
      });
    return () => c.abort();
  }, [key, tick, limit, maxLimit]);

  const refresh = useCallback(() => {
    quiet.current = true;
    setTick((n) => n + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (more || !st.hasMore) return;
    const c = new AbortController();
    moreCtrl.current = c;
    setMore(true);
    const at = edits.current;
    const k = keyRef.current;
    const unseen = (have: T[], page: T[]) => {
      if (!k) return page;
      const seen = new Set(have.map(k));
      return page.filter((x) => !seen.has(k(x)));
    };
    try {
      if (st.dirty) {
        const want = st.items.length + limit;
        let items: T[] = [];
        let page: Page<T> = { items: [], total: 0, hasMore: true };
        while (page.hasMore && items.length < want) {
          page = await fetcherRef.current(items.length, Math.min(maxLimit, want - items.length), c.signal);
          if (c.signal.aborted) return;
          const add = unseen(items, page.items);
          if (!add.length) break;
          items = items.concat(add);
        }
        loaded.current = items.length;
        const moved = edits.current !== at;
        const last = page;
        const synced = items;
        setSt((cur) => ({ ...cur, items: synced, total: last.total, hasMore: last.hasMore && last.items.length > 0, dirty: moved }));
        if (moved) refresh();
        return;
      }
      const p = await fetcherRef.current(loaded.current, limit, c.signal);
      if (c.signal.aborted) return;
      loaded.current += p.items.length;
      const moved = edits.current !== at;
      setSt((cur) => ({ ...cur, items: cur.items.concat(unseen(cur.items, p.items)), total: p.total, hasMore: p.hasMore && p.items.length > 0, dirty: cur.dirty || moved }));
      if (moved) refresh();
    } catch (e) {
      if (!isAborted(e)) setSt((cur) => ({ ...cur, error: e }));
    } finally {
      if (moreCtrl.current === c) setMore(false);
    }
  }, [more, st.hasMore, st.dirty, st.items.length, limit, maxLimit, refresh]);

  const reload = useCallback(() => {
    setSt(initial());
    setTick((n) => n + 1);
  }, []);
  const setItems = useCallback((next: T[] | ((cur: T[]) => T[])) => {
    edits.current += 1;
    setSt((cur) => {
      const items = typeof next === "function" ? next(cur.items) : next;
      return { ...cur, items, dirty: cur.dirty || items.length !== cur.items.length };
    });
  }, []);

  return { ...st, setItems, loadingMore: more, loadMore, refresh, reload };
}
