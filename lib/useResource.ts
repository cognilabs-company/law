"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ResStatus = "loading" | "ready" | "error";
export type Resource<T> = {
  status: ResStatus;
  data: T[];
  // Refetch in the background: the current data stays on screen (no skeleton)
  // and is swapped once the new list arrives. Errors keep the old data.
  refresh: () => Promise<void>;
  // Optimistic local update (e.g. a kanban card moved before the server
  // confirms). Pair with refresh() afterwards.
  setData: (next: T[] | ((cur: T[]) => T[])) => void;
};

const sameDeps = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

// Load a backend list. No mock fallback — callers render loading / empty /
// error states from the returned status.
export function useResource<T>(
  fetcher: () => Promise<T[]>,
  deps: unknown[] = [],
): Resource<T> {
  const [res, setRes] = useState<{ status: ResStatus; data: T[] }>({ status: "loading", data: [] });
  // Back to "loading" as soon as the deps change (during render, not in the
  // effect, so there is no extra cascading render).
  const [prevDeps, setPrevDeps] = useState(deps);
  if (!sameDeps(prevDeps, deps)) {
    setPrevDeps(deps);
    setRes({ status: "loading", data: [] });
  }
  const fetcherRef = useRef(fetcher);
  const alive = useRef(true);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    fetcher()
      .then((d) => current && alive.current && setRes({ status: "ready", data: d }))
      .catch(() => current && alive.current && setRes({ status: "error", data: [] }));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  const refresh = useCallback(
    () =>
      fetcherRef
        .current()
        .then((d) => {
          if (alive.current) setRes({ status: "ready", data: d });
        })
        .catch(() => {
          /* keep what is on screen */
        }),
    [],
  );
  const setData = useCallback((next: T[] | ((cur: T[]) => T[])) => {
    setRes((r) => ({ status: "ready", data: typeof next === "function" ? next(r.data) : next }));
  }, []);
  return { ...res, refresh, setData };
}

// Load a single backend object (e.g. /auth/me). null while loading / on error.
export function useResourceOne<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): { status: ResStatus; data: T | null } {
  const [res, setRes] = useState<{ status: ResStatus; data: T | null }>({
    status: "loading",
    data: null,
  });
  const [prevDeps, setPrevDeps] = useState(deps);
  if (!sameDeps(prevDeps, deps)) {
    setPrevDeps(deps);
    setRes({ status: "loading", data: null });
  }
  useEffect(() => {
    let alive = true;
    fetcher()
      .then((d) => alive && setRes({ status: "ready", data: d }))
      .catch(() => alive && setRes({ status: "error", data: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return res;
}
