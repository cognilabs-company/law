"use client";

import "./rework.css";
import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { getOrderFinancials, isReworkOrder, type MarketOrder, type MarketSignal } from "@/lib/services/marketplace";
import { RefreshCwIcon, CircleCheckIcon, HourglassIcon, glyph } from "./icons";
import type { OrderView } from "./types";

// A finished order the call center sent back to work (complaint ruled
// valid_rework): the order is in_progress again and the payout waits until
// the work is redone. Shown on top of the order for both sides, from the
// order's own complaint ruling, the settlement (rework_hold) or the live
// complaint_resolved event.

export default function ReworkNotice({ o, view, signal }: { o: MarketOrder; view: OrderView; signal: MarketSignal | null }): ReactElement | null {
  const t = useTranslations("marketplace.rework");
  const locale = useLocale();
  const [settlement, setSettlement] = useState({ id: "", value: "" });
  const live = signal?.kind === "complaint" && signal.outcome === "valid_rework" && (!signal.orderId || signal.orderId === o.id);
  const known = o.complaint.resolution === "valid_rework";
  const ask = o.status === "in_progress" && !known && !live;

  useEffect(() => {
    if (!ask || !o.id) return;
    const ctl = new AbortController();
    getOrderFinancials(o.id, ctl.signal).then(
      (f) => setSettlement({ id: o.id, value: f.settlement }),
      (e) => {
        if (!isAborted(e)) logApiError("order.rework.financials", e);
      },
    );
    return () => ctl.abort();
  }, [ask, o.id, o.status]);

  const held = settlement.id === o.id ? settlement.value : "";
  if (!live && !isReworkOrder(o, held)) return null;
  const seller = view !== "client";
  const at = o.complaint.resolvedAt;

  return (
    <section className="mod-rework" role="status" aria-labelledby="mod-rework-t" data-ai-id={seller ? "marketplace.order.rework" : "marketplace.client.order.rework"}>
      <span className="mod-rework__ico" aria-hidden="true">
        {glyph(RefreshCwIcon, { size: 20 })}
      </span>
      <div className="mod-rework__body">
        <b id="mod-rework-t">{seller ? t("sellerTitle") : t("clientTitle")}</b>
        <ol className="mod-rework__flow" aria-label={t("flowLabel")}>
          <li data-step="was">
            {glyph(CircleCheckIcon, { size: 14 })}
            <s>{t("wasDone")}</s>
          </li>
          <li data-step="now">
            {glyph(HourglassIcon, { size: 14 })}
            {t("nowRework")}
          </li>
        </ol>
        <p>{seller ? t("sellerText") : t("clientText")}</p>
        {o.complaint.resolutionNote ? (
          <blockquote className="mod-rework__note">
            <small>{t("note")}</small>
            {o.complaint.resolutionNote}
          </blockquote>
        ) : null}
        <p className="mod-rework__fine">
          {[at ? t("decidedAt", { date: shortDateTime(at, locale) }) : "", seller ? t("payoutHeld") : t("refundNote")].filter(Boolean).join(" · ")}
        </p>
      </div>
    </section>
  );
}
