"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Option = { value: string; label: string };

export default function Select({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const optRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const selected = options.find((o) => o.value === value) ?? (placeholder ? undefined : options[0]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      // Menu is portaled to document.body (see render), so it's not a DOM
      // descendant of root — check it separately or a click on any option
      // would look "outside" and close the menu before onClick runs.
      if (root.current?.contains(t)) return;
      if (menu.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // Rendered via a portal with inline position:fixed coordinates computed
  // from the trigger's live rect, so the menu can never be clipped by an
  // ancestor Modal's overflow-y:auto/max-height:90vh (or any other
  // scrollable ancestor) — see the identical fix in SearchSelect.tsx.
  const updatePos = () => {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    // spaceAbove alone being bigger than spaceBelow isn't enough reason to
    // flip up — see DatePicker.tsx for why.
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow && spaceAbove >= 120;
    // The 140 floor below used to ignore how little room the chosen side
    // actually had — for a trigger near the very top of the screen that
    // forced `top` negative and pushed the menu off the top of the
    // viewport. Cap it at what's really available; the menu scrolls.
    const room = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(Math.max(140, room), 260, window.innerHeight - margin * 2);
    const top = openUp ? r.top - gap - maxHeight : r.bottom + gap;
    setMenuPos({
      left: r.left,
      width: r.width,
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
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const selectedIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => optRefs.current[selectedIdx]?.focus());
    }
  }, [open, options, value, selectedIdx]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    btn.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      // Move from the focused option (the menu focuses the selected one on open).
      const focused = optRefs.current.findIndex((el) => el === document.activeElement);
      const cur = focused < 0 ? selectedIdx : focused;
      const n = e.key === "ArrowDown" ? Math.min(cur + 1, options.length - 1) : Math.max(cur - 1, 0);
      optRefs.current[n]?.focus();
    }
  }

  return (
    <div className="dsel" ref={root} data-open={open} onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        className="dsel__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`dsel__val${selected ? "" : " dsel__val--ph"}`}>
          {selected?.label ?? placeholder}
        </span>
        <span className="dsel__cv" />
      </button>
      {open && menuPos
        ? createPortal(
            <ul
              className="dsel__menu"
              role="listbox"
              aria-label={ariaLabel}
              ref={menu}
              style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: menuPos.width, maxHeight: menuPos.maxHeight }}
            >
              {options.map((o, i) => (
                <li key={o.value} role="option" aria-selected={o.value === value}>
                  <button
                    ref={(el) => {
                      optRefs.current[i] = el;
                    }}
                    type="button"
                    className="dsel__opt"
                    aria-selected={o.value === value}
                    onClick={() => pick(o.value)}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
}
