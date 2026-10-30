"use client";

import { useLocale, useTranslations } from "next-intl";
import { Navigation } from "lucide-react";
import { Link } from "@/i18n/navigation";
import VerifiedBadge from "@/components/VerifiedBadge";
import { IconBriefcase, IconBuilding, IconMapPin, IconStarRate } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";
import { regionLabel } from "@/lib/labels";
import { humanizeSlug } from "@/lib/lawyers";
import { fmtRating } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import type { MarketSeller } from "@/lib/services/marketplace";
import { approxDistance } from "@/lib/services/marketDiscovery";
import type { NearbySeller } from "@/lib/services/marketRuntime";
import type { LocationSource, SellerNav, ServiceAction } from "@/lib/services/sellersMap";
import { Monogram, sellerTypeLabel } from "../bits";
import type { RouteTarget } from "./NavigateDialog";

export type RowSeller = NearbySeller & { source: LocationSource; nav: SellerNav; service: ServiceAction | null };

// One specialist on the map page: avatar, name, verification, rating, the
// approximate distance (never an address) and what can be done next —
// the profile, the service in question, a route when the backend allows one.
export default function SellerRow({
  s,
  known,
  base,
  precText,
  withDistance,
  onNavigate,
  ai,
}: {
  s: RowSeller;
  known: MarketSeller | null;
  base: string;
  precText: string;
  withDistance: boolean;
  onNavigate?: (t: RouteTarget) => void;
  ai: string;
}) {
  const t = useTranslations("marketplace.nearby");
  const tm = useTranslations("marketplace");
  const tx = useTranslations("marketMap");
  const te = useTranslations("enums");
  const locale = useLocale();
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const id = s.sellerUserId;
  const name = s.name || known?.name || t("map.unnamed");
  const href = id ? `${base}/${encodeURIComponent(id)}` : "";
  const d = withDistance ? approxDistance(s.distanceKm) : null;
  const dText = d ? (d.unit === "m" ? t("distanceM", { d: num.format(d.value) }) : t("distanceKm", { d: num.format(d.value) })) : t("distanceUnknown");
  const dAria = d ? t("distanceAria", { d: dText.replace(/^≈\s*/, ""), p: precText }) : t("distanceUnknown");
  const price = s.service?.price || (known && known.priceFrom > 0 ? known.priceFrom : 0);
  const rowAi = aiId(ai, id || name);
  const region = s.region || known?.region || "";
  const type = s.sellerType || known?.sellerType || "";
  const rating = s.rating > 0 ? s.rating : known?.rated && known.rating > 0 ? known.rating : 0;
  const reviews = s.rating > 0 ? s.reviewsCount : (known?.reviewsCount ?? 0);
  const verified = s.verified || !!known?.verified;
  const canRoute = !!id && s.nav.available && !!onNavigate;

  return (
    <li className="mknb-row mmrow" data-ai-id={rowAi} data-ai-type="list_item" data-ai-entity-type="seller" data-ai-entity-id={id || undefined}>
      <Monogram name={name} rating={rating} showRing={rating > 0} />
      <div className="mknb-row__who">
        <span className="mknb-row__title">
          {href ? (
            <Link href={href} className="mknb-row__name">
              {name}
            </Link>
          ) : (
            <span className="mknb-row__name">{name}</span>
          )}
          {verified ? <VerifiedBadge label={false} name={name} subtitle={type ? sellerTypeLabel(tm, type) : undefined} /> : null}
        </span>
        <span className="mknb-row__sub">
          {type ? <span>{sellerTypeLabel(tm, type)}</span> : null}
          {region ? (
            <>
              {type ? <i aria-hidden="true">·</i> : null}
              <span>{regionLabel(te, /[_-]/.test(region) ? humanizeSlug(region) : region)}</span>
            </>
          ) : null}
          {type || region ? <i aria-hidden="true">·</i> : null}
          {rating > 0 ? (
            <span className="mknb-row__rate">
              <IconStarRate aria-hidden="true" />
              {fmtRating(rating, locale)}
              {reviews > 0 ? <small>({tm("card.reviews", { count: reviews })})</small> : null}
            </span>
          ) : (
            <span className="mknb-row__rate">{tm("card.newSeller")}</span>
          )}
          {s.source ? (
            <>
              <i aria-hidden="true">·</i>
              <span className="mknb-row__src" data-src={s.source}>
                {s.source === "office" ? <IconBuilding aria-hidden="true" /> : <IconMapPin aria-hidden="true" />}
                {tx(`src.${s.source}`)}
              </span>
            </>
          ) : null}
        </span>
        {s.service?.title ? (
          <span className="mmrow__svc">
            <IconBriefcase aria-hidden="true" />
            <span>{s.service.title}</span>
          </span>
        ) : null}
        {price ? <b className="mknb-row__price">{tm("card.priceFrom", { price: fmtUzs(price) })}</b> : null}
      </div>
      {withDistance ? (
        <span className={`mknb-dist${d ? "" : " mknb-dist--none"}`} title={d ? precText : undefined}>
          <IconMapPin aria-hidden="true" />
          <span aria-hidden="true">{dText}</span>
          <span className="sr-only">{dAria}</span>
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="mmrow__acts">
        {href ? (
          <Link href={href} className="btn btn--line btn--sm mknb-row__go" data-ai-id={`${rowAi}.detail`}>
            {t("profile")}
          </Link>
        ) : null}
        {href && s.service ? (
          <Link href={`${href}#seller-services`} className="btn btn--line btn--sm mknb-row__go" data-ai-id={`${rowAi}.service`}>
            <IconBriefcase aria-hidden="true" />
            {tx("card.services")}
          </Link>
        ) : null}
        {canRoute ? (
          <button
            type="button"
            className="btn btn--grad btn--sm mknb-row__go"
            onClick={() => onNavigate?.({ sellerUserId: id, name, endpoint: s.nav.endpoint, modes: s.nav.modes })}
            data-ai-id={`${rowAi}.route`}
          >
            <Navigation aria-hidden="true" />
            {tx("route.open")}
          </button>
        ) : null}
      </span>
    </li>
  );
}
