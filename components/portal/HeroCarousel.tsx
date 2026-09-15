"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// public/img/hero-img-<n> files in number order, listed by next.config.ts.
const IMAGES = (process.env.HERO_IMAGES ?? "").split(",").filter(Boolean);

// Keep in step with the .cdart__img animations in globals.css.
const FIRST_MS = 600; // first picture fades in on page entry
const IN_MS = 1020; // next picture slides in from the right (.12s delay + .9s)
const HOLD_MS = 2000; // each picture rests this long once it has arrived

// Pictures with a solid background get their edges feathered into the hero;
// cut-outs keep their outline and float with a shadow. Decided from the
// loaded pixels, so a new image needs no flag.
function hasSolidCorners(img: HTMLImageElement): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    return [0, 7, 56, 63].every((p) => d[p * 4 + 3] > 240);
  } catch {
    return false;
  }
}

export default function HeroCarousel() {
  const [shown, setShown] = useState({ cur: 0, prev: -1 });
  const [solid, setSolid] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (IMAGES.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number | undefined;
    const tick = () => {
      setShown((s) => ({ prev: s.cur, cur: (s.cur + 1) % IMAGES.length }));
      timer = window.setTimeout(tick, IN_MS + HOLD_MS);
    };
    const start = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, ms);
    };
    // A hidden tab doesn't animate; resume with a full rest when it's back so
    // the user never lands mid-transition.
    const onVisibility = () => (document.hidden ? window.clearTimeout(timer) : start(HOLD_MS));
    start(FIRST_MS + HOLD_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!IMAGES.length) return null;

  return (
    <div className="cdart" aria-hidden>
      {IMAGES.map((src, i) => {
        const state =
          i === shown.cur ? (shown.prev < 0 ? " cdart__img--first" : " cdart__img--in") : i === shown.prev ? " cdart__img--out" : "";
        return (
          <Image
            key={src}
            src={src}
            alt=""
            fill
            sizes="(max-width: 1200px) 38vw, 460px"
            draggable={false}
            className={`cdart__img${state}${solid[src] ? " cdart__img--solid" : ""}`}
            onLoad={(e) => {
              const isSolid = hasSolidCorners(e.currentTarget);
              if (isSolid) setSolid((m) => (m[src] ? m : { ...m, [src]: true }));
            }}
          />
        );
      })}
    </div>
  );
}
