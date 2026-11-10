"use client";

import type { CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { regionLabel } from "@/lib/labels";
import type { MarketSeller, MarketService } from "@/lib/services/marketplace";
import VerifiedBadge from "@/components/VerifiedBadge";
import { IconBuilding, IconCheck, IconClock, IconGlobe, IconMapPin } from "@/components/icons";
import { initials } from "@/lib/lawyers";
import { categoryLabel, deliveryLabel, hasRating, hasSuccess, langLabel, sellerTypeLabel } from "./bits";
import { aiId } from "@/lib/ai/ids";
import { useRuntimeFacts } from "./runtime/useRuntimeFacts";
import { durationParts, guaranteesOf } from "./runtime/facts";
import { DurationChip } from "./runtime/DurationChip";
import { GuaranteeBadges } from "./runtime/Guarantees";
import type { BoughtOrder } from "@/lib/useBoughtServices";
import { Link } from "@/i18n/navigation";

// A tag only when it reads in the reader's language: a slug the
// dictionaries do not know would show as English ("Labor disputes").
function sellerTags(te: ReturnType<typeof useTranslations>, seller: MarketSeller, locale: string): string[] {
  const out = new Set<string>();
  for (const c of seller.categories) {
    const title = (c.title || "").trim();
    const slug = (c.slug || "").trim().toLowerCase();
    if (title && !/^[a-z0-9_-]+$/.test(title)) out.add(categoryLabel(te, title, locale));
    else if (slug && te.has(`areas.${slug}`)) out.add(te(`areas.${slug}`));
  }
  for (const s of seller.specializations) {
    const k = s.trim().toLowerCase();
    if (k && te.has(`areas.${k}`)) out.add(te(`areas.${k}`));
  }
  return [...out].slice(0, 4);
}

// The profile's head, as the dashboard's specialist card (.cx-exp / 1b): a
// white card with the photo slot (navy initials), the name, the role with the
// green "verified" mark, the areas as grey chips, where and in which
// languages, and the numbers as quiet chip tiles.
export function SellerHero({ seller, top }: { seller: MarketSeller; top: boolean }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const tx = useTranslations("lxProf");
  const locale = useLocale();
  const rated = hasRating(seller);
  const success = hasSuccess(seller);
  const place = [regionLabel(te, seller.region), seller.district && seller.district.toLowerCase() !== "demo" ? seller.district : ""].filter(Boolean).join(", ");
  const langs = Array.from(new Set(seller.languages.map((l) => langLabel(t, l))));
  const tags = sellerTags(te, seller, locale);
  const org = seller.barAssociation || seller.organizationName;
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
      className="mk-prof__hero lxp-hero"
      data-ai-target="marketplace:seller-summary"
      data-ai-id={sellerAiId}
      data-ai-type="section"
      data-ai-label={[sellerTypeLabel(t, seller.sellerType), place].filter(Boolean).join(" · ")}
      data-ai-entity-type="seller"
      data-ai-entity-id={seller.userId}
    >
      <div className="lxp-hero__ph" aria-hidden="true">
        <span className="lxp-hero__av">{initials(seller.name) || "LG"}</span>
      </div>
      <div className="lxp-hero__main">
        <h1 className="mk-prof__name lxp-hero__name">{seller.name}</h1>
        <div className="lxp-hero__role">
          <span>{sellerTypeLabel(t, seller.sellerType)}</span>
          {seller.verified ? <VerifiedBadge name={seller.name} subtitle={sellerTypeLabel(t, seller.sellerType)} text={seller.badgeLabel} tone="light" size="sm" /> : null}
          {seller.onlineNow ? (
            <span className="cx-pill cx-pill--ok lxp-hero__on">
              <i aria-hidden="true" />
              {tx("onlineNow")}
            </span>
          ) : null}
          {seller.promotion?.active || seller.isSponsored || top ? (
            <span className="mk-card__ad mk-card__ad--inline lxp-hero__ad">
              {seller.promotion?.active && seller.promotion.serviceTitle ? t("card.promotedService", { service: seller.promotion.serviceTitle }) : t("card.promoted")}
            </span>
          ) : null}
        </div>
        {tags.length ? (
          <div className="cx-tags lxp-hero__tags">
            {tags.map((x) => (
              <span key={x} className="cx-tag">
                {x}
              </span>
            ))}
          </div>
        ) : null}
        {seller.bio ? <p className="lxp-hero__bio">{seller.bio}</p> : null}
        {place || langs.length || org ? (
          <div className="lxp-hero__geo">
            {place ? (
              <span>
                <IconMapPin aria-hidden="true" />
                {place}
              </span>
            ) : null}
            {langs.length ? (
              <span>
                <IconGlobe aria-hidden="true" />
                {langs.join(" · ")}
              </span>
            ) : null}
            {org ? (
              <span>
                <IconBuilding aria-hidden="true" />
                {org}
              </span>
            ) : null}
          </div>
        ) : null}
        <dl className="lxp-hero__facts" style={{ "--n": tiles.length } as CSSProperties}>
          {tiles.map((x) => (
            <div key={x.k}>
              <dt>{x.k}</dt>
              <dd>{x.v}</dd>
              {x.sub ? <dd className="lxp-hero__sub">{x.sub}</dd> : null}
            </div>
          ))}
        </dl>
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
  canBuy = true,
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
  // false: this account may not buy here at all (own profile, a seller or
  // staff account, an unverified or busy seller) — no Buy button is shown.
  canBuy?: boolean;
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
        ) : !canBuy ? null : (
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
