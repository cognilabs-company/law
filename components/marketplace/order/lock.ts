"use client";

import { ApiError } from "@/lib/http";
import { findMarketplaceOrder, getMarketplaceOrder, marketSignalOf, peekMarketOrder, type MarketOrder } from "@/lib/services/marketplace";
import { subscribeUserEvents } from "@/lib/userSocket";

export type OrderLock = { chatReadOnly: boolean; callsAllowed: boolean };

export const ORDER_LOCK_EVENT = "lexgo:market-lock";

const noted = new Map<string, OrderLock>();
const SEEN_FRESH_MS = 60_000;

export function lockOfOrder(o: Pick<MarketOrder, "chatReadOnly" | "callsAllowed">): OrderLock {
  return { chatReadOnly: o.chatReadOnly === true, callsAllowed: o.callsAllowed !== false };
}

export function noteOrderLock(orderId: string, lock: OrderLock): void {
  if (!orderId) return;
  noted.set(orderId, lock);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ORDER_LOCK_EVENT, { detail: { orderId, lock } }));
}

export function notedOrderLock(orderId: string): OrderLock | null {
  return noted.get(orderId) ?? null;
}

export function subscribeOrderLock(orderId: string, cb: (lock: OrderLock) => void): () => void {
  if (!orderId || typeof window === "undefined") return () => {};
  const onLock = (e: Event) => {
    const d = (e as CustomEvent<{ orderId?: string; lock?: OrderLock }>).detail;
    if (d?.orderId === orderId && d.lock) cb(d.lock);
  };
  window.addEventListener(ORDER_LOCK_EVENT, onLock);
  const off = subscribeUserEvents((ev) => {
    const sig = marketSignalOf(ev);
    if (sig?.kind === "completed" && sig.orderId === orderId) cb({ chatReadOnly: true, callsAllowed: false });
  });
  return () => {
    window.removeEventListener(ORDER_LOCK_EVENT, onLock);
    off();
  };
}

export async function roomOrderLock(room: { orderId: string; clientUserId?: string; sellerUserId?: string }, viewerId: string, signal?: AbortSignal): Promise<OrderLock | null> {
  if (!room.orderId) return null;
  const known = notedOrderLock(room.orderId);
  if (known) return known;
  const seen = peekMarketOrder(room.orderId, viewerId);
  if (seen) {
    const l = lockOfOrder(seen);
    if (l.chatReadOnly || !l.callsAllowed || peekMarketOrder(room.orderId, viewerId, SEEN_FRESH_MS)) return l;
  }
  try {
    const o = await getMarketplaceOrder(room.orderId, { signal, owner: viewerId });
    if (signal?.aborted) return null;
    if (o) return lockOfOrder(o);
  } catch (e) {
    if (signal?.aborted) return null;
    if (e instanceof ApiError && (e.status === 403 || (e.status === 404 && !!e.code))) return null;
  }
  const role = viewerId && viewerId === room.clientUserId ? "client" : viewerId && viewerId === room.sellerUserId ? "seller" : null;
  const views: ("client" | "seller")[] = role ? [role] : ["client", "seller"];
  for (const view of views) {
    if (signal?.aborted) return null;
    try {
      const o = await findMarketplaceOrder(room.orderId, view, { signal, maxPages: role ? 4 : 2, owner: viewerId });
      if (signal?.aborted) return null;
      if (o) return lockOfOrder(o);
    } catch {
      if (signal?.aborted) return null;
    }
  }
  return null;
}
