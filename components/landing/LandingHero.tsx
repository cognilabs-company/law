import type { CSSProperties } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IMG } from "./images";
import "./css/hero.css";

/**
 * Advance widths of Inter Tight 400 capitals, in thousandths of an em. They let
 * CSS size the big line to the container on the first paint, for any language,
 * so the line is already edge to edge before hydration and with no JS at all.
 * motion/hero.ts then only corrects the last percent (kerning).
 */
const CAPS: Record<string, number> = {
  A: 629, B: 604, C: 681, D: 672, E: 551, F: 540, G: 696, H: 692, I: 217, J: 495,
  K: 605, L: 516, M: 846, N: 707, O: 715, P: 588, Q: 715, R: 593, S: 591, T: 595,
  U: 694, V: 629, W: 909, X: 595, Y: 618, Z: 578,
  А: 629, Б: 612, В: 604, Г: 528, Д: 698, Е: 551, Ё: 551, Ж: 901, З: 590, И: 707,
  Й: 707, К: 601, Л: 666, М: 846, Н: 692, О: 715, П: 675, Р: 588, С: 681, Т: 595,
  У: 576, Ф: 744, Х: 595, Ц: 698, Ч: 667, Ш: 904, Щ: 927, Ъ: 766, Ы: 802, Ь: 606,
  Э: 623, Ю: 965, Я: 621, " ": 234, "'": 249, "’": 249, "ʻ": 220,
};
const TRACKING = -0.06;

function emWidth(text: string) {
  const upper = text.toUpperCase();
  let width = 0;
  for (const ch of upper) width += (CAPS[ch] ?? 640) / 1000 + TRACKING;
  return width;
}

const PAPERS_BACK = ["a", "b", "c"];
const PAPERS_FRONT = ["d", "e", "f"];

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export default function LandingHero() {
  const t = useTranslations();
  const big = t("landing.hero.big");
  const words = big.split(/\s+/).filter(Boolean);
  const tags = t.raw("home.hero.tags") as string[];

  const vars = {
    "--chars": big.length,
    "--word": Math.max(...words.map((w) => w.length)),
    "--lh-em-line": emWidth(big).toFixed(3),
    "--lh-em-word": Math.max(...words.map(emWidth)).toFixed(3),
    "--lh-lines": words.length,
  } as CSSProperties;

  return (
    <section className="hero lh-hero" id="top">
      <div className="lh-hero__pin" style={vars}>
        <div className="lh-hero__plate lh-grain" aria-hidden="true">
          <div className="lh-hero__plate-in">
            <Image
              className="lh-hero__plate-img"
              src={IMG.heroPlate.src}
              width={IMG.heroPlate.width}
              height={IMG.heroPlate.height}
              alt=""
              sizes="(max-aspect-ratio: 1/1) 200vw, 100vw"
              quality={90}
              fetchPriority="high"
              loading="eager"
            />
          </div>
        </div>
        <div className="lh-hero__scrim" aria-hidden="true" />

        {/* No position, transform or z-index on the h1: the woman passes between its two parts. */}
        <h1 className="lh-hero__title">
          <b className="lh-hero__big">{big}</b> <em className="lh-hero__small">{t("landing.hero.small")}</em>
        </h1>

        {PAPERS_BACK.map((k) => (
          <i key={k} className={`lh-hero__paper lh-hero__paper--${k}`} aria-hidden="true" />
        ))}

        <div className="lh-hero__woman" aria-hidden="true">
          <div className="lh-hero__woman-in">
            <i className="lh-hero__shadow" />
            <Image
              className="lh-hero__reflect"
              src={IMG.heroSubject.src}
              width={IMG.heroSubject.width}
              height={IMG.heroSubject.height}
              alt=""
              sizes="(max-aspect-ratio: 1/1) 110vw, 62vw"
              quality={90}
              fetchPriority="high"
              loading="eager"
            />
            <Image
              className="lh-hero__subject"
              src={IMG.heroSubject.src}
              width={IMG.heroSubject.width}
              height={IMG.heroSubject.height}
              alt=""
              sizes="(max-aspect-ratio: 1/1) 110vw, 62vw"
              quality={90}
              fetchPriority="high"
              loading="eager"
            />
          </div>
        </div>

        {PAPERS_FRONT.map((k) => (
          <i key={k} className={`lh-hero__paper lh-hero__paper--${k}`} aria-hidden="true" />
        ))}

        <ul className="hero__tags lh-hero__tags">
          {tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>

        <div className="lh-hero__foot">
          <div className="lh-hero__foot-in">
            <p className="lh-hero__lead">{t("landing.hero.lead")}</p>
            <div className="lh-hero__cta">
              <Link href="/chat" className="lh-btn lh-btn--white">
                {t("landing.hero.primary")}
                <Arrow />
              </Link>
              <Link href="/lawyers" className="lh-btn lh-btn--glass">
                {t("landing.hero.secondary")}
              </Link>
            </div>
          </div>
        </div>

        <div className="lh-hero__mark" aria-hidden="true">
          <i className="lh-hero__elbow" />
          <i className="lh-hero__dot" />
        </div>

        <div className="lh-hero__cards">
          <div className="lh-hero__slot lh-hero__slot--a">
            <Link href="/lawyers" className="lh-hero__card lh-hero__card--a lh-glass">
              <span className="lh-hero__thumb">
                <Image src={IMG.trustSteps.src} width={IMG.trustSteps.width} height={IMG.trustSteps.height} alt="" sizes="96px" loading="eager" />
              </span>
              <span className="lh-hero__card-copy">
                <strong>{t("landing.hero.lawyersCardTitle")}</strong>
                <small>{t("landing.hero.lawyersCardText")}</small>
              </span>
              <Arrow />
            </Link>
          </div>
          <div className="lh-hero__slot lh-hero__slot--b">
            <Link href="/chat" className="lh-hero__card lh-hero__card--b lh-glass">
              <span className="lh-hero__card-copy">
                <b className="lh-hero__value">{t("landing.hero.aiCardValue")}</b>
                <strong>{t("landing.hero.aiCardTitle")}</strong>
                <small>{t("landing.hero.aiCardText")}</small>
              </span>
              <span className="lh-hero__thumb lh-hero__thumb--tall">
                <Image src={IMG.aiThemis.src} width={IMG.aiThemis.width} height={IMG.aiThemis.height} alt="" sizes="(max-aspect-ratio: 1/1) 30vw, 12vw" loading="eager" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
