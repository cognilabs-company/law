"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { fmtUzs } from "@/lib/money";
import { getPromotionAnalytics, getPromotionStatus, type PromotionAnalytics, type PromotionAnalyticsFilter, type PromotionPlacementKey, type PromotionStatus } from "@/lib/services/backend";
import { listManagedServices, parsePendingPromos, pendingPromoKey, pendingPromosRaw, promoSignalOf, subscribePendingPromos, type ManagedService } from "@/lib/services/sellerServices";
import type { PromotionPlacement } from "@/lib/services/promotions";
import { subscribeUserEvents } from "@/lib/userSocket";
import { IconArrowRight, IconChat, IconClock, IconEye, IconImage, IconRefresh, IconRocket, IconSearch, IconTag, IconTarget, IconUser } from "@/components/icons";
import { App, Banner, Field, Loading, Select, Tag, Tool, Toolbar, useOs } from "../kit/kit";
import { DateField } from "../kit/pickers";
import type { NativeProps } from "../native";
import PromoteDialog from "./promote/PromoteDialog";
import "./promotion.css";

// Promotion as a desktop program: where the seller is promoted now and
// for how long, a request waiting in Telegram, the three places to appear
// (each starts the promote dialog), and the reach — impressions, search
// appearances, clicks, contacts, the last two weeks as a chart — by type,
// service and dates.

const PLACES: { value: PromotionPlacement; key: PromotionPlacementKey; title: string; hint: string; icon: ReactNode }[] = [
  { value: "banner", key: "banner", title: "placementBanner", hint: "placementBannerHint", icon: <IconImage /> },
  { value: "profile_boost", key: "profile_boost", title: "placementProfile", hint: "placementProfileHint", icon: <IconUser /> },
  { value: "service_boost", key: "service_boost", title: "placementService", hint: "placementServiceHint", icon: <IconTag /> },
];
const DAY = 86400000;
const PROFILE_KEY = pendingPromoKey("profile");

export default function PromotionApp(_props: NativeProps) {
  void _props;
  const t = useTranslations("promotion");
  const ts = useTranslations("sellerServices.promote");
  const d = useTranslations("portal.desk.promo");
  const locale = useLocale();
  const os = useOs();
  const uid = useAuth().session?.id ?? "";
  const [status, setStatus] = useState<PromotionStatus | null>(null);
  const [stats, setStats] = useState<PromotionAnalytics | null>(null);
  const [services, setServices] = useState<ManagedService[]>([]);
  const [filter, setFilter] = useState<PromotionAnalyticsFilter>({});
  const [open, setOpen] = useState<PromotionPlacement | null>(null);
  const [tick, setTick] = useState(0);
  const raw = useSyncExternalStore(subscribePendingPromos, () => pendingPromosRaw(uid), () => "");
  const pending = useMemo(() => parsePendingPromos(raw)[PROFILE_KEY] ?? null, [raw]);
  const rangeBad = filter.dateFrom && filter.dateTo ? (Date.parse(filter.dateFrom) > Date.parse(filter.dateTo) ? "order" : (Date.parse(filter.dateTo) - Date.parse(filter.dateFrom)) / DAY > 90 ? "long" : "") : "";

  useEffect(() => {
    let alive = true;
    getPromotionStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => undefined);
    listManagedServices({ kind: "me" }, locale)
      .then((x) => alive && setServices(x.items))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tick, locale]);
  useEffect(() => {
    if (rangeBad) return;
    let alive = true;
    getPromotionAnalytics(filter)
      .then((a) => alive && setStats(a))
      .catch(() => alive && setStats({ impressions: 0, searchAppearances: 0, profileClicks: 0, contactRequests: 0, series: [] }));
    return () => {
      alive = false;
    };
  }, [filter, tick, rangeBad]);
  useEffect(() => subscribeUserEvents((ev) => promoSignalOf(ev) && setTick((n) => n + 1)), []);

  const profileDays = status?.byPlacement.profile_boost.active ? status.byPlacement.profile_boost.daysLeft : null;
  const series = stats?.series.slice(-14) ?? [];
  const peak = Math.max(1, ...series.map((s) => s.impressions));
  const tiles = stats
    ? [
        { v: stats.impressions, label: t("impressions"), icon: <IconEye /> },
        { v: stats.searchAppearances, label: t("searchAppearances"), icon: <IconSearch /> },
        { v: stats.profileClicks, label: t("profileClicks"), icon: <IconTarget /> },
        { v: stats.contactRequests, label: t("contactRequests"), icon: <IconChat /> },
      ]
    : [];

  return (
    <App name="promo">
      <Toolbar title={t("title")} subtitle={t("intro")}>
        <Tool icon={<IconRocket />} label={ts("titleAny")} primary onClick={() => setOpen("profile_boost")} />
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxr dx-scroll">
        {profileDays !== null ? (
          <Banner tone="ok" title={t("activeShort")}>
            {t("activeMsg", { days: profileDays })}
          </Banner>
        ) : null}
        {pending ? (
          <Banner tone="warn" title={t("pendingTitle")}>
            {t("pendingText")} {pending.packageTitle ? `· ${pending.packageTitle}` : ""} {pending.amount ? `· ${fmtUzs(pending.amount)} ${pending.currency}` : ""}
          </Banner>
        ) : null}

        <section aria-label={t("placesTitle")}>
          <h2 className="dxr-h">{t("placesTitle")}</h2>
          <div className="dxr-places">
            {PLACES.map((p) => {
              const st = status?.byPlacement[p.key];
              const state = st?.active ? "on" : st?.pending ? "wait" : "off";
              return (
                <button key={p.value} type="button" className={`dxr-place is-${state}`} onClick={() => setOpen(p.value)}>
                  <i aria-hidden>{p.icon}</i>
                  <b>{ts(p.title)}</b>
                  <span>{ts(p.hint)}</span>
                  <footer>
                    <Tag tone={state === "on" ? "ok" : state === "wait" ? "warn" : "neutral"}>
                      {state === "on" ? t("placeActive", { days: st?.daysLeft ?? 0, n: st?.active ?? 0 }) : state === "wait" ? t("placePending") : t("placeOff")}
                    </Tag>
                    <em>
                      {t("placeStart")}
                      <IconArrowRight aria-hidden />
                    </em>
                  </footer>
                </button>
              );
            })}
          </div>
          <p className="dxr-note">{t("boostNote")}</p>
        </section>

        <section aria-label={t("analyticsTitle")}>
          <h2 className="dxr-h">{t("analyticsTitle")}</h2>
          <div className="dxr-filters">
            <Field label={t("filterPlacement")}>
              <Select ariaLabel={t("filterPlacement")} value={filter.placement ?? ""} onChange={(v) => setFilter((f) => ({ ...f, placement: v as PromotionPlacementKey | "", serviceId: v === "service_boost" ? f.serviceId : "" }))} options={[{ value: "", label: t("filterAll") }, ...PLACES.map((p) => ({ value: p.key, label: ts(p.title) }))]} />
            </Field>
            {filter.placement === "service_boost" && services.length ? (
              <Field label={t("filterService")}>
                <Select ariaLabel={t("filterService")} value={filter.serviceId ?? ""} onChange={(v) => setFilter((f) => ({ ...f, serviceId: v }))} options={[{ value: "", label: t("filterAll") }, ...services.map((x) => ({ value: x.id, label: x.service.name }))]} />
              </Field>
            ) : null}
            <Field label={t("filterFrom")}>
              <DateField value={filter.dateFrom ?? ""} onChange={(v) => setFilter((f) => ({ ...f, dateFrom: v }))} ariaLabel={t("filterFrom")} clearable />
            </Field>
            <Field label={t("filterTo")}>
              <DateField value={filter.dateTo ?? ""} onChange={(v) => setFilter((f) => ({ ...f, dateTo: v }))} ariaLabel={t("filterTo")} clearable />
            </Field>
          </div>
          {rangeBad ? <Banner tone="err" title={t(rangeBad === "order" ? "filterOrder" : "filterLong")} /> : null}
          {stats === null ? (
            <Loading label={t("analyticsTitle")} />
          ) : (
            <>
              <div className="dxr-tiles">
                {tiles.map((x) => (
                  <div key={x.label} className="dxr-tile">
                    <i aria-hidden>{x.icon}</i>
                    <b>{fmtUzs(x.v) || "0"}</b>
                    <span>{x.label}</span>
                  </div>
                ))}
              </div>
              {series.length ? (
                <figure className="dxr-chart">
                  <figcaption>{t("impressionsTrend")}</figcaption>
                  <div className="dxr-bars" role="img" aria-label={t("impressionsTrend")}>
                    {series.map((s) => (
                      <span key={s.date} title={`${s.date}: ${s.impressions}`}>
                        <i style={{ height: `${Math.max(2, (s.impressions / peak) * 100)}%` }} />
                        <small>{s.date.slice(8, 10)}</small>
                      </span>
                    ))}
                  </div>
                </figure>
              ) : null}
            </>
          )}
        </section>
        {os === "win" ? null : <p className="dxr-note"><IconClock aria-hidden /> {ts("note")}</p>}
      </div>
      <PromoteDialog open={!!open} start={open ?? "profile_boost"} services={services.filter((x) => x.status === "active")} onClose={() => setOpen(null)} onSent={() => setTick((n) => n + 1)} />
    </App>
  );
}
