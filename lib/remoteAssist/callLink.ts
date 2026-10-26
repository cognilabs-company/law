import { useSyncExternalStore } from "react";
import type { RaWire } from "./marks";

// Remote assistance v2 rides the support call that is already open: the
// client's tab is a normal ScreenShare track in that LiveKit room and the
// drawn marks travel on its data channel (topic RA_MARK_TOPIC). CallRoom
// registers its room here (through callLinkLiveKit, so LiveKit itself loads
// only with the call); nothing opens a second connection, and nothing from
// here reaches the remote-assistance API.

export type RaVideo = { attach: (el: HTMLVideoElement) => void; detach: (el: HTMLVideoElement) => void };
export type RaRemoteShare = { video: RaVideo | null; muted: boolean };
export type RaLocalShare = { on: boolean; hidden: boolean; surface: string };

export type RaLink = {
  self: () => string;
  send: (msg: RaWire) => void;
  onWire: (fn: (msg: RaWire, from: string) => void) => () => void;
  onChange: (fn: () => void) => () => void;
  // Asks the browser for this tab (its own picker can't be skipped) and
  // publishes it; resolves with the shared surface ("browser" = a tab).
  startShare: () => Promise<string>;
  stopShare: () => Promise<void>;
  setShareHidden: (hidden: boolean) => Promise<void>;
  localShare: () => RaLocalShare;
  remoteShare: (identity: string) => RaRemoteShare;
};

// ---- the registered room ----

let current: RaLink | null = null;
let currentKey: object | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

declare global {
  interface Window {
    // e2e only: a stand-in for the LiveKit call (tests/e2e/remote-assist.spec.ts).
    __raTestLink?: RaLink;
  }
}

// `key` is the call's room object, so a late cleanup of an old call never
// clears a newer one.
export function setRaLink(key: object, link: RaLink): void {
  currentKey = key;
  current = link;
  emit();
}

export function clearRaLink(key: object): void {
  if (currentKey !== key) return;
  currentKey = null;
  current = null;
  emit();
}

function snapshot(): RaLink | null {
  if (typeof window !== "undefined" && window.__raTestLink) return window.__raTestLink;
  return current;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

// The open support call's link, or null when no call is on screen.
export function useRaLink(): RaLink | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
