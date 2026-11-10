"use client";

import "./planTerms.css";
import "./plans1920.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { fmtUzs } from "@/lib/money";
import { renewalTerms } from "@/lib/planCheckout";
import CheckBox from "@/components/CheckBox";
import Modal from "@/components/admin/Modal";
import { IconCheck, IconExternal, IconShieldCheck } from "@/components/icons";
import { planPlate } from "./PlanCard";

// The refund rules and the offer, as the backend publishes them
// (/legal/consents slugs payment_refund_warranty and terms).
export const REFUND_POLICY_HREF = "/legal/payment-refund-warranty";
export const TERMS_HREF = "/legal/terms";

export type PlanPurchase = {
  planName: string;
  // Backend billing period: monthly / six_month / yearly / prepaid_yearly.
  period: string;
  // Due now: the backend's quote, or the plan's own price for the period.
  total: number;
  // The plan's listed price for the period (what a renewal charges); only
  // differs from total while a promotion lowers the first period.
  listed?: number;
  // The tariff's slug: the review dialog shows its picture. Absent → none.
  slug?: string;
};

// Everything the subscriber agrees to, shown before any payment: the amount
// due now and that nothing is added to it, the period, whether the tariff
// renews by itself (their choice, unticked unless they turned auto-pay on) and
// at what price, and the refund rules. `check` lets a host draw its own
// checkbox (the desktop apps' kit); the web pages use the handmade CheckBox.
export default function PlanPurchaseTerms({
  purchase,
  autoRenew,
  onAutoRenew,
  check,
}: {
  purchase: PlanPurchase;
  autoRenew: boolean;
  onAutoRenew: (on: boolean) => void;
  check?: (checked: boolean, onChange: (on: boolean) => void, label: string) => ReactNode;
}): ReactElement {
  const t = useTranslations("checkoutTerms");
  const tp = useTranslations("portal.myPlan.period");
  const terms = renewalTerms(purchase.period, purchase.total, purchase.listed);
  const every = t("every", { n: terms.months });
  const label = t("renewLabel");
  return (
    <div className="pterms" data-ai-id="pricing.checkout-terms" data-ai-type="section">
      <dl className="pterms__sum">
        <div>
          <dt>{t("plan")}</dt>
          <dd>{purchase.planName}</dd>
        </div>
        <div>
          <dt>{t("period")}</dt>
          <dd>{tp.has(purchase.period) ? tp(purchase.period) : t("months", { n: terms.months })}</dd>
        </div>
        <div className="pterms__now">
          <dt>{t("payNow")}</dt>
          <dd>{t("amount", { amount: fmtUzs(terms.payNow) })}</dd>
        </div>
      </dl>
      <p className="pterms__fees">
        <IconCheck aria-hidden />
        <span>{t("noFees")}</span>
      </p>
      {terms.promo ? <p className="pterms__promo">{t("promo", { amount: fmtUzs(terms.renewAt) })}</p> : null}
      <div className="pterms__renew">
        {check ? (
          check(autoRenew, onAutoRenew, label)
        ) : (
          <CheckBox checked={autoRenew} onChange={onAutoRenew}>
            {label}
          </CheckBox>
        )}
        <p aria-live="polite">
          {autoRenew
            ? t.rich("renewOn", { every, amount: fmtUzs(terms.renewAt), b: (c) => <b>{c}</b> })
            : t.rich("renewOff", { months: terms.months, b: (c) => <b>{c}</b> })}
        </p>
      </div>
      <p className="pterms__docs">
        <IconShieldCheck aria-hidden />
        <span>{t("readFirst")}</span>
        <Link href={REFUND_POLICY_HREF} target="_blank" rel="noopener noreferrer">
          {t("refund")}
          <IconExternal aria-hidden />
        </Link>
        <Link href={TERMS_HREF} target="_blank" rel="noopener noreferrer">
          {t("terms")}
          <IconExternal aria-hidden />
        </Link>
      </p>
    </div>
  );
}

// The same terms as a step of its own between "Choose" and the payment.
export function PlanCheckoutReview({
  purchase,
  autoRenew,
  onAutoRenew,
  busy,
  onConfirm,
  onClose,
}: {
  purchase: PlanPurchase | null;
  autoRenew: boolean;
  onAutoRenew: (on: boolean) => void;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}): ReactElement {
  const t = useTranslations("checkoutTerms");
  return (
    <Modal
      open={!!purchase}
      onClose={onClose}
      title={t("title")}
      busy={busy}
      aiId="pricing.checkout-review"
      footer={
        purchase ? (
          <div className="pterms__acts">
            <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
              {t("back")}
            </button>
            <button type="button" className="btn btn--pri" onClick={onConfirm} disabled={busy} data-ai-id="pricing.checkout-review.pay">
              {busy ? t("paying") : t("pay", { amount: fmtUzs(purchase.total) })}
            </button>
          </div>
        ) : null
      }
    >
      {purchase ? (
        <div className="plx-review">
          {/* The plan's own picture on the dashboard's light plate. */}
          {purchase.slug ? <span className="plx-review__art" style={planPlate(purchase.slug)} aria-hidden /> : null}
          <PlanPurchaseTerms purchase={purchase} autoRenew={autoRenew} onAutoRenew={onAutoRenew} />
        </div>
      ) : null}
    </Modal>
  );
}
