"use client";

import { useEffect, useState } from "react";
import { listSupportQueue, type SupportTicket } from "@/lib/services/support";
import type { Page } from "@/lib/usePaged";
import type { Tab } from "./model";

export type TabCounts = Record<Tab, number | null>;

const NONE: TabCounts = { new: null, mine: null, transferred: null, closed: null };
const SETTLE_MS = 1200;

const totalOf = (p: Promise<Page<SupportTicket>>) =>
  p.then(
    (r) => r.total,
    () => -1,
  );

export function useTabCounts(enabled: boolean, key: number): TabCounts {
  const [counts, setCounts] = useState<TabCounts>(NONE);

  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    const id = window.setTimeout(
      () => {
        void Promise.all([
          totalOf(listSupportQueue({ status: "waiting_operator", offset: 0, limit: 1 }, c.signal)),
          totalOf(listSupportQueue({ status: "reopened", offset: 0, limit: 1 }, c.signal)),
          totalOf(listSupportQueue({ status: "active", assignedToMe: true, offset: 0, limit: 1 }, c.signal)),
          totalOf(listSupportQueue({ status: "transferred", offset: 0, limit: 1 }, c.signal)),
        ]).then(([waiting, reopened, mine, transferred]) => {
          if (c.signal.aborted) return;
          setCounts({
            new: waiting < 0 ? null : waiting + Math.max(0, reopened),
            mine: mine < 0 ? null : mine,
            transferred: transferred < 0 ? null : transferred,
            closed: null,
          });
        });
      },
      key ? SETTLE_MS : 0,
    );
    return () => {
      window.clearTimeout(id);
      c.abort();
    };
  }, [enabled, key]);

  return counts;
}
