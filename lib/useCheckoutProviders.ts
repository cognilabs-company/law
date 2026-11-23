"use client";

import { useEffect, useState } from "react";
import { logApiError } from "@/lib/http";
import { getCheckoutProviders, type CheckoutProvider, type CheckoutProviders } from "@/lib/services/paymentProviders";

// The checkout's payment options (GET /payments/providers): only the enabled
// ones (Click, ATMOS), under the backend's own labels, asked once per page
// load. Until the answer comes — or when it fails — nothing is offered and
// the request names no provider: the backend then picks Click, or ATMOS when
// Click is off (2026-11-21 contract §1.1). A refusal that says a provider is
// not configured asks the list again (Click integration §14).

const START: CheckoutProviders = { items: [], fallback: "click" };
let shared: Promise<CheckoutProviders> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function load(): Promise<CheckoutProviders> {
  shared ??= getCheckoutProviders().catch((e) => {
    logApiError("payments.providers", e);
    shared = null;
    return START;
  });
  return shared;
}

// Forget the answer and ask again; every open checkout picks up the new list.
export function refreshCheckoutProviders(): void {
  shared = null;
  version += 1;
  for (const l of listeners) l();
}

export function useCheckoutProviders(): { options: CheckoutProvider[]; fallback: string; labelOf: (p: string) => string; ready: boolean; has: (p: string) => boolean } {
  const [got, setGot] = useState<{ v: CheckoutProviders; ready: boolean }>({ v: START, ready: false });
  const [ver, setVer] = useState(version);
  useEffect(() => {
    const l = () => setVer(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    void load().then((r) => {
      if (alive) setGot({ v: r, ready: true });
    });
    return () => {
      alive = false;
    };
  }, [ver]);
  const enabled = got.v.items.filter((p) => p.enabled);
  return {
    options: enabled,
    fallback: got.v.fallback,
    labelOf: (p) => got.v.items.find((x) => x.provider === p)?.label ?? "",
    ready: got.ready,
    has: (p) => enabled.some((x) => x.provider === p),
  };
}
