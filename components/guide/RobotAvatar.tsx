"use client";

import { useId } from "react";

export default function RobotAvatar({ size = 40, mood = "idle", className = "" }: { size?: number; mood?: "idle" | "talk" | "think"; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const head = `rah-${uid}`;
  const glow = `rag-${uid}`;
  return (
    <span className={`ravatar ravatar--${mood}${className ? ` ${className}` : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <defs>
          <linearGradient id={head} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#D6E6FF" />
          </linearGradient>
          <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#B9F2FF" />
            <stop offset="1" stopColor="#00CFE8" />
          </radialGradient>
        </defs>
        <line x1="24" y1="5" x2="24" y2="11" stroke="#93C6FF" strokeWidth="2" strokeLinecap="round" />
        <circle className="ravatar__beacon" cx="24" cy="5" r="3" fill={`url(#${glow})`} />
        <rect x="6" y="11" width="36" height="29" rx="11" fill={`url(#${head})`} stroke="#93C6FF" strokeWidth="1.4" />
        <rect x="11" y="17" width="26" height="15" rx="7.5" fill="#0B1F45" />
        <g className="ravatar__eyes">
          <rect x="16" y="21" width="5" height="7" rx="2.5" fill={`url(#${glow})`} />
          <rect x="27" y="21" width="5" height="7" rx="2.5" fill={`url(#${glow})`} />
        </g>
        <rect className="ravatar__mouth" x="21" y="35" width="6" height="1.6" rx="0.8" fill="#5CA8FF" />
        <rect x="3" y="22" width="3.5" height="9" rx="1.75" fill="#93C6FF" />
        <rect x="41.5" y="22" width="3.5" height="9" rx="1.75" fill="#93C6FF" />
      </svg>
    </span>
  );
}
