"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { monthNames, monthTitle } from "@/lib/date";
import { focusField, usePopover } from "@/lib/usePopover";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClose } from "./icons";

type Parsed = { y: number; m: number };

const TABBABLE = 'button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

function parse(value: string): Parsed | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const y = parseInt(value.slice(0, 4), 10);
  const m = parseInt(value.slice(5, 7), 10) - 1;
  if (m < 0 || m > 11) return null;
  return { y, m };
}

function atEdge(root: HTMLElement, back: boolean): boolean {
  const at = document.activeElement;
  if (!(at instanceof HTMLElement) || !root.contains(at)) return false;
  const bit = back ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  return !Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).some(
    (el) => el !== at && el.tabIndex >= 0 && (at.compareDocumentPosition(el) & bit) !== 0,
  );
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
  const ta = useTranslations("common.a11y");
  const months = monthNames(locale);
  const parsed = parse(value);
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    parsed ? parsed.y : new Date().getFullYear(),
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const [cur, setCur] = useState(-1);
  const tabM = cur >= 0 ? cur : parsed && parsed.y === viewYear ? parsed.m : viewYear === now.getFullYear() ? now.getMonth() : 0;

  // Jump the year view to a new value (during render, not in an effect).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (parsed) setViewYear(parsed.y);
  }

  // Same portal-positioning fix as DatePicker.tsx — keeps the popup out of
  // any ancestor Modal's overflow-y:auto clipping.
  const pop = usePopover({
    open,
    onClose: () => setOpen(false),
    trigger: btnRef,
    popup: popRef,
    fit: "content",
    minWidth: 264,
    maxWidth: 320,
    returnFocus: true,
  });

  useEffect(() => {
    if (!open) return;
    const p = popRef.current;
    if (!p) return;
    (p.querySelector<HTMLElement>('.mpick__m[tabindex="0"]') ?? p).focus({ preventScroll: true });
  }, [open]);

  function openPop() {
    if (disabled) return;
    setViewYear(parsed ? parsed.y : new Date().getFullYear());
    setCur(-1);
    setOpen(true);
  }

  function pick(m: number) {
    onChange(`${viewYear}-${String(m + 1).padStart(2, "0")}`);
    pop.close();
  }

  function onTriggerKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowDown" || disabled) return;
    e.preventDefault();
    if (!open) openPop();
    else popRef.current?.querySelector<HTMLElement>('.mpick__m[tabindex="0"]')?.focus({ preventScroll: true });
  }

  function onGridKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(".mpick__m"));
    const i = e.target instanceof HTMLButtonElement ? btns.indexOf(e.target) : -1;
    if (i < 0) return;
    let j: number;
    switch (e.key) {
      case "ArrowLeft": j = i - 1; break;
      case "ArrowRight": j = i + 1; break;
      case "ArrowUp": j = i - 3; break;
      case "ArrowDown": j = i + 3; break;
      case "Home": j = 0; break;
      case "End": j = btns.length - 1; break;
      case "PageUp":
        e.preventDefault();
        setViewYear((y) => y - 1);
        return;
      case "PageDown":
        e.preventDefault();
        setViewYear((y) => y + 1);
        return;
      default: return;
    }
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, j))]?.focus({ preventScroll: true });
  }

  function onPopKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const p = popRef.current;
    if (e.key !== "Tab" || !p || !atEdge(p, e.shiftKey)) return;
    if (e.shiftKey) e.preventDefault();
    focusField(btnRef.current);
    pop.close("blur");
  }

  const label = parsed ? monthTitle(parsed.y, parsed.m, locale) : placeholder;
  const title = ariaLabel || placeholder;

  return (
    <div className="mpick" data-open={open}>
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
        <IconCalendar />
        <span className="mpick__val">{label}</span>
        <span className="mpick__cv" />
      </button>
      {open ? createPortal(
        <>
          {pop.isSheet ? <div className="mpick__scrim" style={{ zIndex: pop.z - 1 }} aria-hidden="true" /> : null}
          <div
            id={popId}
            className={`mpick__pop${pop.isSheet ? " mpick__pop--sheet" : ""}`}
            role="dialog"
            aria-label={title}
            ref={popRef}
            tabIndex={-1}
            data-placement={pop.placement}
            style={pop.style}
            onKeyDown={onPopKey}
          >
            {pop.isSheet ? (
              <div className="mpick__sheethead">
                <span className="mpick__grip" aria-hidden="true" />
                <b className="mpick__title">{title}</b>
                <button type="button" className="mpick__x" aria-label={ta("close")} onClick={() => pop.close()}>
                  <IconClose />
                </button>
              </div>
            ) : null}
            <div className="mpick__nav">
              <button type="button" aria-label={ta("prev")} onClick={() => setViewYear((y) => y - 1)}>
                <IconChevronLeft />
              </button>
              <b>{viewYear}</b>
              <button type="button" aria-label={ta("next")} onClick={() => setViewYear((y) => y + 1)}>
                <IconChevronRight />
              </button>
            </div>
            <div className="mpick__grid" role="listbox" aria-label={String(viewYear)} onKeyDown={onGridKey}>
              {months.map((mn, i) => {
                const on = !!parsed && parsed.y === viewYear && parsed.m === i;
                return (
                  <button
                    key={i}
                    type="button"
                    role="option"
                    aria-selected={on}
                    aria-label={monthTitle(viewYear, i, locale)}
                    tabIndex={i === tabM ? 0 : -1}
                    className={`mpick__m${on ? " on" : ""}`}
                    onFocus={() => setCur(i)}
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
                  pop.close();
                }}
              >
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
