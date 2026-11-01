"use client";

import type { CSSProperties, ReactNode } from "react";
import { preload } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconLogo, IconLogoText, IconCheck } from "../icons";
import ThemeToggle from "../ThemeToggle";

// The brand panel paints this photo behind everything (globals.css
// .auth__bg::before). Asked for up front so the reveal never runs over a
// blank pane; scoped to the widths where the panel is shown at all — below
// 981px the aside is display:none and the bytes would be wasted.
const BRAND_IMG = "/img/law-login.jpg";
const BRAND_MQ = "(min-width: 981px)";

// Stagger position for the entrance choreography in globals.css.
const at = (i: number) => ({ "--i": i }) as CSSProperties;

// The headline's last word carries the gradient accent (.auth__h-acc):
// "Legal help, reimagined." → ["Legal help, ", "reimagined."]. The messages
// keep one plain string per locale, so the split happens here rather than
// through t.rich. A one-word headline is accented whole.
function splitAccent(s: string): [string, string] {
  const m = /^([\s\S]*\s)(\S+)\s*$/.exec(s);
  return m ? [m[1], m[2]] : ["", s];
}

export default function AuthSplit({ children }: { children: ReactNode }) {
  const t = useTranslations("auth");
  preload(BRAND_IMG, { as: "image", fetchPriority: "high", media: BRAND_MQ });
  const feats = t.raw("features") as string[];
  const [headline, accent] = splitAccent(t("headline"));
  return (
    <div className="auth">
      <aside className="auth__brand">
        <span className="auth__bg" aria-hidden />
        {/* Glow orbs drift over the photo on their own layers (the photo layer
            already animates transform, so nothing is added to it). */}
        <span className="auth__orbs" aria-hidden>
          <span className="auth__orb auth__orb--1" />
          <span className="auth__orb auth__orb--2" />
          <span className="auth__orb auth__orb--3" />
        </span>
        <span className="auth__mesh" />
        <div className="auth__brand-in">
          <Link href="/" className="auth__logo">
            <span className="logo__m">
              <IconLogo />
            </span>
            <IconLogoText />
          </Link>
          <div className="auth__copy">
            <h2 className="auth__h">
              {headline}
              <span className="auth__h-acc">{accent}</span>
            </h2>
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
          {/* No client / lawyer counts or average rating here: the backend
              publishes no such figures, and made-up ones are not shown. */}
        </div>
      </aside>
      <main className="auth__main">
        {/* Ambient glow for phones/tablets, where the brand panel is hidden
            (shown only ≤980px, see .auth__amb). */}
        <span className="auth__amb" aria-hidden>
          <span className="auth__amb-orb auth__amb-orb--1" />
          <span className="auth__amb-orb auth__amb-orb--2" />
        </span>
        <div className="auth__tools">
          <ThemeToggle variant="square" />
        </div>
        <div className="auth__main-in">{children}</div>
      </main>
    </div>
  );
}
