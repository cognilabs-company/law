"use client";

import { useLocale, useTranslations } from "next-intl";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { regionLabel } from "@/lib/labels";
import type { MarketSeller, MarketService } from "@/lib/services/marketplace";
import VerifiedBadge from "@/components/VerifiedBadge";
import { IconCheck, IconClock, IconGlobe, IconMapPin, IconStar } from "@/components/icons";
import { Monogram, categoryLabel, deliveryLabel, hasRating, hasSuccess, langLabel, sellerTypeLabel } from "./bits";
import { aiId } from "@/lib/ai/ids";
import { useRuntimeFacts } from "./runtime/useRuntimeFacts";
import { durationParts, guaranteesOf } from "./runtime/facts";
import { DurationChip } from "./runtime/DurationChip";
import { GuaranteeBadges } from "./runtime/Guarantees";
import type { BoughtOrder } from "@/lib/useBoughtServices";
import { Link } from "@/i18n/navigation";

export function SellerHero({ seller, top }: { seller: MarketSeller; top: boolean }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const locale = useLocale();
  const rated = hasRating(seller);
  const success = hasSuccess(seller);
  const place = [regionLabel(te, seller.region), seller.district && seller.district.toLowerCase() !== "demo" ? seller.district : ""].filter(Boolean).join(", ");
  const langs = Array.from(new Set(seller.languages.map((l) => langLabel(t, l))));
  const tiles: { k: string; v: string; sub?: string }[] = [
    { k: t("detail.stats.rating"), v: rated ? fmtRating(seller.rating, locale) : t("detail.newRating") },
    { k: t("detail.stats.reviews"), v: String(seller.reviewsCount) },
    { k: seller.sellerType === "advokat" ? t("detail.stats.advocacy") : t("detail.stats.experience"), v: seller.experienceYears ? String(seller.experienceYears) : "—" },
    ...(seller.sellerType === "advokat" && seller.priorYears ? [{ k: t("detail.stats.prior"), v: String(seller.priorYears) }] : []),
    { k: t("detail.stats.cases"), v: seller.totalCases ? String(seller.totalCases) : "—" },
    { k: t("detail.stats.success"), v: success ? `${Math.round(seller.successRate)}%` : "—", sub: success ? undefined : t("detail.gathering") },
    { k: t("detail.stats.completed"), v: String(seller.completedOrders) },
  ];
  const sellerAiId = aiId("marketplace.seller", seller.userId);
  return (
    <header
      className="mk-prof__hero"
      data-ai-target="marketplace:seller-summary"
      data-ai-id={sellerAiId}
      data-ai-type="section"
      data-ai-label={[sellerTypeLabel(t, seller.sellerType), place].filter(Boolean).join(" · ")}
      data-ai-entity-type="seller"
      data-ai-entity-id={seller.userId}
    >
      <div className="mk-hero__glow" aria-hidden="true" />
      <div className="mk-prof__id">
        <Monogram name={seller.name} rating={seller.rating} showRing={rated} size="lg" />
        <div className="mk-prof__who">
          <div className="mk-prof__tags">
            <span className={`mk-type mk-type--${seller.sellerType || "yurist"}`}>{sellerTypeLabel(t, seller.sellerType)}</span>
            {seller.verified ? <VerifiedBadge name={seller.name} subtitle={sellerTypeLabel(t, seller.sellerType)} text={seller.badgeLabel} tone="glass" size="md" /> : null}
            {seller.promotion?.active || seller.isSponsored || top ? (
              <span className="mk-card__ad mk-card__ad--inline">
                {seller.promotion?.active && seller.promotion.serviceTitle ? t("card.promotedService", { service: seller.promotion.serviceTitle }) : t("card.promoted")}
              </span>
            ) : null}
          </div>
          <h1 className="mk-prof__name">{seller.name}</h1>
          <div className="mk-prof__line">
            {place ? (
              <span>
                <IconMapPin />
                {place}
              </span>
            ) : null}
            {langs.length ? (
              <span>
                <IconGlobe />
                {langs.join(" · ")}
              </span>
            ) : null}
            {rated ? (
              <span>
                <IconStar />
                {fmtRating(seller.rating, locale)} · {t("card.reviews", { count: seller.reviewsCount })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mk-prof__tiles">
        {tiles.map((x) => (
          <div key={x.k} className="mk-tile">
            <b>{x.v}</b>
            <span>{x.k}</span>
            {x.sub ? <em>{x.sub}</em> : null}
          </div>
        ))}
      </div>
    </header>
  );
}

export function SellerServiceRow({
  svc,
  sellerUserId,
  on,
  top,
  buyDisabled,
  onPick,
  onBuy,
  ph,
  runtime = false,
  bought = null,
}: {
  svc: MarketService;
  sellerUserId: string;
  on: boolean;
  top: boolean;
  buyDisabled: boolean;
  onPick: () => void;
  onBuy: () => void;
  ph?: { title: string; category: string; price: string };
  runtime?: boolean;
  // An open order of this client for this service: no second purchase.
  bought?: BoughtOrder | null;
}) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const locale = useLocale();
  const { config: rtConfig, ref: rowRef } = useRuntimeFacts(svc.id, "marketplace", { enabled: runtime && !ph, lazy: true });
  const dur = durationParts(rtConfig?.duration) ? (rtConfig?.duration ?? null) : null;
  const eta = dur ? "" : deliveryLabel(t, svc.deliveryMinutes);
  const guarantees = guaranteesOf(rtConfig);
  const svcAiId = aiId(`${aiId("marketplace.seller", sellerUserId)}.service`, svc.id);
  return (
    <div
      ref={rowRef}
      className={`mk-svc${on ? " is-on" : ""}${top ? " mk-svc--top" : ""}`}
      data-ai-target={`marketplace:service-card:${svc.id}`}
      data-ai-id={svcAiId}
      data-ai-type="card"
      data-ai-entity-type="marketplace_service"
      data-ai-entity-id={svc.id}
    >
      <button type="button" role="radio" aria-checked={on} className="mk-svc__pick" onClick={onPick}>
        <span className="mk-svc__radio" aria-hidden="true" />
        <span className="mk-svc__txt">
          <b>
            {ph ? <span className="mk-ph">{ph.title}</span> : svc.title}
            {top ? <em className="mk-svc__top">{t("card.promoted")}</em> : null}
          </b>
          <span>
            {ph ? <span className="mk-ph">{ph.category}</span> : null}
            {svc.categoryTitle ? categoryLabel(te, svc.categoryTitle, locale) : null}
            {svc.categoryTitle && (dur || eta) ? " · " : null}
            {dur ? (
              <DurationChip duration={dur} tone="row" />
            ) : eta ? (
              <span className="mk-eta">
                <IconClock />
                {eta}
              </span>
            ) : null}
          </span>
          {svc.experienceNote ? <i>{svc.experienceNote}</i> : null}
          {guarantees.length ? <GuaranteeBadges items={guarantees} max={2} /> : null}
        </span>
      </button>
      <div className="mk-svc__end">
        <b title={!ph && svc.priceCapped ? t("card.priceCapped") : undefined}>{ph ? <span className="mk-ph">{ph.price}</span> : svc.price > 0 ? fmtUzs(svc.price) : t("card.priceAsk")}</b>
        {bought ? (
          <Link href={bought.href} className="btn btn--line btn--sm mk-bought" data-ai-id={`${svcAiId}.bought`} title={bought.workId || undefined}>
            <IconCheck aria-hidden="true" />
            {t("detail.bought")}
          </Link>
        ) : (
        <button
          type="button"
          className="btn btn--pri btn--sm"
          onClick={onBuy}
          disabled={buyDisabled}
          data-ai-target={`button:marketplace-purchase:${sellerUserId}:${svc.id}`}
          data-ai-id={`${svcAiId}.buy`}
          data-ai-entity-type="marketplace_service"
          data-ai-entity-id={svc.id}
        >
          {t("detail.buy")}
        </button>
        )}
      </div>
    </div>
  );
}
