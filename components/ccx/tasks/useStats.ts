"use client";

import { useEffect, useState } from "react";
import { isAborted } from "@/lib/http";
import { getTaskStats, taskErrorOf, type TaskStats } from "@/lib/services/taskManagement";

type Got = { key: string; stats: TaskStats | null; hidden: boolean };

export function useStats(tick: number, from: string, to: string, assignee: string): { stats: TaskStats | null; hidden: boolean; stale: boolean } {
  const key = `${from}|${to}|${assignee}`;
  const [got, setGot] = useState<Got>({ key: "", stats: null, hidden: false });
  useEffect(() => {
    const c = new AbortController();
    getTaskStats(from && to ? { dateFrom: from, dateTo: to, assignee } : { assignee }, c.signal).then(
      (stats) => setGot({ key, stats, hidden: false }),
      (e) => {
        if (isAborted(e)) return;
        const k = taskErrorOf(e).kind;
        if (k === "forbidden" || k === "missing") setGot({ key, stats: null, hidden: true });
        else setGot((g) => (g.key === key && g.stats ? g : { key, stats: null, hidden: true }));
      },
    );
    return () => c.abort();
  }, [tick, key, from, to, assignee]);
  return { stats: got.stats, hidden: got.hidden, stale: got.key !== key };
}
