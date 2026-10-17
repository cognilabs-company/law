"use client";

import "../sx-core.css";
import "./sx-shared.css";
import type { ReactElement } from "react";

export type SxProgressProps = { value: number | null; label: string; size?: "sm" | "md"; className?: string };

export function progressValue(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

export function SxProgress({ value, label, size = "sm", className }: SxProgressProps): ReactElement {
  const v = progressValue(value);
  return (
    <span
      className={className ? `sx-progress ${className}` : "sx-progress"}
      data-size={size}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v === null ? undefined : Math.round(v)}
      aria-label={label}
    >
      <i style={{ inlineSize: `${v ?? 0}%` }} />
    </span>
  );
}
