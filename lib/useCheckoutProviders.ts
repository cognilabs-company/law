"use client";

import { useEffect, useState } from "react";
import { logApiError } from "@/lib/http";
import { getCheckoutProviders, type CheckoutProvider, type CheckoutProviders } from "@/lib/services/paymentProviders";

// The checkout's payment options (GET /payments/providers): only the enabled
// ones, under the backend's own labels, asked once per page load. Until the
// answer comes — or when it fails — only the backend's usual fallback,
// Telegram confirmation, is offered.

const START: CheckoutProviders = { items: [{ provider: "telegram_manual", enabled: true, label: "", status: "ready" }], fallback: "telegram_manual" };
let shared: Promise<CheckoutProviders> | null = null;

export function useCheckoutProviders(): { options: CheckoutProvider[]; fallback: string; labelOf: (p: string) => string } {
  const [got, setGot] = useState<CheckoutProviders>(START);
  useEffect(() => {
    let alive = true;
    shared ??= getCheckoutProviders().catch((e) => {
      logApiError("payments.providers", e);
      shared = null;
      return START;
    });
    void shared.then((r) => {
      if (alive) setGot(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  const options = got.items.filter((p) => p.enabled);
  return {
    options: options.length ? options : START.items,
    fallback: got.fallback,
    labelOf: (p) => got.items.find((x) => x.provider === p)?.label ?? "",
  };
}
