"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconChevronLeft, IconChevronRight, IconClock, IconMegaphone, IconStar } from "@/components/icons";
import type { MarketPromotionSurface } from "@/lib/services/marketplace";
import { absUrl } from "@/lib/http";
import { regionLabel } from "@/lib/labels";
import { useTranslations } from "next-intl";
import { Monogram, sellerTypeLabel, specLabel } from "./bits";

const ROTATE_MS = 5500;
const DEFAULT_CTA = /^profilni ko['‘’ʻ`]?rish$/i;

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

function useSellerLine() {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  // "Advokat · Oilaviy huquq · Samarqand" from seller_profile, instead of the
  // backend's slug headline ("Advokat • fixture-nikoh-shartnomasi • samarkand").
  return (s: NonNullable<MarketPromotionSurface["seller"]>) =>
    [s.type ? sellerTypeLabel(t, s.type) : "", s.specialization ? specLabel(te, s.specialization) : "", s.region ? regionLabel(te, s.region) : ""].filter(Boolean).join(" · ");
}

// One banner slide. A banner with a picture is the picture with the copy over
// it; one without (banner_mode "profile_card") is drawn as the seller's card,
// so a seller who bought a banner without uploading anything still gets a
// proper slide. `preview` renders the button as plain text (the promote
// dialog shows the slide before anything is bought).
export function PromoBanner({ banner, base, preview, eyebrow, children }: { banner: MarketPromotionSurface; base: string; preview?: boolean; eyebrow?: string; children?: ReactNode }) {
  const t = useTranslations("marketplace");
  const line = useSellerLine();
  // An uploaded banner comes back as a relative /workspace/files/… path: it
  // has to go through the backend proxy, not the frontend's own origin.
  const image = banner.imageUrl ? (/^(blob:|data:)/.test(banner.imageUrl) ? banner.imageUrl : absUrl(banner.imageUrl)) : "";
  const card = !image && banner.seller ? banner.seller : null;
  const name = banner.title || banner.sellerName || t("promotions.bannerFallback");
  const sub = card ? (banner.subtitle && banner.subtitle !== card.headline ? banner.subtitle : line(card)) : banner.subtitle || banner.serviceTitle;
  const cta = targetOf(banner.ctaUrl, base, banner.sellerUserId ? `${base}/${encodeURIComponent(banner.sellerUserId)}` : base);
  // The backend fills an untouched button with its own Uzbek default; that one
  // is ours to translate, a seller's own wording is not.
  const own = banner.ctaLabel.trim();
  const label = own && !DEFAULT_CTA.test(own) ? own : own || card ? t("promotions.viewProfile") : "";
  return (
    <section
      className={`mk-promo-banner${card || !image ? " mk-promo-banner--card" : ""}`}
      style={image ? { backgroundImage: `linear-gradient(90deg, rgba(7,29,67,.9), rgba(7,29,67,.28)), url(${JSON.stringify(image)})` } : undefined}
    >
      <div className="mk-promo-banner__copy">
        <span className="mk-promo-banner__eyebrow">
          <IconMegaphone /> {eyebrow || t("promotions.sponsored")}
        </span>
        <h2>{name}</h2>
        {sub ? <p>{sub}</p> : null}
        {card && (card.rating > 0 || card.experience > 0) ? (
          <span className="mk-promo-banner__facts">
            {card.rating > 0 ? (
              <span>
                <IconStar /> {card.rating.toFixed(1)}
                {card.reviews ? <small>{t("card.reviews", { count: card.reviews })}</small> : null}
              </span>
            ) : null}
            {card.experience > 0 ? (
              <span>
                <b>{card.experience}</b> {t("card.experience")}
              </span>
            ) : null}
          </span>
        ) : null}
        {label ? (
          preview ? (
            <span className="mk-promo-banner__cta">
              {label}
              <IconArrowRight />
            </span>
          ) : cta.external ? (
            <a className="mk-promo-banner__cta" href={cta.href} target="_blank" rel="noopener noreferrer">
              {label}
              <IconArrowRight />
            </a>
          ) : (
            <Link className="mk-promo-banner__cta" href={cta.href}>
              {label}
              <IconArrowRight />
            </Link>
          )
        ) : null}
      </div>
      {!image ? (
        <div className="mk-promo-banner__who" aria-hidden="true">
          <Monogram name={banner.sellerName || name} rating={card?.rating ?? 0} size="lg" showRing={Boolean(card && card.rating > 0)} />
          {card?.verified ? <span className="mk-promo-banner__ok">{t("card.verified")}</span> : null}
        </div>
      ) : null}
      {banner.daysLeft >= 0 && !preview ? (
        <span className="mk-promo-banner__left">
          <IconClock /> {banner.daysLeft ? t("promotions.daysLeft", { n: banner.daysLeft }) : t("promotions.lastDay")}
        </span>
      ) : null}
      {children}
    </section>
  );
}

// `part` lets the page put the two surfaces where the 10-09 guide wants them:
// the banner carousel at the top of the page, the sponsored block right above
// the results. Without it both render together, as before.
export default function PromotionSurfaces({ banners, sponsored, base, part }: { banners: MarketPromotionSurface[]; sponsored: MarketPromotionSurface[]; base: string; part?: "banner" | "sponsored" }) {
  const t = useTranslations("marketplace");
  const line = useSellerLine();
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const swipe = useRef<number | null>(null);
  const slides = part === "sponsored" ? [] : banners;
  const tiles = part === "banner" ? [] : sponsored;
  const count = slides.length;
  // Rotates only while nobody is reading it: not under the pointer or focus,
  // not in a hidden tab, and never for someone who asked for less motion.
  useEffect(() => {
    if (count < 2 || hold || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setActive((value) => (value + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [count, hold]);
  if (!count && !tiles.length) return null;
  const at = active % Math.max(1, count);
  const banner = slides[at];
  const go = (step: number) => setActive((value) => (value + step + count) % count);
  return (
    <div className="mk-promo-surfaces" aria-label={t("promotions.label")}>
      {banner ? (
        <div
          className="mk-promo-carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label={t("promotions.label")}
          onMouseEnter={() => setHold(true)}
          onMouseLeave={() => setHold(false)}
          onFocus={() => setHold(true)}
          onBlur={() => setHold(false)}
          onPointerDown={(e) => {
            swipe.current = e.clientX;
          }}
          onPointerUp={(e) => {
            const from = swipe.current;
            swipe.current = null;
            if (from === null || count < 2) return;
            const dx = e.clientX - from;
            if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
          }}
        >
          <div className="mk-promo-carousel__slide" key={banner.id || at} aria-live={hold ? "polite" : "off"}>
            <PromoBanner banner={banner} base={base}>
              {count > 1 ? (
                <div className="mk-promo-banner__nav">
                  <button type="button" onClick={() => go(-1)} aria-label={t("promotions.previous")}>
                    <IconChevronLeft />
                  </button>
                  <span className="mk-promo-banner__dots">
                    {slides.map((s, i) => (
                      <button key={s.id || i} type="button" className={i === at ? "on" : undefined} aria-label={t("promotions.slide", { n: i + 1, total: count })} aria-current={i === at || undefined} onClick={() => setActive(i)} />
                    ))}
                  </span>
                  <button type="button" onClick={() => go(1)} aria-label={t("promotions.next")}>
                    <IconChevronRight />
                  </button>
                </div>
              ) : null}
            </PromoBanner>
          </div>
        </div>
      ) : null}
      {tiles.length ? (
        <section className="mk-promo-sponsored">
          <div className="mk-promo-sponsored__head">
            <div>
              <span>{t("promotions.sponsored")}</span>
              <h2>{t("promotions.featuredTitle")}</h2>
            </div>
          </div>
          <div className="mk-promo-sponsored__grid">
            {tiles.slice(0, 4).map((item) => {
              const to = targetOf(item.ctaUrl, base, item.sellerUserId ? `${base}/${encodeURIComponent(item.sellerUserId)}` : base);
              // A tile is one link; a promotion that points off-site still
              // opens the seller here rather than leaving mid-search.
              const href = to.external ? (item.sellerUserId ? `${base}/${encodeURIComponent(item.sellerUserId)}` : base) : to.href;
              const who = item.seller && (!item.subtitle || item.subtitle === item.seller.headline) ? [item.sellerName, line(item.seller)].filter(Boolean).join(" · ") : item.subtitle || item.sellerName;
              return (
                <Link className="mk-promo-tile" href={href} key={item.id || `${item.sellerUserId}-${item.serviceId}`}>
                  <span className="mk-promo-tile__tag">
                    <IconMegaphone /> {t("promotions.sponsored")}
                  </span>
                  <b>{item.serviceTitle || item.title || item.sellerName}</b>
                  <small>{who}</small>
                  {item.seller && item.seller.rating > 0 ? (
                    <span className="mk-promo-tile__rate">
                      <IconStar /> {item.seller.rating.toFixed(1)}
                    </span>
                  ) : null}
                  <span className="mk-promo-tile__go">
                    <IconArrowRight />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
