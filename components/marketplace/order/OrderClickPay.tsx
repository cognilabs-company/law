"use client";

import type { ReactElement } from "react";
import { ClickPayPanel } from "@/components/payments/ClickPay";
import type { MarketOrder } from "@/lib/services/marketplace";
import { SECTION_ID } from "./types";

// An unpaid Click order, paid from its own page (Click web contract
// 2026-11-17 §6, §7, §10): after a refresh, a new sign-in or a closed dialog
// the client finds "Pay with Click" here, on the same order — no second one
// is made. The checkout link is always asked anew from the backend (POST
// /payments/{id}/click/checkout): the one from the purchase may be spent.
// The state is read from this order (GET /marketplace/me/orders/{order_id});
// once the backend settles it, the page reads the order again and moves on to
// the seller's 30 minutes.
export default function OrderClickPay({ o, aiBase, onChanged }: { o: MarketOrder; aiBase: string; onChanged: () => void }): ReactElement | null {
  const p = o.fullPayment;
  if (!p) return null;
  return (
    <div id={SECTION_ID.pay} tabIndex={-1} className="odx-pay">
      <ClickPayPanel
        key={p.id}
        payment={{ id: p.id, status: p.status, amount: p.amount || o.price, currency: p.currency, provider: "click", url: "" }}
        orderId={o.id}
        title={o.serviceTitle || o.packageTitle}
        onSettled={onChanged}
        onStale={onChanged}
        aiId={`${aiBase}.click`}
      />
    </div>
  );
}
