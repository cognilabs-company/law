import { useEffect, useId, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { marketSignalOf } from "@/lib/services/marketplace";
import { acceptServiceRule, listServiceRules, marketErrorInfo, type ServiceRule } from "@/lib/services/marketRuntime";

export type RulesGateStatus = "idle" | "loading" | "ready" | "error" | "denied";
export type RulesListState = { allAccepted: boolean | null; ruleIds: string[]; at: number; status: RulesGateStatus };
export type RulesDrawerState = { open: boolean; focusIds: string[]; serviceId: string; host: string };
export type RulesGateSnapshot = {
  uid: string;
  status: RulesGateStatus;
  allAccepted: boolean | null;
  closed: boolean;
  rules: ServiceRule[];
  missing: ServiceRule[];
  lists: Readonly<Record<string, RulesListState>>;
  drawer: RulesDrawerState;
  accepting: readonly string[];
  acceptErrors: Readonly<Record<string, string>>;
  lastAccepted: string;
};

export const RULES_TTL_MS = 10 * 60 * 1000;

const CLOSED_DRAWER: RulesDrawerState = Object.freeze({ open: false, focusIds: [], serviceId: "", host: "" }) as RulesDrawerState;

const EMPTY: RulesGateSnapshot = Object.freeze({
  uid: "",
  status: "idle",
  allAccepted: null,
  closed: false,
  rules: [],
  missing: [],
  lists: Object.freeze({}),
  drawer: CLOSED_DRAWER,
  accepting: [],
  acceptErrors: Object.freeze({}),
  lastAccepted: "",
}) as RulesGateSnapshot;

type Flight = { promise: Promise<void>; again: boolean };

type Store = {
  gen: number;
  uid: string;
  lists: Record<string, RulesListState>;
  items: Map<string, ServiceRule>;
  drawer: RulesDrawerState;
  accepting: string[];
  acceptErrors: Record<string, string>;
  lastAccepted: string;
  flights: Map<string, Flight>;
};

const store: Store = {
  gen: 0,
  uid: "",
  lists: {},
  items: new Map(),
  drawer: CLOSED_DRAWER,
  accepting: [],
  acceptErrors: {},
  lastAccepted: "",
  flights: new Map(),
};

const listeners = new Set<() => void>();
let snap: RulesGateSnapshot = EMPTY;
let dirty = false;
const hosts: string[] = [];

const timeOf = (iso: string): number => {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
};

const byEffective = (a: ServiceRule, b: ServiceRule): number => timeOf(a.effectiveAt) - timeOf(b.effectiveAt) || a.title.localeCompare(b.title);

function build(): RulesGateSnapshot {
  const rules = [...store.items.values()].sort(byEffective);
  const missing = rules.filter((r) => !r.accepted);
  const answered = Object.values(store.lists).filter((l) => l.status === "ready" && l.allAccepted !== null);
  const allAccepted = answered.length ? answered.every((l) => l.allAccepted === true) : null;
  const head = store.lists[""];
  return {
    uid: store.uid,
    status: head ? head.status : "idle",
    allAccepted,
    closed: allAccepted === false,
    rules,
    missing,
    lists: { ...store.lists },
    drawer: store.drawer,
    accepting: [...store.accepting],
    acceptErrors: { ...store.acceptErrors },
    lastAccepted: store.lastAccepted,
  };
}

function emit(): void {
  dirty = true;
  for (const fn of [...listeners]) fn();
}

export function subscribeRulesGate(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function rulesGateSnapshot(): RulesGateSnapshot {
  if (dirty) {
    dirty = false;
    snap = store.uid || store.drawer.open || store.items.size ? build() : EMPTY;
  }
  return snap;
}

const serverSnapshot = (): RulesGateSnapshot => EMPTY;

export function useRulesGateState(): RulesGateSnapshot {
  return useSyncExternalStore(subscribeRulesGate, rulesGateSnapshot, serverSnapshot);
}

let realtimeRefs = 0;
let realtimeOff: (() => void) | null = null;

function refetchAll(): void {
  const keys = Object.keys(store.lists);
  if (!keys.includes("")) keys.unshift("");
  for (const k of keys) void refreshRulesGate({ serviceId: k, force: true });
}

function retainRealtime(): () => void {
  realtimeRefs += 1;
  if (realtimeRefs === 1) {
    const offEvents = subscribeUserEvents((ev) => {
      if (store.uid && marketSignalOf(ev)?.kind === "rules") refetchAll();
    });
    const offResync = onUserSocketResync(() => {
      if (store.uid) refetchAll();
    });
    realtimeOff = () => {
      offEvents();
      offResync();
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    realtimeRefs = Math.max(0, realtimeRefs - 1);
    if (!realtimeRefs && realtimeOff) {
      realtimeOff();
      realtimeOff = null;
    }
  };
}

function adoptUid(uid: string): void {
  if (store.uid === uid) return;
  resetRulesGate();
  store.uid = uid;
  emit();
}

export function useRulesGate(uid: string): RulesGateSnapshot {
  const s = useSyncExternalStore(subscribeRulesGate, rulesGateSnapshot, serverSnapshot);
  useEffect(() => {
    if (!uid) return;
    adoptUid(uid);
    void refreshRulesGate();
    return retainRealtime();
  }, [uid]);
  return uid && s.uid === uid ? s : EMPTY;
}

const isFresh = (l: RulesListState | undefined): boolean => !!l && (l.status === "ready" || l.status === "denied") && Date.now() - l.at < RULES_TTL_MS;

async function fetchList(key: string, gen: number): Promise<void> {
  const prev = store.lists[key];
  if (!prev || prev.status === "idle" || prev.status === "error") {
    store.lists = { ...store.lists, [key]: { allAccepted: prev?.allAccepted ?? null, ruleIds: prev?.ruleIds ?? [], at: prev?.at ?? 0, status: "loading" } };
    emit();
  }
  try {
    const r = await listServiceRules(key || undefined);
    if (gen !== store.gen) return;
    const items = new Map(store.items);
    for (const rule of r.items) if (rule.id) items.set(rule.id, rule);
    store.items = items;
    store.lists = { ...store.lists, [key]: { allAccepted: r.allAccepted, ruleIds: r.items.map((x) => x.id).filter(Boolean), at: Date.now(), status: "ready" } };
    emit();
  } catch (e) {
    if (gen !== store.gen) return;
    const cur = store.lists[key];
    const denied = e instanceof ApiError && (e.status === 401 || e.status === 403);
    if (denied) {
      store.lists = { ...store.lists, [key]: { allAccepted: null, ruleIds: [], at: Date.now(), status: "denied" } };
    } else if (cur && cur.allAccepted !== null && cur.at > 0) {
      store.lists = { ...store.lists, [key]: { ...cur, status: "ready" } };
    } else {
      store.lists = { ...store.lists, [key]: { allAccepted: null, ruleIds: [], at: Date.now(), status: "error" } };
    }
    emit();
  }
}

export function refreshRulesGate(opts: { serviceId?: string; force?: boolean } = {}): Promise<void> {
  if (!store.uid) return Promise.resolve();
  const key = (opts.serviceId ?? "").trim();
  const running = store.flights.get(key);
  if (running) {
    if (opts.force) running.again = true;
    return running.promise;
  }
  if (!opts.force && isFresh(store.lists[key])) return Promise.resolve();
  const gen = store.gen;
  const flight: Flight = { promise: Promise.resolve(), again: false };
  flight.promise = (async () => {
    try {
      do {
        flight.again = false;
        await fetchList(key, gen);
      } while (flight.again && gen === store.gen);
    } finally {
      if (store.flights.get(key) === flight) store.flights.delete(key);
    }
  })();
  store.flights.set(key, flight);
  return flight.promise;
}

function missingOf(key: string): string[] {
  const list = store.lists[key];
  if (!list) return [];
  return list.ruleIds.filter((id) => store.items.get(id)?.accepted === false);
}

export async function ensureServiceRules(serviceId: string): Promise<{ allAccepted: boolean | null; missingIds: string[] }> {
  const key = serviceId.trim();
  if (!key) return { allAccepted: null, missingIds: [] };
  if (!isFresh(store.lists[key])) {
    try {
      await refreshRulesGate({ serviceId: key });
    } catch {
      return { allAccepted: null, missingIds: [] };
    }
  }
  const list = store.lists[key];
  if (!list || list.status !== "ready") return { allAccepted: null, missingIds: [] };
  return { allAccepted: list.allAccepted, missingIds: missingOf(key) };
}

export function openRulesDrawer(input: { focusIds?: string[]; serviceId?: string } = {}): void {
  const focusIds = [...new Set((input.focusIds ?? []).map((x) => x.trim()).filter(Boolean))];
  const serviceId = (input.serviceId ?? "").trim();
  store.drawer = { open: true, focusIds, serviceId, host: hosts[0] ?? "" };
  store.acceptErrors = {};
  const stale = focusIds.filter((id) => store.items.get(id)?.accepted !== false);
  if (stale.length) {
    const items = new Map(store.items);
    for (const id of stale) {
      const item = items.get(id);
      if (item) items.set(id, { ...item, accepted: false, acceptedAt: "" });
    }
    store.items = items;
    const lists = { ...store.lists };
    for (const key of [serviceId, ""]) {
      const l = lists[key];
      if (l && l.ruleIds.some((id) => stale.includes(id))) lists[key] = { ...l, allAccepted: false };
    }
    store.lists = lists;
  }
  emit();
  void refreshRulesGate({ force: true });
  if (serviceId) void refreshRulesGate({ serviceId, force: true });
}

export function closeRulesDrawer(): void {
  if (!store.drawer.open) return;
  store.drawer = CLOSED_DRAWER;
  store.acceptErrors = {};
  emit();
}

export async function acceptRule(ruleId: string): Promise<boolean> {
  const id = ruleId.trim();
  if (!id || store.accepting.includes(id)) return false;
  const gen = store.gen;
  store.accepting = [...store.accepting, id];
  store.acceptErrors = Object.fromEntries(Object.entries(store.acceptErrors).filter(([k]) => k !== id));
  emit();
  try {
    const res = await acceptServiceRule(id);
    if (gen !== store.gen) return false;
    if (!res.accepted) throw new Error("not accepted");
    const base = res.rule ?? store.items.get(id);
    if (base) {
      const items = new Map(store.items);
      items.set(id, { ...base, id, accepted: true, acceptedAt: res.acceptedAt || base.acceptedAt || new Date().toISOString() });
      store.items = items;
    }
    const lists: Record<string, RulesListState> = {};
    for (const [k, l] of Object.entries(store.lists)) {
      if (l.status !== "ready") {
        lists[k] = l;
        continue;
      }
      const every = l.ruleIds.every((rid) => store.items.get(rid)?.accepted !== false);
      lists[k] = res.allAccepted === true || (l.allAccepted === false && every) ? { ...l, allAccepted: true } : l;
    }
    store.lists = lists;
    store.lastAccepted = id;
    store.accepting = store.accepting.filter((x) => x !== id);
    emit();
    if (![...store.items.values()].some((r) => !r.accepted)) refetchAll();
    return true;
  } catch (e) {
    if (gen !== store.gen) return false;
    store.accepting = store.accepting.filter((x) => x !== id);
    store.acceptErrors = { ...store.acceptErrors, [id]: marketErrorInfo(e)?.code ?? "" };
    emit();
    return false;
  }
}

export function rulesBlockOf(e: unknown): string[] | null {
  const info = marketErrorInfo(e);
  return info && info.code === "service_rules_acceptance_required" ? info.missingRuleIds : null;
}

const hostListeners = new Set<() => void>();

function hostSubscribe(fn: () => void): () => void {
  hostListeners.add(fn);
  return () => {
    hostListeners.delete(fn);
  };
}

function emitHosts(): void {
  for (const fn of [...hostListeners]) fn();
}

export function useRulesDrawerHost(): boolean {
  const id = useId();
  const active = useSyncExternalStore(
    hostSubscribe,
    () => hosts[0] === id,
    () => false,
  );
  useEffect(() => {
    hosts.push(id);
    emitHosts();
    return () => {
      const at = hosts.indexOf(id);
      if (at >= 0) hosts.splice(at, 1);
      emitHosts();
    };
  }, [id]);
  return active;
}

export function resetRulesGate(): void {
  store.gen += 1;
  store.uid = "";
  store.lists = {};
  store.items = new Map();
  store.drawer = CLOSED_DRAWER;
  store.accepting = [];
  store.acceptErrors = {};
  store.lastAccepted = "";
  store.flights = new Map();
  emit();
}
