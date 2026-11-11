import { Fragment, type CSSProperties } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IMG } from "./images";
import "./css/finalCta.css";

const PHOTO_SIZES = "(max-aspect-ratio: 1/1) 244vw, max(100vw, 178vh)";

export default function LandingFinalCta() {
  const t = useTranslations("landing.finalCta");
  const tc = useTranslations("home.funnelCta");
  const words = t("title").split(" ");
  const longest = Math.max(...words.map((word) => word.length));

  return (
    <section className="lh-final lh-dark" style={{ "--lh-word": longest } as CSSProperties}>
      {/* Always present: this is what opens from a rounded inset on scrub. */}
      <div className="lh-final__frame">
        <div className="lh-final__plate lh-final__plate--back lh-grain">
          <Image src={IMG.ctaColumns.src} alt="" fill quality={90} sizes={PHOTO_SIZES} placeholder="blur" blurDataURL={IMG.ctaColumns.blur} />
          <i className="lh-final__steps" />
        </div>
        <div className="lh-final__shade" aria-hidden="true" />

        <div className="lh-final__body">
          <p className="lh-kicker lh-final__kicker" data-lh-rise>
            {t("kicker")}
          </p>
          <h2 className="lh-final__title">
            {words.map((word, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                <b>{word}</b>
              </Fragment>
            ))}
          </h2>
          <div className="lh-final__foot">
            <p className="lh-final__lead" data-lh-rise>
              {t("lead")}
            </p>
            <div className="lh-final__actions">
              <span className="lh-final__mag">
                <Link href="/chat" className="lh-btn lh-btn--white" data-lh-cursor="link">
                  {tc("primary")}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </span>
              <span className="lh-final__mag">
                <Link href="/lawyers" className="lh-btn lh-btn--glass" data-lh-cursor="link">
                  {tc("secondary")}
                </Link>
              </span>
            </div>
          </div>
          <p className="lh-final__note">{t("photoNote")}</p>
        </div>

        {/* Same photo, clipped to the silhouette: everything here passes in front of the h2. */}
        <div className="lh-final__plate lh-final__plate--front" aria-hidden="true">
          <Image src={IMG.ctaColumnsFront.src} alt="" fill quality={90} sizes={PHOTO_SIZES} />
          <i className="lh-final__lit">
            <i className="lh-final__sun" />
            <i className="lh-final__steps" />
          </i>
        </div>
        <div className="lh-final__fade" aria-hidden="true" />
      </div>
    </section>
  );
}
