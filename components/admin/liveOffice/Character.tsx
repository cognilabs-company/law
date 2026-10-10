"use client";

import { useId } from "react";
import type { PersonKind } from "@/lib/liveOffice/model";

// One person in the live office, in the site's own soft style: a whole body
// with arms and legs. The look is stable per account (skin, hair, hair
// colour come from the user id) and the outfit says the role:
//   lead     — blue suit, white shirt, tie
//   operator — cyan polo and a headset
//   lawyer   — green suit with a gold pin
//   jurist   — violet cardigan and glasses
//   client   — amber hoodie, jeans, sneakers
// Poses: at the desk typing ("work"), at the desk with a coffee ("idle"),
// walking, standing in a queue, and the head alone for avatars.
export type Pose = "work" | "idle" | "walk" | "stand" | "head";

const SKIN = ["#F6D2B8", "#EBB894", "#D69A6E", "#B57A50", "#8A5636"];
const HAIR = ["#2B2321", "#4A3426", "#7A4E2D", "#B9803F", "#5B6476"];
const OUTFIT: Record<PersonKind, { top: [string, string]; legs: string; shoes: string }> = {
  lead: { top: ["#3B82F6", "#1550C8"], legs: "#1E293B", shoes: "#111827" },
  operator: { top: ["#22D3EE", "#0891B2"], legs: "#334155", shoes: "#1F2937" },
  lawyer: { top: ["#22B07D", "#0B7A57"], legs: "#1F2937", shoes: "#111827" },
  jurist: { top: ["#9B7BFF", "#6A4BE8"], legs: "#3F3A5A", shoes: "#1F2937" },
  client: { top: ["#FBBF4D", "#E08A12"], legs: "#3B5B8C", shoes: "#F1F5F9" },
};

export const FIG_VIEW = { w: 64, h: 92 };

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
  if (style === 0) return <path d="M21 18C21 9 26 5.5 32 5.5S43 9 43 18c-2.5-4-6-6-11-6s-8.5 2-11 6Z" fill={color} />;
  if (style === 1) return <path d="M21 19c-1-10 5-13.5 11.5-13.5S44 9.5 43 19c-1.5-4-4-6-8-6.5 1 1.5.5 3-.5 3.5-1.5-3-5.5-4.4-9-3.4C23.4 13.4 22 15.6 21 19Z" fill={color} />;
  if (style === 2)
    return (
      <g fill={color}>
        <circle cx="32" cy="4.6" r="4" />
        <path d="M21 18.5c-.4-8.5 5-12.7 11-12.7s11.4 4.2 11 12.7c-3-3.9-6.4-5.9-11-5.9s-8 2-11 5.9Z" />
      </g>
    );
  return <path d="M19.5 24C17.8 13 23 5.2 32 5.2S46.2 13 44.5 24c-.9-3-1.7-5-2.7-6.2-1.4 1.2-3.4 1.2-4.8 0-1.4 1.2-3.6 1.2-5 0-1.4 1.2-3.6 1.2-5 0-1.4 1.2-3.4 1.2-4.8 0-1 1.2-1.8 3.2-2.7 6.2Z" fill={color} />;
}

function Head({ kind, look, pose, uid }: { kind: PersonKind; look: ReturnType<typeof lookOf>; pose: Pose; uid: string }) {
  const sleepy = pose === "idle";
  return (
    <g className="lo-ch__head">
      <rect x="29" y="25.5" width="6" height="7" rx="3" fill={look.skin} />
      <circle cx="32" cy="17" r="11" fill={`url(#s${uid})`} />
      <Hair style={look.style} color={look.hair} />
      {sleepy ? (
        <path d="M26.4 18.8c.9.8 2.3.8 3.2 0M34.4 18.8c.9.8 2.3.8 3.2 0" stroke="#2B2321" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      ) : (
        <g className="lo-ch__eyes" fill="#1E2A3D">
          <ellipse cx="28" cy="18.4" rx="1.4" ry="1.7" />
          <ellipse cx="36" cy="18.4" rx="1.4" ry="1.7" />
        </g>
      )}
      <path d="M26.2 15.6q1.8-1 3.6 0M34.2 15.6q1.8-1 3.6 0" stroke={look.hair} strokeWidth="1" strokeLinecap="round" fill="none" opacity=".8" />
      <path d="M29.8 22.6q2.2 1.6 4.4 0" stroke="#9A4B32" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <circle cx="25.6" cy="21.4" r="1.5" fill="#F28B82" opacity=".35" />
      <circle cx="38.4" cy="21.4" r="1.5" fill="#F28B82" opacity=".35" />
      {kind === "jurist" ? (
        <g stroke="#3B2F7A" strokeWidth="1" fill="none">
          <circle cx="28" cy="18.4" r="2.8" />
          <circle cx="36" cy="18.4" r="2.8" />
          <path d="M30.8 18.4h2.4" />
        </g>
      ) : null}
      {kind === "operator" ? (
        <g fill="none" stroke="#1E2A3D" strokeLinecap="round">
          <path d="M20.6 17c0-7.6 5-12.2 11.4-12.2S43.4 9.4 43.4 17" strokeWidth="1.7" />
          <path d="M21 21c.6 3 3.4 4.6 6.8 4.4" strokeWidth="1.1" />
          <rect x="18.6" y="14" width="3.8" height="7" rx="1.9" fill="#1E2A3D" stroke="none" />
          <rect x="41.6" y="14" width="3.8" height="7" rx="1.9" fill="#1E2A3D" stroke="none" />
          <circle cx="28.2" cy="25.3" r="1.1" fill="#1E2A3D" stroke="none" />
        </g>
      ) : null}
    </g>
  );
}

// Jacket, shirt or hoodie, by role.
function Torso({ kind, uid }: { kind: PersonKind; uid: string }) {
  return (
    <g>
      <path d="M17.5 37c0-4 2.6-6.2 6-6.6h17c3.4.4 6 2.6 6 6.6l-.8 19c0 1.4-1 2.2-2.4 2.2H20.7c-1.4 0-2.4-.8-2.4-2.2Z" fill={`url(#o${uid})`} />
      {kind === "lead" || kind === "lawyer" ? (
        <>
          <path d="M27 30.6 32 39l5-8.4Z" fill="#fff" />
          <path d="M27 30.6 30 41l-3.6-2.4M37 30.6 34 41l3.6-2.4" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="1" />
          {kind === "lead" ? <path d="m32 34.6-1.7 2.2 1.7 9 1.7-9Z" fill="#0B1F45" /> : <circle cx="40.5" cy="40" r="1.6" fill="#FDE68A" />}
        </>
      ) : null}
      {kind === "operator" ? (
        <>
          <path d="M27.5 30.6 32 35l4.5-4.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M32 35v5" stroke="rgba(0,0,0,.18)" strokeWidth="1" />
        </>
      ) : null}
      {kind === "jurist" ? (
        <>
          <path d="M28 30.6 32 38l4-7.4Z" fill="#EDE9FE" />
          <path d="M32 38v17" stroke="rgba(0,0,0,.2)" strokeWidth="1" />
          <circle cx="32" cy="43" r=".9" fill="#fff" />
          <circle cx="32" cy="48" r=".9" fill="#fff" />
          <circle cx="32" cy="53" r=".9" fill="#fff" />
        </>
      ) : null}
      {kind === "client" ? (
        <>
          <path d="M25 30.6c1.4 3 4 4.4 7 4.4s5.6-1.4 7-4.4" fill="none" stroke="#B45309" strokeWidth="1.4" />
          <path d="M29.6 35v6M34.4 35v6" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M24 48h16v6H24Z" fill="rgba(0,0,0,.08)" />
        </>
      ) : null}
    </g>
  );
}

// Front view of a workstation: chair behind, desk with a monitor seen from
// the back. Shared by seated people and the free desks of a room.
export function DeskFront({ empty = false, sleeping = false }: { empty?: boolean; sleeping?: boolean }) {
  return (
    <g className="lo-desk">
      {empty ? (
        <>
          <rect x="15" y="30" width="34" height="30" rx="8" fill="#475569" />
          <rect x="17" y="54" width="30" height="8" rx="3" fill="#334155" />
        </>
      ) : null}
      <rect x="21.5" y="43" width="21" height="14.5" rx="2.2" fill="#CBD5E1" />
      <rect x="21.5" y="43" width="21" height="14.5" rx="2.2" fill="url(#lo-sheen)" opacity=".45" />
      <circle className={sleeping || empty ? "lo-desk__logo is-off" : "lo-desk__logo"} cx="32" cy="50.2" r="1.8" />
      <rect x="30.6" y="57.4" width="2.8" height="3.6" fill="#94A3B8" />
      <path d="M6 61h52l-2.4 4H8.4Z" fill="var(--lo-desk-1)" />
      <rect x="8.4" y="65" width="47.2" height="21" rx="2" fill="var(--lo-desk-2)" />
      <path d="M12 70h14M38 70h14" stroke="rgba(11,31,69,.12)" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="10" y="84" width="3" height="4" rx="1" fill="var(--lo-desk-2)" />
      <rect x="51" y="84" width="3" height="4" rx="1" fill="var(--lo-desk-2)" />
    </g>
  );
}

export default function Character({ id, kind, pose, title }: { id: string; kind: PersonKind; pose: Pose; title?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const look = lookOf(id);
  const o = OUTFIT[kind];
  const [c1, c2] = o.top;
  const head = pose === "head";
  const seated = pose === "work" || pose === "idle";
  const upright = pose === "walk" || pose === "stand";
  return (
    <svg
      className={`lo-ch lo-ch--${pose}`}
      viewBox={head ? "14 3 36 36" : `0 0 ${FIG_VIEW.w} ${FIG_VIEW.h}`}
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
      </defs>

      {!head ? <ellipse className="lo-ch__shadow" cx="32" cy="88.5" rx={seated ? 27 : 12} ry="2.6" /> : null}

      {seated ? (
        // chair back behind the person
        <rect x="14" y="27" width="36" height="34" rx="8" fill="#475569" />
      ) : null}

      {upright ? (
        <g className="lo-ch__legs">
          <g className="lo-ch__leg lo-ch__leg--l">
            <rect x="21.6" y="55" width="9" height="26" rx="4" fill={o.legs} />
            <rect x="19.6" y="79" width="12" height="6.4" rx="3.2" fill={o.shoes} stroke={kind === "client" ? "#CBD5E1" : "none"} strokeWidth=".8" />
          </g>
          <g className="lo-ch__leg lo-ch__leg--r">
            <rect x="33.4" y="55" width="9" height="26" rx="4" fill={o.legs} />
            <rect x="32.4" y="79" width="12" height="6.4" rx="3.2" fill={o.shoes} stroke={kind === "client" ? "#CBD5E1" : "none"} strokeWidth=".8" />
          </g>
        </g>
      ) : null}

      <g className="lo-ch__body">
        {upright ? (
          <g className="lo-ch__arm lo-ch__arm--l">
            <rect x="13.2" y="32.5" width="7.4" height="23" rx="3.7" fill={c2} />
            <circle cx="16.9" cy="56.6" r="3.4" fill={look.skin} />
          </g>
        ) : null}
        {upright ? (
          <g className="lo-ch__arm lo-ch__arm--r">
            <rect x="43.4" y="32.5" width="7.4" height="23" rx="3.7" fill={c2} />
            <circle cx="47.1" cy="56.6" r="3.4" fill={look.skin} />
          </g>
        ) : null}
        <Torso kind={kind} uid={uid} />
        <Head kind={kind} look={look} pose={pose} uid={uid} />
        {kind === "client" && upright ? <path d="M21.5 33.5 19 50M42.5 33.5 45 50" stroke="#7C2D12" strokeWidth="1.6" strokeLinecap="round" opacity=".55" /> : null}
      </g>

      {seated ? (
        <>
          <DeskFront sleeping={pose === "idle"} />
          {pose === "work" ? (
            <g className="lo-ch__arms">
              <path d="M19 35.5 16.6 51l7 9" fill="none" stroke={c2} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M45 35.5 47.4 51l-7 9" fill="none" stroke={c2} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <circle className="lo-ch__hand lo-ch__hand--l" cx="24.2" cy="60.4" r="3.3" fill={look.skin} />
              <circle className="lo-ch__hand lo-ch__hand--r" cx="39.8" cy="60.4" r="3.3" fill={look.skin} />
            </g>
          ) : (
            <g className="lo-ch__arms">
              <path d="M45 35.5 47.4 51l-6 9" fill="none" stroke={c2} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="41" cy="60.4" r="3.3" fill={look.skin} />
              <g className="lo-ch__sip">
                <path d="M19 35.5 16.6 49l6-8" fill="none" stroke={c2} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.6 33.5h6.6v5.6a2.4 2.4 0 0 1-2.4 2.4h-1.8a2.4 2.4 0 0 1-2.4-2.4Z" fill="#fff" stroke="#9AA9BF" strokeWidth=".8" />
                <path d="M27.2 35h.8a1.6 1.6 0 0 1 0 3.2h-.8" stroke="#9AA9BF" strokeWidth=".8" fill="none" />
                <circle cx="22.8" cy="40.6" r="3.2" fill={look.skin} />
                <path className="lo-ch__steam" d="M22.6 31.6c-.8-1 .8-1.6 0-2.8M25.2 31.6c-.8-1 .8-1.6 0-2.8" stroke="#9AA9BF" strokeWidth=".8" strokeLinecap="round" fill="none" />
              </g>
            </g>
          )}
        </>
      ) : null}
    </svg>
  );
}

// Shared once per page: the sheen the monitors reuse.
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
