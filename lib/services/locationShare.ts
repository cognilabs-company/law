"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { DEFAULT_LOCATION_POLICY, LOCATION_DURATIONS, getLocationSharing, marketErrorInfo, setLocationSharing, type LocationDuration, type LocationPolicy, type LocationShareState } from "@/lib/services/marketRuntime";

export type ShareMode = "off" | "on" | "unknown" | "starting" | "stopping";
export type ShareErrorKind = "denied" | "unavailable" | "timeout" | "insecure" | "unsupported" | "server" | "stop";
export type ShareError = { kind: ShareErrorKind; code: string; message: string };
export type SharePermission = "granted" | "prompt" | "denied" | "unsupported" | "unknown";
export type GeoFix = { latitude: number; longitude: number; accuracy: number; at: number };
export type ServerShare = { enabled: boolean; until: number | null; manual: boolean; updatedAt: number | null; accuracy: number | null; at: number };
export type ShareSnapshot = {
  uid: string;
  mode: ShareMode;
  until: number | null;
  manual: boolean;
  lastSentAt: number | null;
  lastAccuracy: number | null;
  policy: LocationPolicy;
  error: ShareError | null;
  permission: SharePermission;
  server: ServerShare | null;
};

export const SHARE_STORE_KEY = (uid: string): string => `lexgo_loc_share_${uid}`;
export const FIX_MAX_AGE_MS = 60_000;

const HOUR_MS = 3_600_000;
const MAX_TIMER_MS = 2_147_000_000;

class GeoError extends Error {
  kind: ShareErrorKind;
  constructor(kind: ShareErrorKind, message = "") {
    super(message || kind);
    this.name = "GeoError";
    this.kind = kind;
  }
}

const BLANK: ShareSnapshot = {
  uid: "",
  mode: "unknown",
  until: null,
  manual: false,
  lastSentAt: null,
  lastAccuracy: null,
  policy: DEFAULT_LOCATION_POLICY,
  error: null,
  permission: "unknown",
  server: null,
};

let state: ShareSnapshot = BLANK;
let generation = 0;
let inflight: Promise<unknown> | null = null;
let lastAttemptAt: number | null = null;
let runnerToken = 0;
let syncedUid = "";
let syncing: Promise<void> | null = null;
const listeners = new Set<() => void>();

let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockSubs = new Set<() => void>();

function emit(): void {
  clockNow = Date.now();
  for (const fn of [...listeners]) fn();
  for (const fn of [...clockSubs]) fn();
}

function set(patch: Partial<ShareSnapshot>): void {
  state = { ...state, ...patch };
  emit();
}

type Stored = { until: number | null; manual: boolean };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readStored(uid: string): Stored | null | "invalid" {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(SHARE_STORE_KEY(uid));
    if (raw === null) return null;
    const d = JSON.parse(raw) as unknown;
    if (!d || typeof d !== "object") return "invalid";
    const o = d as Record<string, unknown>;
    const until = typeof o.until === "number" && Number.isFinite(o.until) ? o.until : null;
    const manual = o.manual === true;
    if (!manual && until === null) return "invalid";
    return { until: manual ? null : until, manual };
  } catch {
    return "invalid";
  }
}

function writeStored(uid: string, v: Stored): void {
  const s = storage();
  if (!s || !uid) return;
  try {
    s.setItem(SHARE_STORE_KEY(uid), JSON.stringify({ until: v.until, manual: v.manual }));
  } catch {}
}

function clearStored(uid: string): void {
  const s = storage();
  if (!s || !uid) return;
  try {
    s.removeItem(SHARE_STORE_KEY(uid));
  } catch {}
}

function fromStorage(uid: string): ShareSnapshot {
  const base: ShareSnapshot = { ...BLANK, uid };
  const st = readStored(uid);
  if (st === null) return base;
  if (st === "invalid") {
    clearStored(uid);
    return base;
  }
  if (st.manual) return { ...base, mode: "on", manual: true, until: null };
  if (st.until !== null && st.until > Date.now()) return { ...base, mode: "on", until: st.until };
  clearStored(uid);
  return { ...base, mode: "off" };
}

function adopt(uid: string): void {
  if (state.uid === uid) return;
  syncedUid = "";
  syncing = null;
  generation++;
  inflight = null;
  lastAttemptAt = null;
  state = uid ? fromStorage(uid) : BLANK;
}

export function subscribeLocationShare(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function locationShareSnapshot(): ShareSnapshot {
  return state;
}

const serverSnapshot = (): ShareSnapshot => BLANK;

export function useLocationShare(uid: string): ShareSnapshot {
  const snap = useSyncExternalStore(subscribeLocationShare, locationShareSnapshot, serverSnapshot);
  useEffect(() => {
    if (uid && state.uid !== uid) {
      adopt(uid);
      emit();
    }
  }, [uid]);
  return uid && snap.uid === uid ? snap : BLANK;
}

function subscribeClock(fn: () => void): () => void {
  clockSubs.add(fn);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const f of [...clockSubs]) f();
    }, 30_000);
  }
  return () => {
    clockSubs.delete(fn);
    if (!clockSubs.size && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

function clockSnapshot(): number {
  if (!clockNow) clockNow = Date.now();
  return clockNow;
}

const noClock = (): (() => void) => () => undefined;
const zero = (): number => 0;

export function useShareNow(active: boolean): number {
  return useSyncExternalStore(active ? subscribeClock : noClock, active ? clockSnapshot : zero, zero);
}

export function geoErrorKind(e: unknown): ShareErrorKind {
  if (e instanceof GeoError) return e.kind;
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code: unknown }).code;
    if (code === 1) return "denied";
    if (code === 2) return "unavailable";
    if (code === 3) return "timeout";
  }
  return "unavailable";
}

export function readPosition(opts?: { maximumAgeMs?: number; timeoutMs?: number }): Promise<GeoFix> {
  if (typeof window === "undefined") return Promise.reject(new GeoError("unsupported"));
  if (!window.isSecureContext) return Promise.reject(new GeoError("insecure"));
  const geo = window.navigator?.geolocation;
  if (!geo) return Promise.reject(new GeoError("unsupported"));
  return new Promise<GeoFix>((resolve, reject) => {
    try {
      geo.getCurrentPosition(
        (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() }),
        (err) => reject(new GeoError(geoErrorKind(err), err?.message ?? "")),
        { enableHighAccuracy: false, timeout: opts?.timeoutMs ?? 20_000, maximumAge: opts?.maximumAgeMs ?? 0 },
      );
    } catch (e) {
      reject(new GeoError("unavailable", e instanceof Error ? e.message : ""));
    }
  });
}

export async function queryPermission(): Promise<SharePermission> {
  if (typeof window === "undefined" || !window.navigator) return "unknown";
  if (!window.navigator.geolocation) return "unsupported";
  try {
    const perms = window.navigator.permissions;
    if (!perms?.query) return "unknown";
    const r = await perms.query({ name: "geolocation" as PermissionName });
    return r.state === "granted" || r.state === "prompt" || r.state === "denied" ? r.state : "unknown";
  } catch {
    return "unknown";
  }
}

export function refreshHours(remainingMs: number): LocationDuration {
  if (!Number.isFinite(remainingMs)) return null;
  let pick: LocationDuration = LOCATION_DURATIONS[0];
  for (const h of LOCATION_DURATIONS) if (h * HOUR_MS <= remainingMs) pick = h;
  return pick;
}

function serverError(e: unknown, kind: ShareErrorKind): ShareError {
  const info = marketErrorInfo(e);
  return { kind, code: info?.code ?? "", message: info?.message ?? "" };
}

function expiryOf(expiresAt: string, hours: LocationDuration, now: number): number | null {
  if (hours === null) return null;
  const parsed = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(parsed) && parsed > now ? parsed : now + hours * HOUR_MS;
}

function serverOf(res: LocationShareState, now: number): ServerShare {
  const exp = res.expiresAt ? Date.parse(res.expiresAt) : NaN;
  const live = res.enabled && (!Number.isFinite(exp) || exp > now);
  const upd = res.updatedAt ? Date.parse(res.updatedAt) : NaN;
  return {
    enabled: live,
    until: live && Number.isFinite(exp) ? exp : null,
    manual: live && !Number.isFinite(exp),
    updatedAt: Number.isFinite(upd) ? upd : null,
    accuracy: res.accuracyMeters,
    at: now,
  };
}

export function syncLocationShare(uid: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!uid) return Promise.resolve();
  adopt(uid);
  if (!opts.force && syncedUid === uid) return syncing ?? Promise.resolve();
  syncedUid = uid;
  const gen = generation;
  const run = (async () => {
    try {
      const res = await getLocationSharing();
      if (state.uid !== uid) return;
      const server = serverOf(res, Date.now());
      if (gen !== generation || state.mode === "starting" || state.mode === "stopping") {
        set({ server });
        return;
      }
      if (state.mode === "on" && !server.enabled) {
        stopLocally(uid);
        set({ server, policy: res.policy });
        return;
      }
      if (state.mode === "on") {
        const until = state.manual ? state.until : (server.until ?? state.until);
        if (!state.manual && until !== state.until) writeStored(uid, { until, manual: false });
        set({ server, policy: res.policy, until });
        return;
      }
      set({ server, policy: res.policy, mode: state.mode === "unknown" ? "off" : state.mode });
    } catch {
      return;
    }
  })();
  syncing = run;
  return run;
}

export async function startSharing(uid: string, durationHours: LocationDuration, fix: GeoFix): Promise<void> {
  adopt(uid);
  const prev = state.mode === "starting" || state.mode === "stopping" ? "unknown" : state.mode;
  const gen = generation;
  set({ mode: "starting", error: null });
  try {
    const res = await setLocationSharing({ enabled: true, durationHours, latitude: fix.latitude, longitude: fix.longitude, accuracyMeters: fix.accuracy, source: "foreground" });
    if (gen !== generation || state.uid !== uid) return;
    const now = Date.now();
    const manual = durationHours === null;
    const until = expiryOf(res.expiresAt, durationHours, now);
    writeStored(uid, { until, manual });
    lastAttemptAt = now;
    set({ mode: "on", until, manual, policy: res.policy, lastSentAt: now, lastAccuracy: fix.accuracy, error: null, permission: "granted", server: { enabled: true, until, manual, updatedAt: now, accuracy: fix.accuracy, at: now } });
  } catch (e) {
    if (gen === generation && state.uid === uid) set({ mode: prev, error: serverError(e, "server") });
    throw e;
  }
}

export async function stopSharing(uid: string): Promise<boolean> {
  adopt(uid);
  generation++;
  clearStored(uid);
  lastAttemptAt = null;
  set({ mode: "stopping", until: null, manual: false, error: null });
  const pending = inflight;
  if (pending) {
    try {
      await pending;
    } catch {}
  }
  const gen = generation;
  try {
    await setLocationSharing({ enabled: false });
    if (gen === generation && state.uid === uid) set({ mode: "off", error: null, server: state.server ? { ...state.server, enabled: false, until: null, manual: false, at: Date.now() } : null });
    return true;
  } catch (e) {
    if (gen === generation && state.uid === uid) set({ mode: "off", error: serverError(e, "stop") });
    return false;
  }
}

function stopLocally(uid: string): void {
  generation++;
  clearStored(uid);
  lastAttemptAt = null;
  set({ mode: "off", until: null, manual: false });
}

async function expire(uid: string, notice: () => void): Promise<void> {
  if (state.uid !== uid || state.mode !== "on") return;
  stopLocally(uid);
  notice();
  const gen = generation;
  try {
    await setLocationSharing({ enabled: false });
  } catch (e) {
    if (gen === generation && state.uid === uid && !(e instanceof ApiError && (e.status === 401 || e.status === 403))) set({ error: serverError(e, "stop") });
  }
}

async function tick(uid: string, notice: () => void): Promise<void> {
  if (state.uid !== uid || state.mode !== "on" || inflight) return;
  const now = Date.now();
  if (!state.manual && state.until !== null && now >= state.until) {
    await expire(uid, notice);
    return;
  }
  const gen = generation;
  lastAttemptAt = now;
  const run = (async () => {
    const perm = await queryPermission();
    if (gen !== generation) return;
    if (perm === "prompt" || perm === "denied") {
      set({ permission: perm, error: { kind: "denied", code: "", message: "" } });
      return;
    }
    if (perm === "unsupported") {
      set({ permission: perm, error: { kind: "unsupported", code: "", message: "" } });
      return;
    }
    let fix: GeoFix;
    try {
      fix = await readPosition({ maximumAgeMs: 60_000 });
    } catch (e) {
      if (gen === generation) set({ error: { kind: geoErrorKind(e), code: "", message: "" } });
      return;
    }
    if (gen !== generation || state.mode !== "on" || state.uid !== uid) return;
    const at = Date.now();
    const hours = state.manual || state.until === null ? null : refreshHours(state.until - at);
    try {
      const res = await setLocationSharing({ enabled: true, durationHours: hours, latitude: fix.latitude, longitude: fix.longitude, accuracyMeters: fix.accuracy, source: "foreground" });
      if (gen !== generation || state.uid !== uid) return;
      set({ lastSentAt: Date.now(), lastAccuracy: fix.accuracy, policy: res.policy, error: null, permission: perm === "unknown" ? state.permission : perm });
    } catch (e) {
      if (gen !== generation || state.uid !== uid) return;
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        stopLocally(uid);
        return;
      }
      set({ error: serverError(e, "server") });
    }
  })();
  inflight = run;
  try {
    await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function startRunner(uid: string, notice: () => void): () => void {
  const token = ++runnerToken;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const live = () => !stopped && token === runnerToken && state.uid === uid && state.mode === "on";
  const intervalMs = () => Math.max(1, state.policy.foregroundIntervalSec) * 1000;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    clear();
    if (!live()) return;
    timer = setTimeout(fire, Math.min(MAX_TIMER_MS, Math.max(0, ms)));
  };
  const fire = () => {
    timer = null;
    if (!live() || !isVisible()) return;
    void tick(uid, notice).finally(() => {
      if (live() && isVisible()) schedule(intervalMs());
    });
  };
  const resume = () => {
    if (!live()) return;
    const last = lastAttemptAt ?? state.lastSentAt;
    const since = last === null ? Infinity : Date.now() - last;
    if (since >= intervalMs()) fire();
    else schedule(intervalMs() - since);
  };
  const onVisibility = () => {
    if (isVisible()) resume();
    else clear();
  };
  if (!state.manual && state.until !== null) {
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      if (!stopped && token === runnerToken) void expire(uid, notice);
    }, Math.min(MAX_TIMER_MS, Math.max(0, state.until - Date.now())));
  }
  document.addEventListener("visibilitychange", onVisibility);
  if (isVisible()) resume();
  return () => {
    stopped = true;
    clear();
    if (expiryTimer) clearTimeout(expiryTimer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function useLocationRunner(uid: string, enabled: boolean, expiredText?: string): void {
  const s = useLocationShare(uid);
  const active = enabled && !!uid && s.mode === "on";
  const until = s.until;
  const manual = s.manual;
  const interval = s.policy.foregroundIntervalSec;
  useEffect(() => {
    if (!active) return;
    void until;
    void manual;
    void interval;
    return startRunner(uid, () => {
      if (expiredText) notify.info(expiredText);
    });
  }, [active, uid, until, manual, interval, expiredText]);
}

export function resetLocationShare(): void {
  syncedUid = "";
  syncing = null;
  generation++;
  inflight = null;
  lastAttemptAt = null;
  runnerToken++;
  state = BLANK;
  emit();
}
