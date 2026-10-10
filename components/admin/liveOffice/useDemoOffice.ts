"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { demoDirectory, seedDemo, stepDemo, type DemoState } from "@/lib/liveOffice/demo";
import type { RawEvent } from "@/lib/liveOffice/model";

const DIRECTORY = demoDirectory();
const MAX_ROWS = 4000;

// Same shape as useOffice, fed by the in-browser demo: one beat every 5–6 s.
export function useDemoOffice(enabled: boolean) {
  const [rows, setRows] = useState<RawEvent[]>([]);
  const [updatedAt, setUpdatedAt] = useState(0);
  const state = useRef<DemoState | null>(null);

  const beat = useCallback(() => {
    if (!state.current) return;
    const now = Date.now();
    const add = stepDemo(state.current, now, Math.random);
    if (add.length) setRows((cur) => (cur.length > MAX_ROWS ? [...cur.slice(-MAX_ROWS / 2), ...add] : [...cur, ...add]));
    setUpdatedAt(now);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = () => {
      timer = setTimeout(() => {
        beat();
        loop();
      }, 5000 + Math.random() * 1000);
    };
    const start = setTimeout(() => {
      const now = Date.now();
      const seeded = seedDemo(now, Math.random);
      state.current = seeded.state;
      setRows(seeded.rows);
      setUpdatedAt(now);
      loop();
    }, 0);
    return () => {
      clearTimeout(start);
      clearTimeout(timer);
    };
  }, [enabled, beat]);

  const reload = useCallback(async () => beat(), [beat]);
  return { rows, dir: DIRECTORY, phase: rows.length ? ("ready" as const) : ("loading" as const), error: null as unknown, updatedAt, busy: false, reload };
}
