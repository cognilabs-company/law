"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Snap<T> = { key: string; tick: number; data: T | null; dataKey: string; error: unknown; at: number };

export type Live<T> = {
  data: T | null;
  loading: boolean;
  changing: boolean;
  refreshing: boolean;
  failed: boolean;
  stale: boolean;
  error: unknown;
  updatedAt: number;
  reload: () => void;
};

export function useLive<T>(fetcher: () => Promise<T>, key: string, enabled = true): Live<T> {
  const [snap, setSnap] = useState<Snap<T>>({ key: "", tick: -1, data: null, dataKey: "", error: null, at: 0 });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetcherRef.current().then(
      (data) => {
        if (live) setSnap({ key, tick, data, dataKey: key, error: null, at: Date.now() });
      },
      (error: unknown) => {
        if (live) setSnap((s) => ({ ...s, key, tick, error: error ?? new Error("failed") }));
      },
    );
    return () => {
      live = false;
    };
  }, [key, tick, enabled]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const settled = snap.key === key && snap.tick === tick;
  const failed = settled && snap.error != null;
  return {
    data: snap.data,
    loading: !settled && snap.data === null,
    changing: !failed && snap.data !== null && snap.dataKey !== key,
    refreshing: enabled && snap.key === key && snap.tick !== tick,
    failed,
    stale: snap.dataKey !== key,
    error: failed ? snap.error : null,
    updatedAt: snap.at,
    reload,
  };
}
