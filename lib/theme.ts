"use client";

import { useSyncExternalStore } from "react";
import { DARK_MQ, THEME_KEY } from "./themeScript";

// Light / dark theme. The user's choice ("light" | "dark" | "system") lives in
// localStorage; <html data-theme> always holds the resolved "light" | "dark"
// that globals.css keys off. The inline THEME_SCRIPT sets it before the first
// paint, so a dark page never flashes white on load.

export type ThemePref = "light" | "dark" | "system";
const CHANGE = "lexgo-theme-change";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DARK_MQ).matches;
}

function resolve(pref: ThemePref): "light" | "dark" {
  return pref === "dark" || (pref === "system" && systemDark()) ? "dark" : "light";
}

// Writes the resolved theme onto <html>. With `animate`, colors ease for a
// moment instead of snapping (skipped for reduced motion).
export function applyTheme(pref: ThemePref, animate = false) {
  const root = document.documentElement;
  const next = resolve(pref);
  if (root.getAttribute("data-theme") === next) return;
  const ease = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (ease) root.classList.add("theme-anim");
  root.setAttribute("data-theme", next);
  root.style.colorScheme = next;
  if (ease) window.setTimeout(() => root.classList.remove("theme-anim"), 350);
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage blocked: the choice still applies to this page */
  }
  applyTheme(pref, true);
  window.dispatchEvent(new Event(CHANGE));
}

// Keeps <html> in step with the OS setting (for "system") and with a choice
// made in another tab. Mounted once in the locale layout.
export function subscribeTheme(cb: () => void): () => void {
  const mq = window.matchMedia(DARK_MQ);
  const onSystem = () => {
    applyTheme(readPref(), true);
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== THEME_KEY) return;
    applyTheme(readPref(), true);
    cb();
  };
  mq.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE, cb);
  return () => {
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE, cb);
  };
}

// Current preference; "system" on the server and during hydration.
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribeTheme, readPref, () => "system");
}
