// Typed client for the LexGo backend contract (FRONTEND_API.md / MOBILE_API.md).
// Every function talks to the same-origin proxy with the bearer token attached.
// UI callers wrap reads in `withFallback(...)` so the app keeps working on local
// mock data until the backend is reachable.
import { http, asDict, asStr, asNum, asArr, API_BASE, ApiError, absUrl, backendOrigin, backendUrl, parseServerTime, toApiError, type Dict } from "@/lib/http";
import { getToken } from "@/lib/client";
import type { ProfessionalProfile } from "@/lib/types";
import { uzs, uzsOpt, fmtUzs } from "@/lib/money";

// ── Auth ──────────────────────────────────────────────────────────
export type BackendRole =
  | "client"
  | "yurist"
  | "advokat"
  | "advokat_tashkiloti"
  | "admin"
  | "manager"
  | "call_center"
  | "sales";
export type AuthUser = {
  id: string;
  lexgoId: string;
  accountStatus: string;
  role: BackendRole;
  name: string;
  middleName: string;
  phone: string;
  roles: string[];
  permissions: string[];
  twoFactorEnabled: boolean;
  twoFactorMethod: string; // "" | "sms" | "totp"
  // Raw primary role as the backend sent it ('' when absent). `role` above
  // falls back to "client" for unknown values; RBAC needs the real one.
  primaryRole: string;
  // Backend flag: 2FA is mandatory for this account (staff/seller roles).
  twoFactorRequired: boolean;
  telegramLinked?: boolean; // undefined = /auth/me doesn't expose it
  // Legal consents the server reports as accepted ([] today: /auth/me has no
  // such field yet). Seeds lib/consents.ts as already-synced records.
  acceptedConsents?: AcceptedConsentRef[];
};
export type AcceptedConsentRef = { id: string; slug: string; version: string };
export type AuthResult = { token: string; refreshToken: string; user: AuthUser };

const ROLE_SET: BackendRole[] = [
  "client", "yurist", "advokat", "advokat_tashkiloti", "admin", "manager", "call_center", "sales",
];
// Telegram link state (T0-15). /auth/me may expose telegram_chat_id or a
// boolean flag; undefined when it exposes neither, so the UI can tell
// "not linked" from "unknown".
function telegramLinkedOf(d: Dict): boolean | undefined {
  for (const k of ["telegram_linked", "is_telegram_linked", "telegram_connected"]) {
    if (typeof d[k] === "boolean") return d[k] as boolean;
  }
  if ("telegram_chat_id" in d) return asStr(d.telegram_chat_id).trim() !== "";
  const tg = asDict(d.telegram);
  if (typeof tg.linked === "boolean") return tg.linked;
  if ("chat_id" in tg) return asStr(tg.chat_id).trim() !== "";
  return undefined;
}
function normUser(v: unknown): AuthUser {
  const d = asDict(v);
  const rawRole = asStr(d.role).toLowerCase();
  const tf = asDict(d.two_factor);
  return {
    id: asStr(d.id ?? d.user_id),
    lexgoId: asStr(d.lexgo_id ?? d.lexgoId),
    accountStatus: asStr(d.account_status ?? d.status, "active"),
    role: ROLE_SET.includes(rawRole as BackendRole) ? (rawRole as BackendRole) : "client",
    name: asStr(d.name),
    middleName: asStr(d.middle_name),
    phone: asStr(d.phone),
    roles: asArr(d.roles).map((r) => asStr(r)),
    permissions: asArr(d.permissions).map((p) => asStr(p)),
    twoFactorEnabled: Boolean(d.two_factor_enabled ?? d.twofa_enabled ?? tf.enabled),
    twoFactorMethod: asStr(d.two_factor_method ?? tf.method).toLowerCase(),
    primaryRole: rawRole,
    twoFactorRequired: Boolean(d.two_factor_required ?? d.two_factor_mandatory ?? tf.required ?? tf.mandatory),
    telegramLinked: telegramLinkedOf(d),
    acceptedConsents: acceptedConsentsOf(d),
  };
}
// Forward-compatible: accepted_consents / user_consents / consents as an array
// of ids or {consent_id|document_id|id, slug, version}. Anything else → [].
function acceptedConsentsOf(d: Dict): AcceptedConsentRef[] {
  return asArr(d.accepted_consents ?? d.user_consents ?? d.consents)
    .map((v) => {
      if (typeof v === "string" || typeof v === "number") return { id: String(v), slug: "", version: "" };
      const c = asDict(v);
      return {
        id: asStr(c.consent_id ?? c.consent_document_id ?? c.document_id ?? c.id),
        slug: asStr(c.slug).trim().toLowerCase(),
        version: asStr(c.version),
      };
    })
    .filter((c) => c.id);
}

function normAuth(v: unknown): AuthResult {
  const d = asDict(v);
  return {
    token: asStr(d.access_token ?? d.token),
    refreshToken: asStr(d.refresh_token ?? d.refreshToken),
    user: normUser(d.user ?? d),
  };
}

// ── Sessions, refresh, logout ─────────────────────────────────────
export async function apiRefresh(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
  const d = asDict(await http("/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) }));
  return { token: asStr(d.access_token ?? d.token), refreshToken: asStr(d.refresh_token ?? refreshToken) };
}
// Sending the refresh token revokes that refresh session server-side (the
// sessions list stays accurate), not just the access token. Best-effort: never
// throws and never touches storage. Only the tokens captured at logout are
// sent (raw fetch, so a newer login's stored bearer is never attached). The
// backend rejects an expired bearer with 401 before it reads refresh_token, so
// on 401 refresh once with the captured refresh token and retry once.
export async function apiLogout(refreshToken?: string, accessToken?: string): Promise<void> {
  if (!refreshToken && !accessToken) return;
  const post = (bearer: string | undefined, rt: string | undefined) =>
    fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(rt ? { refresh_token: rt } : {}),
    });
  try {
    const res = await post(accessToken, refreshToken);
    if (res.status !== 401 || !refreshToken) return;
    const fresh = await apiRefresh(refreshToken).catch(() => null);
    // No fresh bearer (session already inactive, or offline) → the backend
    // also accepts a bearer-less logout keyed by refresh_token.
    await post(fresh?.token || undefined, fresh?.refreshToken || refreshToken);
  } catch {
    /* offline — nothing more to do */
  }
}
// current: undefined when the row carries no "this device" flag at all.
export type UserSession = { id: string; deviceLabel: string; ip: string; status: string; lastUsedAt: string; expiresAt: string; current?: boolean };
export async function listSessions(): Promise<UserSession[]> {
  return listFrom(await http("/auth/sessions"), "items", "data", "sessions").map((x) => {
    const d = asDict(x);
    const cur = d.current ?? d.is_current ?? d.this_device ?? d.is_this_device;
    return {
      id: asStr(d.id),
      deviceLabel: asStr(d.device_label ?? d.device) || "",
      ip: asStr(d.ip ?? d.ip_address),
      status: asStr(d.status, "active"),
      lastUsedAt: asStr(d.last_used_at ?? d.last_active),
      expiresAt: asStr(d.expires_at),
      current: cur == null ? undefined : Boolean(cur),
    };
  });
}
export async function revokeSession(id: string): Promise<void> {
  await http(`/auth/sessions/${id}`, { method: "DELETE" });
}

// ── OTP challenges ────────────────────────────────────────────────
// Every OTP issue (register/start, password/forgot, 2fa/start, login 428)
// returns a verification id plus an expiry — never the code itself. SMS codes
// live 2 minutes, and a new issue supersedes the previous code, so callers
// always switch to the newest verification id.
export const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_MAX_MS = 10 * 60 * 1000;
// expiresAt is epoch ms on the client clock; 0 = no expiry known.
export type OtpChallenge = { verificationId: string; phone: string; expiresAt: number; message: string };

// Server expiry → client deadline. Only a sane remaining time (0-60 min) is
// trusted, capped at `maxMs` so a skewed clock or naive-UTC timestamp can't
// show a longer timer than the documented TTL; otherwise `fallbackMs` (0 = none).
function otpExpiresAt(d: Dict, fallbackMs: number, maxMs: number): number {
  const now = Date.now();
  let at = parseServerTime(d.expires_at ?? d.expiresAt);
  if (Number.isNaN(at)) {
    const s = asNum(d.expires_in ?? d.expires_in_seconds ?? d.ttl_seconds, 0);
    if (s > 0) at = now + s * 1000;
  }
  const left = at - now;
  if (left > 0 && left <= 60 * 60 * 1000) return now + Math.min(left, maxMs);
  return fallbackMs ? now + fallbackMs : 0;
}

// `sms` = a code that was sent (2-minute timer fallback); false for TOTP.
function normOtp(v: unknown, sms = true): OtpChallenge {
  const src = asDict(v);
  const idOf = (x: Dict) => x.verification_id ?? x.verificationId ?? x.challenge_id;
  const d =
    [src, asDict(src.verification), asDict(src.data), asDict(src.detail)].find((x) => idOf(x) != null) ?? src;
  return {
    verificationId: asStr(idOf(d)),
    phone: asStr(d.phone ?? src.phone),
    expiresAt: otpExpiresAt(d, sms ? OTP_TTL_MS : 0, sms ? OTP_TTL_MS : OTP_MAX_MS),
    message: [d.message, src.message].find((m): m is string => typeof m === "string") ?? "",
  };
}

// Telegram bot OTP-delivery link; only https:// or tg:// ever reaches an href.
function tgLink(d: Dict): string {
  const s = asStr(d.telegram_bot_link ?? d.telegram_link ?? d.telegram_url ?? d.bot_link).trim();
  return /^(https:|tg:)\/\//i.test(s) ? s : "";
}

// Two-step OTP registration. The code arrives by SMS or the Telegram bot and
// is never in the response; we use the explicit /start endpoint.
export type RegisterStartResult = OtpChallenge & { telegramBotLink: string };
export async function registerStart(input: {
  role: BackendRole;
  name: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone: string;
  password: string;
}): Promise<RegisterStartResult> {
  const { firstName, lastName, middleName, ...rest } = input;
  const body = {
    ...rest,
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
    ...(middleName ? { middle_name: middleName } : {}),
  };
  const d = await http("/auth/register/start", { method: "POST", body: JSON.stringify(body) });
  return { ...normOtp(d), telegramBotLink: tgLink(asDict(d)) };
}
// Seller verify now creates the account immediately and returns auth tokens;
// the user comes back with account_status "pending" until an admin approves.
// The pending branch is only used when the backend returns no token at all
// (legacy queue-a-request behavior / offline).
// loginRequired: the account was created but its role needs 2FA at sign-in
// (428, or a two_factor_required flag without tokens) — the user signs in
// through /login, where the 2FA step runs.
export type RegisterVerifyResult =
  | { pending: false; token: string; refreshToken: string; user: AuthUser }
  | { pending: true; requestId: string; status: string; role: string; message: string }
  | { loginRequired: true; message: string };

export async function registerVerify(verificationId: string, code: string): Promise<RegisterVerifyResult> {
  let raw: unknown;
  try {
    raw = await http("/auth/register/verify", {
      method: "POST",
      body: JSON.stringify({ verification_id: verificationId, code }),
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 428) return { loginRequired: true, message: e.detail || "" };
    throw e;
  }
  const d = asDict(raw);
  const token = asStr(d.access_token ?? d.token);
  if (!token && (d.two_factor_required === true || asDict(d.detail).two_factor_required === true)) {
    return { loginRequired: true, message: asStr(d.message) };
  }
  if (!token) {
    return {
      pending: true,
      requestId: asStr(d.request_id),
      status: asStr(d.status, "pending"),
      role: asStr(d.role),
      message: asStr(d.message),
    };
  }
  return {
    pending: false,
    token,
    refreshToken: asStr(d.refresh_token ?? d.refreshToken),
    user: normUser(d.user ?? d),
  };
}

// A 2FA-enabled account — and every staff/seller role, where 2FA is mandatory —
// returns HTTP 428 with the challenge (in `detail` or top level) instead of
// tokens. http() would turn that into an error, so hit the endpoint raw.
// A challenge without verificationId can't be verified; the caller shows its
// message instead of a dead code step.
export type TwoFactorChallenge = OtpChallenge & { twoFactorRequired: true; method: "sms" | "totp" | "" };
export type LoginResult = AuthResult | TwoFactorChallenge;

function normChallenge(v: unknown): TwoFactorChallenge {
  const j = asDict(v);
  const dd = j.detail && typeof j.detail === "object" && !Array.isArray(j.detail) ? asDict(j.detail) : {};
  const raw = asStr(dd.method ?? dd.two_factor_method ?? dd.type ?? j.method ?? j.two_factor_method).toLowerCase();
  const method = /totp|authenticator|app/.test(raw) ? "totp" : raw ? "sms" : "";
  const o = normOtp(j, method !== "totp");
  // Keep the server's words when there is no usable challenge: non-empty
  // strings only (an object must never render as "[object Object]").
  const text = (x: unknown) => (typeof x === "string" && x.trim() ? x : "");
  return {
    ...o,
    twoFactorRequired: true,
    method,
    message: o.message || text(dd.message) || text(j.detail) || text(j.message) || text(j.error),
  };
}

export async function apiLogin(phone: string, password: string): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
  } catch {
    throw new ApiError(0, "network_error");
  }
  if (res.status === 428) return normChallenge(await res.json().catch(() => ({})));
  if (!res.ok) throw await toApiError(res);
  const body = asDict(await res.json());
  if (!asStr(body.access_token ?? body.token) && body.two_factor_required === true) return normChallenge(body);
  return normAuth(body);
}

// Second step of a 2FA login: exchange the challenge code for tokens.
export async function loginVerify2fa(verificationId: string, code: string): Promise<AuthResult> {
  return normAuth(
    await http("/auth/login/2fa", { method: "POST", body: JSON.stringify({ verification_id: verificationId, code }) }),
  );
}

// Password reset: forgot → verification; reset → set new password. Known and
// unknown phones get the same generic response, so callers must not branch
// on its content (no account enumeration).
export async function forgotPassword(phone: string): Promise<OtpChallenge> {
  return normOtp(await http("/auth/password/forgot", { method: "POST", body: JSON.stringify({ phone }) }));
}
export async function resetPassword(verificationId: string, code: string, password: string): Promise<void> {
  await http("/auth/password/reset", { method: "POST", body: JSON.stringify({ verification_id: verificationId, code, password }) });
}

export async function apiMe(): Promise<AuthUser> {
  return normUser(await http("/auth/me"));
}

// ── Lawyer profiles ───────────────────────────────────────────────
export type BackendLawyer = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  region: string;
  district?: string;
  specializations: string[];
  languages: string[];
  experienceYears: number;
  rating: number;
  reviews: number;
  basePrice: number;
  bio?: string;
  verified: boolean;
  verificationStatus: string;
  sellerType: string;
  totalCases: number;
  winsCount: number;
  partialWins: number;
  successRate: number;
  publicId?: string;
  education?: string;
  licenseNumber?: string;
  barAssociation?: string;
  organizationName?: string;
};

function normLawyer(v: unknown): BackendLawyer {
  const d = asDict(v);
  const user = asDict(d.user);
  return {
    id: asStr(d.id ?? d.user_id ?? user.id),
    userId: asStr(d.user_id ?? user.id ?? d.id),
    name: asStr(d.lawyer_name ?? d.name ?? user.name ?? d.full_name),
    phone: asStr(d.phone ?? user.phone),
    region: asStr(d.region),
    district: asStr(d.district) || undefined,
    specializations: asArr(d.specializations).map((s) => asStr(s)),
    languages: asArr(d.languages).map((l) => asStr(l)),
    experienceYears: asNum(d.experience_years),
    rating: asNum(d.rating, 5),
    reviews: asNum(d.reviews_count ?? d.reviews),
    basePrice: uzs(d, "base_hourly_price"),
    bio: asStr(d.bio) || undefined,
    verified: Boolean(d.verified ?? d.is_verified),
    verificationStatus: asStr(d.verification_status),
    sellerType: asStr(d.seller_type),
    totalCases: asNum(d.total_cases),
    winsCount: asNum(d.wins_count),
    partialWins: asNum(d.partial_wins_count),
    successRate: asNum(d.success_rate),
    publicId: asStr(d.public_id) || undefined,
    education: asStr(d.education) || undefined,
    licenseNumber: asStr(d.license_number) || undefined,
    barAssociation: asStr(d.bar_association) || undefined,
    organizationName: asStr(d.organization_name) || undefined,
  };
}

// No single-lawyer GET on the backend yet, so resolve one from the list.
export async function getLawyerById(userId: string): Promise<BackendLawyer | null> {
  if (!userId) return null;
  const all = await listLawyers();
  return all.find((l) => l.userId === userId || l.id === userId) ?? null;
}

export async function listLawyers(filters?: {
  region?: string;
  specialization?: string;
  service_id?: string;
}): Promise<BackendLawyer[]> {
  const qs = new URLSearchParams();
  if (filters?.region) qs.set("region", filters.region);
  if (filters?.specialization) qs.set("specialization", filters.specialization);
  if (filters?.service_id) qs.set("service_id", filters.service_id);
  const q = qs.toString();
  const data = await http(`/lawyers${q ? `?${q}` : ""}`);
  return listFrom(data, "lawyers", "items", "data").map(normLawyer);
}

// My offered services (GET/PUT /lawyers/me/services). Stored as service ids.
export async function getMyServices(): Promise<string[]> {
  const d = asDict(await http("/lawyers/me/services"));
  return asArr(d.services).map((v) => {
    const s = asDict(v);
    return asStr(s.id ?? s.service_id ?? v);
  });
}

export async function putMyServices(
  serviceIds: string[],
  selectedPrices: Record<string, number> = {}, // service id -> whole so'm (legacy UZS), not tiyin
): Promise<void> {
  await http("/lawyers/me/services", {
    method: "PUT",
    body: JSON.stringify({ service_ids: serviceIds, selected_prices: selectedPrices }),
  });
}

// Build the PUT /lawyers/me body from our onboarding profile.
export async function upsertMyLawyer(
  p: ProfessionalProfile,
  sellerType?: "yurist" | "advokat" | "advokat_tashkiloti",
): Promise<unknown> {
  return http("/lawyers/me", {
    method: "PUT",
    body: JSON.stringify({
      seller_type: sellerType,
      region: p.region ?? "",
      district: "",
      license_number: p.licenseNumber ?? "",
      bar_association: p.barAssociation ?? "",
      advocate_structure: p.advocateStructure ?? "",
      organization_name: p.orgName ?? "",
      experience_years: p.advocateYears ?? p.experienceYears ?? 0,
      // For a yurist there is no separate advocate/lawyer split — mirror their
      // years here too so ranking/matching (which reads lawyer experience) uses it.
      lawyer_experience_years: p.lawyerYears ?? p.experienceYears ?? 0,
      specializations: p.practiceAreas,
      languages: p.languages,
      bio: p.bio ?? "",
      education: p.education ?? "",
      total_cases: p.stats?.totalCases ?? 0,
      wins_count: p.stats?.fullyWonCases ?? 0,
      partial_wins_count: p.stats?.partiallyWonCases ?? 0,
      // Echo the price read by getMyLawyer so a profile save no longer wipes it
      // (whole so'm, legacy UZS, not tiyin).
      base_hourly_price: Math.round(p.hourlyPrice ?? 0),
    }),
  });
}

// Load the signed-in seller's own lawyer profile (GET /lawyers/me) and map it
// back onto our onboarding shape so the profile editor can prefill + merge
// before saving. Practice areas / case stats moved here out of registration.
export async function getMyLawyer(): Promise<ProfessionalProfile> {
  const d = asDict(await http("/lawyers/me"));
  return {
    name: asStr(d.lawyer_name),
    languages: asArr(d.languages).map((v) => asStr(v)),
    services: [],
    practiceAreas: asArr(d.specializations).map((v) => asStr(v)),
    workHistory: [],
    region: asStr(d.region),
    bio: asStr(d.bio),
    education: asStr(d.education),
    licenseNumber: asStr(d.license_number),
    barAssociation: asStr(d.bar_association),
    advocateStructure: asStr(d.advocate_structure),
    orgName: asStr(d.organization_name),
    hourlyPrice: uzs(d, "base_hourly_price"),
    advocateYears: asNum(d.experience_years),
    lawyerYears: asNum(d.lawyer_experience_years),
    experienceYears: asNum(d.experience_years) || asNum(d.lawyer_experience_years),
    stats: {
      totalCases: asNum(d.total_cases),
      fullyWonCases: asNum(d.wins_count),
      partiallyWonCases: asNum(d.partial_wins_count),
      // Backend computes success_rate; StatsEditor recomputes the same formula
      // on edit, so this is just the initial value.
      successRate: asNum(d.success_rate),
    },
  };
}

// ── Service catalog ───────────────────────────────────────────────
export type BackendService = {
  id: string;
  name: string;
  slug: string;
  categoryId?: string;
  categoryTitle?: string;
  price?: number;
  description?: string;
  isActive: boolean;
  // LexGo catalog metadata
  catalogCode?: string;
  executorType?: string;
  advokatRequired: boolean;
  pricingTier?: string;
};
export type BackendCategory = { id: string; name: string; slug: string };

// Prefer a localized catalog title for the current UI language.
function serviceTitle(d: Dict, locale: string): string {
  const byLocale =
    locale === "ru"
      ? d.title_ru
      : locale === "en"
        ? d.title_uz_latn // no EN catalog title; latin is the closest neutral
        : d.title_uz_latn;
  return asStr(byLocale ?? d.title ?? d.name);
}

function normService(v: unknown, locale = "uz"): BackendService {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    name: serviceTitle(d, locale),
    slug: asStr(d.slug),
    categoryId: asStr(d.category_id ?? d.categoryId) || undefined,
    categoryTitle: asStr(d.category_title) || undefined,
    price: uzsOpt(d, "standard_price", "base_price"),
    description: asStr(d.description) || undefined,
    isActive: d.is_active !== false,
    catalogCode: asStr(d.catalog_code) || undefined,
    executorType: asStr(d.executor_type) || undefined,
    advokatRequired: Boolean(d.advokat_required),
    pricingTier: asStr(d.pricing_tier) || undefined,
  };
}

export type ServiceFilters = {
  category_id?: string;
  q?: string;
  executor_type?: string;
  catalog_only?: boolean;
};

export async function getServiceCategories(): Promise<BackendCategory[]> {
  const data = await http("/service-categories");
  return listFrom(data, "categories", "items", "data").map((v) => {
    const d = asDict(v);
    return { id: asStr(d.id), name: asStr(d.title ?? d.name), slug: asStr(d.slug) };
  });
}

export async function getServices(filters?: ServiceFilters, locale = "uz"): Promise<BackendService[]> {
  const qs = new URLSearchParams();
  if (filters?.category_id) qs.set("category_id", filters.category_id);
  if (filters?.q) qs.set("q", filters.q);
  if (filters?.executor_type) qs.set("executor_type", filters.executor_type);
  if (filters?.catalog_only != null) qs.set("catalog_only", String(filters.catalog_only));
  const q = qs.toString();
  const data = await http(`/services${q ? `?${q}` : ""}`);
  return listFrom(data, "services", "items", "data").map((v) => normService(v, locale));
}

// Package tariffs (GET /service-packages).
export type BackendPackage = {
  id: string;
  code: string;
  title: string;
  tariff: string;
  price: number;
};
export async function getServicePackages(params?: { package_code?: string; tariff?: string }): Promise<BackendPackage[]> {
  const qs = new URLSearchParams();
  if (params?.package_code) qs.set("package_code", params.package_code);
  if (params?.tariff) qs.set("tariff", params.tariff);
  const q = qs.toString();
  const data = await http(`/service-packages${q ? `?${q}` : ""}`);
  return listFrom(data, "packages", "items", "data").map((v) => {
    const d = asDict(v);
    return {
      id: asStr(d.id),
      code: asStr(d.package_code ?? d.code),
      title: asStr(d.title ?? d.name),
      tariff: asStr(d.tariff),
      price: uzs(d, "price", "standard_price"),
    };
  });
}

// ── Subscription plans ────────────────────────────────────────────
// Prices follow the TZ model: monthly base, 6-month, yearly (−10%/mo) and
// prepaid-yearly (a further −10%). All amounts are admin-managed on the backend.
export type BackendPlan = {
  id: string;
  name: string;
  slug: string;
  price: number; // monthly (back-compat alias)
  monthlyPrice: number;
  sixMonthPrice: number;
  yearlyPrice: number;
  prepaidYearlyPrice: number;
  audience: string;
  billingType: string;
  sortOrder: number;
  allowedGiftDurations: number[];
  description: string;
  features: string[];
  isGiftable: boolean;
  isActive: boolean;
};

// Backend ships localized `name`/`features` as { uz, ru, en } objects; pick the
// current UI locale (fallback uz, then the legacy flat string/array).
function pickLoc(v: unknown, locale: string, fallback: string): string {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const d = v as Dict;
    return asStr(d[locale] ?? d.uz ?? fallback);
  }
  return asStr(v ?? fallback);
}
function pickLocArr(v: unknown, locale: string, fallback: unknown): string[] {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const arr = (v as Dict)[locale] ?? (v as Dict).uz;
    if (Array.isArray(arr)) return arr.map((x) => asStr(x));
  }
  if (Array.isArray(v)) return v.map((x) => asStr(x));
  return asArr(fallback).map((x) => asStr(x));
}

export async function getSubscriptionPlans(locale = "uz"): Promise<BackendPlan[]> {
  const data = await http("/subscription-plans");
  return listFrom(data, "plans", "items", "data").map((v) => {
    const d = asDict(v);
    const monthly = uzs(d, "monthly_price", "price");
    return {
      id: asStr(d.id),
      name: pickLoc(d.name, locale, asStr(d.title)),
      slug: asStr(d.slug),
      price: monthly,
      monthlyPrice: monthly,
      sixMonthPrice: uzs(d, "six_month_price"),
      yearlyPrice: uzs(d, "yearly_price"),
      prepaidYearlyPrice: uzs(d, "prepaid_yearly_price"),
      audience: asStr(d.audience),
      billingType: asStr(d.billing_type),
      sortOrder: asNum(d.sort_order),
      allowedGiftDurations: asArr(d.allowed_gift_durations).map((x) => asNum(x)),
      description: asStr(d.description),
      features: pickLocArr(d.features, locale, d.benefits),
      isGiftable: Boolean(d.is_giftable),
      isActive: d.is_active !== false,
    };
  });
}

// ── Orders & cases ────────────────────────────────────────────────
export type BackendCase = {
  id: string;
  caseNumber: string;
  caseType: string;
  stage: string;
  status: string;
  nextAction: string;
  deadlineAt?: string;
  title: string;
  description: string;
  clientUserId?: string;
  lawyerUserId?: string;
  orderId?: string;
};

function normCase(v: unknown): BackendCase {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    caseNumber: asStr(d.case_number ?? d.caseNumber),
    caseType: asStr(d.title ?? d.case_type ?? d.caseType),
    stage: asStr(d.stage),
    status: asStr(d.status),
    nextAction: asStr(d.next_action ?? d.nextAction),
    deadlineAt: asStr(d.deadline_at ?? d.deadlineAt) || undefined,
    title: asStr(d.title ?? d.case_type),
    description: asStr(d.description),
    clientUserId: asStr(d.client_user_id) || undefined,
    lawyerUserId: asStr(d.lawyer_user_id) || undefined,
    orderId: asStr(d.order_id) || undefined,
  };
}

export type BackendOrder = {
  id: string;
  title: string;
  serviceName: string;
  status: string;
  paymentStatus: string;
  contactUnlocked: boolean;
  areaKey: string;
  region: string;
  budget: string;
  createdAt: string;
  lawyerName?: string;
};

function normOrder(v: unknown): BackendOrder {
  const d = asDict(v);
  const details = asDict(d.details);
  const service = asDict(d.service);
  const amount = uzsOpt(d, "price", "amount");
  return {
    id: asStr(d.id),
    title: asStr(details.question ?? d.title ?? service.name),
    serviceName: asStr(service.name ?? d.service_name),
    status: asStr(d.status),
    paymentStatus: asStr(d.payment_status),
    contactUnlocked: Boolean(d.contact_unlocked),
    areaKey: asStr(d.area ?? service.category ?? details.area),
    region: asStr(d.region ?? details.region),
    budget: amount != null ? fmtUzs(amount) : asStr(details.budget),
    createdAt: asStr(d.created_at ?? d.createdAt),
    lawyerName: asStr(d.lawyer_name ?? asDict(d.lawyer).name) || undefined,
  };
}

export async function listOrders(): Promise<BackendOrder[]> {
  return listFrom(await http("/orders"), "orders", "items", "data").map(normOrder);
}

// Orders still open for a seller to take — the marketplace/opportunities feeds.
// Already accepted/declined/closed orders belong in "my cases", not here.
const TAKEN_ORDER_STATUSES = new Set([
  "accepted",
  "declined",
  "rejected",
  "in_progress",
  "completed",
  "cancelled",
  "canceled",
  "closed",
  "done",
]);
export async function listOpenOrders(): Promise<BackendOrder[]> {
  return (await listOrders()).filter((o) => !TAKEN_ORDER_STATUSES.has((o.status || "").toLowerCase()));
}

export async function createOrder(input: {
  service_id: string;
  package_id?: string;
  lawyer_user_id?: string;
  source?: string;
  details?: Record<string, unknown>;
}): Promise<BackendOrder> {
  return normOrder(
    await http("/orders", {
      method: "POST",
      body: JSON.stringify({ source: "web", ...input }),
    }),
  );
}

// ── Pricing quote (GET /pricing/quote) ────────────────────────────
// Backend applies automatic modifiers (region, seller experience,
// super-advokat, 5% referral discount) and returns the final total. Always
// call this before checkout and pay `totalAmount`.
export type PriceModifier = { key: string; label: string; percent?: number; amount?: number };
export type PriceQuote = {
  baseAmount: number;
  totalAmount: number;
  currency: string;
  modifiers: PriceModifier[];
  referralDiscountPercent?: number;
};
export async function getPricingQuote(params: {
  service_id: string;
  package_id?: string;
  lawyer_user_id?: string;
  region?: string;
}): Promise<PriceQuote> {
  const q = new URLSearchParams();
  q.set("service_id", params.service_id);
  if (params.package_id) q.set("package_id", params.package_id);
  // Backend expects `seller_user_id`; modifiers only apply when it's sent.
  if (params.lawyer_user_id) q.set("seller_user_id", params.lawyer_user_id);
  if (params.region) q.set("region", params.region);
  const d = asDict(await http(`/pricing/quote?${q.toString()}`));
  const rd = asDict(d.referral_discount);
  return {
    baseAmount: uzs(d, "base_amount", "subtotal", "base"),
    totalAmount: uzs(d, "total_amount", "total", "price"),
    currency: asStr(d.currency, "UZS"),
    referralDiscountPercent: (asNum(d.discount_percent) || asNum(rd.discount_percent)) || undefined,
    modifiers: asArr(d.modifiers).map((x) => {
      const m = asDict(x);
      return {
        key: asStr(m.key ?? m.type),
        label: asStr(m.label ?? m.name),
        percent: asNum(m.percent) || undefined,
        amount: uzs(m, "amount") || undefined,
      };
    }),
  };
}

// ── Payment policy (GET /orders/{id}/payment-policy) ──────────────
// The 10% advance that unlocks private contact/chat. Partial payments are
// cumulative; contact opens once the paid share crosses the threshold.
export type PaymentPolicy = {
  totalAmount: number;
  advancePercent: number;
  advanceAmount: number;
  paidAmount: number;
  remainingToUnlock: number;
  contactUnlocked: boolean;
  currency: string;
};
export async function getPaymentPolicy(orderId: string): Promise<PaymentPolicy> {
  const d = asDict(await http(`/orders/${orderId}/payment-policy`));
  const advanceAmount = uzs(d, "advance_amount", "upfront_amount");
  const paidAmount = uzs(d, "paid_amount", "paid");
  // Backend doesn't return remaining_to_unlock — derive it from the advance.
  const remaining = uzsOpt(d, "remaining_to_unlock", "remaining") ?? Math.max(0, advanceAmount - paidAmount);
  return {
    totalAmount: uzs(d, "total_amount", "total", "price"),
    advancePercent: asNum(d.advance_percent ?? d.upfront_percent, 10),
    advanceAmount,
    paidAmount,
    remainingToUnlock: remaining,
    contactUnlocked: Boolean(d.contact_unlocked),
    currency: asStr(d.currency, "UZS"),
  };
}

export async function listCases(): Promise<BackendCase[]> {
  return listFrom(await http("/cases"), "cases", "items", "data").map(normCase);
}

export async function createCase(input: Record<string, unknown>): Promise<unknown> {
  return http("/cases", { method: "POST", body: JSON.stringify(input) });
}

// ── Demo purchase flows (LEXGO_FRONTEND_UPDATE.md) ────────────────
export type PurchaseResult = {
  paymentId: string;
  paymentStatus: string;
  paymentUrl?: string;
  orderId?: string;
  chatRoomId?: string;
  subscriptionId?: string;
};
// A provider checkout link the browser may navigate to: absolute https only,
// never another scheme ('' otherwise).
export function safePaymentUrl(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https:\/\/[^\s]+$/i.test(s) ? s : "";
}
function normPurchase(v: unknown): PurchaseResult {
  const d = asDict(v);
  const payment = asDict(d.payment);
  const invoice = asDict(d.invoice ?? payment.invoice);
  // Backend returns both `chat_room` and `room` for compatibility.
  const room = asDict(d.chat_room ?? d.room);
  const order = asDict(d.order);
  // A real provider (Payme/Click) returns a checkout link; it may sit on the
  // payment, on its invoice, at the top level, or be the `payment` string itself.
  const url =
    typeof d.payment === "string"
      ? d.payment
      : (payment.payment_url ?? payment.checkout_url ?? invoice.payment_url ?? invoice.url ?? d.payment_url ?? d.checkout_url);
  return {
    paymentId: asStr(payment.id ?? d.payment_id ?? invoice.payment_id),
    paymentStatus: asStr(payment.status ?? d.payment_status ?? invoice.status),
    paymentUrl: safePaymentUrl(url) || undefined,
    orderId: asStr(order.id) || undefined,
    chatRoomId: asStr(room.id) || undefined,
    subscriptionId: asStr(d.subscription_id) || undefined,
  };
}
export async function demoPurchase(input: {
  service_id: string;
  lawyer_user_id: string;
  package_id?: string;
  provider?: string;
  details?: Record<string, unknown>;
}): Promise<PurchaseResult> {
  return normPurchase(
    await http("/orders/demo-purchase", { method: "POST", body: JSON.stringify({ provider: "demo_payme", ...input }) }),
  );
}
export async function demoPayOrder(orderId: string, provider = "demo_payme"): Promise<PurchaseResult> {
  return normPurchase(
    await http(`/orders/${orderId}/demo-pay?provider=${encodeURIComponent(provider)}`, { method: "POST" }),
  );
}
// One-time private chat fee in whole so'm (legacy UZS), not tiyin (T0-16).
const PRIVATE_CHAT_PRICE_UZS = 10000;
export async function demoPrivateChat(input: {
  lawyer_user_id: string;
  amount?: number; // whole so'm (legacy UZS), not tiyin
  provider?: string;
  title?: string;
}): Promise<PurchaseResult> {
  return normPurchase(
    await http("/payments/demo-private-chat", {
      method: "POST",
      body: JSON.stringify({
        amount: PRIVATE_CHAT_PRICE_UZS,
        provider: "demo_payme",
        title: "Private chat",
        // send both keys — backend accepts either
        seller_user_id: input.lawyer_user_id,
        ...input,
      }),
    }),
  );
}
export async function demoPlanPurchase(
  planId: string,
  input: { provider?: string; billing_period?: string; family_members?: unknown[] } = {},
): Promise<PurchaseResult> {
  return normPurchase(
    await http(`/subscription-plans/${planId}/demo-purchase`, {
      method: "POST",
      body: JSON.stringify({ plan_id: planId, provider: "demo_payme", billing_period: "monthly", family_members: [], ...input }),
    }),
  );
}
export async function demoConfirmPayment(paymentId: string): Promise<PurchaseResult> {
  return normPurchase(await http(`/payments/${paymentId}/demo-confirm`, { method: "POST" }));
}

// ── Payments ──────────────────────────────────────────────────────
// Provider sent to the real checkout endpoints (/gifts, /promotions/checkout).
// Production has the demo provider disabled and Payme/Click answer 503 until
// they are configured. A staging build sets NEXT_PUBLIC_PAYMENT_PROVIDER=demo_payme
// in its deployment env to keep the demo checkout; inlined at build time.
const CHECKOUT_PROVIDER = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || "payme";
export type PaymentProvider = "payme" | "click" | "rahmat";
export async function createPayment(input: {
  provider: PaymentProvider;
  amount: number; // whole so'm (legacy UZS), never tiyin
  currency?: string;
  provider_payload?: Record<string, unknown>;
}): Promise<{ id: string; status: string; paymentUrl?: string }> {
  const d = asDict(
    await http("/payments", {
      method: "POST",
      body: JSON.stringify({ currency: "UZS", provider_payload: {}, ...input }),
    }),
  );
  return {
    id: asStr(d.id ?? asDict(d.payment).id),
    status: asStr(d.status),
    paymentUrl: safePaymentUrl(d.payment_url ?? asDict(d.invoice).payment_url) || undefined,
  };
}

// ── Document templates ────────────────────────────────────────────
export type BackendTemplate = {
  id: string;
  name: string;
  slug: string;
  category: string;
  language: string;
  description: string;
  price: number;
  visibility: string;
  isActive: boolean;
  templateText: string;
  questionnaire: { name: string; label: string; required?: boolean }[];
};

function normTemplate(v: unknown): BackendTemplate {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    name: asStr(d.title ?? d.name),
    slug: asStr(d.slug),
    category: asStr(d.category),
    language: asStr(d.language),
    description: asStr(d.description),
    price: uzs(d, "price"),
    visibility: asStr(d.visibility, "client"),
    isActive: d.is_active !== false,
    templateText: asStr(d.template_text ?? d.body ?? d.content),
    questionnaire: asArr(d.fields ?? d.questionnaire).map((q) => {
      const x = asDict(q);
      return { name: asStr(x.name), label: asStr(x.label ?? x.name), required: Boolean(x.required) };
    }),
  };
}

export async function getDocumentTemplates(): Promise<BackendTemplate[]> {
  return listFrom(await http("/document-templates"), "templates", "items", "data").map(normTemplate);
}

// Single template incl. body (GET /document-templates/{id}). Used to prefill
// the admin edit form so the template_text can be edited too.
export async function getDocumentTemplate(id: string): Promise<BackendTemplate> {
  return normTemplate(await http(`/document-templates/${id}`));
}

// ── Document requests (contract/application flow) ─────────────────
export type ContractFile = {
  id: string;
  fileName: string;
  mimeType: string;
  fileBase64: string;
  inlineUrl: string;
  downloadUrl: string;
};
export type DocumentRequest = {
  id: string;
  templateId: string;
  title: string;
  documentType: string;
  status: string; // questionnaire | awaiting_payment | payment_pending | file_ready
  price: number;
  currency: string;
  questionnaire: { name: string; label: string; required?: boolean }[];
  answers: Record<string, unknown>;
  contractFile?: ContractFile;
  paymentUrl?: string; // provider checkout link returned by the pay call
};

function normDocRequest(v: unknown): DocumentRequest {
  const d = asDict(v);
  const cf = d.contract_file ? asDict(d.contract_file) : null;
  const pay = asDict(d.payment);
  return {
    id: asStr(d.id),
    templateId: asStr(d.template_id ?? d.templateId),
    title: asStr(d.title),
    documentType: asStr(d.document_type ?? d.documentType),
    status: asStr(d.status),
    price: uzs(d, "price"),
    currency: asStr(d.currency, "UZS"),
    questionnaire: asArr(d.questionnaire).map((q) => {
      const x = asDict(q);
      return { name: asStr(x.name), label: asStr(x.label), required: Boolean(x.required) };
    }),
    answers: (d.answers as Record<string, unknown>) ?? {},
    contractFile: cf
      ? {
          id: asStr(cf.id),
          fileName: asStr(cf.file_name),
          mimeType: asStr(cf.mime_type, "application/pdf"),
          fileBase64: asStr(cf.file_base64),
          inlineUrl: asStr(cf.inline_url),
          downloadUrl: asStr(cf.download_url),
        }
      : undefined,
    paymentUrl:
      safePaymentUrl(
        typeof d.payment === "string" ? d.payment : (d.payment_url ?? pay.payment_url ?? asDict(d.invoice ?? pay.invoice).payment_url),
      ) || undefined,
  };
}

// The signed-in user's document requests (newest first), for mapping status
// back onto template cards so a paid document isn't paid for twice.
export async function listDocumentRequests(): Promise<DocumentRequest[]> {
  return listFrom(await http("/document-requests"), "items", "data", "requests").map(normDocRequest);
}

export async function createDocumentRequest(input: {
  template_id?: string;
  order_id?: string;
  document_type: string;
  title: string;
  questionnaire?: { name: string; label: string; required?: boolean }[];
  answers?: Record<string, unknown>;
  price?: number; // whole so'm (legacy UZS)
  currency?: string;
}): Promise<DocumentRequest> {
  return normDocRequest(
    await http("/document-requests", { method: "POST", body: JSON.stringify({ currency: "UZS", ...input }) }),
  );
}
export async function updateDocumentAnswers(
  requestId: string,
  answers: Record<string, unknown>,
): Promise<DocumentRequest> {
  return normDocRequest(
    await http(`/document-requests/${requestId}/answers`, { method: "PUT", body: JSON.stringify({ answers }) }),
  );
}
export async function payDocumentRequest(
  requestId: string,
  provider: "payme" | "click",
  amount: number, // whole so'm, as read by normDocRequest (legacy UZS, not tiyin)
): Promise<DocumentRequest> {
  return normDocRequest(
    await http(`/document-requests/${requestId}/payments`, {
      method: "POST",
      body: JSON.stringify({ provider, amount: Math.round(amount) }),
    }),
  );
}
export async function getDocumentRequest(requestId: string): Promise<DocumentRequest> {
  return normDocRequest(await http(`/document-requests/${requestId}`));
}

// ── Organizations (advocate orgs) ─────────────────────────────────
export type Organization = {
  id: string;
  name: string;
  organizationType: string;
  phone: string;
  inn: string;
  region: string;
  address: string;
  verificationStatus: string;
  ownerUserId: string;
};
function normOrg(v: unknown): Organization {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    name: asStr(d.name),
    organizationType: asStr(d.organization_type),
    phone: asStr(d.phone),
    inn: asStr(d.inn),
    region: asStr(d.region),
    address: asStr(d.address),
    verificationStatus: asStr(d.verification_status),
    ownerUserId: asStr(d.owner_user_id),
  };
}
export type OrgMember = { id: string; userId: string; title: string; status: string };
function normMember(v: unknown): OrgMember {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    userId: asStr(d.user_id),
    title: asStr(d.title),
    status: asStr(d.status),
  };
}
export async function listOrganizations(): Promise<Organization[]> {
  return listFrom(await http("/organizations"), "organizations", "items", "data").map(normOrg);
}
export async function createOrganization(input: {
  name: string;
  organization_type?: string;
  phone?: string;
  inn?: string;
  region?: string;
  address?: string;
}): Promise<Organization> {
  return normOrg(await http("/organizations", { method: "POST", body: JSON.stringify(input) }));
}
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  return listFrom(await http(`/organizations/${orgId}/members`), "members", "items", "data").map(normMember);
}
export async function addOrgMember(
  orgId: string,
  input: { user_id: string; title?: string; role_id?: string },
): Promise<OrgMember> {
  return normMember(await http(`/organizations/${orgId}/members`, { method: "POST", body: JSON.stringify(input) }));
}

// ── Secure chat ───────────────────────────────────────────────────
export type SecureMessage = {
  id: string;
  senderId: string;
  filteredContent: string;
  isBlocked: boolean;
  blockReason?: string;
  createdAt: string;
};
function normSecureMsg(v: unknown): SecureMessage {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    senderId: asStr(d.sender_user_id ?? d.sender_id ?? d.senderId),
    filteredContent: asStr(d.filtered_content ?? d.content),
    isBlocked: Boolean(d.is_blocked),
    blockReason: asStr(d.block_reason) || undefined,
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
export type SecureRoom = {
  id: string;
  status: string;
  orderId?: string;
  caseId?: string;
  clientUserId?: string;
  sellerUserId?: string;
  createdAt: string;
};
function normRoom(v: unknown): SecureRoom {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    status: asStr(d.status),
    orderId: asStr(d.order_id) || undefined,
    caseId: asStr(d.case_id) || undefined,
    clientUserId: asStr(d.client_user_id) || undefined,
    sellerUserId: asStr(d.seller_user_id) || undefined,
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
export async function listSecureChats(): Promise<SecureRoom[]> {
  return listFrom(await http("/secure-chats"), "rooms", "items", "data").map(normRoom);
}
export async function createSecureChat(input: Record<string, unknown>): Promise<SecureRoom> {
  return normRoom(await http("/secure-chats", { method: "POST", body: JSON.stringify(input) }));
}
// Set how long messages live before auto-deletion. 0 = never (off).
// The backend keeps a 30-day archive after deletion.
export async function setChatAutoDelete(roomId: string, autoDeleteHours: number): Promise<void> {
  await http(`/secure-chats/${roomId}/settings`, {
    method: "PATCH",
    body: JSON.stringify({ auto_delete_hours: autoDeleteHours }),
  });
}
// Delete (archive) a chat. Backend keeps it recoverable for ~1 month.
export async function deleteSecureChat(roomId: string): Promise<void> {
  await http(`/secure-chats/${roomId}`, { method: "DELETE" });
}
// Create a Zoom meeting for this chat (call-center advocates). Returns the
// join URL for participants and the host start URL.
export type ZoomMeeting = { joinUrl: string; startUrl: string; meetingId: string };
export async function createZoomMeeting(roomId: string): Promise<ZoomMeeting> {
  const d = asDict(await http(`/secure-chats/${roomId}/zoom`, { method: "POST", body: JSON.stringify({}) }));
  return {
    joinUrl: asStr(d.join_url ?? d.joinUrl),
    startUrl: asStr(d.start_url ?? d.startUrl ?? d.join_url),
    meetingId: asStr(d.meeting_id ?? d.id),
  };
}
export async function getSecureMessages(roomId: string): Promise<SecureMessage[]> {
  return listFrom(await http(`/secure-chats/${roomId}/messages`), "messages", "items", "data").map(normSecureMsg);
}
export async function sendSecureMessage(roomId: string, content: string): Promise<SecureMessage> {
  return normSecureMsg(
    await http(`/secure-chats/${roomId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message_type: "text", content, meta: {} }),
    }),
  );
}
export function secureSocketUrl(roomId: string, token?: string | null): string {
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${backendOrigin("ws")}/ws/secure-chats/${roomId}${q}`;
}
// WebRTC signaling socket for a specific call session.
export function callSocketUrl(roomId: string, callId: string, token?: string | null): string {
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${backendOrigin("ws")}/ws/secure-chats/${roomId}/calls/${callId}${q}`;
}

// ── Approvals (four-eyes) ─────────────────────────────────────────
export type Approval = {
  id: string;
  type: string;
  status: string;
  adminApproved: boolean;
  managerApproved: boolean;
  createdAt: string;
};
function normApproval(v: unknown): Approval {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    type: asStr(d.request_type ?? d.type ?? d.kind),
    status: asStr(d.status),
    adminApproved: !!(d.admin_approved_by_user_id ?? d.admin_approved),
    managerApproved: !!(d.manager_approved_by_user_id ?? d.manager_approved),
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
export async function listApprovals(): Promise<Approval[]> {
  return listFrom(await http("/approvals"), "approvals", "items", "data").map(normApproval);
}
export async function createApproval(input: Record<string, unknown>): Promise<unknown> {
  return http("/approvals", { method: "POST", body: JSON.stringify(input) });
}
export async function adminApprove(id: string): Promise<Approval> {
  return normApproval(await http(`/approvals/${id}/admin-approve`, { method: "POST" }));
}
export async function managerApprove(id: string): Promise<Approval> {
  return normApproval(await http(`/approvals/${id}/manager-approve`, { method: "POST" }));
}

// ── Leads ─────────────────────────────────────────────────────────
export type Lead = {
  id: string;
  name: string;
  phone: string;
  source: string;
  category: string;
  region: string;
  urgency: string;
  note: string;
  status: string;
  score: number;
  createdAt: string;
};
function normLead(v: unknown): Lead {
  const d = asDict(v);
  const det = asDict(d.details);
  return {
    id: asStr(d.id),
    name: asStr(det.name ?? d.name),
    phone: asStr(det.phone ?? d.phone),
    source: asStr(d.source),
    category: asStr(d.category),
    region: asStr(d.region),
    urgency: asStr(d.urgency),
    note: asStr(det.note ?? det.message ?? d.note),
    status: asStr(d.status),
    score: asNum(d.score),
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
// Contact info is carried in `details` (the schema has no top-level name/phone).
export async function createLead(input: {
  name: string;
  phone: string;
  note?: string;
  category?: string;
  region?: string;
  urgency?: string;
}): Promise<unknown> {
  return http("/leads", {
    method: "POST",
    body: JSON.stringify({
      source: "web",
      category: input.category,
      region: input.region,
      urgency: input.urgency,
      details: { name: input.name, phone: input.phone, note: input.note ?? "" },
    }),
  });
}
export async function listLeads(): Promise<Lead[]> {
  return listFrom(await http("/admin/leads"), "leads", "items", "data").map(normLead);
}
// Admin manual lead management.
export async function adminCreateLead(input: {
  name?: string;
  phone?: string;
  note?: string;
  source?: string;
  category?: string;
  region?: string;
  urgency?: string;
}): Promise<Lead> {
  return normLead(
    await http("/admin/leads", {
      method: "POST",
      body: JSON.stringify({
        source: input.source || "manual",
        category: input.category || "",
        region: input.region || "",
        urgency: input.urgency || "",
        details: { name: input.name || "", phone: input.phone || "", note: input.note || "" },
      }),
    }),
  );
}
export async function adminUpdateLead(leadId: string, patch: Record<string, unknown>): Promise<Lead> {
  return normLead(await http(`/admin/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(patch) }));
}
// Backend-driven lead kanban (GET /admin/leads/kanban, PATCH .../move).
export type KanbanCard = { lead: Lead; position: number };
export type KanbanColumn = { key: string; title: string; color: string; order: number; isFinal: boolean; count: number; cards: KanbanCard[] };
export async function getLeadKanban(): Promise<KanbanColumn[]> {
  const cols = listFrom(await http("/admin/leads/kanban"), "columns", "items", "data");
  return cols
    .map((c) => {
      const d = asDict(c);
      return {
        key: asStr(d.key),
        title: asStr(d.title),
        color: asStr(d.color),
        order: asNum(d.order),
        isFinal: Boolean(d.is_final),
        count: asNum(d.count),
        cards: asArr(d.leads).map((x) => {
          const l = asDict(x);
          return { lead: normLead(l.lead ?? l), position: asNum(l.position) };
        }),
      };
    })
    .sort((a, b) => a.order - b.order);
}
export async function moveLeadKanban(leadId: string, columnKey: string, position: number): Promise<void> {
  await http(`/admin/leads/${leadId}/move`, { method: "PATCH", body: JSON.stringify({ column_key: columnKey, position }) });
}
export async function adminDeleteLead(leadId: string): Promise<void> {
  await http(`/admin/leads/${leadId}`, { method: "DELETE" });
}

// Upsert kanban columns (PUT /admin/leads/kanban/columns takes a bare list and
// merges by key — columns not in the list are left untouched, so a single
// changed/added column can be sent on its own). No delete endpoint exists yet.
export type KanbanColumnInput = { key: string; title: string; color?: string; order?: number; isFinal?: boolean };
export async function saveLeadKanbanColumns(columns: KanbanColumnInput[]): Promise<void> {
  await http("/admin/leads/kanban/columns", {
    method: "PUT",
    body: JSON.stringify(
      columns.map((c) => ({
        key: c.key,
        title: c.title,
        color: c.color || "#6b7280",
        order: c.order ?? 0,
        is_final: Boolean(c.isFinal),
      })),
    ),
  });
}

// Delete a custom kanban column. If it holds leads, pass reassignTo to move
// them first (backend 409s without it). Final/system columns can't be deleted.
export async function deleteLeadKanbanColumn(key: string, reassignTo?: string): Promise<void> {
  const qs = reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : "";
  await http(`/admin/leads/kanban/columns/${encodeURIComponent(key)}${qs}`, { method: "DELETE" });
}

// ── Admin dashboard ───────────────────────────────────────────────
export type DashboardStat = { label: string; value: number };
export type DashboardChart = { key: string; points: { label: string; value: number }[] };
export type AdminDashboard = {
  totals: DashboardStat[];
  charts: DashboardChart[];
};
function toStats(obj: unknown): DashboardStat[] {
  const d = asDict(obj);
  return Object.entries(d)
    // Canonical tiyin twins (T0-16) are not display stats; the legacy so'm key is.
    .filter(([label, v]) => !label.endsWith("_tiyin") && (typeof v === "number" || typeof v === "string"))
    .map(([label, v]) => ({ label, value: asNum(v) }));
}
export async function getAdminDashboard(): Promise<AdminDashboard> {
  const d = asDict(await http("/admin/dashboard"));
  const totals = [
    ...toStats(d.totals),
    ...toStats(d.payments),
    ...toStats(d.orders),
    ...toStats(d.leads),
    ...toStats(d.sellers),
  ];
  const chartsObj = asDict(d.charts);
  const charts: DashboardChart[] = Object.entries(chartsObj).map(([key, val]) => {
    const arr = asArr(val).map((p) => {
      const x = asDict(p);
      return {
        label: asStr(x.label ?? x.date ?? x.day ?? x.name ?? x.key),
        value: asNum(x.value ?? x.count ?? x.total ?? x.amount),
      };
    });
    return { key, points: arr };
  });
  return { totals, charts };
}

// ── Seller verification / admin actions ───────────────────────────
export async function requestVerification(
  input: Record<string, unknown> = {},
): Promise<unknown> {
  // check_type is required by the backend (SellerVerificationCreate); default to
  // a manual review request when the caller doesn't specify one.
  return http("/lawyers/me/verifications", {
    method: "POST",
    body: JSON.stringify({ check_type: "manual", ...input }),
  });
}
export async function adminVerifyLawyer(lawyerUserId: string): Promise<unknown> {
  return http(`/admin/lawyers/${lawyerUserId}/verify`, { method: "POST" });
}
export async function adminMarkPaid(paymentId: string): Promise<unknown> {
  return http(`/admin/payments/${paymentId}/mark-paid`, { method: "POST" });
}

// ── Generic module records (academy, b2b, ads, case-documents, legal-aid,
//    seller-onboarding, refund/replacement) — all share one shape ──────
export type ModuleRecord = {
  id: string;
  module: string;
  recordType: string;
  title: string;
  status: string;
  price: number;
  currency: string;
  payload: Record<string, unknown>;
  createdAt: string;
};
function normModule(v: unknown): ModuleRecord {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    module: asStr(d.module),
    recordType: asStr(d.record_type),
    title: asStr(d.title),
    status: asStr(d.status),
    price: uzs(d, "price"),
    currency: asStr(d.currency, "UZS"),
    payload: (d.payload as Record<string, unknown>) ?? {},
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
export type ModuleInput = {
  title: string;
  record_type?: string;
  status?: string;
  price?: number; // whole so'm (legacy UZS)
  currency?: string;
  payload?: Record<string, unknown>;
};
function listModule(path: string): Promise<ModuleRecord[]> {
  return http(path).then((d) => listFrom(d, "items", "data").map(normModule));
}
function createModule(path: string, input: ModuleInput): Promise<ModuleRecord> {
  return http(path, {
    method: "POST",
    body: JSON.stringify({
      record_type: input.record_type ?? "",
      title: input.title,
      status: input.status ?? "active",
      price: input.price ?? 0,
      currency: input.currency ?? "UZS",
      payload: input.payload ?? {},
    }),
  }).then(normModule);
}

export const listCourses = () => listModule("/academy/courses");
export const listB2bProducts = () => listModule("/b2b/products");
export const listAds = () => listModule("/ads/products");
export const createAd = (i: ModuleInput) => createModule("/ads/products", i);
export const listCaseDocuments = () => listModule("/case-documents");
export const createCaseDocument = (i: ModuleInput) => createModule("/case-documents", i);
export const listLegalAid = () => listModule("/legal-aid/requests");
export const createLegalAidRequest = (i: ModuleInput) => createModule("/legal-aid/requests", i);
export const createSellerOnboarding = (i: ModuleInput) => createModule("/seller-onboarding", i);
export const createRefundRequest = (i: ModuleInput) => createModule("/refund-requests", i);
export const createReplacementRequest = (i: ModuleInput) => createModule("/replacement-requests", i);

// A seller's public service offering + an existing private-chat room, if any.
export async function getLawyerServices(lawyerUserId: string): Promise<{ id: string; name: string }[]> {
  const d = asDict(await http(`/lawyers/${lawyerUserId}/services`));
  return asArr(d.services).map((x) => {
    const s = asDict(x);
    return { id: asStr(s.id ?? s.service_id ?? x), name: asStr(s.title ?? s.name) };
  });
}
export async function getLawyerPrivateChat(lawyerUserId: string): Promise<SecureRoom | null> {
  try {
    const r = normRoom(await http(`/lawyers/${lawyerUserId}/private-chat`));
    return r.id ? r : null;
  } catch {
    return null;
  }
}

// ── Order actions (accept / decline) ──────────────────────────────
export async function acceptOrder(orderId: string): Promise<BackendOrder> {
  return normOrder(await http(`/orders/${orderId}/accept`, { method: "POST" }));
}
export async function declineOrder(orderId: string): Promise<{ id: string; status: string }> {
  const d = asDict(await http(`/orders/${orderId}/decline`, { method: "POST" }));
  return { id: asStr(d.id), status: asStr(d.status) };
}

// ── Document template download (authed blob → browser save) ────────
export async function downloadTemplateFile(templateId: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/document-templates/${templateId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `template-${templateId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Seller stats & clients ────────────────────────────────────────
export type SellerStats = { workload: Dict; finance: Dict; performance: Dict };
function normStats(v: unknown): SellerStats {
  const d = asDict(v);
  return { workload: asDict(d.workload), finance: asDict(d.finance), performance: asDict(d.performance) };
}
export async function getLawyerStats(): Promise<SellerStats> {
  return normStats(await http("/lawyers/me/stats"));
}

// ── Seller cabinet bootstrap (GET /lawyers/me/cabinet) ────────────
// One first-load request for the lawyer/advocate portal. Pending sellers get
// 200 with limited_access=true (profile + verification only) instead of 403.
export type SellerActions = { acceptOrders: boolean; secureChat: boolean; calls: boolean };
export type SellerCabinet = {
  accountStatus: string;
  role: string;
  sellerType: string;
  limitedAccess: boolean;
  actions: SellerActions;
  profile: BackendLawyer;
  verification: { status: string; verified: boolean };
  stats: SellerStats;
  newOrders: BackendOrder[];
};
export async function getSellerCabinet(): Promise<SellerCabinet> {
  const d = asDict(await http("/lawyers/me/cabinet"));
  const limitedAccess = Boolean(d.limited_access);
  const a = asDict(d.available_actions);
  // An action the backend doesn't list follows the overall access level.
  const allowed = (k: string) => (a[k] == null ? !limitedAccess : Boolean(a[k]));
  const profile = asDict(d.profile);
  const v = asDict(d.verification);
  return {
    accountStatus: asStr(d.account_status),
    role: asStr(d.role),
    sellerType: asStr(d.seller_type ?? profile.seller_type),
    limitedAccess,
    actions: { acceptOrders: allowed("accept_orders"), secureChat: allowed("secure_chat"), calls: allowed("calls") },
    profile: normLawyer(profile),
    verification: {
      status: typeof d.verification === "string" ? d.verification : asStr(v.status ?? v.verification_status ?? profile.verification_status),
      verified: Boolean(v.is_verified ?? v.verified ?? profile.is_verified),
    },
    stats: normStats(d.stats),
    newOrders: listFrom(d.new_orders, "orders", "items", "data").map(normOrder),
  };
}

export type LawyerClient = {
  id: string;
  name: string;
  phone: string;
  casesCount: number;
  ordersCount: number;
  activeCaseIds: string[];
  hasConflict: boolean;
  lastActiveAt?: string;
};
export async function getLawyerClients(): Promise<LawyerClient[]> {
  return listFrom(await http("/lawyers/me/clients"), "items", "data").map((v) => {
    const d = asDict(v);
    return {
      id: asStr(d.id),
      name: asStr(d.name),
      phone: asStr(d.phone),
      casesCount: asNum(d.cases_count),
      ordersCount: asNum(d.orders_count),
      activeCaseIds: asArr(d.active_case_ids).map((x) => asStr(x)),
      hasConflict: Boolean(d.has_conflict),
      lastActiveAt: asStr(d.last_active_at) || undefined,
    };
  });
}

// ── Calendar events ───────────────────────────────────────────────
export type CalendarEvent = {
  id: string;
  type: string;
  title: string;
  caseId?: string;
  startsAt: string;
  endsAt?: string;
  location: string;
  status: string;
  reminderMinutesBefore?: number;
  reminderScheduled: boolean;
};
function normEvent(v: unknown): CalendarEvent {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    type: asStr(d.type),
    title: asStr(d.title),
    caseId: asStr(d.case_id) || undefined,
    startsAt: asStr(d.starts_at),
    endsAt: asStr(d.ends_at) || undefined,
    location: asStr(d.location),
    status: asStr(d.status),
    reminderMinutesBefore: d.reminder_minutes_before != null ? asNum(d.reminder_minutes_before) : undefined,
    reminderScheduled: Boolean(d.reminder_scheduled),
  };
}
export async function listCalendarEvents(range?: { from?: string; to?: string }): Promise<CalendarEvent[]> {
  const q = new URLSearchParams();
  if (range?.from) q.set("from", range.from);
  if (range?.to) q.set("to", range.to);
  const qs = q.toString();
  return listFrom(await http(`/calendar-events${qs ? `?${qs}` : ""}`), "items", "data").map(normEvent);
}
export type CalendarEventInput = {
  type: string;
  title: string;
  case_id?: string;
  starts_at: string;
  ends_at?: string;
  location?: string;
  reminder_minutes_before?: number; // non-negative; omit for no reminder
};
export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEvent> {
  return normEvent(await http("/calendar-events", { method: "POST", body: JSON.stringify(input) }));
}
export async function deleteCalendarEvent(id: string): Promise<void> {
  await http(`/calendar-events/${id}`, { method: "DELETE" });
}

// ── Business hours (Asia/Tashkent) ────────────────────────────────
// GET /calendar/business-hours (auth): Monday-Saturday 09:00-19:00 plus the
// server's current working-day / working-time flags. Holidays are not stored
// by the backend yet — nothing here is holiday-aware.
export type BusinessHours = {
  timezone: string;
  days: number[]; // ISO weekdays, 1=Mon..7=Sun
  start: string; // HH:MM
  end: string; // HH:MM
  isWorkingDay: boolean | null;
  isWorkingTime: boolean | null;
  serverNow: number | null; // epoch ms, only from an offset-aware timestamp
  fetchedAt: number; // client epoch ms
};
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "Asia/Tashkent",
  days: [1, 2, 3, 4, 5, 6],
  start: "09:00",
  end: "19:00",
  isWorkingDay: null,
  isWorkingTime: null,
  serverNow: null,
  fetchedAt: 0,
};
function asBoolOrNull(v: unknown): boolean | null {
  if (v === true || v === 1 || v === "true" || v === "1") return true;
  if (v === false || v === 0 || v === "false" || v === "0") return false;
  return null;
}
function asHm(v: unknown, fb: string): string {
  const m = typeof v === "string" ? /^(\d{1,2}):(\d{2})/.exec(v.trim()) : null;
  if (!m) return fb;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return (h < 24 && min < 60) || (h === 24 && min === 0) ? `${String(h).padStart(2, "0")}:${m[2]}` : fb;
}
// Day names only ("monday", "Mon", {day: "tue"}): numeric arrays are ignored
// on purpose — 0- vs 1-based and Sunday- vs Monday-first are ambiguous.
function asIsoDays(v: unknown): number[] | null {
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const out: number[] = [];
  for (const x of asArr(v)) {
    const r = asDict(x);
    if (r.closed === true || r.is_working_day === false || r.working === false || r.open === false) continue;
    const name = r.day ?? x;
    const idx = typeof name === "string" ? DAYS.indexOf(name.trim().toLowerCase().slice(0, 3)) : -1;
    if (idx < 0) return null;
    out.push(idx + 1);
  }
  return out.length ? [...new Set(out)].sort((a, b) => a - b) : null;
}
export async function getBusinessHours(): Promise<BusinessHours> {
  const fetchedAt = Date.now();
  const d = asDict(await http("/calendar/business-hours"));
  const cur = asDict(d.current ?? d.now_status ?? (typeof d.status === "object" ? d.status : undefined));
  const hours = asDict(d.hours ?? d.working_hours ?? d.business_hours);
  const first = asDict(asArr(d.schedule)[0]);
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const b = asBoolOrNull(d[key] ?? cur[key]);
      if (b !== null) return b;
    }
    return null;
  };
  const nowRaw = d.now ?? d.current_time ?? d.server_time ?? cur.now ?? cur.local_time;
  // A naive timestamp (no Z / ±hh:mm) is ambiguous between UTC and Tashkent
  // time, so it is ignored; epoch numbers are unambiguous.
  const ms =
    typeof nowRaw === "number"
      ? parseServerTime(nowRaw)
      : typeof nowRaw === "string" && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(nowRaw.trim())
        ? Date.parse(nowRaw.trim())
        : NaN;
  const statusStr = typeof d.status === "string" ? d.status.toLowerCase() : "";
  const tz = d.timezone ?? d.time_zone ?? d.tz;
  return {
    timezone: typeof tz === "string" && tz.trim() ? tz.trim() : "Asia/Tashkent",
    days: asIsoDays(d.working_days ?? d.business_days ?? d.days ?? hours.days ?? d.schedule) ?? DEFAULT_BUSINESS_HOURS.days,
    start: asHm(d.start ?? d.start_time ?? d.work_start ?? d.opens_at ?? hours.start ?? hours.from ?? first.start, "09:00"),
    end: asHm(d.end ?? d.end_time ?? d.work_end ?? d.closes_at ?? hours.end ?? hours.to ?? first.end, "19:00"),
    isWorkingDay: pick("is_working_day", "is_business_day", "working_day", "is_workday"),
    isWorkingTime:
      pick("is_working_time", "is_working_hours", "is_business_hours", "is_open", "open_now", "within_business_hours", "working_time") ??
      (statusStr === "open" ? true : statusStr === "closed" ? false : null),
    serverNow: Number.isFinite(ms) ? ms : null,
    fetchedAt,
  };
}

// ── Promotions ────────────────────────────────────────────────────
export type PromotionStatus = { active: boolean; packageId?: string; daysLeft: number; endsAt?: string };
export async function getPromotionStatus(): Promise<PromotionStatus> {
  const d = asDict(await http("/promotions/me"));
  return {
    active: Boolean(d.active),
    packageId: asStr(d.package_id) || undefined,
    daysLeft: asNum(d.days_left),
    endsAt: asStr(d.ends_at) || undefined,
  };
}
export type PromotionAnalytics = {
  impressions: number;
  searchAppearances: number;
  profileClicks: number;
  contactRequests: number;
  series: { date: string; impressions: number }[];
};
export async function getPromotionAnalytics(): Promise<PromotionAnalytics> {
  const d = asDict(await http("/promotions/analytics"));
  return {
    impressions: asNum(d.impressions),
    searchAppearances: asNum(d.search_appearances),
    profileClicks: asNum(d.profile_clicks),
    contactRequests: asNum(d.contact_requests),
    series: asArr(d.series).map((x) => {
      const s = asDict(x);
      return { date: asStr(s.date), impressions: asNum(s.impressions) };
    }),
  };
}
export async function checkoutPromotion(packageId: string, days: number): Promise<PurchaseResult> {
  return normPurchase(
    await http("/promotions/checkout", {
      method: "POST",
      body: JSON.stringify({ package_id: packageId, days, provider: CHECKOUT_PROVIDER }),
    }),
  );
}

// ── Gifts ─────────────────────────────────────────────────────────
export type Gift = {
  id: string;
  direction: string;
  recipientPhone: string;
  planName: string;
  termMonths: number;
  status: string;
  createdAt: string;
  giftCode: string;
  shareUrl: string;
  qrUrl: string;
};
function normGift(v: unknown): Gift {
  const d = asDict(v);
  const code = asStr(d.gift_code ?? d.code);
  return {
    id: asStr(d.id),
    direction: asStr(d.direction, "sent"),
    recipientPhone: asStr(d.recipient_phone),
    planName: asStr(d.plan_name ?? d.service_name),
    termMonths: asNum(d.term_months ?? d.duration_months),
    status: asStr(d.status),
    createdAt: asStr(d.created_at),
    giftCode: code,
    shareUrl: asStr(d.share_url),
    qrUrl: d.qr_url ? absUrl(asStr(d.qr_url)) : code ? absUrl(`/gifts/${code}/qr`) : "",
  };
}
export async function listGifts(): Promise<Gift[]> {
  return listFrom(await http("/gifts"), "items", "data").map(normGift);
}
// A gift is either a subscription plan (module 6, by slug + duration) or a
// single service. Returns the shareable link + QR the buyer sends on.
export type GiftInput = {
  plan_slug?: string;
  service_id?: string;
  recipient_hint?: string;
  duration_months?: number;
};
export type GiftResult = {
  paymentUrl?: string;
  giftCode: string;
  shareUrl: string;
  qrUrl: string;
  status: string;
};
export async function createGift(input: GiftInput): Promise<GiftResult> {
  const raw = asDict(
    await http("/gifts", {
      method: "POST",
      body: JSON.stringify({ provider: CHECKOUT_PROVIDER, duration_months: 6, ...input }),
    }),
  );
  // `payment` may be a bare URL string or an object with payment_url.
  const payUrl = safePaymentUrl(
    typeof raw.payment === "string"
      ? raw.payment
      : (asDict(raw.payment).payment_url ?? asDict(raw.payment).checkout_url ?? raw.payment_url ?? asDict(raw.invoice).payment_url),
  );
  const code = asStr(raw.gift_code ?? raw.code);
  return {
    paymentUrl: payUrl || undefined,
    giftCode: code,
    shareUrl: asStr(raw.share_url),
    qrUrl: raw.qr_url ? absUrl(asStr(raw.qr_url)) : code ? absUrl(`/gifts/${code}/qr`) : "",
    status: asStr(raw.status),
  };
}

// Recipient claims a gift by its code — starts their subscription term.
export async function claimGift(code: string): Promise<Gift> {
  return normGift(await http(`/gifts/${encodeURIComponent(code)}/claim`, { method: "POST" }));
}
// Best-effort public gift lookup for the claim landing page (may 404).
export async function getGift(code: string): Promise<Gift> {
  return normGift(await http(`/gifts/${encodeURIComponent(code)}`));
}

// ── Client profile, payment methods, family ───────────────────────
export type ClientProfile = {
  name: string;
  phone: string;
  email: string;
  avatarUrl: string;
  subscription?: { planName: string; status: string; renewsAt?: string };
};
function normClientProfile(v: unknown): ClientProfile {
  const d = asDict(v);
  const sub = asDict(d.subscription);
  const hasSub = Object.keys(sub).length > 0;
  return {
    name: asStr(d.name),
    phone: asStr(d.phone),
    email: asStr(d.email),
    avatarUrl: asStr(d.avatar_url),
    subscription: hasSub
      ? { planName: asStr(sub.plan_name), status: asStr(sub.status), renewsAt: asStr(sub.renews_at) || undefined }
      : undefined,
  };
}
export async function getClientProfile(): Promise<ClientProfile> {
  return normClientProfile(await http("/clients/me"));
}
export async function updateClientProfile(patch: {
  name?: string;
  email?: string;
  avatar_url?: string;
}): Promise<ClientProfile> {
  return normClientProfile(await http("/clients/me", { method: "PUT", body: JSON.stringify(patch) }));
}

export type PaymentMethod = { id: string; brand: string; last4: string; expires: string; isDefault: boolean };
function normMethod(v: unknown): PaymentMethod {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    brand: asStr(d.brand),
    last4: asStr(d.last4),
    expires: asStr(d.expires),
    isDefault: Boolean(d.is_default),
  };
}
export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  return listFrom(await http("/clients/me/payment-methods"), "items", "data").map(normMethod);
}
export async function addPaymentMethod(input: {
  brand?: string;
  last4: string;
  expires?: string;
  is_default?: boolean;
}): Promise<PaymentMethod> {
  return normMethod(await http("/clients/me/payment-methods", { method: "POST", body: JSON.stringify(input) }));
}
export async function deletePaymentMethod(id: string): Promise<void> {
  await http(`/clients/me/payment-methods/${id}`, { method: "DELETE" });
}

export type FamilyMember = {
  id: string;
  name: string;
  phone: string;
  relation: string;
  // When true, this member may use the account owner's active plan benefits.
  sharedAccess: boolean;
};
function normFamily(v: unknown): FamilyMember {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    name: asStr(d.name),
    phone: asStr(d.phone),
    relation: asStr(d.relation),
    sharedAccess: Boolean(d.shared_access ?? d.can_use_plan),
  };
}
export async function listFamilyMembers(): Promise<FamilyMember[]> {
  return listFrom(await http("/clients/me/family-members"), "items", "data").map(normFamily);
}
export async function addFamilyMember(input: { name: string; phone: string; relation?: string }): Promise<FamilyMember> {
  return normFamily(await http("/clients/me/family-members", { method: "POST", body: JSON.stringify(input) }));
}
export async function deleteFamilyMember(id: string): Promise<void> {
  await http(`/clients/me/family-members/${id}`, { method: "DELETE" });
}
// Toggle whether a family member can use the owner's active plan.
export async function setFamilyMemberAccess(id: string, sharedAccess: boolean): Promise<void> {
  await http(`/clients/me/family-members/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ shared_access: sharedAccess }),
  });
}

// ── Identity verification (OneID / MyID provider interface) ──────
export type IdentityProvider = "oneid" | "myid";
export type IdentityStatus = {
  verified: boolean;
  provider: string;
  status: string; // lowercased server status ("pending", "verified", …; '' when absent)
  verifiedAt?: string;
  fullName?: string;
  pinfl?: string;
};
const IDENTITY_PENDING = /^(pending|started|in_progress|processing)$/;
function normIdentity(v: unknown): IdentityStatus {
  const d = asDict(v);
  const status = asStr(d.status).trim().toLowerCase();
  return {
    verified: Boolean(d.verified ?? d.identity_verified) || /^(verified|approved|success)$/.test(status),
    provider: asStr(d.provider ?? d.identity_provider),
    status,
    verifiedAt: asStr(d.verified_at ?? d.identity_verified_at) || undefined,
    fullName: asStr(d.full_name ?? d.name) || undefined,
    pinfl: asStr(d.pinfl ?? d.pnfl) || undefined,
  };
}
export function isIdentityPending(s: IdentityStatus | null | undefined): boolean {
  return Boolean(s && !s.verified && IDENTITY_PENDING.test(s.status));
}
// start either hands back a provider page to follow ("redirect") or, on a
// staging demo provider, a state for code entry ("code"). A code that comes
// back in the response is NEVER copied here — testers read it from server logs.
export type IdentityStart = { mode: "redirect" | "code"; authUrl: string; state: string; expiresAt: string; message: string };
export async function identityStart(provider: IdentityProvider): Promise<IdentityStart> {
  const d = asDict(await http("/identity/start", { method: "POST", body: JSON.stringify({ provider }) }));
  const rawUrl = asStr(d.auth_url ?? d.authUrl ?? d.redirect_url ?? d.authorization_url ?? d.url).trim();
  const authUrl = /^https:\/\/[^\s]+$/i.test(rawUrl) ? rawUrl : ""; // never another scheme in location
  const demoMarker = d.demo_code != null || d.demoCode != null || /demo/i.test(asStr(d.mode ?? d.provider_mode));
  return {
    mode: authUrl && !demoMarker ? "redirect" : "code",
    authUrl,
    state: asStr(d.state ?? d.verification_id ?? d.id),
    expiresAt: asStr(d.expires_at),
    message: asStr(d.message),
  };
}
export async function identityVerifyDemo(state: string, code: string): Promise<IdentityStatus> {
  // Backend expects `code` (typed by the user), not `demo_code`.
  return normIdentity(await http("/identity/verify-demo", { method: "POST", body: JSON.stringify({ state, code }) }));
}
export async function getIdentity(): Promise<IdentityStatus> {
  // /identity/me returns a list of verifications; pick a verified one, else an
  // in-progress one, else the first.
  const raw = await http("/identity/me");
  const wrap = asDict(raw);
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(wrap.items)
      ? wrap.items
      : Array.isArray(wrap.data)
        ? wrap.data
        : null;
  if (!arr) return normIdentity(raw ?? {});
  const all = arr.map(normIdentity);
  return all.find((x) => x.verified) ?? all.find(isIdentityPending) ?? all[0] ?? normIdentity({});
}

// ── User activity log ─────────────────────────────────────────────
export type ActivityEntry = {
  id: string;
  action: string;
  detail: string;
  ip?: string;
  createdAt: string;
  // Append-only audit chain (GET /admin/audit-trail): this record's hash and
  // the hash of the record before it. Absent on other activity feeds and on
  // records written before the chain existed.
  previousHash?: string;
  eventHash?: string;
};
function normActivity(v: unknown): ActivityEntry {
  const d = asDict(v);
  const chain = asDict(d.chain ?? d.integrity);
  const hashOf = (...vals: unknown[]) => {
    for (const x of vals) if (typeof x === "string" && x.trim()) return x.trim();
    return undefined;
  };
  return {
    id: asStr(d.id),
    action: asStr(d.action ?? d.type ?? d.event),
    detail: asStr(d.detail ?? d.description ?? d.message ?? (typeof d.details === "string" ? d.details : undefined)),
    ip: asStr(d.ip ?? d.ip_address) || undefined,
    createdAt: asStr(d.created_at ?? d.createdAt ?? d.timestamp),
    previousHash: hashOf(d.previous_hash, d.prev_hash, d.previousHash, chain.previous_hash),
    eventHash: hashOf(d.event_hash, d.hash, d.eventHash, chain.event_hash),
  };
}
export async function listMyActivity(): Promise<ActivityEntry[]> {
  return listFrom(await http("/users/me/activity"), "items", "data", "logs").map(normActivity);
}

// ── SOS / emergency legal help ────────────────────────────────────
export type SosRequest = {
  id: string;
  status: string;
  category: string;
  dutyName?: string;
  roomId?: string;
  createdAt: string;
};
function normSos(v: unknown): SosRequest {
  const d = asDict(v);
  const duty = asDict(d.duty_lawyer ?? d.assigned_to);
  return {
    id: asStr(d.id),
    status: asStr(d.status, "pending"),
    category: asStr(d.category),
    dutyName: (asStr(duty.name) || asStr(d.duty_name)) || undefined,
    roomId: asStr(d.chat_room_id ?? d.room_id) || undefined,
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
export async function createSosRequest(input: {
  category: string;
  description: string;
  phone?: string;
}): Promise<SosRequest> {
  return normSos(await http("/sos", { method: "POST", body: JSON.stringify(input) }));
}

// ── Referral program ──────────────────────────────────────────────
export type ReferralInvite = { name: string; phone: string; status: string; reward: number; joinedAt: string };
export type Referral = {
  code: string;
  link: string;
  invited: number;
  joined: number;
  rewardBalance: number;
  // Referral discount (backend applies it automatically once unlocked).
  discountUnlocked: boolean;
  discountPercent: number;
  eligibleAfter: number; // joined referrals needed to unlock
  remainingToUnlock: number;
  appliesTo: string; // e.g. "subscription" / "commission"
  items: ReferralInvite[];
};
export async function getMyReferral(): Promise<Referral> {
  const d = asDict(await http("/referrals/me"));
  return {
    code: asStr(d.code),
    link: asStr(d.link ?? d.share_url),
    invited: asNum(d.invited_count ?? d.invited),
    joined: asNum(d.joined_count ?? d.joined),
    rewardBalance: uzs(d, "reward_balance", "balance"),
    discountUnlocked: Boolean(d.discount_unlocked),
    discountPercent: asNum(d.discount_percent),
    eligibleAfter: asNum(d.eligible_after, 5),
    remainingToUnlock: asNum(d.remaining_to_unlock),
    appliesTo: asStr(d.applies_to),
    items: asArr(d.items ?? d.referrals).map((x) => {
      const r = asDict(x);
      return {
        name: asStr(r.name),
        phone: asStr(r.phone),
        status: asStr(r.status, "invited"),
        reward: uzs(r, "reward"),
        joinedAt: asStr(r.joined_at ?? r.created_at),
      };
    }),
  };
}

// ── Ratings & reviews ─────────────────────────────────────────────
export type ReviewTarget = { id: string; caseId?: string; lawyerUserId?: string; lawyerName: string; service: string; completedAt: string };
export type MyReview = { id: string; lawyerName: string; rating: number; comment: string; createdAt: string };
export async function listReviewable(): Promise<ReviewTarget[]> {
  return listFrom(await http("/reviews/pending"), "items", "data").map((x) => {
    const d = asDict(x);
    const p = asDict(d.payload);
    return {
      id: asStr(d.id ?? d.case_id),
      caseId: asStr(d.case_id ?? p.case_id) || undefined,
      lawyerUserId: asStr(d.lawyer_user_id ?? p.lawyer_user_id) || undefined,
      lawyerName: asStr(d.lawyer_name ?? d.lawyer ?? d.name ?? d.title),
      service: asStr(d.service ?? d.title ?? d.category ?? d.record_type ?? p.service),
      completedAt: asStr(d.completed_at ?? d.created_at),
    };
  });
}
export async function listMyReviews(): Promise<MyReview[]> {
  return listFrom(await http("/reviews/me"), "items", "data").map((x) => {
    const d = asDict(x);
    const p = asDict(d.payload);
    return {
      id: asStr(d.id),
      lawyerName: asStr(d.lawyer_name ?? d.lawyer ?? d.name ?? d.title),
      rating: asNum(d.rating ?? p.rating),
      comment: asStr(d.comment ?? d.text ?? p.comment),
      createdAt: asStr(d.created_at ?? d.createdAt),
    };
  });
}
export async function submitReview(input: {
  case_id?: string;
  lawyer_user_id?: string;
  rating: number;
  comment?: string;
}): Promise<void> {
  await http("/reviews", { method: "POST", body: JSON.stringify(input) });
}

// ── Complaints ────────────────────────────────────────────────────
export type Complaint = { id: string; category: string; subject: string; description: string; status: string; createdAt: string };
function normComplaint(v: unknown): Complaint {
  const d = asDict(v);
  const p = asDict(d.payload);
  return {
    id: asStr(d.id),
    category: asStr(d.category ?? d.record_type),
    subject: asStr(d.subject ?? d.title),
    description: asStr(d.description ?? d.text ?? p.description),
    status: asStr(d.status, "new"),
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
export async function listComplaints(): Promise<Complaint[]> {
  return listFrom(await http("/complaints"), "items", "data").map(normComplaint);
}
export async function createComplaint(input: { category: string; subject: string; description: string; case_id?: string }): Promise<Complaint> {
  return normComplaint(await http("/complaints", { method: "POST", body: JSON.stringify(input) }));
}

// ── Warranty / lawyer replacement ─────────────────────────────────
export type WarrantyClaim = { id: string; caseTitle: string; reason: string; status: string; createdAt: string };
function normClaim(v: unknown): WarrantyClaim {
  const d = asDict(v);
  const p = asDict(d.payload);
  return {
    id: asStr(d.id),
    caseTitle: asStr(d.case_title ?? d.case ?? p.case_title ?? d.title),
    reason: asStr(d.reason ?? p.reason),
    status: asStr(d.status, "new"),
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
export async function listWarrantyClaims(): Promise<WarrantyClaim[]> {
  return listFrom(await http("/warranty/claims"), "items", "data").map(normClaim);
}
export async function createWarrantyClaim(input: { case_id?: string; reason: string; kind?: string }): Promise<WarrantyClaim> {
  return normClaim(await http("/warranty/claims", { method: "POST", body: JSON.stringify({ kind: "replacement", ...input }) }));
}

// ── Academy (legal courses) ───────────────────────────────────────
export type AcademyCourse = { id: string; title: string; category: string; lessons: number; durationMin: number; level: string; progress: number; cover?: string };
function normAcademyCourse(v: unknown): AcademyCourse {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    title: asStr(d.title ?? d.name),
    category: asStr(d.category),
    lessons: asNum(d.lessons_count ?? d.lessons),
    durationMin: asNum(d.duration_min ?? d.duration),
    level: asStr(d.level, "beginner"),
    progress: asNum(d.progress),
    cover: asStr(d.cover_url ?? d.cover) || undefined,
  };
}
export async function listAcademyCourses(): Promise<AcademyCourse[]> {
  return listFrom(await http("/academy/courses/catalog"), "items", "data", "courses").map(normAcademyCourse);
}

// ── Personal task board (lawyer / advocate) ───────────────────────
export type WorkTask = { id: string; title: string; status: string; priority: string; dueDate?: string; caseTitle?: string };
function normTask(v: unknown): WorkTask {
  const d = asDict(v);
  const p = asDict(d.payload);
  return {
    id: asStr(d.id),
    title: asStr(d.title ?? d.name),
    status: asStr(d.status, "todo"),
    priority: asStr(d.priority ?? p.priority, "medium"),
    dueDate: asStr(d.due_date ?? d.deadline ?? p.due_date) || undefined,
    caseTitle: asStr(d.case_title ?? d.case ?? p.case_title) || undefined,
  };
}
export async function listMyTasks(): Promise<WorkTask[]> {
  return listFrom(await http("/tasks/me"), "items", "data", "tasks").map(normTask);
}
export async function updateTaskStatus(id: string, status: string): Promise<void> {
  await http(`/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

// ── Call-center analytics ─────────────────────────────────────────
export type CallAnalytics = {
  total: number;
  answered: number;
  missed: number;
  avgDurationSec: number;
  byDay: { label: string; value: number }[];
  topAgents: { name: string; calls: number }[];
};
// ── Automatic lawyer matching (client) ────────────────────────────
export type LawyerMatch = { id: string; lawyerUserId?: string; name: string; area: string; region: string; rating: number; matchPct: number; reason: string; kind: "advocate" | "lawyer" };
export async function getMyMatches(): Promise<LawyerMatch[]> {
  return listFrom(await http("/matching/me"), "items", "data", "matches").map((x) => {
    const d = asDict(x);
    const st = asStr(d.seller_type).toLowerCase();
    return {
      id: asStr(d.id ?? d.lawyer_user_id),
      lawyerUserId: asStr(d.lawyer_user_id) || undefined,
      name: asStr(d.name ?? d.lawyer_name),
      area: asStr(d.area ?? d.specialization),
      region: asStr(d.region),
      rating: asNum(d.rating, 5),
      matchPct: asNum(d.match_pct ?? d.score),
      reason: asStr(d.reason),
      kind: st.includes("advokat") ? "advocate" : "lawyer",
    };
  });
}

export async function getCallAnalytics(): Promise<CallAnalytics> {
  const d = asDict(await http("/calls/analytics"));
  return {
    total: asNum(d.total ?? d.total_calls),
    answered: asNum(d.answered ?? d.answered_calls),
    missed: asNum(d.missed ?? d.missed_calls),
    avgDurationSec: asNum(d.avg_duration_sec ?? d.avg_duration),
    byDay: asArr(d.by_day ?? d.daily).map((x) => {
      const r = asDict(x);
      return { label: asStr(r.label ?? r.date), value: asNum(r.value ?? r.count) };
    }),
    topAgents: asArr(d.top_agents ?? d.agents).map((x) => {
      const r = asDict(x);
      return { name: asStr(r.name), calls: asNum(r.calls ?? r.count) };
    }),
  };
}

// ── CEO dashboard / analytics / marketing attribution ─────────────
export type GiftKpis = {
  giftPurchases: number; giftActivationRate: number; recipientConversion: number;
  giftToPaidConversion: number; averageGiftValue: number; referralRate: number;
  giftCac: number; giftLtv: number;
};
export type CeoDashboard = {
  revenue: number; revenueDeltaPct: number; mrr: number;
  users: number; activeUsers: number; conversionPct: number;
  funnel: { label: string; value: number }[];
  channels: { name: string; leads: number; pct: number }[];
  revenueTrend: { label: string; value: number }[];
  // Chapter V KPI system
  mau: number; dau: number; gmv: number; arr: number; arpu: number; takeRate: number;
  cac: number; ltv: number; ltvCac: number; paybackMonths: number;
  npsClient: number; npsAdvocate: number;
  newClients: number; newAdvocates: number; newLawyers: number;
  giftKpis: GiftKpis;
};
function normGiftKpis(v: unknown): GiftKpis {
  const g = asDict(v);
  return {
    giftPurchases: asNum(g.gift_purchases),
    giftActivationRate: asNum(g.gift_activation_rate),
    recipientConversion: asNum(g.recipient_conversion),
    giftToPaidConversion: asNum(g.gift_to_paid_conversion),
    averageGiftValue: uzs(g, "average_gift_value"),
    referralRate: asNum(g.referral_rate),
    giftCac: uzs(g, "gift_cac"),
    giftLtv: uzs(g, "gift_ltv"),
  };
}
export async function getCeoDashboard(): Promise<CeoDashboard> {
  const d = asDict(await http("/analytics/ceo"));
  const pair = (x: unknown) => { const r = asDict(x); return { label: asStr(r.label ?? r.name ?? r.date), value: asNum(r.value ?? r.count) }; };
  // cac may be a number or an object { total, client, advocate }.
  const cacRaw = d.cac;
  const cac = typeof cacRaw === "object" && cacRaw ? uzs(asDict(cacRaw), "total") : uzs(d, "cac");
  // Revenue trend values are so'm amounts, unlike the funnel counts read by pair.
  const moneyPair = (x: unknown) => { const r = asDict(x); return { label: asStr(r.label ?? r.name ?? r.date), value: uzs(r, "value", "count") }; };
  return {
    revenue: uzs(d, "revenue"), revenueDeltaPct: asNum(d.revenue_delta_pct), mrr: uzs(d, "mrr"),
    users: asNum(d.users ?? d.total_users), activeUsers: asNum(d.active_users), conversionPct: asNum(d.conversion_pct),
    funnel: asArr(d.funnel).map(pair),
    channels: asArr(d.channels ?? d.attribution).map((x) => { const r = asDict(x); return { name: asStr(r.name ?? r.channel), leads: asNum(r.leads ?? r.count), pct: asNum(r.pct ?? r.share) }; }),
    revenueTrend: asArr(d.revenue_trend ?? d.trend).map(moneyPair),
    mau: asNum(d.mau), dau: asNum(d.dau), gmv: uzs(d, "gmv"), arr: uzs(d, "arr"), arpu: uzs(d, "arpu"), takeRate: asNum(d.take_rate),
    cac, ltv: uzs(d, "ltv"), ltvCac: asNum(d.ltv_cac), paybackMonths: asNum(d.payback_months),
    npsClient: asNum(d.nps_client), npsAdvocate: asNum(d.nps_advocate),
    newClients: asNum(d.new_clients), newAdvocates: asNum(d.new_advocates), newLawyers: asNum(d.new_lawyers),
    giftKpis: normGiftKpis(d.gift_kpis),
  };
}
export async function getGiftKpis(): Promise<GiftKpis> {
  return normGiftKpis(await http("/analytics/gifts"));
}

// ── Quality control ───────────────────────────────────────────────
export type QualityOverview = {
  avgRating: number; responseSlaPct: number; complaintRate: number; resolvedPct: number;
  flagged: { title: string; detail: string; severity: string }[];
};
export async function getQualityOverview(): Promise<QualityOverview> {
  const d = asDict(await http("/quality/overview"));
  return {
    avgRating: asNum(d.avg_rating, 0), responseSlaPct: asNum(d.response_sla_pct), complaintRate: asNum(d.complaint_rate), resolvedPct: asNum(d.resolved_pct),
    flagged: asArr(d.flagged).map((x) => { const r = asDict(x); return { title: asStr(r.title), detail: asStr(r.detail ?? r.description), severity: asStr(r.severity, "low") }; }),
  };
}
export async function adminListComplaints(): Promise<Complaint[]> {
  return listFrom(await http("/admin/complaints"), "items", "data").map(normComplaint);
}

// ── B2B CRM ───────────────────────────────────────────────────────
export type B2bClient = { id: string; name: string; industry: string; contact: string; stage: string; value: number };
export async function listB2bClients(): Promise<B2bClient[]> {
  return listFrom(await http("/b2b/clients"), "items", "data", "clients").map((x) => {
    const d = asDict(x);
    const p = asDict(d.payload);
    return {
      id: asStr(d.id),
      name: asStr(d.name ?? d.company ?? d.title),
      industry: asStr(d.industry ?? p.industry),
      contact: asStr(d.contact ?? d.phone ?? p.contact ?? p.phone),
      stage: asStr(d.stage ?? d.status ?? d.record_type, "new"),
      value: uzsOpt(d, "value", "deal_value", "price") ?? uzs(p, "value"),
    };
  });
}

// ── Retention & upsell ────────────────────────────────────────────
export type RetentionOverview = {
  atRisk: number; churnedThisMonth: number; retainedPct: number;
  atRiskClients: { name: string; phone: string; reason: string; lastActive: string }[];
  upsell: { name: string; suggestion: string }[];
};
// ── AI: problem classification (intake → lead) ────────────────────
export type AiClassification = { category: string; urgency: string; summary: string; recommendedService: string; confidence: number; leadId?: string; routedTo?: string };
export async function classifyProblem(text: string): Promise<AiClassification> {
  const d = asDict(await http("/ai/classify", { method: "POST", body: JSON.stringify({ text }) }));
  return {
    category: asStr(d.category),
    urgency: asStr(d.urgency, "normal"),
    summary: asStr(d.summary),
    recommendedService: asStr(d.recommended_service ?? d.service),
    confidence: asNum(d.confidence),
    leadId: asStr(d.lead_id) || undefined,
    routedTo: asStr(d.routed_to ?? d.assigned_to) || undefined,
  };
}

// ── AI: document analysis ─────────────────────────────────────────
export type DocAnalysis = { summary: string; risks: { level: string; text: string }[]; recommendations: string[]; pointsCount: number };
export async function analyzeDocument(text: string): Promise<DocAnalysis> {
  const d = asDict(await http("/ai/document-analysis", { method: "POST", body: JSON.stringify({ text }) }));
  const risks = asArr(d.risks).map((x) => { const r = asDict(x); return { level: asStr(r.level, "low"), text: asStr(r.text ?? r.risk) }; });
  return {
    summary: asStr(d.summary),
    risks,
    recommendations: asArr(d.recommendations).map((x) => asStr(x)),
    pointsCount: asNum(d.points_count) || risks.length + asArr(d.recommendations).length,
  };
}

// ── AI: operator / case assistant ─────────────────────────────────
export async function askAiAssistant(prompt: string, context?: string): Promise<string> {
  // Backend expects `context` as an object (422 on a bare string).
  const body = JSON.stringify(context ? { prompt, context: { text: context } } : { prompt });
  const d = asDict(await http("/ai/assistant", { method: "POST", body }));
  return asStr(d.answer ?? d.text ?? d.reply);
}

export async function getRetentionOverview(): Promise<RetentionOverview> {
  const d = asDict(await http("/retention/overview"));
  return {
    atRisk: asNum(d.at_risk), churnedThisMonth: asNum(d.churned_this_month), retainedPct: asNum(d.retained_pct),
    atRiskClients: asArr(d.at_risk_clients).map((x) => { const r = asDict(x); return { name: asStr(r.name), phone: asStr(r.phone), reason: asStr(r.reason), lastActive: asStr(r.last_active) }; }),
    upsell: asArr(d.upsell).map((x) => { const r = asDict(x); return { name: asStr(r.name), suggestion: asStr(r.suggestion) }; }),
  };
}

// ── Notification preferences ──────────────────────────────────────
export type NotifPrefs = { push: boolean; sms: boolean; telegram: boolean; email: boolean; orders: boolean; payments: boolean; messages: boolean; marketing: boolean };
export const NOTIF_KEYS: (keyof NotifPrefs)[] = ["push", "sms", "telegram", "email", "orders", "payments", "messages", "marketing"];
export async function getNotificationPreferences(): Promise<NotifPrefs> {
  const d = asDict(await http("/notifications/preferences"));
  // Flat keys first; the cascade may nest them under channels / events.
  // In-app delivery is always on, so there is no in_app toggle.
  const ch = asDict(d.channels);
  const ev = asDict(d.events ?? d.categories);
  const out = {} as NotifPrefs;
  for (const k of NOTIF_KEYS) out[k] = prefOn(d[k]) ?? prefOn(ch[k]) ?? prefOn(ev[k]) ?? false;
  return out;
}
// A preference value may be a flag, a "true"/"on" string or an object carrying
// one ({ enabled: true }); anything else (e.g. a per-event matrix) is no answer.
function prefOn(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (/^(true|1|on|yes|enabled)$/.test(s)) return true;
    if (/^(false|0|off|no|disabled)$/.test(s)) return false;
    return undefined;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Dict;
    return prefOn(o.enabled ?? o.on ?? o.value ?? o.active);
  }
  return undefined;
}
export async function updateNotificationPreferences(p: Partial<NotifPrefs>): Promise<void> {
  await http("/notifications/preferences", { method: "PUT", body: JSON.stringify(p) });
}

// ── Telegram account link ─────────────────────────────────────────
// POST /telegram/link/start → one-time t.me deep link, valid 10 minutes; the
// bot webhook stores telegram_chat_id when the user presses Start. The shape
// isn't published (prod /openapi.json is 404), so accept the likely spellings
// and rebuild the link from bot username + token when needed. There is no
// status or unlink endpoint; the linked state comes from /auth/me.
export const TELEGRAM_LINK_TTL_MS = 10 * 60 * 1000;
// expiresAt is epoch ms on the client clock (never later than the 10-minute TTL).
export type TelegramLinkStart = { url: string; expiresAt: number; linked: boolean };
export async function startTelegramLink(): Promise<TelegramLinkStart> {
  const raw = await http("/telegram/link/start", { method: "POST", body: "{}" });
  const top = asDict(raw);
  const d = top.data && typeof top.data === "object" ? asDict(top.data) : top;
  const strs = (...v: unknown[]) =>
    v.map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : "")).filter(Boolean);
  const token = strs(d.token, d.link_token, d.start_token, d.start_param, d.code)[0] ?? "";
  const bot = (strs(d.bot_username, d.bot, d.username)[0] ?? "").replace(/^(@|https:\/\/t\.me\/)/i, "");
  // Only ever open a Telegram-capable scheme, never javascript: etc.
  let url =
    strs(
      typeof raw === "string" ? raw : "",
      typeof top.data === "string" ? top.data : "",
      d.deep_link, d.deeplink, d.url, d.link, d.link_url, d.telegram_url, d.telegram_link, d.telegram_bot_link, d.bot_link,
    ).find((s) => /^(https:|tg:)\/\//i.test(s)) ?? "";
  if (!url && /^\w+$/.test(bot) && token) url = `https://t.me/${bot}?start=${encodeURIComponent(token)}`;
  return {
    url,
    // A naive-UTC or skewed expires_at can't show a longer (or hours-long) timer.
    expiresAt: otpExpiresAt({ ...top, ...d }, TELEGRAM_LINK_TTL_MS, TELEGRAM_LINK_TTL_MS),
    linked: d.linked === true || d.already_linked === true,
  };
}

// ── Payouts / payment split (sellers) ─────────────────────────────
export type Payout = { id: string; amount: number; currency: string; status: string; period: string; createdAt: string };
export async function listMyPayouts(): Promise<Payout[]> {
  return listFrom(await http("/payouts/me"), "items", "data").map((x) => {
    const d = asDict(x);
    return { id: asStr(d.id), amount: uzs(d, "amount", "seller_share"), currency: asStr(d.currency, "UZS"), status: asStr(d.status, "pending"), period: asStr(d.period ?? d.month), createdAt: asStr(d.created_at) };
  });
}
export type PaymentSplit = { total: number; platformFee: number; providerFee: number; sellerShare: number; currency: string };
export async function getPaymentSplit(paymentId: string): Promise<PaymentSplit> {
  const d = asDict(await http(`/payments/${paymentId}/split`));
  return { total: uzs(d, "total", "amount"), platformFee: uzs(d, "platform_fee"), providerFee: uzs(d, "provider_fee"), sellerShare: uzs(d, "seller_share"), currency: asStr(d.currency, "UZS") };
}

// ── Orders (status + history) ─────────────────────────────────────
export type OrderStatusEntry = { status: string; note: string; at: string };
export async function updateOrderStatus(orderId: string, status: string, note?: string): Promise<void> {
  await http(`/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status, note }) });
}
export async function getOrderStatusHistory(orderId: string): Promise<OrderStatusEntry[]> {
  return listFrom(await http(`/orders/${orderId}/status-history`), "items", "data", "history").map((x) => {
    const d = asDict(x);
    return { status: asStr(d.status ?? d.stage), note: asStr(d.note), at: asStr(d.created_at ?? d.at) };
  });
}

// ── Admin audit trail ─────────────────────────────────────────────
// Optional date range, inclusive, as YYYY-MM-DD.
export async function listAuditTrail(range?: { dateFrom?: string; dateTo?: string }): Promise<ActivityEntry[]> {
  const q = new URLSearchParams();
  if (range?.dateFrom) q.set("date_from", range.dateFrom);
  if (range?.dateTo) q.set("date_to", range.dateTo);
  const qs = q.toString();
  // The export response shape isn't published, so accept the likely list keys.
  return listFrom(
    await http(`/admin/audit-trail${qs ? `?${qs}` : ""}`),
    "items", "data", "logs", "records", "activities", "entries", "events",
  ).map(normActivity);
}

// ── Dedicated lead re-engage ──────────────────────────────────────
export async function reengageLead(leadId: string, note?: string): Promise<void> {
  await http(`/admin/leads/${leadId}/re-engage`, { method: "POST", body: JSON.stringify({ note: note ?? "" }) });
}

// ── Create task / B2B client ──────────────────────────────────────
export async function createTask(input: { title: string; priority?: string; due_date?: string; case_title?: string }): Promise<WorkTask> {
  return normTask(await http("/tasks", { method: "POST", body: JSON.stringify(input) }));
}
export async function createB2bClient(input: { name: string; industry?: string; contact?: string }): Promise<B2bClient> {
  const d = asDict(await http("/b2b/clients", { method: "POST", body: JSON.stringify(input) }));
  const p = asDict(d.payload);
  return { id: asStr(d.id), name: asStr(d.name ?? d.title), industry: asStr(d.industry ?? p.industry), contact: asStr(d.contact ?? p.contact), stage: asStr(d.stage ?? d.status ?? d.record_type, "new"), value: uzsOpt(d, "value", "price") ?? uzs(p, "value") };
}
export async function deleteTask(id: string): Promise<void> {
  await http(`/tasks/${id}`, { method: "DELETE" });
}
export async function getLeadTimeline(leadId: string): Promise<ActivityEntry[]> {
  return listFrom(await http(`/admin/leads/${leadId}/timeline`), "items", "data", "timeline").map(normActivity);
}

// ── Admin: review moderation ──────────────────────────────────────
export type AdminReview = { id: string; status: string; lawyerName: string; rating: number; comment: string; note: string; createdAt: string };
function normAdminReview(v: unknown): AdminReview {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    status: asStr(d.status, "pending"),
    lawyerName: asStr(d.lawyer_name ?? d.lawyer ?? d.name),
    rating: asNum(d.rating),
    comment: asStr(d.comment ?? d.text),
    note: asStr(d.moderation_note ?? d.note),
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
export async function listAdminReviews(): Promise<AdminReview[]> {
  return listFrom(await http("/admin/reviews"), "items", "data", "reviews").map(normAdminReview);
}
export async function moderateReview(id: string, status: string, note?: string): Promise<void> {
  await http(`/admin/reviews/${id}/moderate`, { method: "PATCH", body: JSON.stringify({ status, note: note ?? "" }) });
}

// ── Admin: payouts + reconciliation ───────────────────────────────
export type AdminPayout = { id: string; paymentId: string; gross: number; platformFee: number; providerFee: number; sellerShare: number; sellerUserId: string; status: string; currency: string; createdAt: string };
function normAdminPayout(v: unknown): AdminPayout {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    paymentId: asStr(d.payment_id),
    gross: uzs(d, "gross_amount", "gross"),
    platformFee: uzs(d, "platform_fee"),
    providerFee: uzs(d, "provider_fee"),
    sellerShare: uzs(d, "seller_share"),
    sellerUserId: asStr(d.seller_user_id),
    status: asStr(d.status, "queued"),
    currency: asStr(d.currency, "UZS"),
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
export async function listAdminPayouts(): Promise<AdminPayout[]> {
  return listFrom(await http("/admin/payouts"), "items", "data", "payouts").map(normAdminPayout);
}
export async function updatePayout(id: string, status: string, note?: string): Promise<void> {
  await http(`/admin/payouts/${id}`, { method: "PATCH", body: JSON.stringify({ status, note: note ?? "" }) });
}
export type Reconciliation = {
  paymentsCount: number; paidCount: number; gross: number; platformFee: number; providerFee: number; sellerShare: number;
  payoutStatuses: Record<string, number>;
  byProvider: { provider: string; count: number; amount: number }[];
};
export async function getReconciliation(): Promise<Reconciliation> {
  const d = asDict(await http("/payments/reconciliation"));
  return {
    paymentsCount: asNum(d.payments_count), paidCount: asNum(d.paid_count),
    gross: uzs(d, "gross_amount"), platformFee: uzs(d, "platform_fee"), providerFee: uzs(d, "provider_fee"), sellerShare: uzs(d, "seller_share"),
    payoutStatuses: asDict(d.payout_statuses) as Record<string, number>,
    byProvider: asArr(d.by_provider).map((x) => { const r = asDict(x); return { provider: asStr(r.provider), count: asNum(r.count), amount: uzs(r, "amount") }; }),
  };
}

// ── Entitlements (client plan/family access) ──────────────────────
export type Entitlements = { hasActiveSubscription: boolean; activeSubscriptions: string[]; sharedFamily: number; aiLimit: string };
export async function getEntitlements(): Promise<Entitlements> {
  const d = asDict(await http("/clients/me/entitlements"));
  return {
    hasActiveSubscription: Boolean(d.has_active_subscription),
    activeSubscriptions: asArr(d.active_subscriptions).map((x) => { const r = asDict(x); return asStr(r.plan_name ?? r.name ?? x); }),
    sharedFamily: asArr(d.shared_family_members).length,
    aiLimit: asStr(d.ai_limit),
  };
}

// ── Integrations status ───────────────────────────────────────────
// Status metadata only — the backend never returns secrets (secret_exposed=false).
export type Integration = {
  key: string;
  label: string;
  category: string;
  status: string;
  healthy: boolean;
  configured: boolean;
  canTest: boolean;
  requiresSuperadmin: boolean;
};
function normIntegration(x: unknown): Integration {
  const d = asDict(x);
  return {
    key: asStr(d.key ?? d.name),
    label: asStr(d.label),
    category: asStr(d.category),
    status: asStr(d.status),
    healthy: Boolean(d.healthy),
    configured: Boolean(d.configured),
    canTest: Boolean(d.can_test),
    requiresSuperadmin: Boolean(d.requires_superadmin),
  };
}
// Uzbekistan data residency (T0-19), reported next to the integrations. The
// infrastructure evidence is still outstanding, so the UI must never claim
// "confirmed" unless the backend explicitly says so.
export type DataResidency = {
  state: "confirmed" | "pending" | "unknown";
  status: string;
  region: string;
  provider: string;
  checkedAt: string;
};
export type IntegrationsOverview = { items: Integration[]; dataResidency: DataResidency | null };
function normResidency(v: unknown): DataResidency | null {
  if (v == null || v === "") return null;
  const d: Dict = typeof v === "object" ? asDict(v) : { status: v };
  const scalar = (x: unknown) =>
    typeof x === "string" || typeof x === "number" || typeof x === "boolean" ? String(x).trim() : "";
  const status = scalar(d.status ?? d.state).toLowerCase();
  const flag = d.confirmed ?? d.is_confirmed ?? d.verified ?? d.evidence_confirmed;
  const needsEvidence =
    d.evidence_required === true ||
    d.requires_evidence === true ||
    /pending|evidence|required|planned|unverified|not_confirmed/.test(status);
  // Only an explicit confirmation counts; configured/connected/healthy only
  // mean the report exists.
  const confirmed =
    !needsEvidence &&
    flag !== false &&
    flag !== "false" &&
    (flag === true || flag === "true" || ["confirmed", "verified", "compliant"].includes(status));
  const present = Boolean(status) || flag != null || Object.keys(d).length > 0;
  return {
    state: confirmed ? "confirmed" : present ? "pending" : "unknown",
    status,
    region: scalar(d.region ?? d.country ?? d.location ?? d.data_center_country),
    provider: scalar(d.provider ?? d.hosting_provider ?? d.data_center),
    checkedAt: scalar(d.checked_at ?? d.verified_at ?? d.updated_at),
  };
}
export async function getIntegrationsOverview(): Promise<IntegrationsOverview> {
  const data = await http("/integrations/status");
  const d = asDict(data);
  const rows = listFrom(data, "items", "data", "integrations", "providers");
  // data_residency may also arrive as a row; keep it out of the tiles.
  const resIdx = rows.findIndex((x) => {
    const r = asDict(x);
    return asStr(r.key ?? r.name) === "data_residency" || asStr(r.category) === "data_residency";
  });
  const items = rows.filter((_, i) => i !== resIdx).map(normIntegration);
  const raw =
    d.data_residency ??
    d.dataResidency ??
    asDict(d.meta).data_residency ??
    asDict(d.infrastructure).data_residency ??
    (resIdx >= 0 ? rows[resIdx] : undefined);
  return { items, dataResidency: normResidency(raw) };
}
// Kept for existing callers that only need the tiles.
export async function getIntegrationsStatus(): Promise<Integration[]> {
  return (await getIntegrationsOverview()).items;
}

// ── Roles & permissions matrix (admin) ────────────────────────────
export type PermMatrixRole = { id: string; name: string; title: string; permissions: string[] };
export type PermSellerRule = { sellerType: string; blockedPrefixes: string[]; rule: string };
export type PermissionMatrix = { roles: PermMatrixRole[]; permissions: string[]; sellerRules: PermSellerRule[] };
export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  const d = asDict(await http("/admin/permission-matrix"));
  const roles = asArr(d.roles).map((x) => {
    const r = asDict(x);
    return { id: asStr(r.id), name: asStr(r.name), title: asStr(r.title ?? r.name), permissions: asArr(r.permissions).map((p) => asStr(p)) };
  });
  const sr = asDict(d.seller_rules);
  const sellerRules = Object.keys(sr).map((k) => {
    const v = asDict(sr[k]);
    return { sellerType: asStr(v.seller_type ?? k), blockedPrefixes: asArr(v.blocked_service_prefixes).map((p) => asStr(p)), rule: asStr(v.rule) };
  });
  return { roles, permissions: asArr(d.permissions).map((p) => asStr(p)), sellerRules };
}

// ── Test OTPs (staging only; DEMO_MODE=true & APP_ENV!=production) ──
// OTP codes are no longer returned in auth responses; admins read staging
// codes here. 404 in production (route not registered).
export type TestOtp = { id: string; phone: string; purpose: string; code: string; createdAt: string };
export async function getTestOtps(): Promise<TestOtp[]> {
  return listFrom(await http("/admin/test-otps"), "items", "data").map((x) => {
    const d = asDict(x);
    const p = asDict(d.payload);
    return {
      id: asStr(d.id),
      phone: asStr(p.phone ?? d.title),
      purpose: asStr(p.purpose ?? d.record_type),
      code: asStr(p.code),
      createdAt: asStr(d.created_at),
    };
  });
}

// ── Workflow automation ───────────────────────────────────────────
export type WorkflowRule = { id: string; title: string; status: string; description: string };
function normRule(v: unknown): WorkflowRule {
  const d = asDict(v); const p = asDict(d.payload);
  return { id: asStr(d.id), title: asStr(d.title ?? d.name), status: asStr(d.status, "active"), description: asStr(d.description ?? p.description) };
}
export async function listWorkflowRules(): Promise<WorkflowRule[]> {
  return listFrom(await http("/workflow/rules"), "items", "data", "rules").map(normRule);
}
export async function runWorkflowRule(id: string): Promise<void> {
  await http(`/workflow/rules/${id}/run`, { method: "POST", body: JSON.stringify({ input: {} }) });
}
export type WorkflowRun = { id: string; title: string; status: string; createdAt: string };
export async function listWorkflowRuns(): Promise<WorkflowRun[]> {
  return listFrom(await http("/workflow/runs"), "items", "data", "runs").map((x) => {
    const d = asDict(x);
    return { id: asStr(d.id), title: asStr(d.title), status: asStr(d.status, "completed"), createdAt: asStr(d.created_at) };
  });
}

// ── Call-center CRM console ───────────────────────────────────────
export type CcClient = { id: string; lexgoId: string; name: string; phone: string; status: string };
export async function ccSearchClients(q: string): Promise<CcClient[]> {
  return listFrom(await http(`/call-center/clients/search?q=${encodeURIComponent(q)}`), "items", "data").map((x) => {
    const d = asDict(x);
    return { id: asStr(d.id), lexgoId: asStr(d.lexgo_id), name: asStr(d.name), phone: asStr(d.phone), status: asStr(d.account_status, "active") };
  });
}
export type CcCall = { id: string; direction: string; phone: string; status: string; createdAt: string };
export async function listCcCalls(): Promise<CcCall[]> {
  return listFrom(await http("/call-center/calls"), "items", "data", "calls").map((x) => {
    const d = asDict(x); const p = asDict(d.payload);
    return { id: asStr(d.id), direction: asStr(d.record_type ?? p.direction, "incoming"), phone: asStr(d.title ?? p.phone), status: asStr(d.status, "completed"), createdAt: asStr(d.created_at) };
  });
}
export async function logCcCall(input: { phone: string; direction?: string; note?: string; client_user_id?: string }): Promise<void> {
  await http("/call-center/calls", { method: "POST", body: JSON.stringify({ direction: "outgoing", ...input }) });
}

// ── Retention queue + upsell offers ───────────────────────────────
export type RetentionItem = { id: string; title: string; status: string; offer: string; note: string };
export async function listRetentionQueue(): Promise<RetentionItem[]> {
  return listFrom(await http("/retention/queue"), "items", "data").map((x) => {
    const d = asDict(x); const p = asDict(d.payload);
    return { id: asStr(d.id), title: asStr(d.title), status: asStr(d.status, "new"), offer: asStr(p.offer), note: asStr(p.note) };
  });
}
export type UpsellOffer = { id: string; title: string; status: string; targetPlan: string };
export async function addRetentionQueue(input: { client_user_id?: string; phone?: string; offer?: string; note?: string }): Promise<void> {
  await http("/retention/queue", { method: "POST", body: JSON.stringify(input) });
}
export async function listUpsellOffers(): Promise<UpsellOffer[]> {
  return listFrom(await http("/upsell/offers"), "items", "data", "offers").map((x) => {
    const d = asDict(x); const p = asDict(d.payload);
    return { id: asStr(d.id), title: asStr(d.title), status: asStr(d.status, "new"), targetPlan: asStr(p.target_plan ?? p.plan) };
  });
}

// ── B2B pipeline (kanban) + tasks ─────────────────────────────────
export type B2bStage = { stage: string; count: number; value: number; items: { id: string; name: string; value: number }[] };
export async function getB2bPipeline(): Promise<B2bStage[]> {
  const d = asDict(await http("/b2b/pipeline"));
  return asArr(d.stages).map((x) => {
    const r = asDict(x);
    return {
      stage: asStr(r.stage), count: asNum(r.count), value: uzs(r, "value"),
      items: asArr(r.items).map((y) => { const i = asDict(y); return { id: asStr(i.id), name: asStr(i.name ?? i.title), value: uzs(i, "value") }; }),
    };
  });
}
export async function listB2bTasks(): Promise<WorkTask[]> {
  return listFrom(await http("/b2b/tasks"), "items", "data", "tasks").map(normTask);
}

// ── Security events / 2FA ─────────────────────────────────────────
export async function listSecurityEvents(): Promise<ActivityEntry[]> {
  return listFrom(await http("/auth/security-events"), "items", "data", "events").map(normActivity);
}
// SMS/OTP-based 2FA. start → OTP to phone; verify → enable. DELETE → disable.
export type TwoFactorStart = OtpChallenge;
export async function start2fa(): Promise<TwoFactorStart> {
  return normOtp(await http("/auth/2fa/start", { method: "POST", body: "{}" }));
}
export async function verify2fa(verificationId: string, code: string): Promise<void> {
  await http("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ verification_id: verificationId, code }) });
}
export async function disable2fa(): Promise<void> {
  await http("/auth/2fa", { method: "DELETE" });
}
// Authenticator-app (TOTP) 2FA: setup returns a QR to scan, then enable
// confirms with the app's current 6-digit code.
export type TotpSetup = { setupId: string; secret: string; otpauthUrl: string; qrCode: string; expiresAt: string };
export async function setupTotp(): Promise<TotpSetup> {
  const d = asDict(await http("/auth/2fa/totp/setup", { method: "POST", body: "{}" }));
  const uri = asStr(d.otpauth_url ?? d.otpauth_uri ?? d.provisioning_uri ?? d.authenticator_uri ?? d.uri).trim();
  const otpauthUrl = /^otpauth:\/\//i.test(uri) ? uri : ""; // never another scheme in an href
  let secret = asStr(d.secret).trim();
  if (!secret && otpauthUrl) {
    const m = /[?&]secret=([^&#]+)/i.exec(otpauthUrl);
    try {
      secret = m ? decodeURIComponent(m[1]) : "";
    } catch {
      secret = m ? m[1] : "";
    }
  }
  return {
    setupId: asStr(d.setup_id ?? d.id ?? d.verification_id),
    secret,
    otpauthUrl,
    qrCode: qrSrc(d.qr_code ?? d.qr_code_url ?? d.qr ?? d.qr_image ?? d.qr_code_base64),
    expiresAt: asStr(d.expires_at),
  };
}
// QR value → something an <img src> can show: data:image URIs and https URLs
// pass through, SVG markup and bare base64 PNG become data URIs, a
// backend-relative path is resolved. Anything else → "" (no image).
function qrSrc(v: unknown): string {
  const s = asStr(v).trim();
  if (!s) return "";
  if (/^data:image\//i.test(s) || /^https:\/\//i.test(s)) return s;
  if (/^(<svg|<\?xml)/i.test(s)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
  if (s.length > 64 && /^[A-Za-z0-9+/=\s]+$/.test(s)) return `data:image/png;base64,${s.replace(/\s+/g, "")}`;
  if (s.startsWith("/")) return absUrl(s);
  return "";
}
export async function enableTotp(setupId: string, code: string): Promise<void> {
  await http("/auth/2fa/totp/enable", { method: "POST", body: JSON.stringify({ setup_id: setupId, code }) });
}

// ── Payments history ──────────────────────────────────────────────
export type PaymentHistory = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  kind: string;
  description: string;
  orderId?: string;
  createdAt: string;
  receiptUrl?: string;
};
export async function listPayments(): Promise<PaymentHistory[]> {
  return listFrom(await http("/payments"), "items", "data").map((v) => {
    const d = asDict(v);
    return {
      id: asStr(d.id),
      amount: uzs(d, "amount"),
      currency: asStr(d.currency, "UZS"),
      status: asStr(d.status),
      method: asStr(d.method),
      kind: asStr(d.kind),
      description: asStr(d.description),
      orderId: asStr(d.order_id) || undefined,
      createdAt: asStr(d.created_at),
      receiptUrl: asStr(d.receipt_url) || undefined,
    };
  });
}
export function paymentReceiptUrl(paymentId: string): string {
  return absUrl(`/payments/${paymentId}/receipt`);
}

// ── Notifications ─────────────────────────────────────────────────
// The cascade delivers one event in-app, by push, Telegram and email (SMS only
// as a fallback for critical events). An unconfigured provider leaves its
// record "queued" = waiting for provider delivery, never an error.
export type DeliveryTone = "delivered" | "pending" | "failed" | "unknown";
export type NotificationDelivery = { channel: string; status: string; tone: DeliveryTone };
export function normChannel(v: unknown): string {
  const c = asStr(v).trim().toLowerCase();
  if (/^(in_app|inapp|in-app|app|web|site)$/.test(c)) return "in_app";
  if (/^(push|fcm|apns|firebase)$/.test(c)) return "push";
  if (/^(telegram|tg|telegram_bot)$/.test(c)) return "telegram";
  if (/^(email|mail|e-mail)$/.test(c)) return "email";
  return c; // "sms" and unknown channels pass through
}
export function deliveryTone(status: string): DeliveryTone {
  const s = status.trim().toLowerCase();
  if (/^(sent|delivered|success|succeeded|ok|done|completed|read|opened)$/.test(s)) return "delivered";
  if (/^(queued|pending|scheduled|processing|sending|retry|retrying|waiting|created|new|deferred|standby|not_configured|unconfigured|provider_not_configured)$/.test(s))
    return "pending";
  if (/^(failed|error|bounced|rejected|undelivered|undeliverable|expired)$/.test(s)) return "failed";
  return "unknown";
}
function parseJsonDict(v: unknown): Dict {
  if (typeof v !== "string") return asDict(v);
  try {
    return asDict(JSON.parse(v));
  } catch {
    return {};
  }
}
// First non-blank string among the values (objects, flags and numbers skipped).
function firstText(...v: unknown[]): string {
  for (const x of v) if (typeof x === "string" && x.trim()) return x.trim();
  return "";
}
// Delivery records from any of the shapes the cascade may use: a list of
// per-channel records, a deliveries/channels list, a channel→status map or a
// single record (also inside metadata, possibly JSON-encoded), else the row's
// own channel + status. Sources that are empty or carry no status (a plain
// channel list, an enabled-channels flag map) are skipped; only entries with a
// status are returned.
export function normDeliveries(v: unknown, fallbackChannel = ""): NotificationDelivery[] {
  const found: { channel: string; status: string }[] = [];
  if (Array.isArray(v)) {
    for (const x of v) for (const y of normDeliveries(x, fallbackChannel)) found.push(y);
  } else {
    const d = asDict(v);
    const meta = parseJsonDict(d.metadata ?? d.meta);
    const payload = parseJsonDict(d.payload);
    const isRecord = (r: Dict) => ["channel", "channel_type", "status", "state", "delivery_status"].some((k) => k in r);
    const fromSource = (src: unknown) => {
      const out: { channel: string; status: string }[] = [];
      const add = (channel: unknown, status: unknown) => {
        const c = normChannel(firstText(channel));
        const s = firstText(status).toLowerCase();
        if (c && s) out.push({ channel: c, status: s });
      };
      const fromRecord = (x: unknown) => {
        const r = asDict(x);
        add(firstText(r.channel, r.channel_type, r.name, r.type, r.provider), firstText(r.status, r.state, r.delivery_status));
      };
      if (Array.isArray(src)) src.forEach(fromRecord);
      else if (src && typeof src === "object") {
        const r = src as Dict;
        if (isRecord(r)) fromRecord(r);
        else
          for (const [channel, st] of Object.entries(r)) {
            // Booleans/numbers are enabled flags, not statuses: add() drops them.
            add(channel, st && typeof st === "object" ? firstText(asDict(st).status, asDict(st).state) : st);
          }
      }
      return out;
    };
    const sources = [d.deliveries, d.delivery, d.channels, d.cascade, meta.deliveries, meta.channels, meta.cascade, payload.deliveries, payload.channels];
    for (const src of sources) {
      const got = fromSource(src);
      if (got.length) {
        found.push(...got);
        break;
      }
    }
    // The row's own record (a per-channel row) only when no source had any: next
    // to a real delivery list, the row's `status` may be a record/read status.
    if (!found.length) {
      const own = normChannel(firstText(d.channel, d.channel_type, meta.channel, fallbackChannel));
      const ownStatus = firstText(d.status, d.delivery_status, meta.status).toLowerCase();
      if (own && ownStatus) found.push({ channel: own, status: ownStatus });
    }
  }
  const byChannel = new Map<string, NotificationDelivery>();
  for (const x of found) {
    byChannel.delete(x.channel); // the last record for a channel wins
    byChannel.set(x.channel, { ...x, tone: deliveryTone(x.status) });
  }
  return [...byChannel.values()];
}
export type Notification = {
  id: string;
  ids: string[]; // every backend row folded into this item (per-channel rows)
  groupId: string; // explicit event/correlation id when the row carries one
  title: string;
  body: string;
  kind: string;
  read: boolean;
  createdAt: string;
  channel: string;
  status: string;
  deliveries: NotificationDelivery[];
};
export async function listNotifications(): Promise<Notification[]> {
  return listFrom(await http("/notifications"), "items", "data", "notifications").map((v) => {
    const d = asDict(v);
    const meta = parseJsonDict(d.metadata ?? d.meta);
    const id = asStr(d.id);
    return {
      id,
      ids: id ? [id] : [],
      groupId: asStr(
        d.event_id ?? d.correlation_id ?? d.group_id ?? d.event_key ?? d.dedupe_key ??
          meta.event_id ?? meta.correlation_id ?? meta.group_id ?? meta.event_key ?? meta.dedupe_key,
      ).trim(),
      title: asStr(d.title),
      body: asStr(d.body ?? d.message),
      kind: asStr(d.kind ?? d.event ?? d.type),
      read: Boolean(d.read ?? d.is_read),
      createdAt: asStr(d.created_at ?? d.createdAt),
      // Same sources as normDeliveries' own record, so metadata-only rows fold too.
      channel: normChannel(firstText(d.channel, d.channel_type, meta.channel)),
      status: firstText(d.status, d.delivery_status, meta.status).toLowerCase(),
      deliveries: normDeliveries(d),
    };
  });
}
export async function markNotificationRead(id: string): Promise<void> {
  await http(`/notifications/${id}/read`, { method: "POST" });
}
export async function markAllNotificationsRead(): Promise<void> {
  await http("/notifications/read-all", { method: "POST" });
}
export async function getUnreadCount(): Promise<number> {
  const d = asDict(await http("/notifications/unread-count"));
  return asNum(d.count ?? d.unread ?? d.unread_count);
}

// ── Cases: detail, update, status, seller's cases (CIMS) ──────────
export async function getCase(caseId: string): Promise<BackendCase> {
  return normCase(await http(`/cases/${caseId}`));
}
export type CaseUpdate = {
  lawyer_user_id?: string;
  case_type?: string;
  stage?: string;
  status?: string;
  title?: string;
  description?: string;
  next_action?: string;
  deadline_at?: string;
};
export async function updateCase(caseId: string, patch: CaseUpdate): Promise<BackendCase> {
  return normCase(await http(`/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(patch) }));
}
export async function setCaseStatus(caseId: string, status: string, nextAction?: string): Promise<BackendCase> {
  const body: Record<string, unknown> = { status };
  if (nextAction !== undefined) body.next_action = nextAction;
  return normCase(await http(`/cases/${caseId}/status`, { method: "POST", body: JSON.stringify(body) }));
}
export async function getMyCases(): Promise<BackendCase[]> {
  return listFrom(await http("/lawyers/me/cases"), "cases", "items", "data").map(normCase);
}

// ── Secure-chat call sessions (audio/video) ───────────────────────
export type CallSession = {
  id: string;
  roomId: string;
  callerUserId: string;
  callType: string;
  title: string;
  status: string;
  joinUrl: string;
  startedAt: string;
  endedAt?: string;
  // LiveKit (in-app SFU) connection details, when the backend provides them.
  provider: string;
  livekitUrl: string;
  livekitRoom: string;
  livekitToken: string;
  turnDomain: string;
  // Multi-participant meeting fields (LexGo Meet).
  participants: CallParticipant[];
  maxDurationMinutes: number;
  autoEndAt: string;
  remainingSeconds: number;
  permissions: CallPermissions;
};
export type CallPermissions = { canInvite: boolean; canMute: boolean; canKick: boolean; canEnd: boolean };
export type CallParticipant = {
  userId: string;
  name: string;
  role: string;
  status: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenEnabled: boolean;
};
function normParticipant(v: unknown): CallParticipant {
  const d = asDict(v);
  const user = asDict(d.user);
  return {
    userId: asStr(d.user_id ?? user.id ?? d.id),
    name: asStr(d.name ?? user.name ?? d.full_name),
    role: asStr(d.role),
    status: asStr(d.status),
    micEnabled: d.mic_enabled !== false,
    cameraEnabled: Boolean(d.camera_enabled),
    screenEnabled: Boolean(d.screen_enabled),
  };
}
// LiveKit signalling URL. The backend normally returns it; when it doesn't, use
// the documented production endpoint (override with NEXT_PUBLIC_LIVEKIT_URL).
// An http(s) URL is turned into its ws(s) form, since the SDK connects over
// WebSocket.
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://lexgo.api.cognilabs.org/livekit";
function livekitUrl(v: unknown): string {
  const u = asStr(v).trim() || LIVEKIT_URL;
  return u.replace(/^http(s?):\/\//i, "ws$1://");
}

function normCall(v: unknown): CallSession {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    roomId: asStr(d.room_id),
    callerUserId: asStr(d.caller_user_id),
    callType: asStr(d.call_type),
    title: asStr(d.title),
    status: asStr(d.status),
    joinUrl: backendUrl(asStr(d.join_url)),
    startedAt: asStr(d.started_at),
    endedAt: asStr(d.ended_at) || undefined,
    provider: asStr(d.provider),
    livekitUrl: livekitUrl(d.livekit_url),
    livekitRoom: asStr(d.livekit_room),
    livekitToken: asStr(d.livekit_token),
    turnDomain: asStr(d.turn_domain),
    participants: asArr(d.participants).map(normParticipant),
    maxDurationMinutes: asNum(d.max_duration_minutes),
    autoEndAt: asStr(d.auto_end_at),
    remainingSeconds: asNum(d.remaining_seconds),
    permissions: (() => {
      const p = asDict(d.permissions);
      return { canInvite: Boolean(p.can_invite), canMute: Boolean(p.can_mute), canKick: Boolean(p.can_kick), canEnd: Boolean(p.can_end) };
    })(),
  };
}
// Client/seller fetch their own LiveKit token to join an existing call.
export type LiveKitJoin = { url: string; room: string; token: string };
export async function getCallJoinToken(roomId: string, callId: string): Promise<LiveKitJoin> {
  const d = asDict(await http(`/secure-chats/${roomId}/calls/${callId}/join-token`));
  return {
    url: livekitUrl(d.livekit_url ?? d.url),
    room: asStr(d.livekit_room ?? d.room),
    token: asStr(d.livekit_token ?? d.token),
  };
}
export async function startCall(
  roomId: string,
  callType: "audio" | "video",
  title: string,
  opts?: { participantUserIds?: string[]; maxDurationMinutes?: number },
): Promise<CallSession> {
  return normCall(
    await http(`/secure-chats/${roomId}/calls`, {
      method: "POST",
      body: JSON.stringify({
        call_type: callType,
        title,
        ...(opts?.participantUserIds?.length ? { participant_user_ids: opts.participantUserIds } : {}),
        ...(opts?.maxDurationMinutes ? { max_duration_minutes: opts.maxDurationMinutes } : {}),
      }),
    }),
  );
}
export async function listCalls(roomId: string): Promise<CallSession[]> {
  return listFrom(await http(`/secure-chats/${roomId}/calls`), "calls", "items", "data").map(normCall);
}
// Meeting details incl. participants + remaining time.
export async function getCall(roomId: string, callId: string): Promise<CallSession> {
  return normCall(await http(`/secure-chats/${roomId}/calls/${callId}`));
}
// Host/staff invites another user into the meeting.
export async function inviteCallParticipant(roomId: string, callId: string, userId: string, role = "participant"): Promise<void> {
  await http(`/secure-chats/${roomId}/calls/${callId}/participants`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, role }),
  });
}
// Join an existing meeting (POST) — returns LiveKit creds like /join-token.
export async function joinCall(roomId: string, callId: string): Promise<LiveKitJoin> {
  const d = asDict(await http(`/secure-chats/${roomId}/calls/${callId}/join`, { method: "POST", body: "{}" }));
  return {
    url: livekitUrl(d.livekit_url ?? d.url),
    room: asStr(d.livekit_room ?? d.room),
    token: asStr(d.livekit_token ?? d.token),
  };
}
export async function updateCallParticipant(
  roomId: string,
  callId: string,
  userId: string,
  patch: Partial<{ status: string; role: string; mic_enabled: boolean; camera_enabled: boolean; screen_enabled: boolean }>,
): Promise<void> {
  await http(`/secure-chats/${roomId}/calls/${callId}/participants/${userId}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export async function leaveCall(roomId: string, callId: string): Promise<void> {
  await http(`/secure-chats/${roomId}/calls/${callId}/leave`, { method: "POST", body: "{}" });
}
export async function endCall(callId: string): Promise<CallSession> {
  return normCall(await http(`/calls/${callId}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) }));
}
// Room-scoped end (host ends the whole meeting) — preferred for multi-party.
export async function endMeeting(roomId: string, callId: string): Promise<void> {
  await http(`/secure-chats/${roomId}/calls/${callId}/end`, { method: "POST", body: "{}" });
}

// Meetings the current user was invited to — lets the invitee discover a call
// without being a room member (GET /calls/invited).
export type InvitedCall = {
  roomId: string;
  callId: string;
  callType: "audio" | "video";
  title: string;
  callerName: string;
  status: string; // participant status: invited | joined | …
  callStatus: string; // call state: active | ended | …
  autoEndAt: string;
};
export async function listInvitedCalls(): Promise<InvitedCall[]> {
  return listFrom(await http("/calls/invited"), "items", "data", "calls").map((v) => {
    const d = asDict(v);
    return {
      roomId: asStr(d.room_id),
      callId: asStr(d.call_id ?? d.id),
      callType: asStr(d.call_type) === "audio" ? "audio" : "video",
      title: asStr(d.title),
      callerName: asStr(d.caller_name),
      status: asStr(d.status),
      callStatus: asStr(d.call_status ?? d.status),
      autoEndAt: asStr(d.auto_end_at),
    };
  });
}

// Search any platform user (staff/callcenter) to invite to a meeting.
export type UserSearchResult = { id: string; name: string; phone: string; role: string; lexgoId: string };
export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  return listFrom(await http(`/users/search?q=${encodeURIComponent(query)}`), "items", "data", "users").map((v) => {
    const d = asDict(v);
    const u = asDict(d.user);
    return {
      id: asStr(d.id ?? d.user_id ?? u.id),
      name: asStr(d.name ?? d.full_name ?? u.name),
      phone: asStr(d.phone ?? u.phone),
      role: asStr(d.role ?? d.seller_type),
      lexgoId: asStr(d.lexgo_id ?? d.lexgoId),
    };
  });
}

// ── Seller workspace (folders + file metadata) ────────────────────
export type WorkspaceFolder = { id: string; name: string; parentId?: string; caseId?: string; status: string; createdAt: string };
function normFolder(v: unknown): WorkspaceFolder {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    name: asStr(d.name),
    parentId: asStr(d.parent_id) || undefined,
    caseId: asStr(d.case_id) || undefined,
    status: asStr(d.status),
    createdAt: asStr(d.created_at),
  };
}
export async function listFolders(): Promise<WorkspaceFolder[]> {
  return listFrom(await http("/workspace/folders"), "folders", "items", "data").map(normFolder);
}
export async function createFolder(input: { name: string; parent_id?: string; case_id?: string }): Promise<WorkspaceFolder> {
  return normFolder(await http("/workspace/folders", { method: "POST", body: JSON.stringify(input) }));
}
export async function deleteFolder(id: string): Promise<void> {
  await http(`/workspace/folders/${id}`, { method: "DELETE" });
}

export type WorkspaceFile = {
  id: string;
  folderId?: string;
  caseId?: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  size: number;
  createdAt: string;
};
function normFile(v: unknown): WorkspaceFile {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    folderId: asStr(d.folder_id) || undefined,
    caseId: asStr(d.case_id) || undefined,
    fileName: asStr(d.file_name),
    fileUrl: asStr(d.file_url),
    mimeType: asStr(d.mime_type),
    size: asNum(d.size),
    createdAt: asStr(d.created_at),
  };
}
export async function listFiles(): Promise<WorkspaceFile[]> {
  return listFrom(await http("/workspace/files"), "files", "items", "data").map(normFile);
}
export async function createFile(input: {
  file_name: string;
  file_url?: string;
  folder_id?: string;
  case_id?: string;
  mime_type?: string;
  size?: number;
}): Promise<WorkspaceFile> {
  return normFile(await http("/workspace/files", { method: "POST", body: JSON.stringify(input) }));
}
export async function deleteFile(id: string): Promise<void> {
  await http(`/workspace/files/${id}`, { method: "DELETE" });
}

// Real multipart upload (field "file"). http() forces JSON, so send raw here.
export async function uploadWorkspaceFile(file: File, opts?: { folderId?: string }): Promise<WorkspaceFile> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts?.folderId) fd.append("folder_id", opts.folderId);
  const token = getToken();
  const res = await fetch(`${API_BASE}/workspace/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new ApiError(res.status, `upload_${res.status}`);
  return normFile(await res.json());
}

// ── Workspace: file versions + comments + document requests ────────
export type FileVersion = {
  id: string; version: number; fileName: string; fileUrl: string; note: string; createdAt: string;
};
function normVersion(v: unknown): FileVersion {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    version: asNum(d.version),
    fileName: asStr(d.file_name),
    fileUrl: asStr(d.file_url),
    note: asStr(d.note),
    createdAt: asStr(d.created_at),
  };
}
export async function listFileVersions(fileId: string): Promise<FileVersion[]> {
  return listFrom(await http(`/workspace/files/${fileId}/versions`), "items", "data", "versions").map(normVersion);
}
export async function addFileVersion(fileId: string, input: { file_url?: string; note?: string }): Promise<FileVersion> {
  return normVersion(await http(`/workspace/files/${fileId}/versions`, { method: "POST", body: JSON.stringify(input) }));
}

export type FileComment = { id: string; text: string; authorName: string; createdAt: string };
function normComment(v: unknown): FileComment {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    text: asStr(d.text),
    authorName: asStr(d.author_name),
    createdAt: asStr(d.created_at),
  };
}
export async function listFileComments(fileId: string): Promise<FileComment[]> {
  return listFrom(await http(`/workspace/files/${fileId}/comments`), "items", "data", "comments").map(normComment);
}
export async function addFileComment(fileId: string, text: string): Promise<FileComment> {
  return normComment(await http(`/workspace/files/${fileId}/comments`, { method: "POST", body: JSON.stringify({ text }) }));
}

// Advocate/lawyer requests a document from a client (push-notifies them).
export async function requestClientDocument(input: { client_user_id: string; title: string; message?: string }): Promise<void> {
  await http("/workspace/document-requests", { method: "POST", body: JSON.stringify(input) });
}

export type WorkspaceDocRequest = {
  id: string;
  title: string;
  status: string; // requested | fulfilled
  message: string;
  requestedByName: string;
  createdAt: string;
  file?: { fileUrl: string; fileName: string; mimeType: string; size: number } | null;
};
function normDocReq(v: unknown): WorkspaceDocRequest {
  const d = asDict(v);
  const f = d.file ? asDict(d.file) : null;
  return {
    id: asStr(d.id),
    title: asStr(d.title),
    status: asStr(d.status, "requested"),
    message: asStr(d.message),
    requestedByName: asStr(d.requested_by_name),
    createdAt: asStr(d.created_at),
    file: f && (f.file_url || f.file_name)
      ? { fileUrl: asStr(f.file_url), fileName: asStr(f.file_name), mimeType: asStr(f.mime_type), size: asNum(f.size) }
      : null,
  };
}
// Incoming (client) or outgoing (role="requester") document requests.
export async function listWorkspaceDocRequests(opts?: { role?: "requester"; status?: string }): Promise<WorkspaceDocRequest[]> {
  const q: string[] = [];
  if (opts?.role) q.push(`role=${opts.role}`);
  if (opts?.status) q.push(`status=${opts.status}`);
  const qs = q.length ? `?${q.join("&")}` : "";
  return listFrom(await http(`/workspace/document-requests${qs}`), "items", "data", "requests").map(normDocReq);
}
// Client fulfils a request by uploading the file (multipart).
export async function fulfillDocRequest(id: string, file: File): Promise<WorkspaceDocRequest> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getToken();
  const res = await fetch(`${API_BASE}/workspace/document-requests/${id}/fulfill`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new ApiError(res.status, `fulfill_${res.status}`);
  return normDocReq(await res.json());
}

// ── Admin: seed demo data ─────────────────────────────────────────
// Idempotent showcase seed; it also deletes stray "Approval Test" / "Runtime"
// records. Production answers 404 "Demo endpoint yopiq" (isDemoUnavailable).
// `removed` is 0 unless the response carries a count, list or per-type map.
export type DemoSeedResult = { templates: number; adsProducts: number; removed: number; message: string };
export async function seedDemoData(): Promise<DemoSeedResult> {
  const d = asDict(await http("/admin/demo-data/seed", { method: "POST" }));
  const box = asDict(d.counts ?? d.summary ?? d.seeded);
  const rm = d.removed ?? d.deleted ?? d.cleaned ?? d.removed_records ?? box.removed;
  const removed = Array.isArray(rm)
    ? rm.length
    : rm && typeof rm === "object"
      ? Object.values(rm).reduce<number>((s, x) => s + (Array.isArray(x) ? x.length : asNum(x)), 0)
      : asNum(rm);
  return {
    templates: asNum(d.templates ?? box.templates),
    adsProducts: asNum(d.ads_products ?? box.ads_products),
    removed: Math.max(0, Math.round(removed)),
    message: asStr(d.message),
  };
}

// ── Admin: seller registration requests (approval flow) ──────────
export type RegisterRequest = {
  id: string;
  verificationId: string;
  status: string;
  role: string;
  name: string;
  phone: string;
  createdAt: string;
};
function normRegReq(v: unknown): RegisterRequest {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    verificationId: asStr(d.verification_id),
    status: asStr(d.status),
    role: asStr(d.role),
    name: asStr(d.name),
    phone: asStr(d.phone),
    createdAt: asStr(d.created_at),
  };
}
export async function listRegisterRequests(status = "pending"): Promise<RegisterRequest[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return listFrom(await http(`/admin/register-requests${q}`), "requests", "items", "data").map(normRegReq);
}
export async function acceptRegisterRequest(id: string): Promise<unknown> {
  return http(`/admin/register-requests/${id}/accept`, { method: "POST" });
}
export async function rejectRegisterRequest(id: string): Promise<unknown> {
  return http(`/admin/register-requests/${id}/reject`, { method: "POST" });
}

// ── Legal consents (versioned terms / privacy / disclaimer) ───────
// GET /legal/consents is public and returns the active documents (title and
// body are Uzbek-only; Accept-Language / ?lang are ignored). POST
// /legal/consents/{id}/accept needs a token. There is no read-back of a user's
// own acceptances — see lib/consents.ts.
export type ConsentDoc = {
  id: string;
  slug: string; // terms | privacy | legal_disclaimer | future slugs
  version: string;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
};
export function normConsentDoc(v: unknown): ConsentDoc {
  const d = asDict(v);
  return {
    id: asStr(d.id ?? d.consent_id ?? d.document_id),
    slug: asStr(d.slug ?? d.type ?? d.code).trim().toLowerCase(),
    version: asStr(d.version ?? d.version_label),
    title: asStr(d.title ?? d.name),
    body: asStr(d.body ?? d.content ?? d.text),
    active: !(d.is_active === false || d.is_active === "false" || d.is_active === 0 || d.active === false),
    createdAt: asStr(d.created_at ?? d.published_at ?? d.updated_at),
  };
}
export function normConsentDocs(data: unknown): ConsentDoc[] {
  return listFrom(data, "items", "data", "consents", "documents", "results")
    .map(normConsentDoc)
    .filter((d) => d.id && d.slug);
}
// "1.10" > "1.9": compare the numeric segments.
export function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}
const CONSENT_ORDER = ["terms", "privacy", "legal_disclaimer"];
// The documents a user must accept now: active only, the newest version per
// slug (tie → later created_at), in reading order (terms, privacy, disclaimer,
// then any other slug alphabetically).
export function currentConsents(docs: ConsentDoc[]): ConsentDoc[] {
  const best = new Map<string, ConsentDoc>();
  for (const d of docs) {
    if (!d.active) continue;
    const cur = best.get(d.slug);
    const c = cur ? cmpVersion(d.version, cur.version) : 1;
    if (!cur || c > 0 || (c === 0 && d.createdAt > cur.createdAt)) best.set(d.slug, d);
  }
  const rank = (s: string) => {
    const i = CONSENT_ORDER.indexOf(s);
    return i < 0 ? CONSENT_ORDER.length : i;
  };
  return [...best.values()].sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));
}
export async function listLegalConsents(): Promise<ConsentDoc[]> {
  return normConsentDocs(await http("/legal/consents"));
}
// synced = the server has it (2xx, 409 or "already accepted"); retry = try
// again later (offline, token, rate limit, 5xx); failed = refused for good
// (other 4xx). `status` is the HTTP status (200 on success). Never throws.
export type ConsentAcceptOutcome = { outcome: "synced" | "retry" | "failed"; status: number };
export async function acceptLegalConsent(id: string, version: string): Promise<ConsentAcceptOutcome> {
  try {
    // {version} is harmless if the endpoint takes no body.
    await http(`/legal/consents/${encodeURIComponent(id)}/accept`, {
      method: "POST",
      body: JSON.stringify(version ? { version } : {}),
    });
    return { outcome: "synced", status: 200 };
  } catch (e) {
    // http() only throws a non-ApiError after a 2xx with a non-JSON body.
    if (!(e instanceof ApiError)) return { outcome: "synced", status: 200 };
    const s = e.status;
    if (s === 409 || /already|allaqachon|уже/i.test(e.detail || "")) return { outcome: "synced", status: s };
    if (s === 0 || s === 401 || s === 408 || s === 425 || s === 429 || s >= 500) return { outcome: "retry", status: s };
    return { outcome: "failed", status: s };
  }
}

// ── helpers ───────────────────────────────────────────────────────
function listFrom(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const d = asDict(data);
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as unknown[];
  return [];
}
