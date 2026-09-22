// Typed client for the LexGo backend contract (FRONTEND_API.md / MOBILE_API.md).
// Every function talks to the same-origin proxy with the bearer token attached.
// UI callers wrap reads in `withFallback(...)` so the app keeps working on local
// mock data until the backend is reachable.
import { http, httpBlob, asDict, asStr, asNum, asArr, API_BASE, ApiError, absUrl, backendOrigin, backendUrl, parseServerTime, toApiError, type Dict } from "@/lib/http";
import { mimeFromName } from "@/lib/download";
import { getToken } from "@/lib/client";
import type { ProfessionalProfile } from "@/lib/types";
import { uzs, uzsOpt, fmtUzs } from "@/lib/money";
import { attributionDetails } from "@/lib/attribution";
import { applyCategoryOverrides, applyPlanOverride, applyPlanOverrides, categoryOverridesFrom, planOverridesFrom, type OverlaidPlan } from "@/lib/catalogOverlay";

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
  twoFactorMethod: string; // "" | "telegram" | "sms" | "totp"
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
  region?: string;
  referralCode?: string;
  phone: string;
  password: string;
}): Promise<RegisterStartResult> {
  const { firstName, lastName, middleName, region, referralCode, ...rest } = input;
  const body = {
    ...rest,
    ...(region ? { region } : {}),
    ...(referralCode ? { referral_code: referralCode } : {}),
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
// method: "telegram" = code sent by the Telegram bot (the backend no longer
// sends login codes by SMS), "totp" = authenticator app, "sms" = legacy value.
export type TwoFactorChallenge = OtpChallenge & { twoFactorRequired: true; method: "telegram" | "sms" | "totp" | "" };
export type LoginResult = AuthResult | TwoFactorChallenge;

function normChallenge(v: unknown): TwoFactorChallenge {
  const j = asDict(v);
  const dd = j.detail && typeof j.detail === "object" && !Array.isArray(j.detail) ? asDict(j.detail) : {};
  const raw = asStr(dd.method ?? dd.two_factor_method ?? dd.type ?? j.method ?? j.two_factor_method).toLowerCase();
  const method = /totp|authenticator|app/.test(raw) ? "totp" : /telegram/.test(raw) ? "telegram" : raw ? "sms" : "";
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
  createdAt: string;
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
    createdAt: asStr(d.created_at),
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
  // true → include unverified sellers regardless of the catalogue setting (admin views).
  includeUnverified?: boolean;
}): Promise<BackendLawyer[]> {
  const qs = new URLSearchParams();
  if (filters?.region) qs.set("region", filters.region);
  if (filters?.specialization) qs.set("specialization", filters.specialization);
  if (filters?.service_id) qs.set("service_id", filters.service_id);
  const q = qs.toString();
  const data = await http(`/lawyers${q ? `?${q}` : ""}`);
  const all = listFrom(data, "lawyers", "items", "data").map(normLawyer);
  if (filters?.includeUnverified) return all;
  // T0-10 §5: the admin can hide unverified sellers from the catalogue entirely.
  return (await getUnverifiedSellersMode()) === "hidden" ? all.filter((l) => l.verified) : all;
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
      district: p.district ?? "",
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
    district: asStr(d.district),
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
  // GM Frontend Document Generation flow: when set, this service is wired to
  // a document template (contract/application) instead of (or alongside) the
  // marketplace order flow.
  documentTemplateId?: string;
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
    documentTemplateId: asStr(d.document_template_id) || undefined,
  };
}

export type ServiceFilters = {
  category_id?: string;
  q?: string;
  executor_type?: string;
  catalog_only?: boolean;
};

export async function getServiceCategories(opts?: { includeHidden?: boolean }): Promise<BackendCategory[]> {
  const [data, ov] = await Promise.all([http("/service-categories"), getPlatformPolicies().then((p) => categoryOverridesFrom(p.raw)).catch(() => ({}))]);
  const cats = listFrom(data, "categories", "items", "data").map((v) => {
    const d = asDict(v);
    return { id: asStr(d.id), name: asStr(d.title ?? d.name), slug: asStr(d.slug) };
  });
  return applyCategoryOverrides(cats, ov, opts?.includeHidden);
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

// Catalog search (GET /services/search): the backend normalizes Latin/Cyrillic
// Uzbek and Russian spellings and matches name, slug, category, subcategory and
// AI category. q must be non-empty; limit is clamped to 1–50 server-side.
export type ServiceSearchHit = { service: BackendService; score: number };
export async function searchServices(
  q: string,
  opts?: { limit?: number; executorType?: string },
  locale = "uz",
): Promise<ServiceSearchHit[]> {
  const qs = new URLSearchParams({ q: q.trim() });
  qs.set("limit", String(Math.max(1, Math.min(opts?.limit ?? 50, 50))));
  if (opts?.executorType) qs.set("executor_type", opts.executorType);
  return asArr(await http(`/services/search?${qs}`)).map((v) => {
    const d = asDict(v);
    return { service: normService(d.service, locale), score: asNum(d.score) };
  });
}

// Service passport (GET /services/{id}/passport). Durations are in days.
// seller_income / platform_fee are internal (the commission stays hidden from
// the client, S-27), so they are not mapped.
export type ServicePassport = {
  catalogCode: string;
  family: string;
  group: string;
  subcategory: string;
  executorType: string;
  advokatRequired: boolean;
  format: string;
  // Durations in days as the catalog stores them: "10", or a range like "3-5".
  standardDuration: string;
  urgentDuration: string;
  standardDays: number;
  urgentDays: number;
  requiredDocuments: string[];
  pricingTier: string;
  standardPrice?: number;
  refundCode: string;
  slaCode: string;
  aiCategory: string;
  version: string;
};
function normPassport(v: unknown): ServicePassport {
  const d = asDict(v);
  return {
    catalogCode: asStr(d.catalog_code),
    family: asStr(d.family),
    group: asStr(d.group),
    subcategory: asStr(d.subcategory),
    executorType: asStr(d.executor_type),
    advokatRequired: Boolean(d.advokat_required),
    format: asStr(d.format),
    standardDuration: asStr(d.standard_duration).trim(),
    urgentDuration: asStr(d.urgent_duration).trim(),
    standardDays: asNum(d.standard_duration),
    urgentDays: asNum(d.urgent_duration),
    requiredDocuments: asArr(d.required_documents).map((x) => asStr(x)).filter(Boolean),
    pricingTier: asStr(d.pricing_tier),
    standardPrice: uzsOpt(d, "standard_price"),
    refundCode: asStr(d.refund_code),
    slaCode: asStr(d.sla_code),
    aiCategory: asStr(d.ai_category),
    version: asStr(d.version),
  };
}
export async function getServicePassport(
  serviceId: string,
  locale = "uz",
): Promise<{ service: BackendService; passport: ServicePassport }> {
  const d = asDict(await http(`/services/${encodeURIComponent(serviceId)}/passport`));
  return { service: normService(d.service, locale), passport: normPassport(d.passport) };
}

// Package tariffs (GET /service-packages).
export type BackendPackage = {
  id: string;
  code: string;
  title: string;
  tariff: string;
  price: number;
  slug: string;
  categoryTitle: string;
  relatedServiceCodes: string; // "G01-G03"
  duration: string;
  result: string;
  included: string[];
  excluded: string[];
  active: boolean;
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
      tariff: asStr(d.tariff).toUpperCase(),
      price: uzs(d, "price", "standard_price"),
      slug: asStr(d.slug),
      categoryTitle: asStr(d.category_title),
      relatedServiceCodes: asStr(d.related_service_codes),
      duration: asStr(d.duration),
      result: asStr(d.result),
      included: asArr(d.included).map((x) => asStr(x)),
      excluded: asArr(d.excluded).map((x) => asStr(x)),
      active: d.is_active !== false,
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
  // Precise role list (2026-09-19 backend update): when present, the
  // authoritative answer to "who sees this plan" — planForRole() checks it
  // before falling back to the audience-string heuristic below.
  targetRoles: string[];
  // Which payment provider handles this plan's recurring/auto-renew charge
  // (e.g. "atmos"); empty when the plan has no auto-charge set up.
  autoChargeProvider: string;
  billingType: string;
  sortOrder: number;
  allowedGiftDurations: number[];
  description: string;
  features: string[];
  isGiftable: boolean;
  isActive: boolean;
  entitlements: Record<string, unknown>; // ai_requests, doc_analysis, history_days, export, case_law_search…
  // Raw admin-editable fields (the localized `name` / `features` above are
  // what the UI shows; these are what POST/PATCH /admin/subscription-plans take).
  title: string;
  benefits: string[];
};

// Who a tariff is sold to (GM: Paket tariflar are per role). The backend keeps
// a single `audience` string and normalizes it in plan_public_meta /
// sync_canonical_subscription_plans: canonical values are personal / seller /
// business, so an admin-chosen client / yurist / advokat may come back
// rewritten by slug ("shaxsiy" → personal, "lexgo-ai" / "seller" → seller,
// "b2b" / "business" → business). This helper maps whatever the backend sent
// to the roles the tariff applies to.
export type PlanAudience = "client" | "yurist" | "advokat" | "business";
export const PLAN_AUDIENCES: PlanAudience[] = ["client", "yurist", "advokat", "business"];
export function planAudience(plan: Pick<BackendPlan, "audience" | "slug">): PlanAudience[] {
  const a = (plan.audience || "").trim().toLowerCase();
  if (a === "personal" || a === "client") return ["client"];
  if (a === "seller") return ["yurist", "advokat"];
  if (a === "business" || a === "b2b") return ["business"];
  if (a === "yurist" || a === "lawyer") return ["yurist"];
  if (a === "advokat" || a === "advocate") return ["advokat"];
  // Unknown / empty audience: fall back to the same slug rule the backend uses.
  const s = (plan.slug || "").toLowerCase();
  if (s.includes("b2b") || s.includes("business")) return ["business"];
  if (s.includes("shaxsiy")) return ["client"];
  return ["yurist", "advokat"];
}
// True when the tariff is sold to this backend role (a business tariff never
// matches a person; anyone else sees what planAudience() lists). targetRoles
// (client/yurist/advokat only, no "business") wins when the plan carries it —
// it's the precise, admin-set list; the audience string is the older, fuzzier
// signal kept for plans created before targetRoles existed.
export function planForRole(plan: Pick<BackendPlan, "audience" | "slug" | "targetRoles">, role: string): boolean {
  const r = role === "lawyer" ? "yurist" : role === "advocate" ? "advokat" : role;
  if (plan.targetRoles?.length) return plan.targetRoles.includes(r);
  return planAudience(plan).includes(r as PlanAudience);
}

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

function normPlan(v: unknown, locale: string): BackendPlan {
  const d = asDict(v);
  const monthly = uzs(d, "monthly_price", "price");
  return {
    id: asStr(d.id),
    name: pickLoc(d.name, locale, asStr(d.title)),
    slug: asStr(d.slug),
    entitlements: asDict(d.entitlements ?? d.limits),
    price: monthly,
    monthlyPrice: monthly,
    sixMonthPrice: uzs(d, "six_month_price"),
    yearlyPrice: uzs(d, "yearly_price"),
    prepaidYearlyPrice: uzs(d, "prepaid_yearly_price"),
    audience: asStr(d.audience),
    targetRoles: asArr(d.target_roles).map((x) => asStr(x)),
    autoChargeProvider: asStr(d.auto_charge_provider),
    billingType: asStr(d.billing_type),
    sortOrder: asNum(d.sort_order),
    allowedGiftDurations: asArr(d.allowed_gift_durations).map((x) => asNum(x)),
    description: asStr(d.description),
    features: pickLocArr(d.features, locale, d.benefits),
    isGiftable: Boolean(d.is_giftable),
    isActive: d.is_active !== false,
    title: asStr(d.title) || pickLoc(d.name, "uz", ""),
    benefits: Array.isArray(d.benefits) ? d.benefits.map((x) => asStr(x)) : pickLocArr(d.features, "uz", []),
  };
}

export async function getSubscriptionPlans(locale = "uz"): Promise<BackendPlan[]> {
  const [data, ov] = await Promise.all([http("/subscription-plans"), getPlatformPolicies().then((p) => planOverridesFrom(p.raw)).catch(() => ({}))]);
  return applyPlanOverrides(listFrom(data, "plans", "items", "data").map((v) => normPlan(v, locale)), ov);
}

// A route the backend has not shipped yet answers 404 (unknown path), 405
// (path known, method not) or 501. Callers feature-detect with this and keep
// the UI usable instead of failing.
export function isMissingRoute(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);
}

// Admin list of tariffs. Backend HEAD f6c94f8 only has POST
// /admin/subscription-plans (no GET), so this probes GET and falls back to the
// public list, which carries active plans only — `activeOnly` tells the UI.
export async function listSubscriptionPlansAdmin(locale = "uz"): Promise<{ plans: OverlaidPlan[]; activeOnly: boolean }> {
  const ov = await getPlatformPolicies().then((p) => planOverridesFrom(p.raw)).catch(() => ({}));
  try {
    const data = await http("/admin/subscription-plans");
    return { plans: listFrom(data, "plans", "items", "data").map((v) => applyPlanOverride(normPlan(v, locale), ov)), activeOnly: false };
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  const data = await http("/subscription-plans");
  return { plans: listFrom(data, "plans", "items", "data").map((v) => applyPlanOverride(normPlan(v, locale), ov)), activeOnly: true };
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
  // Seller response window (T1-10 §6): details.confirmation_deadline_at.
  confirmationDeadlineAt?: string;
};

function normOrder(v: unknown): BackendOrder {
  const d = asDict(v);
  const details = asDict(d.details);
  const service = asDict(d.service);
  const amount = uzsOpt(d, "price", "amount");
  return {
    id: asStr(d.id),
    title: asStr(details.question ?? d.title ?? details.title ?? service.name),
    serviceName: asStr(service.name ?? service.title ?? d.service_name ?? d.service_title ?? details.service_title ?? details.service_name),
    status: asStr(d.status),
    paymentStatus: asStr(d.payment_status),
    contactUnlocked: Boolean(d.contact_unlocked),
    areaKey: asStr(d.area ?? service.category ?? details.area),
    region: asStr(d.region ?? details.region),
    budget: amount != null ? fmtUzs(amount) : asStr(details.budget),
    createdAt: asStr(d.created_at ?? d.createdAt),
    lawyerName: asStr(d.lawyer_name ?? asDict(d.lawyer).name) || undefined,
    confirmationDeadlineAt: asStr(d.confirmation_deadline_at ?? details.confirmation_deadline_at) || undefined,
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
  "paid",
  "started",
  "in_progress",
  "result_ready",
  "quality_check",
  "delivered",
  "client_confirmation",
  "completed",
  "rated",
  "lost",
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
// code: region | experience | seller_premium (label is usually absent).
export type PriceModifier = { key: string; label: string; percent?: number; amount?: number; multiplier?: number };
export type PriceQuote = {
  baseAmount: number;
  subtotal?: number;
  discountAmount?: number;
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
    subtotal: uzsOpt(d, "subtotal"),
    discountAmount: uzsOpt(d, "discount_amount"),
    totalAmount: uzs(d, "total_amount", "total", "price"),
    currency: asStr(d.currency, "UZS"),
    referralDiscountPercent: (asNum(d.discount_percent) || asNum(rd.discount_percent)) || undefined,
    modifiers: asArr(d.modifiers).map((x) => {
      const m = asDict(x);
      return {
        key: asStr(m.code ?? m.key ?? m.type),
        label: asStr(m.label ?? m.name),
        percent: asNum(m.percent) || undefined,
        amount: uzs(m, "amount") || undefined,
        multiplier: asNum(m.multiplier) || undefined,
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
// Real ATMOS purchase (2026-09-19 backend update): recurring/auto-renew
// billing, distinct from the one-off demo/generic-invoice paths above.
// normPurchase() already reads the nested `payment.{id,status,payment_url}`
// and top-level `subscription_id` this endpoint returns.
export async function purchasePlan(
  planId: string,
  input: {
    billing_period: string;
    provider?: string;
    auto_renew?: boolean;
    payment_method_id?: string;
    provider_customer_id?: string;
    family_members?: unknown[];
    provider_payload?: Record<string, unknown>;
  },
): Promise<PurchaseResult> {
  return normPurchase(
    await http(`/subscription-plans/${encodeURIComponent(planId)}/purchase`, {
      method: "POST",
      body: JSON.stringify({ provider: "atmos", auto_renew: true, family_members: [], provider_payload: {}, ...input }),
    }),
  );
}

// ── Payments ──────────────────────────────────────────────────────
// Provider sent to the real checkout endpoints (/gifts, /promotions/checkout).
// Production has the demo provider disabled and Payme/Click answer 503 until
// they are configured. A staging build sets NEXT_PUBLIC_PAYMENT_PROVIDER=demo_payme
// in its deployment env to keep the demo checkout; inlined at build time.
const CHECKOUT_PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || "payme").trim().toLowerCase();
// "atmos" is the GM-required monthly auto-pay provider. Backend HEAD f6c94f8
// (payment_provider.py) knows payme / click / demo only and answers 400
// "Payment provider qo'llab-quvvatlanmaydi" for anything else, so a build with
// NEXT_PUBLIC_PAYMENT_PROVIDER=atmos works the moment the backend ships it —
// until then isProviderUnsupported() turns that 400 into the "payment
// unavailable" notice instead of a generic error.
export type PaymentProvider = "payme" | "click" | "rahmat" | "atmos";
export const PAYMENT_PROVIDERS: PaymentProvider[] = ["payme", "click", "rahmat", "atmos"];
// True when this build checks out through the staging demo provider, whose
// demo-purchase / demo-pay endpoints settle instantly (404 in production).
export const isDemoCheckout = () => CHECKOUT_PROVIDER.startsWith("demo");
export const isAtmosCheckout = () => CHECKOUT_PROVIDER === "atmos";
export const checkoutProvider = () => CHECKOUT_PROVIDER;
// The backend rejected the configured provider itself (400 from
// get_payment_provider), not the payment — e.g. ATMOS before it ships.
export function isProviderUnsupported(e: unknown): boolean {
  return e instanceof ApiError && e.status === 400 && /provider/i.test(e.detail || "");
}
export type PaymentIntent = { id: string; status: string; amount: number; currency: string; paymentUrl?: string };
export async function createPayment(input: {
  provider: PaymentProvider | string;
  amount: number; // whole so'm (legacy UZS), never tiyin
  currency?: string;
  order_id?: string;
  target_type?: "order" | "subscription_plan" | "private_chat" | "document_request" | "gift" | string;
  target_id?: string;
  provider_payload?: Record<string, unknown>;
}): Promise<PaymentIntent> {
  const d = asDict(
    await http("/payments", {
      method: "POST",
      body: JSON.stringify({ currency: "UZS", provider_payload: {}, ...input }),
    }),
  );
  return {
    id: asStr(d.id ?? asDict(d.payment).id),
    status: asStr(d.status),
    amount: uzs(d, "amount"),
    currency: asStr(d.currency, "UZS"),
    paymentUrl: safePaymentUrl(d.payment_url ?? asDict(d.invoice).payment_url) || undefined,
  };
}

// ── Document templates ────────────────────────────────────────────
// One question on a document template. `type` drives which widget the builder
// renders (production sends text / textarea / date / phone / email / number on
// every field) and `placeholder` is usually the field's own {{mustache}}
// token — both must survive normalization or the builder falls back to
// guessing the widget from the field's name, which mis-types names like
// `claimant_full_name`. Kept in one shared shape so every endpoint that
// returns fields (template, service fields, document request) reads the same.
export type TemplateQuestion = {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  step?: number;
  placeholder?: string;
  hint?: string;
  options?: string[];
};

// `name` and `key` are the same on every production field, but each endpoint
// spells at least one of them — take whichever is present.
function normQuestion(q: unknown): TemplateQuestion {
  const x = asDict(q);
  const name = asStr(x.name) || asStr(x.key);
  const opts = asArr(x.options ?? x.choices).map((o) => {
    const od = asDict(o);
    return asStr(od.value ?? od.label) || asStr(o);
  }).filter(Boolean);
  return {
    name,
    label: asStr(x.label) || name,
    required: Boolean(x.required),
    type: asStr(x.type ?? x.field_type) || undefined,
    step: typeof x.step === "number" ? x.step : undefined,
    placeholder: asStr(x.placeholder ?? x.example) || undefined,
    hint: asStr(x.hint ?? x.tooltip) || undefined,
    options: opts.length ? opts : undefined,
  };
}

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
  questionnaire: TemplateQuestion[];
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
    questionnaire: asArr(d.fields ?? d.questionnaire).map(normQuestion),
  };
}

export async function getDocumentTemplates(): Promise<BackendTemplate[]> {
  return listFrom(await http("/document-templates"), "templates", "items", "data").map(normTemplate);
}

// GET /admin/document-templates (2026-09-19 backend): unlike the public
// /document-templates above, this includes inactive templates too — the
// admin table should use this one, not the public list.
export type AdminTemplateFilter = { q?: string; category?: string; visibility?: string; isActive?: boolean };
export async function getAdminDocumentTemplates(f?: AdminTemplateFilter): Promise<BackendTemplate[]> {
  const qs = new URLSearchParams();
  if (f?.q) qs.set("q", f.q);
  if (f?.category) qs.set("category", f.category);
  if (f?.visibility) qs.set("visibility", f.visibility);
  if (f?.isActive != null) qs.set("is_active", String(f.isActive));
  const q = qs.toString();
  return listFrom(await http(`/admin/document-templates${q ? `?${q}` : ""}`), "templates", "items", "data").map(normTemplate);
}

// Single template incl. body (GET /document-templates/{id}). Used to prefill
// the admin edit form so the template_text can be edited too.
export async function getDocumentTemplate(id: string): Promise<BackendTemplate> {
  return normTemplate(await http(`/document-templates/${id}`));
}

// Catalog-driven document flow: a service can carry a document_template_id
// (FRONTEND_DOCUMENT_GENERATION.md "Asosiy Flow") — the client starts from
// the service card instead of the standalone template list.
export async function getServiceDocumentTemplate(serviceId: string): Promise<BackendTemplate> {
  const d = asDict(await http(`/services/${serviceId}/document-template`));
  const tpl = asDict(d.template ?? d);
  // 2026-09-20 backend: this endpoint now also returns `fields`/`field_count`
  // for a DOCX-uploaded template. The doc doesn't pin down whether they sit
  // on `template` or the envelope, so prefer whichever side actually has them.
  const fields = asArr(tpl.fields).length ? tpl.fields : d.fields;
  return normTemplate({ ...tpl, fields });
}
// GET /services/{id}/document-fields (2026-09-20 backend): a dedicated,
// authoritative fields endpoint for a DOCX-backed template — used to fill in
// any gap left by document-template above (e.g. before it's proxied fields
// through consistently for every service).
//
// 2026-09-21: the response also carries the template's own source DOCX file
// (LEXGO_SERVICE_TEMPLATE_SOURCE_FILE_API.md) — a client filling in a
// service's document can look at (or grab) the blank template itself, not
// just the live filled-in preview. `sourceFileUrl`/`sourceFileInlineUrl` are
// relative paths, fetched the same authenticated way as every other file in
// this app (see getServiceTemplateSourceFile below) — never a plain link.
// 2026-09-22 backend (LEXGO_SERVICE_DOCUMENT_ASSIST_FLOW.md): document-fields
// now also carries the template's CLEAN source file (no {{field}} markers —
// for the AI/lawyer-assisted flows below; the manual flow keeps using
// sourceFileUrl/sourceFileInlineUrl above, which ARE marked up) plus two
// optional flow descriptors. Either flow being absent (older backend, or a
// service it isn't wired for yet) is the compat gate the whole feature hinges
// on — ServiceDocumentRequest.tsx falls back to exactly the pre-existing
// manual-only UI when both are null.
export type DocAiFlow = { questionsUrl: string; generateUrl: string };
export type DocLawyerFlow = { lawyersUrl: string; requestUrl: string };
export type ServiceDocumentFields = {
  serviceId: string;
  templateId: string;
  title: string;
  fields: TemplateQuestion[];
  fieldCount: number;
  requiredCount: number;
  hasSourceFile: boolean;
  sourceFileName: string;
  sourceMimeType: string;
  sourceFileUrl: string;
  sourceFileInlineUrl: string;
  cleanSourceFileUrl: string;
  cleanSourceFileInlineUrl: string;
  aiFlow: DocAiFlow | null;
  lawyerFlow: DocLawyerFlow | null;
};
export async function getServiceDocumentFields(serviceId: string): Promise<ServiceDocumentFields> {
  const d = asDict(await http(`/services/${serviceId}/document-fields`));
  const fields = asArr(d.fields).map(normQuestion);
  const ai = d.ai_flow ? asDict(d.ai_flow) : null;
  const lawyer = d.lawyer_flow ? asDict(d.lawyer_flow) : null;
  return {
    serviceId: asStr(d.service_id, serviceId),
    templateId: asStr(d.template_id),
    title: asStr(d.title),
    fields,
    fieldCount: asNum(d.field_count, fields.length),
    requiredCount: asNum(d.required_count),
    hasSourceFile: Boolean(d.has_source_file),
    sourceFileName: asStr(d.source_file_name),
    sourceMimeType: asStr(d.source_mime_type),
    sourceFileUrl: asStr(d.source_file_url),
    sourceFileInlineUrl: asStr(d.source_file_inline_url),
    cleanSourceFileUrl: asStr(d.clean_source_file_url),
    cleanSourceFileInlineUrl: asStr(d.clean_source_file_inline_url),
    aiFlow: ai && (ai.questions_url || ai.generate_url) ? { questionsUrl: asStr(ai.questions_url), generateUrl: asStr(ai.generate_url) } : null,
    lawyerFlow: lawyer && (lawyer.lawyers_url || lawyer.request_url) ? { lawyersUrl: asStr(lawyer.lawyers_url), requestUrl: asStr(lawyer.request_url) } : null,
  };
}
// The template's source file bytes (any of sourceFileUrl/sourceFileInlineUrl/
// cleanSourceFileUrl/cleanSourceFileInlineUrl above) — fetched through the
// authed proxy like every other file, not navigated to directly (the route
// requires a bearer token; there's no signed-URL fallback for it like
// workspace files have).
export async function getServiceTemplateSourceFile(relativeUrl: string): Promise<Blob> {
  return httpBlob(relativeUrl);
}

// ── Service document assist flows (AI-drafted / lawyer-drafted) ───
// Both POST endpoints below return the same DocumentRequestOut shape the
// manual flow already produces (parsed with the same normDocRequest), so the
// result — whichever flow made it — plugs straight into the existing
// DocumentRequestPanel (answers[none]/pay/pending/done/download/contract-sign
// all just work, including its 402-not-yet-paid fallback to the pay stage).
export async function getServiceDocumentAiQuestions(
  questionsUrl: string,
  need: string,
  language: string,
): Promise<{ questions: TemplateQuestion[]; questionCount: number; generateUrl: string; note: string }> {
  const d = asDict(await http(questionsUrl, { method: "POST", body: JSON.stringify({ need, language }) }));
  const questions = asArr(d.questions).map(normQuestion);
  return {
    questions,
    questionCount: asNum(d.question_count, questions.length),
    generateUrl: asStr(d.generate_url),
    note: asStr(d.note),
  };
}
export async function generateServiceDocumentAi(
  generateUrl: string,
  input: { need: string; answers?: Record<string, unknown>; extra_instructions?: string; language?: string },
): Promise<DocumentRequest> {
  const d = asDict(await http(generateUrl, { method: "POST", body: JSON.stringify(input) }));
  return normDocRequest(d.document_request);
}

// CompactUser (backend's own name for it) — deliberately not BackendLawyer:
// this listing carries only enough to pick a candidate (name/phone/role), not
// the marketplace profile (rating, specializations, pricing) listLawyers()
// returns elsewhere.
export type DocAssistCandidate = {
  id: string;
  role: string;
  name: string;
  phone: string;
};
function normDocAssistCandidate(v: unknown): DocAssistCandidate {
  const d = asDict(v);
  const name = asStr(d.name) || [asStr(d.first_name), asStr(d.last_name)].filter(Boolean).join(" ");
  return {
    id: asStr(d.id),
    role: asStr(d.role),
    name,
    phone: asStr(d.phone),
  };
}
export async function getServiceDocumentLawyerCandidates(lawyersUrl: string): Promise<DocAssistCandidate[]> {
  return listFrom(await http(lawyersUrl), "items").map(normDocAssistCandidate);
}
// lawyer_user_id omitted → backend auto-assigns the first valid candidate for
// this service (not balanced/random — just first). Response is keyed
// "request", NOT "document_request" like the AI-generate endpoint above —
// a real inconsistency in the backend's own contract, not a typo here.
export async function requestServiceDocumentLawyer(
  requestUrl: string,
  input: { need: string; lawyer_user_id?: string; answers?: Record<string, unknown>; language?: string },
): Promise<DocumentRequest> {
  const d = asDict(await http(requestUrl, { method: "POST", body: JSON.stringify(input) }));
  return normDocRequest(d.request);
}

// ── Lawyer-side document-assist inbox (advokat/yurist/call-center) ────
// Permission model (verified against the backend): NOT role-gated to
// "lawyer" specifically — any authed user who owns the record, holds
// documents.manage, or is a call-center user can see/act on it, so this is
// mounted identically under both /portal/lawyer and /portal/advocate.
export type LawyerDocumentRequest = {
  id: string; // the lawyer_request record id — what detail/fulfill URLs key on
  need: string;
  status: string;
  clientName: string;
  createdAt: string;
  request: DocumentRequest;
};
function normLawyerDocRequest(v: unknown): LawyerDocumentRequest {
  const d = asDict(v);
  // The list/detail responses aren't pinned down as precisely as the
  // fulfill response — accept either a nested lawyer_request wrapper or a
  // flat item, whichever the endpoint actually sends.
  const lr = d.lawyer_request ? asDict(d.lawyer_request) : d;
  const reqRaw = d.request ?? d.document_request ?? d;
  const client = asDict(lr.client);
  return {
    id: asStr(lr.id ?? d.id),
    need: asStr(lr.need ?? d.need),
    status: asStr(lr.status ?? d.status),
    clientName: asStr(lr.client_name ?? client.name),
    createdAt: asStr(lr.created_at ?? d.created_at),
    request: normDocRequest(reqRaw),
  };
}
export async function listMyLawyerDocumentRequests(): Promise<LawyerDocumentRequest[]> {
  return listFrom(await http("/lawyers/me/document-requests"), "items", "data", "requests").map(normLawyerDocRequest);
}
export async function getMyLawyerDocumentRequest(recordId: string): Promise<LawyerDocumentRequest> {
  return normLawyerDocRequest(await http(`/lawyers/me/document-requests/${recordId}`));
}
export async function fulfillLawyerDocumentRequest(
  recordId: string,
  input: { content: string; notes?: string },
): Promise<DocumentRequest> {
  const d = asDict(await http(`/lawyers/me/document-requests/${recordId}/fulfill`, { method: "POST", body: JSON.stringify(input) }));
  return normDocRequest(d.request);
}
// The backend derives the questionnaire from the service's own template, so
// `questionnaire` is normally left out; it is accepted here so a caller that
// already holds the field list can send it and never depend on the echo.
export async function createServiceDocumentRequest(
  serviceId: string,
  input?: { answers?: Record<string, unknown>; title?: string; document_type?: string; questionnaire?: TemplateQuestion[] },
): Promise<DocumentRequest> {
  return normDocRequest(
    await http(`/services/${serviceId}/document-requests`, {
      method: "POST",
      body: JSON.stringify({ answers: {}, ...input }),
    }),
  );
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
  contractId?: string;
  orderId?: string;
  paymentId?: string;
  templateId: string;
  title: string;
  documentType: string;
  status: string; // questionnaire | awaiting_payment | payment_pending | file_ready
  price: number;
  currency: string;
  questionnaire: TemplateQuestion[];
  answers: Record<string, unknown>;
  contractFile?: ContractFile;
  paymentUrl?: string; // provider checkout link returned by the pay call
  createdAt: string;
};

function normDocRequest(v: unknown): DocumentRequest {
  const d = asDict(v);
  const cf = d.contract_file ? asDict(d.contract_file) : null;
  const pay = asDict(d.payment);
  return {
    id: asStr(d.id),
    contractId: asStr(d.contract_id) || undefined,
    orderId: asStr(d.order_id) || undefined,
    paymentId: asStr(d.payment_id) || undefined,
    templateId: asStr(d.template_id ?? d.templateId),
    title: asStr(d.title),
    documentType: asStr(d.document_type ?? d.documentType),
    status: asStr(d.status),
    price: uzs(d, "price"),
    currency: asStr(d.currency, "UZS"),
    // `fields` is what every other document endpoint calls this array.
    questionnaire: asArr(asArr(d.questionnaire).length ? d.questionnaire : d.fields).map(normQuestion),
    answers: (d.answers as Record<string, unknown>) ?? {},
    createdAt: asStr(d.created_at),
    contractFile: cf
      ? {
          id: asStr(cf.id),
          fileName: asStr(cf.file_name),
          mimeType: asStr(cf.mime_type) || mimeFromName(asStr(cf.file_name)),
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
  questionnaire?: TemplateQuestion[];
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
      body: JSON.stringify({ provider, amount: Math.round(amount), currency: "UZS", provider_payload: {} }),
    }),
  );
}
export async function getDocumentRequest(requestId: string): Promise<DocumentRequest> {
  return normDocRequest(await http(`/document-requests/${requestId}`));
}

// Real-time preview: the backend fills {{placeholder}}s with the given
// (possibly incomplete) answers so the client sees the document taking shape
// before generating it. Called debounced (300-500ms) on every answer change.
export type DocumentPreview = {
  previewText: string;
  missingRequiredFields: { name: string; key: string; label: string }[];
  canGenerate: boolean;
  completionPercent: number;
};
export async function previewDocumentRequest(
  requestId: string,
  answers: Record<string, unknown>,
): Promise<DocumentPreview> {
  const d = asDict(await http(`/document-requests/${requestId}/preview`, { method: "POST", body: JSON.stringify({ answers }) }));
  return {
    previewText: asStr(d.preview_text ?? d.final_text),
    missingRequiredFields: asArr(d.missing_required_fields).map((x) => {
      const y = asDict(x);
      return { name: asStr(y.name), key: asStr(y.key ?? y.name), label: asStr(y.label) };
    }),
    canGenerate: Boolean(d.can_generate),
    completionPercent: typeof d.completion_percent === "number" ? d.completion_percent : 0,
  };
}

// Unlock rules for a document request's file (GET …/unlock-policy). A client
// can generate and download only after the payment is confirmed; staff always
// can. `formats` is whatever the backend can render for this template — a
// template's source file decides that, not the frontend.
export type DocUnlockPolicy = {
  status: string;
  paid: boolean;
  requiresPayment: boolean;
  amount: number;
  currency: string;
  paymentId?: string;
  canGenerate: boolean;
  formats: string[];
};
export async function getDocumentUnlockPolicy(requestId: string): Promise<DocUnlockPolicy> {
  const d = asDict(await http(`/document-requests/${requestId}/unlock-policy`));
  return {
    status: asStr(d.status),
    paid: Boolean(d.paid),
    requiresPayment: d.requires_payment == null ? !d.paid : Boolean(d.requires_payment),
    amount: uzs(d, "amount"),
    currency: asStr(d.currency, "UZS"),
    paymentId: asStr(d.payment_id) || undefined,
    canGenerate: Boolean(d.can_generate),
    formats: asArr(d.formats).map((f) => asStr(f).toLowerCase()).filter(Boolean),
  };
}
// Fill the template with the saved answers and build the file (402 = not paid yet).
export async function generateDocumentRequest(requestId: string): Promise<DocumentRequest> {
  return normDocRequest(await http(`/document-requests/${requestId}/generate`, { method: "POST" }));
}
// The generated file itself (an attachment, not a link) — PDF or DOCX depending
// on the template; don't restrict Accept to one format. 402 = not paid, 409 = not generated yet.
export async function getDocumentRequestFile(requestId: string): Promise<Blob> {
  return httpBlob(`/document-requests/${requestId}/file`);
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
  details: Record<string, unknown>; // raw details (PATCH replaces them, so callers merge)
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
    details: det as Record<string, unknown>,
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
      details: { name: input.name, phone: input.phone, note: input.note ?? "", ...attributionDetails() },
    }),
  });
}
// `?region=&source=&assigned_operator_user_id=&date_from=&date_to=` (2026-09-19
// backend server-side filters on GET /admin/leads).
export type LeadListFilter = { region?: string; source?: string; assignedOperatorUserId?: string; from?: string; to?: string };
function leadListQuery(f?: LeadListFilter): string {
  if (!f) return "";
  const qs = new URLSearchParams();
  if (f.region) qs.set("region", f.region);
  if (f.source) qs.set("source", f.source);
  if (f.assignedOperatorUserId) qs.set("assigned_operator_user_id", f.assignedOperatorUserId);
  if (f.from) qs.set("date_from", f.from);
  if (f.to) qs.set("date_to", f.to);
  const q = qs.toString();
  return q ? `?${q}` : "";
}
export async function listLeads(f?: LeadListFilter): Promise<Lead[]> {
  return listFrom(await http(`/admin/leads${leadListQuery(f)}`), "leads", "items", "data").map(normLead);
}
// Admin manual lead management. `assignedOperatorUserId` omitted → the
// backend auto-assigns to its least-loaded active call_center/sales operator
// (2026-09-19 update); passed → that operator, picked by the admin instead.
export async function adminCreateLead(input: {
  name?: string;
  phone?: string;
  note?: string;
  source?: string;
  category?: string;
  region?: string;
  urgency?: string;
  assignedOperatorUserId?: string;
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
        ...(input.assignedOperatorUserId ? { assigned_operator_user_id: input.assignedOperatorUserId } : {}),
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
  return normKanban(await http("/admin/leads/kanban"));
}
function normKanban(data: unknown): KanbanColumn[] {
  const cols = listFrom(data, "columns", "items", "data");
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

// ── Order milestones (T1A-01) ─────────────────────────────────────
// GET /orders/{id}/milestones — client, the order's seller, or orders/payments staff.
export type OrderMilestone = {
  id: string;
  orderId: string;
  index: number;
  title: string;
  percent: number;
  amount: number; // whole so'm
  currency: string;
  status: string; // pending | payment_pending | paid | held | released | …
  paymentId?: string;
  releasedAt?: string;
};
function normMilestone(v: unknown): OrderMilestone {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    orderId: asStr(d.order_id),
    index: asNum(d.index),
    title: asStr(d.title),
    percent: asNum(d.percent),
    amount: uzs(d, "amount"),
    currency: asStr(d.currency, "UZS"),
    status: asStr(d.status, "pending"),
    paymentId: asStr(d.payment_id) || undefined,
    releasedAt: asStr(d.released_at) || undefined,
  };
}
export async function listOrderMilestones(orderId: string): Promise<OrderMilestone[]> {
  return listFrom(await http(`/orders/${orderId}/milestones`), "items", "data", "milestones")
    .map(normMilestone)
    .sort((a, b) => a.index - b.index);
}
// Pay one milestone: returns the checkout link (provider as a query param).
export async function payOrderMilestone(
  orderId: string,
  milestoneId: string,
  provider: string = CHECKOUT_PROVIDER,
): Promise<{ milestone: OrderMilestone; paymentId?: string; paymentUrl?: string; status: string }> {
  const d = asDict(
    await http(`/orders/${orderId}/milestones/${milestoneId}/pay?provider=${encodeURIComponent(provider)}`, { method: "POST" }),
  );
  const pay = asDict(d.payment);
  return {
    milestone: normMilestone(d.milestone),
    paymentId: asStr(pay.id) || undefined,
    paymentUrl: safePaymentUrl(pay.payment_url) || undefined,
    status: asStr(pay.status),
  };
}
// Release a paid/held milestone to the seller (the client confirms the work). 409 = not paid yet.
export async function releaseOrderMilestone(orderId: string, milestoneId: string): Promise<OrderMilestone> {
  const d = asDict(await http(`/orders/${orderId}/milestones/${milestoneId}/release`, { method: "POST" }));
  return normMilestone(d.milestone ?? d);
}

// ── Contracts: file and OTP signature (T1-13) ─────────────────────
export type ContractInfo = { id: string; type: string; status: string; fileName: string; signed: boolean; signedAt?: string; verifyUrl?: string };
export async function getContract(contractId: string): Promise<ContractInfo> {
  const d = asDict(await http(`/contracts/${contractId}`));
  const data = asDict(d.data);
  const sig = asDict(data.signature);
  const signedAt = asStr(data.signed_at ?? sig.signed_at);
  return {
    id: asStr(d.id),
    type: asStr(d.contract_type),
    status: asStr(d.status),
    fileName: asStr(d.file_name),
    signed: asStr(d.status) === "signed" || Boolean(signedAt),
    signedAt: signedAt || undefined,
    verifyUrl: asStr(data.verify_url ?? sig.verify_url) || undefined,
  };
}
export type ContractRow = { id: string; type: string; status: string; fileName: string; hasFile: boolean; createdAt: string };
export async function listContracts(): Promise<ContractRow[]> {
  return listFrom(await http("/contracts"), "items", "data", "contracts").map((x) => {
    const d = asDict(x);
    return {
      id: asStr(d.id),
      type: asStr(d.contract_type),
      status: asStr(d.status),
      fileName: asStr(d.file_name),
      hasFile: Boolean(d.inline_url || d.download_url),
      createdAt: asStr(d.created_at),
    };
  });
}
// The contract file itself (GET /contracts/{id}/file, PDF or DOCX), fetched
// with the bearer token.
export async function getContractFile(contractId: string): Promise<Blob> {
  return httpBlob(`/contracts/${contractId}/file`);
}
export async function startContractSignature(contractId: string): Promise<OtpChallenge> {
  return normOtp(await http(`/contracts/${contractId}/signature/start`, { method: "POST" }));
}
export type ContractSignature = { status: string; signatureHash: string; verifyUrl: string; signedAt: string };
export async function verifyContractSignature(contractId: string, verificationId: string, code: string): Promise<ContractSignature> {
  const d = asDict(
    await http(`/contracts/${contractId}/signature/verify`, { method: "POST", body: JSON.stringify({ verification_id: verificationId, code }) }),
  );
  return {
    status: asStr(d.status),
    signatureHash: asStr(d.signature_hash),
    // Backend-relative public check (GET /contracts/{id}/verify?hash=…), served through the proxy.
    verifyUrl: asStr(d.verify_url) ? absUrl(asStr(d.verify_url)) : "",
    signedAt: asStr(d.signed_at),
  };
}

// ── Matching candidates (T1-09) ───────────────────────────────────
// Verified sellers ranked by score for a service (GET /matching/candidates).
export type MatchCandidate = {
  lawyerUserId: string;
  publicId: string;
  name: string;
  sellerType: string;
  region: string;
  rating: number;
  reviewsCount: number;
  experienceYears: number;
  totalCases: number;
  successRate: number;
  workload: number;
  score: number;
  reasons: string[];
};
export async function getMatchingCandidates(params: { serviceId?: string; region?: string; urgency?: "normal" | "urgent" }): Promise<MatchCandidate[]> {
  const q = new URLSearchParams();
  if (params.serviceId) q.set("service_id", params.serviceId);
  if (params.region) q.set("region", params.region);
  q.set("urgency", params.urgency ?? "normal");
  return listFrom(await http(`/matching/candidates?${q}`), "items", "data", "candidates").map((x) => {
    const d = asDict(x);
    return {
      lawyerUserId: asStr(d.lawyer_user_id),
      publicId: asStr(d.public_id),
      name: asStr(d.name),
      sellerType: asStr(d.seller_type),
      region: asStr(d.region),
      rating: asNum(d.rating),
      reviewsCount: asNum(d.reviews_count),
      experienceYears: asNum(d.total_experience_years ?? d.experience_years),
      totalCases: asNum(d.total_cases),
      successRate: asNum(d.success_rate),
      workload: asNum(d.workload),
      score: asNum(d.score),
      reasons: asArr(d.reasons).map((r) => asStr(r)).filter(Boolean),
    };
  });
}

// ── Call-center queue and lead board (T1-12, T1A-05) ──────────────
// GET /call-center/queue (callcenter.access): leads and unassigned orders,
// SLA-breached first, then hot, then oldest.
export type QueueItem = {
  id: string;
  type: "lead" | "order" | string;
  title: string;
  status: string;
  score: string;
  urgency: string;
  region: string;
  clientUserId?: string;
  slaMinutes: number;
  ageMinutes: number;
  slaBreached: boolean;
  recommendedSellerUserId?: string;
  recommendedSellerLoad?: number;
  createdAt: string;
};
export async function getCallCenterQueue(status?: string): Promise<QueueItem[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return listFrom(await http(`/call-center/queue${qs}`), "items", "data", "queue").map((x) => {
    const d = asDict(x);
    return {
      id: asStr(d.id),
      type: asStr(d.type),
      title: asStr(d.title),
      status: asStr(d.status),
      score: asStr(d.score),
      urgency: asStr(d.urgency),
      region: asStr(d.region),
      clientUserId: asStr(d.client_user_id) || undefined,
      slaMinutes: asNum(d.sla_minutes, 60),
      ageMinutes: asNum(d.age_minutes),
      slaBreached: Boolean(d.sla_breached),
      recommendedSellerUserId: asStr(d.recommended_seller_user_id) || undefined,
      recommendedSellerLoad: d.recommended_seller_load == null ? undefined : asNum(d.recommended_seller_load),
      createdAt: asStr(d.created_at),
    };
  });
}
// Hand an unassigned order to the next ranked seller (orders.manage).
export async function assignNextSeller(orderId: string): Promise<void> {
  await http(`/matching/orders/${orderId}/assign-next`, { method: "POST" });
}
// Call-center variant of the lead kanban (same shape as the admin board).
export async function getCallCenterKanban(): Promise<KanbanColumn[]> {
  return normKanban(await http("/call-center/leads/kanban"));
}
export async function moveCallCenterLead(leadId: string, columnKey: string, position = 0): Promise<void> {
  await http(`/call-center/leads/${leadId}/move`, { method: "PATCH", body: JSON.stringify({ column_key: columnKey, position }) });
}

// ── Lawyer replacement history (T1A-04) ───────────────────────────
// Clients can't list replacement requests (replacements.manage), but the owner
// can read one request's history.
export type ReplacementEvent = { id: string; status: string; title: string; note: string; createdAt: string };
export async function listMyReplacementRequests(): Promise<ModuleRecord[]> {
  return listModule("/replacement-requests/me");
}
export async function getReplacementHistory(replacementId: string): Promise<ReplacementEvent[]> {
  return listFrom(await http(`/replacement-requests/${replacementId}/history`), "items", "data").map((x) => {
    const d = asDict(x);
    const pl = asDict(d.payload);
    return {
      id: asStr(d.id),
      status: asStr(d.status ?? pl.status),
      title: asStr(d.title),
      note: asStr(pl.note ?? pl.reason ?? pl.comment),
      createdAt: asStr(d.created_at),
    };
  });
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
  ownerUserId: string;
};
function normModule(v: unknown): ModuleRecord {
  const d = asDict(v);
  return {
    ownerUserId: asStr(d.owner_user_id),
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
// T3-10: anomaly alerts (module security_event) — needs users.manage.
export function listAdminSecurityEvents(status?: string): Promise<ModuleRecord[]> {
  return listModule(`/admin/security-events${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}
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
// PATCH/DELETE /ads/products/{id} (2026-09-19 backend). Delete is a soft
// delete (status → "deleted"); edit is a plain partial patch.
export type AdUpdateInput = Partial<{ record_type: string; title: string; status: string; price: number; currency: string; payload: Record<string, unknown> }>;
export async function updateAd(id: string, input: AdUpdateInput): Promise<ModuleRecord> {
  return normModule(await http(`/ads/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }));
}
export async function deleteAd(id: string): Promise<void> {
  await http(`/ads/products/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export const listCaseDocuments = () => listModule("/case-documents");
export const createCaseDocument = (i: ModuleInput) => createModule("/case-documents", i);
export const listLegalAid = () => listModule("/legal-aid/requests");
// GET /legal-aid/requests/{id} (2026-09-19 backend): the admin list above has
// no working detail view today — this is what "open" should call.
export type LegalAidDetail = {
  request: ModuleRecord;
  source: string;
  event: string;
  createdByUserId: string;
  createdByName: string;
  explanation: string;
};
export async function getLegalAidRequestDetail(id: string): Promise<LegalAidDetail> {
  const d = asDict(await http(`/legal-aid/requests/${encodeURIComponent(id)}`));
  const createdBy = asDict(d.created_by);
  return {
    request: normModule(d.request ?? d),
    source: asStr(d.source),
    event: asStr(d.event),
    createdByUserId: asStr(d.created_by_user_id ?? createdBy.id),
    createdByName: asStr(createdBy.name),
    explanation: asStr(d.explanation),
  };
}
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
export const DECLINE_REASONS = ["conflict_of_interest", "not_my_specialization", "busy", "region_far", "price_mismatch", "documents_insufficient", "prior_dispute", "sick_or_vacation", "other"] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];
// T2-10: the reason list (S-20) goes in the body; "other" carries a note.
export async function declineOrder(orderId: string, reason?: DeclineReason, note?: string): Promise<{ id: string; status: string }> {
  const d = asDict(await http(`/orders/${orderId}/decline`, { method: "POST", body: JSON.stringify(reason ? { reason, note: note || undefined } : {}) }));
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
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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

// Seller onboarding checklist (GET /seller-onboarding/progress), the same shape
// for advocates and lawyers: profile, identity, documents, services, pricing.
export type OnboardingStep = { key: string; title: string; required: boolean; completed: boolean };
export type OnboardingProgress = { status: string; completedCount: number; totalCount: number; steps: OnboardingStep[] };
// PDF/JPG/PNG up to 15 MB (POST /seller-onboarding/documents, multipart).
// T1B-09 template constructor: DOCX → fields; ZIP → many templates (draft, inactive); preview.
export type TemplateField = { key: string; label: string; type: string; required: boolean };
export async function importTemplateDocx(input: { file: File; slug: string; title: string; category: string; language: string; visibility: string; price: number }): Promise<BackendTemplate> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("slug", input.slug);
  form.append("title", input.title);
  form.append("category", input.category);
  form.append("language", input.language);
  form.append("visibility", input.visibility);
  form.append("price", String(input.price || 0));
  return normTemplate(await http("/admin/document-templates/import-docx", { method: "POST", body: form }));
}
export async function importTemplatesZip(input: { file: File; category: string; language: string; visibility: string }): Promise<{ created: number; titles: string[] }> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("category", input.category);
  form.append("language", input.language);
  form.append("visibility", input.visibility);
  const d = asDict(await http("/admin/document-templates/import-zip", { method: "POST", body: form }));
  const created = asArr(d.created ?? d.items ?? d.templates);
  return { created: asNum(d.count) || created.length, titles: created.map((x) => asStr(asDict(x).title ?? asDict(x).slug ?? x)) };
}
export async function previewTemplate(input: { templateId?: string; templateText?: string; answers?: Record<string, string> }): Promise<{ fields: TemplateField[]; previewText: string }> {
  const d = asDict(await http("/admin/document-templates/preview", { method: "POST", body: JSON.stringify({ template_id: input.templateId, template_text: input.templateText, answers: input.answers }) }));
  return {
    fields: asArr(d.fields).map((f) => { const r = asDict(f); return { key: asStr(r.key ?? r.name), label: asStr(r.label ?? r.key), type: asStr(r.type, "text"), required: r.required !== false }; }),
    previewText: asStr(d.preview_text ?? d.preview),
  };
}
export async function uploadOnboardingDocument(file: File, documentType = "qualification"): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("document_type", documentType);
  await http("/seller-onboarding/documents", { method: "POST", body: form });
}
// Sends a complete onboarding to moderation (422 while steps are missing; repeat calls return the open submission).
export async function submitOnboarding(): Promise<{ status: string }> {
  const d = asDict(await http("/seller-onboarding/submit", { method: "POST" }));
  return { status: asStr(d.status, "submitted") };
}
export async function getSellerOnboardingProgress(): Promise<OnboardingProgress> {
  const d = asDict(await http("/seller-onboarding/progress"));
  const steps = asArr(d.steps).map((x) => {
    const r = asDict(x);
    return { key: asStr(r.key), title: asStr(r.title), required: r.required !== false, completed: Boolean(r.completed) };
  });
  return {
    status: asStr(d.status),
    completedCount: d.completed_count == null ? steps.filter((x) => x.completed).length : asNum(d.completed_count),
    totalCount: d.total_count == null ? steps.length : asNum(d.total_count),
    steps,
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
// T1B-05: a client outside LexGo, kept in the seller's own base (used by the
// conflict check together with real orders/cases).
export type LawyerClientInput = { name: string; phone?: string; pinfl?: string; company?: string; opponents?: string[]; representatives?: string[]; notes?: string };
export async function createLawyerClient(input: LawyerClientInput): Promise<void> {
  await http("/lawyers/me/clients", { method: "POST", body: JSON.stringify(input) });
}
export type ConflictMatch = { caseId?: string; caseNumber?: string; clientRecordId?: string; title: string; reason: string };
export type ConflictResult = { status: "clear" | "potential_conflict"; matches: ConflictMatch[] };
export async function checkConflict(input: { phone?: string; pinfl?: string; opponent?: string; representatives?: string[]; clientUserId?: string }): Promise<ConflictResult> {
  const d = asDict(await http("/conflicts/check", { method: "POST", body: JSON.stringify({ phone: input.phone || undefined, pinfl: input.pinfl || undefined, opponent: input.opponent || undefined, representatives: input.representatives ?? [], client_user_id: input.clientUserId || undefined }) }));
  return {
    status: asStr(d.status) === "potential_conflict" ? "potential_conflict" : "clear",
    matches: asArr(d.matches).map((m) => { const r = asDict(m); return { caseId: asStr(r.case_id) || undefined, caseNumber: asStr(r.case_number) || undefined, clientRecordId: asStr(r.client_record_id) || undefined, title: asStr(r.title), reason: asStr(r.reason) }; }),
  };
}
// T1B-06: AI tools over one case's own materials (PII masked on the backend).
export type CaseAiTool = "summary" | "chronology" | "missing_docs" | "questions" | "compare_versions";
export async function runCaseAiTool(caseId: string, tool: CaseAiTool, fileVersionIds: string[] = []): Promise<{ id: string; result: string }> {
  const d = asDict(await http(`/ai/cases/${encodeURIComponent(caseId)}/tools`, { method: "POST", body: JSON.stringify({ tool, file_version_ids: fileVersionIds }) }));
  return { id: asStr(d.id), result: asStr(d.result) };
}
// GET /lawyers/me/clients/{id} — everything this seller shares with one
// client (own orders/cases/chats + their payments/documents); 404 when the
// client never worked with this seller.
export type LawyerClientDetail = {
  type: "user" | "manual";
  client: { id: string; name: string; phone: string; region: string; company: string; notes: string; createdAt: string };
  cases: BackendCase[];
  orders: BackendOrder[];
  chats: { id: string; status: string; orderId?: string; caseId?: string; createdAt: string }[];
  payments: PaymentHistory[];
  documents: DocumentRequest[];
  timeline: { type: string; id: string; title: string; status: string; createdAt: string; updatedAt: string }[];
};
export async function getLawyerClientDetail(id: string): Promise<LawyerClientDetail> {
  const d = asDict(await http(`/lawyers/me/clients/${encodeURIComponent(id)}`));
  const c = asDict(d.client);
  return {
    type: asStr(d.type) === "manual" ? "manual" : "user",
    client: { id: asStr(c.id), name: asStr(c.name), phone: asStr(c.phone), region: asStr(c.region), company: asStr(c.company), notes: asStr(c.notes), createdAt: asStr(c.created_at) },
    cases: asArr(d.cases).map(normCase),
    orders: asArr(d.orders).map(normOrder),
    chats: asArr(d.chats).map((x) => { const r = asDict(x); return { id: asStr(r.id), status: asStr(r.status), orderId: asStr(r.order_id) || undefined, caseId: asStr(r.case_id) || undefined, createdAt: asStr(r.created_at) }; }),
    payments: asArr(d.payments).map(normPaymentHistory),
    documents: asArr(d.documents).map(normDocRequest),
    timeline: asArr(d.timeline).map((x) => { const r = asDict(x); return { type: asStr(r.type), id: asStr(r.id), title: asStr(r.title), status: asStr(r.status), createdAt: asStr(r.created_at), updatedAt: asStr(r.updated_at) }; }),
  };
}
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
// T1B-04: procedural deadline from a base date (appeal = 1 month, document =
// 10 days, complaint = 30 days, general = 7 days on the backend); optionally
// creates the calendar event with a 1-day reminder.
export type DeadlineKind = "appeal" | "document" | "complaint" | "general";
export type DeadlineResult = { kind: string; baseDate: string; deadline: string; event: CalendarEvent | null };
export async function calculateDeadline(input: { kind: DeadlineKind; baseDate: string; createEvent?: boolean; title?: string; caseId?: string }): Promise<DeadlineResult> {
  const d = asDict(await http("/calendar/deadline-calculator", { method: "POST", body: JSON.stringify({ kind: input.kind, base_date: input.baseDate, create_event: !!input.createEvent, title: input.title || undefined, case_id: input.caseId || undefined }) }));
  return { kind: asStr(d.kind), baseDate: asStr(d.base_date), deadline: asStr(d.deadline), event: d.event ? normEvent(d.event) : null };
}
// GET /calendar-events/{id}/ical → .ics file for the user's own calendar app.
export async function downloadEventIcal(eventId: string): Promise<Blob> {
  return httpBlob(`/calendar-events/${encodeURIComponent(eventId)}/ical`);
}
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
  holidays: string[]; // YYYY-MM-DD public holidays (T0-20)
};
// T0-20 admin: holidays (POST/DELETE /admin/calendar/holidays, cases.manage) and
// a time simulation — GET /calendar/business-hours?at=<iso> answers for that
// moment, so the tester can check evening / Sunday / holiday deadlines without
// touching the server clock.
export type BusinessSim = { at: string; isWorkingDay: boolean; isWorkingTime: boolean; nextWorkStart: string; deadline30: string; holidays: string[] };
export async function simulateBusinessHours(atIso: string): Promise<BusinessSim> {
  const d = asDict(await http(`/calendar/business-hours?at=${encodeURIComponent(atIso)}`));
  const cur = asDict(d.current);
  return {
    at: atIso,
    isWorkingDay: cur.is_working_day === true,
    isWorkingTime: cur.is_business_hours === true || (cur.is_working_day === true && cur.is_working_time === true),
    nextWorkStart: asStr(cur.next_work_start),
    deadline30: asStr(d.confirmation_deadline_30m),
    holidays: asArr(d.holidays).map((x) => asStr(x)),
  };
}
export async function addBusinessHoliday(day: string, title: string): Promise<void> {
  await http("/admin/calendar/holidays", { method: "POST", body: JSON.stringify({ day, title }) });
}
export async function removeBusinessHoliday(day: string): Promise<void> {
  await http(`/admin/calendar/holidays/${encodeURIComponent(day)}`, { method: "DELETE" });
}
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "Asia/Tashkent",
  days: [1, 2, 3, 4, 5, 6],
  start: "09:00",
  end: "19:00",
  isWorkingDay: null,
  isWorkingTime: null,
  serverNow: null,
  fetchedAt: 0,
  holidays: [],
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
      pick("is_business_hours", "is_working_hours", "is_open", "open_now", "within_business_hours", "is_working_time", "working_time") ??
      (statusStr === "open" ? true : statusStr === "closed" ? false : null),
    serverNow: Number.isFinite(ms) ? ms : null,
    fetchedAt,
    holidays: asArr(d.holidays).map((h) => { const x = asDict(h); return asStr(typeof h === "string" ? h : x.date ?? x.day); }).filter((x) => /^\d{4}-\d{2}-\d{2}/.test(x)).map((x) => x.slice(0, 10)),
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
  subscription?: MySubscription;
};
function normClientProfile(v: unknown): ClientProfile {
  const d = asDict(v);
  return {
    name: asStr(d.name),
    phone: asStr(d.phone),
    email: asStr(d.email),
    avatarUrl: asStr(d.avatar_url),
    subscription: normMySubscription(d.subscription) ?? undefined,
  };
}
export async function getClientProfile(): Promise<ClientProfile> {
  return normClientProfile(await http("/clients/me"));
}

// ── My subscription / auto-renew ──────────────────────────────────
// The active subscription is embedded in /clients/me — there is no separate
// GET for it. Its own `id` (not the plan's id) is what
// PATCH /subscriptions/{subscription_id}/auto-renew (2026-09-19 backend
// update) takes; the earlier speculative PATCH /clients/me/subscription this
// replaced never shipped (confirmed 404 in production).
export type MySubscription = {
  id: string;
  planName: string;
  planId: string;
  status: string;
  renewsAt?: string;
  // undefined = /clients/me reported no auto-renew flag for this subscription.
  autoRenew?: boolean;
  provider: string; // "" when the backend does not say
};
function normMySubscription(v: unknown): MySubscription | null {
  const d = asDict(v);
  const planName = asStr(d.plan_name ?? d.plan_title ?? asDict(d.plan).title ?? asDict(d.plan).name);
  const planId = asStr(d.plan_id ?? asDict(d.plan).id);
  const id = asStr(d.id ?? d.subscription_id);
  if (!planName && !planId && !id) return null;
  const ar = d.auto_renew ?? d.autopay ?? d.auto_pay;
  return {
    id,
    planName,
    planId,
    status: asStr(d.status, "active"),
    renewsAt: asStr(d.renews_at ?? d.ends_at ?? d.next_charge_at) || undefined,
    autoRenew: typeof ar === "boolean" ? ar : undefined,
    provider: asStr(d.provider ?? d.payment_provider),
  };
}
export async function getMySubscription(): Promise<MySubscription | null> {
  return (await getClientProfile()).subscription ?? null;
}
export async function updateSubscriptionAutoRenew(
  subscriptionId: string,
  patch: { auto_renew: boolean; payment_method_id?: string | null; provider_customer_id?: string | null },
): Promise<{ id: string; autoRenew: boolean }> {
  const d = asDict(
    await http(`/subscriptions/${encodeURIComponent(subscriptionId)}/auto-renew`, { method: "PATCH", body: JSON.stringify(patch) }),
  );
  return { id: asStr(d.id), autoRenew: Boolean(d.auto_renew) };
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
export async function identityStart(provider: IdentityProvider, purpose = "profile_verification"): Promise<IdentityStart> {
  // redirect_uri brings the user back to the page that started the check.
  const redirect_uri = typeof window === "undefined" ? "" : window.location.href.split("#")[0];
  const d = asDict(await http("/identity/start", { method: "POST", body: JSON.stringify({ provider, redirect_uri, purpose }) }));
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
export async function identityVerifyDemo(provider: IdentityProvider, state: string, code: string): Promise<IdentityStatus> {
  // Backend expects `code` (typed by the user), not `demo_code`, and looks the
  // session up by provider (it defaults to oneid, so MyID must be sent).
  return normIdentity(await http("/identity/verify-demo", { method: "POST", body: JSON.stringify({ provider, state, code }) }));
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
  // Human wording from the backend (LEXGO_FRONTEND_BUGFIX_UPDATE_2026_09_17 §7).
  titleUz?: string;
  descriptionUz?: string;
  ip?: string;
  createdAt: string;
  // Append-only audit chain (GET /admin/audit-trail): this record's hash and
  // the hash of the record before it. Absent on other activity feeds and on
  // records written before the chain existed.
  previousHash?: string;
  eventHash?: string;
  userId?: string;
  targetType?: string;
  targetId?: string;
  outcome?: string;
  meta?: Record<string, unknown>;
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
    titleUz: asStr(d.title_uz) || undefined,
    descriptionUz: asStr(d.description_uz) || undefined,
    ip: asStr(d.ip ?? d.ip_address) || undefined,
    createdAt: asStr(d.created_at ?? d.createdAt ?? d.timestamp),
    previousHash: hashOf(d.previous_hash, d.prev_hash, d.previousHash, chain.previous_hash),
    eventHash: hashOf(d.event_hash, d.hash, d.eventHash, chain.event_hash),
    userId: asStr(d.user_id) || undefined,
    targetType: asStr(d.target_type) || undefined,
    targetId: asStr(d.target_id) || undefined,
    outcome: asStr(d.outcome) || undefined,
    meta: d.meta && typeof d.meta === "object" && !Array.isArray(d.meta) ? (d.meta as Record<string, unknown>) : undefined,
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
  registerUrl: string; // …/register?ref=CODE
  landingUrl: string; // /?ref=CODE
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
export async function getMyReferral(): Promise<Referral & { qrUrl: string }> {
  const d = asDict(await http("/referrals/me"));
  return {
    code: asStr(d.code),
    link: asStr(d.link ?? d.register_url ?? d.share_url),
    registerUrl: asStr(d.register_url ?? d.link),
    landingUrl: asStr(d.landing_url),
    qrUrl: asStr(d.qr_url),
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
      const pl = asDict(r.payload);
      return {
        name: asStr(r.name ?? pl.name ?? pl.invitee_name ?? pl.referred_name ?? r.title),
        phone: asStr(r.phone ?? pl.phone ?? pl.invitee_phone),
        status: asStr(r.status, "invited"),
        reward: uzs(r, "reward") || uzs(pl, "reward", "reward_amount") || uzs(r, "price"),
        joinedAt: asStr(r.joined_at ?? pl.joined_at ?? r.created_at),
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
// Backend statuses: todo · doing · review · blocked · done (deleted = hidden).
export type TaskCheckItem = { text: string; done: boolean };
export type WorkTask = { id: string; title: string; status: string; priority: string; dueDate?: string; caseId?: string; caseTitle?: string; description?: string; checklist?: TaskCheckItem[]; createdAt?: string; updatedAt?: string };
function normTask(v: unknown): WorkTask {
  const d = asDict(v);
  const p = asDict(d.payload);
  const checklist = (Array.isArray(d.checklist) ? d.checklist : Array.isArray(p.checklist) ? p.checklist : [])
    .map((c: unknown) => {
      if (typeof c === "string") return { text: c, done: false };
      const x = asDict(c);
      return { text: asStr(x.text ?? x.title ?? x.label), done: !!(x.done ?? x.checked ?? x.completed) };
    })
    .filter((c: TaskCheckItem) => c.text);
  return {
    id: asStr(d.id),
    title: asStr(d.title ?? d.name),
    status: asStr(d.status, "todo"),
    priority: asStr(d.priority ?? p.priority, "medium"),
    dueDate: asStr(d.due_date ?? d.deadline ?? p.due_date) || undefined,
    caseId: asStr(d.case_id ?? p.case_id) || undefined,
    caseTitle: asStr(d.case_title ?? d.case ?? p.case_title) || undefined,
    description: asStr(d.description ?? p.description) || undefined,
    checklist,
    createdAt: asStr(d.created_at) || undefined,
    updatedAt: asStr(d.updated_at) || undefined,
  };
}
export type TaskInput = { title?: string; status?: string; priority?: string; due_date?: string; case_id?: string; case_title?: string; checklist?: TaskCheckItem[]; description?: string };
// PATCH /tasks/{id} — partial update (title, status, priority, due_date, case, checklist, description).
export async function updateTask(id: string, input: TaskInput): Promise<WorkTask> {
  return normTask(await http(`/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }));
}
export async function listMyTasks(): Promise<WorkTask[]> {
  return listFrom(await http("/tasks/me"), "items", "data", "tasks").map(normTask);
}
export async function updateTaskStatus(id: string, status: string): Promise<WorkTask> {
  return normTask(await http(`/tasks/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }));
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
  channels: { name: string; leads: number; pct: number; payments: number; revenue: number }[];
  cacClient: number; cacAdvocate: number; paidPayments: number;
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
  const pair = (x: unknown) => { const r = asDict(x); return { label: asStr(r.stage ?? r.label ?? r.name ?? r.date), value: asNum(r.value ?? r.count) }; };
  // cac may be a number or an object { total, client, advocate }.
  const cacRaw = d.cac;
  const cac = typeof cacRaw === "object" && cacRaw ? uzs(asDict(cacRaw), "total") : uzs(d, "cac");
  // Revenue trend values are so'm amounts, unlike the funnel counts read by pair.
  const moneyPair = (x: unknown) => { const r = asDict(x); return { label: asStr(r.date ?? r.label ?? r.name), value: uzs(r, "revenue", "value", "count") }; };
  const cacObj = typeof cacRaw === "object" && cacRaw ? asDict(cacRaw) : {};
  return {
    revenue: uzs(d, "revenue"), revenueDeltaPct: asNum(d.revenue_delta_pct), mrr: uzs(d, "mrr"),
    users: asNum(d.users ?? d.total_users), activeUsers: asNum(d.active_users), conversionPct: asNum(d.conversion_pct),
    funnel: asArr(d.funnel).map(pair),
    channels: asArr(d.channels ?? d.attribution).map((x) => {
      const r = asDict(x);
      return { name: asStr(r.source ?? r.name ?? r.channel), leads: asNum(r.leads ?? r.count), pct: asNum(r.conversion_pct ?? r.pct ?? r.share), payments: asNum(r.payments), revenue: uzs(r, "revenue") };
    }),
    cacClient: uzs(cacObj, "client"), cacAdvocate: uzs(cacObj, "advocate"), paidPayments: asNum(d.paid_payments),
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
// Official legal sources the AI answers from (GET /ai/legal-corpus; /ai/classify inlines them too).
export type LegalSource = { key: string; title: string; url: string; trustLevel: string };
function normLegalSource(v: unknown): LegalSource {
  const d = asDict(v);
  return { key: asStr(d.key), title: asStr(d.title ?? d.name), url: asStr(d.url), trustLevel: asStr(d.trust_level) };
}
export async function getLegalCorpus(): Promise<LegalSource[]> {
  return listFrom(await http("/ai/legal-corpus"), "items", "data", "sources").map(normLegalSource).filter((x) => x.title);
}

// One of up to three matched services (basic / standard / premium) with its passport.
export type AiOffer = { level: string; serviceId: string; title: string; basePrice?: number; passport: ServicePassport };
export type AiClassification = {
  category: string; // criminal | administrative | family | contract | court | general
  executorType: string;
  urgency: string; // normal | urgent
  summary: string;
  recommendedService: string;
  confidence: number;
  leadId?: string;
  routedTo?: string;
  offers: AiOffer[];
  sources: LegalSource[];
  disclaimer: string;
  // "reliable_source_required" when no source carries an article and a date:
  // the answer must not be presented as confident.
  answerStatus: string;
};
export async function classifyProblem(text: string): Promise<AiClassification> {
  const d = asDict(await http("/ai/classify", { method: "POST", body: JSON.stringify({ text }) }));
  return {
    category: asStr(d.category),
    executorType: asStr(d.executor_type),
    urgency: asStr(d.urgency, "normal"),
    // Older builds echoed the user's text here; newer ones send an object
    // ({family, urgency, executor_type}) that is already shown field by field.
    summary: typeof d.summary === "string" ? d.summary : "",
    recommendedService: asStr(d.recommended_service ?? d.service),
    confidence: asNum(d.confidence),
    leadId: asStr(d.lead_id) || undefined,
    routedTo: asStr(d.routed_to ?? d.assigned_to) || undefined,
    offers: asArr(d.offer_levels)
      .map((x) => {
        const o = asDict(x);
        return {
          level: asStr(o.level),
          serviceId: asStr(o.service_id),
          title: asStr(o.title),
          basePrice: uzsOpt(o, "base_price"),
          passport: normPassport(o.passport),
        };
      })
      .filter((o) => o.serviceId),
    sources: asArr(d.sources).map(normLegalSource).filter((x) => x.title),
    disclaimer: asStr(d.disclaimer),
    answerStatus: asStr(d.answer_status),
  };
}

// ── AI: document analysis ─────────────────────────────────────────
// Price of an analysis (POST /ai/document-analysis/quote); the analysis result embeds one too.
export type DocAnalysisQuote = {
  pageCount: number;
  currency: string;
  baseAmount: number;
  ocrAmount: number;
  lawyerReviewAmount: number;
  urgencyAmount: number;
  totalAmount: number;
  paymentRequired: boolean;
  writtenOpinionAmount: number;
  aiIncluded: boolean; // the AI analysis itself is part of the subscription
  pricingRule: string;
};
function normDocQuote(v: unknown): DocAnalysisQuote {
  const d = asDict(v);
  return {
    pageCount: asNum(d.page_count),
    currency: asStr(d.currency, "UZS"),
    baseAmount: uzs(d, "base_amount"),
    ocrAmount: uzs(d, "ocr_amount"),
    lawyerReviewAmount: uzs(d, "lawyer_review_amount"),
    urgencyAmount: uzs(d, "urgency_amount"),
    totalAmount: uzs(d, "total_amount"),
    paymentRequired: Boolean(d.payment_required),
    writtenOpinionAmount: uzs(d, "written_opinion_amount"),
    aiIncluded: Boolean(d.ai_included_in_subscription),
    pricingRule: asStr(d.pricing_rule),
  };
}
export type DocQuoteInput = { pageCount: number; ocr: boolean; lawyerReview: boolean; urgent: boolean; writtenOpinion?: boolean };
export async function quoteDocumentAnalysis(input: DocQuoteInput): Promise<DocAnalysisQuote> {
  const body = {
    page_count: Math.round(input.pageCount),
    ocr: input.ocr,
    lawyer_review: input.lawyerReview,
    urgency: input.urgent ? "urgent" : "normal",
    written_opinion: Boolean(input.writtenOpinion),
  };
  return normDocQuote(await http("/ai/document-analysis/quote", { method: "POST", body: JSON.stringify(body) }));
}

export type DocAnalysis = {
  summary: string;
  risks: { level: string; text: string }[];
  recommendations: string[];
  pointsCount: number;
  analysisText: string; // optional AI write-up, plain text with markdown marks
  pageCount: number;
  pricing?: DocAnalysisQuote;
  upsell?: { title: string; reason: string };
  fileName?: string;
};
function normDocAnalysis(v: unknown): DocAnalysis {
  const d = asDict(v);
  const risks = asArr(d.risks).map((x) => { const r = asDict(x); return { level: asStr(r.level, "low"), text: asStr(r.text ?? r.risk) }; });
  const up = asDict(d.upsell_offer);
  return {
    summary: asStr(d.summary),
    risks,
    recommendations: asArr(d.recommendations).map((x) => asStr(x)),
    pointsCount: asNum(d.points_count) || risks.length + asArr(d.recommendations).length,
    analysisText: asStr(d.analysis_text),
    pageCount: asNum(d.page_count),
    pricing: d.pricing && typeof d.pricing === "object" ? normDocQuote(d.pricing) : undefined,
    upsell: !Object.keys(up).length || up.available === false ? undefined : { title: asStr(up.title), reason: asStr(up.reason) },
    fileName: asStr(d.file_name) || undefined,
  };
}
export async function analyzeDocument(text: string): Promise<DocAnalysis> {
  return normDocAnalysis(await http("/ai/document-analysis", { method: "POST", body: JSON.stringify({ text }) }));
}
// PDF, DOCX or TXT up to 20 MB (POST /ai/document-analysis/file, multipart).
export async function analyzeDocumentFile(file: File): Promise<DocAnalysis> {
  const form = new FormData();
  form.append("file", file);
  return normDocAnalysis(await http("/ai/document-analysis/file", { method: "POST", body: form }));
}
// "Useful / not useful" on an AI answer; not useful goes to the lawyer-moderator queue (T1-04).
export async function sendAiFeedback(useful: boolean, comment = "", requestId = ""): Promise<void> {
  await http("/ai/feedback", { method: "POST", body: JSON.stringify({ useful, comment, request_id: requestId }) });
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
      d.share_url, d.deep_link, d.deeplink, d.url, d.link, d.link_url, d.telegram_url, d.telegram_link, d.telegram_bot_link, d.bot_link,
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
// Filters: date range (inclusive, YYYY-MM-DD), user id, action, target type/id.
export type AuditFilters = { dateFrom?: string; dateTo?: string; userId?: string; action?: string; targetType?: string; targetId?: string };
function auditQuery(f?: AuditFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f?.dateFrom) q.set("date_from", f.dateFrom);
  if (f?.dateTo) q.set("date_to", f.dateTo);
  if (f?.userId?.trim()) q.set("user_id", f.userId.trim());
  if (f?.action?.trim()) q.set("action", f.action.trim());
  if (f?.targetType?.trim()) q.set("target_type", f.targetType.trim());
  if (f?.targetId?.trim()) q.set("target_id", f.targetId.trim());
  return q;
}
// CSV of the same filtered rows (GET /admin/audit-trail?export=csv, users.manage);
// the backend logs every export.
export async function exportAuditTrailCsv(filters?: AuditFilters): Promise<Blob> {
  const q = auditQuery(filters);
  q.set("export", "csv");
  return httpBlob(`/admin/audit-trail?${q}`, { headers: { Accept: "text/csv" } });
}
export async function listAuditTrail(range?: AuditFilters): Promise<ActivityEntry[]> {
  const qs = auditQuery(range).toString();
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
export async function createTask(input: TaskInput & { title: string }): Promise<WorkTask> {
  return normTask(await http("/tasks", { method: "POST", body: JSON.stringify(input) }));
}
// T1B-07: company record fields (inn/director/monthly_payment/sla live in the payload; director etc. via PATCH).
export async function updateB2bClient(id: string, patch: Record<string, unknown>): Promise<void> {
  await http(`/b2b/clients/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export type B2bDocument = { id: string; fileUrl: string; total: number; vatAmount: number; vatPercent: number; taskCount?: number; period?: string };
function normB2bDoc(v: unknown): B2bDocument {
  const d = asDict(v);
  const p = asDict(d.payload);
  return { id: asStr(d.id), fileUrl: asStr(d.file_url), total: asNum(p.total ?? d.price ?? p.invoice_total), vatAmount: asNum(p.vat_amount), vatPercent: asNum(p.vat_percent), taskCount: p.task_count != null ? asNum(p.task_count) : undefined, period: asStr(p.period) || undefined };
}
// Invoice PDF with VAT shown separately (amount_without_vat + vat_percent).
export async function createB2bInvoice(id: string, input: { amountWithoutVat: number; vatPercent?: number; description?: string }): Promise<B2bDocument> {
  return normB2bDoc(await http(`/b2b/clients/${encodeURIComponent(id)}/invoice`, { method: "POST", body: JSON.stringify({ amount_without_vat: input.amountWithoutVat, vat_percent: input.vatPercent ?? 12, description: input.description }) }));
}
export async function createB2bContract(id: string, input: { monthlyPayment?: number; sla?: string }): Promise<B2bDocument> {
  return normB2bDoc(await http(`/b2b/clients/${encodeURIComponent(id)}/contract`, { method: "POST", body: JSON.stringify({ monthly_payment: input.monthlyPayment, sla: input.sla }) }));
}
export async function getB2bMonthlyReport(id: string, month?: string): Promise<B2bDocument> {
  return normB2bDoc(await http(`/b2b/clients/${encodeURIComponent(id)}/monthly-report${month ? `?month=${encodeURIComponent(month)}` : ""}`));
}
export async function createB2bClient(input: { name: string; industry?: string; contact?: string; inn?: string }): Promise<B2bClient> {
  const d = asDict(await http("/b2b/clients", { method: "POST", body: JSON.stringify(input) }));
  const p = asDict(d.payload);
  return { id: asStr(d.id), name: asStr(d.name ?? d.title), industry: asStr(d.industry ?? p.industry), contact: asStr(d.contact ?? p.contact), stage: asStr(d.stage ?? d.status ?? d.record_type, "new"), value: uzsOpt(d, "value", "price") ?? uzs(p, "value") };
}
export async function deleteTask(id: string): Promise<void> {
  await http(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export async function getLeadTimeline(leadId: string): Promise<ActivityEntry[]> {
  return listFrom(await http(`/admin/leads/${leadId}/timeline`), "items", "data", "timeline").map(normActivity);
}

// ── Admin: review moderation ──────────────────────────────────────
export type AdminReview = { id: string; status: string; lawyerName: string; lawyerUserId: string; sellerType: string; rating: number; comment: string; note: string; createdAt: string };
function normAdminReview(v: unknown): AdminReview {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    status: asStr(d.status, "pending"),
    lawyerName: asStr(d.lawyer_name ?? d.lawyer ?? d.name),
    lawyerUserId: asStr(d.lawyer_user_id ?? d.seller_user_id),
    sellerType: asStr(d.seller_type),
    rating: asNum(d.rating),
    comment: asStr(d.comment ?? d.text),
    note: asStr(d.moderation_note ?? d.note),
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}
// `?status=&lawyer_user_id=&seller_type=&rating=&date_from=&date_to=`
// (2026-09-19 backend) — lets the page split moderation by advokat/yurist.
export type AdminReviewFilter = { status?: string; lawyerUserId?: string; sellerType?: string; rating?: number; from?: string; to?: string };
export async function listAdminReviews(f?: AdminReviewFilter): Promise<AdminReview[]> {
  const qs = new URLSearchParams();
  if (f?.status) qs.set("status", f.status);
  if (f?.lawyerUserId) qs.set("lawyer_user_id", f.lawyerUserId);
  if (f?.sellerType) qs.set("seller_type", f.sellerType);
  if (f?.rating) qs.set("rating", String(f.rating));
  if (f?.from) qs.set("date_from", f.from);
  if (f?.to) qs.set("date_to", f.to);
  const q = qs.toString();
  return listFrom(await http(`/admin/reviews${q ? `?${q}` : ""}`), "items", "data", "reviews").map(normAdminReview);
}
export async function moderateReview(id: string, status: string, note?: string): Promise<void> {
  await http(`/admin/reviews/${id}/moderate`, { method: "PATCH", body: JSON.stringify({ status, note: note ?? "" }) });
}

// GET /admin/reviews/{id} (2026-09-19 backend): the full picture behind one
// review — who wrote it, about which seller/case/order.
export type AdminReviewDetail = {
  review: AdminReview;
  seller: { id: string; name: string; phone: string } | null;
  sellerProfile: BackendLawyer | null;
  client: { id: string; name: string; phone: string } | null;
  caseTitle: string;
  orderId: string;
};
export async function getAdminReviewDetail(id: string): Promise<AdminReviewDetail> {
  const d = asDict(await http(`/admin/reviews/${encodeURIComponent(id)}`));
  const seller = asDict(d.seller);
  const client = asDict(d.client);
  const caseD = asDict(d.case);
  const order = asDict(d.order);
  return {
    review: normAdminReview(d.review ?? d),
    seller: d.seller ? { id: asStr(seller.id), name: asStr(seller.name), phone: asStr(seller.phone) } : null,
    sellerProfile: d.seller_profile ? normLawyer(d.seller_profile) : null,
    client: d.client ? { id: asStr(client.id), name: asStr(client.name), phone: asStr(client.phone) } : null,
    caseTitle: asStr(caseD.title ?? caseD.case_number),
    orderId: asStr(order.id ?? d.order_id),
  };
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
  // Permissions arrive as {code, title} objects (older builds sent plain codes).
  const permissions = asArr(d.permissions)
    .map((p) => (typeof p === "string" ? p : asStr(asDict(p).code)))
    .filter(Boolean);
  return { roles, permissions, sellerRules };
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

// ── Call-center CRM console ───────────────────────────────────────
export type CcClient = { id: string; lexgoId: string; name: string; phone: string; status: string };
export async function ccSearchClients(q: string): Promise<CcClient[]> {
  return listFrom(await http(`/call-center/clients/search?q=${encodeURIComponent(q)}`), "items", "data").map((x) => {
    const d = asDict(x);
    return { id: asStr(d.id), lexgoId: asStr(d.lexgo_id), name: asStr(d.name), phone: asStr(d.phone), status: asStr(d.account_status, "active") };
  });
}
// A logged call (MarketplaceRecord module "call_center_call"): the direction is
// the record type, the phone the title, the rest lives in the payload.
export type CcCall = {
  id: string;
  direction: string;
  phone: string;
  status: string;
  createdAt: string;
  clientUserId: string;
  operatorUserId: string;
  topic: string;
  result: string;
  nextAction: string;
  durationSec: number;
};
export async function listCcCalls(clientUserId?: string): Promise<CcCall[]> {
  const qs = clientUserId ? `?client_user_id=${encodeURIComponent(clientUserId)}` : "";
  return listFrom(await http(`/call-center/calls${qs}`), "items", "data", "calls").map((x) => {
    const d = asDict(x); const p = asDict(d.payload);
    return {
      id: asStr(d.id),
      direction: asStr(d.record_type ?? p.direction, "incoming"),
      phone: asStr(p.phone) || asStr(d.title),
      status: asStr(d.status, "completed"),
      createdAt: asStr(d.created_at),
      clientUserId: asStr(p.client_user_id),
      operatorUserId: asStr(d.owner_user_id),
      topic: asStr(p.topic),
      result: asStr(p.result),
      nextAction: asStr(p.next_action),
      durationSec: asNum(p.duration_sec),
    };
  });
}
export type CcCallInput = {
  phone: string;
  direction?: string; // incoming | outgoing
  status?: string; // completed | missed | no_answer | busy
  client_user_id?: string;
  topic?: string;
  result?: string;
  next_action?: string;
  duration_sec?: number;
  note?: string;
};
export async function logCcCall(input: CcCallInput): Promise<void> {
  await http("/call-center/calls", { method: "POST", body: JSON.stringify({ direction: "outgoing", ...input }) });
}

// Client card / 360 (GET /call-center/clients/{id}): profile, totals and the
// client's orders, payments, leads and activity. Call-center staff and
// users.manage; the backend currently answers 403 for call-center staff
// without users.manage (reported).
export type CcClientCard = {
  client: CcClient & { referralCode: string; createdAt: string };
  summary: { orders: number; cases: number; payments: number; totalSpent: number; leads: number; rooms: number; complaints: number; reviews: number };
  orders: BackendOrder[];
  payments: PaymentHistory[];
  leads: Lead[];
  activities: { id: string; action: string; detail: string; createdAt: string }[];
  complaints: { id: string; title: string; status: string; createdAt: string }[];
  subscriptions: { id: string; planId: string; status: string; startsAt: string; endsAt: string }[];
  familyMembers: { id: string; name: string; phone: string; relation: string }[];
};
export async function getCcClientCard(clientUserId: string): Promise<CcClientCard> {
  const d = asDict(await http(`/call-center/clients/${encodeURIComponent(clientUserId)}`));
  const c = asDict(d.client);
  const s = asDict(d.summary);
  return {
    client: { id: asStr(c.id), lexgoId: asStr(c.lexgo_id), name: asStr(c.name), phone: asStr(c.phone), status: asStr(c.account_status, "active"), referralCode: asStr(c.referral_code), createdAt: asStr(c.created_at) },
    summary: { orders: asNum(s.orders_count), cases: asNum(s.cases_count), payments: asNum(s.payments_count), totalSpent: uzs(s, "total_spent"), leads: asNum(s.leads_count), rooms: asNum(s.rooms_count), complaints: asNum(s.complaints_count), reviews: asNum(s.reviews_count) },
    orders: asArr(d.orders).map(normOrder),
    payments: asArr(d.payments).map(normPaymentHistory),
    leads: asArr(d.leads).map(normLead),
    activities: asArr(d.activities).map((x) => { const a = asDict(x); return { id: asStr(a.id), action: asStr(a.action), detail: asStr(a.detail), createdAt: asStr(a.created_at) }; }),
    complaints: asArr(d.complaints).map((x) => { const a = asDict(x); return { id: asStr(a.id), title: asStr(a.title), status: asStr(a.status), createdAt: asStr(a.created_at) }; }),
    subscriptions: asArr(d.subscriptions).map((x) => { const a = asDict(x); return { id: asStr(a.id), planId: asStr(a.plan_id), status: asStr(a.status), startsAt: asStr(a.starts_at), endsAt: asStr(a.ends_at) }; }),
    familyMembers: asArr(d.family_members).map((x) => { const a = asDict(x); const p = asDict(a.payload); return { id: asStr(a.id), name: asStr(a.title), phone: asStr(p.phone), relation: asStr(p.relation) }; }),
  };
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
function normPaymentHistory(v: unknown): PaymentHistory {
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
}
export async function listPayments(): Promise<PaymentHistory[]> {
  return listFrom(await http("/payments"), "items", "data").map(normPaymentHistory);
}
export async function getPaymentReceipt(paymentId: string): Promise<Blob> {
  return httpBlob(`/payments/${paymentId}/receipt`, { headers: { Accept: "application/pdf" } });
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

// ── Admin: meeting/call history (2026-09-19 backend) ────────────────
// GET /admin/calls — every LiveKit meeting platform-wide (unlike GET
// /calls/invited, which is scoped to the current user), for a "Zoom-style"
// history page: who created it, how long it ran, how many joined.
export type AdminCallRow = {
  id: string;
  status: string;
  title: string;
  callType: string;
  roomId: string;
  creatorUserId: string;
  creatorName: string;
  participantCount: number;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  updatedAt: string;
};
function normAdminCallRow(v: unknown): AdminCallRow {
  const d = asDict(v);
  return {
    id: asStr(d.id ?? d.call_id),
    status: asStr(d.status),
    title: asStr(d.title),
    callType: asStr(d.call_type),
    roomId: asStr(d.room_id),
    creatorUserId: asStr(d.creator_user_id ?? d.caller_user_id),
    creatorName: asStr(d.creator_name ?? d.caller_name),
    participantCount: asNum(d.participant_count),
    durationSeconds: asNum(d.duration_seconds),
    startedAt: asStr(d.started_at),
    endedAt: asStr(d.ended_at),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
  };
}
export type AdminCallFilter = { status?: string; userId?: string; roomId?: string; from?: string; to?: string };
export async function listAdminCalls(f?: AdminCallFilter): Promise<AdminCallRow[]> {
  const qs = new URLSearchParams();
  if (f?.status) qs.set("status", f.status);
  if (f?.userId) qs.set("user_id", f.userId);
  if (f?.roomId) qs.set("room_id", f.roomId);
  if (f?.from) qs.set("date_from", f.from);
  if (f?.to) qs.set("date_to", f.to);
  const q = qs.toString();
  return listFrom(await http(`/admin/calls${q ? `?${q}` : ""}`), "items", "calls", "data").map(normAdminCallRow);
}
export type AdminCallDetail = {
  call: AdminCallRow;
  room: { id: string; title: string } | null;
  creator: { id: string; name: string; phone: string } | null;
  durationSeconds: number;
  durationMinutes: number;
  participants: CallParticipant[];
};
export async function getAdminCallDetail(id: string): Promise<AdminCallDetail> {
  const d = asDict(await http(`/admin/calls/${encodeURIComponent(id)}`));
  const room = asDict(d.room);
  const creator = asDict(d.creator);
  return {
    call: normAdminCallRow(d.call ?? d),
    room: d.room ? { id: asStr(room.id), title: asStr(room.title) } : null,
    creator: d.creator ? { id: asStr(creator.id), name: asStr(creator.name), phone: asStr(creator.phone) } : null,
    durationSeconds: asNum(d.duration_seconds),
    durationMinutes: asNum(d.duration_minutes),
    participants: asArr(d.participants).map(normParticipant),
  };
}

// ── Recording consent (2026-09-19 backend) ──────────────────────────
// Server-tracked recording state, broadcast to every room participant over
// the same call WebSocket as the roster (call.recording_requested/
// _permission_updated/_started) — not the LiveKit data channel, and not
// polled. Actual capture stays local (lib/meetingRecorder.ts, never
// uploaded); these calls exist so the room agrees on who asked, who
// allowed it, and who is recording.
export type CallRecordingState = {
  status: string; // recording_status
  requestedByUserId: string;
  allowedByUserId: string;
  startedByUserId: string;
};
function normRecordingState(v: unknown): CallRecordingState {
  const d = asDict(v);
  return {
    status: asStr(d.recording_status ?? d.status),
    requestedByUserId: asStr(d.recording_requested_by_user_id),
    allowedByUserId: asStr(d.recording_allowed_by_user_id),
    startedByUserId: asStr(d.recording_started_by_user_id),
  };
}
// `mode` isn't in the documented request body — sent anyway (pydantic drops
// unknown keys) so an approver's request card can show audio/screen if the
// backend ever echoes it back on call.recording_requested.
export async function requestCallRecording(roomId: string, callId: string, mode?: string): Promise<void> {
  await http(`/secure-chats/${roomId}/calls/${callId}/recording-request`, {
    method: "POST",
    body: JSON.stringify(mode ? { mode } : {}),
  });
}
export async function setCallRecordingPermission(roomId: string, callId: string, allowed: boolean, reason = ""): Promise<CallRecordingState> {
  return normRecordingState(
    await http(`/secure-chats/${roomId}/calls/${callId}/recording-permission`, {
      method: "PATCH",
      body: JSON.stringify({ allowed, reason }),
    }),
  );
}
export async function startCallRecordingServer(roomId: string, callId: string): Promise<CallRecordingState> {
  return normRecordingState(await http(`/secure-chats/${roomId}/calls/${callId}/recording/start`, { method: "POST", body: "{}" }));
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

// Search any platform user (staff/callcenter) to invite to a meeting, or for
// any admin "pick a user" field instead of typing an id by hand.
export type UserSearchResult = { id: string; name: string; phone: string; role: string; lexgoId: string };
export async function searchUsers(q: string, opts?: { role?: string; limit?: number }): Promise<UserSearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  const qs = new URLSearchParams({ q: query });
  if (opts?.role) qs.set("role", opts.role);
  qs.set("limit", String(opts?.limit ?? 20));
  return listFrom(await http(`/users/search?${qs.toString()}`), "items", "data", "users").map((v) => {
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
// 2026-09-20 backend: gated to approved advokat/yurist/advokat_tashkiloti
// only (403 for pending sellers and clients), 1GB quota per seller.
export type WorkspaceFolder = {
  id: string;
  name: string;
  parentId?: string;
  caseId?: string;
  status: string;
  starred: boolean;
  size: number;
  fileCount: number;
  folderCount: number;
  createdAt: string;
};
function normFolder(v: unknown): WorkspaceFolder {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    name: asStr(d.name),
    parentId: asStr(d.parent_id) || undefined,
    caseId: asStr(d.case_id) || undefined,
    status: asStr(d.status),
    starred: Boolean(d.starred),
    size: asNum(d.size),
    fileCount: asNum(d.file_count),
    folderCount: asNum(d.folder_count),
    createdAt: asStr(d.created_at),
  };
}
export type WorkspaceFolderFilter = { parentId?: string; starred?: boolean; caseId?: string };
function workspaceQuery(f?: Record<string, string | boolean | undefined>): string {
  if (!f) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v != null && v !== "") qs.set(k, String(v));
  const q = qs.toString();
  return q ? `?${q}` : "";
}
export async function listFolders(f?: WorkspaceFolderFilter): Promise<WorkspaceFolder[]> {
  const q = workspaceQuery({ parent_id: f?.parentId, starred: f?.starred, case_id: f?.caseId });
  return listFrom(await http(`/workspace/folders${q}`), "folders", "items", "data").map(normFolder);
}
export async function createFolder(input: { name: string; parent_id?: string; case_id?: string; starred?: boolean }): Promise<WorkspaceFolder> {
  return normFolder(await http("/workspace/folders", { method: "POST", body: JSON.stringify(input) }));
}
export type WorkspaceFolderPatch = Partial<{ name: string; parent_id: string | null; case_id: string | null; starred: boolean; status: "active" | "archived" }>;
export async function updateFolder(id: string, patch: WorkspaceFolderPatch): Promise<WorkspaceFolder> {
  return normFolder(await http(`/workspace/folders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }));
}
export type FolderDeleteResult = { deleted: boolean; id: string; deletedFolders: number; deletedFiles: number };
export async function deleteFolder(id: string): Promise<FolderDeleteResult> {
  const d = asDict(await http(`/workspace/folders/${id}`, { method: "DELETE" }));
  return { deleted: d.deleted !== false, id: asStr(d.id, id), deletedFolders: asNum(d.deleted_folders), deletedFiles: asNum(d.deleted_files) };
}

export type WorkspaceFile = {
  id: string;
  folderId?: string;
  caseId?: string;
  fileName: string;
  fileUrl: string;
  downloadUrl: string; // absolute backend URL (needs auth or a signed token)
  mimeType: string;
  size: number;
  extension: string;
  starred: boolean;
  status: string;
  createdAt: string;
  // Antivirus scan (LEXGO_BACKEND_PRODUCTION_POLICY_UPDATE): required / status / engine / issues.
  scan?: { required: boolean; status: string; engine: string; issues: string[]; scannedAt: string };
};
function normFile(v: unknown): WorkspaceFile {
  const d = asDict(v);
  const sc = asDict(d.scan);
  return {
    scan: Object.keys(sc).length ? { required: sc.scan_required !== false && sc.required !== false, status: asStr(sc.scan_status ?? sc.status).toLowerCase(), engine: asStr(sc.scan_engine ?? sc.engine), issues: asArr(sc.issues).map((x) => asStr(x)), scannedAt: asStr(sc.scanned_at) } : undefined,
    id: asStr(d.id),
    folderId: asStr(d.folder_id) || undefined,
    caseId: asStr(d.case_id) || undefined,
    fileName: asStr(d.file_name),
    fileUrl: asStr(d.file_url),
    downloadUrl: asStr(d.download_url),
    mimeType: asStr(d.mime_type),
    size: asNum(d.size),
    extension: asStr(d.extension),
    starred: Boolean(d.starred),
    status: asStr(d.status, "active"),
    createdAt: asStr(d.created_at),
  };
}
// POST /workspace/files/{id}/signed-url — 15-minute absolute link that works
// without the Authorization header (open in a new tab / share to a device).
export type SignedFileUrl = { url: string; relativeUrl: string; expiresAt: string; expiresInSeconds: number };
export async function getWorkspaceFileSignedUrl(fileId: string): Promise<SignedFileUrl> {
  const d = asDict(await http(`/workspace/files/${encodeURIComponent(fileId)}/signed-url`, { method: "POST" }));
  return { url: asStr(d.url ?? d.download_url), relativeUrl: asStr(d.relative_url), expiresAt: asStr(d.expires_at), expiresInSeconds: asNum(d.expires_in_seconds) || 900 };
}
// The file's actual bytes, fetched the same authenticated way as every other
// call (not a plain navigation to the signed URL) — the storage route always
// answers with Content-Disposition: attachment, so navigating to it forces a
// browser download regardless of intent. Going through the bearer-authed
// proxy instead ignores that header entirely; it's just a JS fetch, so the
// caller (open in a tab vs. force-save) decides what happens to the bytes.
export async function getWorkspaceFileBlob(fileId: string): Promise<Blob> {
  const signed = await getWorkspaceFileSignedUrl(fileId);
  return httpBlob(signed.relativeUrl);
}
export type WorkspaceFileFilter = { folderId?: string; caseId?: string; starred?: boolean; q?: string };
export async function listFiles(f?: WorkspaceFileFilter): Promise<WorkspaceFile[]> {
  const q = workspaceQuery({ folder_id: f?.folderId, case_id: f?.caseId, starred: f?.starred, q: f?.q });
  return listFrom(await http(`/workspace/files${q}`), "files", "items", "data").map(normFile);
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
export type WorkspaceFilePatch = Partial<{ file_name: string; folder_id: string | null; case_id: string | null; starred: boolean; status: "active" | "archived" }>;
export async function updateFile(id: string, patch: WorkspaceFilePatch): Promise<WorkspaceFile> {
  return normFile(await http(`/workspace/files/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }));
}
export async function deleteFile(id: string): Promise<void> {
  await http(`/workspace/files/${id}`, { method: "DELETE" });
}

// Real multipart upload (field "file"). http() forces JSON, so send raw here.
// POST /workspace/files/upload (2026-09-20 backend) — not /workspace/files.
export async function uploadWorkspaceFile(file: File, opts?: { folderId?: string; caseId?: string }): Promise<WorkspaceFile> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts?.folderId) fd.append("folder_id", opts.folderId);
  if (opts?.caseId) fd.append("case_id", opts.caseId);
  const token = getToken();
  const res = await fetch(`${API_BASE}/workspace/files/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new ApiError(res.status, `upload_${res.status}`);
  return normFile(await res.json());
}

// GET /workspace/quota — 1GB per approved seller.
export type WorkspaceQuota = { quotaBytes: number; usedBytes: number; remainingBytes: number; limitGb: number };
function normQuota(v: unknown): WorkspaceQuota {
  const d = asDict(v);
  return { quotaBytes: asNum(d.quota_bytes), usedBytes: asNum(d.used_bytes), remainingBytes: asNum(d.remaining_bytes), limitGb: asNum(d.limit_gb, 1) };
}
export async function getWorkspaceQuota(): Promise<WorkspaceQuota> {
  return normQuota(await http("/workspace/quota"));
}
// GET /workspace/tree — every folder + file (flat, parent_id-linked) plus
// quota in one call; the File Manager page navigates/filters this client-side
// rather than re-fetching per folder.
export type WorkspaceTree = { folders: WorkspaceFolder[]; files: WorkspaceFile[]; quota: WorkspaceQuota };
export async function getWorkspaceTree(caseId?: string): Promise<WorkspaceTree> {
  const d = asDict(await http(`/workspace/tree${workspaceQuery({ case_id: caseId })}`));
  return {
    folders: asArr(d.folders).map(normFolder),
    files: asArr(d.files).map(normFile),
    quota: normQuota(d.quota),
  };
}

// ── Platform policies (GET /platform/policies, public) ────────────
// Order/payment/document/workspace/notification rules come from the backend;
// nothing here is hard-coded in the UI any more.
export type PlatformPolicies = {
  order: { advancePercent: number; finalPercent: number; confirmationWindowMinutes: number; sellerResponseMinutes: number; statusTransitions: Record<string, string[]> };
  payment: { commissionPercent: number; providerFeePercent: number; mode: string; currency: string; refundReviewDays: number };
  documentAnalysis: { ranges: { minPages: number; maxPages: number; amount: number }[]; extraPageAmount: number; urgentPercent: number; writtenOpinionAmount: number };
  workspace: { fileMaxMb: number; videoMaxMb: number; caseQuotaMb: number; signedUrlMinutes: number; scanRequired: boolean; allowedExtensions: string[]; blockedExtensions: string[] };
  notifications: { cascade: string[]; providerMissingStatus: string };
  raw: Record<string, Record<string, unknown>>;
};
function normPolicies(v: unknown): PlatformPolicies {
  const d = asDict(v);
  const items = asDict(d.items ?? d.sections ?? d);
  const o = asDict(items.order), p = asDict(items.payment), da = asDict(items.document_analysis), w = asDict(items.workspace), n = asDict(items.notifications);
  const tr: Record<string, string[]> = {};
  for (const [k, val] of Object.entries(asDict(o.status_transitions))) tr[k] = asArr(val).map((x) => asStr(x));
  return {
    order: { advancePercent: asNum(o.advance_percent), finalPercent: asNum(o.final_percent), confirmationWindowMinutes: asNum(o.confirmation_window_minutes), sellerResponseMinutes: asNum(o.seller_response_business_minutes) || 30, statusTransitions: tr },
    payment: { commissionPercent: asNum(p.platform_commission_percent), providerFeePercent: asNum(p.provider_fee_percent), mode: asStr(p.mode), currency: asStr(p.currency, "UZS"), refundReviewDays: asNum(p.refund_review_business_days) },
    documentAnalysis: { ranges: asArr(da.review_fee_ranges).map((r) => { const x = asDict(r); return { minPages: asNum(x.min_pages), maxPages: asNum(x.max_pages), amount: asNum(x.amount) }; }), extraPageAmount: asNum(da.extra_page_amount), urgentPercent: asNum(da.urgent_percent), writtenOpinionAmount: asNum(da.written_opinion_amount) },
    workspace: { fileMaxMb: asNum(w.file_max_mb) || 50, videoMaxMb: asNum(w.video_max_mb) || 200, caseQuotaMb: asNum(w.case_quota_mb), signedUrlMinutes: asNum(w.signed_url_minutes), scanRequired: w.scan_required !== false, allowedExtensions: asArr(w.allowed_extensions).map((x) => asStr(x)), blockedExtensions: asArr(w.blocked_extensions).map((x) => asStr(x)) },
    notifications: { cascade: asArr(n.cascade).map((x) => asStr(x)), providerMissingStatus: asStr(n.provider_missing_status) },
    raw: Object.fromEntries(Object.entries(items).map(([k, val]) => [k, asDict(val)])),
  };
}
let policiesCache: { at: number; p: PlatformPolicies } | null = null;
export async function getPlatformPolicies(): Promise<PlatformPolicies> {
  if (policiesCache && Date.now() - policiesCache.at < 5 * 60_000) return policiesCache.p;
  const p = normPolicies(await http("/platform/policies"));
  policiesCache = { at: Date.now(), p };
  return p;
}
// T0-10 §5: how unverified advocates/lawyers appear in the catalogue —
// "badge" (listed with an "unverified" mark) or "hidden" (not listed). The
// backend has no dedicated section yet, so the value lives under the public
// `order` policy (`order.catalog.unverified_sellers`) — readable by guests.
export type UnverifiedSellersMode = "badge" | "hidden";
export async function getUnverifiedSellersMode(): Promise<UnverifiedSellersMode> {
  try {
    const p = await getPlatformPolicies();
    const cat = asDict(asDict(p.raw.order).catalog);
    return asStr(cat.unverified_sellers) === "hidden" ? "hidden" : "badge";
  } catch {
    return "badge";
  }
}
export async function setUnverifiedSellersMode(mode: UnverifiedSellersMode): Promise<void> {
  const items = await getAdminPolicies();
  const order = items.order ?? {};
  await putAdminPolicy("order", { ...order, catalog: { ...asDict(order.catalog), unverified_sellers: mode } });
}
// Admin: every section (raw dicts) + PUT one section + its history.
export const POLICY_SECTIONS = ["order", "payment", "document_analysis", "workspace", "security", "notifications"] as const;
export type PolicySection = (typeof POLICY_SECTIONS)[number];
export async function getAdminPolicies(): Promise<Record<string, Record<string, unknown>>> {
  const d = asDict(await http("/admin/platform/policies"));
  const items = asDict(d.items ?? d.sections ?? d);
  return Object.fromEntries(Object.entries(items).filter(([k]) => (POLICY_SECTIONS as readonly string[]).includes(k)).map(([k, v]) => [k, asDict(v)]));
}
export async function putAdminPolicy(section: PolicySection, data: Record<string, unknown>): Promise<void> {
  policiesCache = null;
  await http(`/admin/platform/policies/${section}`, { method: "PUT", body: JSON.stringify(data) });
}
export type PolicyHistoryEntry = { version: string; changedBy: string; at: string; data: Record<string, unknown> };
export async function getPolicyHistory(section: PolicySection): Promise<PolicyHistoryEntry[]> {
  return listFrom(await http(`/admin/platform/policies/${section}/history`), "items", "history", "data", "versions").map((x) => {
    const d = asDict(x);
    return { version: asStr(d.version ?? d.id), changedBy: asStr(d.changed_by ?? d.updated_by ?? d.user_id ?? d.actor), at: asStr(d.created_at ?? d.updated_at ?? d.at), data: asDict(d.data ?? d.payload ?? d.value ?? d.policy) };
  });
}
// Admin: production readiness checklist (GET /admin/compliance/readiness).
export type ReadinessItem = { key: string; title: string; status: string; note: string };
export type Readiness = { status: string; items: ReadinessItem[]; raw: Record<string, unknown> };
export async function getComplianceReadiness(): Promise<Readiness> {
  const d = asDict(await http("/admin/compliance/readiness"));
  const list = listFrom(d, "items", "checks", "checklist", "results");
  const items: ReadinessItem[] = list.length
    ? list.map((x) => { const r = asDict(x); return { key: asStr(r.key ?? r.id ?? r.code ?? r.name), title: asStr(r.title ?? r.label ?? r.name ?? r.key), status: asStr(r.status ?? (r.ok === true ? "ok" : r.ok === false ? "missing" : "")).toLowerCase(), note: asStr(r.note ?? r.detail ?? r.message ?? r.hint) }; })
    : Object.entries(asDict(d.checks ?? d.items)).map(([k, v]) => { const r = asDict(v); return { key: k, title: asStr(r.title ?? r.label, k), status: asStr(r.status ?? (typeof v === "boolean" ? (v ? "ok" : "missing") : v)).toLowerCase(), note: asStr(r.note ?? r.detail ?? r.message) }; });
  return { status: asStr(d.status ?? d.overall_status), items, raw: d };
}
// Secure chat content reveal (dispute): staff see "[metadata_only]" until a
// reveal is requested and approved by a second person.
export type RevealStatus = { status: string; active: boolean; requestedBy: string; approvedBy: string; reason: string; expiresAt: string; raw: Record<string, unknown> };
function normReveal(v: unknown): RevealStatus {
  const d = asDict(v);
  const r = asDict(d.reveal ?? d.request ?? d);
  const status = asStr(r.status ?? d.status).toLowerCase();
  return { status, active: r.active === true || d.active === true || status === "approved" || status === "active", requestedBy: asStr(r.requested_by ?? r.requested_by_user_id), approvedBy: asStr(r.approved_by ?? r.approved_by_user_id), reason: asStr(r.reason), expiresAt: asStr(r.expires_at), raw: d };
}
export async function getContentRevealStatus(roomId: string): Promise<RevealStatus> {
  return normReveal(await http(`/secure-chats/${encodeURIComponent(roomId)}/content-reveal/status`));
}
export async function requestContentReveal(roomId: string, reason: string): Promise<RevealStatus> {
  return normReveal(await http(`/secure-chats/${encodeURIComponent(roomId)}/content-reveal/request`, { method: "POST", body: JSON.stringify({ reason }) }));
}
export async function approveContentReveal(roomId: string): Promise<RevealStatus> {
  return normReveal(await http(`/secure-chats/${encodeURIComponent(roomId)}/content-reveal/approve`, { method: "POST", body: JSON.stringify({}) }));
}

// ── Workspace: file versions + comments + document requests ────────
export type FileVersion = {
  id: string; version: number; fileName: string; fileUrl: string; downloadUrl: string; note: string; createdAt: string;
};
function normVersion(v: unknown): FileVersion {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    version: asNum(d.version),
    fileName: asStr(d.file_name),
    fileUrl: asStr(d.file_url),
    downloadUrl: asStr(d.download_url),
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

// GET /admin/seller-requests (2026-09-19 backend): the unified register +
// advocate/lawyer approval feed the doc says should replace a separate
// approval page — one list (role/date-filterable) plus role/status counts.
export type SellerRequestFilter = { status?: string; role?: string; from?: string; to?: string };
export type SellerRequestStats = { total: number; advokat: number; yurist: number; advokatTashkiloti: number; pending: number; approved: number; rejected: number };
export type SellerRequestsPage = { items: RegisterRequest[]; stats: SellerRequestStats };
export async function getSellerRequests(f?: SellerRequestFilter): Promise<SellerRequestsPage> {
  const qs = new URLSearchParams();
  if (f?.status) qs.set("status", f.status);
  if (f?.role) qs.set("role", f.role);
  if (f?.from) qs.set("date_from", f.from);
  if (f?.to) qs.set("date_to", f.to);
  const q = qs.toString();
  const raw = asDict(await http(`/admin/seller-requests${q ? `?${q}` : ""}`));
  const items = listFrom(raw, "items", "requests", "data").map(normRegReq);
  const s = asDict(raw.stats);
  const stats: SellerRequestStats = {
    total: asNum(s.total),
    advokat: asNum(s.advokat),
    yurist: asNum(s.yurist),
    advokatTashkiloti: asNum(s.advokat_tashkiloti),
    pending: asNum(s.pending),
    approved: asNum(s.approved),
    rejected: asNum(s.rejected),
  };
  return { items, stats };
}
// GET /admin/register-requests/{id} — the sign-up form data (pending), the
// linked user / lawyer profile (after approval) and recent activity.
// A file the applicant uploaded as proof (license, diploma…). `file_url` is
// direct storage access (may need its own auth/expiry); the admin UI should
// prefer the proxied inline endpoint below so the same bearer session works.
export type ProofDocument = { id: string; kind: string; fileUrl: string; inlineUrl: string; downloadUrl: string; createdAt: string };
function normProofDocument(v: unknown): ProofDocument {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    kind: asStr(d.kind ?? d.document_type ?? d.type),
    fileUrl: asStr(d.file_url),
    inlineUrl: asStr(d.inline_url),
    downloadUrl: asStr(d.download_url),
    createdAt: asStr(d.created_at),
  };
}
export type VerificationItem = { key: string; label: string; status: string; note: string };
function normVerificationItem(v: unknown): VerificationItem {
  const d = asDict(v);
  return { key: asStr(d.key ?? d.code), label: asStr(d.label ?? d.title ?? d.key), status: asStr(d.status), note: asStr(d.note ?? d.detail) };
}
export type RegisterRequestDetail = {
  request: RegisterRequest;
  pending: { id: string; role: string; name: string; firstName: string; lastName: string; middleName: string; region: string; phone: string; status: string; attempts: number; blockedUntil?: string; expiresAt?: string; createdAt: string } | null;
  user: { id: string; name: string; phone: string; role: string; accountStatus: string; lexgoId: string; createdAt: string } | null;
  lawyerProfile: BackendLawyer | null;
  proofDocuments: ProofDocument[];
  verificationItems: VerificationItem[];
  activity: ActivityEntry[];
};
export async function getRegisterRequestDetail(id: string): Promise<RegisterRequestDetail> {
  const d = asDict(await http(`/admin/register-requests/${encodeURIComponent(id)}`));
  const p = asDict(d.pending);
  const u = asDict(d.user);
  return {
    request: normRegReq(d.request ?? {}),
    pending: d.pending ? { id: asStr(p.id), role: asStr(p.role), name: asStr(p.name), firstName: asStr(p.first_name), lastName: asStr(p.last_name), middleName: asStr(p.middle_name), region: asStr(p.region), phone: asStr(p.phone), status: asStr(p.status), attempts: asNum(p.attempts), blockedUntil: asStr(p.blocked_until) || undefined, expiresAt: asStr(p.expires_at) || undefined, createdAt: asStr(p.created_at) } : null,
    user: d.user ? { id: asStr(u.id), name: asStr(u.name), phone: asStr(u.phone), role: asStr(u.role), accountStatus: asStr(u.account_status), lexgoId: asStr(u.lexgo_id), createdAt: asStr(u.created_at) } : null,
    lawyerProfile: d.lawyer_profile ? normLawyer(d.lawyer_profile) : null,
    proofDocuments: asArr(d.proof_documents).map(normProofDocument),
    verificationItems: asArr(d.verification_items).map(normVerificationItem),
    activity: asArr(d.activity).map(normActivity),
  };
}
export async function acceptRegisterRequest(id: string): Promise<unknown> {
  return http(`/admin/register-requests/${id}/accept`, { method: "POST" });
}
export async function rejectRegisterRequest(id: string): Promise<unknown> {
  return http(`/admin/register-requests/${id}/reject`, { method: "POST" });
}

// GET /admin/lawyer-proof-documents/{id}/file?disposition=inline (2026-09-19
// backend): the file needs the admin's bearer token, so it's fetched as a
// blob (httpBlob) and shown via an object URL — never a plain <a target=
// "_blank"> to the API host, which would 401 without the header.
export async function getProofDocumentBlob(documentId: string): Promise<Blob> {
  return httpBlob(`/admin/lawyer-proof-documents/${encodeURIComponent(documentId)}/file?disposition=inline`);
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
// Who a consent document is for. The backend has no audience field yet, so
// role-specific documents are recognised by slug; any other slug applies to
// everyone. client_provider_contract is signed per order (T1A-04), not at
// sign-up, so it is never part of the sign-up/re-consent set.
export type ConsentAudience = "client" | "lawyer" | "advocate" | "staff";
const CONSENT_AUDIENCE: Record<string, ConsentAudience[]> = {
  advocate_partnership: ["lawyer", "advocate"],
  organization_agreement: ["advocate"],
  client_provider_contract: [],
  payment_refund_warranty: ["client", "lawyer", "advocate"],
  age_18: ["client", "lawyer", "advocate"],
};
export function consentsFor(docs: ConsentDoc[], audience: ConsentAudience): ConsentDoc[] {
  return docs.filter((d) => {
    const who = CONSENT_AUDIENCE[d.slug];
    return !who || who.includes(audience);
  });
}
export async function listMyConsents(): Promise<AcceptedConsentRef[]> {
  return asArr(await http("/legal/consents/me"))
    .map((x) => {
      const d = asDict(x);
      return { id: asStr(d.consent_id ?? d.id), slug: asStr(d.slug), version: asStr(d.version), accepted: d.accepted !== false };
    })
    .filter((r) => r.id && r.accepted)
    .map(({ id, slug, version }) => ({ id, slug, version }));
}
export async function listLegalConsents(): Promise<ConsentDoc[]> {
  return normConsentDocs(await http("/legal/consents"));
}
// 2026-09-22 backend: the list above dropped body/body_json/content (lighter
// list/card payload) — this is the "open one document" endpoint that still
// has them, for LegalDocsFallback's client-side render of a single /legal/[slug].
export async function getLegalConsent(id: string): Promise<ConsentDoc> {
  return normConsentDoc(await http(`/legal/consents/${encodeURIComponent(id)}`));
}
// T0-18 admin: every document version (active or not) — needs users.manage.
export async function listAdminConsentDocs(): Promise<ConsentDoc[]> {
  return normConsentDocs(await http("/admin/legal/consents"));
}
// Consents journal: who accepted which document/version, when, from which IP.
export type UserConsentRow = { id: string; userId: string; consentId: string; slug: string; version: string; acceptedAt: string; ip: string };
export async function listUserConsents(userId?: string): Promise<UserConsentRow[]> {
  const q = userId?.trim() ? `?user_id=${encodeURIComponent(userId.trim())}` : "";
  return listFrom(await http(`/admin/legal/user-consents${q}`), "items", "data").map((x) => {
    const d = asDict(x);
    return { id: asStr(d.id), userId: asStr(d.user_id), consentId: asStr(d.consent_id), slug: asStr(d.slug), version: asStr(d.version), acceptedAt: asStr(d.accepted_at), ip: asStr(d.ip_address ?? d.ip) };
  });
}
// Publish a new document version from the admin editor. The backend has no
// write endpoint yet (reported); a 404/405 surfaces as "backend kerak".
export type ConsentDocInput = { slug: string; version: string; title: string; body: string; active: boolean; major: boolean };
export async function saveConsentDoc(input: ConsentDocInput): Promise<ConsentDoc> {
  const body = JSON.stringify({ slug: input.slug, version: input.version, title: input.title, body: input.body, is_active: input.active, requires_reaccept: input.major });
  return normConsentDoc(await http("/admin/legal/consents", { method: "POST", body }));
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
