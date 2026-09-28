"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { fmtNumber } from "@/lib/lexai";

// Same 55ms step the shared reveal uses (components/RevealOnScroll.tsx), so the
// digits of a tile start moving exactly as that tile fades in. Measured before
// this change: the tile reached .in with the stats row top at 903px but the
// counter only started at 844px, because the counter observer asked for
// threshold .5 while the reveal asks for threshold .06 with a -6% root margin.
// Two triggers 59px of scroll apart is precisely the "ketma-ketlik" complaint,
// so the counter now uses the reveal's options and the reveal's delay.
const STEP_MS = 55;
const DURATION = 1100;

function Stat({
  to,
  sfx,
  label,
  index,
}: {
  to: number;
  sfx: string;
  label: string;
  index: number;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = Math.min(index, 4) * STEP_MS;
    let frame = 0;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(el);
          if (reduce) {
            el.textContent = fmtNumber(to) + sfx;
            return;
          }
          let t0: number | null = null;
          const step = (ts: number) => {
            if (t0 === null) t0 = ts;
            const p = Math.min((ts - t0 - delay) / DURATION, 1);
            if (p > 0) {
              el.textContent =
                fmtNumber(Math.floor(to * (1 - Math.pow(1 - p, 3)))) + sfx;
            }
            if (p < 1) frame = requestAnimationFrame(step);
          };
          frame = requestAnimationFrame(step);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    io.observe(el);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, [to, sfx, index]);
  return (
    <div className="stat">
      <b ref={ref}>0</b>
      <span>{label}</span>
    </div>
  );
}

export default function Stats() {
  const t = useTranslations("home.stats");
  return (
    <section className="sec tight">
      <div className="wrap">
        <div className="stats">
          <Stat to={1240} sfx="" label={t("lawyers")} index={0} />
          <Stat to={200} sfx="+" label={t("templates")} index={1} />
          <Stat
            to={60}
            sfx={t("responseSuffix")}
            label={t("response")}
            index={2}
          />
          <Stat to={14} sfx="" label={t("coverage")} index={3} />
        </div>
      </div>
    </section>
  );
}
