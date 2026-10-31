// Helpers that turn a backend 422 (ApiError.fieldErrors) into form messages.
import { ApiError, isCodeLike } from "./http";

// PUT /lawyers/me/services rejects a price outside the allowed range with
// detail {service_id, selected_price, min_allowed, max_allowed} (whole so'm).
export type PriceRangeError = { serviceId: string; selectedPrice: number; min: number; max: number };
export function priceRangeOf(e: unknown): PriceRangeError | null {
  if (!(e instanceof ApiError) || e.status !== 422) return null;
  const f = e.fieldErrors;
  if (f.min_allowed == null || f.max_allowed == null) return null;
  const n = (v: string | undefined) => (v != null && Number.isFinite(Number(v)) ? Number(v) : 0);
  return { serviceId: f.service_id ?? "", selectedPrice: n(f.selected_price), min: n(f.min_allowed), max: n(f.max_allowed) };
}

// First field message of a 422 ("" when there is none). Only the words: the
// field's wire name and a message that is only a code are never shown.
export function firstFieldError(e: unknown): string {
  if (!(e instanceof ApiError) || e.status !== 422) return "";
  for (const v of Object.values(e.fieldErrors)) {
    const m = v.replace(/^value error,\s*/i, "").trim();
    if (m && !isCodeLike(m)) return m;
  }
  return "";
}
