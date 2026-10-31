"use client";

import { useEffect, useState } from "react";
import { isAborted, logApiError } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { getOrderPayouts, type Payout, type PlannedStage, type Settlement } from "@/lib/services/payouts";

// The seller's own payout data for one order (GET …/financials), read once
// for the whole page: the payout stages card and the checklist's stage
// groups show the same rows. Re-read when the order or its checklist moves
// (refreshKey), on the payout events (marketplace.payout_created,
// payout_paid, payout_required — backend answers 2026-10-31 §1.10) and the
// checklist, completion and complaint events, and once after the socket
// reconnects. No polling: the backend tells us.
export type OrderPayouts = { rows: Payout[]; plan: PlannedStage[]; settlement: Settlement | null; ready: boolean; failed: boolean };

const EMPTY: OrderPayouts = { rows: [], plan: [], settlement: null, ready: false, failed: false };
export const PAYOUT_LIVE = /^marketplace\.(payout_|checklist_updated|order_completed|complaint_)/;

export function useOrderPayouts(orderId: string, refreshKey: string, enabled: boolean): OrderPayouts {
  const [got, setGot] = useState<{ id: string; data: OrderPayouts } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !orderId) return;
    const ctl = new AbortController();
    getOrderPayouts(orderId, ctl.signal)
      .then((r) => setGot({ id: orderId, data: { rows: r.rows, plan: r.plan, settlement: r.settlement, ready: true, failed: false } }))
      .catch((e) => {
        if (isAborted(e)) return;
        logApiError("order.payouts", e);
        // A failed re-read keeps what was shown; a failed first read shows nothing.
        setGot((cur) => (cur && cur.id === orderId && !cur.data.failed ? { id: orderId, data: { ...cur.data, ready: true } } : { id: orderId, data: { ...EMPTY, ready: true, failed: true } }));
      });
    return () => ctl.abort();
  }, [orderId, refreshKey, tick, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const off = subscribeUserEvents((e) => {
      if (PAYOUT_LIVE.test(String(e.event ?? ""))) setTick((n) => n + 1);
    });
    const offResync = onUserSocketResync(() => setTick((n) => n + 1));
    return () => {
      off();
      offResync();
    };
  }, [enabled]);

  return enabled && got && got.id === orderId ? got.data : EMPTY;
}
