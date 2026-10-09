"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconChevronLeft, IconChevronRight, IconMegaphone } from "@/components/icons";
import type { MarketPromotionSurface } from "@/lib/services/marketplace";
import { useTranslations } from "next-intl";

function safeHref(value: string, fallback: string): string {
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;
  return fallback;
}

export default function PromotionSurfaces({ banners, sponsored, base }: { banners: MarketPromotionSurface[]; sponsored: MarketPromotionSurface[]; base: string }) {
  const t = useTranslations("marketplace");
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const id = window.setInterval(() => setActive((value) => (value + 1) % banners.length), 5500);
    return () => window.clearInterval(id);
  }, [banners.length]);
  if (!banners.length && !sponsored.length) return null;
  const banner = banners[active % Math.max(1, banners.length)];
  return (
    <div className="mk-promo-surfaces" aria-label={t("promotions.label")}>
      {banner ? (
        <section className="mk-promo-banner" style={banner.imageUrl ? { backgroundImage: `linear-gradient(90deg, rgba(7,29,67,.9), rgba(7,29,67,.28)), url(${JSON.stringify(banner.imageUrl)})` } : undefined}>
          <div className="mk-promo-banner__copy">
            <span className="mk-promo-banner__eyebrow"><IconMegaphone /> {t("promotions.sponsored")}</span>
            <h2>{banner.title || banner.sellerName || t("promotions.bannerFallback")}</h2>
            {banner.subtitle ? <p>{banner.subtitle}</p> : null}
            {banner.ctaLabel ? <a className="mk-promo-banner__cta" href={safeHref(banner.ctaUrl, base)}>{banner.ctaLabel}<IconArrowRight /></a> : null}
          </div>
          {banners.length > 1 ? (
            <div className="mk-promo-banner__nav">
              <button type="button" onClick={() => setActive((value) => (value - 1 + banners.length) % banners.length)} aria-label={t("promotions.previous")}><IconChevronLeft /></button>
              <span>{active + 1} / {banners.length}</span>
              <button type="button" onClick={() => setActive((value) => (value + 1) % banners.length)} aria-label={t("promotions.next")}><IconChevronRight /></button>
            </div>
          ) : null}
        </section>
      ) : null}
      {sponsored.length ? (
        <section className="mk-promo-sponsored">
          <div className="mk-promo-sponsored__head"><div><span>{t("promotions.sponsored")}</span><h2>{t("promotions.featuredTitle")}</h2></div></div>
          <div className="mk-promo-sponsored__grid">
            {sponsored.slice(0, 4).map((item) => {
              const href = safeHref(item.ctaUrl, item.sellerUserId ? `${base}/${encodeURIComponent(item.sellerUserId)}` : base);
              return (
                <Link className="mk-promo-tile" href={href} key={item.id || `${item.sellerUserId}-${item.serviceId}`}>
                  <span className="mk-promo-tile__tag"><IconMegaphone /> {t("promotions.sponsored")}</span>
                  <b>{item.serviceTitle || item.title || item.sellerName}</b>
                  <small>{item.subtitle || item.sellerName}</small>
                  <span className="mk-promo-tile__go"><IconArrowRight /></span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
