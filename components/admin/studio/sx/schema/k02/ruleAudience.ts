"use client";

import { useEffect, useSyncExternalStore } from "react";
import { asDict } from "@/lib/http";
import { getStudioFormContext, listStudioObjects, type StudioReferenceItem } from "@/lib/services/studio";
import { firstReferencePage } from "../../form/useReferenceOptions";
import { RULE_SOURCE } from "../ruleDuplicates";

// Who each shared service rule (K31) is written for. A K31 rule carries a
// required `audience` — "client" or "executor" — but the rule picker's
// reference list (/studio/reference/service-rules) does not repeat it, so the
// service form learns it from the rule itself: the payload of a Studio draft,
// and the form context of a published rule. The service form then offers each
// side only its own rules. A rule whose audience cannot be read counts as an
// executor rule, which is the backend's own default for a service rule.

export type RuleAudience = "client" | "executor";

type Store = { at: number; map: ReadonlyMap<string, RuleAudience>; loading: Promise<void> | null; asked: Set<string> };
const TTL_MS = 60 * 1000;
const store: Store = { at: 0, map: new Map(), loading: null, asked: new Set() };
const watchers = new Set<() => void>();
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function audienceOf(v: unknown): RuleAudience | null {
  const s = str(v).toLowerCase();
  if (s === "client" || s === "customer") return "client";
  if (s === "executor" || s === "performer" || s === "seller") return "executor";
  return null;
}

function put(next: Map<string, RuleAudience>) {
  store.map = next;
  for (const fn of watchers) fn();
}

// A pick made in one side's list says which side the rule is for — the
// way a rule created from that list right now becomes known before the
// next read.
export function learnRuleAudience(ids: readonly string[], audience: RuleAudience) {
  const fresh = ids.filter((id) => id && store.map.get(id) !== audience);
  if (!fresh.length) return;
  const next = new Map(store.map);
  for (const id of fresh) next.set(id, audience);
  put(next);
}

const RUNTIME_CTX = (id: string) => `/studio/constructors/K31/form-context?mode=view&record_id=${encodeURIComponent(id)}&source=runtime`;

async function readPublished(ids: readonly string[], into: Map<string, RuleAudience>) {
  const queue = ids.filter((id) => !into.has(id) && !store.asked.has(id)).slice(0, 40);
  for (const id of queue) store.asked.add(id);
  const work = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const ctx = await getStudioFormContext(RUNTIME_CTX(id));
        const a = audienceOf(ctx.initialPayload.audience);
        if (a) into.set(id, a);
      } catch {
        /* unreadable: stays the executor default */
      }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
}

async function load(extra: readonly string[]): Promise<void> {
  const [published, objects] = await Promise.all([
    firstReferencePage(RULE_SOURCE).catch(() => [] as StudioReferenceItem[]),
    listStudioObjects({ constructorCode: "K31", limit: 100 }).then(
      (r) => r.items,
      () => [],
    ),
  ]);
  const next = new Map(store.map);
  for (const it of published) {
    const a = audienceOf(it.raw.audience);
    if (a) next.set(it.value, a);
  }
  for (const o of objects) {
    const a = audienceOf(asDict(asDict(o.raw.current_version).payload).audience);
    if (!a) continue;
    next.set(o.id, a);
    const runtime = str(o.raw.runtime_target_id);
    if (runtime) next.set(runtime, a);
  }
  await readPublished([...published.map((p) => p.value), ...extra], next);
  store.at = Date.now();
  put(next);
}

function ensure(extra: readonly string[]) {
  const unknown = extra.filter((id) => id && !store.map.has(id) && !store.asked.has(id));
  if (store.loading) return;
  if (store.at && Date.now() - store.at < TTL_MS && !unknown.length) return;
  store.loading = load(unknown).finally(() => {
    store.loading = null;
  });
}

// After a rule is saved elsewhere, so the next read sees its audience.
export function dropRuleAudiences(): void {
  store.at = 0;
  store.asked.clear();
}

export function useRuleAudiences(enabled: boolean, picked: readonly string[]): ReadonlyMap<string, RuleAudience> {
  const key = picked.join("|");
  useEffect(() => {
    if (enabled) ensure(key ? key.split("|") : []);
  }, [enabled, key]);
  return useSyncExternalStore(
    (fn) => {
      watchers.add(fn);
      return () => {
        watchers.delete(fn);
      };
    },
    () => store.map,
    () => store.map,
  );
}
