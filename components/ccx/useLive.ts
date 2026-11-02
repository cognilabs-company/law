"use client";

import { useEffect } from "react";
import { isUrgentEvent } from "@/lib/services/backend";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";

const LIVE = /^(marketplace\.|crm\.|call_center\.)/;
const DEBOUNCE_MS = 400;

export function useLiveRefresh(load: () => void, everyMs: number) {
  useEffect(() => {
    let soonId = 0;
    void Promise.resolve().then(load);
    const soon = () => {
      window.clearTimeout(soonId);
      soonId = window.setTimeout(load, DEBOUNCE_MS);
    };
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    const poll = window.setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    const off = subscribeUserEvents((e) => {
      const name = String(e.event ?? "");
      if (LIVE.test(name) || isUrgentEvent(name)) soon();
    });
    const offResync = onUserSocketResync(soon);
    return () => {
      window.clearTimeout(soonId);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", tick);
      off();
      offResync();
    };
  }, [load, everyMs]);
}

export function useClock(set: (n: number) => void, everyMs: number) {
  useEffect(() => {
    const id = window.setInterval(() => set(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [set, everyMs]);
}
