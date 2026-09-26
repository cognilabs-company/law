"use client";

import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
import gsap from "gsap";
import { useTranslations } from "next-intl";
import { IconCheck } from "./icons";

// One-time-code entry as N separate slots (styles: wp-codeslots in globals.css).
//
// The typing itself happens in a single real <input> laid over the row with
// transparent text: inputMode="numeric" + autoComplete="one-time-code" keep
// the numeric keypad, SMS autofill and password managers working, and the
// slots stay pure presentation (aria-hidden). Everything moving is driven by
// GSAP from effects — never during render — so the caret glide, the fill, the
// paste cascade, the error drain and the success wash can overlap without
// fighting React over the DOM.
//
// Imperative state (a slot is filled, the row is tinted danger) is written as
// data-* attributes rather than classes: React never renders those attributes,
// so a re-render cannot wipe them mid-animation.

export type CodeSlotsStatus = "idle" | "error" | "success";

export type CodeSlotsProps = {
  /** How many digits / slots. Default 6. */
  length?: number;
  value: string;
  onChange: (value: string) => void;
  /** Fires once the last slot is filled. */
  onComplete?: (value: string) => void;
  /** "error" drains the row in reverse and clears it; "success" washes it over with a tick. */
  status?: CodeSlotsStatus;
  /** Change it to replay the current status animation (a second refused code, say). */
  statusKey?: string | number;
  /** Show • instead of the digit. */
  mask?: boolean;
  /** Show the gliding caret. Default true. */
  caret?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Slot edge in px (the slots shrink below it when the row is narrower). */
  size?: number;
  /** Gap between slots, px. */
  gap?: number;
  /** Corner radius, px. */
  radius?: number;
  /** Put on the real input, so an outside <label htmlFor> reaches it. */
  id?: string;
  name?: string;
  /** Only for a standalone use with no visible <label>. */
  label?: string;
  describedBy?: string;
};

const STAGGER = 0.05; // s between slots in a paste cascade / error drain
// Keys the browser may act on: the caret has to be re-read after them.
const NAV = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End"];
const onlyDigits = (s: string) => s.replace(/\D/g, "");
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const slotsOf = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>(".cslots__slot"));
const partsOf = (slot: HTMLElement) => ({
  wash: slot.querySelector<HTMLElement>(".cslots__wash"),
  ch: slot.querySelector<HTMLElement>(".cslots__ch"),
});

export default function CodeSlots({
  length = 6,
  value,
  onChange,
  onComplete,
  status = "idle",
  statusKey,
  mask = false,
  caret = true,
  disabled = false,
  autoFocus = false,
  size,
  gap,
  radius,
  id,
  name,
  label,
  describedBy,
}: CodeSlotsProps) {
  const t = useTranslations("common.codeSlots");
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const okRef = useRef<HTMLSpanElement>(null);
  const tickRef = useRef<HTMLSpanElement>(null);
  // Last value the slots were animated to (null = nothing painted yet).
  const prevRef = useRef<string | null>(null);
  const lenRef = useRef(length);
  // True while the error drain plays: typing is ignored so the animation is
  // not left half-finished with a digit back in the row.
  const drainRef = useRef(false);
  // The drain clears the code from a GSAP callback, long after the render
  // that started it — reach for the newest props, not the captured ones.
  const changeRef = useRef(onChange);
  const disabledRef = useRef(disabled);

  const [focused, setFocused] = useState(false);
  const [at, setAt] = useState(0);

  const code = onlyDigits(value).slice(0, length);
  const done = code.length >= length;
  // Which slot the caret sits on: none while blurred, disabled or verified.
  // Clamped to the code that actually exists, not just to the length: after a
  // refused code drains the slots, the caret must come back to the first box
  // rather than stay where the last digit used to be.
  const active = disabled || status === "success" || !focused ? -1 : Math.min(at, code.length, length - 1);

  useEffect(() => {
    changeRef.current = onChange;
    disabledRef.current = disabled;
  }, [onChange, disabled]);

  // ── filling and emptying slots ────────────────────────────────────────
  // Diffed against the previous value: a slot that just gained a digit washes
  // in from its centre with the digit rising, one that lost it reverses. More
  // than one digit at once (a paste, an SMS autofill) cascades.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const prev = prevRef.current;
    const resized = lenRef.current !== length;
    const first = prev === null || resized;
    lenRef.current = length;
    prevRef.current = code;
    const flat = still();
    const cascade = !first && code.length - (prev?.length ?? 0) > 1;
    let k = 0;
    slotsOf(row).forEach((slot, i) => {
      const was = prev?.[i] ?? "";
      const now = code[i] ?? "";
      if (!first && was === now) return;
      const { wash, ch } = partsOf(slot);
      if (!wash || !ch) return;
      gsap.killTweensOf([wash, ch]);
      const delay = cascade && now && !was ? k++ * STAGGER : 0;
      if (now) {
        ch.textContent = mask ? "•" : now;
        slot.dataset.on = "1";
        if (first || flat) {
          gsap.set(wash, { scale: 1, opacity: 1 });
          gsap.set(ch, { yPercent: 0, scale: 1, opacity: 1 });
          return;
        }
        if (!was) gsap.fromTo(wash, { scale: 0.22, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.38, ease: "back.out(2.4)", delay });
        gsap.fromTo(
          ch,
          { yPercent: 72, scale: 0.7, opacity: 0 },
          { yPercent: 0, scale: 1, opacity: 1, duration: 0.36, ease: "back.out(2.6)", delay: delay + (was ? 0 : 0.04) },
        );
        return;
      }
      delete slot.dataset.on;
      if (first || flat) {
        gsap.set(wash, { scale: 0.22, opacity: 0 });
        gsap.set(ch, { yPercent: 0, scale: 1, opacity: 0 });
        ch.textContent = "";
        return;
      }
      gsap.to(wash, { scale: 0.3, opacity: 0, duration: 0.2, ease: "power2.in" });
      gsap.to(ch, {
        yPercent: 58,
        scale: 0.78,
        opacity: 0,
        duration: 0.18,
        ease: "power2.in",
        onComplete: () => {
          ch.textContent = "";
        },
      });
    });
  }, [code, mask, length]);

  // ── the caret ─────────────────────────────────────────────────────────
  // One element that glides to the active slot's centre, measured from the
  // real geometry so it follows the slots when they shrink on a narrow screen.
  useEffect(() => {
    const el = caretRef.current;
    const row = rowRef.current;
    if (!caret || !el || !row) return;
    gsap.set(el, { xPercent: -50, yPercent: -50 });
    const place = (anim: boolean) => {
      const slot = slotsOf(row)[active];
      if (active < 0 || !slot) {
        gsap.to(el, { opacity: 0, duration: anim ? 0.14 : 0, overwrite: "auto" });
        return;
      }
      const x = slot.offsetLeft + slot.offsetWidth / 2;
      const hidden = Number(gsap.getProperty(el, "opacity")) === 0;
      const glide = anim && !hidden && !still();
      if (hidden) gsap.set(el, { x });
      gsap.to(el, { x, opacity: 1, duration: glide ? 0.3 : 0.12, ease: "back.out(1.9)", overwrite: "auto" });
    };
    place(true);
    // ResizeObserver fires once on observe — that first call is this same
    // placement, and letting it through would snap the glide short.
    let settled = false;
    const ro = new ResizeObserver(() => {
      if (!settled) {
        settled = true;
        return;
      }
      place(false);
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, [active, caret, length]);

  // ── status: refused code, verified code ───────────────────────────────
  useEffect(() => {
    const root = rootRef.current;
    const row = rowRef.current;
    const ok = okRef.current;
    const tick = tickRef.current;
    if (!root || !row) return;
    const flat = still();
    if (status === "success") {
      delete root.dataset.tone;
      if (!ok) return;
      gsap.killTweensOf(ok);
      if (tick) gsap.killTweensOf(tick);
      if (flat) {
        gsap.set(ok, { opacity: 1, scaleX: 1 });
        if (tick) gsap.set(tick, { opacity: 1, y: 0, scale: 1 });
        return;
      }
      gsap.fromTo(ok, { opacity: 0, scaleX: 0.5 }, { opacity: 1, scaleX: 1, duration: 0.42, ease: "back.out(1.7)" });
      if (tick) gsap.fromTo(tick, { opacity: 0, y: 20, scale: 0.5 }, { opacity: 1, y: 0, scale: 1, duration: 0.52, ease: "back.out(2.8)", delay: 0.12 });
      return;
    }
    if (ok) {
      gsap.killTweensOf(ok);
      gsap.set(ok, { opacity: 0, scaleX: 0.5 });
      if (tick) {
        gsap.killTweensOf(tick);
        gsap.set(tick, { opacity: 0, y: 20, scale: 0.5 });
      }
    }
    if (status !== "error") {
      delete root.dataset.tone;
      return;
    }
    // Tint the row danger, empty the filled slots last-to-first, then hand the
    // cleared code back so the step starts over.
    root.dataset.tone = "err";
    const filled = slotsOf(row)
      .filter((s) => s.dataset.on)
      .reverse();
    if (!filled.length) return;
    drainRef.current = true;
    const tl = gsap.timeline({
      onComplete: () => {
        drainRef.current = false;
        delete root.dataset.tone;
        filled.forEach((s) => {
          delete s.dataset.on;
          const { ch } = partsOf(s);
          if (ch) ch.textContent = "";
        });
        prevRef.current = "";
        changeRef.current("");
        if (!disabledRef.current) inRef.current?.focus();
      },
    });
    filled.forEach((slot, i) => {
      const { wash, ch } = partsOf(slot);
      if (!wash || !ch) return;
      gsap.killTweensOf([wash, ch]);
      const at2 = flat ? 0 : i * (STAGGER + 0.005);
      tl.to(wash, { scale: 0.34, opacity: 0, duration: flat ? 0 : 0.24, ease: "power2.in" }, at2);
      tl.to(ch, { yPercent: 62, scale: 0.78, opacity: 0, duration: flat ? 0 : 0.22, ease: "power2.in" }, at2);
    });
    return () => {
      tl.kill();
      drainRef.current = false;
    };
  }, [status, statusKey, length]);

  // Caret index from the real input's selection. Read in handlers only, never
  // during render.
  const sync = () => {
    const el = inRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    setAt(Math.max(0, Math.min(pos, length - 1)));
  };

  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (drainRef.current || disabled) {
      el.value = code;
      return;
    }
    const next = onlyDigits(el.value).slice(0, length);
    // Letters and an over-long paste never reach `value`, so React would not
    // re-render and the input would keep them: put the clean string back.
    if (el.value !== next) el.value = next;
    if (next !== code) {
      onChange(next);
      if (next.length === length && code.length !== length) onComplete?.(next);
    }
    sync();
  };

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (drainRef.current) {
      e.preventDefault();
      return;
    }
    // Digits, editing and navigation keys only — anything else would flash in
    // the field before `change` could strip it. Ctrl/Cmd combos pass so paste
    // and select-all still work.
    if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
    else if (NAV.includes(e.key)) requestAnimationFrame(sync);
  };

  // A click puts the caret on the slot under the pointer, not wherever the
  // invisible text happens to sit — and never past the last digit entered.
  const click = (e: MouseEvent<HTMLInputElement>) => {
    const row = rowRef.current;
    const el = inRef.current;
    if (!row || !el) return;
    const slots = slotsOf(row);
    let i = slots.findIndex((s) => e.clientX <= s.getBoundingClientRect().right);
    if (i < 0) i = length - 1;
    const pos = Math.min(i, code.length);
    el.setSelectionRange(pos, pos);
    setAt(Math.min(pos, length - 1));
  };

  const vars = {
    ...(size ? { "--cslot-size": `${size}px` } : null),
    ...(gap !== undefined ? { "--cslot-gap": `${gap}px` } : null),
    ...(radius !== undefined ? { "--cslot-radius": `${radius}px` } : null),
  } as CSSProperties;

  return (
    <div ref={rootRef} className={`cslots${disabled ? " cslots--dis" : ""}`} style={vars}>
      <div className="cslots__row" ref={rowRef}>
        <div className="cslots__slots" aria-hidden="true">
          {Array.from({ length }, (_, i) => (
            <div key={i} className="cslots__slot" data-at={i === active ? "1" : undefined}>
              <span className="cslots__wash" />
              <span className="cslots__ch" />
            </div>
          ))}
          {caret ? <span className="cslots__caret" ref={caretRef} /> : null}
        </div>
        <input
          ref={inRef}
          id={id}
          name={name}
          className="cslots__input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          value={code}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={status === "error" || undefined}
          onChange={change}
          onKeyDown={keyDown}
          onKeyUp={sync}
          onSelect={sync}
          onClick={click}
          onFocus={() => {
            setFocused(true);
            sync();
          }}
          onBlur={() => setFocused(false)}
        />
        <span className="cslots__ok" ref={okRef} aria-hidden="true">
          <span className="cslots__tick" ref={tickRef}>
            <IconCheck />
          </span>
        </span>
      </div>
      <span className="cslots__sr" role="status" aria-live="polite">
        {done ? t("complete") : t("entered", { n: code.length, total: length })}
      </span>
    </div>
  );
}
