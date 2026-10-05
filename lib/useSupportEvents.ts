"use client";

import { useEffect, useRef, useState } from "react";
import { onUserSocketResync, subscribeUserEvents, subscribeUserSocketState, userSocketState } from "./userSocket";
import { supportEventOf, type SupportEvent } from "./services/support";

let liveSeen = false;

export function useSupportEvents(handler: (e: SupportEvent) => void, onResync?: () => void) {
  const ref = useRef(handler);
  const resyncRef = useRef(onResync);
  const [online, setOnline] = useState(() => userSocketState() === "online");
  const [live, setLive] = useState(liveSeen);

  useEffect(() => {
    ref.current = handler;
    resyncRef.current = onResync;
  });

  useEffect(() => {
    const offEv = subscribeUserEvents((raw) => {
      const e = supportEventOf(raw);
      if (!e) return;
      if (!liveSeen) {
        liveSeen = true;
        setLive(true);
      }
      ref.current(e);
    });
    const offState = subscribeUserSocketState((s) => setOnline(s === "online"));
    const offSync = onUserSocketResync(() => resyncRef.current?.());
    return () => {
      offEv();
      offState();
      offSync();
    };
  }, []);

  return { online, live: online && live };
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
    return () => window.clearInterval(id);
  }, [ms, enabled]);
}
