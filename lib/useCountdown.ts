"use client";

import { useEffect, useRef, useState } from "react";

// Seconds left until a backend deadline, redrawn each second; `onZero`
// runs once when it passes. The deadline itself is never moved here.
export function useCountdown(deadline: string, onZero?: () => void): number | null {
  const [now, setNow] = useState(() => Date.now());
  const zero = useRef(onZero);
  useEffect(() => {
    zero.current = onZero;
  });
  const end = deadline ? Date.parse(deadline) : NaN;
  useEffect(() => {
    if (!Number.isFinite(end)) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= end) {
        window.clearInterval(id);
        zero.current?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [end]);
  return Number.isFinite(end) ? Math.max(0, Math.round((end - now) / 1000)) : null;
}

export const clockOf = (s: number | null): string => (s === null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
