"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "next-intl";
import { monthTitle, weekdays, fmtDate } from "@/lib/date";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClose } from "./icons";

type Parsed = { y: number; m: number; d: number };

function parse(value: string): Parsed | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const y = parseInt(value.slice(0, 4), 10);
  const m = parseInt(value.slice(5, 7), 10) - 1;
  const d = parseInt(value.slice(8, 10), 10);
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  return { y, m, d };
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Handmade day-level date picker (no native <input type=date>). Value is
// "YYYY-MM-DD". min/max (also ISO) disable out-of-range days.
export default function DatePicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  min,
  max,
  disabled,
  clearLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  clearLabel?: string;
}) {
  const locale = useLocale();
  const wd = weekdays(locale);
  const parsed = parse(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [vy, setVy] = useState(parsed ? parsed.y : today.getFullYear());
  const [vm, setVm] = useState(parsed ? parsed.m : today.getMonth());
  const root = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  // Jump the calendar view to a new value (during render, not in an effect).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (parsed) { setVy(parsed.y); setVm(parsed.m); }
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      // Popup is portaled to document.body (see render), so it's not a DOM
      // descendant of root — check it separately, or clicks inside it would
      // look "outside" and close the popup before its own onClick runs.
      if (root.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  // Rendered via a portal with inline position:fixed coordinates computed
  // from the trigger's live rect, so the popup can't be clipped by an
  // ancestor Modal's overflow-y:auto/max-height:90vh (same fix as
  // SearchSelect.tsx / Select.tsx).
  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const openUp = spaceBelow < 320 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(280, openUp ? spaceAbove : spaceBelow);
    // Popup width comes from its own CSS (min-width, or .dpick's 264px), not
    // the trigger's — but still clamp so it can't render off the right edge.
    const left = Math.min(r.left, window.innerWidth - 280 - 8);
    setPos({ left: Math.max(8, left), top: openUp ? r.top - gap - maxHeight : r.bottom + gap, maxHeight });
  };
  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onMove = () => updatePos();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => { window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); };
  }, [open]);

  function step(delta: number) {
    let m = vm + delta, y = vy;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setVm(m); setVy(y);
  }
  function pick(d: number) {
    onChange(iso(vy, vm, d));
    setOpen(false);
  }

  const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7; // Monday-first offset
  const daysIn = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  const label = parsed ? fmtDate(value, locale) : placeholder;

  return (
    <div className="mpick dpick" ref={root} data-open={open}>
      <button
        ref={btnRef}
        type="button"
        className={`mpick__btn${parsed ? "" : " mpick__btn--ph"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <IconCalendar />
        <span className="mpick__val">{label}</span>
        <span className="mpick__cv" />
      </button>
      {open && pos ? createPortal(
        <div
          className="mpick__pop"
          role="dialog"
          aria-label={ariaLabel}
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
        >
          <div className="mpick__nav">
            <button type="button" aria-label="prev" onClick={() => step(-1)}><IconChevronLeft /></button>
            <b>{monthTitle(vy, vm, locale)}</b>
            <button type="button" aria-label="next" onClick={() => step(1)}><IconChevronRight /></button>
          </div>
          <div className="dpick__wd">
            {wd.map((w, i) => <span key={i}>{w}</span>)}
          </div>
          <div className="dpick__grid">
            {cells.map((d, i) => {
              if (d == null) return <span key={i} className="dpick__blank" />;
              const cellIso = iso(vy, vm, d);
              const off = (min && cellIso < min) || (max && cellIso > max);
              const on = !!parsed && parsed.y === vy && parsed.m === vm && parsed.d === d;
              return (
                <button
                  key={i}
                  type="button"
                  className={`dpick__d${on ? " on" : ""}`}
                  disabled={!!off}
                  onClick={() => pick(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>
          {value && clearLabel ? (
            <button type="button" className="mpick__clear" onClick={() => { onChange(""); setOpen(false); }}>
              <IconClose />
              {clearLabel}
            </button>
          ) : null}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
