"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconCheck } from "@/components/icons";

export type MenuItem =
  | { id: string; label: string; icon?: ReactNode; hint?: string; checked?: boolean; disabled?: boolean; danger?: boolean; onSelect: () => void }
  | { sep: true; id: string }
  | { heading: string; id: string };

// The right-click menu: at the pointer, kept on screen, driven by the
// arrow keys as well, and gone on a click elsewhere, Escape or a choice.
// `up` opens it above the point — for a button at the bottom of a window.
export default function ContextMenu({ at, items, label, onClose }: { at: { x: number; y: number; up?: boolean }; items: MenuItem[]; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(6, Math.min(at.x, window.innerWidth - r.width - 6));
    const y = at.up || at.y + r.height > window.innerHeight - 6 ? Math.max(6, at.y - r.height) : at.y;
    setPos({ x, y });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [at]);

  useEffect(() => {
    const away = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const close = () => onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose();
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!all.length) return;
    if (step) {
      e.preventDefault();
      const at = all.indexOf(document.activeElement as HTMLButtonElement);
      all[(at + step + all.length) % all.length].focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      all[e.key === "Home" ? 0 : all.length - 1].focus();
    }
  };

  return (
    <div ref={ref} className="wd-menu" role="menu" aria-label={label} style={{ left: pos.x, top: pos.y }} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it) =>
        "sep" in it ? (
          <hr key={it.id} role="separator" />
        ) : "heading" in it ? (
          <span key={it.id} className="wd-menu__h" role="presentation">
            {it.heading}
          </span>
        ) : (
          <button
            key={it.id}
            type="button"
            role={it.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={it.checked}
            disabled={it.disabled}
            className={it.danger ? "is-danger" : undefined}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            <span className="wd-menu__i" aria-hidden>
              {it.checked ? <IconCheck /> : it.icon}
            </span>
            <span className="wd-menu__l">{it.label}</span>
            {it.hint ? <kbd>{it.hint}</kbd> : null}
          </button>
        ),
      )}
    </div>
  );
}
