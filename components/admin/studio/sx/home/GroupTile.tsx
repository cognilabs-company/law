"use client";

import "../sx-tones.css";
import "./sx-home.css";
import type { ReactElement } from "react";
import { glyph, groupIcon } from "../icons";

export type GroupTileProps = { groupKey: string; order: number; size?: "md" | "lg" | "xl"; className?: string };

const ICON_SIZE = { md: 20, lg: 24, xl: 32 } as const;

export function GroupTile({ groupKey, size = "md", className }: GroupTileProps): ReactElement {
  return (
    <span className={className ? `sx-gtile sx-sq ${className}` : "sx-gtile sx-sq"} data-size={size} aria-hidden="true">
      {glyph(groupIcon(groupKey), { size: ICON_SIZE[size] })}
    </span>
  );
}
