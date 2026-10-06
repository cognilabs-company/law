"use client";

import { useEffect, useRef } from "react";

const BASE_MS = 20000;
const MAX_MS = 120000;
const GROWTH = 1.5;
const WAKE_GAP_POLL = 8000;
const WAKE_GAP_IDLE = 30000;
const FIRE_CAP_MS = 15000;

export function useAutoRefresh(poll: boolean, refresh: () => unknown): void {
  const ref = useRef(refresh);

  useEffect(() => {
    ref.current = refresh;
  });

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let delay = BASE_MS;
    let last = Date.now();
    let running = false;
    const visible = () => document.visibilityState === "visible";

    const fire = async () => {
      if (!alive || running) return;
      running = true;
      last = Date.now();
      await Promise.race([
        Promise.resolve()
          .then(() => ref.current())
          .catch(() => undefined),
        new Promise((done) => window.setTimeout(done, FIRE_CAP_MS)),
      ]);
      running = false;
    };

    const arm = () => {
      window.clearTimeout(timer);
      if (!alive || !poll || !visible()) return;
      timer = window.setTimeout(() => {
        void fire().then(() => {
          delay = Math.min(MAX_MS, Math.round(delay * GROWTH));
          arm();
        });
      }, delay);
    };

    const wake = () => {
      if (!visible()) {
        window.clearTimeout(timer);
        return;
      }
      delay = BASE_MS;
      if (Date.now() - last >= (poll ? WAKE_GAP_POLL : WAKE_GAP_IDLE)) void fire().then(arm);
      else arm();
    };

    arm();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [poll]);
}
