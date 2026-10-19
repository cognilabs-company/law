import { parseServerTime } from "@/lib/http";
import type { MarketOrder, MarketPhase } from "@/lib/services/marketplace";
import type { Negotiation, RuntimeConfig } from "@/lib/services/marketRuntime";

export type NegotiationState = "none" | "proposed" | "countered" | "accepted" | "rejected" | "expired";
export type NegotiationErrorKey = "notLower" | "aboveMax" | "expired" | "notAvailable" | "alreadyOpen" | "alreadyResolved";

const dictOf = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const timeOf = (iso: string): number => (iso ? parseServerTime(iso) : NaN);

export function negotiationStateOf(n: Negotiation | null, now: number): NegotiationState {
  if (!n) return "none";
  const s = n.status.trim().toLowerCase();
  let st: NegotiationState;
  if (/^counter/.test(s)) st = "countered";
  else if (/^accept/.test(s)) st = "accepted";
  else if (/^(reject|declin)/.test(s)) st = "rejected";
  else if (/^expir/.test(s)) st = "expired";
  else st = "proposed";
  if ((st === "proposed" || st === "countered") && now > 0) {
    const at = timeOf(n.expiresAt);
    if (Number.isFinite(at) && at <= now) return "expired";
  }
  return st;
}

function mergeSame(older: Negotiation, newer: Negotiation): Negotiation {
  return {
    id: newer.id || older.id,
    orderId: newer.orderId || older.orderId,
    status: newer.status || older.status,
    amount: newer.amount || older.amount,
    counterAmount: newer.counterAmount || older.counterAmount,
    maxAmount: newer.maxAmount || older.maxAmount,
    note: newer.note || older.note,
    responseNote: newer.responseNote || older.responseNote,
    proposedBy: newer.proposedBy || older.proposedBy,
    expiresAt: newer.expiresAt || older.expiresAt,
    reminderAt: newer.reminderAt || older.reminderAt,
    createdAt: newer.createdAt || older.createdAt,
    updatedAt: newer.updatedAt || older.updatedAt,
    raw: { ...older.raw, ...newer.raw },
  };
}

const stampOf = (n: Negotiation): number => timeOf(n.updatedAt || n.createdAt);

export function pickNegotiation(...cands: (Negotiation | null | undefined)[]): Negotiation | null {
  let best: Negotiation | null = null;
  for (const c of cands) {
    if (!c) continue;
    if (!best) {
      best = c;
      continue;
    }
    const a = stampOf(best);
    const b = stampOf(c);
    const laterWins = !Number.isFinite(a) || !Number.isFinite(b) || b >= a;
    const same = !!best.id && best.id === c.id;
    if (same) best = laterWins ? mergeSame(best, c) : mergeSame(c, best);
    else if (laterWins) best = c;
  }
  return best;
}

export function negotiationActions(n: Negotiation | null): string[] {
  if (!n) return [];
  const raw = n.raw ?? {};
  const list = raw.available_actions ?? raw.actions ?? raw.allowed_actions ?? dictOf(raw.negotiation).available_actions;
  if (!Array.isArray(list)) return [];
  return list.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().toLowerCase());
}

export function proposalProblem(amount: number | undefined, currentPrice: number): "required" | "positive" | "notLower" | null {
  if (amount === undefined || !Number.isFinite(amount)) return "required";
  if (amount <= 0) return "positive";
  if (currentPrice > 0 && amount >= currentPrice) return "notLower";
  return null;
}

export function counterProblem(amount: number | undefined, maxPrice: number | null): "required" | "positive" | "aboveMax" | null {
  if (amount === undefined || !Number.isFinite(amount)) return "required";
  if (amount <= 0) return "positive";
  if (maxPrice !== null && amount > maxPrice) return "aboveMax";
  return null;
}

export function negotiationErrorKey(code: string): NegotiationErrorKey | null {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  if (/lower|below|less|must_decrease/.test(c)) return "notLower";
  if (/max/.test(c)) return "aboveMax";
  if (/expir/.test(c)) return "expired";
  if (/not_available|disabled|not_allowed|negotiation_off/.test(c)) return "notAvailable";
  if (/already_(open|pending|exists|active)|pending_exists/.test(c)) return "alreadyOpen";
  if (/already|resolved|closed|answered/.test(c)) return "alreadyResolved";
  return null;
}

export function showNegotiation(o: Pick<MarketOrder, "negotiationAvailable" | "negotiation"> & Partial<Pick<MarketOrder, "canNegotiate">>, phase: MarketPhase, runtime: RuntimeConfig | null, noted: Negotiation | null): boolean {
  if (phase !== "pending") return false;
  if (o.negotiation || noted) return true;
  if (typeof o.canNegotiate === "boolean") return o.canNegotiate;
  return runtime?.negotiationAvailable === true || o.negotiationAvailable === true;
}

export function canProposeNegotiation(o: Partial<Pick<MarketOrder, "canNegotiate">>): boolean {
  return o.canNegotiate !== false;
}

export function negotiationCap(runtimeCap: number | null, n: Negotiation | null): number | null {
  return n && n.maxAmount > 0 ? n.maxAmount : runtimeCap;
}
