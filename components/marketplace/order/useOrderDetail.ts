"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError, isAborted } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { loadMarketplaceOrder, marketPhaseOf, marketSignalOf, peekMarketOrder, type MarketOrder, type MarketPhase, type MarketSignal } from "@/lib/services/marketplace";
import { checklistOfEvent, getNegotiation, getOrderChecklist, getRuntimeConfig, getSecondOpinion, latestNegotiation, listOrderNegotiations, type OrderChecklist, type RuntimeConfig, type RuntimePlacement, type SecondOpinion } from "@/lib/services/marketRuntime";
import { negotiationOfEvent, noteNegotiation } from "./negotiationStore";
import { orderChannelOf, subscribeOrderChannel } from "./orderChannel";
import type { LoadState, OrderView } from "./types";

export type OrderDetail = {
  status: "loading" | "ready" | "missing" | "error";
  order: MarketOrder | null;
  phase: MarketPhase | null;
  checklist: OrderChecklist | null;
  checklistState: LoadState;
  opinion: SecondOpinion | null;
  opinionState: LoadState;
  runtime: RuntimeConfig | null;
  refreshing: boolean;
  lastSignal: MarketSignal | null;
  changed: number;
  fresh: boolean;
  refresh: (what?: "all" | "order" | "checklist" | "opinion" | "negotiation") => void;
  patchOrder: (patch: Partial<MarketOrder>) => void;
  setChecklist: (next: OrderChecklist) => void;
};

type Res = "order" | "checklist" | "opinion" | "negotiation";

const SETTLE_MS = 400;
const WORK_PHASES: ReadonlySet<MarketPhase> = new Set<MarketPhase>(["in_progress", "review", "completed", "rated"]);
const LIVE_PHASES: ReadonlySet<MarketPhase> = new Set<MarketPhase>(["in_progress", "review"]);

export function mergeLiveChecklist(cur: OrderChecklist | null, next: OrderChecklist): OrderChecklist {
  if (!cur) return next;
  return {
    ...next,
    realtimeChannel: next.realtimeChannel || cur.realtimeChannel,
    fileUpload: next.fileUpload ?? cur.fileUpload ?? null,
    snapshotLocked: next.snapshotLocked ?? cur.snapshotLocked ?? null,
  };
}

export function placementOf(phase: MarketPhase | null): RuntimePlacement {
  if (phase === "pending") return "negotiation";
  if (phase === "in_progress" || phase === "review") return "in_progress";
  return "post_payment_order";
}

const phaseOfOrder = (o: MarketOrder | null): MarketPhase | null => (o ? marketPhaseOf(o) : null);

const isMissing = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405);

const wantsNegotiation = (o: MarketOrder | null): boolean => !!o && marketPhaseOf(o) === "pending" && (o.canNegotiate === true || !!o.negotiation || !!o.urls.negotiations || o.negotiationAvailable === true);

function routeOf(sig: MarketSignal): Res[] {
  if (sig.kind === "checklist") return ["checklist"];
  if (sig.kind === "started") return ["order", "checklist"];
  if (sig.kind === "completed") return ["order", "checklist", "opinion"];
  if (sig.kind === "negotiation") return ["negotiation", "order"];
  return ["order"];
}

function visibleChange(a: MarketOrder, b: MarketOrder): boolean {
  return a.status !== b.status || a.price !== b.price || a.startedAt !== b.startedAt || a.expectedCompletedAt !== b.expectedCompletedAt;
}

export function useOrderDetail(orderId: string, view: OrderView): OrderDetail {
  const owner = useAuth().session?.id ?? "";
  const key = `${view}|${orderId}`;
  const [prevKey, setPrevKey] = useState(key);
  const [order, setOrder] = useState<MarketOrder | null>(() => peekMarketOrder(orderId, owner));
  const [status, setStatus] = useState<OrderDetail["status"]>(() => (peekMarketOrder(orderId, owner) ? "ready" : "loading"));
  const [checklist, setChecklistState] = useState<OrderChecklist | null>(null);
  const [checklistState, setChecklistLoad] = useState<LoadState>("idle");
  const [opinion, setOpinion] = useState<SecondOpinion | null>(null);
  const [opinionState, setOpinionLoad] = useState<LoadState>("idle");
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSignal, setLastSignal] = useState<MarketSignal | null>(null);
  const [changed, setChanged] = useState(0);
  const [fresh, setFresh] = useState(false);

  if (key !== prevKey) {
    const seed = peekMarketOrder(orderId, owner);
    setPrevKey(key);
    setOrder(seed);
    setStatus(seed ? "ready" : "loading");
    setChecklistState(null);
    setChecklistLoad("idle");
    setOpinion(null);
    setOpinionLoad("idle");
    setRuntime(null);
    setRefreshing(false);
    setLastSignal(null);
    setChanged(0);
    setFresh(false);
  }

  const orderRef = useRef<MarketOrder | null>(null);
  const ownerRef = useRef(owner);
  const checklistLoadRef = useRef<LoadState>("idle");
  const opinionLoadRef = useRef<LoadState>("idle");
  const inflight = useRef<Promise<void> | null>(null);
  const seqs = useRef<Record<Res, number>>({ order: 0, checklist: 0, opinion: 0, negotiation: 0 });
  const ctrls = useRef<Partial<Record<Res, AbortController>>>({});
  const timers = useRef<Partial<Record<Res, ReturnType<typeof setTimeout>>>>({});
  const alive = useRef(false);
  const runRef = useRef<(r: Res) => void>(() => {});
  const waiting = useRef<Record<Res, boolean>>({ order: false, checklist: false, opinion: false, negotiation: false });
  const negotiationLoaded = useRef(false);
  const negotiationId = useRef("");
  const onEventRef = useRef<(ev: Record<string, unknown> & { event: string }) => void>(() => {});

  const begin = useCallback((r: Res) => {
    ctrls.current[r]?.abort();
    const ctrl = new AbortController();
    ctrls.current[r] = ctrl;
    const my = ++seqs.current[r];
    return { ctrl, ok: () => alive.current && my === seqs.current[r] && !ctrl.signal.aborted };
  }, []);

  const queued = useCallback((r: Res) => waiting.current[r] || !!timers.current[r], []);

  const commitOrder = useCallback((next: MarketOrder | null) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  const schedule = useCallback((r: Res, delay = SETTLE_MS) => {
    const prev = timers.current[r];
    if (prev) clearTimeout(prev);
    timers.current[r] = setTimeout(() => {
      delete timers.current[r];
      runRef.current(r);
    }, delay);
  }, []);

  const loadOrder = useCallback(async () => {
    const { ctrl, ok } = begin("order");
    const shown = orderRef.current;
    if (shown) setRefreshing(true);
    try {
      const found = await loadMarketplaceOrder(orderId, view, { signal: ctrl.signal, owner: ownerRef.current });
      if (!ok()) return;
      setFresh(true);
      if (!found) {
        commitOrder(null);
        setStatus("missing");
        return;
      }
      const before = orderRef.current;
      commitOrder(found);
      setStatus("ready");
      if (before && visibleChange(before, found)) setChanged((n) => n + 1);
      const phase = marketPhaseOf(found);
      if (!negotiationLoaded.current && wantsNegotiation(found) && !queued("negotiation")) schedule("negotiation", 0);
      if (WORK_PHASES.has(phase)) {
        if (checklistLoadRef.current === "idle" && !queued("checklist")) schedule("checklist", 0);
        if (view === "client" && opinionLoadRef.current === "idle" && !queued("opinion")) schedule("opinion", 0);
      }
    } catch (e) {
      if (!ok() || isAborted(e)) return;
      setFresh(true);
      if (!orderRef.current) setStatus("error");
    } finally {
      if (ok()) setRefreshing(false);
    }
  }, [orderId, view, begin, commitOrder, queued, schedule]);

  const setCl = useCallback((s: LoadState) => {
    checklistLoadRef.current = s;
    setChecklistLoad(s);
  }, []);

  const setOp = useCallback((s: LoadState) => {
    opinionLoadRef.current = s;
    setOpinionLoad(s);
  }, []);

  const loadChecklist = useCallback(async () => {
    waiting.current.checklist = true;
    if (inflight.current) await inflight.current.catch(() => {});
    waiting.current.checklist = false;
    if (!alive.current) return;
    const phase = phaseOfOrder(orderRef.current);
    if (!phase || !WORK_PHASES.has(phase)) return;
    const { ctrl, ok } = begin("checklist");
    if (checklistLoadRef.current !== "ready") setCl("loading");
    try {
      const c = await getOrderChecklist(orderId, ctrl.signal, orderRef.current?.urls.checklist);
      if (!ok()) return;
      setChecklistState(c);
      setCl(c.items.length ? "ready" : "none");
    } catch (e) {
      if (!ok() || isAborted(e)) return;
      if (isMissing(e)) {
        setChecklistState(null);
        setCl("none");
      } else if (checklistLoadRef.current !== "ready") setCl("error");
    }
  }, [orderId, begin, setCl]);

  const loadOpinion = useCallback(async () => {
    if (view !== "client") return;
    waiting.current.opinion = true;
    if (inflight.current) await inflight.current.catch(() => {});
    waiting.current.opinion = false;
    if (!alive.current) return;
    const phase = phaseOfOrder(orderRef.current);
    if (!phase || !WORK_PHASES.has(phase)) return;
    const { ctrl, ok } = begin("opinion");
    if (opinionLoadRef.current !== "ready") setOp("loading");
    try {
      const op = await getSecondOpinion(orderId, ctrl.signal, orderRef.current?.urls.secondOpinion);
      if (!ok()) return;
      setOpinion(op);
      setOp("ready");
    } catch (e) {
      if (!ok() || isAborted(e)) return;
      if (isMissing(e)) {
        setOpinion(null);
        setOp("none");
      } else if (opinionLoadRef.current !== "ready") setOp("error");
    }
  }, [orderId, view, begin, setOp]);

  const loadNegotiation = useCallback(async () => {
    waiting.current.negotiation = true;
    if (inflight.current) await inflight.current.catch(() => {});
    waiting.current.negotiation = false;
    if (!alive.current) return;
    const cur = orderRef.current;
    const id = negotiationId.current;
    negotiationId.current = "";
    if (!id && !wantsNegotiation(cur)) return;
    const { ctrl, ok } = begin("negotiation");
    try {
      const n = id ? await getNegotiation(id, ctrl.signal) : latestNegotiation((await listOrderNegotiations(orderId, ctrl.signal, cur?.urls.negotiations)).items);
      if (!ok()) return;
      negotiationLoaded.current = true;
      if (!n || (!n.id && !(n.amount > 0))) return;
      const filled = n.orderId ? n : { ...n, orderId };
      noteNegotiation(filled, ownerRef.current);
      const shown = orderRef.current;
      if (shown) commitOrder({ ...shown, negotiation: filled });
    } catch (e) {
      if (!ok() || isAborted(e)) return;
      if (isMissing(e)) negotiationLoaded.current = true;
    }
  }, [orderId, begin, commitOrder]);

  useEffect(() => {
    runRef.current = (r: Res) => {
      if (r === "negotiation") {
        void loadNegotiation();
        return;
      }
      if (r === "order") {
        const p = loadOrder();
        inflight.current = p;
        void p.finally(() => {
          if (inflight.current === p) inflight.current = null;
        });
      } else if (r === "checklist") void loadChecklist();
      else void loadOpinion();
    };
  }, [loadOrder, loadChecklist, loadOpinion, loadNegotiation]);

  const refresh = useCallback(
    (what: "all" | Res = "all") => {
      if (what === "all") {
        schedule("order", 0);
        schedule("checklist", 0);
        schedule("opinion", 0);
      } else schedule(what, 0);
    },
    [schedule],
  );

  useEffect(() => {
    ownerRef.current = owner;
  });

  useEffect(() => {
    alive.current = true;
    const seed = peekMarketOrder(orderId, ownerRef.current);
    orderRef.current = seed;
    checklistLoadRef.current = "idle";
    opinionLoadRef.current = "idle";
    inflight.current = null;
    waiting.current = { order: false, checklist: false, opinion: false, negotiation: false };
    negotiationLoaded.current = false;
    negotiationId.current = "";
    const ctl = ctrls.current;
    const tm = timers.current;
    schedule("order", 0);
    schedule("checklist", 0);
    schedule("opinion", 0);
    const offEvents = subscribeUserEvents((ev) => onEventRef.current(ev));
    onEventRef.current = (ev) => {
      const sig = marketSignalOf(ev);
      if (!sig) return;
      const cur = orderRef.current;
      const ours = sig.orderId ? sig.orderId === orderId : !!(cur && sig.workId && sig.workId === cur.workId);
      if (!ours) return;
      setLastSignal(sig);
      if (sig.kind === "checklist") {
        const live = checklistOfEvent(ev, orderId);
        if (live) {
          ctrls.current.checklist?.abort();
          seqs.current.checklist += 1;
          setChecklistState((prev) => mergeLiveChecklist(prev, live));
          setCl(live.items.length ? "ready" : "none");
          return;
        }
      }
      if (sig.kind === "negotiation") {
        const full = negotiationOfEvent(ev);
        if (full && full.amount > 0) {
          noteNegotiation(full, ownerRef.current);
          const shown = orderRef.current;
          if (shown) commitOrder({ ...shown, negotiation: full });
          schedule("order");
          return;
        }
        negotiationId.current = sig.negotiationId ?? "";
      }
      for (const r of routeOf(sig)) schedule(r);
    };
    const offResync = onUserSocketResync(() => {
      negotiationLoaded.current = false;
      schedule("order", 0);
      schedule("checklist", 0);
      schedule("opinion", 0);
    });
    return () => {
      alive.current = false;
      onEventRef.current = () => {};
      offEvents();
      offResync();
      for (const r of Object.keys(tm) as Res[]) {
        const h = tm[r];
        if (h) clearTimeout(h);
        delete tm[r];
      }
      for (const r of Object.keys(ctl) as Res[]) {
        ctl[r]?.abort();
        delete ctl[r];
      }
    };
  }, [orderId, view, schedule, commitOrder, setCl]);

  const serviceId = order?.serviceId ?? "";
  const phase = phaseOfOrder(order);
  const placement = placementOf(phase);

  useEffect(() => {
    if (!serviceId) return;
    const ctrl = new AbortController();
    getRuntimeConfig(serviceId, placement, ctrl.signal)
      .then((r) => {
        if (!ctrl.signal.aborted) setRuntime(r);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setRuntime(null);
      });
    return () => ctrl.abort();
  }, [serviceId, placement]);

  const patchOrder = useCallback(
    (patch: Partial<MarketOrder>) => {
      const cur = orderRef.current;
      if (!cur) return;
      const next = { ...cur, ...patch };
      commitOrder(next);
      const ph = marketPhaseOf(next);
      if (WORK_PHASES.has(ph)) {
        if (checklistLoadRef.current === "idle" && !queued("checklist")) schedule("checklist");
        if (view === "client" && opinionLoadRef.current === "idle" && !queued("opinion")) schedule("opinion");
      }
      schedule("order");
    },
    [commitOrder, queued, schedule, view],
  );

  const setChecklist = useCallback(
    (next: OrderChecklist) => {
      setChecklistState(next);
      setCl(next.items.length ? "ready" : "none");
    },
    [setCl],
  );

  const liveChannel = phase && LIVE_PHASES.has(phase) ? orderChannelOf(checklist?.realtimeChannel ?? "", orderId) : "";

  useEffect(() => {
    if (!liveChannel) return;
    return subscribeOrderChannel(liveChannel, (ev) => onEventRef.current(ev));
  }, [liveChannel]);

  return {
    status,
    order,
    phase,
    checklist,
    checklistState,
    opinion,
    opinionState,
    runtime: serviceId ? runtime : null,
    refreshing,
    lastSignal,
    changed,
    fresh,
    refresh,
    patchOrder,
    setChecklist,
  };
}
