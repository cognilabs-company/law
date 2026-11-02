"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import VerifiedBadge from "@/components/VerifiedBadge";
import { IconBriefcase, IconBuilding, IconChevronLeft, IconMapPin, IconStarRate } from "@/components/icons";
import { regionLabel } from "@/lib/labels";
import { humanizeSlug } from "@/lib/lawyers";
import { fmtRating } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import type { MarketSeller } from "@/lib/services/marketplace";
import { loadMapSellerInfo, mapSellerInfoServerSnapshot, mapSellerInfoSnapshot, subscribeMapSellerInfo } from "@/lib/services/sellersMap";
import { Monogram, sellerTypeLabel } from "../bits";
import { ServiceActionLink, useActionPrice, useDistanceText, type RowSeller } from "./SellerRow";
import "./sellerDetail.css";

export default function SellerDetail({
  s,
  known,
  base,
  precM,
  precText,
  withDistance,
  labelId,
  onBack,
  children,
}: {
  s: RowSeller;
  known: MarketSeller | null;
  base: string;
  precM: number;
  precText: string;
  withDistance: boolean;
  labelId: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  const t = useTranslations("marketMap.panel");
  const tn = useTranslations("marketplace.nearby");
  const tm = useTranslations("marketplace");
  const tx = useTranslations("marketMap");
  const te = useTranslations("enums");
  const ty = useTranslations("marketplace.ymap");
  const locale = useLocale();
  const ref = useRef<HTMLElement>(null);
  const actionPrice = useActionPrice();
  const distText = useDistanceText();
  const info = useSyncExternalStore(subscribeMapSellerInfo, mapSellerInfoSnapshot, mapSellerInfoServerSnapshot);
  const id = s.sellerUserId;
  const more = known ?? info.get(id) ?? null;
  const name = s.name || more?.name || tn("map.unnamed");
  const pending = !s.name && !more?.name && info.get(id) === undefined;
  const type = s.sellerType || more?.sellerType || "";
  const region = s.region || more?.region || "";
  const rating = s.rating > 0 ? s.rating : more?.rated && more.rating > 0 ? more.rating : 0;
  const reviews = s.rating > 0 ? s.reviewsCount : (more?.reviewsCount ?? 0);
  const verified = s.verified || !!more?.verified;
  const href = `${base}/${encodeURIComponent(id)}`;
  const price = s.service?.price ? actionPrice(s.service) : more && more.priceFrom > 0 ? tm("card.priceFrom", { price: fmtUzs(more.priceFrom) }) : "";
  const dist = withDistance ? distText(s.distanceKm, precText) : null;

  useEffect(() => {
    if (pending) loadMapSellerInfo([id]);
  }, [pending, id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (el.closest(".mpn--flat")) el.scrollIntoView?.({ block: "nearest" });
  }, [id]);

  return (
    <section
      ref={ref}
      className="msd"
      tabIndex={-1}
      aria-labelledby={labelId}
      aria-busy={pending || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          onBack();
        }
      }}
      data-ai-id="marketplace.map.card"
      data-ai-type="section"
      data-ai-entity-type="seller"
      data-ai-entity-id={id}
    >
      <div className="msd__top">
        <button type="button" className="msd__back" onClick={onBack} aria-label={t("back")} title={t("back")} data-ai-id="marketplace.map.card.close">
          <IconChevronLeft aria-hidden="true" />
        </button>
        <span className="msd__crumb">{ty("selected")}</span>
      </div>

      <div className="msd__hero">
        <Monogram name={name} rating={rating} showRing={rating > 0} size="lg" />
        <div className="msd__who">
          <h3 id={labelId} className="msd__name">
            <span>{name}</span>
            {verified ? <VerifiedBadge label={false} name={name} subtitle={type ? sellerTypeLabel(tm, type) : undefined} /> : null}
          </h3>
          <p className="msd__sub">
            {type ? <span>{sellerTypeLabel(tm, type)}</span> : null}
            {region ? <span>{regionLabel(te, /[_-]/.test(region) ? humanizeSlug(region) : region)}</span> : null}
          </p>
          <p className="msd__rate">
            {rating > 0 ? (
              <>
                <IconStarRate aria-hidden="true" />
                <b>{fmtRating(rating, locale)}</b>
                {reviews > 0 ? <small>({tm("card.reviews", { count: reviews })})</small> : null}
              </>
            ) : (
              <span className="msd__new">{tm("card.newSeller")}</span>
            )}
          </p>
        </div>
      </div>

      <div className="msd__facts">
        {s.source ? (
          <span className="msd__src" data-src={s.source} data-ai-id="marketplace.map.card.source">
            {s.source === "office" ? <IconBuilding aria-hidden="true" /> : <IconMapPin aria-hidden="true" />}
            {tx(`src.${s.source}`)}
          </span>
        ) : null}
        {dist?.known ? (
          <span className="mknb-dist" title={precText}>
            <IconMapPin aria-hidden="true" />
            <span aria-hidden="true">{dist.text}</span>
            <span className="sr-only">{dist.aria}</span>
          </span>
        ) : null}
      </div>
      <p className="msd__approx" data-ai-id="marketplace.map.card.approx">
        {s.source === "profile_region" ? tx("card.approxRegion") : tx("card.approx", { m: precM })}
      </p>

      {s.service?.title || price ? (
        <p className="msd__svc">
          {s.service?.title ? (
            <span>
              <IconBriefcase aria-hidden="true" />
              {s.service.title}
            </span>
          ) : null}
          {price ? <b>{price}</b> : null}
        </p>
      ) : null}

      <div className="msd__acts">
        <Link href={href} className="btn btn--line btn--sm" data-ai-id="marketplace.map.card.profile">
          {ty("profile")}
        </Link>
        {s.service?.canPurchase ? <ServiceActionLink action={s.service} href={href} className="btn btn--grad btn--sm" ai="marketplace.map.card.service" /> : null}
      </div>

      {children}
    </section>
  );
}
