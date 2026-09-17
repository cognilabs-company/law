"use client";

import { useEffect, useRef, useState } from "react";
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
  const minutes = MINUTES.filter((m) => m % step === 0);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const pickH = (h: number) => onChange(`${pad(h)}:${pad(parsed ? parsed.m : 0)}`);
  const pickM = (m: number) => { onChange(`${pad(parsed ? parsed.h : 9)}:${pad(m)}`); setOpen(false); };

  return (
    <div className="mpick tpick" ref={root} data-open={open}>
      <button
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
      {open ? (
        <div className="mpick__pop tpick__pop" role="dialog" aria-label={ariaLabel}>
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
        </div>
      ) : null}
    </div>
  );
}
