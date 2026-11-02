"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Spot } from "@/lib/services/marketDiscovery";
import type { RouteManeuver, RouteStep } from "@/lib/services/mapLocation";
import type { LngLat, NavMode } from "@/lib/services/sellersMap";
import { bearingDeg, distanceMeters, pathLength, snapOnPath } from "./geoMath";
import { ARRIVED_M } from "./useFollow";

export type TurnKey = "straight" | "slightRight" | "right" | "sharpRight" | "back" | "sharpLeft" | "left" | "slightLeft";

const SPEED_MPS: Record<NavMode, number> = { driving: 8.3, walking: 1.33, bicycle: 4, transit: 5 };

export const TURN_OF: Record<RouteManeuver, TurnKey> = {
  straight: "straight",
  slight_left: "slightLeft",
  left: "left",
  sharp_left: "sharpLeft",
  slight_right: "slightRight",
  right: "right",
  sharp_right: "sharpRight",
  uturn: "back",
  roundabout: "straight",
  arrive: "straight",
};

export function turnKeyOf(rel: number): TurnKey {
  const a = ((((rel % 360) + 540) % 360) - 180);
  const m = Math.abs(a);
  if (m < 22) return "straight";
  if (m > 158) return "back";
  const side = a > 0 ? "Right" : "Left";
  if (m < 60) return `slight${side}` as TurnKey;
  if (m < 120) return side === "Right" ? "right" : "left";
  return `sharp${side}` as TurnKey;
}

const spotOf = (p: LngLat): Spot => ({ latitude: p[1], longitude: p[0] });

export function maneuverOfTurn(before: LngLat[], after: LngLat[]): RouteManeuver | null {
  if (before.length < 2 || after.length < 2) return null;
  const incoming = bearingDeg(spotOf(before[before.length - 2]), spotOf(before[before.length - 1]));
  const outgoing = bearingDeg(spotOf(after[0]), spotOf(after[1]));
  const delta = ((outgoing - incoming + 540) % 360) - 180;
  const m = Math.abs(delta);
  if (m < 15) return "straight";
  if (m >= 165) return "uturn";
  const side = delta > 0 ? "right" : "left";
  if (m < 40) return `slight_${side}`;
  if (m < 120) return side;
  return `sharp_${side}`;
}

export function pathRemainM(path: Spot[], at: Spot): number {
  if (path.length < 2) return path.length ? distanceMeters(at, path[0]) : 0;
  const s = snapOnPath(path, at);
  return s.off + Math.max(0, pathLength(path) - s.along);
}

export const STEP_PASS_M = 10;
const WALK_PASS_M = 2;
export type StepMark = { step: RouteStep; along: number };

export function stepMarks(path: Spot[], steps: RouteStep[]): StepMark[] {
  if (path.length < 2) return [];
  const out: StepMark[] = [];
  let from = 1;
  let last = 0;
  const mark = (step: RouteStep, p: LngLat) => {
    const s = snapOnPath(path, spotOf(p), from, out.length ? last + 1 : 0);
    out.push({ step, along: s.along });
    from = s.seg;
    last = s.along;
  };
  steps.forEach((step, i) => {
    const prev = i > 0 ? steps[i - 1] : null;
    const g = step.geometry;
    if (step.maneuver === "arrive" && i === steps.length - 1 && prev && g.length >= 2 && distanceMeters(spotOf(g[0]), spotOf(g[g.length - 1])) > STEP_PASS_M) {
      const turn = maneuverOfTurn(prev.geometry, g);
      if (turn && turn !== "straight") mark({ ...step, text: "", street: null, maneuver: turn, point: g[0] }, g[0]);
    }
    if (step.point) mark(step, step.point);
  });
  return out;
}

export function nextManeuverAt(marks: StepMark[], here: number): { step: RouteStep; distM: number } | null {
  for (const m of marks) {
    const pass = m.step.mode === "walking" ? WALK_PASS_M : STEP_PASS_M;
    if (m.along - here > pass) return { step: m.step, distM: m.along - here };
  }
  return null;
}

export function nextManeuver(path: Spot[], marks: StepMark[], at: Spot): { step: RouteStep; distM: number } | null {
  if (path.length < 2 || !marks.length) return null;
  return nextManeuverAt(marks, snapOnPath(path, at).along);
}

export function routeRemainM(path: Spot[] | null, len: number, s: { path: Spot[] | null; along: number | null; off: number | null }): number | null {
  if (!path || path.length < 2 || s.path !== path || s.along === null) return null;
  return (s.off ?? 0) + Math.max(0, len - s.along);
}

export function arrivedNear(meters: number | null, routeRemain: number | null, endGap: number): boolean {
  if (meters === null || meters >= ARRIVED_M) return false;
  return routeRemain === null || routeRemain < ARRIVED_M + endGap;
}

export function etaSeconds(remainM: number, mode: NavMode, route: { distanceM: number | null; durationS: number | null } | null): { s: number; sure: boolean } {
  if (route && route.durationS !== null && route.distanceM && route.distanceM > 0) return { s: Math.max(0, (route.durationS * remainM) / route.distanceM), sure: true };
  return { s: remainM / SPEED_MPS[mode], sure: false };
}

export function useDurationText(): (s: number) => string {
  const t = useTranslations("marketMap.dur");
  return (s: number) => {
    const min = Math.max(1, Math.round(s / 60));
    if (min < 60) return t("min", { n: min });
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? t("hourMin", { h, m }) : t("hour", { h });
  };
}

export function useClockText(): (at: number) => string {
  const locale = useLocale();
  return (at: number) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tashkent" }).format(at);
}
