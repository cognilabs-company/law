"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useScrollEdges } from "@/lib/useScrollEdges";

export type SegmentedOption<V extends string = string> = {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  count?: number | null;
  disabled?: boolean;
  aiId?: string;
  aiLabel?: string;
};

export type SegmentedProps<V extends string = string> = {
  value: V | null | undefined;
  options: readonly SegmentedOption<V>[];
  onChange: (value: V) => void;
  label?: string;
  labelledBy?: string;
  size?: "sm" | "md";
  look?: "accent" | "soft";
  full?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  aiId?: string;
  aiTarget?: string;
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const NEXT_KEYS = ["ArrowRight", "ArrowDown"];
const PREV_KEYS = ["ArrowLeft", "ArrowUp"];

export default function Segmented<V extends string = string>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  size = "md",
  look = "accent",
  full = false,
  disabled = false,
  className,
  id,
  aiId,
  aiTarget,
}: SegmentedProps<V>) {
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollEdges(rootRef, { silent: true });
  const usable = options.filter((o) => !o.disabled && !disabled);
  const checked = options.find((o) => o.value === value && !o.disabled && !disabled);
  const stop = checked?.value ?? usable[0]?.value;

  const focusValue = (v: V) => {
    const at = options.findIndex((o) => o.value === v);
    rootRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[at]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, v: V) => {
    if (!usable.length) return;
    const i = usable.findIndex((o) => o.value === v);
    const n = usable.length;
    let next: SegmentedOption<V> | undefined;
    if (NEXT_KEYS.includes(e.key)) next = usable[(i + 1 + n) % n];
    else if (PREV_KEYS.includes(e.key)) next = usable[(i - 1 + n) % n];
    else if (e.key === "Home") next = usable[0];
    else if (e.key === "End") next = usable[n - 1];
    if (!next) return;
    e.preventDefault();
    if (next.value !== value) onChange(next.value);
    focusValue(next.value);
  };

  return (
    <div
      ref={rootRef}
      id={id}
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      className={cx("segs", "useg", "scue-x", size === "sm" && "useg--sm", look === "soft" && "useg--soft", full && "useg--full", className)}
      data-ai-id={aiId}
      data-ai-type={aiId ? "select" : undefined}
      data-ai-label={aiId ? label : undefined}
      data-ai-target={aiTarget}
    >
      {options.map((o) => {
        const on = checked?.value === o.value;
        const off = disabled || Boolean(o.disabled);
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={o.value === stop ? 0 : -1}
            disabled={off}
            className="seg"
            onClick={() => {
              if (!on && !off) onChange(o.value);
            }}
            onKeyDown={(e) => onKey(e, o.value)}
            data-ai-id={o.aiId}
            data-ai-type={o.aiId ? "button" : undefined}
            data-ai-label={o.aiId ? (o.aiLabel ?? (typeof o.label === "string" ? o.label : undefined)) : undefined}
          >
            {o.icon ? (
              <span className="seg__ic" aria-hidden="true">
                {o.icon}
              </span>
            ) : null}
            <span className="seg__t">{o.label}</span>
            {typeof o.count === "number" ? <span className="seg__n">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
