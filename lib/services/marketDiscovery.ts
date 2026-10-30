import { NEARBY_RADII, type NearbyRadius } from "@/lib/services/marketRuntime";
import { geoErrorKind } from "@/lib/services/locationShare";

// How the client browses sellers: by specialist, by service, or nearby.
export type NearbyMode = "all" | "services" | "nearby";

export const DEFAULT_NEARBY_RADIUS: NearbyRadius = 10;

export const NEARBY_PARAMS = { mode: "mode", radius: "radius", service: "service" } as const;

export function isNearbyRadius(v: unknown): v is NearbyRadius {
  return typeof v === "number" && (NEARBY_RADII as readonly number[]).includes(v);
}

export function radiusOf(v: unknown): NearbyRadius | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return isNearbyRadius(n) ? n : null;
}

export function modeOf(v: unknown): NearbyMode {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "nearby" || s === "services" ? s : "all";
}

export type NearbyUrlState = { mode: NearbyMode; radius: NearbyRadius; serviceId: string };

export function writeNearbyParams(href: string, s: NearbyUrlState): string {
  const url = new URL(href);
  const p = url.searchParams;
  if (s.mode === "nearby") {
    p.set(NEARBY_PARAMS.mode, "nearby");
    p.set(NEARBY_PARAMS.radius, String(isNearbyRadius(s.radius) ? s.radius : DEFAULT_NEARBY_RADIUS));
    const sid = s.serviceId.trim();
    if (sid) p.set(NEARBY_PARAMS.service, sid);
    else p.delete(NEARBY_PARAMS.service);
  } else {
    if (s.mode === "services") p.set(NEARBY_PARAMS.mode, "services");
    else p.delete(NEARBY_PARAMS.mode);
    p.delete(NEARBY_PARAMS.radius);
    p.delete(NEARBY_PARAMS.service);
  }
  const qs = p.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`;
}

export type Spot = { latitude: number; longitude: number };

export function roundCoord(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export type GeoFailure = "denied" | "unavailable" | "timeout" | "insecure" | "unsupported";

const GEO_FAILURES: readonly GeoFailure[] = ["denied", "unavailable", "timeout", "insecure", "unsupported"];

export function geoFailureOf(e: unknown): GeoFailure {
  if (e && typeof e === "object" && "kind" in e) {
    const k = (e as { kind: unknown }).kind;
    if (typeof k === "string" && (GEO_FAILURES as readonly string[]).includes(k)) return k as GeoFailure;
  }
  const kind = geoErrorKind(e);
  return (GEO_FAILURES as readonly string[]).includes(kind) ? (kind as GeoFailure) : "unavailable";
}

export type ApproxDistance = { unit: "m" | "km"; value: number };

export function approxDistance(km: number | null): ApproxDistance | null {
  if (km === null || typeof km !== "number" || !Number.isFinite(km) || km < 0) return null;
  const m = km * 1000;
  if (m < 975) return { unit: "m", value: Math.max(50, Math.round(m / 50) * 50) };
  if (km < 10) return { unit: "km", value: Math.max(1, Math.round(km * 10) / 10) };
  return { unit: "km", value: Math.round(km) };
}

export function precisionMeters(precision: string): number {
  const hit = /(\d+)\s*m/.exec(precision || "");
  const n = hit ? Number(hit[1]) : 0;
  return n > 0 ? n : 50;
}
