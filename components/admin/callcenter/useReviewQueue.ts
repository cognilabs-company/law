"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";

// One verification queue (experience, achievements, certificates): a status
// filter, pages of 50 added with "show more", and live updates — a burst of
// queue events reads the loaded rows once, never in a loop. 403 means this
// operator may not review this kind of record.

type Fetch<T> = (o: { status: string; offset: number; limit: number }, signal?: AbortSignal) => Promise<{ items: T[]; total: number; hasMore: boolean }>;
const LIMIT = 50;
const DEBOUNCE = 600;

export function useReviewQueue<T extends { id: string }>(fetch: Fetch<T>, opts: { scope: string; events: RegExp; initial?: string; onCount?: (n: number) => void }) {
  const [status, setStatus] = useState(opts.initial ?? "pending_review");
  const [items, setItems] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const fetchRef = useRef(fetch);
  const onCountRef = useRef(opts.onCount);
  const loaded = useRef(0);
  useEffect(() => {
    fetchRef.current = fetch;
    onCountRef.current = opts.onCount;
  });

  // From the top, as many rows as are shown now (at least one page).
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const r = await fetchRef.current({ status, offset: 0, limit: Math.max(LIMIT, loaded.current) }, signal);
        loaded.current = r.items.length;
        setItems(r.items);
        setTotal(r.total);
        setHasMore(r.hasMore);
        setFailed(false);
        if (status === "pending_review") onCountRef.current?.(r.total);
      } catch (e) {
        if (isAborted(e)) return;
        if (isForbidden(e)) return setDenied(true);
        logApiError(`${opts.scope}.queue`, e);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [status, opts.scope],
  );

  const more = useCallback(async () => {
    if (loading || !items) return;
    setLoading(true);
    try {
      const r = await fetchRef.current({ status, offset: items.length, limit: LIMIT });
      const seen = new Set(items.map((x) => x.id));
      const next = [...items, ...r.items.filter((x) => !seen.has(x.id))];
      loaded.current = next.length;
      setItems(next);
      setTotal(r.total);
      setHasMore(r.hasMore);
    } catch (e) {
      if (!isAborted(e)) logApiError(`${opts.scope}.more`, e);
    } finally {
      setLoading(false);
    }
  }, [items, loading, status, opts.scope]);

  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    let timer = 0;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), DEBOUNCE);
    };
    const offEv = subscribeUserEvents((e) => {
      if (opts.events.test(String(e.event ?? ""))) soon();
    });
    const offSync = onUserSocketResync(soon);
    return () => {
      ctl.abort();
      window.clearTimeout(timer);
      offEv();
      offSync();
    };
    // The regex is a constant per queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const pick = useCallback((s: string) => {
    loaded.current = 0;
    setItems(null);
    setStatus(s);
  }, []);

  return { status, setStatus: pick, items, total, hasMore, failed, denied, loading, reload: load, more };
}
