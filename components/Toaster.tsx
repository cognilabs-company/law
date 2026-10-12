"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { errorText } from "@/lib/errorText";
import { ApiError } from "@/lib/http";
import { notifyStore, type NotifyAction, type NotifyExit, type NotifyItem, type NotifyTone } from "@/lib/toast";
import { IconAlert, IconCheck, IconCircleX, IconClose, IconInfo } from "@/components/icons";

type Tc = Parameters<typeof errorText>[1];
type Press = {
  key: string;
  pid: number;
  x0: number;
  y0: number;
  lx: number;
  ly: number;
  lt: number;
  vx: number;
  vy: number;
  axis: "" | "x" | "y";
  el: HTMLElement;
};
type Drag = { key: string; x: number; y: number };

const ICONS = { success: IconCheck, info: IconInfo, warning: IconAlert, error: IconCircleX } as const;
const PEEK = 8;
const GAP = 8;
const FALLBACK_H = 64;
const SLOP = 8;
const SWIPE = 40;
const FLICK = 0.5;

function ToneIcon({ tone }: { tone: NotifyTone }) {
  if (tone === "loading") return <i className="ntf__spin" />;
  const Icon = ICONS[tone];
  return <Icon />;
}

function bodyOf(it: NotifyItem, tc: Tc): string {
  if (it.body) return it.body;
  if (it.error === undefined) return "";
  const mapped = it.error instanceof ApiError ? it.map?.[it.error.status] : undefined;
  const text = mapped || errorText(it.error, tc);
  return text === it.title ? "" : text;
}

function spoken(it: NotifyItem, tc: Tc): string {
  const body = bodyOf(it, tc);
  if (!body) return it.title;
  return /[.!?…:]$/.test(it.title) ? `${it.title} ${body}` : `${it.title}. ${body}`;
}

function cardOf(box: HTMLElement | null, key: string): HTMLElement | null {
  return box ? box.querySelector<HTMLElement>(`[data-key="${key}"]`) : null;
}

function keyboardFocus(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

function typing(e: KeyboardEvent): boolean {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return false;
  const editable = el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  return editable && (e.key === "Dead" || (e.key.length === 1 && e.key.toLowerCase() !== "n"));
}

function ActionButton({ action, onDone }: { action: NotifyAction; onDone: () => void }) {
  const run = () => {
    try {
      action.onClick?.();
    } finally {
      onDone();
    }
  };
  if (!action.href)
    return (
      <button type="button" className="ntf__act" onClick={run}>
        {action.label}
      </button>
    );
  if (/^([a-z][a-z\d+.-]*:|\/\/)/i.test(action.href))
    return (
      <a className="ntf__act" href={action.href} onClick={run}>
        {action.label}
      </a>
    );
  return (
    <Link className="ntf__act" href={action.href} onClick={run}>
      {action.label}
    </Link>
  );
}

export default function Toaster() {
  const t = useTranslations("common.notify");
  const tc = useTranslations("common");
  const snap = useSyncExternalStore(notifyStore.subscribe, notifyStore.getSnapshot, notifyStore.getServerSnapshot);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [tapOpen, setTapOpen] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [kbdOn, setKbdOn] = useState(false);
  const root = useRef<HTMLElement>(null);
  const deck = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const pointer = useRef("mouse");
  const swallow = useRef(false);
  const back = useRef<HTMLElement | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const watched = useRef<Set<HTMLElement> | null>(null);
  const kbd = useRef(false);

  const active = snap.items.filter((x) => !x.leaving);
  const n = active.length;
  if (!n && hover) setHover(false);
  if (n < 2 && tapOpen) setTapOpen(false);
  const engaged = hover || focusIn || tapOpen;
  const expanded = n > 1 && engaged;

  useEffect(() => {
    notifyStore.pause("ui", engaged);
  }, [engaged]);

  useEffect(() => {
    const onVis = () => notifyStore.pause("hidden", document.visibilityState === "hidden");
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== "KeyN" || typing(e)) return;
      const top = notifyStore.getSnapshot().items.find((x) => !x.leaving);
      const el = top ? cardOf(deck.current, top.key) : null;
      if (!el) return;
      e.preventDefault();
      const cur = document.activeElement;
      if (cur instanceof HTMLElement && !root.current?.contains(cur)) back.current = cur;
      kbd.current = true;
      setKbdOn(true);
      setFocusIn(true);
      el.focus({ preventScroll: true });
    };
    onVis();
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("keydown", onKey);
      notifyStore.pause("hidden", false);
      notifyStore.pause("ui", false);
      notifyStore.pause("press", false);
    };
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver((entries) => {
      setHeights((cur) => {
        let next = cur;
        for (const en of entries) {
          const el = en.target as HTMLElement;
          const k = el.dataset.k;
          const h = el.offsetHeight;
          if (k && h > 0 && next[k] !== h) next = { ...next, [k]: h };
        }
        return next;
      });
    });
    const seen = new Set<HTMLElement>();
    ro.current = obs;
    watched.current = seen;
    return () => {
      obs.disconnect();
      seen.clear();
      ro.current = null;
      watched.current = null;
    };
  }, []);

  useEffect(() => {
    const obs = ro.current;
    const seen = watched.current;
    const box = deck.current;
    if (obs && seen && box) {
      seen.forEach((el) => {
        if (el.isConnected) return;
        obs.unobserve(el);
        seen.delete(el);
      });
      box.querySelectorAll<HTMLElement>(".ntf__in").forEach((el) => {
        if (seen.has(el)) return;
        obs.observe(el);
        seen.add(el);
      });
    }
    if (!focusIn) return;
    const raf = requestAnimationFrame(() => {
      if (root.current?.contains(document.activeElement)) return;
      setFocusIn(false);
      kbd.current = false;
      setKbdOn(false);
    });
    return () => cancelAnimationFrame(raf);
  });

  useEffect(() => {
    if (!tapOpen) return;
    const off = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setTapOpen(false);
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [tapOpen]);

  const hOf = (k: string) => heights[k] ?? FALLBACK_H;
  const frontH = n ? hOf(active[0].key) : 0;
  const yAt = (slot: number) =>
    expanded ? active.slice(0, slot).reduce((s, x) => s + hOf(x.key) + GAP, 0) : Math.min(slot, 2) * PEEK;
  const deckH = !n ? 0 : expanded ? active.reduce((s, x) => s + hOf(x.key), 0) + GAP * (n - 1) : frontH + PEEK * Math.min(n - 1, 2);

  function close(it: NotifyItem, dir: NotifyExit) {
    const el = cardOf(deck.current, it.key);
    const focused = document.activeElement;
    const had = !!el && el.contains(focused) && (kbd.current || keyboardFocus(focused));
    notifyStore.dismissKey(it.key, dir);
    if (!had) return;
    const next = notifyStore.getSnapshot().items.find((x) => !x.leaving && x.key !== it.key);
    const target = next ? cardOf(deck.current, next.key) : null;
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
    const prev = back.current;
    back.current = null;
    if (prev?.isConnected) prev.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function dropKbd() {
    kbd.current = false;
    setKbdOn(false);
  }

  function onDown(e: ReactPointerEvent<HTMLDivElement>, it: NotifyItem) {
    pointer.current = e.pointerType;
    swallow.current = false;
    if (kbd.current) dropKbd();
    if (it.leaving || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    notifyStore.pause("press", true);
    const end = () => {
      notifyStore.pause("press", false);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
    };
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    if (e.pointerType === "mouse") return;
    press.current = {
      key: it.key,
      pid: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      lt: e.timeStamp,
      vx: 0,
      vy: 0,
      axis: "",
      el: e.currentTarget,
    };
  }

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (!p || p.pid !== e.pointerId) return;
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    let axis = p.axis;
    if (!axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (!p.el.hasPointerCapture(e.pointerId)) p.el.setPointerCapture(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - p.lt);
    press.current = {
      ...p,
      axis,
      lx: e.clientX,
      ly: e.clientY,
      lt: e.timeStamp,
      vx: (e.clientX - p.lx) / dt,
      vy: (e.clientY - p.ly) / dt,
    };
    setDrag({ key: p.key, x: axis === "x" ? dx : 0, y: axis === "y" ? (dy < 0 ? dy : dy * 0.2) : 0 });
  }

  function onUp(e: ReactPointerEvent<HTMLDivElement>, it: NotifyItem) {
    const p = press.current;
    if (!p || p.pid !== e.pointerId) return;
    press.current = null;
    if (!p.axis) return;
    swallow.current = true;
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    const fresh = e.timeStamp - p.lt < 100;
    let dir: NotifyExit | "" = "";
    if (p.axis === "x" && (Math.abs(dx) > SWIPE || (fresh && Math.abs(p.vx) > FLICK && Math.sign(p.vx) === Math.sign(dx))))
      dir = dx < 0 ? "left" : "right";
    else if (p.axis === "y" && dy < 0 && (-dy > SWIPE || (fresh && p.vy < -FLICK))) dir = "up";
    setDrag(null);
    if (dir) close(it, dir);
  }

  function onCancel(e: ReactPointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (!p || p.pid !== e.pointerId) return;
    press.current = null;
    setDrag(null);
  }

  function onClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if (!swallow.current) return;
    swallow.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  function onCardClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (pointer.current === "mouse" || n < 2) return;
    if (e.target instanceof Element && e.target.closest("a,button")) return;
    setTapOpen((v) => !v);
  }

  function onKey(e: ReactKeyboardEvent<HTMLDivElement>, it: NotifyItem) {
    if (e.key !== "Escape" || it.leaving) return;
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    close(it, "up");
  }

  function onBlur(e: ReactFocusEvent<HTMLElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setFocusIn(false);
    if (kbd.current) dropKbd();
  }

  const politeLive = snap.polite;
  const assertLive = snap.assertive;
  const politeItem = politeLive ? snap.items.find((x) => x.key === politeLive.key) : undefined;
  const assertItem = assertLive ? snap.items.find((x) => x.key === assertLive.key) : undefined;

  return (
    <section
      ref={root}
      className="ntf"
      aria-label={t("region")}
      data-ai-ignore=""
      data-layer-ignore=""
      data-paused={snap.paused ? "" : undefined}
      data-open={expanded ? "" : undefined}
      data-kbd={kbdOn ? "" : undefined}
      onFocus={(e) => {
        if (kbd.current || keyboardFocus(e.target)) setFocusIn(true);
      }}
      onBlur={onBlur}
    >
      <div
        ref={deck}
        className="ntf__deck"
        style={{ height: deckH }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHover(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(false);
        }}
      >
        {snap.items.map((it) => {
          const i = it.leaving ? it.slot : active.indexOf(it);
          const behind = !expanded && i > 0;
          const d = drag && drag.key === it.key ? drag : null;
          const body = bodyOf(it, tc);
          const tid = `ntf-${it.key}-t`;
          const bid = `ntf-${it.key}-b`;
          const style: CSSProperties = {
            transform: `translateY(${yAt(i)}px) scale(${expanded ? 1 : 1 - Math.min(i, 2) * 0.04})`,
            height: behind ? frontH : heights[it.key],
            zIndex: (10 - i) * 2 + (it.leaving ? 1 : 0),
            translate: d ? `${d.x}px ${d.y}px` : undefined,
          };
          const cls = [
            "ntf__card",
            `ntf__card--${it.tone}`,
            behind ? "is-behind" : "",
            d ? "is-drag" : "",
            it.leaving ? `is-out is-out--${it.leaving}` : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={it.key}
              data-key={it.key}
              className={cls}
              style={style}
              role="group"
              aria-labelledby={tid}
              aria-describedby={body ? bid : undefined}
              tabIndex={-1}
              onPointerDown={(e) => onDown(e, it)}
              onPointerMove={onMove}
              onPointerUp={(e) => onUp(e, it)}
              onPointerCancel={onCancel}
              onClickCapture={onClickCapture}
              onClick={onCardClick}
              onKeyDown={(e) => onKey(e, it)}
            >
              <div className="ntf__in" data-k={it.key}>
                <span className="ntf__ic" aria-hidden="true">
                  <ToneIcon tone={it.tone} />
                </span>
                <div className="ntf__txt">
                  <b className="ntf__t" id={tid}>
                    {it.title}
                  </b>
                  {body ? (
                    <p className="ntf__b" id={bid}>
                      {body}
                    </p>
                  ) : null}
                </div>
                <div className="ntf__acts">
                  {it.action ? <ActionButton action={it.action} onDone={() => close(it, "up")} /> : null}
                  <button type="button" className="ntf__x" aria-label={t("close")} onClick={() => close(it, "up")}>
                    <IconClose aria-hidden="true" />
                  </button>
                </div>
              </div>
              {it.sticky || it.leaving ? null : (
                <i
                  key={it.rev}
                  className="ntf__bar"
                  style={{ animationDuration: `${it.duration}ms`, "--ntf-d": `${it.duration}ms` } as CSSProperties}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
      {snap.queued > 0 ? <p className="ntf__more">{t("more", { n: snap.queued })}</p> : null}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {politeItem && politeLive ? <p key={`${politeLive.key}-${politeLive.ver}`}>{spoken(politeItem, tc)}</p> : null}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertItem && assertLive ? <p key={`${assertLive.key}-${assertLive.ver}`}>{spoken(assertItem, tc)}</p> : null}
      </div>
    </section>
  );
}
