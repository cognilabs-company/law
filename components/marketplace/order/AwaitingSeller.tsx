"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { clockOf, useCountdown } from "@/lib/useCountdown";
import type { MarketOrder } from "@/lib/services/marketplace";
import { TimerIcon, artStyle, glyph } from "./icons";

// The paid order is with the seller to accept (enterprise contract
// 2026-10-27 §4): the client sees the backend's own message, the time the
// seller has left, and that the payment is in and nothing more is due. At
// zero the page refetches; the deadline is never extended here. Drawn as the
// dashboard's banner: the on-duty lawyer's picture, the time left as a pill.
export default function AwaitingSeller({ o, onRefresh }: { o: MarketOrder; onRefresh: () => void }): ReactElement {
  const t = useTranslations("marketplace.orderDetail.awaiting");
  const left = useCountdown(o.assignment?.deadlineAt ?? "", onRefresh);
  return (
    <section className="odx-wait" aria-labelledby="odx-wait-t">
      <span className="odx-wait__art odx-art" style={artStyle("Tezkor_Advokat")} aria-hidden="true" />
      <div className="odx-wait__body">
        <div className="odx-wait__top">
          <h2 className="odx-wait__t" id="odx-wait-t">
            {t("title")}
          </h2>
          {left !== null && left > 0 ? (
            <span className="cx-pill cx-pill--warn odx-wait__clock sx-num" role="timer" aria-label={t("left", { time: clockOf(left) })}>
              {glyph(TimerIcon, { size: 14 })}
              {clockOf(left)}
            </span>
          ) : null}
        </div>
        {o.clientMessage ? <p>{o.clientMessage}</p> : null}
        {left === 0 ? <p className="odx-wait__over">{t("over")}</p> : null}
        {o.paymentStatus === "paid" ? <p>{t("paid")}</p> : null}
      </div>
    </section>
  );
}
