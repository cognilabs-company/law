"use client";

import { useSyncExternalStore } from "react";

export const CCX_THEMES = ["dark", "light"] as const;
export type CcxTheme = (typeof CCX_THEMES)[number];

export const CCX_BACKGROUNDS = ["night", "mirror", "deep", "glow", "plain"] as const;
export type CcxBackground = (typeof CCX_BACKGROUNDS)[number];

export type CcxPrefs = { theme: CcxTheme; bg: CcxBackground; motion: boolean; keys: boolean };

const KEY = "lexgo_ccx_prefs";
const EVENT = "lexgo-ccx-prefs";
const DEFAULTS: CcxPrefs = { theme: "dark", bg: "night", motion: true, keys: true };

let cacheRaw: string | null | undefined;
let cache: CcxPrefs = DEFAULTS;

function parse(raw: string | null): CcxPrefs {
  if (!raw) return DEFAULTS;
  try {
    const d = JSON.parse(raw) as Partial<CcxPrefs>;
    return {
      theme: CCX_THEMES.includes(d.theme as CcxTheme) ? (d.theme as CcxTheme) : DEFAULTS.theme,
      bg: CCX_BACKGROUNDS.includes(d.bg as CcxBackground) ? (d.bg as CcxBackground) : DEFAULTS.bg,
      motion: typeof d.motion === "boolean" ? d.motion : DEFAULTS.motion,
      keys: typeof d.keys === "boolean" ? d.keys : DEFAULTS.keys,
    };
  } catch {
    return DEFAULTS;
  }
}

function read(): CcxPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  cache = parse(raw);
  return cache;
}

export function setCcxPrefs(patch: Partial<CcxPrefs>) {
  const next = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  cacheRaw = undefined;
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

export function useCcxPrefs(): CcxPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
