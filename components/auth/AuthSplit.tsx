"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconLogo, IconCheck } from "../icons";
import ThemeToggle from "../ThemeToggle";

const COUNT_MS = 1400;

// Counts a stat such as "12k+" or "4.9" up from zero while its card rises in.
// The server renders the final value, so without JS (or with reduced motion)
// the real number is what shows. The count only starts if the card is still
// hidden behind its entrance delay — on a slow hydration the card may already
// be visible, and a number dropping back to 0 would look like a glitch.
function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const m = /^(\d+(?:[.,]\d+)?)(.*)$/.exec(value);
    if (!el || !m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const card = el.closest<HTMLElement>(".auth__stat");
    const anim = card?.getAnimations?.()[0];
    const timing = anim?.effect?.getComputedTiming();
    const delay = Number(anim?.effect?.getTiming().delay ?? 0);
    const local = Number(timing?.localTime ?? 0);
    if (!anim || local >= delay) return;

    const [whole, frac = ""] = m[1].split(/[.,]/);
    const target = Number(`${whole}.${frac || 0}`);
    const sep = m[1].includes(",") ? "," : ".";
    const fmt = (n: number) => n.toFixed(frac.length).replace(".", sep) + m[2];
    el.textContent = fmt(0);

    const start = performance.now() + (delay - local);
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(Math.max((now - start) / COUNT_MS, 0), 1);
      el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = value;
    };
  }, [value]);
  // Keyed by value so a new string gets a fresh text node React owns.
  return (
    <b ref={ref} key={value}>
      {value}
    </b>
  );
}

// Stagger position for the entrance choreography in globals.css.
const at = (i: number) => ({ "--i": i }) as CSSProperties;

export default function AuthSplit({ children }: { children: ReactNode }) {
  const t = useTranslations("auth");
  const feats = t.raw("features") as string[];
  const stats = [
    { n: t("stat1n"), l: t("stat1l") },
    { n: t("stat2n"), l: t("stat2l") },
    { n: t("stat4n"), l: t("stat4l") },
    { n: t("stat3n"), l: t("stat3l") },
  ];
  return (
    <div className="auth">
      <aside className="auth__brand">
        <span className="auth__bg" aria-hidden />
        <span className="auth__mesh" />
        <div className="auth__brand-in">
          <Link href="/" className="auth__logo">
            <span className="logo__m">
              <IconLogo />
            </span>
            LexGo
          </Link>
          <div className="auth__copy">
            <h2 className="auth__h">{t("headline")}</h2>
            <p className="auth__p">{t("sub")}</p>
            <ul className="auth__feats">
              {feats.map((f, i) => (
                <li key={i} style={at(i)}>
                  <IconCheck />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="auth__stats">
            {stats.map((s, i) => (
              <div key={i} className="auth__stat" style={at(i)}>
                <CountUp value={s.n} />
                <span>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
      <main className="auth__main">
        <div className="auth__tools">
          <ThemeToggle variant="square" />
        </div>
        <div className="auth__main-in">{children}</div>
      </main>
    </div>
  );
}
