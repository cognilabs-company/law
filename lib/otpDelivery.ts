// Where verification codes are delivered (LEXGO_FRONTEND_OTP_DELIVERY_CHANNELS
// _2026_11_09.md). Stored per user; `telegram_bot` is the backend default.
// Kept apart from lib/services/backend.ts so lib/types.ts can name the type
// without importing the whole service layer.
export const OTP_DELIVERY_METHODS = ["telegram_bot", "sms", "telegram_gateway"] as const;
export type OtpDeliveryMethod = (typeof OTP_DELIVERY_METHODS)[number];
export const DEFAULT_OTP_DELIVERY: OtpDeliveryMethod = "telegram_bot";

export const isOtpDeliveryMethod = (v: unknown): v is OtpDeliveryMethod =>
  typeof v === "string" && (OTP_DELIVERY_METHODS as readonly string[]).includes(v);

// A backend value → one of the three, '' when it names none of them.
export function otpDeliveryOf(v: unknown): OtpDeliveryMethod | "" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (isOtpDeliveryMethod(s)) return s;
  if (/gateway/.test(s)) return "telegram_gateway";
  if (/telegram/.test(s)) return "telegram_bot";
  if (/sms|eskiz/.test(s)) return "sms";
  return "";
}
