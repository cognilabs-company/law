import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IMG } from "./images";
import "./css/warranty.css";

type Card = { title: string; text: string };

export default function LandingWarranty() {
  const t = useTranslations();
  const kicker = t("landing.warranty.kicker");
  const title = t("landing.warranty.title");
  const cards = t.raw("warranty.cards") as Card[];

  // The last word takes the serif accent, a nod to the "Go" in the wordmark.
  const words = title.split(" ");
  const lastWord = words.pop();

  return (
    <section className="lh-war lh-dark" id="kafolat">
      <div className="lh-wrap lh-war__wrap">
        <div className="lh-war__head">
          <span className="lh-kicker lh-war__kicker">{kicker}</span>
          <h2 className="lh-war__title" data-lh-lines>
            {words.join(" ")} <em className="lh-accent">{lastWord}</em>
          </h2>
          <p className="lh-lead lh-war__lead" data-lh-rise>
            {t("marketplace.orderDetail.warranty.lead")}
          </p>
        </div>
      </div>

      {/* The track gives the orbit its scroll distance; motion/hold.ts sets its height. */}
      <div className="lh-war__track">
      <div className="lh-war__pin">
        <div className="lh-war__orbit">
          <div className="lh-war__glow" aria-hidden="true" />
          <div className="lh-war__rings" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="lh-war__ghost" aria-hidden="true" style={{ ["--chars" as string]: kicker.length }}>
            <span className="lh-war__ghost-in">{kicker}</span>
          </div>

          <div className="lh-war__core" aria-hidden="true">
            <div className="lh-war__depth">
              <div className="lh-war__tilt">
                <div className="lh-war__float">
                  <Image
                    className="lh-war__shield"
                    src={IMG.warrantyShield.src}
                    width={IMG.warrantyShield.width}
                    height={IMG.warrantyShield.height}
                    sizes="(max-aspect-ratio: 1/1) 70vw, 56vh"
                    quality={90}
                    alt=""
                  />
                  <i className="lh-war__sheen" />
                </div>
              </div>
            </div>
          </div>

          <ul className="lh-war__panels">
            {cards.map((card, i) => (
              <li className="lh-war__panel lh-glass" key={card.title}>
                <i className="lh-war__tick" aria-hidden="true" />
                <span className="lh-war__no" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="lh-h3 lh-war__ptitle">{card.title}</h3>
                <p className="lh-war__ptext">{card.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      </div>

      <div className="lh-wrap lh-war__wrap">
        <div className="lh-war__foot" data-lh-rise>
          <p className="lh-war__note">{t("landing.warranty.note")}</p>
          <div className="lh-war__links">
            <Link className="lh-btn lh-btn--white" href="/warranty">
              {t("cta.learnMore")}
            </Link>
            <Link className="lh-btn lh-btn--glass" href="/legal/payment-refund-warranty">
              {t("landing.warranty.policy")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
