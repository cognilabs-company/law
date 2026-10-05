"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { onUserSocketResync, subscribeUserEvents, subscribeUserSocketState, userSocketState } from "./userSocket";
import { mergeSupportEvents, supportEventOf, type SupportEvent } from "./services/support";

const SETTLE_MS = 400;

const keyOf = (e: SupportEvent) => `${e.kind === "assist" ? e.name : e.kind}:${e.ticketId}`;

const subscribeOnline = (cb: () => void) => subscribeUserSocketState(() => cb());
const readOnline = () => userSocketState() === "online";
const serverOnline = () => false;

export function useSocketOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, readOnline, serverOnline);
}

export function useSupportEvents(handler: (e: SupportEvent) => void, onResync?: () => void) {
  const ref = useRef(handler);
  const resyncRef = useRef(onResync);
  const online = useSocketOnline();

  useEffect(() => {
    ref.current = handler;
    resyncRef.current = onResync;
  });

  useEffect(() => {
    const pending = new Map<string, { e: SupportEvent; timer: number }>();
    const offEv = subscribeUserEvents((raw) => {
      const e = supportEventOf(raw);
      if (!e) return;
      const key = keyOf(e);
      const prev = pending.get(key);
      if (prev) window.clearTimeout(prev.timer);
      const merged = prev ? mergeSupportEvents(prev.e, e) : e;
      const timer = window.setTimeout(() => {
        pending.delete(key);
        ref.current(merged);
      }, SETTLE_MS);
      pending.set(key, { e: merged, timer });
    });
    const offSync = onUserSocketResync(() => resyncRef.current?.());
    return () => {
      offEv();
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
