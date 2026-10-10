"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconChevronLeft, IconChevronRight, IconMegaphone } from "@/components/icons";
import type { MarketPromotionSurface } from "@/lib/services/marketplace";
import { absUrl } from "@/lib/http";
import { useTranslations } from "next-intl";

// Where a promotion's button leads. The backend writes seller links as
// /portal/client/marketplace/lawyers/{id} — a route this app does not have
// (the profile lives under `base`), so that shape is mapped onto it; anything
// else internal goes through the locale-aware Link, and only a full URL leaves
// the site.
function targetOf(value: string, base: string, fallback: string): { href: string; external: boolean } {
  if (!value) return { href: fallback, external: false };
  if (/^https?:\/\//i.test(value)) return { href: value, external: true };
  const seller = /^\/(?:portal\/client\/)?marketplace\/lawyers\/([^/?#]+)/.exec(value);
  if (seller) return { href: `${base}/${seller[1]}`, external: false };
  return value.startsWith("/") ? { href: value, external: false } : { href: fallback, external: false };
}

// `part` lets the page put the two surfaces where the 10-09 guide wants them:
// the banner carousel at the top of the page, the sponsored block right above
// the results. Without it both render together, as before.
export default function PromotionSurfaces({ banners, sponsored, base, part }: { banners: MarketPromotionSurface[]; sponsored: MarketPromotionSurface[]; base: string; part?: "banner" | "sponsored" }) {
  const t = useTranslations("marketplace");
  const [active, setActive] = useState(0);
  const slides = part === "sponsored" ? [] : banners;
  const tiles = part === "banner" ? [] : sponsored;
  const count = slides.length;
  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => setActive((value) => (value + 1) % count), 5500);
    return () => window.clearInterval(id);
  }, [count]);
  if (!count && !tiles.length) return null;
  const banner = slides[active % Math.max(1, count)];
  // An uploaded banner comes back as a relative /workspace/files/… path: it
  // has to go through the backend proxy, not the frontend's own origin.
  const image = banner?.imageUrl ? absUrl(banner.imageUrl) : "";
  const cta = banner ? targetOf(banner.ctaUrl, base, banner.sellerUserId ? `${base}/${encodeURIComponent(banner.sellerUserId)}` : base) : null;
  return (
    <div className="mk-promo-surfaces" aria-label={t("promotions.label")}>
      {banner ? (
        <section className="mk-promo-banner" style={image ? { backgroundImage: `linear-gradient(90deg, rgba(7,29,67,.9), rgba(7,29,67,.28)), url(${JSON.stringify(image)})` } : undefined}>
          <div className="mk-promo-banner__copy">
            <span className="mk-promo-banner__eyebrow"><IconMegaphone /> {t("promotions.sponsored")}</span>
            <h2>{banner.title || banner.sellerName || t("promotions.bannerFallback")}</h2>
            {banner.subtitle || banner.serviceTitle ? <p>{banner.subtitle || banner.serviceTitle}</p> : null}
            {banner.ctaLabel && cta ? (
              cta.external
                ? <a className="mk-promo-banner__cta" href={cta.href} target="_blank" rel="noopener noreferrer">{banner.ctaLabel}<IconArrowRight /></a>
                : <Link className="mk-promo-banner__cta" href={cta.href}>{banner.ctaLabel}<IconArrowRight /></Link>
            ) : null}
          </div>
          {count > 1 ? (
            <div className="mk-promo-banner__nav">
              <button type="button" onClick={() => setActive((value) => (value - 1 + count) % count)} aria-label={t("promotions.previous")}><IconChevronLeft /></button>
              <span>{(active % count) + 1} / {count}</span>
              <button type="button" onClick={() => setActive((value) => (value + 1) % count)} aria-label={t("promotions.next")}><IconChevronRight /></button>
            </div>
          ) : null}
        </section>
      ) : null}
      {tiles.length ? (
        <section className="mk-promo-sponsored">
          <div className="mk-promo-sponsored__head"><div><span>{t("promotions.sponsored")}</span><h2>{t("promotions.featuredTitle")}</h2></div></div>
          <div className="mk-promo-sponsored__grid">
            {tiles.slice(0, 4).map((item) => {
              const to = targetOf(item.ctaUrl, base, item.sellerUserId ? `${base}/${encodeURIComponent(item.sellerUserId)}` : base);
              // A tile is one link; a promotion that points off-site still
              // opens the seller here rather than leaving mid-search.
              const href = to.external ? (item.sellerUserId ? `${base}/${encodeURIComponent(item.sellerUserId)}` : base) : to.href;
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
