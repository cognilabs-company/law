"use client";

import { useSyncExternalStore } from "react";
import type { Session } from "@/lib/auth";

// A seller's cabinet can be seen two ways: the classic sidebar layout, or
// as a computer desktop where every section is an app opened in a window.
// Which one is a choice of this browser, so it lives in localStorage and
// both ways stay one click apart for comparing them.

export type DeskMode = "classic" | "desktop";

// The desktop is being tried out with one account first (an advocate,
// LGA-45431074); everyone else keeps the classic cabinet. Matched by the
// account's id, which does not change with its phone number or name.
const DESK_USERS = new Set(["efeb656a-93c5-42fb-aaf0-1f572995e239"]);
export const canUseDesk = (session: Session | null) => !!session?.id && DESK_USERS.has(session.id);

// The desktop is for computers: a mouse or trackpad and a wide screen. A
// phone or a tablet held by touch keeps the classic cabinet, and so does a
// window narrowed below a laptop's width.
const DESKTOP_DEVICE = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
const readDevice = () => window.matchMedia(DESKTOP_DEVICE).matches;
function subscribeDevice(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_DEVICE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
export function useDesktopDevice(): boolean {
  return useSyncExternalStore(subscribeDevice, readDevice, () => false);
}
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

// Which computer the desktop looks like. Asked each time the desktop is
// entered from the classic view, kept for the next time.
export type DeskOs = "win" | "mac";
const OS_KEY = "lexgo_desk_os";
const readOs = (): DeskOs => {
  try {
    return localStorage.getItem(OS_KEY) === "mac" ? "mac" : "win";
  } catch {
    return "win";
  }
};
export function useDeskOs(): DeskOs {
  return useSyncExternalStore(subscribe, readOs, () => "win");
}
export function setDeskOs(os: DeskOs) {
  try {
    localStorage.setItem(OS_KEY, os);
  } catch {
    /* storage blocked: the choice lasts until the page is left */
  }
  window.dispatchEvent(new Event(EVENT));
}

// A page running inside one of the desktop's windows. The frame is named
// lexgo-desk:<os>:<id>, a name that survives navigation inside it; the theme
// script marks <html data-desk-embed> before the first paint, so the site's
// own chrome never flashes inside a window.
export const DESK_FRAME = "lexgo-desk:";
const embedded = () => document.documentElement.dataset.deskEmbed === "1";
const embedOs = (): DeskOs => (document.documentElement.dataset.deskOs === "mac" ? "mac" : "win");
// The computer style of the desktop a window belongs to (its frame name says).
export function useDeskEmbedOs(): DeskOs {
  return useSyncExternalStore(
    () => () => undefined,
    embedOs,
    () => "win",
  );
}
export function useDeskEmbedded(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    embedded,
    () => false,
  );
}
