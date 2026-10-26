"use client";

import "./rework.css";
import type { ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime } from "@/lib/date";
import { useCountdown } from "@/lib/useCountdown";
import { isReworkOrder, type MarketOrder, type MarketSignal } from "@/lib/services/marketplace";
import { RefreshCwIcon, CircleCheckIcon, HourglassIcon, TimerIcon, glyph } from "./icons";
import type { OrderView } from "./types";

// A finished order the call center sent back to work (complaint ruled
// valid_rework, contract 2026-10-26 §1): the order is in_progress again with
// a rework deadline, and the payout waits until the work is redone. Shown on
// top of the order for both sides, from complaint.rework_required (or the
// live complaint_resolved event until the order is fetched again).

export default function ReworkNotice({ o, view, signal }: { o: MarketOrder; view: OrderView; signal: MarketSignal | null }): ReactElement | null {
  const t = useTranslations("marketplace.rework");
  const locale = useLocale();
  const live = signal?.kind === "complaint" && signal.outcome === "valid_rework" && (!signal.orderId || signal.orderId === o.id);
  const deadline = o.complaint.reworkDeadlineAt;
  const left = useCountdown(deadline);
  if (!live && !isReworkOrder(o)) return null;
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
        {deadline ? (
          <p className="mod-rework__due" data-late={left === 0 || undefined}>
            {glyph(TimerIcon, { size: 15 })}
            <span>
              {t("due", { date: shortDateTime(deadline, locale) })}
              {left !== null ? <b>{left === 0 ? t("overdue") : t("left", { h: Math.floor(left / 3600), m: Math.floor((left % 3600) / 60) })}</b> : null}
            </span>
          </p>
        ) : null}
        {o.complaint.resolutionNote ? (
          <blockquote className="mod-rework__note">
            <small>{t("note")}</small>
            {o.complaint.resolutionNote}
          </blockquote>
        ) : null}
        <p className="mod-rework__fine">
          {[o.complaint.reworkIteration > 1 ? t("iteration", { n: o.complaint.reworkIteration }) : "", at ? t("decidedAt", { date: shortDateTime(at, locale) }) : "", seller ? t("payoutHeld") : t("refundNote")].filter(Boolean).join(" · ")}
        </p>
      </div>
    </section>
  );
}
