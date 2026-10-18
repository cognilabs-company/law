// A page inside a virtual desktop window and the desktop around it
// (components/portal/desk): the page says what it is doing (where it is,
// a call, a wish to ask the copilot), the desktop answers with how it is
// shown (picture-in-picture). Same origin only, both ways; nothing here
// carries a token, a phone number or a message.
import { useSyncExternalStore } from "react";

export type DeskEntity = { type: string; id: string; title?: string };
export type ToDesk =
  | { type: "lexgo-desk:path"; path: string }
  | { type: "lexgo-desk:call"; on: boolean; video: boolean }
  | { type: "lexgo-desk:copilot"; entity: DeskEntity };
export type FromDesk = { type: "lexgo-desk:pip"; on: boolean };

const root = () => (typeof document === "undefined" ? null : document.documentElement);

// Inside a desktop window: the frame's name says so, and it survives
// navigation and a page re-rendered from scratch (the html mark may not).
export function inDesk(): boolean {
  return typeof window !== "undefined" && window.parent !== window && window.name.startsWith("lexgo-desk:");
}

export function tellDesk(msg: ToDesk): void {
  if (inDesk()) window.parent.postMessage(msg, window.location.origin);
}

const noop = () => () => undefined;
// For render: false on the server and on the first paint of a page that
// is not in a desktop window.
export function useInDesk(): boolean {
  return useSyncExternalStore(noop, inDesk, () => false);
}

// The desktop's answers: picture-in-picture shows the page as a small
// floating window, so the page marks <html data-desk-pip> and its styles
// keep only what matters there (the call).
export function listenToDesk(): () => void {
  if (!inDesk()) return () => undefined;
  const on = (e: MessageEvent) => {
    if (e.origin !== window.location.origin || e.source !== window.parent) return;
    const d = e.data as Partial<FromDesk> | null;
    if (d?.type === "lexgo-desk:pip") root()?.toggleAttribute("data-desk-pip", !!d.on);
  };
  window.addEventListener("message", on);
  return () => window.removeEventListener("message", on);
}
