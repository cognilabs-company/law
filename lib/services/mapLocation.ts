// LEXGO_YANDEX_MARKETPLACE_MAP_FRONTEND_2026_10_30: the client's location
// consent, the nearby search, the backend-built Yandex route and a seller's
// office location. Coordinates go out only inside these requests, after an
// explicit action and an active consent; nothing here keeps them anywhere
// (no localStorage, no sessionStorage). Map markers and config live in
// sellersMap.ts.
import { ApiError, asNum, asStr, http, type Dict } from "@/lib/http";
import { marketErrorInfo, normNearby, NEARBY_RADII, type NearbyRadius, type NearbySeller } from "@/lib/services/marketRuntime";
import {
  DEFAULT_CONSENT_URL,
  DEFAULT_GEOCODER_REVERSE_URL,
  DEFAULT_GEOCODER_SEARCH_URL,
  DEFAULT_NAV_TEMPLATE,
  DEFAULT_NEARBY_SEARCH_URL,
  DEFAULT_OFFICE_URL,
  lngLatOf,
  locationSourceOf,
  relPath,
  sellerNavOf,
  serviceActionOf,
  type LngLat,
  type LocationSource,
  type MapFilters,
  type NavMode,
  type SellerNav,
  type ServiceAction,
} from "@/lib/services/sellersMap";

const dictOf = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const trimmed = (v: unknown): string => asStr(v).trim();
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const timeOf = (v: unknown): number | null => {
  const s = trimmed(v);
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
};

export type Point = { latitude: number; longitude: number };
export type ConsentSource = "web" | "manual";
export type PermissionState = "granted" | "denied" | "prompt" | "unavailable";

// ── Consent ─────────────────────────────────────────────────────────────

export type LocationConsent = { granted: boolean; permissionState: PermissionState | ""; source: string; expiresAt: number | null; grantedAt: number | null };

export function normConsent(v: unknown): LocationConsent {
  const d = dictOf(v);
  const state = trimmed(d.permission_state).toLowerCase();
  const expiresAt = timeOf(d.expires_at);
  return {
    // An expired consent is no consent, whatever the flag still says.
    granted: d.granted === true && (expiresAt === null || expiresAt > Date.now()),
    permissionState: state === "granted" || state === "denied" || state === "prompt" || state === "unavailable" ? state : "",
    source: trimmed(d.source).toLowerCase(),
    expiresAt,
    grantedAt: timeOf(d.granted_at),
  };
}

export async function getLocationConsent(url = DEFAULT_CONSENT_URL, signal?: AbortSignal): Promise<LocationConsent> {
  return normConsent(await http(relPath(url, DEFAULT_CONSENT_URL), { signal }));
}

export type ConsentInput = { granted: true; source: ConsentSource; durationHours: number | null } | { granted: false; permissionState: "denied" | "prompt"; source?: ConsentSource };

export function consentBody(input: ConsentInput): Dict {
  if (input.granted) return { granted: true, permission_state: "granted", source: input.source, duration_hours: input.durationHours };
  return { granted: false, permission_state: input.permissionState, source: input.source ?? "web" };
}

export async function recordLocationConsent(input: ConsentInput, url = DEFAULT_CONSENT_URL): Promise<LocationConsent> {
  return normConsent(await http(relPath(url, DEFAULT_CONSENT_URL), { method: "POST", body: JSON.stringify(consentBody(input)) }));
}

// ── Nearby search ───────────────────────────────────────────────────────

export type NearbySort = "nearest" | "rating" | "recommended";
export const NEARBY_SORTS: readonly NearbySort[] = ["nearest", "rating", "recommended"];

export type NearbyHit = NearbySeller & { source: LocationSource; coords: LngLat | null; nav: SellerNav; service: ServiceAction | null };
export type NearbySearchResult = {
  items: NearbyHit[];
  count: number;
  radiusKm: number;
  fallbackNearest: boolean;
  sort: NearbySort;
  accuracyWarning: boolean;
  accuracyMeters: number;
  warnMeters: number;
  consent: LocationConsent | null;
};

export function sortOf(v: unknown): NearbySort {
  const s = trimmed(v).toLowerCase();
  return (NEARBY_SORTS as readonly string[]).includes(s) ? (s as NearbySort) : "nearest";
}

function hitOf(raw: unknown): NearbyHit | null {
  const d = dictOf(raw);
  const loc = dictOf(d.location ?? d.approximate_location);
  const base = normNearby({ items: [{ ...d, name: d.display_name ?? d.name, location_precision: d.location_precision ?? loc.precision }] }).items[0];
  if (!base) return null;
  const coords = lngLatOf(d.coordinates ?? loc.coordinates) ?? lngLatOf(Object.keys(loc).length ? loc : d);
  return {
    ...base,
    latitude: coords ? coords[1] : base.latitude,
    longitude: coords ? coords[0] : base.longitude,
    // Search results are approximate too; an exact point only ever comes
    // with an active paid order, and is used for the route, never shown.
    exact: false,
    source: locationSourceOf({ ...d, location: loc }),
    coords,
    nav: sellerNavOf(d),
    service: serviceActionOf(d),
  };
}

export function normNearbySearch(v: unknown, asked: { radius: NearbyRadius; sort: NearbySort }): NearbySearchResult {
  const d = dictOf(v);
  const items: NearbyHit[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(d.items) ? d.items : Array.isArray(v) ? v : []) {
    const h = hitOf(raw);
    const k = h ? h.sellerUserId || h.name : "";
    if (h && k && !seen.has(k)) {
      seen.add(k);
      items.push(h);
    }
  }
  const radius = numOrNull(d.radius_km);
  return {
    items,
    count: asNum(d.count, items.length),
    radiusKm: radius !== null && radius > 0 ? radius : asked.radius,
    fallbackNearest: d.fallback_nearest === true,
    sort: d.sort === undefined ? asked.sort : sortOf(d.sort),
    accuracyWarning: d.accuracy_warning === true,
    accuracyMeters: Math.max(0, Math.round(asNum(d.accuracy_meters))),
    warnMeters: Math.max(0, Math.round(asNum(d.accuracy_warning_threshold_meters, 500))),
    consent: d.consent && typeof d.consent === "object" ? normConsent(d.consent) : null,
  };
}

export type NearbySearchInput = { point: Point; accuracyM: number | null; radius: NearbyRadius; sort: NearbySort; filters: MapFilters; limit?: number; paidOrderId?: string };

export function nearbySearchBody(q: NearbySearchInput): Dict {
  const radius = (NEARBY_RADII as readonly number[]).includes(q.radius) ? q.radius : 10;
  const f = q.filters;
  const id = (s: string) => s.trim() || null;
  return {
    latitude: q.point.latitude,
    longitude: q.point.longitude,
    accuracy_meters: q.accuracyM !== null && Number.isFinite(q.accuracyM) ? Math.min(100000, Math.max(0, Math.round(q.accuracyM))) : 0,
    radius_km: radius,
    service_id: id(f.serviceId),
    category_id: id(f.categoryId),
    subcategory_id: id(f.subcategoryId),
    seller_type: id(f.sellerType),
    minimum_rating: Math.min(5, Math.max(0, f.minRating)),
    verified_only: f.verifiedOnly,
    sort: q.sort,
    limit: Math.min(100, Math.max(1, Math.round(q.limit ?? 50))),
    ...(q.paidOrderId ? { paid_order_id: q.paidOrderId } : {}),
  };
}

export async function searchNearbySellers(q: NearbySearchInput, url = DEFAULT_NEARBY_SEARCH_URL, signal?: AbortSignal): Promise<NearbySearchResult> {
  const out = await http(relPath(url, DEFAULT_NEARBY_SEARCH_URL), { method: "POST", body: JSON.stringify(nearbySearchBody(q)), signal });
  return normNearbySearch(out, { radius: q.radius, sort: q.sort });
}

// ── Navigation ──────────────────────────────────────────────────────────

export type NavRoute = { appUrl: string; webUrl: string; fallbackUrl: string; destinationSource: "public_office" | "paid_order_live_location" | ""; mode: NavMode | ""; name: string };

// Only the backend builds route links. They are opened as given, after a
// scheme check: an app scheme or https, never script or data URLs.
export function safeRouteUrl(v: unknown, app: boolean): string {
  const s = trimmed(v);
  if (!s) return "";
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!m) return "";
  const scheme = m[1].toLowerCase();
  if (scheme === "https") return s;
  if (!app) return "";
  return /^(javascript|data|vbscript|file|blob|about|http)$/.test(scheme) ? "" : s;
}

export function normNavRoute(v: unknown): NavRoute {
  const d = dictOf(v);
  const src = trimmed(d.destination_source).toLowerCase();
  const mode = trimmed(d.mode).toLowerCase();
  return {
    appUrl: safeRouteUrl(d.app_url, true),
    webUrl: safeRouteUrl(d.web_url, false),
    fallbackUrl: safeRouteUrl(d.fallback_url, false),
    destinationSource: src === "public_office" || src === "paid_order_live_location" ? src : "",
    mode: mode === "driving" || mode === "walking" || mode === "transit" || mode === "bicycle" ? mode : "",
    name: trimmed(d.display_name),
  };
}

export function navigationPath(sellerUserId: string, endpoint = "", template = DEFAULT_NAV_TEMPLATE): string {
  const own = relPath(endpoint, "");
  if (own) return own;
  const tpl = /\{seller_user_id\}/.test(template) ? template : DEFAULT_NAV_TEMPLATE;
  return tpl.replace("{seller_user_id}", encodeURIComponent(sellerUserId));
}

export async function requestNavigation(q: { sellerUserId: string; endpoint?: string; template?: string; point: Point; mode: NavMode; paidOrderId?: string }): Promise<NavRoute> {
  const body = { latitude: q.point.latitude, longitude: q.point.longitude, mode: q.mode, paid_order_id: q.paidOrderId || null };
  return normNavRoute(await http(navigationPath(q.sellerUserId, q.endpoint, q.template), { method: "POST", body: JSON.stringify(body) }));
}

// ── Seller office ───────────────────────────────────────────────────────

export type OfficeLocation = { configured: boolean; point: Point | null; address: string; publicNavigation: boolean; updatedAt: number | null };

export function normOffice(v: unknown): OfficeLocation {
  const d = dictOf(v);
  const o = dictOf(d.office ?? (d.latitude !== undefined ? d : null));
  const ll = lngLatOf(o.coordinates) ?? lngLatOf(o);
  const point = ll ? { latitude: ll[1], longitude: ll[0] } : null;
  return {
    configured: d.configured === true || (d.configured === undefined && !!point),
    point,
    address: trimmed(o.formatted_address ?? o.address),
    publicNavigation: o.public_navigation_enabled === true,
    updatedAt: timeOf(o.updated_at),
  };
}

export async function getOfficeLocation(url = DEFAULT_OFFICE_URL, signal?: AbortSignal): Promise<OfficeLocation> {
  return normOffice(await http(relPath(url, DEFAULT_OFFICE_URL), { signal }));
}

export async function saveOfficeLocation(input: { point: Point; address: string; publicNavigation: boolean }, url = DEFAULT_OFFICE_URL): Promise<OfficeLocation> {
  const body = { latitude: input.point.latitude, longitude: input.point.longitude, formatted_address: input.address.trim().slice(0, 500), public_navigation_enabled: input.publicNavigation };
  return normOffice(await http(relPath(url, DEFAULT_OFFICE_URL), { method: "PUT", body: JSON.stringify(body) }));
}

// ── Geocoder (backend proxy; signed-in) ─────────────────────────────────

export type Place = { key: string; title: string; detail: string; point: Point };

export function geocoderLang(locale: string): "uz_UZ" | "ru_RU" | "en_RU" {
  const l = locale.trim().toLowerCase();
  return l.startsWith("ru") ? "ru_RU" : l.startsWith("en") ? "en_RU" : "uz_UZ";
}

export function normPlaces(v: unknown): Place[] {
  const d = dictOf(v);
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(d.items) ? d.items : []) {
    const x = dictOf(raw);
    const ll = lngLatOf(x.coordinates ?? x.point ?? x.position) ?? lngLatOf(x);
    const full = trimmed(x.formatted_address ?? x.address ?? x.text);
    const title = trimmed(x.name ?? x.title) || full;
    if (!ll || !title) continue;
    const detail = full && full !== title ? full : trimmed(x.description ?? x.subtitle);
    const key = `${ll[0].toFixed(5)},${ll[1].toFixed(5)}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, title, detail, point: { latitude: ll[1], longitude: ll[0] } });
  }
  return out;
}

export async function geocodeSearch(q: string, locale: string, url = DEFAULT_GEOCODER_SEARCH_URL, signal?: AbortSignal): Promise<Place[]> {
  const text = q.trim().slice(0, 200);
  if (text.length < 2) return [];
  const qs = new URLSearchParams({ q: text, lang: geocoderLang(locale), limit: "7" });
  return normPlaces(await http(`${relPath(url, DEFAULT_GEOCODER_SEARCH_URL)}?${qs}`, { signal }));
}

export async function geocodeReverse(p: Point, locale: string, url = DEFAULT_GEOCODER_REVERSE_URL, signal?: AbortSignal): Promise<Place | null> {
  const qs = new URLSearchParams({ latitude: String(p.latitude), longitude: String(p.longitude), lang: geocoderLang(locale) });
  return normPlaces(await http(`${relPath(url, DEFAULT_GEOCODER_REVERSE_URL)}?${qs}`, { signal }))[0] ?? null;
}

// ── Errors ──────────────────────────────────────────────────────────────

// Every backend code this contract lists, each with its own translated text
// (marketMap.errors.<key>); anything else falls back to a status-based text.
export const MAP_ERROR_CODES = [
  "client_location_consent_required",
  "navigation_destination_unavailable",
  "seller_not_found",
  "paid_order_not_found",
  "active_paid_order_required",
  "service_not_found",
  "category_not_found",
  "subcategory_not_found",
  "radius_invalid",
  "seller_type_invalid",
  "subcategory_category_mismatch",
] as const;
export type MapErrorKey = (typeof MAP_ERROR_CODES)[number] | "login_required" | "forbidden" | "not_found" | "rate_limited" | "offline" | "generic";

export function mapErrorKey(e: unknown): MapErrorKey {
  if (!(e instanceof ApiError)) return "generic";
  const info = marketErrorInfo(e);
  const code = (info?.code ?? "").toLowerCase();
  if ((MAP_ERROR_CODES as readonly string[]).includes(code)) return code as MapErrorKey;
  if (e.status === 401) return "login_required";
  if (e.status === 403) return "forbidden";
  if (e.status === 404) return "not_found";
  if (e.status === 429) return "rate_limited";
  if (e.status === 0) return "offline";
  return "generic";
}

export const isAborted = (e: unknown): boolean => e instanceof ApiError && e.status === 0 && e.detail === "aborted";

// A filter the backend no longer knows (a removed service or category):
// the UI offers to clear exactly that filter.
export function filterOfError(k: MapErrorKey): keyof MapFilters | null {
  if (k === "service_not_found") return "serviceId";
  if (k === "category_not_found") return "categoryId";
  if (k === "subcategory_not_found" || k === "subcategory_category_mismatch") return "subcategoryId";
  if (k === "seller_type_invalid") return "sellerType";
  return null;
}
