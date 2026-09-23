"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getSubscriptionPlans, requestManualDocumentPlanPurchase, type BackendPlan, type ManualDocBillingPeriod } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
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
  const qualifying = plans.data.filter((p) => p.isActive && p.entitlements?.manual_document_fill === true);
  const [planId, setPlanId] = useState("");
  const [period, setPeriod] = useState<ManualDocBillingPeriod>("monthly");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sent, setSent] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPlanId("");
      setPeriod("monthly");
      setNote(null);
      setSent(false);
    }
  }

  async function submit() {
    if (!planId || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await requestManualDocumentPlanPurchase(planId, period);
      setSent(true);
    } catch {
      setNote({ ok: false, msg: t("planRequestError") });
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
          <p className="advmuted">{t("noQualifyingPlans")}</p>
        ) : (
          <>
            <div>
              <label>{t("choosePlan")}</label>
              <div className="advpick">
                {qualifying.map((p) => (
                  <button type="button" key={p.id} className={`advpick__c${planId === p.id ? " on" : ""}`} onClick={() => setPlanId(p.id)}>
                    <span className="advpick__m">
                      <b>{p.name}</b>
                      <span className="advpick__stats">{fmtUzs(priceFor(p, period))} {t("som")}</span>
                    </span>
                    {planId === p.id ? <IconCheck className="advpick__ck" /> : null}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label>{t("choosePeriod")}</label>
              <div className="chiprow" style={{ margin: "4px 0 0" }}>
                {PERIODS.map((pr) => (
                  <button key={pr} type="button" className="fchip" aria-pressed={period === pr} onClick={() => setPeriod(pr)}>
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
