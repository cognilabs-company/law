"use client";

import "./plans1920.css";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getSubscriptionPlans, demoPlanPurchase, isProviderUnsupported, type BackendPlan } from "@/lib/services/backend";
import { purchasePlanVia } from "@/lib/services/planCheckout";
import { PAYMENT_PROVIDER_ERRORS, PROVIDER_LIST_ERRORS, marketErrorCode } from "@/lib/services/marketplace";
import PayProviderPicker from "@/components/payments/PayProviderPicker";
import { isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { ClickPayLoading, ClickPayPanel } from "@/components/payments/ClickPay";
import { PROVIDER_LIST_STALE, clickErrorOf, purchasePlanWithClick, type ClickPayment } from "@/lib/services/clickCheckout";
import { refreshCheckoutProviders, useCheckoutProviders } from "@/lib/useCheckoutProviders";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { CheckoutIntent } from "./OrderMilestones";
import { useResource } from "@/lib/useResource";
import Modal from "@/components/admin/Modal";
import { Skeleton, ErrorState } from "./DataState";
import { notify } from "@/lib/toast";
import { fmtUzs } from "@/lib/money";
import { IconCheck } from "@/components/icons";
import PlanCard from "./PlanCard";
import PlanPurchaseTerms from "./PlanPurchaseTerms";
import { goToPaymentPage } from "@/lib/services/paymentProviders";

// The services catalog's download button used to send a Free-tier client
// away to /portal/client/subscription to upgrade, then they had to find
// their way back — the same real purchase PlansPanel.tsx's choose() does
// (ATMOS redirect / generic checkout / demo), just opened right here so
// buying Lite or Pro never leaves the catalog. Same three provider branches,
// same translations (plans.*/common.paymentUnavailable) — only the trigger
// and the plan filter (Lite/Pro upgrade targets, not the whole catalog) differ.
//
// GM 29.09.2026: it used to ask the client to pick a plan off a bare name +
// price list, which told them nothing about what they were being asked to pay
// for. It now shows the SAME card the Tariflar page shows — literally the same
// component (PlanCard), not a copy of its markup — so the two can never drift
// apart. Free is deliberately absent: this dialog only ever opens because the
// client is already on Free.
const AI_UPGRADE_SLUG = /^lexgo-ai-(lite|pro)$/;
// The plan the Tariflar page calls "recommended"; the ribbon and the gradient
// CTA follow it here too, so the same tariff is the loud one in both places.
const FEATURED_SLUG = "lexgo-ai-pro";
type Period = "monthly" | "six_month" | "yearly" | "prepaid_yearly";
const PERIODS: Period[] = ["monthly", "six_month", "yearly", "prepaid_yearly"];
// How many months each period actually covers — the card quotes a per-month
// price like the Tariflar page does, and buy() charges the total.
const MONTHS: Record<Period, number> = { monthly: 1, six_month: 6, yearly: 12, prepaid_yearly: 12 };

function priceFor(plan: BackendPlan, period: Period): number {
  if (period === "six_month") return plan.sixMonthPrice || plan.monthlyPrice * 6;
  if (period === "yearly") return plan.yearlyPrice || plan.monthlyPrice * 12;
  if (period === "prepaid_yearly") return plan.prepaidYearlyPrice || plan.yearlyPrice || plan.monthlyPrice * 12;
  return plan.monthlyPrice;
}

// What a card shows for the chosen period. Deliberately NOT PlansPanel's
// aiPricing(): that one applies the GM's own term/upfront discount table to a
// monthly price, while this dialog buys a backend billing_period and must
// quote exactly what purchasePlan() will charge for it — so the saving is read
// back off the backend's own totals (Lite yearly 529 200 against 12 × 49 000
// is a real −10 %) rather than assumed.
function periodPricing(plan: BackendPlan, period: Period) {
  const months = MONTHS[period];
  const total = priceFor(plan, period);
  const baseline = plan.monthlyPrice * months;
  return {
    total,
    months,
    perMonth: Math.round(total / months),
    savePct: baseline > 0 && total > 0 && total < baseline ? Math.round(((baseline - total) / baseline) * 100) : 0,
  };
}

export default function AiPlanUpgradeGate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("plans");
  const tc = useTranslations("common");
  const td = useTranslations("portal.client.documents");
  const ts = useTranslations("portal.client.services");
  // The house "pick this one" label, already used by the lawyer cards.
  const tcta = useTranslations("cta");
  const locale = useLocale();
  const plans = useResource<BackendPlan>(() => getSubscriptionPlans(locale), [locale]);
  const qualifying = plans.data.filter((p) => p.isActive !== false && AI_UPGRADE_SLUG.test(p.slug));
  const [planId, setPlanId] = useState("");
  const [period, setPeriod] = useState<Period>("monthly");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  // Click (integration §6): the invoice for the chosen plan, priced by the server.
  const pays = useCheckoutProviders();
  // Click or ATMOS, as the backend has them on (2026-11-21 contract §1).
  const [payPick, setPayPick] = useState("");
  const payOptions = pays.options.map((o) => ({ provider: o.provider, label: o.label }));
  const payVia = payOptions.some((o) => o.provider === payPick) ? payPick : payOptions.some((o) => o.provider === "click") ? "click" : (payOptions[0]?.provider ?? "");
  const [clickBuy, setClickBuy] = useState<{ title: string; payment: ClickPayment | null } | null>(null);
  // Renewal is the subscriber's own choice on the terms below, unticked.
  const [renew, setRenew] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPlanId("");
      setPeriod("monthly");
      setIntent(null);
      setRenew(false);
      setClickBuy(null);
    }
  }

  const picked = qualifying.find((p) => p.id === planId);

  async function buy() {
    const plan = qualifying.find((p) => p.id === planId);
    if (!plan || busy) return;
    setBusy(true);
    setIntent(null);
    let leaving = false;
    try {
      if (!isDemoCheckout() && payVia === "click") {
        setClickBuy({ title: plan.name, payment: null });
        const r = await purchasePlanWithClick(plan.id, { billingPeriod: period, autoRenew: renew });
        if (!r.payment) {
          setClickBuy(null);
          notify.error(t("purchaseError"), { id: "ai-plan-gate" });
          return;
        }
        setClickBuy({ title: plan.name, payment: r.payment });
        return;
      }
      if (!isDemoCheckout()) {
        // ATMOS, or no provider named (the backend picks): the plan's own
        // purchase and its payment_url (2026-11-21 contract §1.2).
        const r = await purchasePlanVia(plan.id, { billingPeriod: period, provider: payVia, autoRenew: renew });
        if (r.approved) {
          notify.success(t("activated", { plan: plan.name }), { id: "ai-plan-gate" });
          onClose();
        } else if (r.provider === "click" && r.payment) {
          setClickBuy({ title: plan.name, payment: r.payment });
        } else if (r.paymentUrl) {
          leaving = true;
          notify.info(t("payRedirect"), { id: "ai-plan-gate" });
          goToPaymentPage(r.paymentUrl, r.paymentId, r.amount);
        } else {
          notify.error(t("purchaseError"), { id: "ai-plan-gate", body: tc("paymentUnavailable") });
        }
        return;
      }
      const r = await demoPlanPurchase(plan.id, { billing_period: period });
      if (r.paymentUrl) {
        leaving = true;
        notify.info(t("payRedirect"), { id: "ai-plan-gate" });
        goToPaymentPage(r.paymentUrl, r.paymentId);
      } else {
        notify.success(t("activated", { plan: plan.name }), { id: "ai-plan-gate" });
        onClose();
      }
    } catch (e) {
      setClickBuy(null);
      const ce = clickErrorOf(e);
      if (PROVIDER_LIST_STALE.includes(ce.key) || PROVIDER_LIST_ERRORS.includes(marketErrorCode(e))) refreshCheckoutProviders();
      const unavailable = isProviderUnavailable(e) || isProviderUnsupported(e) || isDemoUnavailable(e) || PROVIDER_LIST_STALE.includes(ce.key) || ce.key === "unavailable" || PAYMENT_PROVIDER_ERRORS.includes(marketErrorCode(e));
      // The other provider, when the chosen one cannot take it now.
      const alt = unavailable ? payOptions.find((o) => o.provider !== payVia) : undefined;
      if (alt) setPayPick(alt.provider);
      notify.error(t("purchaseError"), { id: "ai-plan-gate", body: unavailable ? tc("paymentUnavailable") : undefined, error: unavailable ? undefined : e });
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={ts("aiPlanGateTitle")}>
      <div className="cform pgate" style={{ maxWidth: "none" }}>
        <p className="advmuted" style={{ margin: 0 }}>{ts("aiPlanGateLead")}</p>

        {intent ? <CheckoutIntent intent={intent} onCancel={() => setIntent(null)} untitled /> : null}
        {clickBuy ? (
          clickBuy.payment ? (
            <ClickPayPanel key={clickBuy.payment.id} payment={clickBuy.payment} title={clickBuy.title} aiId="ai-plan-gate.click" />
          ) : (
            <ClickPayLoading title={clickBuy.title} />
          )
        ) : null}

        {intent || clickBuy ? null : plans.status === "loading" ? (
          <Skeleton rows={3} />
        ) : plans.status === "error" ? (
          <ErrorState compact error={plans.error} onRetry={plans.refresh} />
        ) : !qualifying.length ? (
          <p className="advmuted">{ts("noQualifyingAiPlans")}</p>
        ) : (
          <>
            {/* The period sits ABOVE the cards because it changes what they
                say: every card quotes the per-month price for the period
                chosen here, and the term total underneath it. */}
            <div>
              <label>{td("choosePeriod")}</label>
              <div className="chiprow" style={{ margin: "4px 0 0" }}>
                {PERIODS.map((pr) => (
                  <button key={pr} type="button" className="fchip" aria-pressed={period === pr} onClick={() => setPeriod(pr)}>
                    {td(`period_${pr}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label>{td("choosePlan")}</label>
              <div className="plans__grid pgate__grid">
                {qualifying.map((p) => {
                  const pr = periodPricing(p, period);
                  const featured = p.slug === FEATURED_SLUG;
                  const picked = planId === p.id;
                  return (
                    <PlanCard
                      key={p.id}
                      slug={p.slug}
                      name={p.name}
                      features={p.features ?? []}
                      state={featured ? "featured" : "plain"}
                      ribbon={featured ? t("recommended") : undefined}
                      saves={pr.savePct > 0 ? [`−${pr.savePct}%`] : []}
                      price={{ amount: fmtUzs(pr.perMonth), unit: t("perMonth") }}
                      totalNote={pr.months > 1 ? t("totalNote", { term: pr.months, total: fmtUzs(pr.total) }) : undefined}
                      // No seller discount and no usage counter here: this
                      // dialog knows neither, and a wrong "−0%" would be
                      // worse than nothing.
                      selected={picked}
                      onSelect={() => setPlanId(p.id)}
                      cta={{
                        // "Tanlandi" is a new string; until it is merged into
                        // messages/*.json the button falls back to the same
                        // "Tanlash" it shows unpicked — the check, the settled
                        // button and the ring already say which one is chosen,
                        // so nothing ever renders a raw key path.
                        label: picked && ts.has("aiPlanPicked") ? ts("aiPlanPicked") : tcta("choose"),
                        variant: picked ? "soft" : featured ? "featured" : "line",
                        icon: picked ? <IconCheck /> : undefined,
                        pressed: picked,
                        onClick: () => setPlanId(p.id),
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {picked ? (
              <PlanPurchaseTerms purchase={{ planName: picked.name, period, total: priceFor(picked, period) }} autoRenew={renew} onAutoRenew={setRenew} />
            ) : null}
            {picked ? <PayProviderPicker options={payOptions} value={payVia} onChange={setPayPick} disabled={busy} aiId="ai-plan-gate.provider" /> : null}

            <button className="btn btn--pri btn--full btn--lg" type="button" onClick={buy} disabled={!planId || busy}>
              {busy ? td("processingShort") : t("choose")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
