"use client";

import { useCallback, useEffect, useState } from "react";
import { listApprovalRoutes, studioErrorOf } from "@/lib/services/studio";

export type RoutesProbe = { phase: "off" | "loading" | "open" | "denied" | "error"; count: number | null; recheck: () => void };

type State = { round: number; phase: "open" | "denied" | "error"; count: number | null };

export function useRoutesProbe(enabled: boolean): RoutesProbe {
  const [round, setRound] = useState(0);
  const [st, setSt] = useState<State | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    listApprovalRoutes()
      .then((board) => {
        if (alive) setSt({ round, phase: "open", count: board.items.length });
      })
      .catch((e) => {
        if (!alive) return;
        const se = studioErrorOf(e);
        setSt({ round, phase: se.kind === "forbidden" || se.status === 403 ? "denied" : "error", count: null });
      });
    return () => {
      alive = false;
    };
  }, [enabled, round]);

  const recheck = useCallback(() => setRound((n) => n + 1), []);

  if (!enabled) return { phase: "off", count: null, recheck };
  if (!st || st.round !== round) return { phase: "loading", count: null, recheck };
  return { phase: st.phase, count: st.count, recheck };
}
