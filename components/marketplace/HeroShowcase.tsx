"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconAward, IconBriefcase, IconCard, IconMapPin, IconStarRate, IconTrendingUp } from "@/components/icons";
import VerifiedBadge from "@/components/VerifiedBadge";
import type { MarketSeller } from "@/lib/services/marketplace";
import { regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { hasRating, hasSuccess, sellerTypeLabel, specLabel } from "./bits";

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
      {cards.map(({ s, spec }, i) => {
        const cases = s.winsCount || s.completedOrders || s.totalCases;
        const href = `${base}/${encodeURIComponent(s.userId)}`;
        const facts = [
          { k: "exp", Icon: IconBriefcase, v: s.experienceYears || "—", l: t("card.experience") },
          { k: "cases", Icon: IconAward, v: cases || "—", l: t("show.cases") },
          { k: "success", Icon: IconTrendingUp, v: hasSuccess(s) ? `${Math.round(s.successRate)}%` : "—", l: t("card.success") },
          { k: "price", Icon: IconCard, v: s.priceFrom > 0 ? fmtUzs(s.priceFrom) : "—", l: t("show.priceShort") },
        ];
        return (
          <article key={s.userId} className={`mk-show__card${i === active ? " is-on" : ""}`} aria-hidden={i !== active}>
            <div className="mk-show__photo">
              <Image src={PHOTOS[s.sellerType] ?? PHOTOS.advokat} alt="" fill sizes="300px" priority={i === 0} />
              {hasRating(s) ? (
                <span className="mk-show__rate">
                  <IconStarRate />
                  <b>{fmtRating(s.rating, locale)}</b>
                  <span>{t("show.reviews", { n: s.reviewsCount })}</span>
                </span>
              ) : null}
            </div>
            <div className="mk-show__body">
              <div className="mk-card__meta">
                <span className={`mk-type mk-type--${s.sellerType || "yurist"}`}>{sellerTypeLabel(t, s.sellerType)}</span>
                {s.verified ? <VerifiedBadge name={s.name} subtitle={sellerTypeLabel(t, s.sellerType)} /> : null}
              </div>
              <b className="mk-show__name">{s.name}</b>
              <span className="mk-show__sub">
                {s.region ? (
                  <>
                    <IconMapPin />
                    {regionLabel(te, s.region)}
                  </>
                ) : null}
                {s.region && spec ? <i>·</i> : null}
                {spec ? <span>{spec}</span> : null}
              </span>
              <div className="mk-show__facts">
                {facts.map(({ k, Icon, v, l }) => (
                  <div key={k} className={`mk-show__fact mk-show__fact--${k}`}>
                    <i>
                      <Icon />
                    </i>
                    <span>
                      <b>{v}</b>
                      <small>{l}</small>
                    </span>
                  </div>
                ))}
              </div>
              <Link href={href} className="mk-show__go" tabIndex={i === active ? 0 : -1}>
                {t("show.cta")}
                <IconArrowRight />
              </Link>
            </div>
          </article>
        );
      })}
      {cards.length > 1 ? (
        <div className="mk-show__dots" role="tablist" aria-label={t("show.switch")}>
          {cards.map(({ s }, i) => (
            <button key={s.userId} type="button" role="tab" aria-selected={i === active} aria-label={sellerTypeLabel(t, s.sellerType)} className={i === active ? "is-on" : undefined} onClick={() => setAt(i)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
