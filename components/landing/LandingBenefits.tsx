import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IMG } from "./images";
import "./css/benefits.css";

// Same order as landing.benefits.items.
const ICONS = [IMG.iconAnswer, IMG.iconVerified, IMG.iconShield, IMG.iconFolders, IMG.iconScale, IMG.iconGlobe];

/**
 * A bento of glass tiles with their 3D glass icons spilling out of the frame.
 * Three layers per tile, so the motions never fight over one transform:
 * li (scroll depth) > .lh-ben__depth (entrance) > .lh-ben__tile (pointer tilt).
 * The glass sits on its own child, because backdrop-filter flattens 3D.
 */
export default function LandingBenefits() {
  const t = useTranslations("landing.benefits");
  const cta = useTranslations("home.funnelCta");
  const title = t("title");
  const cut = title.lastIndexOf(" ");

  return (
    <section className="lh-ben lh-dark" id="afzallik">
      <span className="lh-ben__sky" aria-hidden="true">
        <i className="lh-ben__light lh-ben__light--a" />
        <i className="lh-ben__light lh-ben__light--b" />
      </span>

      <div className="lh-ben__box">
        <div className="lh-ben__bento">
          <header className="lh-ben__head">
            <p className="lh-kicker">{t("kicker")}</p>
            <h2 className="lh-ben__title" data-lh-lines="">
              {title.slice(0, cut)} <em className="lh-accent">{title.slice(cut + 1)}</em>
            </h2>
          </header>

          <ul className="lh-ben__tiles">
            {ICONS.map((icon, i) => (
              <li className="lh-ben__item" key={icon.src}>
                <div className="lh-ben__depth">
                  <div className="lh-ben__tile">
                    <span className="lh-ben__glass" aria-hidden="true" />
                    <span className="lh-ben__ico" aria-hidden="true">
                      <span className="lh-ben__float">
                        <Image
                          src={icon.src}
                          width={icon.width}
                          height={icon.height}
                          alt=""
                          sizes="(max-aspect-ratio: 1/1) 60vw, 26vw"
                        />
                      </span>
                    </span>
                    <div className="lh-ben__copy">
                      <h3 className="lh-ben__name">{t(`items.${i}.title`)}</h3>
                      <p className="lh-ben__text">{t(`items.${i}.text`)}</p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="lh-ben__cta">
            <Link href="/chat" className="lh-btn lh-btn--white" data-lh-cursor="link">
              {cta("primary")}
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 13 13 3M5.5 3H13v7.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </Link>
            <Link href="/lawyers" className="lh-btn lh-btn--glass" data-lh-cursor="link">
              {cta("secondary")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
