"use client";

import { Fragment, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconAward, IconBriefcase, IconStarRate, IconTrendingUp } from "@/components/icons";
import VerifiedBadge from "@/components/VerifiedBadge";
import type { MarketSeller } from "@/lib/services/marketplace";
import { regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { hasRating, hasSuccess, sellerTypeLabel, specLabel } from "./bits";

const PHOTOS: Record<string, string> = { advokat: "/img/demo-advokat-card.webp", yurist: "/img/demo-yurist-card.webp" };
const STARS = [0, 1, 2, 3, 4];

function best(items: MarketSeller[], type: string) {
  return items
    .filter((s) => s.sellerType === type)
    .sort((a, b) => Number(hasRating(b)) - Number(hasRating(a)) || b.rating - a.rating || b.reviewsCount - a.reviewsCount || b.experienceYears - a.experienceYears)[0];
}

function Stars({ rating }: { rating: number }) {
  const row = STARS.map((k) => <IconStarRate key={k} />);
  return (
    <span className="mk-show__stars" aria-hidden="true">
      {row}
      <span style={{ width: `${(Math.min(5, Math.max(0, rating)) / 5) * 100}%` }}>{row}</span>
    </span>
  );
}

export default function HeroShowcase({ items, base, locale }: { items: MarketSeller[]; base: string; locale: string }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const cards = useMemo(() => {
    const used = new Set<string>();
    return ["advokat", "yurist"]
      .map((type) => best(items, type))
      .filter((s): s is MarketSeller => Boolean(s))
      .map((s) => {
        const code = s.specializations.find((c) => !used.has(c)) ?? s.specializations[0];
        if (code) used.add(code);
        return { s, spec: code ? specLabel(te, code) : s.serviceTitles[0] ?? "" };
      });
  }, [items, te]);
  const [at, setAt] = useState(0);

  if (!cards.length) return null;
  const active = at % cards.length;

  return (
    <div className="mk-show" role="group" aria-roledescription={t("show.carousel")} aria-label={t("show.label")} data-ai-target="marketplace:featured">
      {cards.map(({ s, spec }, i) => {
        const on = i === active;
        const type = sellerTypeLabel(t, s.sellerType);
        const href = `${base}/${encodeURIComponent(s.userId)}`;
        const won = s.winsCount > 0;
        const facts = [
          { k: "exp", Icon: IconBriefcase, v: s.experienceYears > 0 ? t("show.years", { n: s.experienceYears }) : "—", l: t("show.expLabel") },
          { k: "won", Icon: IconAward, v: won ? s.winsCount : s.completedOrders || s.totalCases || "—", l: won ? t("show.wonLabel") : t("show.cases") },
          { k: "success", Icon: IconTrendingUp, v: hasSuccess(s) ? `${Math.round(s.successRate)}%` : "—", l: t("card.success") },
        ];
        return (
          <article key={s.userId} className={`mk-show__card${on ? " is-on" : ""}`} inert={!on}>
            <div className="mk-show__photo">
              <Image src={PHOTOS[s.sellerType] ?? PHOTOS.advokat} alt="" fill sizes="344px" />
              {s.verified ? <VerifiedBadge className="mk-show__vb" tone="glass" size="md" name={s.name} subtitle={type} /> : null}
            </div>
            <div className="mk-show__rate">
              {hasRating(s) ? (
                <>
                  <Stars rating={s.rating} />
                  <b>{fmtRating(s.rating, locale)}</b>
                  <i />
                  <span>{t("show.reviews", { n: s.reviewsCount })}</span>
                </>
              ) : (
                <span>{t("card.newSeller")}</span>
              )}
            </div>
            <div className="mk-show__body">
              <span className="mk-show__eyebrow">
                {type}
                {s.region ? (
                  <>
                    <i>·</i>
                    {regionLabel(te, s.region)}
                  </>
                ) : null}
              </span>
              <b className="mk-show__name" title={s.name}>
                {s.name}
              </b>
              {spec ? <span className="mk-show__spec">{t("show.specialist", { spec })}</span> : null}
              <ul className="mk-show__facts">
                {facts.map(({ k, Icon, v, l }, j) => (
                  <Fragment key={k}>
                    {j ? <li className="mk-show__sep" aria-hidden="true" /> : null}
                    <li>
                      <i aria-hidden="true">
                        <Icon />
                      </i>
                      <span>
                        <b>{v}</b>
                        <small>{l}</small>
                      </span>
                    </li>
                  </Fragment>
                ))}
              </ul>
              <div className="mk-show__foot">
                <span className="mk-show__price">
                  <small>{t("show.priceLabel")}</small>
                  <b>{s.priceFrom > 0 ? t("card.priceFrom", { price: fmtUzs(s.priceFrom) }) : t("card.priceAsk")}</b>
                </span>
                <Link href={href} className="mk-show__go" aria-label={`${t("show.cta")}: ${s.name}`}>
                  {t("show.cta")}
                  <IconArrowRight />
                </Link>
              </div>
            </div>
          </article>
        );
      })}
      {cards.length > 1 ? (
        <div className="mk-show__dots" role="group" aria-label={t("show.switch")}>
          {cards.map(({ s }, i) => (
            <button key={s.userId} type="button" className={i === active ? "is-on" : undefined} aria-label={sellerTypeLabel(t, s.sellerType)} aria-current={i === active} onClick={() => setAt(i)}>
              {i === active ? <b key={at} onAnimationEnd={() => setAt((active + 1) % cards.length)} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
