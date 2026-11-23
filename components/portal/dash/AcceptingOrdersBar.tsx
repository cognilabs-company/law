"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CirclePause, Inbox } from "lucide-react";
import { setAcceptingOrders } from "@/lib/services/backend";
import { notify } from "@/lib/toast";
import { refreshSellerCabinet } from "../SellerCabinet";

// BACKEND_FIXES_LIVE_2026-11-23: the seller's own "taking new orders" switch
// (PUT /lawyers/me/accepting-orders {enabled}). While it is off no new
// auto-assigned orders or urgent requests arrive, and the cabinet's
// available_actions.accept_orders turns false with it — so the cabinet is
// re-read after every change. Drawn as the dashboard's promo strip.
export default function AcceptingOrdersBar({ value }: { value: boolean }) {
  const t = useTranslations("lxSeller.accepting");
  // The seller's latest choice, until the cabinet catches up with it.
  const [mine, setMine] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const on = mine ?? value;

  async function toggle() {
    if (busy) return;
    const next = !on;
    setBusy(true);
    setMine(next);
    try {
      const saved = await setAcceptingOrders(next);
      setMine(saved);
      notify.success(saved ? t("turnedOn") : t("turnedOff"), { id: "seller-accepting" });
      refreshSellerCabinet();
    } catch (e) {
      setMine(null);
      notify.error(t("failed"), { id: "seller-accepting", error: e });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`lx-card lxs-promo lxs-accept${on ? "" : " is-off"}`} data-ai-target="seller-dashboard:accepting-orders">
      <div className="lxs-accept__main">
        <span className="lxs-promo__ic" aria-hidden>{on ? <Inbox /> : <CirclePause />}</span>
        <div className="lxs-promo__b">
          <b>{on ? t("onTitle") : t("offTitle")}</b>
          <p>{on ? t("onText") : t("offText")}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className="lxs-accept__sw"
        onClick={() => void toggle()}
        disabled={busy}
        aria-busy={busy || undefined}
        data-ai-id="seller-dashboard.accepting-orders.toggle"
      >
        <span className="lxs-accept__l">{t("label")}</span>
        <span className="lxs-accept__track" aria-hidden>
          <span />
        </span>
      </button>
    </section>
  );
}
