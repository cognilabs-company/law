"use client";

import { useCallback, useSyncExternalStore } from "react";

// Order actions the backend refused this account (403) during this visit.
// Owner law 2026-11-08: an action the user may not do is not shown at all —
// so once a 403 answers it, that action leaves every place the order is
// shown (list card, detail page) and stays gone across the soft reloads that
// would otherwise bring the same button back from the order payload.
export type RefusedAction = "call" | "cancel" | "complete" | "supplemental" | "start" | "checklist" | "cancellationReview" | "complaint" | "rating" | "warranty" | "resolution";

const refused = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const keyOf = (orderId: string, action: RefusedAction) => `${orderId}\u0000${action}`;

export function markRefused(orderId: string, action: RefusedAction): void {
  if (!orderId) return;
  const k = keyOf(orderId, action);
  if (refused.has(k)) return;
  refused.add(k);
  version += 1;
  listeners.forEach((l) => l());
}

export function isRefused(orderId: string, action: RefusedAction): boolean {
  return !!orderId && refused.has(keyOf(orderId, action));
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const snapshot = () => version;
const serverSnapshot = () => 0;

// `const refusedFor = useRefused(); refusedFor(o.id, "cancel")` — re-renders
// when any action is refused.
export function useRefused(): (orderId: string, action: RefusedAction) => boolean {
  const v = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `v` re-creates the checker when the set changes.
  return useCallback((orderId: string, action: RefusedAction) => isRefused(orderId, action), [v]);
}
