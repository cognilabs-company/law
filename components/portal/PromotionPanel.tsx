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
import { Skeleton } from "./DataState";
import { IconRocket, IconEye, IconSearch, IconTarget, IconChat, IconClock, IconArrowRight, IconAlert } from "@/components/icons";
import { PlacementSketch } from "@/components/services/bits";
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
  const cards = a
    ? [
        { v: a.impressions, label: t("impressions"), Icon: IconEye },
        { v: a.searchAppearances, label: t("searchAppearances"), Icon: IconSearch },
        { v: a.profileClicks, label: t("profileClicks"), Icon: IconTarget },
        { v: a.contactRequests, label: t("contactRequests"), Icon: IconChat },
      ]
    : [];
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
    <div className="promo">
      <div className="promo__hero">
        <div className="promo__hero-t">
          <span className="kick" style={{ color: "var(--b300)", background: "rgba(92,168,255,.16)" }}>
            <IconRocket />
            {t("kicker")}
          </span>
          <h2 className="h2" style={{ color: "#fff" }}>{t("title")}</h2>
          <p className="lead" style={{ color: "#B7CDEC" }}>{t("intro")}</p>
          <p className="promo__boost" data-ai-id="promotion.multiplier">
            <TrendingUpIcon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>
              <b>{t("multiplier")}</b>
              {maxReach > 1 ? <span className="promo__boostx">{t("multiplierUpTo", { x: maxReach })}</span> : null}
            </span>
          </p>
        </div>
        {profileDays !== null ? (
          <div className="promo__gauge">
            <b>{profileDays}</b>
            <span>{t("activeShort")}</span>
          </div>
        ) : null}
      </div>

      {profileDays !== null ? (
        <div className="promo__active">
          <IconRocket />
          {t("activeMsg", { days: profileDays })}
        </div>
      ) : null}

      <div className="ppanel" style={{ marginTop: 18 }} data-ai-target="promotion:analytics">
        <div className="ppanel__h">
          <b>{t("analyticsTitle")}</b>
        </div>
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
        {analytics.status === "loading" ? (
          <Skeleton rows={2} />
        ) : (
          <div className="promo__analytics">
            {cards.map((c) => (
              <div className="promo__acard" key={c.label}>
                <span className="promo__ai"><c.Icon /></span>
                <b>{som(c.v)}</b>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ppanel" style={{ marginTop: 18 }} data-ai-target="promotion:packages">
        <div className="ppanel__h">
          <b>{t("placesTitle")}</b>
        </div>

        {/* S1. The checkout no longer hands back a payment URL — an admin
            approves it in Telegram — so this is the only thing standing
            between the seller and silence. telegramSent false is worth saying
            out loud: it means they are waiting on a message nobody received. */}
        {lapse && !pending ? (
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
            <small className={pending.telegramSent ? "promo__tgok" : "promo__tgbad"}>
              {pending.telegramSent ? t("pendingTelegramOk") : t("pendingTelegramFail")}
            </small>
          </div>
        ) : null}

        <div className="promo__places">
          {PLACES.map((p) => (
            <button key={p.value} type="button" className={`promo__place${placeState(p.value)}`} onClick={() => { lastPlace.current = p.value; setOpen(p.value); }} data-ai-id={`promotion.place.${p.value}`} data-ai-type="button" data-ai-label={ts(`promote.${p.title}`)}>
              <PlacementSketch placement={p.value} />
              <b>{ts(`promote.${p.title}`)}</b>
              <span>{ts(`promote.${p.hint}`)}</span>
              {st ? <small className="promo__placest">{placeLine(p.value)}</small> : null}
              <span className="promo__placego">
                {t("placeStart")}
                <IconArrowRight aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
        <p className="promo__note">{t("boostNote")}</p>
      </div>

      {open ? (
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
          onSent={(req) => {
            if (req.telegramSent) toast(ts("toast.promoSent"), { tone: "ok" });
            setLapse(null);
            setReloadKey((n) => n + 1);
          }}
        />
      ) : null}

      <PromoteServicesSection role={role} onData={setSvc} />
    </div>
  );
}
