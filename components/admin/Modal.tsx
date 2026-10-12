"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { isCallRoomMounted } from "@/components/chat/CallRoom";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { useLayer } from "@/lib/layers";
import { isCoarsePointer } from "@/lib/usePopover";
import { useSwipeDismiss } from "@/lib/useSwipeDismiss";
import { IconClose } from "../icons";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const FIELD =
  'input:not([type="hidden"]):not([type="file"]):not([disabled]):not([readonly]),select:not([disabled]),textarea:not([disabled]):not([readonly])';
const SHEET_MEDIA = "(max-width: 640px)";

export type ModalSize = "sm" | "md" | "lg" | "xl";
export type ModalVariant = "dialog" | "drawer";
export type ModalInitialFocus = RefObject<HTMLElement | null> | string;
export type ModalScroll = "body" | "inner";

const SIZE_CLASS: Record<ModalSize, string> = { sm: " amodal__c--sm", md: "", lg: " amodal__c--lg", xl: " amodal__c--wide" };
const SCROLL_KEYS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 2, PageUp: -2, " ": 2, Home: -3, End: 3 };

let scrollLocks = 0;
let savedOverflow = "";

function lockScroll(): () => void {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (!scrollLocks) document.body.style.overflow = savedOverflow;
  };
}

const noSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

function shownEl(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function firstFocus(
  panel: HTMLElement,
  body: HTMLElement | null,
  title: HTMLElement | null,
  focus: ModalInitialFocus | undefined,
  drawer: boolean,
): HTMLElement {
  if (typeof focus === "string") {
    const hit = focus === "title" ? title : panel.querySelector<HTMLElement>(focus);
    if (hit) return hit;
  } else if (focus?.current) {
    return focus.current;
  }
  const head = title ?? panel;
  if (drawer || !body) return head;
  const fields = [...body.querySelectorAll<HTMLElement>(FIELD)].filter(shownEl);
  if (!fields.length) return head;
  const groups = new Set(fields.map((f) => (f instanceof HTMLInputElement && f.type === "radio" && f.name ? `radio:${f.name}` : f)));
  if (groups.size > 1 && isCoarsePointer()) return head;
  return fields[0];
}

export default function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  wide,
  aiId,
  size,
  footer,
  description,
  variant = "dialog",
  initialFocus,
  busy,
  dirty,
  closeLabel,
  scroll = "body",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  // A form-and-live-preview flow (document generation) needs real room for
  // the two side by side; every other modal keeps the normal narrow width.
  wide?: boolean;
  aiId?: string;
  size?: ModalSize;
  footer?: ReactNode;
  description?: ReactNode;
  variant?: ModalVariant;
  initialFocus?: ModalInitialFocus;
  busy?: boolean;
  dirty?: boolean;
  closeLabel?: string;
  scroll?: ModalScroll;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Where the click that might close this started. A drag that begins on text
  // inside the panel and ends on the backdrop — ordinary text selection, and
  // easy to do in a long document form — fires click on the backdrop, which
  // used to throw away everything typed so far.
  const ta = useTranslations("common.a11y");
  const tm = useTranslations("common.modal");
  const downOnScrim = useRef(false);
  const scrim = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const asking = useRef(false);
  const titleId = useId();
  const descId = useId();
  const mounted = useSyncExternalStore(noSubscribe, onClient, onServer);
  const shown = open && mounted;
  const drawer = variant === "drawer";

  const live = useRef({ onClose, busy: !!busy, dirty: !!dirty, initialFocus, drawer });
  useLayoutEffect(() => {
    live.current = { onClose, busy: !!busy, dirty: !!dirty, initialFocus, drawer };
  });

  function requestClose() {
    const cur = live.current;
    if (cur.busy || asking.current) return;
    if (!cur.dirty) {
      cur.onClose();
      return;
    }
    asking.current = true;
    void confirmDialog({
      tone: "danger",
      title: tm("discardTitle"),
      text: tm("discardText"),
      confirmLabel: tm("discardConfirm"),
      cancelLabel: tm("discardCancel"),
    }).then((ok) => {
      asking.current = false;
      if (ok) live.current.onClose();
    });
  }

  const z = useLayer(shown, {
    kind: "overlay",
    el: panel,
    backdrop: scrim,
    // A CallRoom mounted inside this modal is a full-screen overlay of its
    // own — Escape there means "leave the call", which its own end button
    // owns. Closing the modal underneath would tear the call down instead.
    onEscape: () => {
      if (!isCallRoomMounted() || !document.querySelector(".mtg:not(.mtg--float)")) requestClose();
    },
  });

  useSwipeDismiss({
    enabled: shown,
    panel,
    scroller: body,
    handles: [grip, head],
    canStart: () => !live.current.busy && !isCallRoomMounted() && window.matchMedia(SHEET_MEDIA).matches,
    onDismiss: () => requestClose(),
  });

  useLayoutEffect(() => {
    const el = scrim.current;
    if (!shown || !el) return;
    el.style.zIndex = "";
    const css = Number.parseInt(getComputedStyle(el).zIndex, 10);
    if (!(css >= z)) el.style.zIndex = String(z);
  }, [shown, z]);

  // Focus handling is keyed on `open` alone. Callers almost always pass an
  // inline arrow as onClose, so a combined effect re-ran on every parent
  // render and its cleanup yanked focus back out of the dialog — one
  // keystroke per field, then focus gone.
  useEffect(() => {
    if (!shown) return;
    const unlock = lockScroll();
    // Give the dialog focus so the keyboard lands inside it, and hand focus
    // back to whatever opened it on close. Skipped when something inside
    // already took focus (a field with autoFocus).
    const prev = document.activeElement as HTMLElement | null;
    const p = panel.current;
    if (p && !p.contains(prev)) {
      const cur = live.current;
      firstFocus(p, body.current, heading.current, cur.initialFocus, cur.drawer).focus({ preventScroll: true });
    }
    return () => {
      unlock();
      if (prev?.isConnected) prev.focus?.({ preventScroll: true });
    };
  }, [shown]);

  useEffect(() => {
    const el = scrim.current;
    const vv = window.visualViewport;
    if (!shown || !el || !vv) return;
    let vh = "";
    let kb = "";
    const apply = () => {
      const nextVh = `${Math.round(vv.height)}px`;
      const nextKb = `${Math.max(0, Math.round(document.documentElement.clientHeight - vv.height - vv.offsetTop))}px`;
      if (nextVh !== vh) {
        vh = nextVh;
        el.style.setProperty("--ov-vh", vh);
      }
      if (nextKb !== kb) {
        kb = nextKb;
        el.style.setProperty("--ov-kb", kb);
      }
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [shown]);

  useEffect(() => {
    const b = body.current;
    const p = panel.current;
    if (!shown || !b || !p) return;
    let raf = 0;
    const sync = () => {
      raf = 0;
      p.toggleAttribute("data-ov-up", b.scrollTop > 1);
      p.toggleAttribute("data-ov-down", b.scrollHeight - b.clientHeight - b.scrollTop > 1);
    };
    const later = () => {
      if (!raf) raf = window.requestAnimationFrame(sync);
    };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(later);
    const watch = () => {
      if (!ro) return;
      ro.disconnect();
      ro.observe(b);
      for (const c of Array.from(b.children)) ro.observe(c);
    };
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      watch();
      later();
    });
    sync();
    watch();
    mo?.observe(b, { childList: true });
    b.addEventListener("scroll", later, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      b.removeEventListener("scroll", later);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [shown]);

  useEffect(() => {
    const p = panel.current;
    if (!shown || !p || typeof CSS === "undefined" || CSS.supports("field-sizing", "content")) return;
    const grow = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLTextAreaElement) || !body.current?.contains(t) || (t.hasAttribute("rows") && t.rows > 4)) return;
      if (t.style.height && t.dataset.ovGrow !== "1") return;
      t.dataset.ovGrow = "1";
      t.style.height = "auto";
      t.style.height = `${t.scrollHeight + t.offsetHeight - t.clientHeight}px`;
    };
    p.addEventListener("input", grow);
    return () => p.removeEventListener("input", grow);
  }, [shown]);

  if (!shown) return null;

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
    if (e.shiftKey && (at === first || at === panel.current || at === heading.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function keys(e: ReactKeyboardEvent<HTMLDivElement>) {
    trap(e);
    const b = body.current;
    const step = SCROLL_KEYS[e.key];
    if (!b || !step || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target !== panel.current && e.target !== heading.current) return;
    const dir = e.key === " " && e.shiftKey ? -2 : step;
    const page = Math.max(48, b.clientHeight * 0.85);
    const top = Math.abs(dir) === 3 ? (dir > 0 ? b.scrollHeight : 0) : b.scrollTop + (Math.abs(dir) === 2 ? Math.sign(dir) * page : dir * 48);
    e.preventDefault();
    b.scrollTo({ top });
  }

  const sizeClass = drawer ? " amodal__c--drawer" : SIZE_CLASS[size ?? (wide ? "xl" : "md")];

  return createPortal(
    <div
      ref={scrim}
      className={`amodal${drawer ? " amodal--drawer" : ""}`}
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnScrim.current && !isCallRoomMounted()) requestClose();
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
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={`amodal__c${sizeClass}`}
        data-ai-id={aiId || undefined}
        data-ai-type={aiId ? "modal" : undefined}
        onMouseDown={(e) => {
          // A press that starts inside the panel must not be remembered as a
          // backdrop press — otherwise releasing the drag on the backdrop
          // still closes the dialog, which is the case this guards against.
          downOnScrim.current = false;
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={keys}
      >
        <div ref={grip} className="amodal__grip" aria-hidden="true" />
        <div ref={head} className="amodal__h">
          {icon ? <span className="amodal__ic" aria-hidden="true">{icon}</span> : null}
          <div className="amodal__hd">
            <h2 ref={heading} id={titleId} className="amodal__t" tabIndex={-1}>
              <b>{title}</b>
            </h2>
            {description ? (
              <div id={descId} className="amodal__d">
                {description}
              </div>
            ) : null}
          </div>
          <button className="amodal__x" type="button" onClick={requestClose} disabled={busy} aria-label={closeLabel || ta("close")}>
            <IconClose />
          </button>
        </div>
        <div ref={body} className={`amodal__b${scroll === "inner" ? " amodal__b--inner" : ""}`}>
          {children}
        </div>
        {footer ? <div className="amodal__f">{footer}</div> : <div className="amodal__cue" aria-hidden="true" />}
      </div>
    </div>,
    document.body,
  );
}
