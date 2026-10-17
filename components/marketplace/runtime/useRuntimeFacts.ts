"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getRuntimeConfig, type RuntimeConfig, type RuntimePlacement } from "@/lib/services/marketRuntime";
import { PH_SERVICE_ID } from "@/lib/marketPreview";

export type FactsState = "idle" | "loading" | "ready" | "failed";
export type RuntimeFacts = { state: FactsState; config: RuntimeConfig | null; ref: (el: HTMLElement | null) => void | (() => void) };
export type RuntimeFactsOptions = { enabled?: boolean; lazy?: boolean };

export const FACTS_PARALLEL = 3;
export const FACTS_TTL_MS = 300_000;
export const FACTS_RETRY_MS = 30_000;

type Entry = { state: "loading" | "ready" | "failed"; config: RuntimeConfig | null; at: number; busy: boolean };
type Job = { key: string; id: string; placement: RuntimePlacement; gen: number };

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const queue: Job[] = [];
let running = 0;
let gen = 0;

const keyOf = (id: string, placement: RuntimePlacement) => `${id}|${placement}`;

function notify(key: string) {
  for (const fn of [...(listeners.get(key) ?? [])]) fn();
}

function put(key: string, entry: Entry | null) {
  if (entry) entries.set(key, entry);
  else entries.delete(key);
  notify(key);
}

function pump() {
  while (running < FACTS_PARALLEL && queue.length) {
    const job = queue.shift() as Job;
    if (job.gen !== gen) continue;
    if (!listeners.get(job.key)?.size) {
      const cur = entries.get(job.key);
      if (cur?.state === "loading") entries.delete(job.key);
      else if (cur) entries.set(job.key, { ...cur, busy: false });
      continue;
    }
    running++;
    getRuntimeConfig(job.id, job.placement)
      .then(
        (config) => {
          if (job.gen === gen) put(job.key, { state: "ready", config, at: Date.now(), busy: false });
        },
        () => {
          if (job.gen !== gen) return;
          const prev = entries.get(job.key);
          if (prev?.state === "ready" && prev.config) put(job.key, { ...prev, busy: false, at: Date.now() - FACTS_TTL_MS + FACTS_RETRY_MS });
          else put(job.key, { state: "failed", config: null, at: Date.now(), busy: false });
        },
      )
      .finally(() => {
        running = Math.max(0, running - 1);
        pump();
      });
  }
}

function requestFacts(id: string, placement: RuntimePlacement) {
  const key = keyOf(id, placement);
  const cur = entries.get(key);
  const now = Date.now();
  if (cur) {
    if (cur.busy) return;
    if (cur.state === "ready" && now - cur.at < FACTS_TTL_MS) return;
    if (cur.state === "failed" && now - cur.at < FACTS_RETRY_MS) return;
  }
  put(key, cur?.state === "ready" && cur.config ? { ...cur, busy: true } : { state: "loading", config: null, at: cur?.at ?? 0, busy: true });
  queue.push({ key, id, placement, gen });
  pump();
}

let observer: IntersectionObserver | null = null;
const watched = new Map<Element, () => void>();

function watch(el: Element, onSeen: () => void): () => void {
  if (!observer) {
    observer = new IntersectionObserver(
      (list) => {
        for (const e of list) {
          if (!e.isIntersecting) continue;
          const fn = watched.get(e.target);
          watched.delete(e.target);
          observer?.unobserve(e.target);
          fn?.();
        }
      },
      { rootMargin: "240px 0px" },
    );
  }
  watched.set(el, onSeen);
  observer.observe(el);
  return () => {
    if (!watched.has(el)) return;
    watched.delete(el);
    observer?.unobserve(el);
  };
}

const noopRef = () => undefined;
const noopUnsubscribe = () => undefined;

export function useRuntimeFacts(serviceId: string, placement: RuntimePlacement, opts?: RuntimeFactsOptions): RuntimeFacts {
  const id = (serviceId || "").trim();
  const active = (opts?.enabled ?? true) && !!id && id !== PH_SERVICE_ID;
  const lazy = !!opts?.lazy;
  const key = active ? keyOf(id, placement) : "";
  const [seen, setSeen] = useState(false);

  const subscribe = useCallback(
    (fn: () => void) => {
      if (!key) return noopUnsubscribe;
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(fn);
      return () => {
        const cur = listeners.get(key);
        cur?.delete(fn);
        if (cur && !cur.size) listeners.delete(key);
      };
    },
    [key],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => (key ? (entries.get(key) ?? null) : null),
    () => null,
  );

  const wanted = !!key && (!lazy || seen);
  useEffect(() => {
    if (!wanted) return;
    requestFacts(id, placement);
  }, [wanted, id, placement]);

  const watchRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el || seen) return;
      if (typeof IntersectionObserver === "undefined") {
        setSeen(true);
        return;
      }
      return watch(el, () => setSeen(true));
    },
    [seen],
  );

  const ref = lazy && key ? watchRef : noopRef;
  if (!key) return { state: "idle", config: null, ref };
  if (!entry) return { state: lazy && !seen ? "idle" : "loading", config: null, ref };
  return { state: entry.state, config: entry.config, ref };
}

export function peekRuntimeFacts(serviceId: string, placement: RuntimePlacement): RuntimeConfig | null {
  return entries.get(keyOf((serviceId || "").trim(), placement))?.config ?? null;
}

export function resetRuntimeFacts(): void {
  gen++;
  queue.length = 0;
  const keys = [...entries.keys()];
  entries.clear();
  for (const k of keys) notify(k);
}
