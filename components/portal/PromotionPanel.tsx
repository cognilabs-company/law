"use client";

import { useEffect, useState } from "react";
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
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { useResource, useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "./DataState";
import { IconRocket, IconTrendingUp, IconEye, IconSearch, IconTarget, IconChat, IconClock } from "@/components/icons";

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
  // The Telegram wait. Held here rather than re-read, because /promotions/me
  // answers the seller's ACTIVE promotion and a pending one is not active yet
  // — there is nothing to poll for until an admin presses the button.
  const [pending, setPending] = useState<{ packageId: string; workId: string; amount: number; currency: string; telegramSent: boolean } | null>(null);

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
        setPending({ packageId: pkg.id, workId: r.promotionWorkId, amount: r.amount, currency: r.currency, telegramSent: r.telegramSent });
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
        {status.data?.active ? (
          <div className="promo__gauge">
            <b>{status.data.daysLeft}</b>
            <span>{t("activeShort")}</span>
          </div>
        ) : null}
      </div>

      {status.data?.active ? (
        <div className="promo__active">
          <IconRocket />
          {t("activeMsg", { days: status.data.daysLeft })}
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
            {pending.workId ? <span className="wid">{pending.workId}</span> : null}
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
                    <b>{pkg.title}</b>
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
    </div>
  );
}
