"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

// OTP clock: code expiry, resend cooldown and wrong-code lock, all kept as
// deadlines in whole epoch seconds. Deadlines are written from event handlers
// (never during render) and "now" comes from a 1s clock store, so countdowns
// stay drift-free and react-hooks lint-safe.
export const OTP_RESEND_SEC = 60;

// "m:ss" (or "h:mm:ss" for day-long waits).
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const serverNow = () => 0;
const toSec = (ms: number) => (ms > 0 ? Math.ceil(ms / 1000) : 0);

// Current epoch second, ticking once a second until `endSec` has passed
// (0 = idle, no timer). Timers are throttled in background tabs, so the clock
// is also re-read when the tab becomes visible again.
function useClock(endSec: number): number {
  const subscribe = useCallback(
    (onTick: () => void) => {
      if (!endSec) return () => {};
      const tick = () => {
        onTick();
        if (nowSec() > endSec) clearInterval(id);
      };
      const id = setInterval(tick, 1000);
      document.addEventListener("visibilitychange", onTick);
      return () => {
        clearInterval(id);
        document.removeEventListener("visibilitychange", onTick);
      };
    },
    [endSec],
  );
  return useSyncExternalStore(subscribe, nowSec, serverNow);
}

// Seconds left until `deadlineMs` (epoch ms; 0 or past → 0), re-rendering
// every second while it runs.
export function useDeadline(deadlineMs: number): number {
  const end = toSec(deadlineMs);
  const now = useClock(end);
  return end && now ? Math.max(0, end - now) : 0;
}

type Clock = { expiresAt: number; resendAt: number; blockedUntil: number }; // epoch s, 0 = none
const IDLE: Clock = { expiresAt: 0, resendAt: 0, blockedUntil: 0 };

export function useOtpTimer() {
  const [c, setC] = useState<Clock>(IDLE);
  const now = useClock(Math.max(c.expiresAt, c.resendAt, c.blockedUntil));

  // A new code: restart expiry and the resend cooldown and drop any lock (the
  // new verification has fresh attempts). expiresAtMs 0 = no known expiry.
  const issue = useCallback((expiresAtMs: number) => {
    setC({ expiresAt: toSec(expiresAtMs), resendAt: nowSec() + OTP_RESEND_SEC, blockedUntil: 0 });
  }, []);
  // The server refused a (re)send: wait `sec` before offering it again.
  const cooldown = useCallback((sec: number) => {
    const t = nowSec();
    setC((p) => ({ ...p, resendAt: t + Math.max(0, Math.ceil(sec)) }));
  }, []);
  // Too many wrong codes: no submissions for `sec`.
  const block = useCallback((sec: number) => {
    const t = nowSec();
    setC((p) => ({ ...p, blockedUntil: t + Math.max(0, Math.ceil(sec)) }));
  }, []);
  // The server says the code expired or was superseded.
  const expire = useCallback(() => {
    const t = nowSec();
    setC((p) => ({ ...p, expiresAt: Math.min(p.expiresAt || t, t) }));
  }, []);
  const clear = useCallback(() => setC(IDLE), []);

  const left = (at: number) => (at && now ? Math.max(0, at - now) : 0);
  return {
    expiresIn: left(c.expiresAt),
    resendIn: left(c.resendAt),
    blockedIn: left(c.blockedUntil),
    issued: c.expiresAt > 0,
    expired: c.expiresAt > 0 && now > 0 && c.expiresAt <= now,
    issue,
    cooldown,
    block,
    expire,
    clear,
  };
}
export type OtpTimer = ReturnType<typeof useOtpTimer>;
