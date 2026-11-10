"use client";

import { useEffect, useState } from "react";
import { getCockpit, type Cockpit } from "@/lib/services/cockpit";
import { getCallCenterQueue, listAssignedUrgentRequests, type QueueItem, type UrgentRequest } from "@/lib/services/backend";
import { isAborted } from "@/lib/http";
import { urgentStage } from "@/lib/urgentStage";

const REFRESH_MS = 60000;
// The Hozir page asks the cockpit for this many items per lane.
export const NOW_COCKPIT_LIMIT = 8;

// The Hozir badge counts exactly the jobs the Hozir page lists: every queue
// row plus the cockpit items it shows (not the cockpit's platform-wide
// total, which counted 62 while the page listed 58).
export const nowJobCount = (queue: readonly QueueItem[] | null, cockpit: Pick<Cockpit, "lanes"> | null): number =>
  (queue?.length ?? 0) + (cockpit?.lanes.reduce((n, l) => n + l.items.length, 0) ?? 0);

// A duty lawyer's Hozir is "My urgent work" with its "active" filter.
export const dutyJobCount = (items: readonly Pick<UrgentRequest, "status">[]): number => items.filter((r) => urgentStage(r) === "active").length;

export function useCcOpen(enabled: boolean, duty = false): number | null {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const ctrl = new AbortController();
    const load = () => {
      if (document.visibilityState !== "visible") return;
      if (duty) {
        listAssignedUrgentRequests({})
          .then((items) => {
            if (alive) setTotal(dutyJobCount(items));
          })
          .catch(() => {
            if (alive) setTotal(null);
          });
        return;
      }
      void Promise.allSettled([getCockpit(NOW_COCKPIT_LIMIT, ctrl.signal), getCallCenterQueue()]).then(([c, q]) => {
        if (!alive) return;
        if (c.status === "rejected" && q.status === "rejected") {
          if (!isAborted(c.reason)) setTotal(null);
          return;
        }
        setTotal(nowJobCount(q.status === "fulfilled" ? q.value : null, c.status === "fulfilled" ? c.value : null));
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
  }, [enabled, duty]);

  return total;
}
