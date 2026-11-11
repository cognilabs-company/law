"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { IMG } from "./images";
import "./css/manifesto.css";

const PHOTOS = [IMG.trustSteps, IMG.trustWoman, IMG.svcContract];
const SWIPE_PX = 36;

// Rough advance widths of the display face, in em, at this section's tracking.
// Knowing a word's width from its letters, instead of its length, lets CSS size
// the type at render time: "tajriba," and "Открытый" have the same letter count
// and very different widths.
const NARROW = /[ijl'’.,:;!|]/;
const SLIM = /[tfrсгт]/;
const WIDE = /[mwшщжмыюфдлОQOGMWШЩЖМЫЮФ]/;
function emWidth(word: string) {
  let sum = 0;
  for (const ch of word) {
    if (NARROW.test(ch)) sum += 0.2;
    else if (SLIM.test(ch)) sum += 0.38;
    else if (WIDE.test(ch)) sum += 0.68;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) sum += 0.62;
    else sum += 0.5;
    sum -= 0.058; // the heading's letter-spacing
  }
  return sum;
}

/**
 * The second fold: four giant words with a rotated photo card over the middle,
 * so the letters pass behind it. The heading comes first in the DOM (it reads
 * straight through, and keeps h2 before the note's h3); the grid places it.
 */
export default function LandingManifesto() {
  const t = useTranslations("landing.manifesto");
  const tServices = useTranslations("landing.services");
  const slides = t.raw("slides") as { title: string; text: string }[];
  const [at, setAt] = useState(0);
  const [dir, setDir] = useState(1);
  const swipeFrom = useRef<number | null>(null);

  const go = (next: number, direction: number) => {
    setDir(direction);
    setAt((next + slides.length) % slides.length);
  };

  const onDown = (e: PointerEvent) => {
    swipeFrom.current = e.clientX;
  };
  const onUp = (e: PointerEvent) => {
    if (swipeFrom.current === null) return;
    const moved = e.clientX - swipeFrom.current;
    swipeFrom.current = null;
    if (Math.abs(moved) < SWIPE_PX) return;
    go(at + (moved < 0 ? 1 : -1), moved < 0 ? 1 : -1);
  };

  const w = [t("w1"), t("w2"), t("w3"), t("w4")];
  const [e1, e2, e3, e4] = w.map(emWidth);
  const cyr = /[а-яё]/i.test(w.join("")) ? 1.15 : 1;
  const fit = {
    // Widest word on each side, and widest full line: the type is sized from these.
    "--lh-a": (Math.max(e1, e3) * cyr).toFixed(2),
    "--lh-b": (Math.max(e2, e4) * cyr).toFixed(2),
    // Portrait fits this on one line. The per-letter table runs short, most of all
    // for Cyrillic, and a word pushed past the screen's edge is cut off.
    "--lh-l": (Math.max(e1 + e2, e3 + e4) * (/[а-яё]/i.test(w.join("")) ? 1.12 : 1.05)).toFixed(2),
  } as CSSProperties;

  return (
    <section className="lh-mani" id="nega">
      <div className="lh-mani__in" style={fit}>
        <h2 className="lh-mani__type">
          <span className="lh-mani__line">
            <span className="lh-mani__w lh-mani__w--mist" data-w="1">{w[0]}</span>{" "}
            <span className="lh-mani__w" data-w="2">{w[1]}</span>
          </span>{" "}
          <span className="lh-mani__line">
            <span className="lh-mani__w" data-w="3">{w[2]}</span>{" "}
            <span className="lh-mani__w lh-mani__w--mist" data-w="4">{w[3]}</span>
          </span>
        </h2>

        <div className="lh-mani__top">
          <div className="lh-mani__badge">
            <span className="lh-mani__orbit" aria-hidden="true" />
            <b className="lh-mani__badgev">{t("badgeValue")}</b>
            <span className="lh-mani__badget">{t("badgeText")}</span>
          </div>
          <div className="lh-mani__note">
            <b className="lh-mani__no">{t("noteNo")}</b>
            <div className="lh-mani__body">
              <h3 className="lh-mani__notet">{t("noteTitle")}</h3>
              <p className="lh-mani__notep">{t("noteText")}</p>
            </div>
          </div>
        </div>

        <div
          className="lh-mani__card"
          data-lh-cursor="drag"
          data-lh-cursor-label={tServices("drag")}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={() => {
            swipeFrom.current = null;
          }}
        >
          <div className="lh-mani__tilt">
            <span className="lh-mani__shadow" aria-hidden="true" />
            <div className="lh-mani__clip">
              <div className="lh-mani__slides" aria-hidden="true" style={{ "--lh-dir": dir } as CSSProperties}>
                {slides.map((s, i) => (
                  <div className={`lh-mani__slide${i === at ? " is-on" : ""}`} key={s.title}>
                    <Image
                      src={PHOTOS[i % PHOTOS.length].src}
                      width={PHOTOS[i % PHOTOS.length].width}
                      height={PHOTOS[i % PHOTOS.length].height}
                      alt=""
                      quality={90}
                      draggable={false}
                      sizes="(max-aspect-ratio: 1/1) 80vw, min(34vw, 66vh)"
                    />
                    <div className="lh-mani__cap lh-glass">
                      <b>{s.title}</b>
                      <span>{s.text}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="lh-mani__dots">
                {slides.map((s, i) => (
                  <button
                    key={s.title}
                    type="button"
                    className="lh-mani__dot"
                    aria-label={s.title}
                    aria-current={i === at ? "true" : undefined}
                    onClick={() => go(i, i >= at ? 1 : -1)}
                  />
                ))}
              </div>
              {/* The slides above are hidden from assistive tech; this says the
                  one on screen, and speaks up when a visitor changes it. */}
              <p className="sr-only" aria-live="polite">
                {slides[at].title}. {slides[at].text}
              </p>
            </div>
          </div>
        </div>

        <div className="lh-mani__ctrl">
          <button type="button" className="lh-round" aria-label={t("prev")} onClick={() => go(at - 1, -1)}>
            <IconChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className="lh-round lh-round--solid" aria-label={t("next")} onClick={() => go(at + 1, 1)}>
            <IconChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
