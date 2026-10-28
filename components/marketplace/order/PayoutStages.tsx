"use client";

import "./payout-stages.css";
import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconClock, IconLock } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { subscribeUserEvents } from "@/lib/userSocket";
import { getOrderPayouts, type Payout } from "@/lib/services/payouts";

// TSK-906326 — the seller's own payout stages for this order (contract
// 2026-10-27 §9): on acceptance, after the first checklist stage, and after
// completion once the 15-minute window closes. Seller and staff only — the
// client view never mounts this. Amounts are the backend's; when it sends
// no stages, nothing is shown.
export default function PayoutStages({ orderId, refreshKey, aiBase }: { orderId: string; refreshKey: string; aiBase: string }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.payouts");
  const locale = useLocale();
  const [rows, setRows] = useState<Payout[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    getOrderPayouts(orderId, ctl.signal)
      .then(setRows)
      .catch((e) => {
        if (isAborted(e)) return;
        logApiError("order.payouts", e);
        setRows([]);
      });
    return () => ctl.abort();
  }, [orderId, refreshKey, tick]);
  // A new stage, a payout made, or the checklist moving: refetch.
  useEffect(
    () =>
      subscribeUserEvents((e) => {
        const ev = String(e.event ?? "");
        if (/^marketplace\.(payout_|checklist_updated|order_completed|complaint_)/.test(ev)) setTick((n) => n + 1);
      }),
    [],
  );

  if (!rows?.length) return null;
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
      {rows.some((p) => p.status === "held") ? <p className="pst__note">{t("heldNote")}</p> : null}
    </section>
  );
}
