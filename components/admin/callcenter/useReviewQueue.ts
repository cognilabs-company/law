"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { asDict } from "@/lib/http";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";

// One verification queue (experience, achievements, certificates): a status
// filter, pages of 50 added with "show more", and live updates (final
// contract 2026-10-29 §10): an event's `record` is upserted by id — patched
// in place, added when it newly fits the filter, dropped when it no longer
// does; an event without one reads the loaded rows again, once per burst,
// never once per event. 403 means this operator may not review this kind.

type Fetch<T> = (o: { status: string; offset: number; limit: number }, signal?: AbortSignal) => Promise<{ items: T[]; total: number; hasMore: boolean }>;
const LIMIT = 50;
const DEBOUNCE = 600;

export function useReviewQueue<T extends { id: string; status: string }>(
  fetch: Fetch<T>,
  // accept: whether a record fits the queue's other filters (experience kind).
  opts: { scope: string; events: RegExp; parse?: (v: unknown) => T | null; accept?: (rec: T) => boolean; initial?: string; onCount?: (n: number) => void; filterKey?: string },
) {
  const [status, setStatus] = useState(opts.initial ?? "pending_review");
  const [items, setItems] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const fetchRef = useRef(fetch);
  const parseRef = useRef(opts.parse);
  const acceptRef = useRef(opts.accept);
  const onCountRef = useRef(opts.onCount);
  const itemsRef = useRef<T[] | null>(null);
  const statusRef = useRef(status);
  const loaded = useRef(0);
  useEffect(() => {
    fetchRef.current = fetch;
    parseRef.current = opts.parse;
    acceptRef.current = opts.accept;
    onCountRef.current = opts.onCount;
    itemsRef.current = items;
    statusRef.current = status;
  });
  const filterKey = opts.filterKey ?? "";

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
        if (status === "pending_review" && !filterKey) onCountRef.current?.(r.total);
      } catch (e) {
        if (isAborted(e)) return;
        if (isForbidden(e)) return setDenied(true);
        logApiError(`${opts.scope}.queue`, e);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    // filterKey: a changed backend filter reads the queue again.
    [status, opts.scope, filterKey],
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
    // Upsert the event's record by id; without one, one debounced read.
    const patch = (raw: unknown): boolean => {
      const rec = parseRef.current?.(raw);
      const rows = itemsRef.current;
      if (!rec || !rows) return false;
      const fits = (!statusRef.current || rec.status === statusRef.current) && (acceptRef.current?.(rec) ?? true);
      const had = rows.some((x) => x.id === rec.id);
      if (had) setItems(rows.flatMap((x) => (x.id !== rec.id ? [x] : fits ? [rec] : [])));
      else if (fits) setItems([rec, ...rows]);
      if (had !== fits) setTotal((n) => Math.max(0, n + (fits ? 1 : -1)));
      return true;
    };
    const offEv = subscribeUserEvents((e) => {
      if (!opts.events.test(String(e.event ?? ""))) return;
      const rec = asDict(e).record;
      if (!(rec && patch(rec))) soon();
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
