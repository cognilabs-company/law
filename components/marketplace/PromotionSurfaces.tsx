"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconChevronLeft, IconChevronRight, IconClock, IconMegaphone, IconStar } from "@/components/icons";
import type { MarketPromotionSurface } from "@/lib/services/marketplace";
import { absUrl } from "@/lib/http";
import { regionLabel } from "@/lib/labels";
import { useTranslations } from "next-intl";
import { promoClick, usePromoImpression, useSearchAppearances } from "@/lib/services/promoEvents";
import { Monogram, sellerTypeLabel, specLabel } from "./bits";

const ROTATE_MS = 5500;
const DEFAULT_CTA = /^profilni ko['‘’ʻ`]?rish$/i;

function targetOf(value: string, base: string, fallback: string): { href: string; external: boolean } {
  if (!value) return { href: fallback, external: false };
  if (/^https?:\/\//i.test(value)) return { href: value, external: true };
  const seller = /^\/(?:portal\/client\/)?marketplace\/lawyers\/([^/?#]+)/.exec(value);
  if (seller) return { href: `${base}/${seller[1]}`, external: false };
  return value.startsWith("/") ? { href: value, external: false } : { href: fallback, external: false };
}

const sellerHref = (base: string, item: MarketPromotionSurface) => (item.sellerUserId ? `${base}/${encodeURIComponent(item.sellerUserId)}` : base);

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

type Part = "banner" | "profiles" | "sponsored";

// `part` lets the page put each surface where the guides want it: the banner
// carousel at the top of the page, the Top specialists and Top services blocks
// right above the results. Without it all of them render together.
export default function PromotionSurfaces({
  banners = [],
  sponsored = [],
  profiles = [],
  base,
  part,
  searchKey = "",
}: {
  banners?: MarketPromotionSurface[];
  sponsored?: MarketPromotionSurface[];
  profiles?: MarketPromotionSurface[];
  base: string;
  part?: Part;
  searchKey?: string;
}) {
  const t = useTranslations("marketplace");
  const show = (p: Part) => !part || part === p;
  const slides = show("banner") ? banners : [];
  const people = show("profiles") ? profiles : [];
  const tiles = show("sponsored") ? sponsored : [];
  if (!slides.length && !people.length && !tiles.length) return null;
  return (
    <div className="mk-promo-surfaces" aria-label={t("promotions.label")}>
      {slides.length ? <BannerCarousel slides={slides} base={base} /> : null}
      {people.length ? <ProfilesSurface items={people} base={base} searchKey={searchKey} /> : null}
      {tiles.length ? <ServicesSurface items={tiles} base={base} searchKey={searchKey} /> : null}
    </div>
  );
}

function BannerCarousel({ slides, base }: { slides: MarketPromotionSurface[]; base: string }) {
  const t = useTranslations("marketplace");
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const swipe = useRef<number | null>(null);
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
  const at = active % Math.max(1, count);
  const banner = slides[at];
  const seen = usePromoImpression(banner?.id ?? "", "marketplace_top_banner", at + 1);
  const go = (step: number) => setActive((value) => (value + step + count) % count);
  if (!banner) return null;
  return (
    <div
      className="mk-promo-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={t("promotions.label")}
      data-ai-id="marketplace.promotions.banner"
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
      <div
        className="mk-promo-carousel__slide"
        key={banner.id || at}
        ref={seen}
        aria-live={hold ? "polite" : "off"}
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest(".mk-promo-banner__cta")) promoClick(banner.id, banner.sellerUserId, "marketplace_top_banner", at + 1);
        }}
      >
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
  );
}

function ProfilesSurface({ items, base, searchKey }: { items: MarketPromotionSurface[]; base: string; searchKey: string }) {
  const t = useTranslations("marketplace");
  const line = useSellerLine();
  const shown = items.slice(0, 4);
  useSearchAppearances(shown.map((item) => item.id).filter(Boolean), "marketplace_profiles", searchKey);
  return (
    <section className="mk-promo-sponsored mk-promo-sponsored--profiles" data-ai-id="marketplace.promotions.profiles" aria-labelledby="mk-promo-profiles">
      <div className="mk-promo-sponsored__head">
        <div>
          <span>{t("promotions.sponsored")}</span>
          <h2 id="mk-promo-profiles">{t("promotions.profilesTitle")}</h2>
        </div>
      </div>
      <div className="mk-promo-sponsored__grid">
        {shown.map((item, i) => (
          <PromoTile
            key={item.id || item.sellerUserId}
            item={item}
            base={base}
            position={i + 1}
            source="marketplace_profiles"
            title={item.sellerName || item.title}
            sub={item.seller ? line(item.seller) : item.subtitle || item.serviceTitle || t("promotions.profileSub")}
          />
        ))}
      </div>
    </section>
  );
}

function ServicesSurface({ items, base, searchKey }: { items: MarketPromotionSurface[]; base: string; searchKey: string }) {
  const t = useTranslations("marketplace");
  const line = useSellerLine();
  const shown = items.slice(0, 4);
  useSearchAppearances(shown.map((item) => item.id).filter(Boolean), "service_search", searchKey);
  return (
    <section className="mk-promo-sponsored" data-ai-id="marketplace.promotions.services" aria-labelledby="mk-promo-services">
      <div className="mk-promo-sponsored__head">
        <div>
          <span>{t("promotions.sponsored")}</span>
          <h2 id="mk-promo-services">{t("promotions.featuredTitle")}</h2>
        </div>
      </div>
      <div className="mk-promo-sponsored__grid">
        {shown.map((item, i) => (
          <PromoTile
            key={item.id || `${item.sellerUserId}-${item.serviceId}`}
            item={item}
            base={base}
            position={i + 1}
            source="service_search"
            title={item.serviceTitle || item.title || item.sellerName}
            sub={item.seller && (!item.subtitle || item.subtitle === item.seller.headline) ? [item.sellerName, line(item.seller)].filter(Boolean).join(" · ") : item.subtitle || item.sellerName}
          />
        ))}
      </div>
    </section>
  );
}

// A tile is one link; a promotion that points off-site still opens the seller
// here rather than leaving mid-search.
function PromoTile({ item, base, position, source, title, sub }: { item: MarketPromotionSurface; base: string; position: number; source: string; title: string; sub: string }) {
  const t = useTranslations("marketplace");
  const seen = usePromoImpression(item.id, source, position);
  const to = targetOf(item.ctaUrl, base, sellerHref(base, item));
  const href = to.external ? sellerHref(base, item) : to.href;
  return (
    <Link ref={seen} className="mk-promo-tile" href={href} onClick={() => promoClick(item.id, item.sellerUserId, source, position)}>
      <span className="mk-promo-tile__tag">
        <IconMegaphone /> {t("promotions.sponsored")}
      </span>
      <b>{title}</b>
      {sub ? <small>{sub}</small> : null}
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
}
