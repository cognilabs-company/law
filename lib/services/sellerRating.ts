// A seller's marketplace rating with how it is made up (TSK-332221): the
// public score (or "not rated yet" when there is no real work behind it),
// the ranking score, each factor's score and the counts it rests on. The
// formula and its weights live in the backend; nothing is computed here.

import { ApiError, asDict, asNum, asStr, http } from "@/lib/http";

export type SellerRating = {
  rated: boolean;
  publicRating: number | null;
  rankingScore: number | null;
  reviews: number;
  unratedText: string;
  components: { key: string; score: number }[];
  completed: number;
  terminal: number;
  responseSeconds: number | null;
  experienceYears: number | null;
  calculatedAt: string;
  policyVersion: number | null;
  // Only on the seller's own rating (GET /marketplace/me/rating): each
  // factor's weight in percent, whether a new seller's missing reviews are
  // replaced by the other factors, and the penalties taken off.
  weights: Record<string, number> | null;
  coldStart: boolean;
  penalties: { complaints: number; complaintPoints: number; refunds: number; refundPoints: number } | null;
};

const COMPONENT_ORDER = ["client_reviews", "completion_rate", "acceptance_rate", "response_score", "verified_experience", "verified_achievements"];
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function weightsOf(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "number") out[k] = x;
  return Object.keys(out).length ? out : null;
}

function penaltiesOf(p: Record<string, unknown>) {
  return { complaints: asNum(p.substantiated_complaints), complaintPoints: asNum(p.complaint_points), refunds: asNum(p.refunds), refundPoints: asNum(p.refund_points) };
}

export function sellerRatingOf(v: unknown): SellerRating {
  const d = asDict(v);
  const c = asDict(d.components);
  const m = asDict(d.metrics);
  const keys = [...COMPONENT_ORDER.filter((k) => k in c), ...Object.keys(c).filter((k) => !COMPONENT_ORDER.includes(k))];
  const status = asStr(d.rating_status).toLowerCase();
  return {
    rated: status ? status !== "unrated" : asNum(d.reviews_count) > 0,
    publicRating: num(d.public_rating),
    rankingScore: num(d.ranking_score),
    reviews: asNum(d.reviews_count),
    unratedText: asStr(d.unrated_display),
    components: keys.map((key) => ({ key, score: Math.max(0, Math.min(100, asNum(c[key]))) })),
    completed: asNum(m.completed_orders),
    terminal: asNum(m.terminal_orders),
    responseSeconds: num(m.average_response_seconds),
    experienceYears: num(m.verified_experience_years),
    calculatedAt: asStr(d.calculated_at),
    policyVersion: num(d.policy_version),
    weights: weightsOf(d.weights),
    coldStart: asDict(d.weights).cold_start_replaces_client_reviews === true,
    penalties: d.penalties && typeof d.penalties === "object" ? penaltiesOf(asDict(d.penalties)) : null,
  };
}

export async function getSellerRating(sellerUserId: string, signal?: AbortSignal): Promise<SellerRating> {
  return sellerRatingOf(await http(`/marketplace/lawyers/${encodeURIComponent(sellerUserId)}/rating`, { signal }));
}

// null when the account has no seller profile (404 seller_profile_not_found).
export async function getMySellerRating(signal?: AbortSignal): Promise<SellerRating | null> {
  try {
    return sellerRatingOf(await http("/marketplace/me/rating", { signal }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
