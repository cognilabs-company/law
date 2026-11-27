"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { getPromotionStatus, getPromotionAnalytics, type PromotionAnalytics, type PromotionAnalyticsFilter, type PromotionPlacementKey } from "@/lib/services/backend";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  dropPendingPromos,
  parsePendingPromos,
  pendingPromoKey,
  pendingPromosRaw,
  subscribePendingPromos,
  type ManagedServices,
  type ServiceScope,
} from "@/lib/services/sellerServices";
import { listPromotionPackages, promotionCheckoutSignal, type PromotionPlacement } from "@/lib/services/promotions";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import PromoteServicesSection from "@/components/services/PromoteServicesSection";
import PromoteModal from "@/components/services/PromoteModal";
import { IconRocket, IconEye, IconSearch, IconTarget, IconChat, IconClock, IconArrowRight, IconAlert } from "@/components/icons";
import { PlacementSketch } from "@/components/services/bits";
import "@/components/portal/dash/seller1920.css";
import "@/components/portal/pdf1920.css";
import { TrendingUpIcon } from "lucide-react";

const PROFILE_KEY = pendingPromoKey("profile");
const ME: ServiceScope = { kind: "me" };
// The three placements of 10-09 §1, each opening the promote dialog on it.
const PLACES: { value: PromotionPlacement; title: string; hint: string }[] = [
  { value: "banner", title: "placementBanner", hint: "placementBannerHint" },
  { value: "profile_boost", title: "placementProfile", hint: "placementProfileHint" },
  { value: "service_boost", title: "placementService", hint: "placementServiceHint" },
];

const som = (n: number) => (n ? fmtUzs(n) : "0");
const EMPTY_ANALYTICS: PromotionAnalytics = { impressions: 0, searchAppearances: 0, profileClicks: 0, contactRequests: 0, series: [] };
const dayMs = 86400000;
function rangeProblem(from?: string, to?: string): "" | "order" | "long" {
  if (!from || !to) return "";
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  if (a > b) return "order";
  return (b - a) / dayMs > 90 ? "long" : "";
}

export default function PromotionPanel() {
  const t = useTranslations("promotion");
  const ts = useTranslations("sellerServices");
  const [reloadKey, setReloadKey] = useState(0);
  const status = useResourceOne(getPromotionStatus, [reloadKey]);
  const [filter, setFilter] = useState<PromotionAnalyticsFilter>({});
  const filterKey = JSON.stringify(filter);
  const rangeBad = rangeProblem(filter.dateFrom, filter.dateTo);
  const analytics = useResourceOne<PromotionAnalytics>(() => (rangeBad ? Promise.resolve(EMPTY_ANALYTICS) : getPromotionAnalytics(filter)), [reloadKey, filterKey]);
  const [open, setOpen] = useState<PromotionPlacement | null>(null);
  // A promotion request refused with 403: the start / new-checkout actions
  // leave; status and analytics stay readable.
  const [denied, setDenied] = useState("");
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const role = session?.role === "lawyer" ? "lawyer" : "advocate";
  const [svc, setSvc] = useState<ManagedServices | null>(null);
  const pendingRaw = useSyncExternalStore(subscribePendingPromos, () => pendingPromosRaw(uid), () => "");
  const pending = useMemo(() => parsePendingPromos(pendingRaw)[PROFILE_KEY] ?? null, [pendingRaw]);
  const [maxReach, setMaxReach] = useState(0);
  const [lapse, setLapse] = useState<"campaign" | "cancelled" | null>(null);
  const lastPlace = useRef<PromotionPlacement>("profile_boost");

  useEffect(() => {
    const c = new AbortController();
    listPromotionPackages(undefined, c.signal)
      .then((catalog) => {
        if (!c.signal.aborted) setMaxReach(catalog.items.reduce((m, x) => (x.reach > m ? x.reach : m), 0));
      })
      .catch(() => {});
    return () => c.abort();
  }, []);

  useEffect(() => {
    if (!uid) return;
    return subscribeUserEvents((ev) => {
      const s = promotionCheckoutSignal(ev);
      if (!s || s.kind === "pending" || s.serviceId) return;
      const out = dropPendingPromos(uid, (k, p) => k === PROFILE_KEY && (!s.ids.length || !p.requestId || s.ids.includes(p.requestId)));
      if (out.length) {
        if (s.kind === "approved") toast(ts("toast.profileApproved"), { tone: "ok" });
        else if (s.lapsed) toast(ts("toast.campaignEnded"), { tone: "err" });
        else toast(ts(s.kind === "cancelled" ? "toast.cancelled" : "toast.profileRejected"), { tone: "err" });
        setLapse(s.kind === "approved" ? null : s.lapsed ? "campaign" : s.kind === "cancelled" ? "cancelled" : null);
      }
      setReloadKey((n) => n + 1);
    });
  }, [uid, ts]);

  useEffect(() => {
    if (!uid) return;
    let had = Boolean(parsePendingPromos(pendingPromosRaw(uid))[PROFILE_KEY]);
    return subscribePendingPromos(() => {
      const has = Boolean(parsePendingPromos(pendingPromosRaw(uid))[PROFILE_KEY]);
      if (had && !has) setReloadKey((n) => n + 1);
      had = has;
    });
  }, [uid]);

  const a = analytics.data;
  const st = status.data;
  const boost = svc?.items.find((x) => x.profileBoost)?.profileBoost ?? null;
  const profileLive = st?.byPlacement.profile_boost;
  const profileDays = boost ? boost.daysLeft : profileLive && profileLive.active > 0 ? profileLive.daysLeft : null;
  const placeState = (key: PromotionPlacementKey) => (st?.byPlacement[key].active ? " is-on" : st?.byPlacement[key].pending ? " is-wait" : "");
  const placeLine = (key: PromotionPlacementKey) => {
    const p = st?.byPlacement[key];
    return p?.active ? t("placeActive", { days: p.daysLeft, n: p.active }) : p?.pending ? t("placePending") : t("placeOff");
  };

  return (
    <div className="promo promo--compact lxp promop">
      {/* Rebuilt in the dashboard's language (owner's PDF 2026-11-27, K7):
          the reach numbers as KPI tiles, the ad types in the main card and
          the analytics filter in the right column. */}
      {profileDays !== null ? (
        <div className="promo__active">
          <IconRocket />
          {t("activeMsg", { days: profileDays })}
        </div>
      ) : null}

      <div className="lxs-kpis lxp-kpis" data-ai-target="promotion:analytics">
        {[
          { v: a?.impressions, label: t("impressions"), Icon: IconEye },
          { v: a?.searchAppearances, label: t("searchAppearances"), Icon: IconSearch },
          { v: a?.profileClicks, label: t("profileClicks"), Icon: IconTarget },
          { v: a?.contactRequests, label: t("contactRequests"), Icon: IconChat },
        ].map((c, k) => (
          <div className={`lxs-kpi is-static${k === 0 ? " lxs-kpi--pri" : ""}`} key={c.label}>
            <span className="lxs-kpi__top"><span className="lxs-kpi__ic"><c.Icon /></span></span>
            <span className="lxs-kpi__l">{c.label}</span>
            <b className="lxs-kpi__v sx-num">{analytics.status === "loading" ? "…" : som(c.v ?? 0)}</b>
          </div>
        ))}
      </div>
      <div className="lxs-grid lxp-grid">
        <section className="lx-card lxp-main" data-ai-target="promotion:packages" aria-labelledby="promop-h">
          <div className="lxs-h">
            <span className="lxs-h__ic"><IconRocket /></span>
            <div className="lxs-h__t">
              <h2 id="promop-h">{t("title")}</h2>
              <small>{t("intro")}</small>
            </div>
          </div>
          <p className="promo__boost promop__boost" data-ai-id="promotion.multiplier">
            <TrendingUpIcon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>
              <b>{t("multiplier")}</b>
              {maxReach > 1 ? <span className="promo__boostx">{t("multiplierUpTo", { x: maxReach })}</span> : null}
            </span>
          </p>
          <h3 className="lxs-h3 promop__sub">{t("placesTitle")}</h3>

        {/* A checkout waiting for its Click or ATMOS payment (2026-11-21
            contract §1.3): it switches on when the provider confirms. */}
        {denied ? (
          <div className="promo__lapse" role="alert">
            <b>
              <IconAlert aria-hidden="true" />
              {denied}
            </b>
          </div>
        ) : null}

        {lapse && !pending && !denied ? (
          <div className="promo__lapse" role="alert" data-ai-id="promotion.checkout-lapsed">
            <b>
              <IconAlert aria-hidden="true" />
              {t("lapsedTitle")}
            </b>
            <p>{t(lapse === "campaign" ? "lapsedText" : "cancelledText")}</p>
            <div className="promo__lapseacts">
              <button
                type="button"
                className="btn btn--grad btn--sm"
                onClick={() => {
                  setLapse(null);
                  setOpen(lastPlace.current);
                }}
                data-ai-id="promotion.checkout-lapsed.new"
                data-ai-type="button"
                data-ai-label={t("newCheckout")}
              >
                {t("newCheckout")}
              </button>
              <button type="button" className="btn btn--line btn--sm" onClick={() => setLapse(null)} data-ai-id="promotion.checkout-lapsed.dismiss" data-ai-type="button" data-ai-label={t("dismiss")}>
                {t("dismiss")}
              </button>
            </div>
          </div>
        ) : null}

        {pending ? (
          <div className="promo__pend" role="status">
            <b><IconClock />{t("pendingTitle")}</b>
            <p>{t("pendingText")}</p>
            {pending.packageTitle ? <span className="wid">{pending.packageTitle}</span> : null}
            {pending.amount ? <span className="promo__pendamt">{fmtUzs(pending.amount)} {pending.currency}</span> : null}
            <small className="promo__tgok">{t("pendingPayment")}</small>
          </div>
        ) : null}

        <div className="promo__places">
          {PLACES.map((p) => {
            const body = (
              <>
                <PlacementSketch placement={p.value} />
                <b>{ts(`promote.${p.title}`)}</b>
                <span>{ts(`promote.${p.hint}`)}</span>
                {st ? <small className="promo__placest">{placeLine(p.value)}</small> : null}
                {denied ? null : (
                  <span className="promo__placego">
                    {t("placeStart")}
                    <IconArrowRight aria-hidden="true" />
                  </span>
                )}
              </>
            );
            return denied ? (
              <div key={p.value} className={`promo__place${placeState(p.value)}`} style={{ cursor: "default", transform: "none" }}>
                {body}
              </div>
            ) : (
              <button key={p.value} type="button" className={`promo__place${placeState(p.value)}`} onClick={() => { lastPlace.current = p.value; setOpen(p.value); }} data-ai-id={`promotion.place.${p.value}`} data-ai-type="button" data-ai-label={ts(`promote.${p.title}`)}>
                {body}
              </button>
            );
          })}
        </div>
        <p className="promo__note">{t("boostNote")}</p>
        </section>
        <aside className="lxs-col">
          <section className="lx-card lxp-rail">
            <h2 className="lxs-h3">{t("analyticsTitle")}</h2>
        <div className="promo__filters">
          <label>
            <span>{t("filterPlacement")}</span>
            <Select
              value={filter.placement ?? ""}
              onChange={(v) => setFilter((f) => ({ ...f, placement: v as PromotionPlacementKey | "", serviceId: v === "service_boost" ? f.serviceId : "" }))}
              options={[{ value: "", label: t("filterAll") }, ...PLACES.map((p) => ({ value: p.value, label: ts(`promote.${p.title}`) }))]}
              ariaLabel={t("filterPlacement")}
            />
          </label>
          {filter.placement === "service_boost" && svc?.items.length ? (
            <label>
              <span>{t("filterService")}</span>
              <Select
                value={filter.serviceId ?? ""}
                onChange={(v) => setFilter((f) => ({ ...f, serviceId: v }))}
                options={[{ value: "", label: t("filterAll") }, ...svc.items.map((x) => ({ value: x.id, label: x.service.name }))]}
                ariaLabel={t("filterService")}
              />
            </label>
          ) : null}
          <label>
            <span>{t("filterFrom")}</span>
            <DatePicker value={filter.dateFrom ?? ""} onChange={(v) => setFilter((f) => ({ ...f, dateFrom: v }))} placeholder={t("filterFrom")} ariaLabel={t("filterFrom")} max={filter.dateTo || undefined} />
          </label>
          <label>
            <span>{t("filterTo")}</span>
            <DatePicker value={filter.dateTo ?? ""} onChange={(v) => setFilter((f) => ({ ...f, dateTo: v }))} placeholder={t("filterTo")} ariaLabel={t("filterTo")} min={filter.dateFrom || undefined} />
          </label>
        </div>
        {rangeBad ? <p className="promo__ferr" role="alert">{t(rangeBad === "order" ? "filterOrder" : "filterLong")}</p> : null}
            {rangeBad ? <p className="promo__ferr" role="alert">{t(rangeBad === "order" ? "filterOrder" : "filterLong")}</p> : null}
          </section>
        </aside>
      </div>

      {open && !denied ? (
        <PromoteModal
          aiId="advocate.promotion.place-modal"
          startPlacement={open}
          services={(svc?.items ?? []).filter((x) => x.status === "active" && x.service.isActive && !x.ownPromotion)}
          profile={svc?.profile ?? null}
          scope={ME}
          uid={uid}
          owner={false}
          onClose={() => setOpen(null)}
          onStale={() => setReloadKey((n) => n + 1)}
          onDenied={(msg) => {
            setOpen(null);
            setLapse(null);
            setDenied(msg);
          }}
          onSent={(req) => {
            if (req.awaitingPayment) toast(ts("toast.promoSent"), { tone: "ok" });
            setLapse(null);
            setReloadKey((n) => n + 1);
          }}
        />
      ) : null}

      <PromoteServicesSection role={role} onData={setSvc} />
    </div>
  );
}
