"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/http";
import { pollDelayMs } from "@/lib/services/clickCheckout";
import { atmosOutcomeOf, getAtmosOrderState, type AtmosOrderState } from "@/lib/services/atmosCheckout";
import { marketSignalOf } from "@/lib/services/marketplace";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";

// Watches one marketplace order until its ATMOS payment settles (ATMOS
// contract, "Payment confirmation"):
//   • GET /marketplace/me/orders/{order_id} is the only answer that counts;
//   • every 3 s for the first minute, then every 10 s, and no more after
//     20 minutes ("late") until the client asks again;
//   • a websocket event about this order, window focus, the page shown
//     again, the network back, or the checkout tab closed → one read now;
//   • it stops once paid, failed or cancelled, and on sign-out (401).
// Nothing is ever marked paid here.

export type AtmosOrderWatch = {
  state: AtmosOrderState | null;
  late: boolean;
  checking: boolean;
  // The session ended (401): nothing more is read.
  ended: boolean;
  // One read now; a still-open payment is watched again from the start.
  check: () => void;
};

export function useAtmosOrderWatch(orderId: string, opts: { paymentId?: string; onSettled?: (s: AtmosOrderState) => void } = {}): AtmosOrderWatch {
  const [state, setState] = useState<AtmosOrderState | null>(null);
  const [lateFor, setLateFor] = useState("");
  const [endedFor, setEndedFor] = useState("");
  const [checking, setChecking] = useState(false);
  const onSettled = useRef(opts.onSettled);
  useEffect(() => {
    onSettled.current = opts.onSettled;
  });
  const paymentId = opts.paymentId ?? "";
  const ctl = useRef<{ restart: () => void } | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    let timer = 0;
    let started = Date.now();
    let done = false;
    let stopped = false;
    let inFlight = false;
    let again = false;
    const ctrl = new AbortController();

    const schedule = () => {
      window.clearTimeout(timer);
      if (!alive || done || stopped) return;
      const wait = pollDelayMs(Date.now() - started);
      if (wait === null) {
        stopped = true;
        setLateFor(orderId);
        return;
      }
      timer = window.setTimeout(() => void read(false), wait);
    };

    // `forced`: a trigger (focus, event, tab closed) reads even after the
    // 20 minutes are over, without restarting the polling.
    const read = async (forced: boolean) => {
      if (!alive || done) return;
      if (!forced && document.visibilityState === "hidden") return;
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      setChecking(true);
      try {
        const s = await getAtmosOrderState(orderId, ctrl.signal);
        if (!alive) return;
        setState(s);
        if (atmosOutcomeOf(s) !== "pending") {
          done = true;
          window.clearTimeout(timer);
          setLateFor("");
          onSettled.current?.(s);
          return;
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          done = true;
          window.clearTimeout(timer);
          if (alive) setEndedFor(orderId);
          return;
        }
        /* a network blip: the next read tries again */
      } finally {
        inFlight = false;
        if (alive) setChecking(false);
      }
      if (again) {
        again = false;
        void read(true);
        return;
      }
      schedule();
    };

    const kick = () => {
      if (!alive || done) return;
      window.clearTimeout(timer);
      void read(true);
    };
    const restart = () => {
      if (done) return;
      started = Date.now();
      stopped = false;
      setLateFor("");
      kick();
    };
    ctl.current = { restart };

    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };
    const offEvents = subscribeUserEvents((ev) => {
      const sig = marketSignalOf(ev);
      const direct = ev as Record<string, unknown>;
      const aboutOrder = (sig && sig.orderId === orderId) || direct.order_id === orderId;
      const aboutPayment = !!paymentId && direct.payment_id === paymentId;
      if (aboutOrder || aboutPayment) kick();
    });
    const offResync = onUserSocketResync(kick);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", kick);
    window.addEventListener("online", kick);
    void read(true);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      ctrl.abort();
      ctl.current = null;
      offEvents();
      offResync();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", kick);
      window.removeEventListener("online", kick);
    };
  }, [orderId, paymentId]);

  const check = useCallback(() => ctl.current?.restart(), []);
  const mine = state && state.orderId === orderId ? state : null;
  return { state: mine, late: lateFor === orderId, checking, ended: endedFor === orderId, check };
}
