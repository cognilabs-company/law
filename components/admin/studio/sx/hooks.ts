"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function canMatch(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribeReduced(onChange: () => void): () => void {
  if (!canMatch()) return () => {};
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const serverFalse = () => false;

export function prefersReducedMotion(): boolean {
  return canMatch() && window.matchMedia(REDUCED_QUERY).matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, serverFalse);
}

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return settled;
}

export function enterStyle(i: number, extra?: CSSProperties): CSSProperties {
  return { ...extra, ["--i" as string]: Math.max(0, Math.round(i)) } as CSSProperties;
}

export function useCountUp(target: number | null, duration = 700): number | null {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<number | null>(null);
  const last = useRef(0);
  useEffect(() => {
    if (target === null || reduced) return;
    const start = performance.now();
    const base = last.current;
    let frame = requestAnimationFrame(function tick(now: number) {
      const p = Math.min(1, (now - start) / duration);
      const value = p < 1 ? base + (target - base) * (1 - Math.pow(1 - p, 3)) : target;
      last.current = value;
      setShown(Math.round(value));
      if (p < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);
  if (target === null) return null;
  if (reduced) return target;
  return shown ?? 0;
}
