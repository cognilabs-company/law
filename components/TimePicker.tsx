"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClock, IconClose } from "./icons";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const pad = (n: number) => String(n).padStart(2, "0");

function parse(value: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, m: mi };
}

// Handmade time field (no native <input type=time>): the same button look as
// DatePicker, a popup with an hour grid and a 5-minute grid. Value "HH:MM".
export default function TimePicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
  clearLabel,
  step = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  clearLabel?: string;
  step?: 5 | 10 | 15 | 30;
}) {
  const parsed = parse(value);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const minutes = MINUTES.filter((m) => m % step === 0);

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
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  // Same portal-positioning fix as DatePicker.tsx / MonthPicker.tsx — keeps
  // the popup out of any ancestor Modal's overflow-y:auto clipping.
  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    // spaceAbove alone being bigger than spaceBelow isn't enough reason to
    // flip up — see DatePicker.tsx for why.
    const openUp = spaceBelow < 300 && spaceAbove > spaceBelow && spaceAbove >= 160;
    // A flat floor here used to ignore how little room the chosen side
    // actually had — for a trigger near the very top of the screen that
    // forced `top` negative and pushed the popup off the top of the
    // viewport. Cap it at what's really available; the popup scrolls.
    const room = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(Math.max(200, room), window.innerHeight - margin * 2);
    const left = Math.min(r.left, window.innerWidth - 280 - margin);
    const top = openUp ? r.top - gap - maxHeight : r.bottom + gap;
    setPos({
      left: Math.max(margin, left),
      // Final safety net, independent of the calculation above.
      top: Math.min(Math.max(margin, top), window.innerHeight - margin),
      maxHeight,
    });
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

  const pickH = (h: number) => onChange(`${pad(h)}:${pad(parsed ? parsed.m : 0)}`);
  const pickM = (m: number) => { onChange(`${pad(parsed ? parsed.h : 9)}:${pad(m)}`); setOpen(false); };

  return (
    <div className="mpick tpick" ref={root} data-open={open}>
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
        <IconClock />
        <span className="mpick__val">{parsed ? `${pad(parsed.h)}:${pad(parsed.m)}` : placeholder}</span>
        <span className="mpick__cv" />
      </button>
      {open && pos ? createPortal(
        <div
          className="mpick__pop tpick__pop"
          role="dialog"
          aria-label={ariaLabel}
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
        >
          <div className="tpick__cols">
            <div className="tpick__col">
              <span className="tpick__lbl">HH</span>
              <div className="tpick__grid tpick__grid--h">
                {HOURS.map((h) => (
                  <button key={h} type="button" className={`tpick__c${parsed?.h === h ? " on" : ""}`} onClick={() => pickH(h)}>{pad(h)}</button>
                ))}
              </div>
            </div>
            <div className="tpick__col">
              <span className="tpick__lbl">MM</span>
              <div className="tpick__grid tpick__grid--m">
                {minutes.map((m) => (
                  <button key={m} type="button" className={`tpick__c${parsed?.m === m ? " on" : ""}`} onClick={() => pickM(m)}>{pad(m)}</button>
                ))}
              </div>
            </div>
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
