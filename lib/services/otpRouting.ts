// Superadmin: the OTP delivery channel of any account, from one screen
// (LEXGO_FRONTEND_CENTRAL_OTP_DELIVERY_MANAGEMENT_2026_11_09.md).
//
// Unlike the user's own change (/auth/otp-delivery/change/*), this one sends
// no code: the backend applies it at once, answers otp_sent: false and writes
// it to the immutable OTP routing audit. Every reader below is defensive —
// the documented fields first, a few likely aliases after — because only the
// field list, not the full JSON, was handed over.

import { http, asArr, asDict, asNum, asStr, type Dict } from "@/lib/http";
import { otpDeliveryOf, type OtpDeliveryMethod } from "@/lib/otpDelivery";

const BASE = "/admin/security/otp-routing";

export type OtpProviderStatus = "available" | "not_configured" | string;
export type OtpProvider = {
  method: OtpDeliveryMethod;
  title: string;
  configured: boolean;
  status: OtpProviderStatus;
  isDefault: boolean;
  requiresUserConfirmation: boolean;
};
export type OtpProviderCatalog = { items: OtpProvider[]; defaultMethod: OtpDeliveryMethod | ""; languages: string[] };

export const providerUsable = (p: OtpProvider | undefined): boolean => !!p && p.configured && p.status !== "not_configured";

function normProvider(v: unknown): OtpProvider | null {
  const d = asDict(v);
  const method = otpDeliveryOf(d.method ?? d.key);
  if (!method) return null;
  const status = asStr(d.status) || (d.configured === false ? "not_configured" : "available");
  return {
    method,
    title: asStr(d.title ?? d.name),
    configured: d.configured !== false && status !== "not_configured",
    status,
    isDefault: d.default === true || d.is_default === true,
    requiresUserConfirmation: d.requires_user_confirmation === true,
  };
}

export async function getOtpProviders(): Promise<OtpProviderCatalog> {
  const d = asDict(await http(`${BASE}/providers`));
  const items = asArr(d.items ?? d.providers)
    .map(normProvider)
    .filter((p): p is OtpProvider => !!p);
  const defaultMethod = otpDeliveryOf(d.default_method) || items.find((p) => p.isDefault)?.method || "";
  const languages = asArr(d.languages ?? d.delivery_languages).map((x) => asStr(x)).filter(Boolean);
  return { items, defaultMethod, languages: languages.length ? languages : ["uz_latn", "uz_cyrl", "ru", "en"] };
}

export type OtpAccount = {
  userId: string;
  name: string;
  phone: string;
  lexgoId: string;
  role: string;
  selectedMethod: OtpDeliveryMethod | "";
  language: string;
  // default = the account never chose; saved_preference = a stored choice
  source: string;
  provider: string;
  // user_verified | superadmin_override | …
  changeSource: string;
  reason: string;
  verifiedAt: string;
  changedAt: string;
};

function normAccount(v: unknown): OtpAccount {
  const d = asDict(v);
  const u = asDict(d.user);
  const pick = (...vals: unknown[]) => asStr(vals.find((x) => x !== undefined && x !== null && asStr(x) !== ""));
  return {
    userId: pick(u.id, d.user_id, d.id),
    name: pick(u.name, u.full_name, d.name, d.full_name),
    phone: pick(u.phone, d.phone),
    lexgoId: pick(u.lexgo_id, d.lexgo_id),
    role: pick(u.role, d.role),
    selectedMethod: otpDeliveryOf(d.selected_method ?? d.method),
    language: asStr(d.language),
    source: asStr(d.source),
    provider: asStr(typeof d.provider === "object" ? asDict(d.provider).title ?? asDict(d.provider).method : d.provider),
    changeSource: asStr(d.change_source),
    reason: asStr(d.reason),
    verifiedAt: asStr(d.verified_at),
    changedAt: asStr(d.changed_at ?? d.updated_at),
  };
}

export type OtpAccountPage = { items: OtpAccount[]; total: number; limit: number; offset: number; hasMore: boolean };

export async function listOtpAccounts(
  q: { search?: string; method?: OtpDeliveryMethod | ""; limit: number; offset: number },
  signal?: AbortSignal,
): Promise<OtpAccountPage> {
  const sp = new URLSearchParams();
  if (q.search?.trim()) sp.set("search", q.search.trim());
  if (q.method) sp.set("method", q.method);
  sp.set("limit", String(Math.min(100, Math.max(1, q.limit))));
  sp.set("offset", String(Math.max(0, q.offset)));
  const d = asDict(await http(`${BASE}/accounts?${sp}`, { signal }));
  const items = asArr(d.items).map(normAccount).filter((a) => a.userId);
  const total = asNum(d.total, asNum(d.count, items.length));
  const offset = asNum(d.offset, q.offset);
  return {
    items,
    total,
    limit: asNum(d.limit, q.limit),
    offset,
    hasMore: typeof d.has_more === "boolean" ? d.has_more : offset + items.length < total,
  };
}

// One delivery attempt: only the last four digits of the number ever arrive.
export type OtpDeliveryRecord = { id: string; method: OtpDeliveryMethod | ""; provider: string; status: string; phoneLast4: string; purpose: string; error: string; at: string };
// One routing change from the immutable audit.
export type OtpRoutingChange = { id: string; from: OtpDeliveryMethod | ""; to: OtpDeliveryMethod | ""; changeSource: string; actor: string; reason: string; at: string };
export type OtpAccountDelivery = OtpAccount & { recentDeliveries: OtpDeliveryRecord[]; audit: OtpRoutingChange[] };

function last4(d: Dict): string {
  const raw = asStr(d.phone_last4 ?? d.phone_last_four ?? d.last4 ?? d.recipient_last4 ?? d.phone_masked ?? d.recipient);
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.slice(-4) : "";
}

function normDelivery(v: unknown, i: number): OtpDeliveryRecord {
  const d = asDict(v);
  const provider = typeof d.provider === "object" ? asDict(d.provider) : {};
  return {
    id: asStr(d.id ?? d.delivery_id) || String(i),
    method: otpDeliveryOf(d.method ?? d.delivery_method ?? provider.method),
    provider: asStr(provider.title ?? provider.name ?? (typeof d.provider === "string" ? d.provider : "")),
    status: asStr(d.status ?? d.delivery_status),
    phoneLast4: last4(d),
    purpose: asStr(d.purpose),
    error: asStr(d.error ?? d.error_code ?? d.failure_reason),
    at: asStr(d.created_at ?? d.sent_at ?? d.at),
  };
}

function normChange(v: unknown, i: number): OtpRoutingChange {
  const d = asDict(v);
  const actor = asDict(d.actor ?? d.changed_by);
  return {
    id: asStr(d.id) || String(i),
    from: otpDeliveryOf(d.from_method ?? d.previous_method ?? d.old_method),
    to: otpDeliveryOf(d.to_method ?? d.new_method ?? d.method ?? d.selected_method),
    changeSource: asStr(d.change_source ?? d.source),
    actor: asStr(actor.name ?? actor.full_name) || (typeof d.actor === "string" ? d.actor : "") || asStr(d.changed_by_name),
    reason: asStr(d.reason),
    at: asStr(d.created_at ?? d.changed_at ?? d.at),
  };
}

export async function getOtpAccountDelivery(userId: string): Promise<OtpAccountDelivery> {
  const d = asDict(await http(`${BASE}/accounts/${encodeURIComponent(userId)}/delivery`));
  // The configuration may come at the top level or wrapped.
  const cfg = Object.keys(asDict(d.delivery)).length ? { ...d, ...asDict(d.delivery) } : d;
  const acc = normAccount(cfg);
  return {
    ...acc,
    userId: acc.userId || userId,
    recentDeliveries: asArr(d.recent_deliveries ?? d.deliveries).map(normDelivery),
    audit: asArr(d.audit ?? d.audit_log ?? d.routing_audit ?? d.history ?? d.changes).map(normChange),
  };
}

// Applied at once, no OTP is sent (otp_sent: false).
export async function setOtpAccountDelivery(userId: string, body: { method: OtpDeliveryMethod; language: string; reason: string }): Promise<{ otpSent: boolean }> {
  const d = asDict(
    await http(`${BASE}/accounts/${encodeURIComponent(userId)}/delivery`, {
      method: "PATCH",
      body: JSON.stringify({ method: body.method, language: body.language, reason: body.reason.trim() }),
    }),
  );
  return { otpSent: d.otp_sent === true };
}

// The documented refusals, by machine code (errors carry it as e.code).
export const OTP_ROUTING_ERRORS = [
  "superadmin_required",
  "otp_routing_user_not_found",
  "otp_delivery_provider_not_configured",
  "otp_routing_recipient_unavailable",
  "otp_delivery_method_invalid",
] as const;
export type OtpRoutingError = (typeof OTP_ROUTING_ERRORS)[number];
export const otpRoutingErrorOf = (code: string | undefined): OtpRoutingError | "" =>
  (OTP_ROUTING_ERRORS as readonly string[]).includes(code ?? "") ? (code as OtpRoutingError) : "";
