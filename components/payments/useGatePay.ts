"use client";

import { useState } from "react";
import { openCheckoutTab, sendCheckoutTab } from "@/lib/services/clickCheckout";
import { rememberPendingPayment } from "@/lib/services/paymentProviders";
import { renewCheckout } from "@/lib/services/planCheckout";

// Paying a fee the backend has put a gate on (a document review over the
// free pages, a paid document request — 2026-11-21 contract §1.3): the
// gate's own Click or ATMOS page, opened from the press in a new tab. With
// no link (the provider was down for a moment) a fresh one is asked for
// first (§1.2 step 3). Nothing is marked paid here: the request reaches the
// advocates when the provider confirms, and the screen reads it again.
export type GateToPay = { paymentId: string; amount: number; provider: string; paymentUrl: string };

export function useGatePay(gate: GateToPay | null, onOpened?: () => void) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const can = !!gate && (!!gate.paymentUrl || !!gate.paymentId);
  async function pay() {
    if (!gate || busy || !can) return;
    setFailed(false);
    const tab = openCheckoutTab();
    const go = (url: string) => {
      sendCheckoutTab(tab, url, () => rememberPendingPayment({ id: gate.paymentId, amount: gate.amount }));
      onOpened?.();
    };
    if (gate.paymentUrl) return go(gate.paymentUrl);
    setBusy(true);
    try {
      const url = await renewCheckout(gate.provider, gate.paymentId);
      if (url) go(url);
      else {
        tab?.close();
        setFailed(true);
      }
    } catch {
      tab?.close();
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return { can, busy, failed, pay };
}

// The provider's name for the button: "Click", "ATMOS", or "" (unknown).
export const gateProviderName = (p: string) => (p === "atmos" ? "ATMOS" : p === "click" ? "Click" : "");
