"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "../icons";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  // A form-and-live-preview flow (document generation) needs real room for
  // the two side by side; every other modal keeps the normal narrow width.
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Where the click that might close this started. A drag that begins on text
  // inside the panel and ends on the backdrop — ordinary text selection, and
  // easy to do in a long document form — fires click on the backdrop, which
  // used to throw away everything typed so far.
  const downOnScrim = useRef(false);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Focus handling is keyed on `open` alone. Callers almost always pass an
  // inline arrow as onClose, so a combined effect re-ran on every parent
  // render and its cleanup yanked focus back out of the dialog — one
  // keystroke per field, then focus gone.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    // Give the dialog focus so the keyboard lands inside it, and hand focus
    // back to whatever opened it on close. Skipped when something inside
    // already took focus (a field with autoFocus).
    const prev = document.activeElement as HTMLElement | null;
    if (panel.current && !panel.current.contains(prev)) panel.current.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = "";
      if (prev?.isConnected) prev.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  // Tab must not walk out of the dialog into the page behind it. Bound to the
  // panel rather than the document so a menu portaled to <body> (Select,
  // DatePicker) still works normally when focus is inside it.
  function trap(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="amodal"
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnScrim.current) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        // Deliberately no aria-modal: Select and DatePicker render their
        // menus into <body> through a portal, and aria-modal would hide
        // those from a screen reader while the dialog is open. Tab is kept
        // inside by trap() below instead.
        aria-label={title || undefined}
        tabIndex={-1}
        className={`amodal__c${wide ? " amodal__c--wide" : ""}`}
        onMouseDown={(e) => {
          // A press that starts inside the panel must not be remembered as a
          // backdrop press — otherwise releasing the drag on the backdrop
          // still closes the dialog, which is the case this guards against.
          downOnScrim.current = false;
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trap}
      >
        <div className="amodal__h">
          <b>{title}</b>
          <button className="amodal__x" type="button" onClick={onClose} aria-label="close">
            <IconClose />
          </button>
        </div>
        <div className="amodal__b">{children}</div>
      </div>
    </div>
  );
}
