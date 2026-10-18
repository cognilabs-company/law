"use client";

import "../sx-core.css";
import type { ReactElement } from "react";
import { useCountUp } from "../hooks";

export type SxCountProps = { value: number | null; format?: (n: number) => string; empty?: string; className?: string };

export function SxCount({ value, format, empty = "—", className }: SxCountProps): ReactElement {
  const shown = useCountUp(value);
  const text = (n: number | null) => (n === null ? empty : format ? format(n) : String(n));
  return (
    <span className={className ? `sx-num ${className}` : "sx-num"}>
      <span aria-hidden="true">{text(shown)}</span>
      <span className="sx-vh">{text(value)}</span>
    </span>
  );
}
