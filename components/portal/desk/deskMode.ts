"use client";

import { useSyncExternalStore } from "react";

// The lawyer's cabinet can be seen two ways: the classic sidebar layout, or
// as a computer desktop where every section is an app opened in a window.
// Which one is a choice of this browser, so it lives in localStorage and
// both ways stay one click apart for comparing them.

export type DeskMode = "classic" | "desktop";
const KEY = "lexgo_desk_mode";
const EVENT = "lexgo-desk-mode";

function read(): DeskMode {
  try {
    return localStorage.getItem(KEY) === "desktop" ? "desktop" : "classic";
  } catch {
    return "classic";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useDeskMode(): DeskMode {
  return useSyncExternalStore(subscribe, read, () => "classic");
}

export function setDeskMode(mode: DeskMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage blocked: the switch lasts until the page is left */
  }
  window.dispatchEvent(new Event(EVENT));
}

// A page running inside one of the desktop's windows. The frame is named
// lexgo-desk:<id>, a name that survives navigation inside it; the theme
// script marks <html data-desk-embed> before the first paint, so the site's
// own chrome never flashes inside a window.
export const DESK_FRAME = "lexgo-desk:";
const embedded = () => document.documentElement.dataset.deskEmbed === "1";
export function useDeskEmbedded(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    embedded,
    () => false,
  );
}
