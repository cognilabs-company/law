"use client";

import type { CSSProperties } from "react";
import { IconLock } from "@/components/icons";
import { tileOf, type DeskApp } from "./apps";

// An app's icon: a glossy tile in the app's colours with its glyph.
export function AppTile({ app, size = "md" }: { app: DeskApp; size?: "sm" | "md" | "lg" }) {
  const [a, b] = tileOf(app.key);
  const Icon = app.Icon;
  return (
    <span className={`wd-tile wd-tile--${size}${app.locked ? " is-locked" : ""}`} style={{ "--t0": a, "--t1": b } as CSSProperties} aria-hidden>
      <Icon />
      {app.locked ? (
        <i className="wd-tile__lock">
          <IconLock />
        </i>
      ) : null}
    </span>
  );
}

// A folder: the back, the papers of the first apps in it peeking out in
// their colours, and the front flap.
export function FolderTile({ apps, size = "md" }: { apps: DeskApp[]; size?: "sm" | "md" | "lg" }) {
  const peek = apps.slice(0, 3);
  return (
    <span className={`wd-folder wd-tile--${size}`} aria-hidden>
      <svg viewBox="0 0 64 52">
        <path d="M4 10a4 4 0 0 1 4-4h15l5 5h28a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" fill="#E8A915" />
        {peek.map((app, i) => {
          const [c0, c1] = tileOf(app.key);
          return (
            <g key={app.key} transform={`translate(${12 + i * 13} ${12 - (i % 2) * 2}) rotate(${-6 + i * 6})`}>
              <rect width="16" height="20" rx="2.4" fill={c1} />
              <rect width="16" height="10" rx="2.4" fill={c0} />
            </g>
          );
        })}
        <path d="M2 20a4 4 0 0 1 4-4h52a4 4 0 0 1 4 4l-2 24a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" fill="url(#wd-folder-front)" />
        <path d="M6 20h52" stroke="#FFF3C4" strokeOpacity=".7" strokeWidth="1.2" />
        <defs>
          <linearGradient id="wd-folder-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFD45C" />
            <stop offset="1" stopColor="#F2B428" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}
