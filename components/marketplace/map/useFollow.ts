"use client";

import { useEffect, useEffectEvent, useReducer } from "react";
import type { Spot } from "@/lib/services/marketDiscovery";
import { bearingDeg, distanceMeters, trackOnPath, type Track } from "./geoMath";

export { bearingDeg, distanceMeters };

export type FollowFail = "denied" | "unavailable" | "timeout" | "unsupported" | "insecure";
export type Compass = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export const ARRIVED_M = 60;
const COMPASS: readonly Compass[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const MIN_STEP_M = 3;
const MIN_TURN_DEG = 4;

const norm = (d: number) => ((d % 360) + 360) % 360;

export function compassOf(deg: number): Compass {
  return COMPASS[Math.round(norm(deg) / 45) % 8];
}

export type FollowState = {
  point: Spot | null;
  accuracy: number | null;
  heading: number | null;
  meters: number | null;
  bearing: number | null;
  turn: number;
  fail: FollowFail | null;
  path: Spot[] | null;
  along: number | null;
  off: number | null;
};

type Act =
  | { kind: "reset" }
  | { kind: "fix"; point: Spot; accuracy: number | null; course: number | null; dest: Spot; path: Spot[] | null }
  | { kind: "orient"; heading: number; dest: Spot }
  | { kind: "fail"; fail: FollowFail };

type Inner = FollowState & { course: number | null; orient: number | null; track: Track | null };

const BLANK: Inner = { point: null, accuracy: null, heading: null, meters: null, bearing: null, turn: 0, fail: null, path: null, along: null, off: null, course: null, orient: null, track: null };

function unwrap(prev: number, target: number): number {
  const d = ((norm(target) - norm(prev) + 540) % 360) - 180;
  return prev + d;
}

function aim(s: Inner, dest: Spot): Inner {
  if (!s.point) return s;
  const bearing = bearingDeg(s.point, dest);
  const heading = s.orient ?? s.course;
  return { ...s, heading, bearing, meters: distanceMeters(s.point, dest), turn: unwrap(s.turn, bearing - (heading ?? 0)) };
}

function reduce(s: Inner, a: Act): Inner {
  if (a.kind === "reset") return BLANK;
  if (a.kind === "fail") {
    if (a.fail === "timeout" && s.point) return s;
    return s.fail === a.fail ? s : { ...s, fail: a.fail };
  }
  if (a.kind === "orient") {
    if (s.orient !== null && Math.abs(((a.heading - s.orient + 540) % 360) - 180) < MIN_TURN_DEG) return s;
    return aim({ ...s, orient: a.heading }, a.dest);
  }
  if (s.point && distanceMeters(s.point, a.point) < MIN_STEP_M && s.course === a.course && s.fail === null && s.path === a.path) return s;
  const track = a.path && a.path.length >= 2 ? trackOnPath(a.path, a.point, s.path === a.path ? s.track : null) : null;
  return aim({ ...s, point: a.point, accuracy: a.accuracy, course: a.course, fail: null, path: track ? a.path : null, along: track ? track.along : null, off: track ? track.off : null, track }, a.dest);
}

function courseOf(c: GeolocationCoordinates): number | null {
  const h = c.heading;
  const v = c.speed;
  return typeof h === "number" && Number.isFinite(h) && typeof v === "number" && v > 0.6 ? norm(h) : null;
}

function compassHeading(e: DeviceOrientationEvent): number | null {
  const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof ios === "number" && Number.isFinite(ios)) return norm(ios);
  if (e.absolute && typeof e.alpha === "number" && Number.isFinite(e.alpha)) return norm(360 - e.alpha);
  return null;
}

function failOf(code: number): FollowFail {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

export function followSupport(): FollowFail | null {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (!window.navigator?.geolocation?.watchPosition) return "unsupported";
  return null;
}

export function askCompass(): void {
  const D = (typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined) as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (typeof D?.requestPermission !== "function") return;
  try {
    D.requestPermission().catch(() => undefined);
  } catch {}
}

// The screen stays on while the client is being guided. Not every browser has
// the API, and a refusal changes nothing: the trip goes on either way.
type WakeLockHandle = { release: () => Promise<void> };
function keepAwake(): () => void {
  const api = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockHandle> } }).wakeLock;
  if (!api) return () => undefined;
  let lock: WakeLockHandle | null = null;
  let gone = false;
  const take = () => {
    if (gone || document.visibilityState !== "visible") return;
    api.request("screen").then(
      (l) => {
        if (gone) void l.release().catch(() => undefined);
        else lock = l;
      },
      () => undefined,
    );
  };
  take();
  document.addEventListener("visibilitychange", take);
  return () => {
    gone = true;
    document.removeEventListener("visibilitychange", take);
    void lock?.release().catch(() => undefined);
  };
}

export function useFollow({ active, dest, path = null, onLeave }: { active: boolean; dest: Spot | null; path?: Spot[] | null; onLeave: () => void }): FollowState & { reset: () => void } {
  const [s, dispatch] = useReducer(reduce, BLANK);
  const leave = useEffectEvent(() => onLeave());

  useEffect(() => {
    if (!active || !dest) return;
    const blocked = followSupport();
    if (blocked) {
      const t = window.setTimeout(() => dispatch({ kind: "fail", fail: blocked }), 0);
      return () => window.clearTimeout(t);
    }
    const geo = window.navigator.geolocation;
    let watch: number | null = null;
    let late = 0;
    const startWatch = () => {
      if (watch !== null) return;
      try {
        watch = geo.watchPosition(
          (p) => dispatch({ kind: "fix", point: { latitude: p.coords.latitude, longitude: p.coords.longitude }, accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null, course: courseOf(p.coords), dest, path }),
          (e) => dispatch({ kind: "fail", fail: failOf(e?.code ?? 2) }),
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
        );
      } catch {
        late = window.setTimeout(() => dispatch({ kind: "fail", fail: "unavailable" }), 0);
      }
    };
    const stopWatch = () => {
      if (watch !== null) geo.clearWatch(watch);
      watch = null;
    };
    startWatch();
    const awake = keepAwake();
    const onOrient = (e: Event) => {
      const h = compassHeading(e as DeviceOrientationEvent);
      if (h !== null) dispatch({ kind: "orient", heading: h, dest });
    };
    const orientEvent = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(orientEvent, onOrient);
    // A notification or a glance at another app only pauses the trip: no
    // location is read while the page is hidden, and it picks up on return.
    // Leaving the page ends it.
    const onVis = () => {
      if (document.visibilityState === "hidden") stopWatch();
      else startWatch();
    };
    const onPageHide = () => leave();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearTimeout(late);
      stopWatch();
      awake();
      window.removeEventListener(orientEvent, onOrient);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [active, dest, path]);

  const reset = () => dispatch({ kind: "reset" });
  return { point: s.point, accuracy: s.accuracy, heading: s.heading, meters: s.meters, bearing: s.bearing, turn: s.turn, fail: s.fail, path: s.path, along: s.along, off: s.off, reset };
}
