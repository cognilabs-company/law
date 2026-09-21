"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "next-intl";
import { monthTitle, weekdays } from "@/lib/date";
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
  const wd = weekdays(locale);
  const parsed = parse(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [vy, setVy] = useState(parsed ? parsed.y : today.getFullYear());
  const [vm, setVm] = useState(parsed ? parsed.m : today.getMonth());
  const [typed, setTyped] = useState(() => (parsed ? toTyped(parsed) : ""));
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  // Jump the calendar view (and the typed text) to a new value — during
  // render, not in an effect, so an externally loaded draft never flashes
  // the previous date first. Not run for our own typing, which drives
  // `value` the other way, through onChange.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (parsed) { setVy(parsed.y); setVm(parsed.m); }
    setTyped(parsed ? toTyped(parsed) : "");
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
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    // spaceAbove alone being bigger than spaceBelow isn't enough reason to
    // flip up — a trigger near the top of the screen can have "more room
    // above than below" while both are tiny, which used to flip the popup
    // upward into a cramped spot that then got clamped to the very top of
    // the screen, looking like it opened in the wrong place entirely.
    const openUp = spaceBelow < 320 && spaceAbove > spaceBelow && spaceAbove >= 160;
    // A floor here used to be a flat 280 regardless of how little room the
    // chosen side actually had — for a trigger near the very top of the
    // screen that forced `top` negative and pushed the whole popup off the
    // top of the viewport. Cap the floor at what's really available; the
    // popup already scrolls internally (.mpick__pop) so a shorter box beats
    // one that isn't on screen at all.
    const room = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(Math.max(200, room), window.innerHeight - margin * 2);
    // Popup width comes from its own CSS (min-width, or .dpick's 264px), not
    // the trigger's — but still clamp so it can't render off the right edge.
    const left = Math.min(r.left, window.innerWidth - 280 - margin);
    const top = openUp ? r.top - gap - maxHeight : r.bottom + gap;
    setPos({
      left: Math.max(margin, left),
      // Final safety net, independent of the calculation above: whatever it
      // produced, never let the popup actually render off either edge.
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

  function step(delta: number) {
    let m = vm + delta, y = vy;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setVm(m); setVy(y);
  }
  function pick(d: number) {
    onChange(iso(vy, vm, d));
    setTyped(toTyped({ y: vy, m: vm, d }));
    setOpen(false);
  }

  const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7; // Monday-first offset
  const daysIn = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];

  return (
    <div className="mpick dpick" ref={root} data-open={open}>
      <div
        className={`mpick__btn${parsed ? "" : " mpick__btn--ph"}`}
        onMouseDown={(e) => {
          if (disabled || e.target === inputRef.current) return;
          // An icon/caret click shouldn't steal focus from the text input.
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <IconCalendar />
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          className="mpick__val"
          placeholder={placeholder}
          aria-label={ariaLabel}
          disabled={disabled}
          value={typed}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const t = maskTyped(e.target.value);
            setTyped(t);
            if (t === "") { onChange(""); return; }
            const outIso = parseTyped(t);
            if (outIso && (!min || outIso >= min) && (!max || outIso <= max)) onChange(outIso);
          }}
          onBlur={() => {
            if (typed && !parseTyped(typed)) setTyped(parsed ? toTyped(parsed) : "");
          }}
        />
        <span className="mpick__cv" />
      </div>
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
            <button type="button" className="mpick__clear" onClick={() => { onChange(""); setTyped(""); setOpen(false); }}>
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
