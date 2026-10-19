"use client";

import { useSyncExternalStore } from "react";
import type { UserEvent } from "@/lib/userSocket";
import { marketSignalOf } from "@/lib/services/marketplace";
import { normNegotiation, type Negotiation } from "@/lib/services/marketRuntime";
import { pickNegotiation } from "./negotiationRules";

type Dict = Record<string, unknown>;

const dictOf = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const filled = (d: Dict): boolean => Object.keys(d).length > 0;

const store = new Map<string, Negotiation>();
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const l of [...listeners]) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const keyOf = (owner: string, orderId: string): string => `${owner}|${orderId}`;

export function noteNegotiation(n: Negotiation, owner = ""): void {
  const orderId = n.orderId.trim();
  if (!orderId) return;
  const key = keyOf(owner, orderId);
  const next = pickNegotiation(store.get(key), n);
  if (!next) return;
  store.set(key, next);
  emitChange();
}

export function notedNegotiation(orderId: string, owner = ""): Negotiation | null {
  return store.get(keyOf(owner, orderId)) ?? null;
}

export function useNotedNegotiation(orderId: string, owner = ""): Negotiation | null {
  return useSyncExternalStore(
    subscribe,
    () => store.get(keyOf(owner, orderId)) ?? null,
    () => null,
  );
}

function candidatesOf(root: Dict): Dict[] {
  const data = dictOf(root.data);
  return [dictOf(root.negotiation), dictOf(data.negotiation), dictOf(data.payload), data, dictOf(root.payload), root].filter(filled);
}

const PRICE_KEYS = ["current_price", "order_price"];

function priceOf(dicts: Dict[]): Dict {
  const out: Dict = {};
  for (const k of PRICE_KEYS) {
    for (const d of dicts) {
      const v = d[k];
      if ((typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim())) {
        out[k] = v;
        break;
      }
    }
  }
  return out;
}

export function negotiationOfEvent(ev: UserEvent): Negotiation | null {
  const sig = marketSignalOf(ev);
  if (!sig || sig.kind !== "negotiation") return null;
  const roots: Dict[] = [ev];
  if (ev.event === "notification.created") roots.push(dictOf(dictOf(ev.notification).data));
  const cands = roots.flatMap(candidatesOf);
  for (const x of cands) {
    const n = normNegotiation(x);
    if (!n.id && !(n.amount > 0)) continue;
    const orderId = n.orderId || sig.orderId;
    if (!orderId) return null;
    const status = n.status || (sig.outcome ?? "").trim().toLowerCase();
    return { ...n, orderId, status, raw: { ...priceOf(cands), ...n.raw } };
  }
  return null;
}

export function noteNegotiationEvent(ev: UserEvent, owner = ""): void {
  const n = negotiationOfEvent(ev);
  if (n) noteNegotiation(n, owner);
}
