"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getSubscriptionPlans, requestPlanTelegramPurchase, refusedBillingPeriods, type BackendPlan, type ManualDocBillingPeriod } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import { fmtUzs } from "@/lib/money";
import { IconCheck } from "@/components/icons";

// LEXGO_MANUAL_DOCUMENT_PLAN_FRONTEND.md: template download and self/AI-fill
// now require a plan with `entitlements.manual_document_fill=true` — this is
// the modal that opens on the backend's 402 `manual_document_plan_required`
// (or, here, whenever a caller already knows access is missing without
// waiting for that specific request to fail). Purchase here goes through a
// Telegram approval chat, not a payment-provider checkout redirect — the
// plan activates once someone there approves it, so there is no "pay now"
// step, only a pending receipt.
const PERIODS: ManualDocBillingPeriod[] = ["monthly", "six_month", "yearly", "prepaid_yearly"];
// A plan only accepts the periods the backend listed in allowed_billing_periods;
// offering the other three produced a request the backend could only reject.
function periodsFor(plan: BackendPlan | undefined): ManualDocBillingPeriod[] {
  const allowed = plan?.allowedBillingPeriods ?? [];
  if (!allowed.length) return PERIODS;
  const only = PERIODS.filter((p) => allowed.includes(p));
  return only.length ? only : PERIODS;
}

function priceFor(plan: BackendPlan, period: ManualDocBillingPeriod): number {
  if (period === "six_month") return plan.sixMonthPrice || plan.monthlyPrice * 6;
  if (period === "yearly") return plan.yearlyPrice || plan.monthlyPrice * 12;
  if (period === "prepaid_yearly") return plan.prepaidYearlyPrice || plan.yearlyPrice || plan.monthlyPrice * 12;
  return plan.monthlyPrice;
}

export default function ManualDocPlanGate({
  open,
  onClose,
  message,
}: {
  open: boolean;
  onClose: () => void;
  // The backend's own 402 message (LEXGO_MANUAL_DOCUMENT_PLAN_FRONTEND.md:
  // "Shablonni yuklab olish va qo'lda to'ldirish uchun paket sotib oling")
  // when this was opened in reaction to one; a generic lead line otherwise.
  message?: string;
}) {
  const t = useTranslations("portal.client.documents");
  const locale = useLocale();
  const plans = useResource<BackendPlan>(() => getSubscriptionPlans(locale), [locale]);
  const [planId, setPlanId] = useState("");
  const [period, setPeriod] = useState<ManualDocBillingPeriod>("monthly");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sent, setSent] = useState(false);
  // Narrowed by a 422 that named the periods this plan really sells.
  const [only, setOnly] = useState<ManualDocBillingPeriod[] | null>(null);

  // A giftable tariff is bought FOR someone else and activates on the
  // recipient, so it can never clear this gate for the person in front of it —
  // yet "shaxsiy-advokat-gift" is currently the only plan the backend tags
  // with manual_document_fill, which is why this modal offered a gift SKU as
  // the thing to buy. Filtered out here; if that leaves nothing, the modal
  // says so and sends the client to the subscriptions page instead.
  const qualifying = plans.data.filter((p) => p.isActive && !p.isGiftable && p.billingType !== "gift" && p.entitlements?.manual_document_fill === true);
  const selected = qualifying.find((p) => p.id === planId);
  const periods = only ?? periodsFor(selected);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPlanId("");
      setPeriod("monthly");
      setNote(null);
      setSent(false);
      setOnly(null);
    }
  }

  // Switching to a plan that does not allow the currently chosen period would
  // otherwise submit a period the backend rejects.
  const periodOk = periods.includes(period);
  const effPeriod = periodOk ? period : periods[0];

  async function submit() {
    if (!planId || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await requestPlanTelegramPurchase(planId, effPeriod);
      setSent(true);
    } catch (e) {
      // The plan refused that billing period and named the ones it takes:
      // narrow the chips to those instead of showing a flat error the client
      // can do nothing about.
      const allowed = refusedBillingPeriods(e);
      if (allowed.length) {
        setOnly(allowed);
        setPeriod(allowed[0]);
        setNote({ ok: false, msg: t("planPeriodRefused") });
      } else {
        setNote({ ok: false, msg: t("planRequestError") });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("planGateTitle")}>
      <div className="cform" style={{ maxWidth: "none" }}>
        <p className="advmuted" style={{ margin: 0 }}>{message || t("planGateLead")}</p>

        {sent ? (
          <p className="cform__ok">
            <IconCheck style={{ width: 16, height: 16 }} /> {t("planRequestSent")}
          </p>
        ) : plans.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !qualifying.length ? (
          <>
            <p className="advmuted">{t("noQualifyingPlans")}</p>
            <Link href="/portal/client/subscription" className="btn btn--line btn--full" onClick={onClose}>
              {t("openSubscriptions")}
            </Link>
          </>
        ) : (
          <>
            <div>
              <label>{t("choosePlan")}</label>
              <div className="advpick">
                {qualifying.map((p) => (
                  <button type="button" key={p.id} className={`advpick__c${planId === p.id ? " on" : ""}`} onClick={() => setPlanId(p.id)}>
                    <span className="advpick__m">
                      <b>{p.name}</b>
                      <span className="advpick__stats">{fmtUzs(priceFor(p, effPeriod))} {t("som")}</span>
                    </span>
                    {planId === p.id ? <IconCheck className="advpick__ck" /> : null}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label>{t("choosePeriod")}</label>
              <div className="chiprow" style={{ margin: "4px 0 0" }}>
                {periods.map((pr) => (
                  <button key={pr} type="button" className="fchip" aria-pressed={effPeriod === pr} onClick={() => setPeriod(pr)}>
                    {t(`period_${pr}`)}
                  </button>
                ))}
              </div>
            </div>

            {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
            <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={!planId || busy}>
              {busy ? t("processingShort") : t("planRequestSubmit")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
