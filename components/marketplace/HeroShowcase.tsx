"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconAward, IconBriefcase, IconMapPin, IconShieldCheck, IconStarRate } from "@/components/icons";
import type { MarketSeller } from "@/lib/services/marketplace";
import { regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { hasRating, sellerTypeLabel, specLabel } from "./bits";

const ROTATE_MS = 5200;
const PHOTOS: Record<string, string> = { advokat: "/img/demo-advokat-card.webp", yurist: "/img/demo-yurist-card.webp" };

function best(items: MarketSeller[], type: string) {
  return items
    .filter((s) => s.sellerType === type)
    .sort((a, b) => Number(hasRating(b)) - Number(hasRating(a)) || b.rating - a.rating || b.reviewsCount - a.reviewsCount || b.experienceYears - a.experienceYears)[0];
}

export default function HeroShowcase({ items, base, locale }: { items: MarketSeller[]; base: string; locale: string }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const cards = useMemo(() => ["advokat", "yurist"].map((type) => best(items, type)).filter((s): s is MarketSeller => Boolean(s)), [items]);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (cards.length < 2 || paused) return;
    const id = window.setInterval(() => setAt((i) => (i + 1) % cards.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [cards.length, paused]);

  if (!cards.length) return null;
  const active = at % cards.length;

  return (
    <div className="mk-show" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {cards.map((s, i) => {
        const rated = hasRating(s);
        const spec = s.specializations[0] ? specLabel(te, s.specializations[0]) : s.serviceTitles[0] ?? "";
        const wins = s.winsCount || s.completedOrders || s.totalCases;
        const href = `${base}/${encodeURIComponent(s.userId)}`;
        return (
          <article key={s.userId} className={`mk-show__card${i === active ? " is-on" : ""}`} aria-hidden={i !== active}>
            <div className="mk-show__photo">
              <Image src={PHOTOS[s.sellerType] ?? PHOTOS.advokat} alt="" fill sizes="340px" priority={i === 0} />
              {s.verified ? (
                <span className="mk-show__seal">
                  <IconShieldCheck />
                  {t(s.sellerType === "advokat" ? "show.verifiedAdvokat" : "show.verifiedYurist")}
                </span>
              ) : null}
              {rated ? (
                <span className="mk-show__rate">
                  <span className="mk-show__stars">
                    {[0, 1, 2, 3, 4].map((k) => (
                      <IconStarRate key={k} className={k < Math.round(s.rating) ? "on" : undefined} />
                    ))}
                  </span>
                  <b>{fmtRating(s.rating, locale)}</b>
                  <i />
                  <span>{t("show.reviews", { n: s.reviewsCount })}</span>
                </span>
              ) : null}
            </div>
            <div className="mk-show__body">
              <span className="mk-show__role">{sellerTypeLabel(t, s.sellerType)}</span>
              <b className="mk-show__name">{s.name}</b>
              {spec ? <span className="mk-show__spec">{spec}</span> : null}
              <div className="mk-show__facts">
                {s.experienceYears > 0 ? (
                  <span>
                    <IconBriefcase />
                    <b>{t("show.years", { n: s.experienceYears })}</b>
                    <small>{t("show.experience")}</small>
                  </span>
                ) : null}
                {s.region ? (
                  <span>
                    <IconMapPin />
                    <b>{regionLabel(te, s.region)}</b>
                    <small>{t("show.region")}</small>
                  </span>
                ) : null}
                {wins > 0 ? (
                  <span>
                    <IconAward />
                    <b>{wins}+</b>
                    <small>{t("show.cases")}</small>
                  </span>
                ) : null}
              </div>
              <div className="mk-show__cta">
                <Link href={href} className="mk-show__go" tabIndex={i === active ? 0 : -1}>
                  {t("show.cta")}
                  <IconArrowRight />
                </Link>
                {s.priceFrom > 0 ? <span className="mk-show__price">{t("card.priceFrom", { price: fmtUzs(s.priceFrom) })}</span> : null}
              </div>
            </div>
          </article>
        );
      })}
      {cards.length > 1 ? (
        <div className="mk-show__dots" role="tablist" aria-label={t("show.switch")}>
          {cards.map((s, i) => (
            <button key={s.userId} type="button" role="tab" aria-selected={i === active} aria-label={sellerTypeLabel(t, s.sellerType)} className={i === active ? "is-on" : undefined} onClick={() => setAt(i)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
