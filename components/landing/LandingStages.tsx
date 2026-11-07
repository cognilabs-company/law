import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import "./css/stages.css";

const STAGES = ["preInvestigation", "investigation", "firstInstance", "appeal", "cassation"] as const;

/**
 * The stages of a case as a flight of marble steps, from the first check at the
 * bottom left up to the Supreme Court at the top right. The list stays in
 * reading order in the DOM (01 to 05) and CSS stacks it from the floor up.
 * Everything here is already the finished staircase; motion/stages.ts only
 * lowers the steps first and lets them rise on scroll.
 */
export default function LandingStages() {
  const t = useTranslations();
  const title = t("stages.title");
  const cut = title.lastIndexOf(" ");

  return (
    <section className="lh-stages" id="bosqich">
      <div className="lh-st__stage">
        <div className="lh-st__in">
          <header className="lh-st__head">
            <p className="lh-kicker">{t("stages.kicker")}</p>
            <h2 className="lh-st__title" data-lh-lines="">
              {title.slice(0, cut)} <em className="lh-accent">{title.slice(cut + 1)}</em>
            </h2>
            <p className="lh-st__lead">{t("stages.lead")}</p>
          </header>

          <div className="lh-st__flight">
            <ol className="lh-st__steps">
              {STAGES.map((key, i) => (
                <li className="lh-st__step" key={key} style={{ "--i": i } as CSSProperties}>
                  <i className="lh-st__riser" aria-hidden="true" />
                  <i className="lh-st__tread" aria-hidden="true" />
                  <div className="lh-st__body">
                    <span className="lh-st__code">{t(`enums.stages.${key}.code`)}</span>
                    <h3 className="lh-st__name">{t(`enums.stages.${key}.name`)}</h3>
                  </div>
                  <p className="lh-st__desc">{t(`enums.stages.${key}.desc`)}</p>
                </li>
              ))}
            </ol>
            {/* Moves as a whole in percent of the flight, so it survives any resize. */}
            <span className="lh-st__climb" aria-hidden="true">
              <i className="lh-st__dot" />
            </span>
          </div>

          <div className="lh-st__cta">
            <Link href="/services" className="lh-btn lh-st__btn" data-lh-cursor="link">
              {t("cta.viewPackages")}
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 13 13 3M5.5 3H13v7.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
