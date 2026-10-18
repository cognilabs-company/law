"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth, hasAdminAccess } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { dateOnly } from "@/lib/date";
import { setReturnTo } from "@/lib/returnTo";
import {
  getMarketplaceSeller,
  getMarketplaceSellerServices,
  peekSeller,
  type MarketPromotionSurface,
  type MarketSellerDetail,
  type MarketService,
} from "@/lib/services/marketplace";
import { listActivePromotions } from "@/lib/services/promotions";
import { IconArrowRight, IconChevronLeft, IconClock, IconLock, IconRefresh, IconShieldCheck, IconStar, IconBriefcase } from "@/components/icons";
import PurchaseDialog from "./PurchaseDialog";
import PricingExplainer from "./PricingExplainer";
import { Stars, deliveryLabel } from "./bits";
import { SellerAbout, SellerHero, SellerServiceRow } from "./SellerParts";
import { aiId } from "@/lib/ai/ids";
import { PH_SERVICE_ID, type ProfilePreview } from "@/lib/marketPreview";
import { useAiModal, useAiSelection } from "@/lib/ai/registry";
import { useRuntimeFacts } from "./runtime/useRuntimeFacts";
import { durationParts, guaranteesOf } from "./runtime/facts";
import { DurationChip } from "./runtime/DurationChip";
import { GuaranteeList } from "./runtime/Guarantees";
import { ServiceFacts, ServiceFactsSkeleton } from "./runtime/ServiceFacts";

type Status = "loading" | "ready" | "notfound" | "error";

export default function SellerProfile({ userId, variant, preview }: { userId: string; variant: "public" | "portal"; preview?: ProfilePreview }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const rt = useTranslations("marketplace.runtime");
  const locale = useLocale();
  const router = useRouter();
  const { session: signedIn, ready } = useAuth();
  const session = preview ? null : signedIn;
  const live = !preview;
  const listHref = variant === "portal" ? "/portal/client/lawyers" : "/lawyers";

  const [loadedSeller, setSeller] = useState<MarketSellerDetail | null>(() => {
    const s = peekSeller(userId);
    return s ? { ...s, reviews: [] } : null;
  });
  const [loadStatus, setStatus] = useState<Status>(() => (peekSeller(userId) ? "ready" : "loading"));
  const [loadedReviews, setReviewsReady] = useState(false);
  const [loadedServices, setServices] = useState<MarketService[]>(() => peekSeller(userId)?.services ?? []);
  const [chosen, setPicked] = useState("");
  const seller = preview ? preview.seller : loadedSeller;
  const status: Status = preview ? "ready" : loadStatus;
  const reviewsReady = preview ? true : loadedReviews;
  const services = preview ? preview.services : loadedServices;
  const picked = preview ? preview.picked : chosen;
  const [buying, setBuying] = useState<MarketService | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!live) return;
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
  }, [userId, reload, live]);

  const [activePromos, setActivePromos] = useState<MarketPromotionSurface[]>([]);
  useEffect(() => {
    if (!live) return;
    const ctl = new AbortController();
    listActivePromotions({ sellerUserId: userId, limit: 5 }, ctl.signal)
      .then((list) => {
        if (!ctl.signal.aborted) setActivePromos(list.filter((p) => !p.sellerUserId || p.sellerUserId === userId));
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [userId, live]);
  const topServiceIds = useMemo(
    () => new Set(preview ? [preview.topServiceId].filter(Boolean) : activePromos.filter((p) => p.serviceId).map((p) => p.serviceId)),
    [activePromos, preview],
  );
  const profileTop = preview ? preview.top : activePromos.some((p) => p.placement === "profile_boost" || p.placement === "banner");

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
    if (live) refreshServices();
  }, [refreshServices, live]);

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
  const detail = useRuntimeFacts(selected?.id ?? "", "service_detail", { enabled: live && !!selected && selected.id !== PH_SERVICE_ID });
  const detailDur = durationParts(detail.config?.duration) ? (detail.config?.duration ?? null) : null;
  const guarantees = guaranteesOf(detail.config);

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
    const h = setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("buy");
      window.history.replaceState(window.history.state, "", url.toString());
      setAutoBuy(id);
    }, 0);
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

  useAiSelection(seller ? "service_id" : "", selected?.id);
  useAiModal("marketplace.purchase-modal", () => {
    if (!ready || !session || blocked || !selected || selected.price <= 0) return;
    setBuying(selected);
  });

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

  const sellerAiId = aiId("marketplace.seller", seller.userId);

  return (
    <section className="mk mk-prof">
      <Link href={listHref} className="mk-back">
        <IconChevronLeft />
        {t("detail.back")}
      </Link>

      <SellerHero seller={seller} top={profileTop} />

      <div className="mk-prof__body">
        <div className="mk-prof__main">
          <section className="mk-panel" data-ai-target="marketplace:seller-services" data-ai-id={`${sellerAiId}.services`} data-ai-type="list">
            <div className="mkpx-row">
              <h2 className="mk-panel__t">{t("detail.services")}</h2>
              {services.length && selected?.id !== PH_SERVICE_ID ? <PricingExplainer service={selected} factors={detail.config?.pricing.factors} aiId={`${sellerAiId}.price-info`} /> : null}
            </div>
            <p className="mk-panel__l">{t("detail.servicesLead")}</p>
            {services.length ? (
              <>
                <div className="mk-svcs" role="radiogroup" aria-label={t("detail.services")}>
                  {services.map((svc) => (
                    <SellerServiceRow
                      key={svc.id}
                      svc={svc}
                      sellerUserId={seller.userId}
                      on={selected?.id === svc.id}
                      top={svc.isSponsored || topServiceIds.has(svc.id)}
                      buyDisabled={!!blocked || svc.price <= 0}
                      onPick={() => setPicked(svc.id)}
                      ph={preview?.ph && svc.id === PH_SERVICE_ID ? preview.ph : undefined}
                      onBuy={() => startBuy(svc)}
                      runtime={live && svc.id !== PH_SERVICE_ID}
                    />
                  ))}
                </div>
                {selected && detail.state === "loading" ? (
                  <ServiceFactsSkeleton label={rt("factsLoading")} />
                ) : selected && detail.config ? (
                  <ServiceFacts
                    key={selected.id}
                    config={detail.config}
                    tone="detail"
                    title={rt("factsTitle", { service: selected.title })}
                    basePrice={detail.config.pricing.recommendedPrice > 0 ? detail.config.pricing.recommendedPrice : selected.price}
                    currency={selected.currency}
                    aiId={`${sellerAiId}.service-facts`}
                  />
                ) : null}
              </>
            ) : (
              <div className="mk-empty mk-empty--flat">
                <IconBriefcase />
                <span>{t("detail.noServices")}</span>
              </div>
            )}
          </section>

          <SellerAbout seller={seller} />

          <section className="mk-panel" data-ai-target="marketplace:seller-reviews" data-ai-id={`${sellerAiId}.reviews`} data-ai-type="list">
            <h2 className="mk-panel__t">{t("detail.reviews")}</h2>
            {!reviewsReady ? (
              <div className="mk-review mk-review--ghost" aria-hidden="true" />
            ) : seller.reviews.length ? (
              <ul className="mk-reviews" data-ai-private>
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
          <div className="mk-side__card" data-ai-target="marketplace:buy-box" data-ai-id={`${sellerAiId}.buy-box`} data-ai-type="section">
            <small>{selected ? selected.title : t("detail.selectService")}</small>
            <b className="mk-side__price">
              {selected && selected.price > 0 ? fmtUzs(selected.price) : seller.priceFrom > 0 ? t("card.priceFrom", { price: fmtUzs(seller.priceFrom) }) : t("card.priceAsk")}
              {selected && selected.price > 0 ? <span> {te("currency")}</span> : null}
            </b>
            {detailDur ? (
              <DurationChip duration={detailDur} tone="side" start />
            ) : selected && deliveryLabel(t, selected.deliveryMinutes) ? (
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
              data-ai-id={`${sellerAiId}.buy`}
              data-ai-entity-type={selected ? "marketplace_service" : undefined}
              data-ai-entity-id={selected?.id}
            >
              {ready && !session ? t("detail.loginToBuy") : t("detail.buy")}
              <IconArrowRight />
            </button>
          </div>
          <div className="mk-safe" data-ai-target="marketplace:safe-deal" data-ai-id="marketplace.safe-deal" data-ai-type="section">
            {guarantees.length ? (
              <>
                <b>
                  <IconShieldCheck />
                  {rt("guaranteesTitle")}
                </b>
                <GuaranteeList items={guarantees} tone="side" />
              </>
            ) : (
              <>
                <b>
                  <IconShieldCheck />
                  {t("detail.safeTitle")}
                </b>
                <ul>
                  <li>{t("detail.safe1")}</li>
                  <li>{t("detail.safe2")}</li>
                  <li>{t("detail.safe3")}</li>
                </ul>
              </>
            )}
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
