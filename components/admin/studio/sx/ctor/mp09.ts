// MP09 "Aksiya" (TSK-537634): a percent or fixed discount on chosen
// advertising packages or plans, for a period and/or a number of uses.
// Pure helpers shared by the editor preview and the records list.

export type PromoTiming = "scheduled" | "running" | "ended" | "open";

export const PROMO_TARGETS = "/studio/reference/promotion-targets";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const numOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export type PromoTerms = { type: "percent" | "fixed" | ""; value: number | null; startsAt: string; endsAt: string; usageLimit: number | null; targetType: string; targetIds: string[] };

export function promoTermsOf(p: Readonly<Record<string, unknown>> | null | undefined): PromoTerms {
  const d = p ?? {};
  const type = str(d.discount_type);
  return {
    type: type === "percent" || type === "fixed" ? type : "",
    value: numOf(d.discount_value),
    startsAt: str(d.starts_at),
    endsAt: str(d.ends_at),
    usageLimit: numOf(d.usage_limit),
    targetType: str(d.target_type),
    targetIds: Array.isArray(d.target_ids) ? d.target_ids.map(str).filter(Boolean) : [],
  };
}

// The price after the discount, never below zero (acceptance criterion 2).
export function discountedPrice(price: number, t: Pick<PromoTerms, "type" | "value">): number {
  if (!t.type || t.value === null || t.value <= 0) return price;
  const off = t.type === "percent" ? Math.round((price * Math.min(t.value, 100)) / 100) : t.value;
  return Math.max(0, price - off);
}

// Where the period stands now. Use counts are the backend's, so "used up"
// is not guessed here.
export function promoTiming(t: Pick<PromoTerms, "startsAt" | "endsAt">, now: number): PromoTiming {
  const from = Date.parse(t.startsAt);
  const to = Date.parse(t.endsAt);
  if (Number.isFinite(to) && to <= now) return "ended";
  if (Number.isFinite(from) && from > now) return "scheduled";
  if (Number.isFinite(from) || Number.isFinite(to)) return "running";
  return "open";
}
