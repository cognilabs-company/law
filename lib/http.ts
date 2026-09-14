// Shared HTTP core for the LexGo backend (see FRONTEND_API.md / MOBILE_API.md).
// Same-origin proxy path (app/api/backend) avoids browser CORS; the deployment
// sets BACKEND_ORIGIN. Every request carries the bearer token when present.
import { getToken } from "./client";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/backend";

export class ApiError extends Error {
  status: number;
  detail?: string;
  // Seconds until the action may be retried (429 cooldown / OTP lock), when
  // the server said so via Retry-After or a retry field in the body.
  retryAfter?: number;
  constructor(status: number, detail?: string, retryAfter?: number) {
    super(detail || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }
}

// True when the backend refused an AI reply because the guest IP limit is spent
// ("AI limit tugadi. ... login qiling.") — or auth/quota status codes.
export function isLimitError(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  if (e.detail && /limit|лимит/i.test(e.detail)) return true;
  return e.status === 401 || e.status === 402 || e.status === 429;
}

// True when an auth endpoint hit its IP rate limit (HTTP 429). Auth flows show
// a "too many attempts, try again shortly" message.
export function isRateLimited(e: unknown): boolean {
  return e instanceof ApiError && e.status === 429;
}

// The server's own error text ('' when there is none or the request never
// reached the server). 429s carry the cooldown/lock wording, so callers show
// `errDetail(e) || tc("rateLimited")`.
export function errDetail(e: unknown): string {
  if (!(e instanceof ApiError) || !e.detail || e.detail === "network_error") return "";
  return e.detail;
}

// Seconds to wait before retrying: the server's Retry-After / retry field,
// else a number of minutes/seconds stated in the message, else `fallback`.
// Capped at 24h (the daily OTP quota is the longest wait).
export function retryAfterSec(e: unknown, fallback: number): number {
  let sec = fallback;
  if (e instanceof ApiError) {
    const d = e.detail || "";
    const min = /(\d+)\s*(daqiqa|minut|мин|min)/i.exec(d);
    const s = /(\d+)\s*(soniya|sekund|сек|sec)/i.exec(d);
    if (e.retryAfter && e.retryAfter > 0) sec = e.retryAfter;
    else if (min && parseInt(min[1], 10) > 0) sec = parseInt(min[1], 10) * 60;
    else if (s && parseInt(s[1], 10) > 0) sec = parseInt(s[1], 10);
  }
  return Math.min(Math.max(0, Math.ceil(sec)), 86400);
}

// True when an OTP was rejected because it expired or a newer code replaced
// it (410, or wording to that effect) rather than because it was wrong.
export function isOtpExpired(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  return e.status === 410 || /expir|supersed|muddat|eskir|истек|истёк|устарел/i.test(e.detail || "");
}

// True when a demo-only endpoint is missing because DEMO_MODE is off in
// production (the route isn't registered → bare 404, or it answers
// "Demo endpoint yopiq"). A 404 with any other detail is a real "not found".
// Callers use it to show a "not available yet" message instead of a raw error.
export function isDemoUnavailable(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.status !== 404) return false;
  const d = (e.detail || "").trim();
  return !d || /^not found$/i.test(d) || /demo|yopiq/i.test(d);
}

// True when a payment/identity provider is not configured yet (HTTP 503).
export function isProviderUnavailable(e: unknown): boolean {
  return e instanceof ApiError && e.status === 503;
}

// True when the backend itself is unreachable (dev/preview against a LAN IP).
// Callers use this to fall back to local mock data gracefully.
export function isOffline(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 502 || e.status === 0;
  return true; // network / fetch throw
}

// Epoch ms from a server time value, NaN when unusable. Numbers below 1e12 are
// epoch seconds. Naive ISO strings (Python UTC, no zone) are read as UTC, and
// microseconds are trimmed so every browser parses them.
export function parseServerTime(v: unknown): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return NaN;
    return v < 1e12 ? v * 1000 : v;
  }
  if (typeof v !== "string") return NaN;
  let s = v.trim();
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return parseServerTime(parseFloat(s));
  if (/^\d{4}-\d{2}-\d{2}[ T]\d/.test(s)) {
    s = s.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
    if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) s += "Z";
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

const RETRY_SEC_KEYS = ["retry_after", "retry_after_seconds", "cooldown_seconds", "wait_seconds", "seconds_left", "lock_seconds"];
const RETRY_AT_KEYS = ["retry_at", "blocked_until", "locked_until", "available_at"];

function retryHint(header: string | null, sources: Dict[]): number | undefined {
  const now = Date.now();
  const h = (header || "").trim();
  if (/^\d+$/.test(h)) {
    const n = parseInt(h, 10);
    if (n > 0) return n;
  } else if (h) {
    const at = Date.parse(h);
    if (Number.isFinite(at) && at > now) return Math.ceil((at - now) / 1000);
  }
  for (const k of RETRY_SEC_KEYS) {
    for (const src of sources) {
      const v = src[k];
      const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? parseFloat(v) : NaN;
      if (n > 0) return Math.ceil(n);
    }
  }
  for (const k of RETRY_AT_KEYS) {
    for (const src of sources) {
      const at = parseServerTime(src[k]);
      if (at > now) return Math.ceil((at - now) / 1000);
    }
  }
  return undefined;
}

// Build an ApiError from a failed response. detail = a string `detail`, else
// `detail.message`, else a top-level `message`/`error` (FastAPI 422 arrays are
// ignored; the proxy's own "backend_unreachable" is not a message).
export async function toApiError(res: Response): Promise<ApiError> {
  let j: Dict = {};
  try {
    const t = await res.text();
    if (t) {
      const parsed: unknown = JSON.parse(t);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) j = parsed as Dict;
    }
  } catch {
    /* non-JSON error body */
  }
  const dd = j.detail && typeof j.detail === "object" && !Array.isArray(j.detail) ? (j.detail as Dict) : {};
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const err = text(j.error);
  const detail =
    text(j.detail) ?? text(dd.message) ?? text(j.message) ?? (err && err !== "backend_unreachable" ? err : undefined);
  return new ApiError(res.status, detail, retryHint(res.headers.get("retry-after"), [dd, j]));
}

// Access-token refresh. lib/auth.tsx registers the handler (kept out of this
// module to avoid an import cycle); concurrent 401s share one refresh.
type RefreshHandler = (failedToken: string) => Promise<string | null>;
let refreshHandler: RefreshHandler | null = null;
let refreshing: Promise<string | null> | null = null;
export function setRefreshHandler(fn: RefreshHandler | null): void {
  refreshHandler = fn;
}
export function refreshAccessToken(failedToken = getToken() ?? ""): Promise<string | null> {
  if (!refreshHandler) return Promise.resolve(null);
  if (!refreshing) {
    refreshing = refreshHandler(failedToken).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}
// Never replay these on a 401: auth endpoints, and anything that submits a
// code — a wrong-code 401 sent twice would burn two of the three attempts.
const NO_REFRESH = /^\/(auth\/(login|refresh|register|password|logout|2fa)|identity\/verify)/;

export async function http<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const send = async (token: string | null): Promise<Response> => {
    try {
      return await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers || {}),
        },
      });
    } catch {
      throw new ApiError(0, "network_error");
    }
  };
  const token = getToken();
  let res = await send(token);
  // Expired access token → refresh once and replay. Tokenless 401s (guest AI
  // limit) never refresh.
  if (res.status === 401 && token && !NO_REFRESH.test(path)) {
    const fresh = await refreshAccessToken(token);
    if (fresh && fresh !== token) res = await send(fresh);
  }
  if (!res.ok) throw await toApiError(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export function absUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

// The same-origin proxy (/api/backend) can't upgrade WebSockets, so real-time
// features (secure-chat WS, call join links) must hit the backend directly.
// Resolve the backend origin: an explicit NEXT_PUBLIC_WS_ORIGIN, else an
// absolute API base, else the deployed backend.
export function backendOrigin(scheme: "http" | "ws"): string {
  const explicit = process.env.NEXT_PUBLIC_WS_ORIGIN;
  let origin = explicit
    ? explicit
    : /^https?:\/\//i.test(API_BASE)
      ? API_BASE
      : "https://lexgo.api.cognilabs.org";
  origin = origin.replace(/\/+$/, "");
  return scheme === "ws" ? origin.replace(/^http/i, "ws") : origin.replace(/^ws/i, "http");
}

// Turn a possibly-relative backend URL (e.g. a call join_url) into an absolute
// one pointing at the backend origin.
export function backendUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${backendOrigin("http")}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Small dict helpers shared by normalizers.
export type Dict = Record<string, unknown>;
export const asDict = (v: unknown): Dict =>
  v && typeof v === "object" ? (v as Dict) : {};
export const asStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v == null ? fallback : String(v);
export const asNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};
export const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Run a backend fetch, falling back to local mock data when the backend is
// unreachable or errors — keeps the app fully usable before the API is live.
export async function withFallback<T>(
  fetcher: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    const data = await fetcher();
    return data ?? fallback;
  } catch {
    return fallback;
  }
}
