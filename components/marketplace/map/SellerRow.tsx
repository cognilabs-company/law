"use client";

import { useCallback, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import VerifiedBadge from "@/components/VerifiedBadge";
import { IconBriefcase, IconBuilding, IconChevronRight, IconMapPin, IconStarRate } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";
import { fmtRating } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import type { MarketSeller } from "@/lib/services/marketplace";
import { approxDistance } from "@/lib/services/marketDiscovery";
import type { NearbySeller } from "@/lib/services/marketRuntime";
import type { LocationSource, SellerNav, ServiceAction } from "@/lib/services/sellersMap";
import { Monogram, sellerTypeLabel } from "../bits";

export type RowSeller = NearbySeller & { source: LocationSource; nav: SellerNav; service: ServiceAction | null };

// The service's own price from service_action (§7.3), in its currency.
export function useActionPrice(): (a: ServiceAction) => string {
  const tx = useTranslations("marketMap");
  const locale = useLocale();
  return useCallback(
    (a: ServiceAction) => {
      if (!a.price) return "";
      if (a.currency === "UZS") return tx("card.price", { price: fmtUzs(a.price) });
      try {
        return new Intl.NumberFormat(locale, { style: "currency", currency: a.currency, maximumFractionDigits: 0 }).format(a.price);
      } catch {
        return tx("card.price", { price: fmtUzs(a.price) });
      }
    },
    [tx, locale],
  );
}

// The service action of a map/nearby seller: service_action.id is the
// service. When the backend allows the purchase the link opens the profile's
// purchase dialog for exactly that service (?buy=<id>); otherwise it shows the
// profile's services.
export function ServiceActionLink({ action, href, className, ai }: { action: ServiceAction; href: string; className: string; ai: string }) {
  const tx = useTranslations("marketMap");
  const buy = action.canPurchase;
  const to = buy ? `${href}?buy=${encodeURIComponent(action.id)}` : `${href}#seller-services`;
  const text = buy ? (action.title ? tx("card.buy", { title: action.title }) : tx("card.buyAny")) : action.title ? tx("card.service", { title: action.title }) : tx("card.services");
  return (
    <Link href={to} className={className} data-ai-id={ai} data-ai-entity-type="marketplace_service" data-ai-entity-id={action.id}>
      {buy ? <ShoppingBag aria-hidden="true" /> : <IconBriefcase aria-hidden="true" />}
      <span>{text}</span>
    </Link>
  );
}

export function useDistanceText(): (km: number | null, precText: string) => { text: string; aria: string; known: boolean } {
  const t = useTranslations("marketplace.nearby");
  const locale = useLocale();
  return useCallback(
    (km: number | null, precText: string) => {
      const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
      const d = approxDistance(km);
      if (!d) return { text: t("distanceUnknown"), aria: t("distanceUnknown"), known: false };
      const text = d.unit === "m" ? t("distanceM", { d: num.format(d.value) }) : t("distanceKm", { d: num.format(d.value) });
      return { text, aria: t("distanceAria", { d: text.replace(/^≈\s*/, ""), p: precText }), known: true };
    },
    [t, locale],
  );
}

export default function SellerRow({
  s,
  known,
  precText,
  withDistance,
  selected,
  onSelect,
  index,
  ai,
}: {
  s: RowSeller;
  known: MarketSeller | null;
  precText: string;
  withDistance: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
  index: number;
  ai: string;
}) {
  const t = useTranslations("marketplace.nearby");
  const tm = useTranslations("marketplace");
  const tx = useTranslations("marketMap");
  const locale = useLocale();
  const id = s.sellerUserId;
  const name = s.name || known?.name || t("map.unnamed");
  const dist = useDistanceText()(s.distanceKm, precText);
  const actionPrice = useActionPrice();
  const price = s.service?.price ? actionPrice(s.service) : known && known.priceFrom > 0 ? tm("card.priceFrom", { price: fmtUzs(known.priceFrom) }) : "";
  const rowAi = aiId(ai, id || name);
  const type = s.sellerType || known?.sellerType || "";
  const rating = s.rating > 0 ? s.rating : known?.rated && known.rating > 0 ? known.rating : 0;
  const verified = s.verified || !!known?.verified;

  const body = (
    <>
      <Monogram name={name} rating={rating} showRing={rating > 0} />
      <span className="mmrow__who">
        <span className="mmrow__title">
          <span className="mmrow__name">{name}</span>
          {verified ? <VerifiedBadge label={false} interactive={false} name={name} /> : null}
        </span>
        <span className="mmrow__sub">
          {type ? <span>{sellerTypeLabel(tm, type)}</span> : null}
          {rating > 0 ? (
            <span className="mmrow__rate">
              <IconStarRate aria-hidden="true" />
              {fmtRating(rating, locale)}
            </span>
          ) : (
            <span>{tm("card.newSeller")}</span>
          )}
          {s.source ? (
            <span className="mmrow__src" data-src={s.source}>
              {s.source === "office" ? <IconBuilding aria-hidden="true" /> : <IconMapPin aria-hidden="true" />}
              {tx(`src.${s.source}`)}
            </span>
          ) : null}
        </span>
        {s.service?.title ? (
          <span className="mmrow__svc">
            <IconBriefcase aria-hidden="true" />
            <span>{s.service.title}</span>
          </span>
        ) : null}
      </span>
      <span className="mmrow__end">
        {withDistance ? (
          <span className={`mknb-dist${dist.known ? "" : " mknb-dist--none"}`} title={dist.known ? precText : undefined}>
            <IconMapPin aria-hidden="true" />
            <span aria-hidden="true">{dist.text}</span>
            <span className="sr-only">{dist.aria}</span>
          </span>
        ) : price ? (
          <b className="mmrow__price">{price}</b>
        ) : null}
        {id && onSelect ? <IconChevronRight className="mmrow__go" aria-hidden="true" /> : null}
      </span>
    </>
  );

  return (
    <li
      className={`mmrow${selected ? " is-on" : ""}`}
      style={{ "--i": Math.min(index, 14) } as CSSProperties}
      data-ai-id={rowAi}
      data-ai-type="list_item"
      data-ai-entity-type="seller"
      data-ai-entity-id={id || undefined}
    >
      {id && onSelect ? (
        <button type="button" className="mmrow__btn" aria-pressed={selected} onClick={() => onSelect(id)} data-seller={id} data-ai-id={`${rowAi}.open`}>
          {body}
        </button>
      ) : (
        <div className="mmrow__btn mmrow__btn--static">{body}</div>
      )}
    </li>
  );
}
