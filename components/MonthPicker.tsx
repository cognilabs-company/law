"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "next-intl";
import { monthNames, monthTitle } from "@/lib/date";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClose } from "./icons";

type Parsed = { y: number; m: number };

function parse(value: string): Parsed | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const y = parseInt(value.slice(0, 4), 10);
  const m = parseInt(value.slice(5, 7), 10) - 1;
  if (m < 0 || m > 11) return null;
  return { y, m };
}

export default function MonthPicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
  clearLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  clearLabel?: string;
}) {
  const locale = useLocale();
  const months = monthNames(locale);
  const parsed = parse(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    parsed ? parsed.y : new Date().getFullYear(),
  );
  const root = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  // Jump the year view to a new value (during render, not in an effect).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (parsed) setViewYear(parsed.y);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Same portal-positioning fix as DatePicker.tsx — keeps the popup out of
  // any ancestor Modal's overflow-y:auto clipping.
  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(220, openUp ? spaceAbove : spaceBelow);
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

  function pick(m: number) {
    onChange(`${viewYear}-${String(m + 1).padStart(2, "0")}`);
    setOpen(false);
  }

  const label = parsed ? monthTitle(parsed.y, parsed.m, locale) : placeholder;

  return (
    <div className="mpick" ref={root} data-open={open}>
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
            <button type="button" aria-label="prev" onClick={() => setViewYear((y) => y - 1)}>
              <IconChevronLeft />
            </button>
            <b>{viewYear}</b>
            <button type="button" aria-label="next" onClick={() => setViewYear((y) => y + 1)}>
              <IconChevronRight />
            </button>
          </div>
          <div className="mpick__grid">
            {months.map((mn, i) => {
              const on = !!parsed && parsed.y === viewYear && parsed.m === i;
              return (
                <button
                  key={i}
                  type="button"
                  className={`mpick__m${on ? " on" : ""}`}
                  onClick={() => pick(i)}
                >
                  {mn.slice(0, 3)}
                </button>
              );
            })}
          </div>
          {value && clearLabel ? (
            <button
              type="button"
              className="mpick__clear"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
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
