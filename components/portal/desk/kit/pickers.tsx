"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { dateOnly, monthTitle, weekdays } from "@/lib/date";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClock, IconClose } from "@/components/icons";
import { useOs } from "./kit";

// The kit's date and time fields. The browser's own pickers speak the
// browser's language (10/20/2026, 12:00 PM) whatever the cabinet is set to;
// these show the date in the cabinet's language and the time on the 24-hour
// clock, and open a calendar (a month to pick a day from) or the hours and
// minutes, drawn the Windows or the Mac way. Values stay ISO: YYYY-MM-DD and
// HH:MM.

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// A small panel under (or over) its field, inside the app's window so it
// takes the app's colours; gone on a click elsewhere or Escape.
function Popover({ anchor, open, onClose, children, label }: { anchor: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ host: HTMLElement; left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const a = anchor.current;
    const host = a?.closest<HTMLElement>(".dx");
    if (!a || !host) return;
    const r = a.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    const w = ref.current?.offsetWidth ?? 280;
    const ph = ref.current?.offsetHeight ?? 300;
    // Under the field when it fits, else over it, else as low as the
    // window allows — never cut by its edge.
    const below = r.bottom + ph + 8 <= h.bottom;
    const above = r.top - ph - 8 >= h.top;
    const top = below ? r.bottom - h.top + 4 : above ? r.top - h.top - ph - 4 : Math.max(8, h.height - ph - 8);
    setPlace({ host, left: Math.max(8, Math.min(r.left - h.left, h.width - w - 8)), top });
  }, [open, anchor]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open, onClose, anchor]);
  if (!open) return null;
  const node = (
    <div ref={ref} className="dx-pop" role="dialog" aria-label={label} style={place ? { left: place.left, top: place.top } : { visibility: "hidden" }}>
      {children}
    </div>
  );
  const host = place?.host ?? anchor.current?.closest<HTMLElement>(".dx");
  return host ? createPortal(node, host) : null;
}

export function DateField({ value, onChange, ariaLabel, placeholder, clearable }: { value: string; onChange: (v: string) => void; ariaLabel: string; placeholder?: string; clearable?: boolean }) {
  const locale = useLocale();
  const k = useTranslations("portal.desk.kit");
  const os = useOs();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState({ y: 2026, m: 0 });
  const [today, setToday] = useState("");
  const show = () => {
    const now = new Date();
    const base = value ? new Date(`${value}T12:00:00`) : now;
    setMonth({ y: base.getFullYear(), m: base.getMonth() });
    setToday(keyOf(now));
    setOpen(true);
  };
  const step = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const first = new Date(month.y, month.m, 1);
  const start = new Date(month.y, month.m, 1 - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    btn.current?.focus();
  };
  return (
    <span className="dx-pick">
      <button ref={btn} type="button" className={`dx-in dx-pick__f${open ? " is-open" : ""}`} onClick={() => (open ? setOpen(false) : show())} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}>
        <span className={value ? "" : "is-ph"}>{value ? dateOnly(value, locale) : placeholder ?? k("pickDate")}</span>
        <IconCalendar aria-hidden />
      </button>
      {clearable && value ? (
        <button type="button" className="dx-pick__x" onClick={() => onChange("")} aria-label={k("clear")} title={k("clear")}>
          <IconClose />
        </button>
      ) : null}
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label={ariaLabel}>
        <div className="dx-cal">
          <header>
            <b>{monthTitle(month.y, month.m, locale)}</b>
            <span>
              <button type="button" onClick={() => step(-1)} aria-label={k("prevMonth")}>
                <IconChevronLeft />
              </button>
              <button type="button" onClick={() => step(1)} aria-label={k("nextMonth")}>
                <IconChevronRight />
              </button>
            </span>
          </header>
          <div className="dx-cal__g" role="grid">
            {weekdays(locale).map((w) => (
              <span key={w} className="dx-cal__w">
                {os === "mac" ? w.slice(0, 2) : w}
              </span>
            ))}
            {cells.map((c) => {
              const ck = keyOf(c);
              return (
                <button key={ck} type="button" role="gridcell" aria-selected={ck === value} className={`${c.getMonth() !== month.m ? "is-out" : ""}${ck === today ? " is-today" : ""}${ck === value ? " is-on" : ""}`} onClick={() => pick(ck)}>
                  {c.getDate()}
                </button>
              );
            })}
          </div>
          <footer>
            <button type="button" onClick={() => pick(today || keyOf(new Date()))}>
              {k("today")}
            </button>
            {clearable && value ? (
              <button type="button" onClick={() => pick("")}>
                {k("clear")}
              </button>
            ) : null}
          </footer>
        </div>
      </Popover>
    </span>
  );
}

// The time on the 24-hour clock: typed (9, 930, 9:30, 21.15) or picked from
// the hours and the minutes.
export function TimeField({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
  const k = useTranslations("portal.desk.kit");
  const box = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setText(value);
  }
  const [h, m] = (value || "09:00").split(":").map(Number);
  const commit = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) return setText(value);
    const hh = digits.length <= 2 ? Number(digits) : Number(digits.slice(0, digits.length - 2));
    const mm = digits.length <= 2 ? 0 : Number(digits.slice(-2));
    if (hh > 23 || mm > 59) return setText(value);
    const v = `${pad(hh)}:${pad(mm)}`;
    setText(v);
    onChange(v);
  };
  const set = (nh: number, nm: number) => onChange(`${pad(nh)}:${pad(nm)}`);
  return (
    <span className="dx-pick" ref={box}>
      <span className={`dx-in dx-pick__f dx-pick__time${open ? " is-open" : ""}`}>
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit(text))} onFocus={() => setOpen(true)} placeholder="09:00" inputMode="numeric" maxLength={5} aria-label={ariaLabel} />
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label={k("pickTime")} tabIndex={-1}>
          <IconClock aria-hidden />
        </button>
      </span>
      <Popover anchor={box} open={open} onClose={() => setOpen(false)} label={ariaLabel}>
        <div className="dx-time">
          <div className="dx-time__col" role="listbox" aria-label={k("hours")}>
            {Array.from({ length: 24 }, (_, i) => (
              <button key={i} type="button" role="option" aria-selected={i === h} className={i === h ? "is-on" : ""} ref={(el) => {
                  if (el && i === h && el.parentElement) el.parentElement.scrollTop = el.offsetTop - 72;
                }} onClick={() => set(i, Number.isFinite(m) ? m : 0)}>
                {pad(i)}
              </button>
            ))}
          </div>
          <div className="dx-time__col" role="listbox" aria-label={k("minutes")}>
            {MINUTES.map((i) => (
              <button key={i} type="button" role="option" aria-selected={i === m} className={i === m ? "is-on" : ""} onClick={() => (set(Number.isFinite(h) ? h : 9, i), setOpen(false))}>
                {pad(i)}
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </span>
  );
}
