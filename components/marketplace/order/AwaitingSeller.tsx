"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { clockOf, useCountdown } from "@/lib/useCountdown";
import type { MarketOrder } from "@/lib/services/marketplace";

// The paid order is with the seller to accept (enterprise contract
// 2026-10-27 §4): the client sees the backend's own message, the time the
// seller has left, and that the payment is in and nothing more is due. At
// zero the page refetches; the deadline is never extended here.
export default function AwaitingSeller({ o, onRefresh }: { o: MarketOrder; onRefresh: () => void }): ReactElement {
  const t = useTranslations("marketplace.orderDetail.awaiting");
  const left = useCountdown(o.assignment?.deadlineAt ?? "", onRefresh);
  return (
    <SxNote tone="info" title={t("title")}>
      {o.clientMessage ? <p>{o.clientMessage}</p> : null}
      {left !== null ? <p className="sx-num">{left > 0 ? t("left", { time: clockOf(left) }) : t("over")}</p> : null}
      {o.paymentStatus === "paid" ? <p>{t("paid")}</p> : null}
    </SxNote>
  );
}
