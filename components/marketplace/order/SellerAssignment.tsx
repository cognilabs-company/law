"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import OrderActions from "@/components/portal/OrderActions";
import { fmtUzs } from "@/lib/money";
import { clockOf, useCountdown } from "@/lib/useCountdown";
import type { MarketOrder } from "@/lib/services/marketplace";

// An order assigned to this seller and not yet answered (enterprise
// contract §5): the time left, what the client asked for, and accept or
// decline — the same controls as the opportunities list. Accepting is what
// starts the client's advance payment; at zero the call center takes over.
export default function SellerAssignment({ o, aiBase, onRefresh }: { o: MarketOrder; aiBase: string; onRefresh: () => void }): ReactElement {
  const t = useTranslations("marketplace.orderDetail.assignment");
  const left = useCountdown(o.assignment?.deadlineAt ?? "", onRefresh);
  const counting = left !== null && left > 0;
  return (
    <SxPanel
      className="mcr mod-assign"
      title={t("title")}
      lead={left === null ? t("lead") : counting ? t("leadAdvance") : t("over")}
      actions={
        counting ? (
          <span className="mod-assign__clock sx-num" role="timer" aria-label={t("left", { time: clockOf(left) })}>
            {clockOf(left)}
          </span>
        ) : null
      }
      aiId={`${aiBase}.assignment`}
    >
      {o.note ? <blockquote className="mcr-quote">{o.note}</blockquote> : null}
      <div className="mod-assign__foot">
        <p className="mcr-meta">
          {o.price ? (
            <b className="sx-num">
              {fmtUzs(o.price)} <small>{t("som")}</small>
            </b>
          ) : null}
          {o.contactSpeedLabel ? <span>{o.contactSpeedLabel}</span> : null}
        </p>
        {left !== 0 ? <OrderActions orderId={o.id} aiBase={`${aiBase}.assignment`} onDone={() => onRefresh()} /> : null}
      </div>
    </SxPanel>
  );
}
