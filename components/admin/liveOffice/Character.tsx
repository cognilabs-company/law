"use client";

import { useId, type ReactNode } from "react";
import type { PersonKind } from "@/lib/liveOffice/model";

// One person in the live office, drawn top-down at ¾ like a cosy office
// game: a big head, a body with arms and hands, legs and shoes. The look is
// stable per account (skin, hair, hair colour from the user id); the outfit
// says the role:
//   lead     — blue suit, white shirt, tie
//   operator — cyan polo and a headset
//   lawyer   — green suit with a gold pin
//   jurist   — violet cardigan and glasses
//   client   — amber hoodie, jeans, sneakers
// Every pose sits in the same 77×90 box with its anchor at (38.5, 88): the
// bottom of the desk, the chair, the sofa, or the feet.
export type Pose = "work" | "back" | "sofa" | "mug" | "idle" | "walk" | "stand" | "head";

export const FIG_VIEW = { w: 77, h: 90, ax: 38.5, ay: 88 };

const SKIN = ["#F6D2B8", "#EBB894", "#D69A6E", "#B57A50", "#8A5636"];
const HAIR = ["#2B2321", "#4A3426", "#7A4E2D", "#B9803F", "#5B6476"];
const OUTFIT: Record<PersonKind, { top: [string, string]; legs: string; shoes: string }> = {
  lead: { top: ["#3B82F6", "#1D4ED8"], legs: "#1E293B", shoes: "#111827" },
  operator: { top: ["#22D3EE", "#0891B2"], legs: "#334155", shoes: "#1F2937" },
  lawyer: { top: ["#22B07D", "#0B7A57"], legs: "#1F2937", shoes: "#111827" },
  jurist: { top: ["#A78BFA", "#7C3AED"], legs: "#3F3A5A", shoes: "#1F2937" },
  client: { top: ["#FBBF4D", "#E08A12"], legs: "#3B5B8C", shoes: "#F8FAFC" },
};
const CHAIR = "#3F4A5F";

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

type Look = ReturnType<typeof lookOf>;
type Ctx = { look: Look; kind: PersonKind; c1: string; c2: string; legs: string; shoes: string; uid: string };

// ── heads ───────────────────────────────────────────────────────────────────
// Every head is drawn around (38.5, cy) with radius 11.5.

function hairFront(style: number, cy: number): ReactNode {
  const d = cy - 41;
  const t = (p: string) => <path d={p} transform={`translate(0 ${d})`} />;
  if (style === 0) return t("M27 41C27 31.5 32 27.5 38.5 27.5S50 31.5 50 41c-3-4-6.5-5.5-11.5-5.5S30 37 27 41Z");
  if (style === 1) return t("M27 42c-1-10 5-14.5 12-14.5S51 32.5 50 42c-1.5-4.5-4-6.5-8-7 1 1.5.5 3-.5 3.5-1.5-3-5.5-4.5-9-3.5-2.5.8-4.5 3.4-5.5 7Z");
  if (style === 2)
    return (
      <g transform={`translate(0 ${d})`}>
        <circle cx="38.5" cy="26.6" r="4.6" />
        <path d="M27 41C27 31.5 32 27.6 38.5 27.6S50 31.5 50 41c-3-4-6.5-5.5-11.5-5.5S30 37 27 41Z" />
      </g>
    );
  return t("M25.5 49c-1.5-13 3.5-21.8 13-21.8S53 36 51.5 49c-1-4-1.9-6.4-2.9-7.8-1.6 1.4-3.6 1.4-5 0-1.6 1.4-3.6 1.4-5.1 0-1.5 1.4-3.5 1.4-5.1 0-1.4 1.4-3.4 1.4-5 0-1 1.4-1.9 3.8-2.9 7.8Z");
}

function HeadFront({ x, cy, sleepy = false }: { x: Ctx; cy: number; sleepy?: boolean }) {
  const { look, kind, uid } = x;
  const e = cy + 2;
  return (
    <g className="lo-ch__head">
      <circle cx="38.5" cy={cy} r="11.5" fill={`url(#s${uid})`} />
      <g fill={look.hair}>{hairFront(look.style, cy)}</g>
      {sleepy ? (
        <path d={`M32.8 ${e}c.9.8 2.3.8 3.2 0M41.2 ${e}c.9.8 2.3.8 3.2 0`} stroke="#2B2321" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      ) : (
        <g className="lo-ch__eyes" fill="#1E2A3D">
          <ellipse cx="34.3" cy={e} rx="1.5" ry="1.9" />
          <ellipse cx="42.7" cy={e} rx="1.5" ry="1.9" />
          <circle cx="34.8" cy={e - 0.7} r=".5" fill="#fff" />
          <circle cx="43.2" cy={e - 0.7} r=".5" fill="#fff" />
        </g>
      )}
      <path d={`M36.3 ${cy + 6.6}q2.2 1.4 4.4 0`} stroke="#9A4B32" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <circle cx="31.4" cy={cy + 5.3} r="1.6" fill="#F28B82" opacity=".35" />
      <circle cx="45.6" cy={cy + 5.3} r="1.6" fill="#F28B82" opacity=".35" />
      {kind === "jurist" ? (
        <g stroke="#3B2F7A" strokeWidth=".9" fill="rgba(255,255,255,.18)">
          <circle cx="34.3" cy={e} r="3" />
          <circle cx="42.7" cy={e} r="3" />
          <path d={`M37.3 ${e}h2.4`} />
        </g>
      ) : null}
      {kind === "operator" ? (
        <g fill="none" stroke="#1E2A3D" strokeLinecap="round">
          <path d={`M26.8 ${cy}c0-9.5 5.2-14.2 11.7-14.2S50.2 ${cy - 9.5} 50.2 ${cy}`} strokeWidth="1.6" />
          <rect x="25" y={cy - 2.5} width="3.6" height="6.5" rx="1.8" fill="#1E2A3D" stroke="none" />
          <rect x="48.4" y={cy - 2.5} width="3.6" height="6.5" rx="1.8" fill="#1E2A3D" stroke="none" />
          <path d={`M27 ${cy + 4}c.6 3 3 4.6 6.4 4.6`} strokeWidth="1" />
          <circle cx="33.6" cy={cy + 8.6} r="1" fill="#1E2A3D" stroke="none" />
        </g>
      ) : null}
    </g>
  );
}

function HeadBack({ x, cy }: { x: Ctx; cy: number }) {
  const { look, kind } = x;
  return (
    <g className="lo-ch__head">
      <circle cx="38.5" cy={cy} r="11.5" fill={look.skin} />
      <path d={`M27 ${cy + 1}c0-7.5 5-12.5 11.5-12.5S50 ${cy - 6.5} 50 ${cy + 1}c0 4-1.2 7.4-3 9.6-2.4 1.4-5.2 2-8.5 2s-6.1-.6-8.5-2c-1.8-2.2-3-5.6-3-9.6Z`} fill={look.hair} />
      {look.style === 2 ? <circle cx="38.5" cy={cy - 12} r="4.6" fill={look.hair} /> : null}
      {look.style === 3 ? <path d={`M27.6 ${cy + 4}c1 6 4 10.5 10.9 10.5S48.4 ${cy + 10} 49.4 ${cy + 4}c-2.6 2-6.2 3-10.9 3s-8.3-1-10.9-3Z`} fill={look.hair} /> : null}
      {kind === "operator" ? <path d={`M26.8 ${cy}c0-9.5 5.2-14.2 11.7-14.2S50.2 ${cy - 9.5} 50.2 ${cy}`} stroke="#1E2A3D" strokeWidth="1.6" fill="none" /> : null}
    </g>
  );
}

function HeadSide({ x, cy }: { x: Ctx; cy: number }) {
  const { look, kind } = x;
  const d = cy - 41;
  return (
    <g className="lo-ch__head" transform={`translate(0 ${d})`}>
      <circle cx="38.5" cy="41" r="11.5" fill={look.skin} />
      <path d="M49.6 43.2q2.2 1 0 2.4" fill={look.skin} stroke="rgba(0,0,0,.18)" strokeWidth=".7" />
      <path d="M27 40c0-9 5.5-12.5 11.5-12.5 5.5 0 10.5 3.5 11 9.5-3.5-2-7.5-2.5-11-1.5-3 1-5 3.5-5.5 8.5-2 .5-4 2-5 4-.8-2.4-1-5-1-8Z" fill={look.hair} />
      {look.style === 2 ? <circle cx="31" cy="30" r="4.4" fill={look.hair} /> : null}
      {look.style === 3 ? <path d="M27.4 44c-.6 5 .8 9 3.6 11 1.6-2 2.4-4.6 2.4-8Z" fill={look.hair} /> : null}
      <circle cx="35.6" cy="44" r="2" fill={look.skin} stroke="rgba(0,0,0,.12)" strokeWidth=".6" />
      <ellipse className="lo-ch__eyes" cx="44.8" cy="43" rx="1.4" ry="1.8" fill="#1E2A3D" />
      <path d="M44.2 48q1.6.6 2.8-.2" stroke="#9A4B32" strokeWidth="1" strokeLinecap="round" fill="none" />
      {kind === "jurist" ? <circle cx="44.8" cy="43" r="2.9" fill="rgba(255,255,255,.18)" stroke="#3B2F7A" strokeWidth=".9" /> : null}
      {kind === "operator" ? (
        <g>
          <path d="M33 30.5c3-2.6 8-3 11.5-.6" stroke="#1E2A3D" strokeWidth="1.6" fill="none" />
          <rect x="33.4" y="40.2" width="4.4" height="7" rx="2" fill="#1E2A3D" />
          <path d="M36.6 46.6c2 2.4 5 3 7.6 2.2" stroke="#1E2A3D" strokeWidth="1" fill="none" />
        </g>
      ) : null}
    </g>
  );
}

// ── bodies ──────────────────────────────────────────────────────────────────

function BodyFront({ x, top }: { x: Ctx; top: number }) {
  const { kind, uid } = x;
  const b = top;
  return (
    <g>
      <path d={`M31 ${b + 3}q0-3 3-3h9q3 0 3 3v17q0 2-2 2H33q-2 0-2-2Z`} fill={`url(#o${uid})`} />
      {kind === "lead" || kind === "lawyer" ? (
        <>
          <path d={`M35.4 ${b + 0.1}L38.5 ${b + 5.6}L41.6 ${b + 0.1}Z`} fill="#fff" />
          {kind === "lead" ? <path d={`M38.5 ${b + 3}l-1.3 1.7 1.3 7 1.3-7Z`} fill="#0B1F45" /> : <circle cx="43.2" cy={b + 6.4} r="1.2" fill="#FDE68A" />}
        </>
      ) : null}
      {kind === "operator" ? <path d={`M35.6 ${b + 0.2}l2.9 3.4 2.9-3.4`} fill="none" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" /> : null}
      {kind === "jurist" ? (
        <>
          <path d={`M35.8 ${b + 0.1}L38.5 ${b + 5}L41.2 ${b + 0.1}Z`} fill="#EDE9FE" />
          <circle cx="38.5" cy={b + 9} r=".8" fill="#fff" />
          <circle cx="38.5" cy={b + 13} r=".8" fill="#fff" />
        </>
      ) : null}
      {kind === "client" ? (
        <>
          <path d={`M33.4 ${b + 0.4}c1.2 2.4 3 3.4 5.1 3.4s3.9-1 5.1-3.4`} fill="none" stroke="#B45309" strokeWidth="1.2" />
          <path d={`M36.8 ${b + 3.6}v4M40.2 ${b + 3.6}v4`} stroke="#fff" strokeWidth=".9" strokeLinecap="round" />
          <path d={`M33.5 ${b + 13}h10v5h-10Z`} fill="rgba(0,0,0,.08)" />
        </>
      ) : null}
    </g>
  );
}

function BodyBack({ x, top }: { x: Ctx; top: number }) {
  const { kind, uid } = x;
  const b = top;
  return (
    <g>
      <path d={`M31 ${b + 3}q0-3 3-3h9q3 0 3 3v17q0 2-2 2H33q-2 0-2-2Z`} fill={`url(#o${uid})`} />
      <path d={`M38.5 ${b + 6}v15`} stroke="rgba(0,0,0,.12)" strokeWidth=".9" />
      {kind === "client" ? <path d={`M32.5 ${b + 0.5}q6 6.5 12 0v4q-6 4-12 0Z`} fill="rgba(0,0,0,.12)" /> : null}
    </g>
  );
}

function Legs({ x, top, cls = "" }: { x: Ctx; top: number; cls?: string }) {
  const { legs, shoes, kind } = x;
  const stroke = kind === "client" ? "#CBD5E1" : "none";
  return (
    <g className={cls}>
      <g className="lo-ch__leg lo-ch__leg--l">
        <rect x="33.2" y={top} width="5" height="13" rx="2.2" fill={legs} />
        <ellipse cx="35.7" cy={top + 14.2} rx="3.4" ry="2.1" fill={shoes} stroke={stroke} strokeWidth=".7" />
      </g>
      <g className="lo-ch__leg lo-ch__leg--r">
        <rect x="38.8" y={top} width="5" height="13" rx="2.2" fill={legs} />
        <ellipse cx="41.3" cy={top + 14.2} rx="3.4" ry="2.1" fill={shoes} stroke={stroke} strokeWidth=".7" />
      </g>
    </g>
  );
}

function Arms({ x, top }: { x: Ctx; top: number }) {
  const { look, c2 } = x;
  return (
    <>
      <g className="lo-ch__arm lo-ch__arm--l">
        <rect x="27.4" y={top + 1.5} width="4.2" height="15" rx="2.1" fill={c2} />
        <circle cx="29.5" cy={top + 18} r="2.4" fill={look.skin} />
      </g>
      <g className="lo-ch__arm lo-ch__arm--r">
        <rect x="45.4" y={top + 1.5} width="4.2" height="15" rx="2.1" fill={c2} />
        <circle cx="47.5" cy={top + 18} r="2.4" fill={look.skin} />
      </g>
    </>
  );
}

function Mug({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x} ${y}h5.6v5.2a1.8 1.8 0 0 1-1.8 1.8h-2a1.8 1.8 0 0 1-1.8-1.8Z`} fill="#fff" stroke="#9AA9BF" strokeWidth=".7" />
      <path d={`M${x + 5.6} ${y + 1.2}h.8a1.4 1.4 0 0 1 0 2.8h-.8`} stroke="#9AA9BF" strokeWidth=".7" fill="none" />
      <path className="lo-ch__steam" d={`M${x + 1.6} ${y - 1.6}c-.7-.9.7-1.4 0-2.5M${x + 3.8} ${y - 1.6}c-.7-.9.7-1.4 0-2.5`} stroke="#9AA9BF" strokeWidth=".7" strokeLinecap="round" fill="none" />
    </g>
  );
}

// ── standing ────────────────────────────────────────────────────────────────

function StandFront({ x, mug = false }: { x: Ctx; mug?: boolean }) {
  return (
    <g className="lo-ch__body">
      <Legs x={x} top={70} />
      {mug ? (
        <>
          <g className="lo-ch__arm lo-ch__arm--r">
            <rect x="45.4" y="51" width="4.2" height="15" rx="2.1" fill={x.c2} />
            <circle cx="47.5" cy="67.5" r="2.4" fill={x.look.skin} />
          </g>
          <BodyFront x={x} top={49.5} />
          <g className="lo-ch__sip">
            <path d="M31.5 52.5 29.2 59.5l4.6-.8" fill="none" stroke={x.c2} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
            <Mug x={31.4} y={52.2} />
            <circle cx="34" cy="58.6" r="2.3" fill={x.look.skin} />
          </g>
        </>
      ) : (
        <>
          <Arms x={x} top={49.5} />
          <BodyFront x={x} top={49.5} />
        </>
      )}
      <HeadFront x={x} cy={41} />
    </g>
  );
}

function StandBack({ x }: { x: Ctx }) {
  return (
    <g className="lo-ch__body">
      <Legs x={x} top={70} />
      <Arms x={x} top={49.5} />
      <BodyBack x={x} top={49.5} />
      <HeadBack x={x} cy={41} />
    </g>
  );
}

function StandSide({ x }: { x: Ctx }) {
  const { look, c1, c2, legs, shoes, kind } = x;
  const stroke = kind === "client" ? "#CBD5E1" : "none";
  return (
    <g className="lo-ch__body">
      <g className="lo-ch__leg lo-ch__leg--l">
        <rect x="35.5" y="70" width="5.2" height="13" rx="2.2" fill={legs} opacity=".85" />
        <ellipse cx="39.6" cy="84.2" rx="3.8" ry="2" fill={shoes} stroke={stroke} strokeWidth=".7" />
      </g>
      <g className="lo-ch__leg lo-ch__leg--r">
        <rect x="36.3" y="70" width="5.2" height="13" rx="2.2" fill={legs} />
        <ellipse cx="40.4" cy="84.2" rx="3.8" ry="2" fill={shoes} stroke={stroke} strokeWidth=".7" />
      </g>
      <path d="M33 52.5q0-3 3-3h5.5q3 0 3 3v17q0 2-2 2H35q-2 0-2-2Z" fill={c1} />
      <g className="lo-ch__arm lo-ch__arm--r">
        <rect x="36.6" y="51" width="4.4" height="15" rx="2.2" fill={c2} />
        <circle cx="38.8" cy="67.5" r="2.4" fill={look.skin} />
      </g>
      <HeadSide x={x} cy={41} />
    </g>
  );
}

// ── workstations (shared with the free desks drawn in the plan) ─────────────

const WOOD = "#C9915A";
const WOOD_TOP = "#D9A46B";
const WOOD_FRONT = "#9C6B3E";

// Desk with the person behind it, facing us: chair back, a shallow desk
// with a small monitor seen from behind, keyboard, mug and papers — low
// enough that the person's shoulders and arms show above it.
export function DeskDown({ empty = false, children, over, extra = 0 }: { empty?: boolean; children?: ReactNode; over?: ReactNode; extra?: number }) {
  return (
    <g className="lo-desk">
      <g className="lo-dk">
        <rect x="27" y="25" width="23" height="21" rx="7" fill={CHAIR} />
        {empty ? <rect x="29" y="42" width="19" height="9" rx="3" fill="#2F384A" /> : null}
        {empty ? null : <rect className="lo-night" x="27" y="25" width="23" height="21" rx="7" />}
      </g>
      {children}
      <g className="lo-dk">
        <rect x="9.7" y="62" width="57.6" height="16" rx="2.5" fill={WOOD_TOP} />
        <rect x="9.7" y="62" width="57.6" height="16" rx="2.5" fill="none" stroke={WOOD} strokeWidth="1.2" />
        <rect x="14" y="65" width="9" height="6.5" rx="1" fill="#fff" transform="rotate(-8 18.5 68)" />
        <path d="M15.4 67.2h5.6M15.7 69.2h4.2" stroke="#CBD5E1" strokeWidth=".8" transform="rotate(-8 18.5 68)" />
        <rect x="32" y="52" width="13" height="11" rx="2" fill="#E2E8F0" stroke="#94A3B8" strokeWidth=".8" />
        <circle className={empty ? "lo-desk__logo is-off" : "lo-desk__logo"} cx="38.5" cy="57.5" r="1.4" />
        <rect x="37" y="63" width="3" height="2.6" fill="#94A3B8" />
        <ellipse cx="38.5" cy="66" rx="4.2" ry="1.3" fill="#94A3B8" />
        <rect x="32.5" y="68" width="12" height="3.2" rx="1" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth=".6" />
        {extra % 3 === 1 ? (
          <g>
            <path d="M57 74v-12l4-4" stroke="#475569" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <path d="M58 56l7 2-3 4Z" fill="#F59E0B" />
            <ellipse cx="57" cy="74.5" rx="3.6" ry="1.2" fill="#475569" />
          </g>
        ) : extra % 3 === 2 ? (
          <g>
            <rect x="54.5" y="66" width="7" height="6" rx="1.5" fill="#E8975A" />
            <path d="M58 66c-4-2-5-6-3-8 2 2 3 5 3 8Zm0 0c3-3 6-4 7-2-2 2-4 2-7 2Zm0 0c-1-4 0-7 2-8 1 3 0 6-2 8Z" fill="#3DBE73" />
          </g>
        ) : (
          <Mug x={55} y={64.5} />
        )}
      </g>
      {over}
      <g className="lo-dk">
        <rect x="9.7" y="77" width="57.6" height="8" rx="1.5" fill={WOOD_FRONT} />
        <rect x="11.5" y="85" width="3" height="3" fill="#6B4A2B" />
        <rect x="62.5" y="85" width="3" height="3" fill="#6B4A2B" />
        {empty ? null : <rect className="lo-night" x="9.7" y="62" width="57.6" height="26" rx="2.5" />}
      </g>
    </g>
  );
}

// Desk across from us: the person sits with their back to us and we see the
// screen. The chair is drawn only for a free desk; a seated person brings
// their own.
export function DeskUp({ empty = false, on = false }: { empty?: boolean; on?: boolean }) {
  return (
    <g className="lo-desk">
      <rect x="9.7" y="22" width="57.6" height="19" rx="2.5" fill={WOOD_TOP} />
      <rect x="9.7" y="22" width="57.6" height="19" rx="2.5" fill="none" stroke={WOOD} strokeWidth="1.2" />
      <rect x="9.7" y="40" width="57.6" height="6.5" rx="1.5" fill={WOOD_FRONT} />
      <rect x="35.8" y="24" width="5.4" height="5" fill="#94A3B8" />
      <rect x="25.5" y="5" width="26" height="20" rx="2.4" fill="#1E293B" />
      <rect className={on ? "lo-screen is-on" : "lo-screen"} x="27.3" y="6.8" width="22.4" height="15.6" rx="1.2" />
      {on ? (
        <g className="lo-screen__ui">
          <rect x="29" y="8.6" width="8" height="2" rx="1" fill="#93C5FD" />
          <rect x="29" y="12.2" width="18.6" height="1.6" rx=".8" fill="#E0F2FE" opacity=".85" />
          <rect x="29" y="15.2" width="14" height="1.6" rx=".8" fill="#E0F2FE" opacity=".6" />
          <rect x="29" y="18.2" width="9" height="2.4" rx="1" fill="#34D399" />
        </g>
      ) : null}
      <rect x="31" y="32" width="15" height="3.6" rx="1" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth=".6" />
      <rect x="14" y="28" width="8" height="6" rx="1" fill="#fff" transform="rotate(6 18 31)" />
      {empty ? (
        <>
          <rect x="27" y="56" width="23" height="18" rx="6" fill={CHAIR} />
          <rect x="29" y="50" width="19" height="9" rx="3" fill="#2F384A" />
          <rect x="37" y="74" width="3" height="5" fill="#475569" />
          <ellipse cx="38.5" cy="84" rx="8" ry="2.2" fill="#475569" />
        </>
      ) : null}
    </g>
  );
}

// ── the figure ──────────────────────────────────────────────────────────────

export default function Character({ id, kind, pose, title }: { id: string; kind: PersonKind; pose: Pose; title?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const look = lookOf(id);
  const o = OUTFIT[kind];
  const x: Ctx = { look, kind, c1: o.top[0], c2: o.top[1], legs: o.legs, shoes: o.shoes, uid };
  const p = pose === "idle" ? "mug" : pose;
  const head = p === "head";
  return (
    <svg
      className={`lo-ch lo-ch--${p}`}
      viewBox={head ? "25.5 27 26 26" : `0 0 ${FIG_VIEW.w} ${FIG_VIEW.h}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ ["--lo-blink" as string]: `${look.blink}s` }}
    >
      <defs>
        <radialGradient id={`s${uid}`} cx="36%" cy="26%" r="66%">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".38" stopColor={look.skin} />
          <stop offset="1" stopColor={look.skin} />
        </radialGradient>
        <linearGradient id={`o${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={x.c1} />
          <stop offset="1" stopColor={x.c2} />
        </linearGradient>
      </defs>

      {p === "head" ? (
        <g>
          <BodyFront x={x} top={49.5} />
          <HeadFront x={x} cy={41} />
        </g>
      ) : null}

      {p === "stand" || p === "mug" ? (
        <>
          <ellipse className="lo-ch__shadow" cx="38.5" cy="87" rx="10" ry="2.6" />
          <StandFront x={x} mug={p === "mug"} />
        </>
      ) : null}

      {p === "walk" ? (
        <>
          <ellipse className="lo-ch__shadow" cx="38.5" cy="87" rx="10" ry="2.6" />
          <g className="lo-f lo-f--down">
            <StandFront x={x} />
          </g>
          <g className="lo-f lo-f--up">
            <StandBack x={x} />
          </g>
          <g className="lo-f lo-f--side">
            <StandSide x={x} />
          </g>
        </>
      ) : null}

      {p === "work" ? (
        <DeskDown
          extra={look.style}
          over={
            <>
              <g className="lo-ch__arms">
                <path d="M31.6 47 28.2 57l5.2 11.4" fill="none" stroke={x.c2} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M45.4 47 48.8 57l-5.2 11.4" fill="none" stroke={x.c2} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
              </g>
              <g className="lo-ch__hands">
                <circle className="lo-ch__hand lo-ch__hand--l" cx="33.8" cy="69.4" r="2.3" fill={look.skin} />
                <circle className="lo-ch__hand lo-ch__hand--r" cx="43.2" cy="69.4" r="2.3" fill={look.skin} />
              </g>
            </>
          }
        >
          <BodyFront x={x} top={43} />
          <HeadFront x={x} cy={33} />
        </DeskDown>
      ) : null}

      {p === "back" ? (
        <g className="lo-ch__body">
          <g className="lo-dk">
            <rect x="27.3" y="6.8" width="22.4" height="15.6" rx="1.2" className="lo-screen is-on" />
            <rect x="29" y="8.6" width="8" height="2" rx="1" fill="#93C5FD" />
            <rect x="29" y="12.2" width="18.6" height="1.6" rx=".8" fill="#E0F2FE" opacity=".85" />
            <rect x="29" y="15.2" width="14" height="1.6" rx=".8" fill="#E0F2FE" opacity=".6" />
            <rect x="29" y="18.2" width="9" height="2.4" rx="1" fill="#34D399" />
          </g>
          <BodyBack x={x} top={55} />
          <path d="M31.4 58.5 27 51.5l.8-6.5" fill="none" stroke={x.c2} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M45.6 58.5 50 51.5l-.8-6.5" fill="none" stroke={x.c2} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle className="lo-ch__hand lo-ch__hand--l" cx="27.9" cy="44" r="2.3" fill={look.skin} />
          <circle className="lo-ch__hand lo-ch__hand--r" cx="49.1" cy="44" r="2.3" fill={look.skin} />
          <HeadBack x={x} cy={47} />
          <g className="lo-dk">
            <rect x="27" y="63" width="23" height="15" rx="6" fill={CHAIR} />
            <rect x="37" y="78" width="3" height="4" fill="#475569" />
            <ellipse cx="38.5" cy="85" rx="8" ry="2.2" fill="#475569" />
            <rect className="lo-night" x="27" y="63" width="23" height="24" rx="6" />
          </g>
        </g>
      ) : null}

      {p === "sofa" ? (
        <g className="lo-ch__body">
          <g>
            <rect x="33.2" y="68" width="5" height="9" rx="2.2" fill={o.legs} />
            <rect x="38.8" y="68" width="5" height="9" rx="2.2" fill={o.legs} />
            <ellipse cx="35.7" cy="78.5" rx="3.3" ry="2" fill={o.shoes} />
            <ellipse cx="41.3" cy="78.5" rx="3.3" ry="2" fill={o.shoes} />
          </g>
          <g className="lo-ch__arm lo-ch__arm--r">
            <rect x="45.4" y="54" width="4.2" height="13" rx="2.1" fill={x.c2} />
            <circle cx="47.5" cy="68" r="2.4" fill={look.skin} />
          </g>
          <BodyFront x={x} top={52} />
          <g className="lo-ch__sip">
            <path d="M31.5 55 29.2 62l4.6-.8" fill="none" stroke={x.c2} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
            <Mug x={31.4} y={54.7} />
            <circle cx="34" cy="61.1" r="2.3" fill={look.skin} />
          </g>
          <HeadFront x={x} cy={43.5} sleepy />
        </g>
      ) : null}
    </svg>
  );
}

// Shared once per page (kept for callers that still mount it).
export function CharacterDefs() {
  return null;
}
