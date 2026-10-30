"use client";

import { useEffect, useState } from "react";
import { isAborted, logApiError } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import { getOrderPayouts, type Payout, type Settlement } from "@/lib/services/payouts";

// The seller's own payout rows for one order (GET …/financials), read once
// for the whole page: the payout stages card and the checklist's stage
// groups show the same rows. Re-read when the order or its checklist moves
// (refreshKey) and on any payout, checklist, completion or complaint event;
// once the first 30% items are done (watch) and until that payout is paid
// or stopped, also every POLL_MS, so a transfer that lands without an event
// still turns to "paid".
export type OrderPayouts = { rows: Payout[]; settlement: Settlement | null; ready: boolean };

const EMPTY: OrderPayouts = { rows: [], settlement: null, ready: false };
const POLL_MS = 15_000;
// The 30% payout's states that will not move on their own.
const SETTLED = new Set(["paid", "failed", "recovery", "review", "held"]);
const LIVE = /^marketplace\.(payout_|checklist_updated|order_completed|complaint_)/;

export function useOrderPayouts(orderId: string, refreshKey: string, enabled: boolean, watch = false): OrderPayouts {
  const [got, setGot] = useState<{ id: string; data: OrderPayouts } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !orderId) return;
    const ctl = new AbortController();
    getOrderPayouts(orderId, ctl.signal)
      .then((r) => setGot({ id: orderId, data: { rows: r.rows, settlement: r.settlement, ready: true } }))
      .catch((e) => {
        if (isAborted(e)) return;
        logApiError("order.payouts", e);
        setGot((cur) => (cur && cur.id === orderId ? { id: orderId, data: { ...cur.data, ready: true } } : { id: orderId, data: { ...EMPTY, ready: true } }));
      });
    return () => ctl.abort();
  }, [orderId, refreshKey, tick, enabled]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeUserEvents((e) => {
      if (LIVE.test(String(e.event ?? ""))) setTick((n) => n + 1);
    });
  }, [enabled]);

  const firstStatus = got && got.id === orderId ? got.data.rows.find((r) => r.stage === "checklist")?.status : undefined;
  const polling = enabled && watch && !(firstStatus && SETTLED.has(firstStatus));
  useEffect(() => {
    if (!polling) return;
    const iv = window.setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => window.clearInterval(iv);
  }, [polling]);

  return enabled && got && got.id === orderId ? got.data : EMPTY;
}
