import type { Spot } from "@/lib/services/marketDiscovery";

const EARTH_M = 6371008.8;
const TRACK_BACK_M = 30;
const TRACK_AHEAD_M = 30;
const TRACK_START_M = 150;
const TRACK_LEAVE_M = 30;

const rad = (d: number) => (d * Math.PI) / 180;
const norm = (d: number) => ((d % 360) + 360) % 360;

export function distanceMeters(a: Spot, b: Spot): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: Spot, b: Spot): number {
  const dLon = rad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(dLon);
  return norm((Math.atan2(y, x) * 180) / Math.PI);
}

export type Snap = { seg: number; q: Spot; off: number; along: number };
export type Track = { along: number; off: number; at: Spot };

function snapWindow(path: Spot[], at: Spot, from = 1, minAlong = 0, maxAlong = Number.POSITIVE_INFINITY): Snap | null {
  const k = Math.cos((at.latitude * Math.PI) / 180);
  const start = Math.max(1, Math.min(from, path.length - 1));
  let best: Snap | null = null;
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const segLen = distanceMeters(a, b);
    if (i >= start && walked <= maxAlong + 1 && walked + segLen >= minAlong - 1) {
      const dx = (b.longitude - a.longitude) * k;
      const dy = b.latitude - a.latitude;
      const len = dx * dx + dy * dy;
      let t = len > 0 ? Math.max(0, Math.min(1, ((at.longitude - a.longitude) * k * dx + (at.latitude - a.latitude) * dy) / len)) : 0;
      if (segLen > 0) {
        const lo = (minAlong - 1 - walked) / segLen;
        const hi = (maxAlong + 1 - walked) / segLen;
        t = Math.max(t, Math.min(1, Math.max(0, lo)));
        t = Math.min(t, Math.max(0, Math.min(1, hi)));
      }
      const q = { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t };
      const off = distanceMeters(q, at);
      if (!best || off < best.off) best = { seg: i, q, off, along: walked + segLen * t };
    }
    walked += segLen;
  }
  return best;
}

export function snapOnPath(path: Spot[], at: Spot, from = 1, minAlong = 0): Snap {
  const s = path.length >= 2 ? snapWindow(path, at, from, minAlong) : null;
  if (s) return s;
  const end = path[path.length - 1] ?? at;
  return { seg: Math.max(1, path.length - 1), q: end, off: distanceMeters(end, at), along: pathLength(path) };
}

export function pathLength(path: Spot[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMeters(path[i - 1], path[i]);
  return total;
}

export function trackOnPath(path: Spot[], at: Spot, prev: Track | null): Track {
  const global = snapOnPath(path, at);
  const lo = prev ? Math.max(0, prev.along - TRACK_BACK_M) : 0;
  const hi = prev ? prev.along + distanceMeters(prev.at, at) + TRACK_AHEAD_M : TRACK_START_M;
  const win = path.length >= 2 ? snapWindow(path, at, 1, lo, hi) : null;
  const use = win && win.off <= global.off + TRACK_LEAVE_M ? win : global;
  return { along: use.along, off: use.off, at };
}
