"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { IconCheck } from "@/components/icons";

export type OrgMenuItem =
  | { kind?: "item"; label: string; icon?: ComponentType<SVGProps<SVGSVGElement>>; kbd?: string; onSelect: () => void; danger?: boolean; disabled?: boolean; checked?: boolean; hidden?: boolean }
  | { kind: "separator"; hidden?: boolean }
  | { kind: "header"; label: string; hidden?: boolean };

// The board's right-click menu: opened at the point pressed, kept inside the
// board, moved through with the arrow keys, closed by Esc, Tab or a press
// anywhere else (menu / menuitem roles).
export default function OrgContextMenu({ x, y, items, label, onClose }: { x: number; y: number; items: OrgMenuItem[]; label: string; onClose: () => void }) {
  const ref = useRef<HTMLUListElement>(null);
  const [at, setAt] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    // The board it opened in: the menu stays inside it.
    const box = (el?.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    if (!el || !box) return;
    setAt({ x: Math.max(8, Math.min(x, box.width - el.offsetWidth - 8)), y: Math.max(8, Math.min(y, box.height - el.offsetHeight - 8)) });
  }, [x, y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  const move = (dir: 1 | -1) => {
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + dir + els.length) % els.length].focus();
  };

  const visible = items.filter((i) => !i.hidden).filter((it, i, all) => {
    // No separator at the ends, none twice in a row.
    if (it.kind !== "separator") return true;
    const prev = all[i - 1];
    return i > 0 && i < all.length - 1 && prev?.kind !== "separator";
  });
  return (
    <ul
      ref={ref}
      role="menu"
      aria-label={label}
      className="ob-menu"
      style={{ left: at.x, top: at.y }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        } else if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {visible.map((item, i) => {
        if (item.kind === "separator") return <li key={`s${i}`} role="separator" className="ob-menu__sep" />;
        if (item.kind === "header")
          return (
            <li key={`h${i}`} role="presentation" className="ob-menu__h">
              {item.label}
            </li>
          );
        const I = item.icon;
        return (
          <li key={`${item.label}-${i}`} role="none">
            <button
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={item.checked}
              className={`ob-menu__i${item.danger ? " is-danger" : ""}`}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              <span className="ob-menu__ic">{I ? <I aria-hidden /> : null}</span>
              <span className="ob-menu__l">{item.label}</span>
              {item.checked ? <IconCheck className="ob-menu__ck" aria-hidden /> : null}
              {item.kbd ? <kbd>{item.kbd}</kbd> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
