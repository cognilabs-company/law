"use client";

import { useEffect, useState } from "react";
import { ApiError, isAborted } from "./http";
import { onUserSocketResync, subscribeUserEvents } from "./userSocket";
import {
  findMarketOrder,
  holdMarketOrder,
  listMarketplaceOrders,
  marketSignalOf,
  phaseOfStatus,
  trackPhaseOf,
  type MarketTrackPhase,
} from "./services/marketplace";

const BASE_MS = 4000;
const CAP_MS = 15000;
const FAIL_CAP_MS = 60000;
const SETTLE_MS = 500;
const PENDING_BUDGET_MS = 15 * 60 * 1000;
const PAID_NO_ROOM_MS = 60 * 1000;
const FAILS_TO_OFFLINE = 3;

type Snap = { key: string; phase: MarketTrackPhase; roomId: string; slow: boolean; offline: boolean; ended: boolean };

export type MarketOrderTrack = {
  phase: MarketTrackPhase;
  roomId: string;
  slow: boolean;
  offline: boolean;
  ended: boolean;
  recheck: () => void;
};

const RANK: Record<MarketTrackPhase, number> = { pending: 0, paid: 1, chat: 2, completed: 3, cancelled: 3 };

const isFinal = (p: MarketTrackPhase) => p === "completed" || p === "cancelled";

function seedSnap(key: string, status: string): Snap {
  return { key, phase: phaseOfStatus(status), roomId: "", slow: false, offline: false, ended: false };
}

function mergeSnap(s: Snap, next: { phase: MarketTrackPhase; roomId: string } | null): Snap {
  if (!next || isFinal(s.phase)) return s;
  const phase = next.phase === "cancelled" || RANK[next.phase] > RANK[s.phase] ? next.phase : s.phase;
  const roomId = next.roomId || s.roomId;
  if (phase === s.phase && roomId === s.roomId) return s;
  return { ...s, phase, roomId, slow: phase === s.phase ? s.slow : false };
}

export function useMarketOrderTracker(orderId: string, workId: string, initialStatus: string): MarketOrderTrack | null {
  const key = orderId || workId ? `${orderId}|${workId}` : "";
  const [state, setState] = useState<Snap | null>(null);
  const [nudge, setNudge] = useState({ key: "", n: 0 });
  const snap = key ? (state && state.key === key ? state : seedSnap(key, initialStatus)) : null;
  const phase = snap?.phase ?? "pending";
  const ended = snap?.ended ?? false;
  const bumps = nudge.key === key ? nudge.n : 0;

  useEffect(() => holdMarketOrder(orderId), [orderId]);

  useEffect(() => {
    if (!key || ended || phase === "chat" || isFinal(phase)) return;
    const seed = seedSnap(key, initialStatus);
    const apply = (f: (s: Snap) => Snap) => setState((cur) => f(cur && cur.key === key ? cur : seed));
    const ctrl = new AbortController();
    const started = Date.now();
    const budget = phase === "paid" ? PAID_NO_ROOM_MS : PENDING_BUDGET_MS;
    let alive = true;
    let inFlight = false;
    let again = false;
    let failures = 0;
    let delay = BASE_MS;
    let timer = 0;

    const arm = (ms: number, forced: boolean) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (forced ? check() : tick()), ms);
    };
    const tick = () => {
      if (!alive || document.visibilityState !== "visible") return;
      if (Date.now() - started > budget) {
        apply((s) => (s.slow ? s : { ...s, slow: true }));
        return;
      }
      check();
    };
    const check = () => {
      if (!alive) return;
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      listMarketplaceOrders("client", { signal: ctrl.signal })
        .then((list) => {
          if (!alive) return;
          failures = 0;
          delay = Math.min(Math.round(delay * 1.5), CAP_MS);
          const o = findMarketOrder(list, orderId, workId);
          const next = o ? { phase: trackPhaseOf(o), roomId: o.canStartChat ? o.roomId : "" } : null;
          apply((s) => {
            const m = mergeSnap(s, next);
            return m.offline ? { ...m, offline: false } : m;
          });
        })
        .catch((e: unknown) => {
          if (!alive || isAborted(e)) return;
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            apply((s) => (s.ended ? s : { ...s, ended: true }));
            return;
          }
          failures += 1;
          delay = Math.min(delay * 2, FAIL_CAP_MS);
          if (failures >= FAILS_TO_OFFLINE) apply((s) => (s.offline ? s : { ...s, offline: true }));
        })
        .finally(() => {
          inFlight = false;
          if (!alive) return;
          if (again) {
            again = false;
            check();
          } else arm(delay, false);
        });
    };
    const kick = () => {
      if (!alive) return;
      delay = BASE_MS;
      arm(SETTLE_MS, true);
    };
    const offEvents = subscribeUserEvents((ev) => {
      const sig = marketSignalOf(ev);
      if (!sig) return;
      const mine = (!!orderId && sig.orderId === orderId) || (!!workId && sig.workId === workId);
      if (sig.orderId && !mine) return;
      if (mine && sig.kind === "requested") return;
      if (mine && sig.kind === "paid" && sig.roomId) {
        const roomId = sig.roomId;
        apply((s) => mergeSnap(s, { phase: "chat", roomId }));
        return;
      }
      if (mine && sig.kind === "rejected") {
        apply((s) => mergeSnap(s, { phase: "cancelled", roomId: "" }));
        return;
      }
      kick();
    });
    const offResync = onUserSocketResync(kick);
    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", kick);
    window.addEventListener("online", kick);
    const now = bumps > 0 || (phase === "paid" && phaseOfStatus(initialStatus) === "paid");
    arm(now ? 0 : BASE_MS, true);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      ctrl.abort();
      offEvents();
      offResync();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", kick);
      window.removeEventListener("online", kick);
    };
  }, [key, orderId, workId, initialStatus, phase, ended, bumps]);

  if (!snap) return null;

  const recheck = () => {
    setState((cur) => {
      const base = cur && cur.key === key ? cur : seedSnap(key, initialStatus);
      return base.slow || base.offline ? { ...base, slow: false, offline: false } : base;
    });
    setNudge((cur) => ({ key, n: (cur.key === key ? cur.n : 0) + 1 }));
  };

  return { phase: snap.phase, roomId: snap.roomId, slow: snap.slow, offline: snap.offline, ended: snap.ended, recheck };
}
