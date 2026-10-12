"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { focusField, usePopover } from "@/lib/usePopover";
import { IconClock, IconClose } from "./icons";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const pad = (n: number) => String(n).padStart(2, "0");
const TABBABLE = 'button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

function parse(value: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, m: mi };
}

function atEdge(root: HTMLElement, back: boolean): boolean {
  const at = document.activeElement;
  if (!(at instanceof HTMLElement) || !root.contains(at)) return false;
  const bit = back ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  return !Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).some(
    (el) => el !== at && el.tabIndex >= 0 && (at.compareDocumentPosition(el) & bit) !== 0,
  );
}

function moveInGrid(e: ReactKeyboardEvent<HTMLDivElement>) {
  const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  const i = e.target instanceof HTMLButtonElement ? btns.indexOf(e.target) : -1;
  if (i < 0) return;
  const row = btns.findIndex((b) => b.offsetTop !== btns[0].offsetTop);
  const cols = row > 0 ? row : btns.length;
  let j: number;
  switch (e.key) {
    case "ArrowLeft": j = i - 1; break;
    case "ArrowRight": j = i + 1; break;
    case "ArrowUp": j = i - cols; break;
    case "ArrowDown": j = i + cols; break;
    case "Home": j = 0; break;
    case "End": j = btns.length - 1; break;
    default: return;
  }
  e.preventDefault();
  btns[Math.max(0, Math.min(btns.length - 1, j))]?.focus({ preventScroll: true });
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const minutes = MINUTES.filter((m) => m % step === 0);
  const [curH, setCurH] = useState<number | null>(null);
  const [curM, setCurM] = useState<number | null>(null);
  const tabH = curH ?? (parsed ? parsed.h : 9);
  const tabM = curM ?? (parsed && minutes.includes(parsed.m) ? parsed.m : minutes[0]);
  const label = ariaLabel || placeholder;

  // Same portal-positioning fix as DatePicker.tsx / MonthPicker.tsx — keeps
  // the popup out of any ancestor Modal's overflow-y:auto clipping.
  const pop = usePopover({
    open,
    onClose: () => setOpen(false),
    trigger: btnRef,
    popup: popRef,
    fit: "content",
    returnFocus: true,
  });

  useEffect(() => {
    if (!open) return;
    const p = popRef.current;
    if (!p) return;
    (p.querySelector<HTMLElement>('.tpick__grid--h [tabindex="0"]') ?? p).focus({ preventScroll: true });
  }, [open]);

  const tc = useTranslations("common");
  const pickH = (h: number) => {
    const m = parsed ? parsed.m : 0;
    setCurH(null);
    onChange(`${pad(h)}:${pad(m)}`);
    const p = popRef.current;
    (p?.querySelector<HTMLElement>(`[data-m="${m}"]`) ?? p?.querySelector<HTMLElement>("[data-m]"))?.focus({ preventScroll: true });
  };
  const pickM = (m: number) => { onChange(`${pad(parsed ? parsed.h : 9)}:${pad(m)}`); pop.close(); };

  function openPop() {
    setCurH(null);
    setCurM(null);
    setOpen(true);
  }

  function onTriggerKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowDown" || disabled) return;
    e.preventDefault();
    if (!open) openPop();
    else popRef.current?.querySelector<HTMLElement>('.tpick__grid--h [tabindex="0"]')?.focus({ preventScroll: true });
  }

  function onPopKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const p = popRef.current;
    if (e.key !== "Tab" || !p || !atEdge(p, e.shiftKey)) return;
    if (e.shiftKey) e.preventDefault();
    focusField(btnRef.current);
    pop.close("blur");
  }

  return (
    <div className="mpick tpick" data-open={open}>
      <button
        ref={btnRef}
        type="button"
        className={`mpick__btn${parsed ? "" : " mpick__btn--ph"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPop())}
        onKeyDown={onTriggerKey}
      >
        <IconClock />
        <span className="mpick__val">{parsed ? `${pad(parsed.h)}:${pad(parsed.m)}` : placeholder}</span>
        <span className="mpick__cv" />
      </button>
      {open ? createPortal(
        <>
          {pop.isSheet ? <div className="mpick__scrim" style={{ zIndex: pop.z - 1 }} aria-hidden="true" /> : null}
          <div
            id={popId}
            className={`mpick__pop tpick__pop${pop.isSheet ? " mpick__pop--sheet" : ""}`}
            role="dialog"
            aria-label={label}
            ref={popRef}
            tabIndex={-1}
            data-placement={pop.placement}
            style={pop.style}
            onKeyDown={onPopKey}
          >
            {pop.isSheet ? (
              <div className="mpick__sheethead">
                <span className="mpick__grip" aria-hidden="true" />
                <b className="mpick__title">{label}</b>
                <button type="button" className="mpick__x" aria-label={tc("a11y.close")} onClick={() => pop.close()}>
                  <IconClose />
                </button>
              </div>
            ) : null}
            <div className="tpick__cols">
              <div className="tpick__col">
                <span className="tpick__lbl" id={`${popId}-h`}>{tc("hourShort")}</span>
                <div className="tpick__grid tpick__grid--h" role="listbox" aria-labelledby={`${popId}-h`} onKeyDown={moveInGrid}>
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      role="option"
                      aria-selected={parsed?.h === h}
                      tabIndex={h === tabH ? 0 : -1}
                      className={`tpick__c${parsed?.h === h ? " on" : ""}`}
                      onFocus={() => setCurH(h)}
                      onClick={() => pickH(h)}
                    >
                      {pad(h)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tpick__col">
                <span className="tpick__lbl" id={`${popId}-m`}>{tc("minuteShort")}</span>
                <div className="tpick__grid tpick__grid--m" role="listbox" aria-labelledby={`${popId}-m`} onKeyDown={moveInGrid}>
                  {minutes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="option"
                      aria-selected={parsed?.m === m}
                      tabIndex={m === tabM ? 0 : -1}
                      data-m={m}
                      className={`tpick__c${parsed?.m === m ? " on" : ""}`}
                      onFocus={() => setCurM(m)}
                      onClick={() => pickM(m)}
                    >
                      {pad(m)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {value && clearLabel ? (
              <button type="button" className="mpick__clear" onClick={() => { onChange(""); pop.close(); }}>
                <IconClose />
                {clearLabel}
              </button>
            ) : null}
          </div>
        </>,
        document.body
      ) : null}
    </div>
  );
}
