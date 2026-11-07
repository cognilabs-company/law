"use client";

import { useEffect, useRef } from "react";

const COUNT = 90;
const MAX_DPR = 1.5;
// A 4K canvas at full density costs more than these soft glows are worth.
const MAX_PIXELS = 9_000_000;
const TAU = Math.PI * 2;

type Dust = {
  x: number;
  y: number;
  seed: number;
  speed: number;
  size: number;
  age: number;
  life: number;
  alpha: number;
  angle: number;
};

/** A soft azure point, drawn once and stamped, so 90 glows stay cheap. */
function makeSprite() {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const ctx = sprite.getContext("2d");
  if (ctx) {
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "rgba(226,243,255,1)");
    glow.addColorStop(0.12, "rgba(120,200,255,.95)");
    glow.addColorStop(0.34, "rgba(11,140,255,.34)");
    glow.addColorStop(1, "rgba(11,140,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
  }
  return sprite;
}

/**
 * Continues the statue's dissolving particles out across the section. Plain 2D
 * canvas, decorative only. It runs only while on screen and with the tab
 * visible, and never starts under reduced motion: the photograph already holds
 * its own particles, so the page is complete without this layer.
 */
export default function LandingAiParticles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const section = canvas?.closest<HTMLElement>(".lh-ai");
    const statue = section?.querySelector<HTMLElement>(".lh-ai__statue");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !section || !statue || !ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const portrait = window.matchMedia("(max-aspect-ratio: 1/1)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const sprite = makeSprite();
    const dust: Dust[] = [];

    let width = 0;
    let height = 0;
    let scale = 1;
    let bias = 0;
    let bandX = 0;
    let bandW = 0;
    let bandY = 0;
    let bandH = 0;
    let frame = 0;
    let last = 0;
    let onScreen = false;
    let pointerX = -1e4;
    let pointerY = -1e4;

    const spawn = (p: Dust, scatter: boolean) => {
      p.seed = Math.random() * TAU;
      p.speed = (16 + Math.random() * Math.random() * 62) * scale;
      p.size = (5 + Math.random() * Math.random() * 15) * scale;
      p.life = 7 + Math.random() * 11;
      p.age = scatter ? Math.random() * p.life : 0;
      p.x = bandX + Math.random() * bandW;
      p.y = bandY + Math.random() * bandH;
      if (scatter) {
        // Fill the stream at once, rather than letting it grow from the statue.
        const reach = p.speed * p.age;
        p.x += Math.cos(bias) * reach;
        p.y += Math.sin(bias) * reach;
      }
    };

    const measure = () => {
      const box = section.getBoundingClientRect();
      const art = statue.getBoundingClientRect();
      const isPortrait = portrait.matches;
      width = box.width;
      // The stream lives around the statue, not down the whole text column.
      height = Math.min(box.height, art.bottom - box.top + (isPortrait ? art.height * 0.5 : 0));
      scale = Math.max(0.8, width / (isPortrait ? 760 : 1440));
      // Landscape streams right; a portrait stream falls toward the phone below.
      bias = isPortrait ? 0.95 : -0.04;
      bandX = art.left - box.left + art.width * (isPortrait ? 0.56 : 0.62);
      bandW = art.width * 0.2;
      bandY = art.top - box.top + art.height * 0.2;
      bandH = art.height * 0.72;

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        MAX_DPR,
        Math.sqrt(MAX_PIXELS / Math.max(1, width * height)),
      );
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!dust.length) {
        for (let i = 0; i < COUNT; i++) {
          const p = {} as Dust;
          spawn(p, true);
          p.alpha = 0;
          p.angle = bias;
          dust.push(p);
        }
      }
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const t = now * 0.001;
      const linkRange = 118 * scale;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      for (const p of dust) {
        p.age += dt;
        // Two slow waves bend the stream into the filaments in the photograph.
        p.angle =
          bias +
          Math.sin((p.y / scale) * 0.0052 + t * 0.26 + p.seed) * 0.58 +
          Math.sin((p.x / scale) * 0.0031 - t * 0.17) * 0.32;
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;

        const dx = p.x - pointerX;
        const dy = p.y - pointerY;
        const d2 = dx * dx + dy * dy;
        const reach = 150 * scale;
        if (d2 < reach * reach) {
          const push = (1 - Math.sqrt(d2) / reach) * 90 * scale * dt;
          const d = Math.sqrt(d2) || 1;
          p.x += (dx / d) * push;
          p.y += (dy / d) * push;
        }

        if (p.age > p.life || p.x > width + 40 || p.x < -40 || p.y > height + 40 || p.y < -40) spawn(p, false);

        const fadeIn = Math.min(1, p.age / 1.1);
        const fadeOut = Math.min(1, (p.life - p.age) / 2.2);
        const edge = Math.min(1, (height - p.y) / (height * 0.16));
        p.alpha = Math.max(0, Math.min(fadeIn, fadeOut, edge));
      }

      // Hairlines between neighbours: three weights, so one path per weight.
      for (const [weight, from, to] of [
        [0.07, 0.62, 1],
        [0.15, 0.32, 0.62],
        [0.28, 0, 0.32],
      ] as const) {
        ctx.beginPath();
        for (let i = 0; i < dust.length; i++) {
          const a = dust[i];
          if (a.alpha < 0.25) continue;
          for (let j = i + 1; j < dust.length; j++) {
            const b = dust[j];
            if (b.alpha < 0.25) continue;
            const ratio = Math.hypot(a.x - b.x, a.y - b.y) / linkRange;
            if (ratio >= from && ratio < to) {
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
            }
          }
        }
        ctx.strokeStyle = `rgba(62,164,255,${weight})`;
        ctx.lineWidth = Math.max(0.6, 0.8 * scale);
        ctx.stroke();
      }

      for (const p of dust) {
        if (p.alpha <= 0.01) continue;
        const tail = p.speed * 0.34;
        ctx.globalAlpha = p.alpha * 0.5;
        ctx.strokeStyle = "rgb(70,172,255)";
        ctx.lineWidth = Math.max(0.6, p.size * 0.075);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(p.angle) * tail, p.y - Math.sin(p.angle) * tail);
        ctx.stroke();

        const twinkle = 0.72 + 0.28 * Math.sin(t * 1.4 + p.seed * 3);
        ctx.globalAlpha = p.alpha * twinkle;
        ctx.drawImage(sprite, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      }
      ctx.globalAlpha = 1;
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const sync = () => {
      const run = onScreen && !document.hidden && !motion.matches;
      if (run && !frame) {
        last = performance.now();
        frame = requestAnimationFrame(draw);
      } else if (!run && frame) {
        stop();
      }
      if (motion.matches) ctx.clearRect(0, 0, width, height);
    };

    measure();

    const sized = new ResizeObserver(() => measure());
    sized.observe(section);

    const seen = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { rootMargin: "8% 0px" },
    );
    seen.observe(canvas);

    const onMove = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointerX = e.clientX - box.left;
      pointerY = e.clientY - box.top;
    };
    const onLeave = () => {
      pointerX = pointerY = -1e4;
    };
    if (finePointer) {
      section.addEventListener("pointermove", onMove, { passive: true });
      section.addEventListener("pointerleave", onLeave);
    }
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);

    return () => {
      stop();
      sized.disconnect();
      seen.disconnect();
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
    };
  }, []);

  return <canvas ref={ref} className="lh-ai__dust" aria-hidden="true" />;
}
