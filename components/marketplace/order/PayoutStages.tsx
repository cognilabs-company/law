"use client";

import "./payout-stages.css";
import type { ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconClock, IconLock } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import type { OrderPayouts } from "./useOrderPayouts";

// TSK-906326 — the seller's own payout stages for this order (contract
// 2026-10-27 §9): on acceptance, after the first checklist stage, and after
// completion once the 15-minute window closes. Seller and staff only — the
// client view never mounts this. Amounts and the hold are the backend's;
// when it sends no stages, nothing is shown.
// The rows are read once for the page (useOrderPayouts) and shared with the
// checklist's stage groups.
export default function PayoutStages({ data, aiBase }: { data: OrderPayouts; aiBase: string }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.payouts");
  const locale = useLocale();
  const rows = data.rows;
  const hold = data.settlement?.held ? data.settlement : null;

  if (!rows.length) return null;
  return (
    <section className="pst" aria-labelledby="pst-h" data-ai-id={`${aiBase}.payouts`} data-ai-type="section" data-ai-private>
      <h3 id="pst-h" className="pst__h">
        {t("title")}
      </h3>
      <ol className="pst__list">
        {rows.map((p) => (
          <li key={p.id || p.stage} className="pst__step" data-status={p.status}>
            <span className="pst__dot" aria-hidden="true">
              {p.status === "paid" ? <IconCheck /> : p.status === "held" ? <IconLock /> : <IconClock />}
            </span>
            <span className="pst__m">
              <b>
                {t(`stage.${p.stage}`)}
                {p.percent !== null ? <em>{p.percent}%</em> : null}
              </b>
              <small>{t(`when.${p.stage}`)}</small>
            </span>
            <span className="pst__amt">
              <b>{`${fmtUzs(p.amount)} ${t("som")}`}</b>
              <small data-status={p.status}>{p.status === "paid" && p.paidAt ? t("paidAt", { at: shortDateTime(p.paidAt, locale) }) : t(`status.${p.status}`)}</small>
            </span>
          </li>
        ))}
      </ol>
      {hold ? (
        <p className="pst__note">
          {t(hold.status === "rework_hold" ? "heldRework" : hold.status === "complaint_hold" || hold.holdReason === "complaint_open" ? "heldComplaint" : "heldWindow")}
          {hold.releaseAfter && hold.status === "held" ? ` ${t("releaseAfter", { at: shortDateTime(hold.releaseAfter, locale) })}` : ""}
        </p>
      ) : null}
    </section>
  );
}
