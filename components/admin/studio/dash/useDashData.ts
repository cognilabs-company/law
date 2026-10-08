"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseServerTime } from "@/lib/http";
import { listStudioObjects, type StudioObject, type StudioStatus } from "@/lib/services/studio";

export const COUNT_LIMIT = 100;
export const MINE_SHOWN = 5;
const MINE_FETCH = 30;

export const COUNT_STATUSES = ["draft", "submitted", "in_review", "approved", "published", "changes_requested"] as const satisfies readonly StudioStatus[];
export type CountStatus = (typeof COUNT_STATUSES)[number];
export type StatusCount = { n: number; capped: boolean } | null;

export type DashData = {
  phase: "loading" | "ready" | "error";
  counts: Record<CountStatus, StatusCount>;
  perCode: Record<string, number> | null;
  mine: StudioObject[];
  mineError: unknown;
  error: unknown;
};

const EMPTY_COUNTS: Record<CountStatus, StatusCount> = {
  draft: null,
  submitted: null,
  in_review: null,
  approved: null,
  published: null,
  changes_requested: null,
};

const INITIAL: DashData = { phase: "loading", counts: EMPTY_COUNTS, perCode: null, mine: [], mineError: null, error: null };

const timeOf = (o: StudioObject) => {
  const n = parseServerTime(o.updatedAt || o.createdAt);
  return Number.isFinite(n) ? n : 0;
};

export function sumCounts(...list: StatusCount[]): StatusCount {
  const known = list.filter((c): c is { n: number; capped: boolean } => c !== null);
  if (!known.length) return null;
  return { n: known.reduce((a, c) => a + c.n, 0), capped: known.some((c) => c.capped) };
}

export function useDashData(): DashData & { busy: boolean; reload: () => Promise<void> } {
  const [data, setData] = useState<DashData>(INITIAL);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const [lists, mineRes] = await Promise.all([
      Promise.allSettled(COUNT_STATUSES.map((s) => listStudioObjects({ status: s, limit: COUNT_LIMIT, offset: 0 }))),
      listStudioObjects({ assignedToMe: true, limit: MINE_FETCH, offset: 0 }).then(
        (r) => ({ ok: true as const, items: r.items }),
        (e: unknown) => ({ ok: false as const, error: e }),
      ),
    ]);
    if (my !== seq.current) return;
    const counts: Record<CountStatus, StatusCount> = { ...EMPTY_COUNTS };
    const perCode: Record<string, number> = {};
    let exact = true;
    let firstError: unknown = null;
    COUNT_STATUSES.forEach((s, i) => {
      const r = lists[i];
      if (r.status === "rejected") {
        exact = false;
        firstError = firstError ?? r.reason;
        return;
      }
      const { items, total } = r.value;
      const matched = items.filter((o) => o.status === s);
      const filtered = matched.length === items.length;
      const full = items.length >= COUNT_LIMIT;
      const n = filtered ? Math.max(total, items.length) : matched.length;
      const capped = full && (!filtered || total <= items.length);
      counts[s] = { n, capped };
      if (capped || n > matched.length) exact = false;
      for (const o of matched) if (o.code) perCode[o.code] = (perCode[o.code] ?? 0) + 1;
    });
    const anyOk = lists.some((r) => r.status === "fulfilled");
    const mine = mineRes.ok
      ? mineRes.items
          .filter((o) => o.status !== "archived")
          .sort((a, b) => timeOf(b) - timeOf(a))
          .slice(0, MINE_SHOWN)
      : [];
    setData({
      phase: anyOk ? "ready" : "error",
      counts,
      perCode: exact ? perCode : null,
      mine,
      mineError: mineRes.ok ? null : mineRes.error,
      error: anyOk ? null : firstError,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  return { ...data, busy, reload };
}
