"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAborted } from "@/lib/http";
import { isActiveTicket, listMySupportTickets, ticketActivity, type SupportTicket } from "@/lib/services/support";

const ACTIVE_PAGE = 50;
const CLOSED_PAGE = 20;
const RECENT = 30;

type Status = "loading" | "ready" | "error";
type Tab = "active" | "closed";
type Paging = { loaded: number; hasMore: boolean; busy: boolean };

const IDLE: Paging = { loaded: 0, hasMore: false, busy: false };

const newest = (a: SupportTicket, b: SupportTicket) => ticketActivity(b) - ticketActivity(a);

function mergeInto(cur: Record<string, SupportTicket>, items: SupportTicket[], fresh: boolean): Record<string, SupportTicket> {
  const out = { ...cur };
  for (const tk of items) {
    if (!tk.id) continue;
    const old = cur[tk.id];
    out[tk.id] = old ? { ...old, ...tk, unreadCount: fresh ? tk.unreadCount : old.unreadCount } : tk;
  }
  return out;
}

export function useMyChats() {
  const [map, setMap] = useState<Record<string, SupportTicket>>({});
  const [load, setLoad] = useState<{ status: Status; error: unknown }>({ status: "loading", error: null });
  const [pages, setPages] = useState<Record<Tab, Paging>>({ active: IDLE, closed: IDLE });
  const [tick, setTick] = useState(0);
  const pollCtrl = useRef<AbortController | null>(null);
  const counted = useRef(new Set<string>());

  const seed = useCallback((items: SupportTicket[]) => {
    if (items.length) setMap((cur) => mergeInto(cur, items, true));
  }, []);

  useEffect(() => {
    const c = new AbortController();
    Promise.all([listMySupportTickets(0, ACTIVE_PAGE, c.signal, "active"), listMySupportTickets(0, CLOSED_PAGE, c.signal, "closed")])
      .then(([active, closed]) => {
        if (c.signal.aborted) return;
        seed([...closed.items, ...active.items]);
        setPages({
          active: { loaded: active.items.length, hasMore: active.hasMore, busy: false },
          closed: { loaded: closed.items.length, hasMore: closed.hasMore, busy: false },
        });
        setLoad({ status: "ready", error: null });
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setLoad({ status: "error", error: e });
      });
    return () => c.abort();
  }, [tick, seed]);

  const upsert = useCallback((tk: SupportTicket) => {
    if (tk.id) setMap((cur) => mergeInto(cur, [tk], false));
  }, []);

  const patch = useCallback((id: string, part: Partial<SupportTicket>) => {
    setMap((cur) => (cur[id] ? { ...cur, [id]: { ...cur[id], ...part } } : cur));
  }, []);

  const bump = useCallback((id: string, messageId: string) => {
    if (messageId) {
      if (counted.current.has(messageId)) return;
      counted.current.add(messageId);
    }
    setMap((cur) => (cur[id] ? { ...cur, [id]: { ...cur[id], unreadCount: cur[id].unreadCount + 1 } } : cur));
  }, []);

  const clearUnread = useCallback((id: string) => {
    if (!id) return;
    setMap((cur) => (cur[id] && cur[id].unreadCount ? { ...cur, [id]: { ...cur[id], unreadCount: 0 } } : cur));
  }, []);

  const poll = useCallback(() => {
    pollCtrl.current?.abort();
    const c = new AbortController();
    pollCtrl.current = c;
    listMySupportTickets(0, RECENT, c.signal)
      .then((p) => {
        if (!c.signal.aborted) seed(p.items);
      })
      .catch(() => {});
  }, [seed]);

  const reload = useCallback(() => {
    setLoad({ status: "loading", error: null });
    setTick((n) => n + 1);
  }, []);

  const loadMore = useCallback(
    async (tab: Tab) => {
      const pg = pages[tab];
      if (pg.busy || !pg.hasMore) return;
      setPages((cur) => ({ ...cur, [tab]: { ...cur[tab], busy: true } }));
      try {
        const p = await listMySupportTickets(pg.loaded, tab === "active" ? ACTIVE_PAGE : CLOSED_PAGE, undefined, tab);
        seed(p.items);
        setPages((cur) => ({ ...cur, [tab]: { loaded: cur[tab].loaded + p.items.length, hasMore: p.hasMore && p.items.length > 0, busy: false } }));
      } catch {
        setPages((cur) => ({ ...cur, [tab]: { ...cur[tab], busy: false } }));
      }
    },
    [pages, seed],
  );

  const list = useMemo(() => Object.values(map).sort(newest), [map]);
  const active = useMemo(() => list.filter(isActiveTicket), [list]);
  const closed = useMemo(() => list.filter((x) => !isActiveTicket(x)), [list]);

  return {
    map,
    active,
    closed,
    status: load.status,
    error: load.error,
    more: { active: pages.active.hasMore, closed: pages.closed.hasMore },
    busy: { active: pages.active.busy, closed: pages.closed.busy },
    upsert,
    patch,
    bump,
    clearUnread,
    poll,
    reload,
    loadMore,
  };
}
