"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconBriefcase, IconSparkle, IconStarRate, IconTrendingUp } from "@/components/icons";
import VerifiedBadge from "@/components/VerifiedBadge";
import type { MarketAiMatch, MarketSeller } from "@/lib/services/marketplace";
import { regionLabel } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { Monogram, hasRating, hasSuccess, sellerTypeLabel } from "./bits";
import { aiId } from "@/lib/ai/ids";
import { promoClick, usePromoImpression } from "@/lib/services/promoEvents";

export default function SellerCard({ s, href, index, locale, match }: { s: MarketSeller; href: string; index: number; locale: string; match?: MarketAiMatch }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const rated = hasRating(s);
  const topTitles = new Set(s.services.filter((x) => x.isSponsored).map((x) => x.title));
  const baseTitles = s.serviceTitles.length ? s.serviceTitles : s.services.map((x) => x.title);
  const titles = [...baseTitles.filter((x) => topTitles.has(x)), ...baseTitles.filter((x) => !topTitles.has(x))];
  const shown = titles.slice(0, 1);
  const promoted = s.promotion?.active === true || s.isSponsored || topTitles.size > 0;
  const promoId = promoted ? s.promotion?.id ?? "" : "";
  const promoSeen = usePromoImpression(promoId, "marketplace_list", index + 1);
  const onPromoGo = () => {
    if (promoId) promoClick(promoId, s.userId, "marketplace_list", index + 1);
  };
  const cardAiId = aiId("marketplace.seller", s.userId);
  const cardAiLabel = [sellerTypeLabel(t, s.sellerType), s.region ? regionLabel(te, s.region) : ""].filter(Boolean).join(" · ");
  return (
    <article
      ref={promoSeen}
      className={`mk-card${promoted ? " mk-card--promo" : ""}`}
      style={{ ["--mk-i" as string]: String(Math.min(index, 11)) }}
      data-ai-target={`marketplace:lawyer-card:${s.userId}`}
      data-ai-id={cardAiId}
      data-ai-type="card"
      data-ai-label={cardAiLabel}
      data-ai-entity-type="seller"
      data-ai-entity-id={s.userId}
    >
      {promoted ? (
        <span className="mk-card__ad" title={s.promotion?.serviceTitle ? t("card.promotedService", { service: s.promotion.serviceTitle }) : undefined}>
          {t("card.promoted")}
        </span>
      ) : null}
      <div className="mk-card__head">
        <Monogram name={s.name} rating={s.rating} showRing={rated} />
        <div className="mk-card__who">
          <span className="mk-card__title">
            <Link href={href} className="mk-card__name" onClick={onPromoGo}>
              {s.name}
            </Link>
            {s.verified ? <VerifiedBadge label={false} name={s.name} subtitle={sellerTypeLabel(t, s.sellerType)} text={s.badgeLabel} /> : null}
          </span>
          <span className="mk-card__sub">
            <span className={`mk-card__role mk-card__role--${s.sellerType || "yurist"}`}>{sellerTypeLabel(t, s.sellerType)}</span>
            {s.region ? (
              <>
                <i aria-hidden="true">·</i>
                {[regionLabel(te, s.region), s.district && s.district.toLowerCase() !== "demo" ? s.district : ""].filter(Boolean).join(", ")}
              </>
            ) : null}
          </span>
        </div>
      </div>

      {match ? (
        <div className="mk-card__ai">
          <span className="mk-card__aiscore">
            <IconSparkle />
            {match.score > 0 ? t("aiMatch", { pct: Math.round(match.score * 100) }) : t("aiPick")}
          </span>
          {match.score > 0 ? (
            <span className="mk-card__aibar" aria-hidden="true">
              <i style={{ width: `${Math.round(match.score * 100)}%` }} />
            </span>
          ) : null}
          {match.reasons.length ? (
            <>
              <b className="mk-card__aih">{t("aiReasons")}</b>
              <ul className="mk-card__aiwhy">
                {match.reasons.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="mk-card__stats">
        <div className="mk-stat">
          {rated ? (
            <b>
              <IconStarRate />
              {fmtRating(s.rating, locale)}
            </b>
          ) : (
            <b className="mk-stat__new">{t("card.newSeller")}</b>
          )}
          <span>{rated ? t("card.reviews", { count: s.reviewsCount }) : t("card.newHint")}</span>
        </div>
        <div className="mk-stat">
          <b>
            <IconBriefcase />
            {s.experienceYears || "—"}
          </b>
          <span>{t("card.experience")}</span>
        </div>
        <div className="mk-stat">
          <b>
            <IconTrendingUp />
            {hasSuccess(s) ? `${Math.round(s.successRate)}%` : "—"}
          </b>
          <span>{hasSuccess(s) ? t("card.success") : `${t("card.success")} · ${t("card.gathering")}`}</span>
        </div>
      </div>

      {shown.length ? (
        <ul className="mk-card__svc">
          {shown.map((x) => (
            <li key={x} className={topTitles.has(x) ? "mk-card__svc--top" : undefined}>{topTitles.has(x) ? <em className="mk-svc__top">{t("card.promoted")}</em> : null}{x}</li>
          ))}
          {titles.length > shown.length ? <li className="mk-card__svcmore">{t("card.servicesMore", { n: titles.length - shown.length })}</li> : null}
        </ul>
      ) : null}

      <div className="mk-card__foot">
        <div className="mk-card__price">
          {s.priceFrom > 0 ? <b>{t("card.priceFrom", { price: fmtUzs(s.priceFrom) })}</b> : <b className="mk-card__ask">{t("card.priceAsk")}</b>}
          {!s.available ? <span className="mk-card__busy">{t("card.busy")}</span> : null}
        </div>
        <Link href={href} onClick={onPromoGo} className="mk-card__go" aria-label={`${t("card.details")}: ${s.name}`} data-ai-id={`${cardAiId}.detail`} data-ai-label={t("card.details")} data-ai-entity-type="seller" data-ai-entity-id={s.userId}>
          {t("card.details")}
          <IconArrowRight />
        </Link>
      </div>
    </article>
  );
}
