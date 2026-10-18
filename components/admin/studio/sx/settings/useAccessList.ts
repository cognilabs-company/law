"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { asDict } from "@/lib/http";
import { listStudioAccess, type StudioAccessGrant } from "@/lib/services/studio";

export type AccessPhase = "loading" | "ready" | "error";
export type AccessState = { phase: AccessPhase; items: StudioAccessGrant[]; known: boolean; error: unknown };

const LIST_KEYS = ["items", "grants", "access", "users", "data", "results"];

function shapeKnown(raw: unknown, items: readonly StudioAccessGrant[]): boolean {
  const listed = Array.isArray(raw) || LIST_KEYS.some((k) => Array.isArray(asDict(raw)[k]));
  return listed && items.every((g) => Boolean(g.userId));
}

export type AccessList = AccessState & { load: () => Promise<StudioAccessGrant[] | null> };

export function useAccessList(): AccessList {
  const [st, setSt] = useState<AccessState>({ phase: "loading", items: [], known: true, error: null });
  const seq = useRef(0);

  const load = useCallback(async (): Promise<StudioAccessGrant[] | null> => {
    const my = ++seq.current;
    try {
      const res = await listStudioAccess();
      if (my !== seq.current) return null;
      setSt({ phase: "ready", items: res.items, known: shapeKnown(res.raw, res.items), error: null });
      return res.items;
    } catch (e) {
      if (my !== seq.current) return null;
      setSt((cur) => (cur.phase === "ready" ? { ...cur, error: e } : { phase: "error", items: [], known: true, error: e }));
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...st, load };
}
