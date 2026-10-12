"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { fmtDate, monthTitle, weekdays } from "@/lib/date";
import { focusField, isCoarsePointer, useCoarsePointer, usePopover } from "@/lib/usePopover";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClose } from "./icons";

type Parsed = { y: number; m: number; d: number };
type FocusReq = "none" | "grid" | "field";

const CONTENTS: CSSProperties = { display: "contents" };
const TABBABLE = 'button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

function parse(value: string): Parsed | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const y = parseInt(value.slice(0, 4), 10);
  const m = parseInt(value.slice(5, 7), 10) - 1;
  const d = parseInt(value.slice(8, 10), 10);
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  return { y, m, d };
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const toTyped = (p: Parsed) => `${String(p.d).padStart(2, "0")}.${String(p.m + 1).padStart(2, "0")}.${p.y}`;

// Digits typed so far, auto-split into dd.mm.yyyy groups — the same masking
// pattern as the phone input, so a date can be typed as fast as picked
// instead of only clicked day-by-day in the calendar.
function maskTyped(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join(".");
}

// A typed dd.mm.yyyy → ISO, only once all three groups are complete and the
// date is real (no 31.02, no month 13) — an incomplete or invalid typed
// value must never overwrite what is already saved.
function parseTyped(text: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!m) return null;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return iso(y, mo - 1, d);
}

function shiftDays(s: string, n: number): string {
  const p = parse(s);
  if (!p) return s;
  const dt = new Date(p.y, p.m, p.d + n);
  return iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function shiftMonths(s: string, n: number): string {
  const p = parse(s);
  if (!p) return s;
  const total = p.y * 12 + p.m + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  return iso(y, m, Math.min(p.d, new Date(y, m + 1, 0).getDate()));
}

function dowOf(s: string): number {
  const p = parse(s);
  return p ? (new Date(p.y, p.m, p.d).getDay() + 6) % 7 : 0;
}

function clampIso(s: string, lo?: string, hi?: string): string {
  if (lo && s < lo) return lo;
  if (hi && s > hi) return hi;
  return s;
}

function dayOnly(v?: string): string | undefined {
  return v && parse(v) ? v.slice(0, 10) : undefined;
}

function atEdge(root: HTMLElement, back: boolean): boolean {
  const at = document.activeElement;
  if (!(at instanceof HTMLElement) || !root.contains(at)) return false;
  const bit = back ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  return !Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).some(
    (el) => el !== at && el.tabIndex >= 0 && (at.compareDocumentPosition(el) & bit) !== 0,
  );
}

// Handmade day-level date picker (no native <input type=date>). Value is
// "YYYY-MM-DD". min/max (also ISO) disable out-of-range days. The trigger is
// a real text input so a date can be typed (dd.mm.yyyy) as well as picked
// from the calendar — the two stay in sync either way.
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
  const ta = useTranslations("common.a11y");
  const tc = useTranslations("common");
  const wd = weekdays(locale);
  const parsed = parse(value);
  const today = new Date();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());
  const lo = dayOnly(min);
  const hi = dayOnly(max);
  const label = ariaLabel || placeholder;
  const [open, setOpen] = useState(false);
  const [vy, setVy] = useState(parsed ? parsed.y : today.getFullYear());
  const [vm, setVm] = useState(parsed ? parsed.m : today.getMonth());
  const [typed, setTyped] = useState(() => (parsed ? toTyped(parsed) : ""));
  const [cursor, setCursor] = useState("");
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const focusReq = useRef<FocusReq>("none");
  const popId = useId();
  const coarse = useCoarsePointer();

  // Jump the calendar view (and the typed text) to a new value — during
  // render, not in an effect, so an externally loaded draft never flashes
  // the previous date first. Not run for our own typing, which drives
  // `value` the other way, through onChange.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (parsed) { setVy(parsed.y); setVm(parsed.m); }
    setTyped(parsed ? toTyped(parsed) : "");
    setCursor(parsed ? iso(parsed.y, parsed.m, parsed.d) : "");
  }

  // Rendered via a portal with inline position:fixed coordinates computed
  // from the trigger's live rect, so the popup can't be clipped by an
  // ancestor Modal's overflow-y:auto/max-height:90vh (same fix as
  // SearchSelect.tsx / Select.tsx).
  const pop = usePopover({
    open,
    onClose: () => setOpen(false),
    trigger: inputRef,
    anchor: fieldRef,
    popup: popRef,
    fit: "content",
    minWidth: 264,
    maxWidth: 320,
    returnFocus: true,
  });

  useEffect(() => {
    if (!open) return;
    const req = focusReq.current;
    focusReq.current = "none";
    const p = popRef.current;
    if (!p || req === "none") return;
    const target =
      req === "field"
        ? p.querySelector<HTMLElement>(".mpick__sheetval")
        : (cursor ? p.querySelector<HTMLElement>(`.dpick__d[data-iso="${cursor}"]:not(:disabled)`) : null) ??
          p.querySelector<HTMLElement>('.dpick__d[tabindex="0"]');
    (target ?? p).focus({ preventScroll: true });
  }, [open, cursor, vy, vm]);

  function openCal(focus: FocusReq) {
    if (disabled) return;
    const now = new Date();
    const sel = parsed ? iso(parsed.y, parsed.m, parsed.d) : "";
    const start = clampIso(sel || iso(now.getFullYear(), now.getMonth(), now.getDate()), lo, hi);
    const p = parse(start);
    if (p) { setVy(p.y); setVm(p.m); }
    setCursor(start);
    focusReq.current = focus;
    setOpen(true);
  }

  function focusGrid() {
    popRef.current?.querySelector<HTMLElement>('.dpick__d[tabindex="0"]')?.focus({ preventScroll: true });
  }

  function inRange(s: string | null): s is string {
    return !!s && (!lo || s >= lo) && (!hi || s <= hi);
  }

  function typeText(raw: string) {
    const t = maskTyped(raw);
    setTyped(t);
    if (t === "") { onChange(""); return; }
    const outIso = parseTyped(t);
    if (inRange(outIso)) onChange(outIso);
  }

  function settleTyped() {
    if (typed && !inRange(parseTyped(typed))) setTyped(parsed ? toTyped(parsed) : "");
  }

  function step(delta: number) {
    let m = vm + delta, y = vy;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setVm(m); setVy(y);
  }
  function pick(d: number) {
    onChange(iso(vy, vm, d));
    setTyped(toTyped({ y: vy, m: vm, d }));
    pop.close();
  }

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openCal(e.altKey ? "none" : "grid");
      else if (!e.altKey) focusGrid();
      return;
    }
    if (!open) return;
    if ((e.key === "ArrowUp" && e.altKey) || e.key === "Enter") {
      e.preventDefault();
      pop.close();
    }
  }

  function onSheetKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusGrid();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (inRange(parseTyped(typed))) pop.close();
    }
  }

  function onGridKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const from = e.target instanceof HTMLElement ? e.target.dataset.iso : undefined;
    if (!from) return;
    let next: string;
    switch (e.key) {
      case "ArrowLeft": next = shiftDays(from, -1); break;
      case "ArrowRight": next = shiftDays(from, 1); break;
      case "ArrowUp": next = shiftDays(from, -7); break;
      case "ArrowDown": next = shiftDays(from, 7); break;
      case "Home": next = shiftDays(from, -dowOf(from)); break;
      case "End": next = shiftDays(from, 6 - dowOf(from)); break;
      case "PageUp": next = shiftMonths(from, e.shiftKey ? -12 : -1); break;
      case "PageDown": next = shiftMonths(from, e.shiftKey ? 12 : 1); break;
      default: return;
    }
    e.preventDefault();
    const target = clampIso(next, lo, hi);
    const p = parse(target);
    if (!p) return;
    const cell = popRef.current?.querySelector<HTMLElement>(`.dpick__d[data-iso="${target}"]`);
    setCursor(target);
    if (cell) {
      cell.focus({ preventScroll: true });
      return;
    }
    focusReq.current = "grid";
    setVy(p.y);
    setVm(p.m);
  }

  function onPopKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const p = popRef.current;
    if (e.key !== "Tab" || !p || !atEdge(p, e.shiftKey)) return;
    if (e.shiftKey) e.preventDefault();
    focusField(inputRef.current);
    pop.close("blur");
  }

  const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7; // Monday-first offset
  const daysIn = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const ym = `${vy}-${String(vm + 1).padStart(2, "0")}`;
  const usable = (s: string) => s.startsWith(ym) && !(lo && s < lo) && !(hi && s > hi);
  const selIso = parsed ? iso(parsed.y, parsed.m, parsed.d) : "";
  const tabIso =
    [cursor, selIso, todayIso].find((s) => s && usable(s)) ??
    Array.from({ length: daysIn }, (_, i) => iso(vy, vm, i + 1)).find(usable) ??
    "";

  return (
    <div className="mpick dpick" data-open={open}>
      <div
        ref={fieldRef}
        className={`mpick__btn${parsed ? "" : " mpick__btn--ph"}`}
        onMouseDown={(e) => {
          if (disabled || e.button !== 0) return;
          if (pop.isSheet) {
            e.preventDefault();
            if (!open) openCal(isCoarsePointer() ? "grid" : "field");
            return;
          }
          if (e.target === inputRef.current) {
            if (!open) openCal("none");
            return;
          }
          // An icon/caret click shouldn't steal focus from the text input.
          e.preventDefault();
          if (open) { pop.close(); return; }
          openCal("none");
          focusField(inputRef.current);
        }}
        onClick={(e) => {
          if (pop.isSheet) e.preventDefault();
        }}
      >
        <IconCalendar />
        <input
          ref={inputRef}
          type="text"
          inputMode={coarse ? "none" : "numeric"}
          autoComplete="off"
          maxLength={10}
          className="mpick__val"
          placeholder={placeholder}
          aria-label={ariaLabel}
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          disabled={disabled}
          value={typed}
          onKeyDown={onInputKey}
          onChange={(e) => typeText(e.target.value)}
          onBlur={settleTyped}
        />
        <span className="mpick__cv" />
      </div>
      {open ? createPortal(
        <>
          {pop.isSheet ? <div className="mpick__scrim" style={{ zIndex: pop.z - 1 }} aria-hidden="true" /> : null}
          <div
            id={popId}
            className={`mpick__pop${pop.isSheet ? " mpick__pop--sheet" : ""}`}
            role="dialog"
            aria-label={label}
            ref={popRef}
            tabIndex={-1}
            data-placement={pop.placement}
            style={pop.style}
            onMouseDown={(e) => {
              if (!pop.isSheet && document.activeElement === inputRef.current) e.preventDefault();
            }}
            onKeyDown={onPopKey}
          >
            {pop.isSheet ? (
              <div className="mpick__sheethead">
                <span className="mpick__grip" aria-hidden="true" />
                <b className="mpick__title">{label}</b>
                <button type="button" className="mpick__x" aria-label={ta("close")} onClick={() => pop.close()}>
                  <IconClose />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  className="mpick__sheetval"
                  placeholder={tc("dateFormat")}
                  aria-label={label}
                  disabled={disabled}
                  value={typed}
                  onKeyDown={onSheetKey}
                  onChange={(e) => typeText(e.target.value)}
                  onBlur={settleTyped}
                />
              </div>
            ) : null}
            <div className="mpick__nav">
              <button type="button" aria-label={ta("prev")} onClick={() => step(-1)}><IconChevronLeft /></button>
              <b>{monthTitle(vy, vm, locale)}</b>
              <button type="button" aria-label={ta("next")} onClick={() => step(1)}><IconChevronRight /></button>
            </div>
            <div className="dpick__wd" aria-hidden="true">
              {wd.map((w, i) => <span key={i}>{w}</span>)}
            </div>
            <div className="dpick__grid" role="grid" aria-label={monthTitle(vy, vm, locale)} onKeyDown={onGridKey}>
              {weeks.map((week, wi) => (
                <div key={wi} role="row" style={CONTENTS}>
                  {week.map((d, i) => {
                    if (d == null) return <span key={`b${i}`} role="gridcell" className="dpick__blank" />;
                    const cellIso = iso(vy, vm, d);
                    const off = (lo && cellIso < lo) || (hi && cellIso > hi);
                    const on = cellIso === selIso;
                    const now = cellIso === todayIso;
                    return (
                      <span key={cellIso} role="gridcell" aria-selected={on} style={CONTENTS}>
                        <button
                          type="button"
                          className={`dpick__d${on ? " on" : ""}${now ? " is-today" : ""}`}
                          data-iso={cellIso}
                          tabIndex={cellIso === tabIso ? 0 : -1}
                          aria-label={fmtDate(cellIso, locale)}
                          aria-current={now ? "date" : undefined}
                          disabled={!!off}
                          onClick={() => pick(d)}
                        >
                          {d}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            {value && clearLabel ? (
              <button type="button" className="mpick__clear" onClick={() => { onChange(""); setTyped(""); pop.close(); }}>
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
