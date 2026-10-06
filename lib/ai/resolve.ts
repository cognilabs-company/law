import { aiSeg, isAiId } from "./ids";
import { aiAliases, aiRewrites, canonicalAiId, legacyAliases, type AliasHit } from "./aliases";
import { cssEsc, isShown, pickBest } from "./dom";

export type ResolvedBy = "exact" | "alias" | "alias_approx" | "parent";

export type Resolved = { el: HTMLElement; by: ResolvedBy; canonical: string; requested: string };

const MISS_TTL = 50;
const HIT_TTL = 250;

const ACTION_SEGMENTS = new Set([
  "buy",
  "features",
  "detail",
  "details",
  "messages",
  "message-input",
  "claim",
  "transfer",
  "close",
  "call",
  "manual",
  "ai",
  "lawyer",
  "editor",
  "meeting",
  "receipt",
  "edit",
  "cancel",
  "reopen",
  "send",
  "open",
  "view",
  "download",
  "finalize",
  "source",
  "complete",
  "chat",
  "extend",
  "delete",
  "remove",
  "select",
  "toggle",
  "cta",
  "accept",
  "decline",
]);

const NESTED = new Set(["service", "item", "member", "room", "assist", "order"]);

type Hit = { el: HTMLElement; by: ResolvedBy };

function query(attr: "data-ai-id" | "data-ai-target", id: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[${attr}="${cssEsc(id)}"]`)).filter(isShown);
  return pickBest(all);
}

function foreign(el: HTMLElement, id: string, a: AliasHit): boolean {
  const own = el.getAttribute("data-ai-id") || "";
  if (own && own !== id && isAiId(own)) {
    const mine = own.split(".");
    const want = id.split(".");
    const tpl = a.tpl.split(".");
    for (let i = 0; i < tpl.length && i < mine.length; i++) {
      if (!tpl[i].startsWith("{")) {
        if (mine[i] !== tpl[i]) break;
      } else if (mine[i] !== want[i]) return true;
    }
  }
  const entity = el.getAttribute("data-ai-entity-id") || "";
  return Boolean(entity && a.params.length && !a.params.includes(aiSeg(entity)));
}

function lookup(id: string, loose: boolean): Hit | null {
  const dotted = isAiId(id);
  const legacy = id.includes(":");
  const own = dotted ? query("data-ai-id", id) : legacy ? query("data-ai-target", id) : (query("data-ai-id", id) ?? query("data-ai-target", id));
  if (own) return { el: own, by: "exact" };
  if (dotted) {
    for (const alt of aiRewrites(id)) {
      const hit = lookup(alt, loose);
      if (hit) return { el: hit.el, by: hit.by === "exact" ? "alias" : hit.by };
    }
    const aliases = legacyAliases(id);
    for (const a of aliases) {
      if (a.lossy) continue;
      const el = query("data-ai-target", a.id);
      if (el) return { el, by: a.exact ? "alias" : "alias_approx" };
    }
    if (!loose) return null;
    for (const a of aliases) {
      if (!a.lossy) continue;
      const el = query("data-ai-target", a.id);
      if (el && !foreign(el, id, a)) return { el, by: "alias_approx" };
    }
  } else if (legacy) {
    for (const a of aiAliases(id)) {
      const el = query("data-ai-id", a.id);
      if (el) return { el, by: "alias" };
    }
  }
  return null;
}

export function parentIds(id: string): string[] {
  if (!isAiId(id)) return [];
  const out: string[] = [];
  let cur = id.split(".");
  while (cur.length > 3) {
    const last = cur[cur.length - 1];
    if (ACTION_SEGMENTS.has(last)) {
      cur = cur.slice(0, -1);
    } else if (cur.length >= 5 && NESTED.has(cur[cur.length - 2])) {
      cur = cur.slice(0, -2);
    } else break;
    out.push(cur.join("."));
  }
  return out;
}

export function canonicalOf(el: Element | null, requested: string): string {
  const own = el?.getAttribute("data-ai-id") || "";
  if (own && isAiId(own)) return own;
  if (isAiId(requested)) return requested;
  const legacy = el?.getAttribute("data-ai-target") || requested;
  return canonicalAiId(legacy) || requested;
}

function compute(id: string, loose: boolean): Resolved | null {
  const first = lookup(id, loose);
  if (first) return { ...first, canonical: canonicalOf(first.el, id), requested: id };
  if (!loose) return null;
  for (const p of parentIds(id)) {
    const hit = lookup(p, true);
    if (hit) return { el: hit.el, by: "parent", canonical: canonicalOf(hit.el, p), requested: id };
  }
  return null;
}

type Memo = { at: number; v: Resolved | null };

const memo = new Map<string, Memo>();

export function resolveAiTarget(id: string, fresh = false, loose = true): Resolved | null {
  if (typeof document === "undefined" || !id) return null;
  const key = `${loose ? 1 : 0}|${id}`;
  const now = performance.now();
  const hit = fresh ? undefined : memo.get(key);
  if (hit) {
    const age = now - hit.at;
    if (hit.v ? age < HIT_TTL && hit.v.el.isConnected && hit.v.el.getClientRects().length > 0 : age < MISS_TTL) return hit.v;
  }
  const v = compute(id, loose);
  if (memo.size > 200) memo.clear();
  memo.set(key, { at: now, v });
  return v;
}

export function forgetResolved(): void {
  memo.clear();
}
