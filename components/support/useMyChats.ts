"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAborted } from "@/lib/http";
import { isActiveTicket, listMyActiveSupportTickets, listMySupportTickets, type SupportTicket } from "@/lib/services/support";

const CLOSED_PAGE = 20;
const RECENT = 30;

type Status = "loading" | "ready" | "error";

const newest = (a: SupportTicket, b: SupportTicket) => {
  const x = a.updatedAt || a.createdAt;
  const y = b.updatedAt || b.createdAt;
  return x < y ? 1 : x > y ? -1 : 0;
};

function mergeInto(cur: Record<string, SupportTicket>, items: SupportTicket[]): Record<string, SupportTicket> {
  const out = { ...cur };
  for (const tk of items) if (tk.id) out[tk.id] = cur[tk.id] ? { ...cur[tk.id], ...tk } : tk;
  return out;
}

export function useMyChats() {
  const [map, setMap] = useState<Record<string, SupportTicket>>({});
  const [load, setLoad] = useState<{ status: Status; error: unknown }>({ status: "loading", error: null });
  const [closedPage, setClosedPage] = useState({ loaded: 0, hasMore: false, busy: false });
  const [tick, setTick] = useState(0);
  const pollCtrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const c = new AbortController();
    Promise.all([listMyActiveSupportTickets(c.signal), listMySupportTickets(0, CLOSED_PAGE, c.signal, "closed")])
      .then(([active, closed]) => {
        if (c.signal.aborted) return;
        setMap((cur) => mergeInto(cur, [...closed.items, ...active]));
        setClosedPage({ loaded: closed.items.length, hasMore: closed.hasMore, busy: false });
        setLoad({ status: "ready", error: null });
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setLoad({ status: "error", error: e });
      });
    return () => c.abort();
  }, [tick]);

  const upsertMany = useCallback((items: SupportTicket[]) => {
    if (items.length) setMap((cur) => mergeInto(cur, items));
  }, []);

  const upsert = useCallback((tk: SupportTicket) => upsertMany([tk]), [upsertMany]);

  const patch = useCallback((id: string, part: Partial<SupportTicket>) => {
    setMap((cur) => (cur[id] ? { ...cur, [id]: { ...cur[id], ...part } } : cur));
  }, []);

  const poll = useCallback(() => {
    pollCtrl.current?.abort();
    const c = new AbortController();
    pollCtrl.current = c;
    listMySupportTickets(0, RECENT, c.signal)
      .then((p) => {
        if (!c.signal.aborted) upsertMany(p.items);
      })
      .catch(() => {});
  }, [upsertMany]);

  const reload = useCallback(() => {
    setLoad({ status: "loading", error: null });
    setTick((n) => n + 1);
  }, []);

  const loadMoreClosed = useCallback(async () => {
    if (closedPage.busy || !closedPage.hasMore) return;
    setClosedPage((p) => ({ ...p, busy: true }));
    try {
      const p = await listMySupportTickets(closedPage.loaded, CLOSED_PAGE, undefined, "closed");
      upsertMany(p.items);
      setClosedPage((cur) => ({ loaded: cur.loaded + p.items.length, hasMore: p.hasMore && p.items.length > 0, busy: false }));
    } catch {
      setClosedPage((cur) => ({ ...cur, busy: false }));
    }
  }, [closedPage, upsertMany]);

  const list = useMemo(() => Object.values(map).sort(newest), [map]);
  const active = useMemo(() => list.filter(isActiveTicket), [list]);
  const closed = useMemo(() => list.filter((x) => !isActiveTicket(x)), [list]);

  return {
    map,
    active,
    closed,
    status: load.status,
    error: load.error,
    closedMore: closedPage.hasMore,
    closedBusy: closedPage.busy,
    upsert,
    patch,
    poll,
    reload,
    loadMoreClosed,
  };
}
