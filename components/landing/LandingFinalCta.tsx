import { Fragment, type CSSProperties } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IMG } from "./images";
import "./css/finalCta.css";

/**
 * The silhouette of the courthouse, its steps and the walker, traced from
 * cta-columns.webp. A second copy of the photo is clipped to it and sits above
 * the h2, so the words can travel behind the marble. It is vector and relative
 * to the photo's own box, so it stays exact at any crop or size.
 */
const SILHOUETTE =
  "M.6094 0L1 0L1 1L.2781 1L.0375 .9989L.0506 .9967L.0544 .9945L.0556 .9911L.0725 .9878L.075 .9867L.0756 .9834L.0881 .9811L.0887 .9778L.0963 .9778L.0988 .9745L.1119 .9723L.1125 .9689L.1344 .9634L.135 .96L.1475 .9578L.1494 .9545L.1569 .9545L.1581 .9512L.1706 .9489L.175 .9445L.1963 .939L.1975 .9356L.2188 .9301L.2219 .9267L.2306 .9256L.2338 .9223L.2425 .9212L.2456 .9179L.2512 .9179L.28 .9068L.4269 .8613L.4275 .859L.425 .8446L.4238 .8446L.4238 .8524L.4219 .8524L.42 .8491L.4213 .8202L.4238 .8102L.425 .7969L.4338 .7902L.4331 .7747L.435 .7714L.4381 .7714L.4406 .7747L.4406 .7858L.4387 .7913L.4456 .7969L.4481 .8213L.4481 .8479L.4469 .8513L.445 .8502L.4456 .8446L.4437 .8213L.4419 .8213L.4431 .8502L.4406 .8513L.44 .8568L.4988 .8413L.4988 .8346L.5 .8335L.5125 .8302L.5131 .8224L.5188 .8169L.52 .8102L.5212 .8102L.5194 .8036L.52 .7991L.5256 .7913L.5394 .5905L.5556 .4007L.5556 .3973L.5494 .394L.5431 .394L.5413 .3896L.5425 .3718L.5475 .3596L.545 .3574L.5444 .3541L.5487 .3474L.5475 .3196L.5444 .3163L.5444 .313L.5506 .3019L.5513 .2808L.5269 .2664L.5269 .2531L.5256 .2531L.525 .2497L.5212 .2486L.5212 .2464L.5169 .242L.5162 .2386L.5337 .1964ZM.6044 .3896L.6019 .394L.5988 .3918L.5975 .394L.5925 .6127L.5863 .778L.5863 .7902L.5894 .7891L.59 .7847L.5919 .7802L.5906 .768L.595 .7614L.5962 .7481L.6031 .5583L.6112 .4051L.6112 .3929Z";

const PHOTO_SIZES = "(max-aspect-ratio: 1/1) 244vw, max(100vw, 178vh)";

export default function LandingFinalCta() {
  const t = useTranslations("landing.finalCta");
  const tc = useTranslations("home.funnelCta");
  const words = t("title").split(" ");
  const longest = Math.max(...words.map((word) => word.length));

  return (
    <section className="lh-final lh-dark" style={{ "--lh-word": longest } as CSSProperties}>
      <svg className="lh-final__defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id="lh-final-silhouette" clipPathUnits="objectBoundingBox">
            <path d={SILHOUETTE} clipRule="evenodd" />
          </clipPath>
        </defs>
      </svg>

      {/* Always present: this is what opens from a rounded inset on scrub. */}
      <div className="lh-final__frame">
        <div className="lh-final__plate lh-final__plate--back lh-grain">
          <Image src={IMG.ctaColumns.src} alt="" fill quality={90} sizes={PHOTO_SIZES} />
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
            <div className="lh-final__actions" data-lh-rise-group>
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
          <Image src={IMG.ctaColumns.src} alt="" fill quality={90} sizes={PHOTO_SIZES} />
          <i className="lh-final__sun" />
          <i className="lh-final__steps" />
        </div>
        <div className="lh-final__fade" aria-hidden="true" />
      </div>
    </section>
  );
}
