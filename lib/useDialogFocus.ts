"use client";

import { useEffect, useRef, type RefObject } from "react";

// Keyboard focus for the light dialogs that are not built on admin/Modal
// (viewers, the AI chat dock): on open the keyboard lands inside the panel,
// Tab and Shift+Tab stay inside it while it is modal, and on close focus goes
// back to whatever opened it. Escape stays with each dialog, which already
// owns its own close (and its exit animation).
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0 && !el.closest("[inert]"));
}

// Where Tab goes next inside `root`, wrapping at both ends; null lets the
// browser move focus as usual.
export function wrapTab(root: HTMLElement, at: Element | null, back: boolean): HTMLElement | null {
  const items = tabbables(root);
  if (!items.length) return root;
  const first = items[0];
  const last = items[items.length - 1];
  if (!at || !root.contains(at) || at === root) return back ? last : first;
  if (back && at === first) return last;
  if (!back && at === last) return first;
  return null;
}

export function useDialogFocus(open: boolean, panel: RefObject<HTMLElement | null>, opts: { trap?: boolean; initial?: RefObject<HTMLElement | null> } = {}) {
  const trap = opts.trap ?? true;
  const initial = useRef(opts.initial);
  useEffect(() => {
    initial.current = opts.initial;
  });

  useEffect(() => {
    if (!open) return;
    const node = panel.current;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let raf = requestAnimationFrame(() => {
      raf = 0;
      const p = panel.current;
      if (!p || p.contains(document.activeElement)) return;
      const target = initial.current?.current ?? tabbables(p)[0] ?? p;
      target.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      const p = panel.current;
      if (!trap || e.key !== "Tab" || !p) return;
      // A menu portaled to <body> from inside the dialog keeps its own Tab.
      if (!p.contains(document.activeElement) && document.activeElement !== document.body) return;
      const next = wrapTab(p, document.activeElement, e.shiftKey);
      if (!next) return;
      e.preventDefault();
      next.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      const inside = !document.activeElement || document.activeElement === document.body || !!node?.contains(document.activeElement);
      if (inside && prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, [open, trap, panel]);
}
