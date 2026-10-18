"use client";

import "../sx-tones.css";
import "./sx-home.css";
import type { ReactElement } from "react";
import { glyph, groupIcon } from "../icons";

export type GroupTileProps = { groupKey: string; order: number; size?: "md" | "lg"; className?: string };

export function GroupTile({ groupKey, size = "md", className }: GroupTileProps): ReactElement {
  return (
    <span className={className ? `sx-gtile ${className}` : "sx-gtile"} data-size={size} aria-hidden="true">
      {glyph(groupIcon(groupKey))}
    </span>
  );
}
