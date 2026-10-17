"use client";

import "../sx-core.css";
import "../sx-layout.css";
import type { ReactElement, ReactNode } from "react";
import type { SxIcon } from "../types";

export type SxEmptyProps = {
  icon?: SxIcon;
  title: string;
  text?: string;
  action?: ReactNode;
  tone?: "neutral" | "error";
  compact?: boolean;
  role?: "status" | "note" | "none";
};

export function SxEmpty({ icon: Icon, title, text, action, tone = "neutral", compact = false, role = "status" }: SxEmptyProps): ReactElement {
  return (
    <div className="sx-empty" data-kind={tone} data-compact={compact || undefined} role={role === "none" ? undefined : role}>
      {Icon ? <Icon className="sx-empty__icon" size={24} aria-hidden /> : null}
      <p className="sx-empty__title">{title}</p>
      {text ? <p className="sx-empty__text">{text}</p> : null}
      {action ? <div className="sx-empty__action">{action}</div> : null}
    </div>
  );
}
