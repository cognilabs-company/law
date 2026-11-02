"use client";

import { useEffect, useState } from "react";
import { getCockpit } from "@/lib/services/cockpit";
import { getCallCenterQueue } from "@/lib/services/backend";
import { isAborted } from "@/lib/http";

const REFRESH_MS = 60000;

export function useCcOpen(enabled: boolean): number | null {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const ctrl = new AbortController();
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.allSettled([getCockpit(1, ctrl.signal), getCallCenterQueue()]).then(([c, q]) => {
        if (!alive) return;
        if (c.status === "rejected" && q.status === "rejected") {
          if (!isAborted(c.reason)) setTotal(null);
          return;
        }
        setTotal((c.status === "fulfilled" ? c.value.totalOpen : 0) + (q.status === "fulfilled" ? q.value.length : 0));
      });
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      ctrl.abort();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [enabled]);

  return total;
}
