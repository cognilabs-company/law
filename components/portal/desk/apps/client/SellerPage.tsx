"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { dateOnly, fmtRating } from "@/lib/date";
import { regionLabel } from "@/lib/labels";
import { getMarketplaceSeller, getMarketplaceSellerServices, peekSeller, type MarketSellerDetail, type MarketService } from "@/lib/services/marketplace";
import { listActivePromotions } from "@/lib/services/promotions";
import { useRuntimeFacts } from "@/components/marketplace/runtime/useRuntimeFacts";
import { checklistOf, durationParts, guaranteesOf, requirementInfo } from "@/components/marketplace/runtime/facts";
import { useDurationText } from "@/components/marketplace/runtime/DurationChip";
import { categoryLabel, deliveryLabel, langLabel, specLabel } from "@/components/marketplace/bits";
import { IconAlert, IconArrowRight, IconBriefcase, IconCheck, IconClock, IconGlobe, IconLock, IconMapPin, IconRefresh, IconShieldCheck, IconStarRate } from "@/components/icons";
import { App, Avatar, Btn, Empty, Loading, Tag, Tool, Toolbar, useOs } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { StarsView } from "./bits";
import PurchaseSheet from "./Purchase";

// A specialist's page as a desktop program — the Mac App Store's product
// page, the Microsoft Store's: who they are and their numbers up top, the
// services to pick from with what each includes, their about and reviews;
// on the right the chosen service's price, its term and the guarantees,
// and "Order", which opens the purchase sheet over this window.

type Status = "loading" | "ready" | "notfound" | "error";

export default function SellerPage({ base, openApp, openLink, onRoute, route, userId }: NativeProps & { userId: string }) {
  const t = useTranslations("marketplace");
  const te = useTranslations("enums");
  const rt = useTranslations("marketplace.runtime");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const os = useOs();
  const durText = useDurationText();
  const session = useAuth().session;
  const [seller, setSeller] = useState<MarketSellerDetail | null>(() => {
    const s = peekSeller(userId);
    return s ? { ...s, reviews: [] } : null;
  });
  const [status, setStatus] = useState<Status>(() => (peekSeller(userId) ? "ready" : "loading"));
  const [reviewsReady, setReviewsReady] = useState(false);
  const [services, setServices] = useState<MarketService[]>(() => peekSeller(userId)?.services ?? []);
  // The service picked, first from the link (an order asked from the
  // directory or a notification), then by the client.
  const [picked, setPicked] = useState(() => new URLSearchParams(route.split("?")[1] ?? "").get("buy") ?? "");
  const [buying, setBuying] = useState<MarketService | null>(null);
  const [autoBuy, setAutoBuy] = useState(() => !!new URLSearchParams(route.split("?")[1] ?? "").get("buy"));
  const [reload, setReload] = useState(0);
  const [top, setTop] = useState<{ profile: boolean; ids: Set<string> }>({ profile: false, ids: new Set() });

  useEffect(() => {
    let alive = true;
    getMarketplaceSeller(userId)
      .then((x) => {
        if (!alive) return;
        setSeller(x);
        setServices((cur) => (x.services.length ? x.services : cur));
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
  useEffect(() => {
    const c = new AbortController();
    listActivePromotions({ sellerUserId: userId, limit: 5 }, c.signal)
      .then((list) => {
        const mine = list.filter((p) => !p.sellerUserId || p.sellerUserId === userId);
        if (!c.signal.aborted) setTop({ profile: mine.some((p) => p.placement === "profile_boost" || p.placement === "banner"), ids: new Set(mine.filter((p) => p.serviceId).map((p) => p.serviceId)) });
      })
      .catch(() => undefined);
    return () => c.abort();
  }, [userId]);
  const refreshServices = useCallback(() => {
    getMarketplaceSellerServices(userId)
      .then((list) => {
        setServices(list);
        setPicked((p) => (list.some((x) => x.id === p) ? p : ""));
      })
      .catch((e) => e instanceof ApiError && e.status === 404 && setStatus("notfound"));
  }, [userId]);
  useEffect(() => {
    refreshServices();
  }, [refreshServices]);

  const isSeller = !!session && session.role !== "client";
  const isOwn = !!session && session.id === userId;
  const blocked = !seller ? "" : isOwn ? t("detail.blockedOwn") : isSeller ? t("detail.blockedSeller") : !seller.verified ? t("detail.blockedUnverified") : !seller.available ? t("detail.blockedBusy") : "";
  const selected = useMemo(() => services.find((s) => s.id === picked) ?? services[0] ?? null, [services, picked]);
  const facts = useRuntimeFacts(selected?.id ?? "", "service_detail", { enabled: !!selected });
  const cfg = facts.config;
  const dur = cfg && durationParts(cfg.duration) ? cfg.duration : null;
  const guarantees = guaranteesOf(cfg);
  const checklist = checklistOf(cfg);
  const req = requirementInfo(cfg?.minimumRequirements);
  const buy = (svc: MarketService) => !blocked && svc.price > 0 && setBuying(svc);

  // An order asked for in the link opens its sheet once the page is in.
  useEffect(() => {
    if (!autoBuy || !seller || !services.length) return;
    const svc = services.find((s) => s.id === picked);
    const h = setTimeout(() => {
      setAutoBuy(false);
      onRoute(`${base}/lawyers/${encodeURIComponent(userId)}`);
      if (svc && !blocked && svc.price > 0) setBuying(svc);
    }, 0);
    return () => clearTimeout(h);
  }, [autoBuy, seller, services, picked, blocked, base, userId, onRoute]);

  const back = { label: d("back"), onClick: () => openApp("lawyers", `${base}/lawyers`) };
  if (status === "loading" || status === "notfound" || (status === "error" && !seller) || !seller) {
    return (
      <App name="clawyer">
        <Toolbar title={d("profile")} back={back} />
        {status === "loading" ? (
          <Loading label={t("detail.loading")} />
        ) : (
          <Empty
            icon={<IconAlert />}
            title={status === "notfound" ? t("detail.notFound") : t("error")}
            text={status === "notfound" ? t("detail.notFoundText") : undefined}
            action={status === "error" ? <Btn icon={<IconRefresh />} onClick={() => (setStatus("loading"), setReload((n) => n + 1))}>{t("retry")}</Btn> : <Btn onClick={back.onClick}>{t("detail.back")}</Btn>}
          />
        )}
      </App>
    );
  }

  const typeName = t.has(`roles.${seller.sellerType}`) ? t(`roles.${seller.sellerType}`) : seller.sellerType;
  const place = [seller.region ? regionLabel(te, seller.region) : "", seller.district && seller.district.toLowerCase() !== "demo" ? seller.district : ""].filter(Boolean).join(", ");
  const langs = [...new Set(seller.languages.map((l) => langLabel(t, l)))];
  const rated = seller.reviewsCount > 0;
  const stats: [string, string][] = [
    [t("detail.stats.rating"), rated ? fmtRating(seller.rating, locale) : t("detail.newRating")],
    [t("detail.stats.reviews"), String(seller.reviewsCount)],
    [t("detail.stats.experience"), seller.experienceYears ? String(seller.experienceYears) : "—"],
    [t("detail.stats.cases"), seller.totalCases ? String(seller.totalCases) : "—"],
    [t("detail.stats.success"), seller.successRate > 0 ? `${Math.round(seller.successRate)}%` : "—"],
    [t("detail.stats.completed"), String(seller.completedOrders)],
  ];
  const about: [string, string][] = (
    [
      // Public facts only; no license number or education (see MarketSeller).
      [t("detail.organization"), seller.organizationName],
      [t("detail.bar"), seller.barAssociation],
    ] as [string, string][]
  ).filter((f) => !!f[1]);
  const price = selected && selected.price > 0 ? `${fmtUzs(selected.price)} ${te("currency")}` : seller.priceFrom > 0 ? t("card.priceFrom", { price: fmtUzs(seller.priceFrom) }) : t("card.priceAsk");
  const term = dur ? durText(dur) : selected ? deliveryLabel(t, selected.deliveryMinutes) : "";

  return (
    <App name="clawyer">
      <Toolbar title={os === "mac" ? seller.name : d("profile")} subtitle={os === "mac" ? typeName : undefined} back={back}>
        <Tool icon={<IconRefresh />} label={t("retry")} onClick={() => (setReload((n) => n + 1), refreshServices())} />
      </Toolbar>
      <div className="dxcs dx-scroll">
        <header className="dxcs-hero">
          <Avatar name={seller.name || "?"} size={os === "mac" ? 104 : 88} />
          <div className="dxcs-hero__who">
            <h1>
              {seller.name}
              {seller.verified ? <IconShieldCheck className="dxcl-ok" aria-label={d("verified")} /> : null}
            </h1>
            <span className="dxcs-hero__sub">{[typeName, seller.organizationName].filter(Boolean).join(" · ")}</span>
            <span className="dxcs-hero__meta">
              {rated ? (
                <span>
                  <StarsView value={seller.rating} small /> {fmtRating(seller.rating, locale)} · {t("card.reviews", { count: seller.reviewsCount })}
                </span>
              ) : (
                <span>{t("detail.newRating")}</span>
              )}
              {place ? (
                <span>
                  <IconMapPin aria-hidden /> {place}
                </span>
              ) : null}
              {langs.length ? (
                <span>
                  <IconGlobe aria-hidden /> {langs.join(", ")}
                </span>
              ) : null}
            </span>
            <span className="dxcw-tags">
              {seller.verified ? <Tag tone="ok">{d("verified")}</Tag> : null}
              {seller.onlineNow ? <Tag tone="info">{d("online")}</Tag> : null}
              {seller.promotion?.active || seller.isSponsored || top.profile ? <Tag tone="accent">{t("card.promoted")}</Tag> : null}
            </span>
          </div>
          <div className="dxcs-hero__buy">
            <Btn kind="primary" icon={<IconArrowRight />} disabled={!selected || !!blocked || selected.price <= 0} onClick={() => selected && buy(selected)}>
              {t("detail.buy")}
            </Btn>
            <small>{price}</small>
          </div>
        </header>

        <dl className="dxcs-stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="dxcs-cols">
          <div className="dxcs-main">
            <section className="dxcs-box">
              <h2>{t("detail.services")}</h2>
              <p className="dxcs-lead">{t("detail.servicesLead")}</p>
              {services.length ? (
                <ul className="dxcs-svcs" role="radiogroup" aria-label={t("detail.services")}>
                  {services.map((svc) => {
                    const on = selected?.id === svc.id;
                    return (
                      <li key={svc.id} className={on ? "is-on" : ""}>
                        <button type="button" role="radio" aria-checked={on} className="dxcs-svc" onClick={() => setPicked(svc.id)} onDoubleClick={() => buy(svc)}>
                          <i aria-hidden>{on ? <IconCheck /> : null}</i>
                          <span>
                            <b>
                              {svc.title}
                              {svc.isSponsored || top.ids.has(svc.id) ? <Tag tone="accent">{t("card.promoted")}</Tag> : null}
                            </b>
                            <small>{[svc.categoryTitle ? categoryLabel(te, svc.categoryTitle, locale) : "", deliveryLabel(t, svc.deliveryMinutes)].filter(Boolean).join(" · ")}</small>
                          </span>
                          <em>{svc.price > 0 ? fmtUzs(svc.price) : t("card.priceAsk")}</em>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty icon={<IconBriefcase />} title={t("detail.noServices")} />
              )}
            </section>

            {selected && cfg && (cfg.usageSteps.length || checklist.length || req) ? (
              <section className="dxcs-box">
                <h2>{rt("factsTitle", { service: selected.title })}</h2>
                {cfg.usageSteps.length ? (
                  <>
                    <h3>{rt("stepsTitle")}</h3>
                    <ol className="dxcs-steps">
                      {cfg.usageSteps.map((s, i) => (
                        <li key={i}>
                          <i>{i + 1}</i>
                          <span>
                            {s.title ? <b>{s.title}</b> : null}
                            {s.text ? <small>{s.text}</small> : null}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : null}
                {checklist.length ? (
                  <>
                    <h3>{rt("checklistTitle")}</h3>
                    <ul className="dxcl-why dxcs-check">
                      {checklist.map((c) => (
                        <li key={c.id || c.title}>
                          <IconCheck aria-hidden /> {c.title}
                          {c.required ? <em>{rt("checklistRequired")}</em> : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {req ? (
                  <>
                    <h3>{rt("reqTitle")}</h3>
                    <p className="dxcs-lead">{rt("reqLead")}</p>
                    <span className="dxcw-tags">
                      {req.verified ? <Tag>{rt("reqVerified")}</Tag> : null}
                      {req.years ? <Tag>{rt("reqExperience", { n: req.years })}</Tag> : null}
                      {req.rating ? <Tag>{rt("reqRating", { r: fmtRating(req.rating, locale) })}</Tag> : null}
                    </span>
                  </>
                ) : null}
              </section>
            ) : null}

            <section className="dxcs-box">
              <h2>{t("detail.about")}</h2>
              <p className="dxcs-bio">{seller.bio || t("detail.noBio")}</p>
              {seller.specializations.length ? (
                <>
                  <h3>{t("detail.specializations")}</h3>
                  <span className="dxcw-tags">
                    {seller.specializations.map((s) => (
                      <Tag key={s}>{specLabel(te, s)}</Tag>
                    ))}
                  </span>
                </>
              ) : null}
              {about.length ? (
                <dl className="dxcs-facts">
                  {about.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>

            <section className="dxcs-box">
              <h2>
                {t("detail.reviews")}
                {rated ? <small>{fmtRating(seller.rating, locale)} · {seller.reviewsCount}</small> : null}
              </h2>
              {!reviewsReady ? (
                <Loading label={t("detail.reviews")} />
              ) : seller.reviews.length ? (
                <ul className="dxcs-reviews">
                  {seller.reviews.map((r, i) => (
                    <li key={r.id || i}>
                      <header>
                        <Avatar name={r.author || "?"} size={28} />
                        <b>{r.author || t("detail.anonymous")}</b>
                        <StarsView value={r.rating} small />
                        {r.createdAt ? <time>{dateOnly(r.createdAt, locale)}</time> : null}
                      </header>
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
                <Empty icon={<IconStarRate />} title={t("detail.noReviews")} text={t("detail.noReviewsText")} />
              )}
            </section>
          </div>

          <aside className="dxcs-side">
            <section className="dxcs-box dxcs-buy">
              <small>{selected ? selected.title : t("detail.selectService")}</small>
              <b>{price}</b>
              {term ? (
                <span className="dxcp-eta">
                  <IconClock aria-hidden /> {term}
                </span>
              ) : null}
              {blocked ? (
                <p className="dxcs-block">
                  <IconLock aria-hidden /> {blocked}
                </p>
              ) : null}
              <Btn kind="primary" icon={<IconArrowRight />} disabled={!selected || !!blocked || selected.price <= 0} onClick={() => selected && buy(selected)}>
                {t("detail.buy")}
              </Btn>
            </section>
            <section className="dxcs-box dxcs-safe">
              <h3>
                <IconShieldCheck aria-hidden /> {guarantees.length ? rt("guaranteesTitle") : t("detail.safeTitle")}
              </h3>
              <ul>
                {guarantees.length
                  ? guarantees.map((g, i) => (
                      <li key={g.id || i}>
                        <b>{g.title}</b>
                        {g.description ? <small>{g.description}</small> : null}
                      </li>
                    ))
                  : [t("detail.safe1"), t("detail.safe2"), t("detail.safe3")].map((s) => <li key={s}>{s}</li>)}
              </ul>
            </section>
          </aside>
        </div>
      </div>
      {buying ? (
        <PurchaseSheet
          sellerUserId={seller.userId}
          sellerName={seller.name}
          service={buying}
          openLink={openLink}
          onClose={() => setBuying(null)}
          onStale={(what) => (what === "service" ? refreshServices() : setReload((n) => n + 1))}
        />
      ) : null}
    </App>
  );
}
