"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getSubscriptionPlans, purchasePlan, demoPlanPurchase, isAtmosCheckout, isProviderUnsupported, type BackendPlan } from "@/lib/services/backend";
import { createCheckout, isDemoCheckout, type PaymentIntent } from "@/lib/services/checkout";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { CheckoutIntent } from "./OrderMilestones";
import { useResource } from "@/lib/useResource";
import Modal from "@/components/admin/Modal";
import { Skeleton } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import { fmtUzs } from "@/lib/money";
import { IconCheck, IconCrown } from "@/components/icons";
import PlanCard from "./PlanCard";

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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPlanId("");
      setPeriod("monthly");
      setMsg(null);
      setIntent(null);
    }
  }

  async function buy() {
    const plan = qualifying.find((p) => p.id === planId);
    if (!plan || busy) return;
    setBusy(true);
    setMsg(null);
    setIntent(null);
    let leaving = false;
    try {
      if (isAtmosCheckout()) {
        const r = await purchasePlan(plan.id, { billing_period: period });
        if (r.paymentUrl) {
          leaving = true;
          setMsg({ ok: true, text: t("payRedirect") });
          window.location.assign(r.paymentUrl);
        } else {
          setMsg({ ok: true, text: t("activated", { plan: plan.name }) });
        }
        return;
      }
      if (!isDemoCheckout()) {
        const total = priceFor(plan, period);
        if (!total) {
          setMsg({ ok: false, text: t("purchaseError") });
          return;
        }
        setIntent(await createCheckout({ kind: "subscription_plan", planId: plan.id, amount: total, payload: { billing_period: period, title: plan.name } }));
        return;
      }
      const r = await demoPlanPurchase(plan.id, { billing_period: period });
      if (r.paymentUrl) {
        leaving = true;
        setMsg({ ok: true, text: t("payRedirect") });
        window.location.assign(r.paymentUrl);
      } else {
        setMsg({ ok: true, text: t("activated", { plan: plan.name }) });
      }
    } catch (e) {
      setMsg({ ok: false, text: isProviderUnavailable(e) || isProviderUnsupported(e) || isDemoUnavailable(e) ? tc("paymentUnavailable") : t("purchaseError") });
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={ts("aiPlanGateTitle")}>
      <div className="cform pgate" style={{ maxWidth: "none" }}>
        <p className="advmuted" style={{ margin: 0 }}>{ts("aiPlanGateLead")}</p>

        {intent ? (
          <CheckoutIntent intent={intent} onCancel={() => setIntent(null)} untitled />
        ) : msg ? (
          <Notice ok={msg.ok} msg={msg.text} />
        ) : null}

        {intent || (msg && msg.ok) ? null : plans.status === "loading" ? (
          <Skeleton rows={3} />
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
                        icon: picked ? <IconCheck /> : featured ? <IconCrown aria-hidden /> : undefined,
                        pressed: picked,
                        onClick: () => setPlanId(p.id),
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <button className="btn btn--grad btn--full btn--lg" type="button" onClick={buy} disabled={!planId || busy}>
              {busy ? td("processingShort") : t("choose")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
