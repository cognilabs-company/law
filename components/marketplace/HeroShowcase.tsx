"use client";

import { Fragment, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconAward, IconBriefcase, IconStarRate, IconTrendingUp } from "@/components/icons";
import VerifiedBadge from "@/components/VerifiedBadge";
import type { MarketPromotionSurface, MarketSeller } from "@/lib/services/marketplace";
import type { RatingStatus } from "@/lib/services/trust";
import { regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { hasRating, hasSuccess, sellerTypeLabel, specLabel } from "./bits";
import { aiId } from "@/lib/ai/ids";
import { targetOf } from "./PromotionSurfaces";
import { promoClick, usePromoImpression } from "@/lib/services/promoEvents";

const PHOTOS: Record<string, string> = { advokat: "/img/demo-advokat-card.webp", yurist: "/img/demo-yurist-card.webp" };
const STARS = [0, 1, 2, 3, 4];
const PROMO_SOURCE = "marketplace_hero_showcase";

function best(items: MarketSeller[], type: string) {
  return items
    .filter((s) => s.sellerType === type)
    .sort((a, b) => Number(hasRating(b)) - Number(hasRating(a)) || b.rating - a.rating || b.reviewsCount - a.reviewsCount || b.experienceYears - a.experienceYears)[0];
}

function sellerFromPromo(p: MarketPromotionSurface): MarketSeller {
  const sp = p.seller;
  const reviews = sp?.reviews ?? 0;
  const rated = reviews > 0;
  return {
    id: p.sellerUserId,
    userId: p.sellerUserId,
    publicId: "",
    name: p.title || p.sellerName,
    sellerType: sp?.type || "advokat",
    verified: sp?.verified ?? false,
    badgeLabel: "",
    rated,
    ratingStatus: (rated ? "rated" : "") as RatingStatus,
    ratingLabel: "",
    verificationStatus: "",
    region: sp?.region || "",
    district: "",
    specializations: sp?.specialization ? [sp.specialization] : [],
    languages: [],
    bio: sp?.headline || p.subtitle || "",
    education: "",
    experienceYears: sp?.experience ?? 0,
    totalCases: 0,
    winsCount: 0,
    partialWins: 0,
    successRate: 0,
    rating: sp?.rating ?? 0,
    reviewsCount: reviews,
    servicesCount: 0,
    serviceTitles: p.serviceTitle ? [p.serviceTitle] : [],
    categories: [],
    priceFrom: 0,
    priceTo: 0,
    completedOrders: 0,
    responseRate: 0,
    trustScore: 0,
    promotion: null,
    onlineNow: false,
    available: true,
    services: [],
    licenseNumber: "",
    barAssociation: "",
    organizationName: "",
    createdAt: "",
    isSponsored: true,
  };
}

type ShowCard = { key: string; s: MarketSeller; spec: string; promo: MarketPromotionSurface | null };

function Stars({ rating }: { rating: number }) {
  const row = STARS.map((k) => <IconStarRate key={k} />);
  return (
    <span className="mk-show__stars" aria-hidden="true">
      {row}
      <span style={{ width: `${(Math.min(5, Math.max(0, rating)) / 5) * 100}%` }}>{row}</span>
    </span>
  );
}

function ShowcaseCard({ card, index, depth, base, locale }: { card: ShowCard; index: number; depth: number; base: string; locale: string }) {
  const on = depth === 0;
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const { s, spec, promo } = card;
  const seen = usePromoImpression(promo?.id ?? "", PROMO_SOURCE, index + 1);
  const type = sellerTypeLabel(t, s.sellerType);
  const sellerHref = `${base}/${encodeURIComponent(s.userId)}`;
  const cta = promo ? targetOf(promo.ctaUrl, base, sellerHref) : { href: sellerHref, external: false };
  const featuredAiId = aiId("marketplace.featured", s.userId);
  const won = s.winsCount > 0;
  const label = promo?.ctaLabel || t("show.cta");
  const onGo = () => {
    if (promo) promoClick(promo.id, promo.sellerUserId, PROMO_SOURCE, index + 1);
  };
  const facts = [
    { k: "exp", Icon: IconBriefcase, v: s.experienceYears > 0 ? t("show.years", { n: s.experienceYears }) : "—", l: t("show.expLabel") },
    { k: "won", Icon: IconAward, v: won ? s.winsCount : s.completedOrders || s.totalCases || "—", l: won ? t("show.wonLabel") : t("show.cases") },
    { k: "success", Icon: IconTrendingUp, v: hasSuccess(s) ? `${Math.round(s.successRate)}%` : "—", l: t("card.success") },
  ];
  return (
    <article
      ref={seen}
      className={`mk-show__card${on ? " is-on" : ""}`}
      data-depth={depth}
      inert={!on}
      data-ai-id={featuredAiId}
      data-ai-type="card"
      data-ai-label={[type, s.region ? regionLabel(te, s.region) : ""].filter(Boolean).join(" · ")}
      data-ai-entity-type="seller"
      data-ai-entity-id={s.userId}
    >
      <div className="mk-show__photo">
        <Image src={PHOTOS[s.sellerType] ?? PHOTOS.advokat} alt="" fill sizes="344px" />
        {promo ? <span className="mk-show__ad">{t("card.promoted")}</span> : null}
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
          {cta.external ? (
            <a href={cta.href} className="mk-show__go" target="_blank" rel="noopener noreferrer" aria-label={`${label}: ${s.name}`} onClick={onGo} data-ai-id={`${featuredAiId}.detail`} data-ai-label={label}>
              {label}
              <IconArrowRight />
            </a>
          ) : (
            <Link href={cta.href} className="mk-show__go" aria-label={`${label}: ${s.name}`} onClick={onGo} data-ai-id={`${featuredAiId}.detail`} data-ai-label={label}>
              {label}
              <IconArrowRight />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export default function HeroShowcase({
  items,
  promos = [],
  base,
  locale,
}: {
  items: MarketSeller[];
  promos?: MarketPromotionSurface[];
  base: string;
  locale: string;
}) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const cards = useMemo<ShowCard[]>(() => {
    const used = new Set<string>();
    const specOf = (s: MarketSeller) => {
      const code = s.specializations.find((c) => !used.has(c)) ?? s.specializations[0];
      if (code) used.add(code);
      return code ? specLabel(te, code) : s.serviceTitles[0] ?? "";
    };
    const paid = new Set<string>();
    const ads: ShowCard[] = [];
    for (const p of promos) {
      if (!p.sellerUserId || paid.has(p.sellerUserId)) continue;
      paid.add(p.sellerUserId);
      const s = items.find((x) => x.userId === p.sellerUserId) ?? sellerFromPromo(p);
      ads.push({ key: `promo:${p.id || p.sellerUserId}`, s, spec: specOf(s), promo: p });
    }
    const demos = ["advokat", "yurist"]
      .map((type) => best(items, type))
      .filter((s): s is MarketSeller => Boolean(s) && !paid.has(s.userId))
      .map((s) => ({ key: `seller:${s.userId}`, s, spec: specOf(s), promo: null }));
    return [...ads, ...demos];
  }, [items, promos, te]);
  const [at, setAt] = useState(0);

  if (!cards.length) return null;
  const active = at % cards.length;

  return (
    <div className="mk-show" role="group" aria-roledescription={t("show.carousel")} aria-label={t("show.label")} data-ai-target="marketplace:featured" data-ai-id="marketplace.featured" data-ai-type="section">
      {cards.map((card, i) => (
        <ShowcaseCard key={card.key} card={card} index={i} depth={(active - i + cards.length) % cards.length} base={base} locale={locale} />
      ))}
      {cards.length > 1 ? (
        <div className="mk-show__dots" role="group" aria-label={t("show.switch")}>
          {cards.map((card, i) => (
            <button key={card.key} type="button" className={i === active ? "is-on" : undefined} aria-label={card.promo ? t("card.promoted") : sellerTypeLabel(t, card.s.sellerType)} aria-current={i === active} onClick={() => setAt(i)}>
              {i === active ? <b key={at} onAnimationEnd={() => setAt((active + 1) % cards.length)} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
