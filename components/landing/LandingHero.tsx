import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, getPathname } from "@/i18n/navigation";
import LandingHeroAsk from "./LandingHeroAsk";
import { IMG } from "./images";
import "./css/hero.css";

type Card = { title: string; text: string; price: string; unit: string };
type Step = { t: string; d: string };
type Offer = { t: string; d: string; p?: string };

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function Bubble() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3.5 20.5l1.6-4.8A8.4 8.4 0 1 1 21 11.5z" />
      <path d="M9.4 9.6a2.6 2.6 0 0 1 5 .9c0 1.7-2.4 2.1-2.4 3.4M12 16.6h.01" />
    </svg>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5c.5 4.6 2.4 7 7.5 9.5-5.1 2.5-7 4.9-7.5 9.5-.5-4.6-2.4-7-7.5-9.5 5.1-2.5 7-4.9 7.5-9.5z" />
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3z" />
      <path d="m8.8 12.2 2.3 2.3 4.2-4.6" />
    </svg>
  );
}

export default function LandingHero() {
  const t = useTranslations("landing.hero");
  const ts = useTranslations("landing.services");
  const page = useTranslations("servicesPage");
  const locale = useLocale();

  const checks = t.raw("checks") as string[];
  const items = t.raw("sample.items") as string[];
  const steps = t.raw("steps") as Step[];
  const offers = t.raw("offers") as Offer[];
  const consultation = page.raw("consultation.cards") as Card[];
  const docPrep = page.raw("docPrep.cards") as Card[];
  const prices = [null, consultation[0]?.price, consultation[1]?.price, docPrep[0]?.price];
  const hrefs = ["/chat", "/services", "/services", "/services"] as const;

  return (
    <section className="hero lh-hero" id="top">
      <div className="lh-hero__in">
        <div className="lh-hero__main">
          <p className="lh-hero__kicker">
            <i aria-hidden="true" />
            {t("kicker")}
          </p>
          <h1 className="lh-hero__title">
            {t("titleA")} <em className="lh-accent">{t("titleB")}</em>
          </h1>
          <p className="lh-hero__lead" id="lh-ask-note">
            {t("lead")}
          </p>
          <LandingHeroAsk
            action={getPathname({ href: "/chat", locale })}
            label={t("askLabel")}
            placeholder={t("askPlaceholder")}
            send={t("askSend")}
            icon={<Bubble />}
            arrow={<Arrow />}
          />
          <ul className="hero__tags lh-hero__checks">
            {checks.map((check) => (
              <li key={check}>
                <Check />
                {check}
              </li>
            ))}
          </ul>
        </div>

        <div className="lh-hero__visual">
          <div className="lh-hero__stage">
            <Image
              className="lh-hero__photo"
              src={IMG.heroPhoto.src}
              alt=""
              fill
              sizes="(max-width: 960px) 100vw, 46vw"
              quality={85}
              fetchPriority="high"
              loading="eager"
            />
            <i className="lh-hero__shade" aria-hidden="true" />
          </div>

          <div className="lh-hero__sample" aria-label={t("sample.label")}>
            <span className="lh-hero__sample-label">{t("sample.label")}</span>
            <p className="lh-hero__q">{t("sample.q")}</p>
            <div className="lh-hero__a">
              <b>
                <Spark />
                {t("sample.title")}
              </b>
              <ul>
                {items.map((item) => (
                  <li key={item}>
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Link href="/lawyers" className="lh-hero__lawyers">
            <span className="lh-hero__lawyers-ic">
              <Shield />
            </span>
            <span className="lh-hero__lawyers-copy">
              <strong>{t("lawyersCardTitle")}</strong>
              <small>{t("lawyersCardText")}</small>
            </span>
            <Arrow />
          </Link>
        </div>
      </div>

      <div className="lh-hero__more">
        <ol className="lh-hero__steps" aria-label={t("stepsLabel")}>
          {steps.map((step, i) => (
            <li key={step.t}>
              <span className="lh-hero__no" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <strong>{step.t}</strong>
                <small>{step.d}</small>
              </span>
            </li>
          ))}
        </ol>

        <ul className="lh-hero__offers" aria-label={t("offersLabel")}>
          {offers.map((offer, i) => (
            <li key={offer.t}>
              <Link href={hrefs[i] ?? "/services"} className="lh-hero__offer">
                <strong>{offer.t}</strong>
                <small>{offer.d}</small>
                <span className="lh-hero__price">
                  <span>
                    {offer.p ??
                      (prices[i]
                        ? ts.rich("price", {
                            price: prices[i] as string,
                            b: (chunks) => <b>{chunks}</b>,
                            u: (chunks) => <span>{chunks}</span>,
                          })
                        : null)}
                  </span>
                  <Arrow />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
