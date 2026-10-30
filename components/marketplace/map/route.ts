"use client";

import type { NavRoute } from "@/lib/services/mapLocation";

// Opening a backend-built Yandex route (contract: "try app_url first, then
// web_url / fallback_url"). Phones try the Yandex Maps app; if the page is
// still in front a moment later, the app is not installed and the browser
// route opens instead. Desktops have no app: the web route opens in the tab
// prepared on the click (prepared synchronously so no popup blocker stops it).

export type RouteOpen = "app" | "web" | "blocked" | "none";

const APP_WAIT_MS = 1600;

export function isHandheld(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// Called inside the click handler, before any await.
export function prepareRouteTab(): Window | null {
  if (isHandheld()) return null;
  try {
    const w = window.open("", "_blank");
    if (w) w.opener = null;
    return w;
  } catch {
    return null;
  }
}

export function closeRouteTab(w: Window | null): void {
  try {
    w?.close();
  } catch {}
}

export function webRouteOf(r: NavRoute): string {
  return r.webUrl || r.fallbackUrl;
}

export function openRoute(r: NavRoute, tab: Window | null, onWebFallback?: () => void): RouteOpen {
  const web = webRouteOf(r);
  if (isHandheld() && r.appUrl) {
    closeRouteTab(tab);
    const fallback = r.fallbackUrl || r.webUrl;
    let left = false;
    const away = () => {
      if (document.visibilityState === "hidden") left = true;
    };
    document.addEventListener("visibilitychange", away);
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", away);
      if (left || document.visibilityState === "hidden" || !fallback) return;
      onWebFallback?.();
      window.location.assign(fallback);
    }, APP_WAIT_MS);
    window.location.assign(r.appUrl);
    return "app";
  }
  if (!web) {
    closeRouteTab(tab);
    return "none";
  }
  if (tab && !tab.closed) {
    tab.location.href = web;
    return "web";
  }
  const w = window.open(web, "_blank", "noopener,noreferrer");
  return w ? "web" : "blocked";
}
