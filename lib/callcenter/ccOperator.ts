"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export const CC_STATUSES = ["available", "busy", "break", "wrap"] as const;
export type CcStatus = (typeof CC_STATUSES)[number];

export type CcShift = {
  status: CcStatus;
  since: number;
  shiftStart: number;
  day: string;
};

const KEY = "lexgo_cc_shift";
const EVENT = "lexgo-cc-shift";

const today = () => new Date().toISOString().slice(0, 10);

function fresh(now: number): CcShift {
  return { status: "available", since: now, shiftStart: now, day: today() };
}

function parse(raw: string | null, now: number): CcShift {
  if (!raw) return fresh(now);
  try {
    const d = JSON.parse(raw) as Partial<CcShift>;
    const status = CC_STATUSES.includes(d.status as CcStatus) ? (d.status as CcStatus) : "available";
    const day = typeof d.day === "string" ? d.day : "";
    if (day !== today()) return fresh(now);
    const shiftStart = Number(d.shiftStart) || now;
    const since = Number(d.since) || now;
    return { status, since, shiftStart, day };
  } catch {
    return fresh(now);
  }
}

let cache: CcShift | null = null;
let cacheRaw: string | null = null;

function read(): CcShift {
  if (typeof window === "undefined") return fresh(0);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (cache && raw === cacheRaw) return cache;
  cacheRaw = raw;
  cache = parse(raw, Date.now());
  return cache;
}

function write(next: CcShift) {
  cache = next;
  cacheRaw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, cacheRaw);
  } catch {
    cacheRaw = null;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function setCcStatus(status: CcStatus) {
  const cur = read();
  if (cur.status === status) return;
  write({ ...cur, status, since: Date.now() });
}

export function startCcShift() {
  const cur = read();
  if (cur.day === today()) return;
  write(fresh(Date.now()));
}

function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

const SERVER: CcShift = { status: "available", since: 0, shiftStart: 0, day: "" };

export function useCcShift(): CcShift {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}

export function useCcNow(stepMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);
  return now;
}

export function shiftClock(shiftStart: number, now: number): string {
  if (!shiftStart || now < shiftStart) return "0:00";
  const mins = Math.floor((now - shiftStart) / 60000);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}
