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
import { IconCheck } from "@/components/icons";

// The services catalog's download button used to send a Free-tier client
// away to /portal/client/subscription to upgrade, then they had to find
// their way back — the same real purchase PlansPanel.tsx's choose() does
// (ATMOS redirect / generic checkout / demo), just opened right here so
// buying Lite or Pro never leaves the catalog. Same three provider branches,
// same translations (plans.*/common.paymentUnavailable) — only the trigger
// and the plan filter (Lite/Pro upgrade targets, not the whole catalog) differ.
const AI_UPGRADE_SLUG = /^lexgo-ai-(lite|pro)$/;
type Period = "monthly" | "six_month" | "yearly" | "prepaid_yearly";
const PERIODS: Period[] = ["monthly", "six_month", "yearly", "prepaid_yearly"];

function priceFor(plan: BackendPlan, period: Period): number {
  if (period === "six_month") return plan.sixMonthPrice || plan.monthlyPrice * 6;
  if (period === "yearly") return plan.yearlyPrice || plan.monthlyPrice * 12;
  if (period === "prepaid_yearly") return plan.prepaidYearlyPrice || plan.yearlyPrice || plan.monthlyPrice * 12;
  return plan.monthlyPrice;
}

export default function AiPlanUpgradeGate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("plans");
  const tc = useTranslations("common");
  const td = useTranslations("portal.client.documents");
  const ts = useTranslations("portal.client.services");
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
      <div className="cform" style={{ maxWidth: "none" }}>
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
            <div>
              <label>{td("choosePlan")}</label>
              <div className="advpick">
                {qualifying.map((p) => (
                  <button type="button" key={p.id} className={`advpick__c${planId === p.id ? " on" : ""}`} onClick={() => setPlanId(p.id)}>
                    <span className="advpick__m">
                      <b>{p.name}</b>
                      <span className="advpick__stats">{fmtUzs(priceFor(p, period))} {td("som")}</span>
                    </span>
                    {planId === p.id ? <IconCheck className="advpick__ck" /> : null}
                  </button>
                ))}
              </div>
            </div>

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

            <button className="btn btn--grad btn--full btn--lg" type="button" onClick={buy} disabled={!planId || busy}>
              {busy ? td("processingShort") : t("choose")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
