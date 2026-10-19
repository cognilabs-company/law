"use client";

import { useEffect, useState } from "react";
import { ApiError, asArr, asDict, asStr, currentTokenOwner, http, isRouteMissing } from "@/lib/http";
import { normCreationJourney, rememberCreationJourney, type StudioCreationJourney, type StudioJourneyType } from "@/lib/services/studio";

export const JOURNEY_STATUSES = ["draft", "completed", "abandoned", "archived"] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];
export type JourneyAction = "abandon" | "archive" | "restore";

export const JOURNEY_EVENTS: ReadonlySet<string> = new Set(["studio.journey_updated", "studio.journey_abandoned", "studio.journey_archived", "studio.journey_draft"]);

export function isJourneyEvent(name: unknown): boolean {
  return typeof name === "string" && JOURNEY_EVENTS.has(name);
}

export function journeyStatusOf(raw: string): JourneyStatus | "" {
  const s = String(raw ?? "").trim().toLowerCase();
  return (JOURNEY_STATUSES as readonly string[]).includes(s) ? (s as JourneyStatus) : "";
}

export function journeyActionsFor(status: string): JourneyAction[] {
  const s = journeyStatusOf(status);
  if (s === "draft" || s === "") return ["abandon", "archive"];
  if (s === "completed") return ["archive"];
  if (s === "abandoned") return ["restore", "archive"];
  return ["restore"];
}

export function isJourneyClosed(status: string): boolean {
  const s = journeyStatusOf(status);
  return s === "abandoned" || s === "archived";
}

export type JourneyDefStep = { key: string; title: string; code: string; fields: string[]; order: number; required: boolean };
export type JourneyDef = { type: StudioJourneyType; steps: JourneyDefStep[]; totalCount: number | null; allowedStatuses: string[] };
export type JourneyDefs = Partial<Record<StudioJourneyType, JourneyDef>>;

function typeOf(v: unknown): StudioJourneyType | null {
  const s = asStr(v).trim().toLowerCase();
  return s === "service" || s === "package" ? s : null;
}

function strList(v: unknown): string[] {
  const out: string[] = [];
  for (const x of asArr(v)) {
    const s = asStr(typeof x === "object" && x !== null ? (asDict(x).key ?? asDict(x).name) : x).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function normDefStep(raw: unknown, i: number): JourneyDefStep | null {
  if (typeof raw === "string") {
    const key = raw.trim();
    return key ? { key, title: "", code: "", fields: [], order: i + 1, required: true } : null;
  }
  const d = asDict(raw);
  const key = asStr(d.key ?? d.step).trim();
  if (!key) return null;
  const order = typeof d.order === "number" && Number.isFinite(d.order) ? d.order : i + 1;
  return { key, title: asStr(d.title ?? d.label).trim(), code: asStr(d.constructor_code ?? d.code).trim(), fields: strList(d.fields), order, required: d.required !== false };
}

function normDef(raw: unknown, fallbackType: StudioJourneyType | null): JourneyDef | null {
  const d = asDict(raw);
  const type = typeOf(d.journey_type ?? d.type) ?? fallbackType;
  if (!type) return null;
  const seen = new Set<string>();
  const steps = asArr(d.steps)
    .map(normDefStep)
    .filter((s): s is JourneyDefStep => {
      if (!s || seen.has(s.key)) return false;
      seen.add(s.key);
      return true;
    })
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.order - b.s.order || a.i - b.i)
    .map((x) => x.s);
  if (!steps.length) return null;
  const total = typeof d.total_count === "number" && Number.isFinite(d.total_count) ? d.total_count : null;
  return { type, steps, totalCount: total, allowedStatuses: strList(d.allowed_statuses) };
}

export function normJourneyDefs(raw: unknown, type: StudioJourneyType | null = null): JourneyDefs {
  const d = asDict(raw);
  const list = Array.isArray(raw) ? raw : asArr(d.items).length ? asArr(d.items) : asArr(d.definitions).length ? asArr(d.definitions) : d.steps ? [d] : [];
  const out: JourneyDefs = {};
  for (const item of list) {
    const def = normDef(item, list.length === 1 ? type : null);
    if (def && !out[def.type]) out[def.type] = def;
  }
  return out;
}

type DefsCache = { owner: string; defs: JourneyDefs | null; failedAt: number; promise: Promise<JourneyDefs> | null };

const RETRY_MS = 60_000;
let cache: DefsCache = { owner: "", defs: null, failedAt: 0, promise: null };

function ownCache(): DefsCache {
  const owner = currentTokenOwner();
  if (cache.owner !== owner) cache = { owner, defs: null, failedAt: 0, promise: null };
  return cache;
}

export function peekJourneyDefinitions(): JourneyDefs | null {
  return ownCache().defs;
}

export function resetJourneyDefinitions(): void {
  cache = { owner: "", defs: null, failedAt: 0, promise: null };
}

export function loadJourneyDefinitions(): Promise<JourneyDefs> {
  const c = ownCache();
  if (c.defs) return Promise.resolve(c.defs);
  if (c.promise) return c.promise;
  if (c.failedAt && Date.now() - c.failedAt < RETRY_MS) return Promise.reject(new Error("journey_definitions_unavailable"));
  const p = http("/studio/journey-definitions")
    .then((res) => {
      const defs = normJourneyDefs(res);
      if (!defs.service && !defs.package) throw new Error("journey_definitions_empty");
      if (cache === c) {
        c.defs = defs;
        c.failedAt = 0;
      }
      return defs;
    })
    .catch((e: unknown) => {
      if (cache === c) c.failedAt = Date.now();
      throw e;
    })
    .finally(() => {
      if (cache === c) c.promise = null;
    });
  c.promise = p;
  return p;
}

export type JourneyDefsState = { phase: "loading" | "ready" | "fallback"; defs: JourneyDefs | null };

export function useJourneyDefinitions(enabled = true): JourneyDefsState {
  const [state, setState] = useState<JourneyDefsState>(() => {
    const defs = peekJourneyDefinitions();
    return defs ? { phase: "ready", defs } : { phase: "loading", defs: null };
  });
  const ready = state.phase === "ready";
  useEffect(() => {
    if (!enabled || ready) return;
    let alive = true;
    loadJourneyDefinitions().then(
      (defs) => {
        if (alive) setState({ phase: "ready", defs });
      },
      () => {
        if (alive) setState({ phase: "fallback", defs: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [enabled, ready]);
  return state;
}

const enc = encodeURIComponent;

function journeyOf(res: unknown, id: string): StudioCreationJourney {
  const j = normCreationJourney(res);
  return j.id ? j : { ...j, id };
}

export async function getCreationJourney(id: string, signal?: AbortSignal): Promise<StudioCreationJourney | null> {
  if (!id) return null;
  try {
    const res = await http(`/studio/journeys/${enc(id)}`, { signal });
    const j = journeyOf(res, id);
    rememberCreationJourney(j);
    return j;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && (!!e.code || !isRouteMissing(e))) return null;
    throw e;
  }
}

export async function runJourneyAction(id: string, action: JourneyAction): Promise<StudioCreationJourney> {
  const res = await http(`/studio/journeys/${enc(id)}/${action}`, { method: "POST" });
  const j = journeyOf(res, id);
  rememberCreationJourney(j);
  return j;
}

export type JourneyOwner = { id: string; name: string };

function personOf(v: unknown): JourneyOwner {
  if (typeof v === "string" || typeof v === "number") return { id: String(v).trim(), name: "" };
  const d = asDict(v);
  return { id: asStr(d.id ?? d.user_id).trim(), name: asStr(d.full_name ?? d.name ?? d.display_name).trim() };
}

export function journeyOwnerOf(j: Pick<StudioCreationJourney, "raw">): JourneyOwner {
  const r = j.raw;
  const created = personOf(r.created_by);
  const owner = personOf(r.owner_user_id ?? r.owner);
  const name = created.name || owner.name || asStr(r.created_by_name ?? r.owner_name).trim();
  return { id: owner.id || created.id, name };
}
