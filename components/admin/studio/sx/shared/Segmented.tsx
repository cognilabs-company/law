"use client";

import "../sx-core.css";
import "./sx-shared.css";
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactElement } from "react";
import { prefersReducedMotion } from "../hooks";
import { glyph } from "../icons";
import type { SxIcon } from "../types";

export type SxSegItem<T extends string> = { value: T; label: string; count?: number | null; icon?: SxIcon; aiId?: string; disabled?: boolean };

export type SxSegmentedProps<T extends string> = {
  items: readonly SxSegItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  stretch?: boolean;
  className?: string;
  aiId?: string;
};

export function SxSegmented<T extends string>({ items, value, onChange, label, size = "md", stretch = false, className, aiId }: SxSegmentedProps<T>): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const shape = items.map((i) => `${i.value}:${i.label}:${i.count ?? ""}`).join("|");

  useLayoutEffect(() => {
    const root = box.current;
    const bar = ind.current;
    if (!root || !bar) return;
    const place = (animate: boolean) => {
      const cur = root.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
      if (!cur) {
        bar.setAttribute("data-off", "");
        return;
      }
      bar.removeAttribute("data-off");
      if (!animate || prefersReducedMotion()) bar.setAttribute("data-still", "");
      bar.style.setProperty("--seg-x", `${cur.offsetLeft}px`);
      bar.style.setProperty("--seg-w", `${cur.offsetWidth}px`);
      if (!animate || prefersReducedMotion()) {
        bar.getBoundingClientRect();
        bar.removeAttribute("data-still");
      }
    };
    place(placed.current);
    placed.current = true;
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place(false));
    ro?.observe(root);
    return () => ro?.disconnect();
  }, [value, shape]);

  const enabled = items.filter((i) => !i.disabled);
  const focusable = enabled.some((i) => i.value === value) ? value : enabled[0]?.value;
  const move = (e: KeyboardEvent<HTMLButtonElement>, from: T) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key) || !enabled.length) return;
    e.preventDefault();
    const at = enabled.findIndex((i) => i.value === from);
    let next = at;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (at + 1) % enabled.length;
    else next = (at - 1 + enabled.length) % enabled.length;
    const target = enabled[next];
    if (!target) return;
    onChange(target.value);
    requestAnimationFrame(() => box.current?.querySelector<HTMLButtonElement>(`[data-seg="${CSS.escape(target.value)}"]`)?.focus());
  };

  return (
    <div
      ref={box}
      className={className ? `sx-seg ${className}` : "sx-seg"}
      role="radiogroup"
      aria-label={label}
      data-size={size}
      data-stretch={stretch ? "" : undefined}
      data-ai-id={aiId}
      data-ai-type={aiId ? "tabs" : undefined}
      data-ai-label={aiId ? label : undefined}
    >
      <span ref={ind} className="sx-seg__ind" aria-hidden="true" data-off="" />
      {items.map((i) => {
        const on = i.value === value;
        return (
          <button
            key={i.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i.value === focusable ? 0 : -1}
            disabled={i.disabled}
            className="sx-seg__btn"
            data-seg={i.value}
            data-ai-id={i.aiId}
            data-ai-type={i.aiId ? "tab" : undefined}
            data-ai-label={i.aiId ? i.label : undefined}
            onClick={() => {
              if (!on) onChange(i.value);
            }}
            onKeyDown={(e) => move(e, i.value)}
          >
            {i.icon ? glyph(i.icon, { size: 15 }) : null}
            <span className="sx-seg__label">{i.label}</span>
            {typeof i.count === "number" ? <span className="sx-seg__count sx-num">{i.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
