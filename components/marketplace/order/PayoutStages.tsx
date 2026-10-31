"use client";

import "./payout-stages.css";
import type { ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlert, IconCheck, IconClock, IconCoins, IconLock, IconMinus } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import type { ChecklistItem } from "@/lib/services/marketRuntime";
import { planSteps, type PlanState } from "./payStages";
import type { OrderPayouts } from "./useOrderPayouts";

// TSK-906326 — the seller's own payout stages for this order (contract
// 2026-10-27 §9; backend answers 2026-10-31 §1.10): the three planned
// stages of the snapshot — on acceptance, after the first checklist stage,
// after completion once the 15-minute window closes with no hold — each
// with its planned percent and the real status of the payout row the
// backend created for it. A stage with no row yet only says what it waits
// for; never an amount the backend has not set. Seller and staff only — the
// client view never mounts this. The data is read once for the page
// (useOrderPayouts) and shared with the checklist's stage groups.
const DOT: Readonly<Record<PlanState, typeof IconCheck>> = { paid: IconCheck, sending: IconCoins, due: IconClock, issue: IconAlert, held: IconLock, waiting: IconClock, manual: IconMinus };

export default function PayoutStages({ data, items, aiBase }: { data: OrderPayouts; items: readonly ChecklistItem[] | null; aiBase: string }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.payouts");
  const locale = useLocale();
  const hold = data.settlement?.held ? data.settlement : null;

  if (!data.ready || data.failed || !data.plan.length) return null;
  const steps = planSteps(data.plan, data.rows, items, data.settlement);
  const manual = steps.some((s) => s.state === "manual");
  return (
    <section className="pst" aria-labelledby="pst-h" data-ai-id={`${aiBase}.payouts`} data-ai-type="section" data-ai-private>
      <h3 id="pst-h" className="pst__h">
        {t("title")}
      </h3>
      <ol className="pst__list">
        {steps.map((s) => {
          const Dot = DOT[s.state];
          const p = s.payout;
          return (
            <li key={s.stage} className="pst__step" data-stage={s.stage} data-status={p ? p.status : s.state} data-planned={p ? undefined : ""}>
              <span className="pst__dot" aria-hidden="true">
                <Dot />
              </span>
              <span className="pst__m">
                <b>
                  {t(`stage.${s.stage}`)}
                  <em>{s.percent}%</em>
                </b>
                <small>{t(`when.${s.stage}`)}</small>
              </span>
              <span className="pst__amt">
                {p ? <b>{`${fmtUzs(p.amount)} ${t("som")}`}</b> : <b className="pst__pct">{t("planned")}</b>}
                <small data-status={p ? p.status : s.state}>{p ? (p.status === "paid" && p.paidAt ? t("paidAt", { at: shortDateTime(p.paidAt, locale) }) : t(`status.${p.status}`)) : t(`plan.${s.state}`)}</small>
              </span>
            </li>
          );
        })}
      </ol>
      {manual ? <p className="pst__note" data-tone="info">{t("manualNote")}</p> : null}
      {hold ? (
        <p className="pst__note">
          {t(hold.status === "rework_hold" ? "heldRework" : hold.status === "complaint_hold" || hold.holdReason === "complaint_open" ? "heldComplaint" : "heldWindow")}
          {hold.releaseAfter && hold.status === "held" ? ` ${t("releaseAfter", { at: shortDateTime(hold.releaseAfter, locale) })}` : ""}
        </p>
      ) : null}
    </section>
  );
}
