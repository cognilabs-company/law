"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { whenConsented } from "@/lib/consent";
import { flush, screenOf, setScreen, touchSession, track } from "@/lib/productAnalytics";

// Page-level product analytics: app_opened once per page load, a
// screen_viewed per route, session upkeep, and the queue sent on page exit.
// Everything waits for the visitor's "analytics" cookie choice.
export default function ProductAnalytics() {
  const path = usePathname() ?? "/";
  const opened = useRef(false);

  useEffect(() => {
    return whenConsented("analytics", () => {
      if (opened.current) return;
      opened.current = true;
      track("app_opened", { screen: screenOf(window.location.pathname) });
    });
  }, []);

  const shown = useRef("");
  useEffect(() => {
    if (shown.current === path) return; // StrictMode re-runs effects in development
    shown.current = path;
    const screen = screenOf(path);
    setScreen(screen);
    track("screen_viewed", { screen });
  }, [path]);

  useEffect(() => {
    let last = 0;
    const active = () => {
      const now = Date.now();
      if (now - last < 30_000) return;
      last = now;
      touchSession();
    };
    const leave = () => void flush(true);
    const hidden = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    window.addEventListener("pointerdown", active, { passive: true });
    window.addEventListener("keydown", active);
    window.addEventListener("scroll", active, { passive: true });
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
      window.removeEventListener("scroll", active);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  return null;
}
