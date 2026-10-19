"use client";

import { celebrate } from "../celebrate";
import { prefersReducedMotion } from "../hooks";
import { stageGlyphs, type StageGlyph } from "./glyphs";
import type { SxStageKey, SxStageShow } from "./stage";

type Pt = { x: number; y: number };
type Tone = "draft" | "submitted" | "review" | "approved" | "published" | "returned" | "amber" | "scan";
type AnimOpts = { dur: number; delay?: number; easing?: string; iterations?: number; fill?: FillMode; whole?: boolean };
type RailStage = "draft" | "submitted" | "in_review" | "approved" | "published";

type Ctx = {
  fx: HTMLElement;
  vw: number;
  vh: number;
  focal: Pt;
  dur: number;
  uid: number;
  g: Record<StageGlyph, string>;
  origin: Pt | null;
  originEl: Element | null;
  anim: (node: Element | null | undefined, frames: Keyframe[], opts: AnimOpts) => void;
  later: (ms: number, fn: () => void) => void;
  onEnd: (fn: () => void) => void;
  node: (stage: RailStage) => HTMLElement | null;
  nudge: (delay: number) => void;
};

export type StageRun = { stop: (fast?: boolean) => void };
export type StageRunOptions = { skipLabel: string; onDone: () => void; onSkip: () => void };

const TONE: Readonly<Record<SxStageKey, Tone>> = {
  draft: "draft",
  submitted: "submitted",
  in_review: "review",
  approved: "approved",
  published: "published",
  returned: "amber",
  rejected: "returned",
};
const RAIL: Readonly<Record<SxStageKey, RailStage>> = {
  draft: "draft",
  submitted: "submitted",
  in_review: "in_review",
  approved: "approved",
  published: "published",
  returned: "in_review",
  rejected: "in_review",
};
const SOLO_MS: Readonly<Record<SxStageKey, number>> = {
  draft: 1500,
  submitted: 2000,
  in_review: 1800,
  approved: 1900,
  published: 2000,
  returned: 1800,
  rejected: 1600,
};
const CHAIN_MS = 3400;
const CHAIN_MIN = 1000;
const MAX_STEPS = 3;
const CALM_MS = 1200;
const CARD_IN = 60;
const CARD_OUT = 280;
const ARM_MS = 240;
const SKIP_FADE = 180;
const EASE = "cubic-bezier(.16,1,.3,1)";
const EASE_IO = "cubic-bezier(.65,0,.35,1)";
const FLY = "cubic-bezier(.42,0,.28,1)";
const DROP = "cubic-bezier(.6,0,.9,.4)";
const BOUNCE = "cubic-bezier(.34,1.56,.64,1)";
const SVG_NS = "http://www.w3.org/2000/svg";

let seq = 0;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: Element, tone?: Tone): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (tone) node.setAttribute("data-tone", tone);
  parent.appendChild(node);
  return node;
}

function place(node: HTMLElement, p: Pt, w: number, h = w) {
  node.style.left = `${Math.round(p.x - w / 2)}px`;
  node.style.top = `${Math.round(p.y - h / 2)}px`;
  node.style.width = `${w}px`;
  node.style.height = `${h}px`;
}

function center(r: DOMRect): Pt {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function onTop(el: Element, r: DOMRect): boolean {
  if (typeof document.elementFromPoint !== "function") return true;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !hit || hit === el || el.contains(hit) || hit.contains(el);
}

function rectOf(target: Element | DOMRect | null | undefined, vw: number, vh: number, covered = true): DOMRect | null {
  if (!target) return null;
  const isEl = typeof Element !== "undefined" && target instanceof Element;
  if (isEl && !target.isConnected) return null;
  const r = isEl ? target.getBoundingClientRect() : (target as DOMRect);
  if (!r || (r.width <= 0 && r.height <= 0)) return null;
  if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return null;
  if (isEl && covered && !onTop(target, r)) return null;
  return r;
}

function planSteps(show: SxStageShow): SxStageKey[] {
  const list = show.steps && show.steps.length ? [...show.steps] : [show.to];
  if (list[list.length - 1] !== show.to) list.push(show.to);
  const steps = list.filter((k, i) => i === 0 || list[i - 1] !== k);
  while (steps.length > MAX_STEPS) {
    const mid = steps.indexOf("in_review");
    steps.splice(mid >= 0 && mid < steps.length - 1 ? mid : 0, 1);
  }
  return steps;
}

function glyphOf(el: Element | null): Element | null {
  if (!el) return null;
  if (el instanceof SVGSVGElement) return el;
  return el.querySelector("svg");
}

function tint(c: Ctx, tone: Tone, peak: number, at: Pt = c.focal) {
  const layer = make("span", "sx-stage__tint", c.fx, tone);
  layer.style.setProperty("--fx", `${Math.round(at.x)}px`);
  layer.style.setProperty("--fy", `${Math.round(at.y)}px`);
  c.anim(layer, [{ opacity: 0 }, { opacity: peak, offset: 0.16 }, { opacity: peak, offset: 0.78 }, { opacity: 0 }], { dur: c.dur, easing: "linear" });
}

function ping(c: Ctx, p: Pt, tone: Tone, delay: number, size = 44) {
  const ring = make("span", "sx-stage__ring", c.fx, tone);
  place(ring, p, size);
  c.anim(ring, [{ transform: "scale(.5)", opacity: 0.95 }, { transform: "scale(2.6)", opacity: 0 }], { dur: 620, delay, easing: EASE });
}

function popNode(c: Ctx, el: Element | null, delay: number) {
  c.anim(el, [{ transform: "scale(1)" }, { transform: "scale(1.24)", offset: 0.4 }, { transform: "scale(1)" }], { dur: 440, delay, easing: EASE, fill: "none" });
}

function shockwave(c: Ctx, p: Pt, tone: Tone, size: number, delay: number) {
  const a = make("span", "sx-stage__ring", c.fx, tone);
  place(a, p, size);
  c.anim(a, [{ transform: "scale(.85)", opacity: 0.85 }, { transform: "scale(2.3)", opacity: 0 }], { dur: 560, delay, easing: EASE });
  const b = make("span", "sx-stage__ring sx-stage__ring--thin", c.fx, tone);
  place(b, p, size);
  c.anim(b, [{ transform: "scale(.9)", opacity: 0.6 }, { transform: "scale(3.4)", opacity: 0 }], { dur: 760, delay: delay + 70, easing: EASE });
  const imprint = make("span", "sx-stage__imprint", c.fx, tone);
  place(imprint, p, size);
  c.anim(imprint, [{ transform: "scale(.9)", opacity: 0.9 }, { transform: "scale(1.35)", opacity: 0 }], { dur: 700, delay, easing: EASE });
}

function sparks(c: Ctx, p: Pt, tone: Tone, delay: number, count: number, reach: number) {
  for (let i = 0; i < count; i++) {
    const spark = make("span", "sx-stage__spark", c.fx, tone);
    place(spark, p, 4, 16);
    const angle = (360 / count) * i + (i % 2 ? 9 : -6);
    const far = reach * (i % 3 === 0 ? 1.12 : i % 3 === 1 ? 0.9 : 1);
    c.anim(
      spark,
      [
        { transform: `rotate(${angle}deg) translateY(-${Math.round(reach * 0.45)}px) scaleY(.4)`, opacity: 0 },
        { transform: `rotate(${angle}deg) translateY(-${Math.round(reach * 0.62)}px) scaleY(1)`, opacity: 1, offset: 0.25 },
        { transform: `rotate(${angle}deg) translateY(-${Math.round(far)}px) scaleY(.2)`, opacity: 0 },
      ],
      { dur: 560, delay, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
  }
}

function supportsOffsetPath(): boolean {
  try {
    return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("offset-path", "path('M 0 0 L 1 1')");
  } catch {
    return false;
  }
}

function follow(c: Ctx, mover: HTMLElement, guide: SVGPathElement, d: string, half: number, rotate: boolean, opts: AnimOpts) {
  if (supportsOffsetPath()) {
    mover.style.setProperty("offset-path", `path("${d}")`);
    mover.style.setProperty("offset-rotate", rotate ? "auto" : "0deg");
    c.anim(mover, [{ offsetDistance: "0%" }, { offsetDistance: "100%" }], opts);
    return;
  }
  let length = 0;
  try {
    length = guide.getTotalLength();
  } catch {
    length = 0;
  }
  if (!length) return;
  const frames: Keyframe[] = [];
  const count = 48;
  for (let i = 0; i <= count; i++) {
    const at = (length * i) / count;
    const pt = guide.getPointAtLength(at);
    const ahead = guide.getPointAtLength(Math.min(length, at + 1));
    const back = guide.getPointAtLength(Math.max(0, at - 1));
    const angle = rotate ? (Math.atan2(ahead.y - back.y, ahead.x - back.x) * 180) / Math.PI : 0;
    frames.push({ transform: `translate(${pt.x - half}px, ${pt.y - half}px) rotate(${angle}deg)`, offset: i / count });
  }
  c.anim(mover, frames, { ...opts, whole: true });
}

function pathSvg(c: Ctx, d: string, cls: string, tone: Tone): { svg: SVGSVGElement; reveal: SVGPathElement; line: SVGPathElement } {
  const id = `sx-stage-m${c.uid}-${cls.length}`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `sx-stage__trail ${cls}`);
  svg.setAttribute("data-tone", tone);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", String(c.vw));
  svg.setAttribute("height", String(c.vh));
  svg.setAttribute("viewBox", `0 0 ${c.vw} ${c.vh}`);
  svg.innerHTML = `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${c.vw}" height="${c.vh}"><path class="sx-stage__reveal" d="${d}" pathLength="1" /></mask></defs><path class="sx-stage__line" d="${d}" mask="url(#${id})" />`;
  c.fx.appendChild(svg);
  return { svg, reveal: svg.querySelector(".sx-stage__reveal") as SVGPathElement, line: svg.querySelector(".sx-stage__line") as SVGPathElement };
}

function submitted(c: Ctx) {
  const D = c.dur;
  const O = c.origin ?? { x: c.vw * 0.22, y: c.vh * 0.64 };
  const targetEl = c.node("in_review");
  const tr = rectOf(targetEl, c.vw, c.vh);
  const T = tr ? center(tr) : null;
  tint(c, "submitted", 0.85);
  c.anim(
    glyphOf(c.originEl),
    [
      { transform: "none", filter: "none" },
      { transform: "translateY(-2px) rotate(-16deg)", offset: 0.22 },
      { transform: "translateY(-5px) rotate(12deg)", filter: "drop-shadow(0 0 6px currentColor)", offset: 0.48 },
      { transform: "translateY(-4px) rotate(-7deg)", filter: "drop-shadow(0 0 4px currentColor)", offset: 0.72 },
      { transform: "none", filter: "none" },
    ],
    { dur: D * 0.3, easing: "ease-in-out", fill: "none" },
  );
  ping(c, O, "submitted", D * 0.06);
  const r = clamp(Math.min(c.vw, c.vh) * 0.13, 44, 110);
  const L = { x: clamp(Math.max((O.x + (T ? T.x : c.vw)) / 2, c.vw * 0.44), r + 24, c.vw - r - 24), y: clamp(c.focal.y - 16, r + 24, c.vh - r - 24) };
  const A = { x: L.x, y: L.y + r };
  const parts = [`M ${O.x} ${O.y}`, `C ${O.x + 70} ${O.y - 90} ${A.x - 240} ${A.y} ${A.x} ${A.y}`, `A ${r} ${r} 0 0 0 ${L.x} ${L.y - r}`, `A ${r} ${r} 0 0 0 ${A.x} ${A.y}`];
  if (T && T.x < A.x + 120) parts.push(`C ${A.x + 280} ${A.y} ${T.x + 220} ${T.y} ${T.x} ${T.y}`);
  else if (T) parts.push(`C ${A.x + 220} ${A.y} ${T.x} ${T.y + (T.y < A.y ? 170 : -170)} ${T.x} ${T.y}`);
  else parts.push(`C ${A.x + 260} ${A.y} ${c.vw - 40} ${c.vh * 0.25} ${c.vw + 90} -90`);
  const d = parts.map((p) => p.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10))).join(" ");
  const fly0 = D * 0.16;
  const flyDur = D * 0.7;
  const { svg, reveal, line } = pathSvg(c, d, "sx-stage__trail--dots", "submitted");
  c.anim(reveal, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { dur: flyDur, delay: fly0, easing: FLY });
  c.anim(svg, [{ opacity: 1 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }], { dur: D, easing: "linear" });
  const plane = make("span", "sx-stage__plane", c.fx, "submitted");
  plane.innerHTML = `<span class="sx-stage__plane-in">${c.g.submitted}</span>`;
  follow(c, plane, line, d, 36, true, { dur: flyDur, delay: fly0, easing: FLY });
  c.anim(
    plane.firstElementChild,
    [
      { transform: "scale(.3)", opacity: 0 },
      { transform: "scale(1.18)", opacity: 1, offset: 0.1 },
      { transform: "scale(1)", opacity: 1, offset: 0.18 },
      { transform: "scale(1)", opacity: 1, offset: 0.86 },
      { transform: T ? "scale(.3)" : "scale(.9)", opacity: T ? 0 : 1 },
    ],
    { dur: flyDur, delay: fly0, easing: "ease-out" },
  );
  if (T && targetEl) {
    ping(c, T, "review", fly0 + flyDur * 0.95);
    popNode(c, targetEl, fly0 + flyDur * 0.97);
  }
}

const SAND = `<svg class="sx-stage__sand" viewBox="0 0 24 24" aria-hidden="true"><path class="sx-stage__sand-a" d="M8.7 20.4h6.6L12 16.6z" /><path class="sx-stage__sand-b" d="M8.7 3.6h6.6L12 7.6z" /><path class="sx-stage__stream" d="M12 12.2V4.4" /></svg>`;

function inReview(c: Ctx) {
  const D = c.dur;
  tint(c, "review", 0.85);
  const beam = make("span", "sx-stage__beam", c.fx, "scan");
  c.anim(
    beam,
    [
      { transform: "translateX(-280px)", opacity: 0 },
      { opacity: 1, offset: 0.1 },
      { opacity: 1, offset: 0.9 },
      { transform: `translateX(${c.vw + 40}px)`, opacity: 0 },
    ],
    { dur: D * 0.78, delay: D * 0.1, easing: EASE_IO },
  );
  const disc = make("span", "sx-stage__disc", c.fx, "review");
  place(disc, c.focal, 124);
  disc.innerHTML = `<span class="sx-stage__rotor">${SAND}${c.g.in_review}</span>`;
  c.anim(
    disc,
    [
      { transform: "scale(.55)", opacity: 0 },
      { transform: "scale(1.05)", opacity: 1, offset: 0.1 },
      { transform: "scale(1)", opacity: 1, offset: 0.16 },
      { transform: "scale(1)", opacity: 1, offset: 0.86 },
      { transform: "scale(.88)", opacity: 0 },
    ],
    { dur: D, easing: EASE },
  );
  const rotor = disc.querySelector(".sx-stage__rotor");
  c.anim(
    rotor,
    [
      { transform: "rotate(0deg)" },
      { transform: "rotate(0deg)", offset: 0.14, easing: "cubic-bezier(.5,0,.2,1)" },
      { transform: "rotate(198deg)", offset: 0.36, easing: "ease-in-out" },
      { transform: "rotate(180deg)", offset: 0.42 },
      { transform: "rotate(180deg)" },
    ],
    { dur: D },
  );
  const a = disc.querySelector<SVGElement>(".sx-stage__sand-a");
  const b = disc.querySelector<SVGElement>(".sx-stage__sand-b");
  const stream = disc.querySelector<SVGElement>(".sx-stage__stream");
  c.anim(a, [{ transform: "scale(1)" }, { transform: "scale(1)", offset: 0.42 }, { transform: "scale(.06)", offset: 0.86 }, { transform: "scale(.06)" }], { dur: D, easing: "linear" });
  c.anim(b, [{ transform: "scale(0)" }, { transform: "scale(0)", offset: 0.44 }, { transform: "scale(1)", offset: 0.88 }, { transform: "scale(1)" }], { dur: D, easing: "linear" });
  c.anim(stream, [{ opacity: 0 }, { opacity: 0, offset: 0.42 }, { opacity: 1, offset: 0.46 }, { opacity: 1, offset: 0.84 }, { opacity: 0, offset: 0.88 }, { opacity: 0 }], { dur: D, easing: "linear" });
  c.anim(stream, [{ strokeDashoffset: 0 }, { strokeDashoffset: -3.6 }], { dur: 300, easing: "linear", iterations: Math.ceil(D / 300) });
}

function stamp(c: Ctx, key: "approved" | "rejected") {
  const D = c.dur;
  const ok = key === "approved";
  const tone: Tone = ok ? "approved" : "returned";
  const size = 136;
  tint(c, tone, ok ? 0.9 : 1);
  const seal = make("span", "sx-stage__seal", c.fx, tone);
  place(seal, c.focal, size);
  seal.innerHTML = `<span class="sx-stage__seal-ring"></span><span class="sx-stage__seal-core">${c.g[key]}</span>`;
  const hit = 0.26;
  const drop = -Math.round(c.focal.y + size * 1.4);
  const targetEl = ok ? c.node("approved") : null;
  const tr = rectOf(targetEl, c.vw, c.vh);
  const T = tr ? center(tr) : null;
  const settle: Keyframe[] = ok
    ? [
        { transform: "translate(0px, 0px) scale(1.08)", offset: hit + 0.07 },
        { transform: "translate(0px, 0px) scale(.98)", offset: hit + 0.12 },
        { transform: "translate(0px, 0px) scale(1)", offset: hit + 0.17 },
      ]
    : [
        { transform: "translate(-9px, 0px) rotate(-6deg) scale(1.04)", offset: hit + 0.04 },
        { transform: "translate(8px, 0px) rotate(5deg) scale(1)", offset: hit + 0.08 },
        { transform: "translate(-5px, 0px) rotate(-3deg) scale(1)", offset: hit + 0.12 },
        { transform: "translate(2px, 0px) rotate(1deg) scale(1)", offset: hit + 0.15 },
        { transform: "translate(0px, 0px) rotate(0deg) scale(1)", offset: hit + 0.18 },
      ];
  const scale0 = ok ? "" : " rotate(0deg)";
  const land = T && tr ? `translate(${Math.round(T.x - c.focal.x)}px, ${Math.round(T.y - c.focal.y)}px)${scale0} scale(${(Math.max(24, tr.width) / size).toFixed(3)})` : "";
  const leave: Keyframe[] = land
    ? [
        { transform: `translate(0px, 0px)${scale0} scale(1)`, opacity: 1, offset: 0.64, easing: EASE_IO },
        { transform: land, opacity: 1, offset: 0.9 },
        { transform: land, opacity: 0, offset: 1 },
      ]
    : [
        { transform: `translate(0px, 0px)${scale0} scale(1)`, opacity: 1, offset: 0.8, easing: EASE },
        { transform: `translate(0px, -10px)${scale0} scale(.86)`, opacity: 0, offset: 1 },
      ];
  c.anim(
    seal,
    [
      { transform: `translate(0px, ${drop}px)${scale0} scale(2.4)`, opacity: 0, offset: 0, easing: "linear" },
      { transform: `translate(0px, ${Math.round(drop * 0.72)}px)${scale0} scale(2.3)`, opacity: 1, offset: 0.06, easing: DROP },
      { transform: `translate(0px, 0px)${scale0} scale(.92)`, opacity: 1, offset: hit, easing: BOUNCE },
      ...settle,
      ...leave,
    ],
    { dur: D },
  );
  if (ok) c.anim(seal.querySelector(".sx-stage__seal-ring"), [{ transform: "rotate(-30deg)" }, { transform: "rotate(60deg)" }], { dur: D, easing: "linear" });
  shockwave(c, c.focal, tone, size, D * hit);
  if (ok) sparks(c, c.focal, tone, D * hit, 12, size * 0.95);
  c.nudge(D * hit);
  if (T && targetEl) {
    ping(c, T, "approved", D * 0.88);
    popNode(c, targetEl, D * 0.9);
  }
}

function findPill(near: Element | null, vw: number, vh: number): HTMLElement | null {
  const own = near?.closest(".sx-rail-wrap")?.querySelector<HTMLElement>(".sx-rail__live > .sx-pill");
  if (own) return own;
  return [...document.querySelectorAll<HTMLElement>(".sx-rail__live > .sx-pill")].find((el) => rectOf(el, vw, vh)) ?? null;
}

function published(c: Ctx) {
  const D = c.dur;
  const nodeEl = c.node("published");
  const nr = rectOf(nodeEl, c.vw, c.vh);
  const P = nr ? center(nr) : (c.origin ?? c.focal);
  tint(c, "published", 0.9, P);
  const base = 140;
  const far = Math.max(Math.hypot(P.x, P.y), Math.hypot(c.vw - P.x, P.y), Math.hypot(P.x, c.vh - P.y), Math.hypot(c.vw - P.x, c.vh - P.y));
  const grow = ((far * 2) / base).toFixed(2);
  for (let i = 0; i < 4; i++) {
    const wave = make("span", "sx-stage__wave", c.fx, "published");
    place(wave, P, base);
    c.anim(
      wave,
      [
        { transform: "scale(.15)", opacity: 0 },
        { transform: "scale(.5)", opacity: 0.95, offset: 0.08 },
        { transform: `scale(${grow})`, opacity: 0 },
      ],
      { dur: D * 0.74, delay: D * (0.04 + i * 0.1), easing: "cubic-bezier(.22,.7,.3,1)" },
    );
  }
  const beacon = make("span", "sx-stage__beacon", c.fx, "published");
  place(beacon, P, 60);
  beacon.innerHTML = c.g.published;
  c.anim(
    beacon,
    [
      { transform: "scale(.4)", opacity: 0 },
      { transform: "scale(1.14)", opacity: 1, offset: 0.14 },
      { transform: "scale(1)", opacity: 1, offset: 0.24 },
      { transform: "scale(1)", opacity: 1, offset: 0.8 },
      { transform: "scale(.7)", opacity: 0 },
    ],
    { dur: D, easing: EASE },
  );
  c.later(D * 0.14, () => {
    const from: Element | DOMRect = nodeEl && nr ? nodeEl : new DOMRect(P.x - 1, P.y - 1, 2, 2);
    const stop = celebrate(from, { particles: 140, duration: Math.min(1700, D * 0.85) });
    const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas.sx-confetti");
    const canvas = canvases[canvases.length - 1];
    if (canvas) canvas.style.zIndex = "2147483001";
    c.onEnd(stop);
  });
  const pill = findPill(nodeEl ?? c.originEl, c.vw, c.vh);
  if (pill) {
    c.later(D * 0.18, () => pill.setAttribute("data-stage-glow", ""));
    c.onEnd(() => pill.removeAttribute("data-stage-glow"));
  }
}

function returned(c: Ctx) {
  const D = c.dur;
  tint(c, "amber", 0.9);
  const targetEl = c.node("draft");
  const tr = rectOf(targetEl, c.vw, c.vh);
  const T = tr ? center(tr) : { x: -140, y: c.focal.y };
  const W = 96;
  const H = 120;
  const sheet = make("span", "sx-stage__sheet", c.fx, "amber");
  place(sheet, c.focal, W, H);
  sheet.innerHTML = `<i></i><i></i><i></i><i></i><span class="sx-stage__undo"><span>${c.g.returned}</span></span>`;
  const from = Math.round(Math.min(c.vw * 0.32, 340));
  const dx = Math.round(T.x - c.focal.x);
  const dy = Math.round(T.y - c.focal.y);
  const end = tr ? (Math.max(24, tr.width) / W).toFixed(3) : "0.6";
  c.anim(
    sheet,
    [
      { transform: `translate(${from}px, 0px) rotate(7deg) scale(1)`, opacity: 0, easing: EASE },
      { transform: `translate(${Math.round(from * 0.5)}px, 0px) rotate(4deg) scale(1)`, opacity: 1, offset: 0.1, easing: EASE },
      { transform: "translate(0px, 0px) rotate(-2deg) scale(1)", opacity: 1, offset: 0.3 },
      { transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1, offset: 0.62, easing: EASE_IO },
      { transform: `translate(${dx}px, ${dy}px) rotate(-10deg) scale(${end})`, opacity: 1, offset: 0.9 },
      { transform: `translate(${dx}px, ${dy}px) rotate(-10deg) scale(${end})`, opacity: 0 },
    ],
    { dur: D },
  );
  c.anim(
    sheet.querySelector(".sx-stage__undo > span"),
    [
      { transform: "rotate(0deg)" },
      { transform: "rotate(0deg)", offset: 0.24, easing: "cubic-bezier(.3,0,.2,1)" },
      { transform: "rotate(-410deg)", offset: 0.58, easing: "ease-out" },
      { transform: "rotate(-360deg)", offset: 0.66 },
      { transform: "rotate(-360deg)" },
    ],
    { dur: D },
  );
  if (tr && targetEl) {
    ping(c, T, "amber", D * 0.86);
    popNode(c, targetEl, D * 0.88);
  }
}

function draft(c: Ctx) {
  const D = c.dur;
  const P = c.origin ?? c.focal;
  const x = clamp(P.x + 12, 16, c.vw - 100);
  const y = clamp(P.y + 30, 24, c.vh - 24);
  const d = `M ${x} ${y} c 5 -10 10 -10 14 0 s 9 10 14 0 s 9 -10 14 0 s 9 10 14 0 s 9 -10 14 0`;
  const { svg, reveal, line } = pathSvg(c, d, "sx-stage__trail--ink", "draft");
  c.anim(reveal, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { dur: D * 0.5, delay: D * 0.14, easing: "ease-in-out" });
  c.anim(svg, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { dur: D, easing: "linear" });
  const pencil = make("span", "sx-stage__pencil", c.fx, "draft");
  pencil.innerHTML = c.g.pencil;
  follow(c, pencil, line, d, 14, false, { dur: D * 0.5, delay: D * 0.14, easing: "ease-in-out" });
  c.anim(
    pencil.firstElementChild,
    [
      { transform: "translate(6px, -10px) rotate(-12deg)", opacity: 0 },
      { transform: "translate(0px, 0px) rotate(0deg)", opacity: 1, offset: 0.12 },
      { transform: "translate(0px, 0px) rotate(0deg)", opacity: 1, offset: 0.66 },
      { transform: "translate(8px, -12px) rotate(10deg)", opacity: 0, offset: 0.82 },
      { transform: "translate(8px, -12px) rotate(10deg)", opacity: 0 },
    ],
    { dur: D, easing: EASE },
  );
}

const SCENES: Readonly<Record<SxStageKey, (c: Ctx) => void>> = {
  draft,
  submitted,
  in_review: inReview,
  approved: (c) => stamp(c, "approved"),
  published,
  returned,
  rejected: (c) => stamp(c, "rejected"),
};

function railNode(stage: RailStage, near: Element | null, vw: number, vh: number): HTMLElement | null {
  const inner = `[data-stage="${stage}"] .sx-rail__dot`;
  const scope = near?.closest(".sx-rail");
  const own = scope ? [...scope.querySelectorAll<HTMLElement>(inner)] : [];
  const all = [...document.querySelectorAll<HTMLElement>(`.sx-rail ${inner}`)];
  return [...own, ...all].find((el) => rectOf(el, vw, vh)) ?? null;
}

export function runStage(show: SxStageShow, opts: StageRunOptions): StageRun {
  const uid = ++seq;
  const docEl = document.documentElement;
  const vw = docEl.clientWidth || window.innerWidth;
  const vh = docEl.clientHeight || window.innerHeight;
  const root = make("div", "sx-stage", document.body);
  root.setAttribute("data-scene", show.to);
  const calm = prefersReducedMotion() || typeof root.animate !== "function";
  if (calm) root.setAttribute("data-calm", "");
  const g = stageGlyphs();
  const steps = calm ? [show.to] : planSteps(show);
  const per = steps.length > 1 ? Math.max(CHAIN_MIN, Math.floor(CHAIN_MS / steps.length)) : SOLO_MS[show.to];
  const total = calm ? CALM_MS : per * steps.length;
  const timers = new Set<number>();
  const anims: Animation[] = [];
  const ends: (() => void)[] = [];
  let over = false;
  let leaving = false;

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!over && !leaving) fn();
    }, Math.max(0, Math.round(ms)));
    timers.add(id);
  };
  const anim = (node: Element | null | undefined, frames: Keyframe[], o: AnimOpts) => {
    if (!node || typeof node.animate !== "function") return;
    const ease = o.easing ?? EASE;
    const split = frames.length > 2 && !o.whole;
    try {
      anims.push(
        node.animate(split ? frames.map((f) => (f.easing ? f : { ...f, easing: ease })) : frames, {
          duration: Math.max(1, Math.round(o.dur)),
          delay: Math.round(o.delay ?? 0),
          easing: split ? "linear" : ease,
          iterations: o.iterations ?? 1,
          fill: o.fill ?? "both",
        }),
      );
    } catch {}
  };

  const fx = make("div", "sx-stage__fx", root);
  fx.setAttribute("aria-hidden", "true");
  const dock = make("div", "sx-stage__dock", root, TONE[show.to]);
  const card = make("div", "sx-stage__card", dock, TONE[show.to]);
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");
  card.setAttribute("aria-atomic", "true");
  const badge = make("span", "sx-stage__badge", card);
  badge.setAttribute("aria-hidden", "true");
  badge.innerHTML = g[show.to];
  const count = typeof show.count === "number" && show.count > 1 ? Math.round(show.count) : 0;
  if (count) make("span", "sx-stage__count", badge).textContent = count > 999 ? "999+" : String(count);
  const copy = make("span", "sx-stage__copy", card);
  const title = make("strong", "sx-stage__title", copy);
  const text = make("span", "sx-stage__text", copy);
  const chips: HTMLElement[] = [];
  if (steps.length > 1) {
    const chain = make("span", "sx-stage__chain", copy);
    chain.setAttribute("aria-hidden", "true");
    steps.forEach((k, i) => {
      if (i > 0) make("span", "sx-stage__link", chain, TONE[k]);
      const chip = make("span", "sx-stage__chip", chain, TONE[k]);
      chip.innerHTML = g[k];
      chips.push(chip);
    });
  }
  const skip = make("button", "sx-stage__skip", dock);
  skip.type = "button";
  skip.tabIndex = -1;
  if (opts.skipLabel) {
    skip.setAttribute("aria-label", opts.skipLabel);
    skip.title = opts.skipLabel;
  }
  skip.innerHTML = g.close;

  const nudge = (delay: number) =>
    anim(
      root,
      [
        { transform: "translate(0px, 0px)" },
        { transform: "translate(3px, -2px)", offset: 0.2 },
        { transform: "translate(-3px, 2px)", offset: 0.45 },
        { transform: "translate(2px, 1px)", offset: 0.7 },
        { transform: "translate(0px, 0px)" },
      ],
      { dur: 240, delay, easing: "linear", fill: "none" },
    );

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") opts.onSkip();
  };
  const onPointer = () => opts.onSkip();
  const onSkipClick = (e: MouseEvent) => {
    e.preventDefault();
    opts.onSkip();
  };
  let armed = false;
  const arm = () => {
    armed = true;
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
  };
  skip.addEventListener("click", onSkipClick);

  const finish = () => {
    if (over) return;
    over = true;
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    if (armed) {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    }
    skip.removeEventListener("click", onSkipClick);
    anims.forEach((a) => {
      try {
        a.cancel();
      } catch {}
    });
    ends.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    root.remove();
    opts.onDone();
  };

  const stop = (fast = false) => {
    if (over || leaving) return;
    if (!fast || calm || typeof root.animate !== "function") {
      finish();
      return;
    }
    leaving = true;
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SKIP_FADE, easing: "ease-out", fill: "forwards" });
    fade.finished.then(finish, finish);
    window.setTimeout(finish, SKIP_FADE + 120);
  };

  try {
    later(40, () => {
      title.textContent = show.title;
      if (show.text) text.textContent = show.text;
      else text.remove();
    });
    if (!calm) {
      anim(
        dock,
        [
          { opacity: 0, transform: "translateY(14px) scale(.94)", filter: "blur(6px)" },
          { opacity: 1, transform: "translateY(0px) scale(1)", filter: "blur(0px)" },
        ],
        { dur: 460, delay: CARD_IN, easing: EASE },
      );
      anim(dock, [{ opacity: 1, transform: "translateY(0px) scale(1)" }, { opacity: 0, transform: "translateY(-8px) scale(.97)" }], {
        dur: CARD_OUT,
        delay: total - CARD_OUT,
        easing: "ease-in",
        fill: "forwards",
      });
      const focal = { x: vw / 2, y: clamp(vh / 2 - 64, 120, vh - 160) };
      const originEl = show.origin && typeof Element !== "undefined" && show.origin instanceof Element ? show.origin : null;
      const originBox = show.origin && !originEl ? (show.origin as DOMRect) : null;
      const fromRail = !!originEl?.closest(".sx-rail");
      let at = 0;
      steps.forEach((key, i) => {
        later(at, () => {
          root.setAttribute("data-step", key);
          chips[i]?.setAttribute("data-on", "");
          const own = railNode(RAIL[key], originEl, vw, vh);
          const stepEl = fromRail || i > 0 ? (own ?? originEl) : (originEl ?? own);
          const elRect = rectOf(stepEl, vw, vh, false);
          const stepRect = elRect ?? (i === 0 ? rectOf(originBox, vw, vh) : null);
          SCENES[key]({
            fx,
            vw,
            vh,
            focal,
            dur: per,
            uid: uid * 10 + i,
            g,
            origin: stepRect ? center(stepRect) : null,
            originEl: elRect ? stepEl : null,
            anim,
            later,
            onEnd: (fn) => ends.push(fn),
            node: (stage) => railNode(stage, originEl, vw, vh),
            nudge,
          });
        });
        at += per;
      });
    } else {
      chips.forEach((chip) => chip.setAttribute("data-on", ""));
    }
    later(ARM_MS, arm);
    later(total, finish);
  } catch {
    finish();
  }

  return { stop };
}
