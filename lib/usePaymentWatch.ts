"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPayment, eventPaymentId, isTerminal, pollDelayMs, type PayStatus, type PaymentInfo } from "@/lib/services/clickCheckout";
import { subscribeUserEvents, onUserSocketResync } from "@/lib/userSocket";

// Watches one payment until the backend settles it (Click §11, §12):
//   • one read right away, then every 3 s for a minute, then every 10 s;
//   • nothing while the page is hidden, one read the moment it is shown;
//   • a realtime frame about this payment only triggers a REST read;
//   • after 20 minutes it stops ("late") until the client asks again.
// Nothing is ever marked paid here — only GET /payments/{id} says so.

export type PaymentWatch = {
  info: PaymentInfo | null;
  status: PayStatus;
  late: boolean;
  checking: boolean;
  // One read now; a still-open payment is watched again from the start.
  check: () => void;
};

export function usePaymentWatch(paymentId: string, opts: { onSettled?: (info: PaymentInfo) => void } = {}): PaymentWatch {
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [lateFor, setLateFor] = useState("");
  const [checking, setChecking] = useState(false);
  const onSettled = useRef(opts.onSettled);
  useEffect(() => {
    onSettled.current = opts.onSettled;
  });
  const ctl = useRef<{ kick: () => void; restart: () => void } | null>(null);

  useEffect(() => {
    if (!paymentId) return;
    let alive = true;
    let timer = 0;
    let started = Date.now();
    let done = false;
    let inFlight = false;
    let again = false;
    let stopped = false;

    const schedule = () => {
      window.clearTimeout(timer);
      if (!alive || done || stopped) return;
      const wait = pollDelayMs(Date.now() - started);
      if (wait === null) {
        stopped = true;
        setLateFor(paymentId);
        return;
      }
      timer = window.setTimeout(() => void read(), wait);
    };

    const read = async () => {
      if (!alive || done) return;
      // Paused while hidden; the visibility handler reads on return.
      if (document.visibilityState === "hidden") return;
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      setChecking(true);
      try {
        const p = await getPayment(paymentId);
        if (!alive) return;
        setInfo(p);
        if (isTerminal(p.status)) {
          done = true;
          window.clearTimeout(timer);
          setLateFor("");
          onSettled.current?.(p);
          return;
        }
      } catch {
        /* a network blip: the next read tries again */
      } finally {
        inFlight = false;
        if (alive) setChecking(false);
      }
      if (again) {
        again = false;
        void read();
        return;
      }
      schedule();
    };

    const kick = () => {
      if (done) return;
      window.clearTimeout(timer);
      void read();
    };
    const restart = () => {
      if (done) return;
      started = Date.now();
      stopped = false;
      setLateFor("");
      kick();
    };
    ctl.current = { kick, restart };

    const onVisible = () => {
      if (document.visibilityState !== "visible" || done) return;
      // Always one read on return (§11); polling resumes only inside its window.
      window.clearTimeout(timer);
      if (stopped) {
        void getPayment(paymentId)
          .then((p) => {
            if (!alive) return;
            setInfo(p);
            if (isTerminal(p.status)) {
              done = true;
              setLateFor("");
              onSettled.current?.(p);
            }
          })
          .catch(() => undefined);
        return;
      }
      void read();
    };
    const offEvents = subscribeUserEvents((e) => {
      if (eventPaymentId(e) === paymentId) kick();
    });
    const offResync = onUserSocketResync(kick);
    document.addEventListener("visibilitychange", onVisible);
    void read();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      ctl.current = null;
      offEvents();
      offResync();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [paymentId]);

  const check = useCallback(() => ctl.current?.restart(), []);
  // Only this payment's own answer counts; the creation response never says paid.
  const mine = info && info.id === paymentId ? info : null;
  return { info: mine, status: mine?.status ?? "pending", late: lateFor === paymentId, checking, check };
}
