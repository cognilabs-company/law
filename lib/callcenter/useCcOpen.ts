"use client";

import { useEffect, useState } from "react";
import { getCockpit } from "@/lib/services/cockpit";
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
      getCockpit(1, ctrl.signal)
        .then((c) => alive && setTotal(c.totalOpen))
        .catch((e: unknown) => {
          if (!alive || isAborted(e)) return;
          setTotal(null);
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
