"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  listAds,
  checkoutPromotion,
  PROMOTION_PENDING,
  getPromotionStatus,
  getPromotionAnalytics,
  type ModuleRecord,
  type PromotionAnalytics,
} from "@/lib/services/backend";
import { isDemoUnavailable, isProviderUnavailable, parseServerTime } from "@/lib/http";
import { useAuth } from "@/lib/auth";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  dropPendingPromos,
  parsePendingPromos,
  pendingPromoKey,
  pendingPromosRaw,
  promoSignalOf,
  savePendingPromo,
  subscribePendingPromos,
  type ManagedServices,
} from "@/lib/services/sellerServices";
import { useResource, useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import PromoteServicesSection from "@/components/services/PromoteServicesSection";
import { usePackageName } from "@/components/services/bits";
import { Skeleton, EmptyState } from "./DataState";
import { IconRocket, IconTrendingUp, IconEye, IconSearch, IconTarget, IconChat, IconClock } from "@/components/icons";

const PROFILE_KEY = pendingPromoKey("profile");

const som = (n: number) => (n ? fmtUzs(n) : "0");
const numOf = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export default function PromotionPanel() {
  const t = useTranslations("promotion");
  const tcommon = useTranslations("common");
  const [reloadKey, setReloadKey] = useState(0);
  const packages = useResource(() => listAds(), [reloadKey]);
  const status = useResourceOne(getPromotionStatus, [reloadKey]);
  const analytics = useResourceOne<PromotionAnalytics>(getPromotionAnalytics, [reloadKey]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const role = session?.role === "lawyer" ? "lawyer" : "advocate";
  const packName = usePackageName();
  const [svc, setSvc] = useState<ManagedServices | null>(null);
  const pendingRaw = useSyncExternalStore(subscribePendingPromos, () => pendingPromosRaw(uid), () => "");
  const pending = useMemo(() => parsePendingPromos(pendingRaw)[PROFILE_KEY] ?? null, [pendingRaw]);

  useEffect(() => {
    if (!uid) return;
    return subscribeUserEvents((ev) => {
      const s = promoSignalOf(ev);
      if (!s || s.kind === "pending" || s.serviceId) return;
      dropPendingPromos(uid, (k, p) => k === PROFILE_KEY && (!s.requestId || !p.requestId || p.requestId === s.requestId));
      setReloadKey((n) => n + 1);
    });
  }, [uid]);

  // Back from the checkout page may restore this page from the bfcache with the
  // button still busy (it stays busy while the browser navigates away).
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function buy(pkg: ModuleRecord, days: number) {
    if (busy) return;
    setBusy(pkg.id);
    setErr(null);
    let leaving = false; // stay busy while the browser opens the checkout
    try {
      const r = await checkoutPromotion(pkg.id, days);
      if (r.paymentUrl) {
        // Real checkout: same-tab navigation (a popup after an await is blocked).
        leaving = true;
        window.location.assign(r.paymentUrl);
        return;
      }
      // LEXGO_PROMOTION_CHECKOUT_NAV_AI_UPDATE_2026-09-29.md S1: there is no
      // URL any more — the backend raised a telegram_manual payment and an
      // admin has to press Tasdiqlash. Until this branch existed the button
      // simply stopped spinning and the seller was told nothing at all,
      // while their package sat inactive.
      if (r.promotionStatus === PROMOTION_PENDING || !r.paymentUrl) {
        savePendingPromo(uid, PROFILE_KEY, {
          requestId: r.checkoutRequestId || r.promotionWorkId,
          packageTitle: packName(pkg.title),
          amount: r.amount,
          currency: r.currency,
          telegramSent: r.telegramSent,
        });
      }
      setReloadKey((k) => k + 1);
    } catch (e) {
      setErr(isProviderUnavailable(e) || isDemoUnavailable(e) ? tcommon("paymentUnavailable") : t("checkoutError"));
    } finally {
      if (!leaving) setBusy(null);
    }
  }

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
  const stAt = st?.endsAt ? parseServerTime(st.endsAt) : NaN;
  const stIsService = Boolean(st?.active && svc?.items.some((x) => x.ownPromotion && parseServerTime(x.ownPromotion.endsAt) === stAt));
  const profileDays = boost ? boost.daysLeft : st?.active && !stIsService ? st.daysLeft : null;

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
          <b>{t("packagesTitle")}</b>
        </div>

        {/* S1. The checkout no longer hands back a payment URL — an admin
            approves it in Telegram — so this is the only thing standing
            between the seller and silence. telegramSent false is worth saying
            out loud: it means they are waiting on a message nobody received. */}
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

        {packages.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !packages.data.length ? (
          <EmptyState icon={<IconRocket />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <>
            <div className="promo__packs">
              {packages.data.map((pkg, i) => {
                const days = numOf(pkg.payload.days, 7);
                const reach = numOf(pkg.payload.reach, i + 2);
                const feat = i === 1 || packages.data.length === 1;
                return (
                  <div key={pkg.id} className={`ppack${feat ? " ppack--feat" : ""}`}>
                    {feat ? <span className="ppack__ribbon">{t("popular")}</span> : null}
                    <b>{packName(pkg.title)}</b>
                    <span className="ppack__days">{t("days", { d: days })}</span>
                    <span className="ppack__reach">
                      <IconTrendingUp />
                      {t("reach", { x: reach })}
                    </span>
                    <span className="ppack__price">
                      {som(pkg.price)} <span>{t("som")}</span>
                    </span>
                    <button
                      type="button"
                      className={`btn ${feat ? "btn--grad" : "btn--line"} btn--full`}
                      disabled={busy === pkg.id}
                      onClick={() => buy(pkg, days)}
                    >
                      {busy === pkg.id ? t("processing") : t("buy")}
                    </button>
                  </div>
                );
              })}
            </div>
            {err ? <p className="disc" style={{ color: "var(--dk-txt-err, #C0392B)" }}>{err}</p> : null}
            <p className="promo__note">{t("boostNote")}</p>
          </>
        )}
      </div>

      <PromoteServicesSection role={role} onData={setSvc} />
    </div>
  );
}
