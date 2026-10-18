"use client";

import "../sx-core.css";
import "./sx-shared.css";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { progressValue } from "./Progress";

export type SxRingProps = { value: number | null; label: string; size?: number; stroke?: number; className?: string; children?: ReactNode };

export function SxRing({ value, label, size = 56, stroke = 5, className, children }: SxRingProps): ReactElement {
  const v = progressValue(value) ?? 0;
  const mid = size / 2;
  const r = Math.max(1, (size - stroke) / 2);
  const c = 2 * Math.PI * r;
  const style = { "--ring-size": `${size}px`, "--ring-c": `${c}` } as CSSProperties;
  return (
    <span
      className={className ? `sx-ring ${className}` : "sx-ring"}
      style={style}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(v)}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="sx-ring__track" cx={mid} cy={mid} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="sx-ring__bar"
          cx={mid}
          cy={mid}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          transform={`rotate(-90 ${mid} ${mid})`}
          data-empty={v <= 0 ? "" : undefined}
        />
      </svg>
      {children ? <span className="sx-ring__center">{children}</span> : null}
    </span>
  );
}
