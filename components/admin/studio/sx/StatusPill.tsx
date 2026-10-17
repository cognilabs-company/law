"use client";

import "./sx-core.css";
import type { ReactElement } from "react";
import { glyph } from "./icons";
import { sxStatus } from "./status";
import type { SxRecordSource } from "./types";
import { useStudioLabels } from "./useStudioLabels";

export type StatusPillProps = {
  status: string;
  source?: SxRecordSource;
  size?: "sm" | "md";
  label?: string;
  glow?: boolean;
  className?: string;
};

export function StatusPill({ status, source, size = "md", label, glow = false, className }: StatusPillProps): ReactElement {
  const labels = useStudioLabels();
  const info = sxStatus(status, source);
  const text = label ?? labels.status(status, source);
  return (
    <span className={className ? `sx-pill ${className}` : "sx-pill"} data-tone={info.tone} data-size={size} data-status={info.key} data-glow={glow ? "" : undefined}>
      {glyph(info.icon, { size: size === "sm" ? 12 : 14 })}
      <span className="sx-pill__text">{text}</span>
    </span>
  );
}
