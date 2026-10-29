"use client";

import { useSyncExternalStore } from "react";

export type CcTheme = "dark" | "light";

const KEY = "lexgo_cc_theme";
const EVENT = "lexgo-cc-theme";

function read(): CcTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function setCcTheme(next: CcTheme) {
  try {
    if (next === "dark") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {

  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function useCcTheme(): CcTheme {
  return useSyncExternalStore(subscribe, read, () => "dark");
}
