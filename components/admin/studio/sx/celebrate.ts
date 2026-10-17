import { prefersReducedMotion } from "./hooks";

export type CelebrateOptions = { colors?: readonly string[]; particles?: number; duration?: number };

type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  color: string;
  round: boolean;
};

const COLOR_VARS = ["--sx-published-fg", "--sx-approved-fg", "--sx-accent", "--sx-submitted-fg", "--sx-review-fg"] as const;
const FALLBACK_COLORS = ["#047857", "#1D4ED8", "#1668F0", "#B45309", "#6D28D9"] as const;
const GRAVITY = 0.0016;
const DRAG = 0.985;
const FRAME = 1000 / 60;
const FADE = 250;
const CONE = Math.PI / 3;

let running: (() => void) | null = null;

const noop = () => {};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function readColors(origin: Element | DOMRect): string[] {
  const host = origin instanceof Element ? origin : document.querySelector(".sx, .sx-pop");
  if (!host) return [...FALLBACK_COLORS];
  const style = getComputedStyle(host);
  const out = COLOR_VARS.map((v, i) => style.getPropertyValue(v).trim() || FALLBACK_COLORS[i]);
  return out.length ? out : [...FALLBACK_COLORS];
}

function onTop(origin: Element, rect: DOMRect): boolean {
  if (getComputedStyle(origin).visibility === "hidden") return false;
  if (typeof document.elementFromPoint !== "function") return true;
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return !hit || hit === origin || origin.contains(hit);
}

function visibleRect(origin: Element | DOMRect, width: number, height: number): DOMRect | null {
  const rect = origin instanceof Element ? origin.getBoundingClientRect() : origin;
  if (!rect || (rect.width <= 0 && rect.height <= 0)) return null;
  if (rect.bottom < 0 || rect.right < 0 || rect.top > height || rect.left > width) return null;
  if (origin instanceof Element && !onTop(origin, rect)) return null;
  return rect;
}

export function celebrate(origin: Element | DOMRect, options: CelebrateOptions = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined" || !document.body) return noop;
  if (prefersReducedMotion()) return noop;
  const root = document.documentElement;
  const width = root.clientWidth || window.innerWidth;
  const height = root.clientHeight || window.innerHeight;
  const rect = visibleRect(origin, width, height);
  if (!rect) return noop;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return noop;

  running?.();

  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  canvas.className = "sx-confetti";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "1000" });
  document.body.appendChild(canvas);

  const count = Math.round(clamp(options.particles ?? 70, 1, 160));
  const duration = clamp(options.duration ?? 800, 200, 2000);
  const colors = options.colors?.length ? [...options.colors] : readColors(origin);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const bits: Bit[] = Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * CONE;
    const speed = 0.35 + Math.random() * 0.25;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() * 2 - 1) * 0.02,
      flip: Math.random() * Math.PI,
      flipSpeed: 0.008 + Math.random() * 0.012,
      color: colors[i % colors.length],
      round: i % 2 === 1,
    };
  });

  let raf = 0;
  let start = 0;
  let last = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    canvas.remove();
    if (running === stop) running = null;
  };

  const frame = (now: number) => {
    if (stopped) return;
    if (!start) {
      start = now;
      last = now;
    }
    const elapsed = now - start;
    const dt = clamp(now - last, 0, 48);
    last = now;
    const drag = Math.pow(DRAG, dt / FRAME);
    const alpha = elapsed > duration - FADE ? clamp((duration - elapsed) / FADE, 0, 1) : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = alpha;
    for (const b of bits) {
      b.vy += GRAVITY * dt;
      b.vx *= drag;
      b.vy *= drag;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
      b.flip += b.flipSpeed * dt;
      ctx.fillStyle = b.color;
      if (b.round) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 1.75, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.scale(1, Math.max(0.2, Math.abs(Math.cos(b.flip))));
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.restore();
      }
    }
    if (elapsed >= duration) {
      stop();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  running = stop;
  raf = requestAnimationFrame(frame);
  return stop;
}
