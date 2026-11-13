"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAborted } from "@/lib/http";

// One request's state for a page: the last good data stays on screen while
// a reload runs (no skeleton flash), and the error is kept, not swallowed,
// so the page can tell "no permission" (403) from "try again" (5xx).
export type Load<T> = {
  status: "loading" | "ready" | "error";
  data: T | null;
  error: unknown;
  // True while a reload runs over data already shown.
  refreshing: boolean;
  reload: () => void;
};

export function useLoad<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Load<T> {
  const [state, setState] = useState<{ status: Load<T>["status"]; data: T | null; error: unknown; refreshing: boolean }>({ status: "loading", data: null, error: null, refreshing: false });
  const [tick, setTick] = useState(0);
  // A new request starts: mark it during render (not in the effect), keeping
  // what is on screen.
  const key = [...deps, tick];
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey.length !== key.length || prevKey.some((v, i) => !Object.is(v, key[i]))) {
    setPrevKey(key);
    setState((s) => (s.data === null ? { status: "loading", data: null, error: null, refreshing: false } : { ...s, refreshing: true }));
  }
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    const ctl = new AbortController();
    fetcherRef.current(ctl.signal).then(
      (data) => {
        if (!ctl.signal.aborted) setState({ status: "ready", data, error: null, refreshing: false });
      },
      (error: unknown) => {
        if (ctl.signal.aborted || isAborted(error)) return;
        setState((s) => ({ status: "error", data: s.data, error, refreshing: false }));
      },
    );
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}
