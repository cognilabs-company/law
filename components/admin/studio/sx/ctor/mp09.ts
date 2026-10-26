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

// The backend's own price per target (POST /studio/constructors/MP09/preview,
// contract 2026-10-26 §2). The browser never works the discount out itself.
export type PromoPreviewTarget = { id: string; label: string; basePrice: number; discountAmount: number; finalPrice: number; currency: string };
export type PromoPreviewWarning = { code: string; id: string };
export type PromoBackendPreview = { targets: PromoPreviewTarget[]; warnings: PromoPreviewWarning[] };

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const dict = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function promoPreviewOf(raw: unknown): PromoBackendPreview {
  const d = dict(raw);
  const targets = (Array.isArray(d.targets) ? d.targets : []).map((x) => {
    const t = dict(x);
    return { id: str(t.id), label: str(t.label), basePrice: num(t.base_price), discountAmount: num(t.discount_amount), finalPrice: num(t.final_price), currency: str(t.currency) || "UZS" };
  });
  const warnings = (Array.isArray(d.warnings) ? d.warnings : [])
    .map((w) => (typeof w === "string" ? w : str(dict(w).code)))
    .filter(Boolean)
    .map((w) => {
      const i = w.indexOf(":");
      return i > 0 ? { code: w.slice(0, i), id: w.slice(i + 1) } : { code: w, id: "" };
    });
  return { targets: targets.filter((t) => t.id || t.label), warnings };
}
