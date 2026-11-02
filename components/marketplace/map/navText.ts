"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Spot } from "@/lib/services/marketDiscovery";
import type { NavMode } from "@/lib/services/sellersMap";
import { distanceMeters } from "./useFollow";

export type TurnKey = "straight" | "slightRight" | "right" | "sharpRight" | "back" | "sharpLeft" | "left" | "slightLeft";

const SPEED_MPS: Record<NavMode, number> = { driving: 8.3, walking: 1.33, bicycle: 4, transit: 5 };

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

export function pathRemainM(path: Spot[], at: Spot): number {
  if (path.length < 2) return path.length ? distanceMeters(at, path[0]) : 0;
  const k = Math.cos((at.latitude * Math.PI) / 180);
  let best = { i: 1, q: path[0], d: Number.POSITIVE_INFINITY };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = (b.longitude - a.longitude) * k;
    const dy = b.latitude - a.latitude;
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, ((at.longitude - a.longitude) * k * dx + (at.latitude - a.latitude) * dy) / len)) : 0;
    const q = { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t };
    const d = distanceMeters(q, at);
    if (d < best.d) best = { i, q, d };
  }
  let rest = distanceMeters(best.q, path[best.i]);
  for (let i = best.i + 1; i < path.length; i++) rest += distanceMeters(path[i - 1], path[i]);
  return best.d + rest;
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
