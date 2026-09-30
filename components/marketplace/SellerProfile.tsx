"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth, hasAdminAccess } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { fmtRating, dateOnly } from "@/lib/date";
import { regionLabel } from "@/lib/labels";
import { setReturnTo } from "@/lib/returnTo";
import {
  getMarketplaceSeller,
  getMarketplaceSellerServices,
  peekSeller,
  type MarketSellerDetail,
  type MarketService,
} from "@/lib/services/marketplace";
import { IconArrowRight, IconChevronLeft, IconClock, IconGlobe, IconLock, IconMapPin, IconRefresh, IconShieldCheck, IconStar, IconChat, IconBriefcase } from "@/components/icons";
import PurchaseDialog from "./PurchaseDialog";
import PrivateChatButton from "./PrivateChatButton";
import { Monogram, Stars, deliveryLabel, hasRating, hasSuccess, langLabel, sellerTypeLabel, specLabel } from "./bits";

type Status = "loading" | "ready" | "notfound" | "error";

export default function SellerProfile({ userId, variant }: { userId: string; variant: "public" | "portal" }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const locale = useLocale();
  const router = useRouter();
  const { session, ready } = useAuth();
  const listHref = variant === "portal" ? "/portal/client/lawyers" : "/lawyers";
  const selfPath = variant === "portal" ? `/portal/client/lawyers/${encodeURIComponent(userId)}` : `/lawyers/${encodeURIComponent(userId)}`;

  const [seller, setSeller] = useState<MarketSellerDetail | null>(() => {
    const s = peekSeller(userId);
    return s ? { ...s, reviews: [] } : null;
  });
  const [status, setStatus] = useState<Status>(() => (peekSeller(userId) ? "ready" : "loading"));
  const [reviewsReady, setReviewsReady] = useState(false);
  const [services, setServices] = useState<MarketService[]>(() => peekSeller(userId)?.services ?? []);
  const [picked, setPicked] = useState("");
  const [buying, setBuying] = useState<MarketService | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    getMarketplaceSeller(userId)
      .then((d) => {
        if (!alive) return;
        setSeller(d);
        setServices((cur) => (d.services.length ? d.services : cur));
        setStatus("ready");
        setReviewsReady(true);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) {
          setSeller(null);
          setStatus("notfound");
        } else setStatus((s) => (s === "ready" ? s : "error"));
        setReviewsReady(true);
      });
    return () => {
      alive = false;
    };
  }, [userId, reload]);

  const refreshServices = useCallback(() => {
    getMarketplaceSellerServices(userId)
      .then((list) => {
        setServices(list);
        setPicked((p) => (list.some((x) => x.id === p) ? p : ""));
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setStatus("notfound");
      });
  }, [userId]);

  useEffect(() => {
    refreshServices();
  }, [refreshServices]);

  const isStaff = !!session && hasAdminAccess(session);
  const isSeller = !!session && session.role !== "client";
  const isOwn = !!session && session.id === userId;
  const blocked = !seller
    ? ""
    : isOwn
      ? t("detail.blockedOwn")
      : isSeller || isStaff
        ? t("detail.blockedSeller")
        : !seller.verified
          ? t("detail.blockedUnverified")
          : !seller.available
            ? t("detail.blockedBusy")
            : "";

  const selected = useMemo(() => services.find((s) => s.id === picked) ?? services[0] ?? null, [services, picked]);

  const startBuy = useCallback(
    (svc: MarketService) => {
      if (!ready) return;
      if (!session) {
        setReturnTo(`/portal/client/lawyers/${encodeURIComponent(userId)}?buy=${encodeURIComponent(svc.id)}`);
        router.push("/login");
        return;
      }
      if (blocked) return;
      setBuying(svc);
    },
    [ready, session, blocked, router, userId],
  );

  const [autoBuy, setAutoBuy] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("buy");
    if (!id) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("buy");
    window.history.replaceState(window.history.state, "", url.toString());
    const h = setTimeout(() => setAutoBuy(id), 0);
    return () => clearTimeout(h);
  }, []);
  useEffect(() => {
    if (!autoBuy || !ready || !services.length || !seller) return;
    const svc = services.find((s) => s.id === autoBuy);
    const h = setTimeout(() => {
      setAutoBuy(null);
      if (svc) {
        setPicked(svc.id);
        if (session && !blocked) setBuying(svc);
      }
    }, 0);
    return () => clearTimeout(h);
  }, [autoBuy, ready, services, seller, session, blocked]);

  if (status === "loading") {
    return (
      <section className="mk mk-prof">
        <div className="mk-prof__hero mk-prof__hero--ghost" aria-busy="true">
          <span className="mk-prof__loading">{t("detail.loading")}</span>
        </div>
      </section>
    );
  }

  if (status === "notfound" || (status === "error" && !seller)) {
    return (
      <section className="mk mk-prof">
        <div className="mk-empty">
          <b>{status === "notfound" ? t("detail.notFound") : t("error")}</b>
          <span>{status === "notfound" ? t("detail.notFoundText") : ""}</span>
          <div className="mk-buy__acts">
            {status === "error" ? (
              <button
                type="button"
                className="btn btn--line btn--sm"
                onClick={() => {
                  setStatus("loading");
                  setReload((n) => n + 1);
                }}
              >
                <IconRefresh />
                {t("retry")}
              </button>
            ) : null}
            <Link href={listHref} className="btn btn--pri btn--sm">
              {t("detail.back")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!seller) return null;

  const rated = hasRating(seller);
  const success = hasSuccess(seller);
  const place = [regionLabel(te, seller.region), seller.district && seller.district.toLowerCase() !== "demo" ? seller.district : ""].filter(Boolean).join(", ");
  const langs = Array.from(new Set(seller.languages.map((l) => langLabel(t, l))));
  const tiles: { k: string; v: string; sub?: string }[] = [
    { k: t("detail.stats.rating"), v: rated ? fmtRating(seller.rating, locale) : t("detail.newRating") },
    { k: t("detail.stats.reviews"), v: String(seller.reviewsCount) },
    { k: t("detail.stats.experience"), v: seller.experienceYears ? String(seller.experienceYears) : "—" },
    { k: t("detail.stats.cases"), v: seller.totalCases ? String(seller.totalCases) : "—" },
    { k: t("detail.stats.success"), v: success ? `${Math.round(seller.successRate)}%` : "—", sub: success ? undefined : t("detail.gathering") },
    { k: t("detail.stats.completed"), v: String(seller.completedOrders) },
  ];
  const facts: [string, string][] = [
    [t("detail.education"), seller.education],
    [t("detail.organization"), seller.organizationName],
    [t("detail.bar"), seller.barAssociation],
    [t("detail.license"), seller.licenseNumber],
  ].filter((f): f is [string, string] => !!f[1]);

  return (
    <section className="mk mk-prof">
      <Link href={listHref} className="mk-back">
        <IconChevronLeft />
        {t("detail.back")}
      </Link>

      <header className="mk-prof__hero">
        <div className="mk-hero__glow" aria-hidden="true" />
        <div className="mk-prof__id">
          <Monogram name={seller.name} rating={seller.rating} showRing={rated} size="lg" />
          <div className="mk-prof__who">
            <div className="mk-prof__tags">
              <span className={`mk-type mk-type--${seller.sellerType || "yurist"}`}>{sellerTypeLabel(t, seller.sellerType)}</span>
              {seller.verified ? (
                <span className="mk-verified mk-verified--glass">
                  <IconShieldCheck />
                  {t("card.verified")}
                </span>
              ) : null}
              {seller.promotion?.active ? <span className="mk-card__ad mk-card__ad--inline">{t("card.promoted")}</span> : null}
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

      <div className="mk-prof__body">
        <div className="mk-prof__main">
          <section className="mk-panel">
            <h2 className="mk-panel__t">{t("detail.services")}</h2>
            <p className="mk-panel__l">{t("detail.servicesLead")}</p>
            {services.length ? (
              <div className="mk-svcs" role="radiogroup" aria-label={t("detail.services")}>
                {services.map((svc) => {
                  const on = selected?.id === svc.id;
                  const eta = deliveryLabel(t, svc.deliveryMinutes);
                  return (
                    <div key={svc.id} className={`mk-svc${on ? " is-on" : ""}`}>
                      <button type="button" role="radio" aria-checked={on} className="mk-svc__pick" onClick={() => setPicked(svc.id)}>
                        <span className="mk-svc__radio" aria-hidden="true" />
                        <span className="mk-svc__txt">
                          <b>{svc.title}</b>
                          <span>
                            {svc.categoryTitle ? specLabel(te, svc.categoryTitle) : null}
                            {svc.categoryTitle && eta ? " · " : null}
                            {eta ? (
                              <span className="mk-eta">
                                <IconClock />
                                {eta}
                              </span>
                            ) : null}
                          </span>
                          {svc.experienceNote ? <i>{svc.experienceNote}</i> : null}
                        </span>
                      </button>
                      <div className="mk-svc__end">
                        <b>{svc.price > 0 ? fmtUzs(svc.price) : t("card.priceAsk")}</b>
                        <button type="button" className="btn btn--pri btn--sm" onClick={() => startBuy(svc)} disabled={!!blocked || svc.price <= 0}>
                          {t("detail.buy")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mk-empty mk-empty--flat">
                <IconBriefcase />
                <span>{t("detail.noServices")}</span>
              </div>
            )}
          </section>

          <section className="mk-panel">
            <h2 className="mk-panel__t">{t("detail.about")}</h2>
            <p className="mk-prof__bio">{seller.bio || t("detail.noBio")}</p>
            {seller.specializations.length ? (
              <>
                <h3 className="mk-panel__st">{t("detail.specializations")}</h3>
                <div className="mk-tags">
                  {seller.specializations.map((s) => (
                    <span key={s} className="mk-tag">
                      {specLabel(te, s)}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
            {facts.length ? (
              <dl className="mk-facts">
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          <section className="mk-panel">
            <h2 className="mk-panel__t">{t("detail.reviews")}</h2>
            {!reviewsReady ? (
              <div className="mk-review mk-review--ghost" aria-hidden="true" />
            ) : seller.reviews.length ? (
              <ul className="mk-reviews">
                {seller.reviews.map((r, i) => (
                  <li key={r.id || i} className="mk-review">
                    <div className="mk-review__h">
                      <b>{r.author || t("detail.anonymous")}</b>
                      <Stars value={r.rating} />
                      {r.createdAt ? <time>{dateOnly(r.createdAt, locale)}</time> : null}
                    </div>
                    {r.comment ? <p>{r.comment}</p> : null}
                    {r.reply ? (
                      <blockquote>
                        <small>{t("detail.sellerReply")}</small>
                        {r.reply}
                      </blockquote>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mk-empty mk-empty--flat">
                <IconStar />
                <b>{t("detail.noReviews")}</b>
                <span>{t("detail.noReviewsText")}</span>
              </div>
            )}
          </section>
        </div>

        <aside className="mk-side">
          <div className="mk-side__card">
            <small>{selected ? selected.title : t("detail.selectService")}</small>
            <b className="mk-side__price">
              {selected && selected.price > 0 ? fmtUzs(selected.price) : seller.priceFrom > 0 ? t("card.priceFrom", { price: fmtUzs(seller.priceFrom) }) : t("card.priceAsk")}
              {selected && selected.price > 0 ? <span> {te("currency")}</span> : null}
            </b>
            {selected && deliveryLabel(t, selected.deliveryMinutes) ? (
              <span className="mk-side__eta">
                <IconClock />
                {deliveryLabel(t, selected.deliveryMinutes)}
              </span>
            ) : null}
            {blocked ? (
              <p className="mk-side__block">
                <IconLock />
                {blocked}
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn--grad btn--full btn--lg"
              disabled={!selected || !!blocked || !ready || selected.price <= 0}
              onClick={() => selected && startBuy(selected)}
            >
              {ready && !session ? t("detail.loginToBuy") : t("detail.buy")}
              <IconArrowRight />
            </button>
            {variant !== "public" && !isSeller && !isStaff && !isOwn ? (
              <div className="mk-side__alts">
                <PrivateChatButton sellerUserId={seller.userId} returnPath={selfPath} />
                {session ? (
                  <Link href={`/portal/client/services?lawyer=${encodeURIComponent(seller.userId)}&name=${encodeURIComponent(seller.name)}`} className="btn btn--line btn--sm mk-side__alt">
                    <IconChat />
                    {t("detail.otherOrder")}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="mk-safe">
            <b>
              <IconShieldCheck />
              {t("detail.safeTitle")}
            </b>
            <ul>
              <li>{t("detail.safe1")}</li>
              <li>{t("detail.safe2")}</li>
              <li>{t("detail.safe3")}</li>
            </ul>
          </div>
        </aside>
      </div>

      <PurchaseDialog
        sellerUserId={seller.userId}
        sellerName={seller.name}
        service={buying}
        returnPath={`/portal/client/lawyers/${encodeURIComponent(userId)}`}
        onClose={() => setBuying(null)}
        onStale={(what) => {
          if (what === "service") refreshServices();
          else setReload((n) => n + 1);
        }}
      />
    </section>
  );
}
