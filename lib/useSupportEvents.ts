"use client";

import { useEffect, useRef, useState } from "react";
import { onUserSocketResync, subscribeUserEvents, subscribeUserSocketState, userSocketState } from "./userSocket";
import { supportEventOf, type SupportEvent } from "./services/support";

const SETTLE_MS = 400;

export function useSupportEvents(handler: (e: SupportEvent) => void, onResync?: () => void) {
  const ref = useRef(handler);
  const resyncRef = useRef(onResync);
  const [online, setOnline] = useState(() => userSocketState() === "online");

  useEffect(() => {
    ref.current = handler;
    resyncRef.current = onResync;
  });

  useEffect(() => {
    const pending = new Map<string, { e: SupportEvent; timer: number }>();
    const offEv = subscribeUserEvents((raw) => {
      const e = supportEventOf(raw);
      if (!e) return;
      const key = `${e.kind}:${e.ticketId}`;
      const prev = pending.get(key);
      if (prev) window.clearTimeout(prev.timer);
      const merged = prev ? { ...e, ticket: e.ticket ?? prev.e.ticket, message: e.message ?? prev.e.message } : e;
      const timer = window.setTimeout(() => {
        pending.delete(key);
        ref.current(merged);
      }, SETTLE_MS);
      pending.set(key, { e: merged, timer });
    });
    const offState = subscribeUserSocketState((s) => setOnline(s === "online"));
    const offSync = onUserSocketResync(() => resyncRef.current?.());
    return () => {
      offEv();
      offState();
      offSync();
      pending.forEach((p) => window.clearTimeout(p.timer));
      pending.clear();
    };
  }, []);

  return { online };
}

export function usePoll(fn: () => void, ms: number, enabled: boolean) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    const id = window.setInterval(tick, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms, enabled]);
}
