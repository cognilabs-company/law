"use client";

import { useId } from "react";
import type { PersonKind } from "@/lib/liveOffice/model";

// One person in the live office: a soft, rounded figure in the site's own
// palette (not pixel art). The look is stable per account — skin, hair and
// hair colour come from the user id — and the outfit says the role.
export type Pose = "work" | "idle" | "walk" | "head";

const SKIN = ["#F6D2B8", "#EBB894", "#D69A6E", "#B57A50", "#8A5636"];
const HAIR = ["#2B2321", "#4A3426", "#7A4E2D", "#B9803F", "#5B6476"];
const OUTFIT: Record<PersonKind, [string, string]> = {
  lead: ["#3B82F6", "#1550C8"],
  operator: ["#22D3EE", "#0891B2"],
  lawyer: ["#22B07D", "#0B7A57"],
  jurist: ["#9B7BFF", "#6A4BE8"],
  client: ["#FBBF4D", "#E08A12"],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function lookOf(id: string) {
  const h = hash(id || "x");
  return { skin: SKIN[h % SKIN.length], hair: HAIR[(h >>> 3) % HAIR.length], style: (h >>> 6) % 4, blink: (h % 40) / 10 };
}

function Hair({ style, color }: { style: number; color: string }) {
  if (style === 0) return <path d="M19.5 22c-.6-8 5-12.5 12.5-12.5S45.2 14 44.5 22c-2.4-3.6-6-5.6-12.5-5.6S21.9 18.4 19.5 22Z" fill={color} />;
  if (style === 1) return <path d="M19.4 23c-1-9 5.2-13.6 13-13.4 6.8.2 12.6 4.6 12 13.4-1.6-4-4.4-6.4-9.6-6.8 1 1.6 1 3-.4 4-1.8-3.2-5.6-4.6-9.8-4-2.4.4-4.2 3-5.2 6.8Z" fill={color} />;
  if (style === 2)
    return (
      <g fill={color}>
        <circle cx="32" cy="7.6" r="4.6" />
        <path d="M19.6 22.4c-.4-8 5.2-12.6 12.4-12.6s12.8 4.6 12.4 12.6c-3-4.2-7.2-6-12.4-6s-9.4 1.8-12.4 6Z" />
      </g>
    );
  return <path d="M18.6 25.6c-2-9.6 4.2-16 13.4-16s15.4 6.4 13.4 16c-.8-2.6-1.6-4.2-2.6-5.4-1.4 1.2-3.6 1.2-5.2 0-1.4 1.2-3.6 1.2-5.2 0-1.6 1.2-3.8 1.2-5.2 0-1.6 1.2-3.8 1.2-5.2 0-1 1.2-1.8 2.8-3.4 5.4Z" fill={color} />;
}

export default function Character({ id, kind, pose, title }: { id: string; kind: PersonKind; pose: Pose; title?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const look = lookOf(id);
  const [c1, c2] = OUTFIT[kind];
  const head = pose === "head";
  const seated = pose === "work" || pose === "idle";
  return (
    <svg
      className={`lo-ch lo-ch--${pose}`}
      viewBox={head ? "12 2 40 40" : "0 0 64 76"}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ ["--lo-blink" as string]: `${look.blink}s` }}
    >
      <defs>
        <radialGradient id={`s${uid}`} cx="34%" cy="22%" r="62%">
          <stop offset="0" stopColor="#fff" stopOpacity=".3" />
          <stop offset=".35" stopColor={look.skin} />
          <stop offset="1" stopColor={look.skin} />
        </radialGradient>
        <linearGradient id={`o${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
        <linearGradient id={`d${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--lo-desk-1)" />
          <stop offset="1" stopColor="var(--lo-desk-2)" />
        </linearGradient>
      </defs>

      {!head ? <ellipse className="lo-ch__shadow" cx="32" cy="72" rx={seated ? 26 : 13} ry="3" /> : null}

      {pose === "walk" ? (
        <g className="lo-ch__legs">
          <rect className="lo-ch__leg lo-ch__leg--l" x="24.5" y="54" width="6" height="16" rx="3" fill="#33415C" />
          <rect className="lo-ch__leg lo-ch__leg--r" x="33.5" y="54" width="6" height="16" rx="3" fill="#33415C" />
        </g>
      ) : null}

      <g className="lo-ch__body">
        {/* torso */}
        <path d={head ? "M17 44c0-6 6.6-10 15-10s15 4 15 10Z" : "M17.5 58V45c0-5.8 6.4-9.6 14.5-9.6s14.5 3.8 14.5 9.6v13Z"} fill={`url(#o${uid})`} />
        <path d="M27.6 36.4 32 42l4.4-5.6c-1.4-.6-2.8-.9-4.4-.9s-3 .3-4.4.9Z" fill="#fff" opacity=".9" />
        {kind === "lead" ? <path d="m32 41.4-1.8 2.4 1.8 7.6 1.8-7.6Z" fill="#0B1F45" /> : null}
        {kind === "lawyer" ? <circle cx="40.6" cy="44.6" r="1.8" fill="#FDE68A" /> : null}
        {kind === "client" ? <path d="M23.6 39.6c2 4.4 2.6 9 2.6 14.4M40.4 39.6c-2 4.4-2.6 9-2.6 14.4" stroke="#B45309" strokeWidth="1.2" fill="none" opacity=".55" /> : null}

        {/* neck + head */}
        <rect x="29" y="30" width="6" height="7" rx="3" fill={look.skin} />
        <g className="lo-ch__head">
          <circle cx="32" cy="22" r="12.4" fill={`url(#s${uid})`} />
          <Hair style={look.style} color={look.hair} />
          {pose === "idle" ? (
            <g stroke="#2B2321" strokeWidth="1.4" strokeLinecap="round" fill="none">
              <path d="M26.2 24h3.4M34.4 24h3.4" />
            </g>
          ) : (
            <g className="lo-ch__eyes" fill="#1E2A3D">
              <ellipse cx="27.8" cy="23.6" rx="1.5" ry="1.8" />
              <ellipse cx="36.2" cy="23.6" rx="1.5" ry="1.8" />
            </g>
          )}
          <path d="M29.4 28.2c1.6 1.2 3.6 1.2 5.2 0" stroke="#9A4B32" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <circle cx="24.6" cy="27" r="1.6" fill="#F28B82" opacity=".35" />
          <circle cx="39.4" cy="27" r="1.6" fill="#F28B82" opacity=".35" />
          {kind === "jurist" ? (
            <g stroke="#3B2F7A" strokeWidth="1.1" fill="none">
              <circle cx="27.8" cy="23.6" r="3" />
              <circle cx="36.2" cy="23.6" r="3" />
              <path d="M30.8 23.6h2.4" />
            </g>
          ) : null}
          {kind === "operator" ? (
            <g fill="none" stroke="#1E2A3D" strokeWidth="1.8" strokeLinecap="round">
              <path d="M19.2 22.6c0-8 5.6-13 12.8-13s12.8 5 12.8 13" />
              <path d="M20 26.6c.8 3.4 3.8 5.4 7.4 5.4" strokeWidth="1.2" />
              <rect x="17.4" y="20.4" width="4" height="7" rx="2" fill="#1E2A3D" stroke="none" />
              <rect x="42.6" y="20.4" width="4" height="7" rx="2" fill="#1E2A3D" stroke="none" />
            </g>
          ) : null}
        </g>
      </g>

      {seated ? (
        <g className="lo-ch__desk">
          {/* laptop, seen from behind, then the desk in front */}
          <g className="lo-ch__laptop">
            <rect x="19" y="43" width="26" height="15.5" rx="2.6" fill="#C9D3E3" />
            <rect x="19" y="43" width="26" height="15.5" rx="2.6" fill="url(#lo-sheen)" opacity=".5" />
            <circle className="lo-ch__logo" cx="32" cy="50.6" r="2" />
          </g>
          <g className="lo-ch__hands" fill={look.skin}>
            <ellipse cx="17.4" cy="58.6" rx="3.2" ry="2.4" />
            <ellipse cx="46.6" cy="58.6" rx="3.2" ry="2.4" />
          </g>
          <rect x="4" y="58.5" width="56" height="5.5" rx="2.75" fill={`url(#d${uid})`} />
          <rect x="9" y="64" width="46" height="6.5" rx="2" fill="var(--lo-desk-2)" opacity=".55" />
          {pose === "idle" ? (
            <g className="lo-ch__mug">
              <path d="M50.4 50.6h6.2v5.4a2.6 2.6 0 0 1-2.6 2.6h-1a2.6 2.6 0 0 1-2.6-2.6Z" fill="#fff" stroke="#9AA9BF" strokeWidth=".8" />
              <path d="M56.6 52.2h.8a1.6 1.6 0 0 1 0 3.2h-.8" stroke="#9AA9BF" strokeWidth=".8" fill="none" />
              <path className="lo-ch__steam" d="M52.6 48.6c-.8-1 .8-1.6 0-2.8M55 48.6c-.8-1 .8-1.6 0-2.8" stroke="#9AA9BF" strokeWidth=".8" strokeLinecap="round" fill="none" />
            </g>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

// Shared once per page: the sheen the laptops reuse.
export function CharacterDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <linearGradient id="lo-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
