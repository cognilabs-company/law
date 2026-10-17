"use client";

import "../sx-tones.css";
import "./sx-home.css";
import type { ReactElement } from "react";
import { GROUP_LINE, GROUP_LINE_FALLBACK } from "../lineIcons";

export type GroupTileProps = { groupKey: string; order: number; size?: "md" | "lg"; className?: string };

const own = (key: string) => Object.prototype.hasOwnProperty.call(GROUP_LINE, key);

export function GroupTile({ groupKey, size = "md", className }: GroupTileProps): ReactElement {
  const Icon = own(groupKey) ? GROUP_LINE[groupKey] : GROUP_LINE_FALLBACK;
  return (
    <span className={className ? `sx-gtile ${className}` : "sx-gtile"} data-size={size} aria-hidden="true">
      <Icon />
    </span>
  );
}
