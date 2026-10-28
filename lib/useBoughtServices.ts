"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAborted, logApiError } from "@/lib/http";
import { listMarketplaceOrders, marketPhaseOf } from "@/lib/services/marketplace";
import { subscribeUserEvents } from "@/lib/userSocket";

// The services a signed-in client has already bought and not finished
// (waiting for payment, paid, in work or under review): their buy buttons
// become "already bought", linking to the order. A completed, rated or
// cancelled order lets the service be bought again. The backend still
// refuses a second active order (marketplace_order_already_active).

export type BoughtOrder = { id: string; workId: string; href: string };
const OPEN = new Set(["pending", "paid", "in_progress", "review"]);

export function useBoughtServices(enabled: boolean): { bought: ReadonlyMap<string, BoughtOrder>; refresh: () => void } {
  const [bought, setBought] = useState<ReadonlyMap<string, BoughtOrder>>(new Map());
  const [tick, setTick] = useState(0);
  const timer = useRef(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    listMarketplaceOrders("client", { signal: ctl.signal }).then(
      (orders) => {
        const map = new Map<string, BoughtOrder>();
        for (const o of orders) {
          if (!OPEN.has(marketPhaseOf(o))) continue;
          const key = o.serviceId || o.packageId;
          if (key && !map.has(key)) map.set(key, { id: o.id, workId: o.workId, href: `/portal/client/marketplace-orders/${encodeURIComponent(o.id)}` });
        }
        setBought(map);
      },
      (e) => {
        if (!isAborted(e)) logApiError("marketplace.bought", e);
      },
    );
    return () => ctl.abort();
  }, [enabled, tick]);

  // An order created, paid, finished or cancelled anywhere: read them again (once per burst).
  useEffect(() => {
    if (!enabled) return;
    const off = subscribeUserEvents((e) => {
      if (!/^marketplace\.|order_/.test(String(e.event ?? ""))) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(refresh, 600);
    });
    return () => {
      off();
      window.clearTimeout(timer.current);
    };
  }, [enabled, refresh]);

  return { bought: enabled ? bought : new Map(), refresh };
}
