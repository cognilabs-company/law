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
  return (
    <SxPanel className="mcr" title={t("title")} lead={left === null ? t("lead") : left > 0 ? t("left", { time: clockOf(left) }) : t("over")} aiId={`${aiBase}.assignment`}>
      {o.note ? <blockquote className="mcr-quote">{o.note}</blockquote> : null}
      <p className="mcr-meta">
        {[o.contactSpeedLabel, o.price ? `${fmtUzs(o.price)} ${t("som")}` : ""].filter(Boolean).join(" · ")}
      </p>
      {left !== 0 ? <OrderActions orderId={o.id} aiBase={`${aiBase}.assignment`} onDone={() => onRefresh()} /> : null}
    </SxPanel>
  );
}
