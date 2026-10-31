import { ApiError, asNum, asStr, http, type Dict } from "@/lib/http";
import { normNearby, type NearbySeller } from "@/lib/services/marketRuntime";
import { getMarketplaceSeller, type MarketSeller } from "@/lib/services/marketplace";

export type LngLat = [number, number];
// Where a public marker comes from. Every one is approximate: "live" is the
// seller's shared position, "office" their office, "profile_region" only the
// centre of the region in their profile.
export type LocationSource = "live" | "office" | "profile_region" | "";
export type NavMode = "driving" | "walking" | "transit" | "bicycle";
export const NAV_MODES: readonly NavMode[] = ["driving", "walking", "transit", "bicycle"];
export type SellerNav = { available: boolean; modes: NavMode[]; endpoint: string };
// §7.3 service_action: `id` is the service id (there is no service_id).
// purchase_url is the backend's purchase endpoint; the page buys through the
// profile's own purchase dialog (?buy=<id>), which posts to it.
export type ServiceAction = { id: string; title: string; price: number; currency: string; canPurchase: boolean; purchaseUrl: string };
export type MapRealtime = { subscribe: string; unsubscribe: string; subscribed: string; update: string };
export type MapBbox = { minLon: number; minLat: number; maxLon: number; maxLat: number };
export type CoordOrder = "longitude_latitude" | "latitude_longitude";

// The Yandex Maps JS API versions the page can draw (§7.1: the backend runs 2.1).
export type MapEngine = "2.1";

export type MapConfig = {
  provider: string;
  apiVersion: string;
  // The renderer for api_version; "" when this page can't draw that version.
  engine: MapEngine | "";
  // maps_loader_url exactly as the backend gave it (it carries the key: never
  // log it or put it in a message).
  loaderUrl: string;
  configured: boolean;
  usable: boolean;
  center: LngLat;
  zoom: number;
  sellerMapUrl: string;
  coordinateOrder: CoordOrder;
  debounceMs: number;
  nearbySearchUrl: string;
  consentUrl: string;
  officeUrl: string;
  navigationTemplate: string;
  geocoderSearchUrl: string;
  geocoderReverseUrl: string;
  geocoderOn: boolean;
  accuracyWarnM: number;
  consentHours: number;
  consentDurations: number[];
  countryBbox: MapBbox | null;
  markerPrecision: string;
  nearbyPrecision: string;
  realtime: MapRealtime;
};

export type MapSeller = NearbySeller & { coords: LngLat; source: LocationSource; nav: SellerNav; service: ServiceAction | null };
export type MapCluster = { id: string; coords: LngLat; count: number; bbox: MapBbox | null };
export type SellersMapResult = { sellers: MapSeller[]; clusters: MapCluster[]; count: number; total: number; truncated: boolean; precision: string; raw: Dict };

export const DEFAULT_MAP_CENTER: LngLat = [69.2401, 41.2995];
export const DEFAULT_MAP_ZOOM = 11;
export const SPOT_ZOOM = 13;
export const DEFAULT_SELLER_MAP_URL = "/marketplace/sellers/map";
export const DEFAULT_NEARBY_SEARCH_URL = "/marketplace/nearby-sellers/search";
export const DEFAULT_CONSENT_URL = "/marketplace/me/location-consent";
export const DEFAULT_OFFICE_URL = "/marketplace/me/office-location";
export const DEFAULT_NAV_TEMPLATE = "/marketplace/sellers/{seller_user_id}/navigation";
export const DEFAULT_GEOCODER_SEARCH_URL = "/marketplace/geocoder/search";
export const DEFAULT_GEOCODER_REVERSE_URL = "/marketplace/geocoder/reverse";
export const DEFAULT_REALTIME: MapRealtime = {
  subscribe: "marketplace.map.subscribe",
  unsubscribe: "marketplace.map.unsubscribe",
  subscribed: "marketplace.map.subscribed",
  update: "marketplace.seller_location_updated",
};
// The whole country, for a list without a map (the config's country_bbox).
export const UZ_BBOX: MapBbox = { minLon: 55.9, minLat: 37.1, maxLon: 73.2, maxLat: 45.7 };
// From this zoom on the map endpoint answers single markers, not clusters.
export const MARKER_ZOOM = 13;
const DEFAULT_DEBOUNCE_MS = 400;

const dictOf = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const trimmed = (v: unknown): string => asStr(v).trim();
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const firstArr = (...vals: unknown[]): unknown[] => {
  for (const v of vals) if (Array.isArray(v)) return v;
  return [];
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fix2 = (v: number) => Number(v.toFixed(2));

export function clampZoom(z: number): number {
  return Number.isFinite(z) ? clamp(Math.round(z), 0, 21) : DEFAULT_MAP_ZOOM;
}

export function coordOrderOf(v: unknown): CoordOrder {
  const s = trimmed(v).toLowerCase().replace(/[\s-]+/g, "_");
  return /^(lat|latitude)_(lon|lng|long|longitude)$/.test(s) ? "latitude_longitude" : "longitude_latitude";
}

export function validLngLat(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
}

export function lngLatOf(v: unknown, order: CoordOrder = "longitude_latitude"): LngLat | null {
  if (Array.isArray(v)) {
    if (v.length < 2) return null;
    const a = numOrNull(v[0]);
    const b = numOrNull(v[1]);
    if (a === null || b === null) return null;
    const lon = order === "latitude_longitude" ? b : a;
    const lat = order === "latitude_longitude" ? a : b;
    return validLngLat(lon, lat) ? [lon, lat] : null;
  }
  const d = dictOf(v);
  const lat = numOrNull(d.latitude ?? d.lat);
  const lon = numOrNull(d.longitude ?? d.lon ?? d.lng);
  return lat !== null && lon !== null && validLngLat(lon, lat) ? [lon, lat] : null;
}

export function relPath(v: unknown, fallback: string): string {
  const s = trimmed(v);
  return /^\/(?!\/)[A-Za-z0-9/_-]+$/.test(s) ? s : fallback;
}

function navTemplateOf(v: unknown): string {
  const s = trimmed(v);
  return /^\/(?!\/)[A-Za-z0-9/_-]*\{seller_user_id\}[A-Za-z0-9/_-]*$/.test(s) ? s : DEFAULT_NAV_TEMPLATE;
}

const eventName = (v: unknown, fallback: string): string => {
  const s = trimmed(v);
  return /^[a-z][a-z0-9_.]{2,80}$/.test(s) ? s : fallback;
};

export function navModesOf(v: unknown): NavMode[] {
  const list = Array.isArray(v) ? v.map((x) => trimmed(x).toLowerCase()) : [];
  const modes = NAV_MODES.filter((m) => list.includes(m));
  return modes.length ? modes : [...NAV_MODES];
}

// navigation.available is the source of truth: the backend sets it only when
// the seller opened public office navigation (or an active paid order of
// this client unlocks the live location).
export function sellerNavOf(v: unknown): SellerNav {
  const d = dictOf(v);
  const nav = dictOf(d.navigation);
  const available = (nav.available ?? d.navigation_available) === true;
  return { available, modes: navModesOf(nav.modes), endpoint: relPath(nav.endpoint, "") };
}

export function serviceActionOf(v: unknown): ServiceAction | null {
  const a = dictOf(dictOf(v).service_action);
  const id = trimmed(a.id);
  if (!id) return null;
  const price = numOrNull(a.price);
  const currency = trimmed(a.currency).toUpperCase();
  return {
    id,
    title: trimmed(a.title),
    price: price !== null && price > 0 ? price : 0,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "UZS",
    canPurchase: a.can_purchase === true,
    purchaseUrl: relPath(a.purchase_url, ""),
  };
}

export function engineOf(apiVersion: string): MapEngine | "" {
  return /^v?2\.1(\.\d+)*$/.test(apiVersion) ? "2.1" : "";
}

// The script comes only from the config's maps_loader_url, and only from a
// Yandex Maps host over https; anything else means no map (the list).
export function loaderUrlOf(v: unknown): string {
  const s = trimmed(v);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return "";
    return /^(?:[a-z0-9-]+\.)*api-maps\.yandex\.(?:ru|com|uz|kz|by|com\.tr)$/.test(u.hostname) ? s : "";
  } catch {
    return "";
  }
}

export function normMapConfig(v: unknown): MapConfig {
  const d = dictOf(v);
  const loc = dictOf(d.default_location ?? d.default_center);
  const order = coordOrderOf(d.coordinate_order);
  const center = lngLatOf(loc.center ?? (Object.keys(loc).length ? loc : d.center), order) ?? DEFAULT_MAP_CENTER;
  const zoomN = numOrNull(loc.zoom ?? d.default_zoom);
  const provider = trimmed(d.provider).toLowerCase();
  const apiVersion = trimmed(d.api_version).toLowerCase();
  const engine = engineOf(apiVersion);
  const loaderUrl = loaderUrlOf(d.maps_loader_url);
  const configured = d.configured !== false;
  const debounce = numOrNull(d.viewport_debounce_ms);
  const policy = dictOf(d.consent_policy);
  const durations = (Array.isArray(policy.allowed_duration_hours) ? policy.allowed_duration_hours : [1, 24, 168, 720])
    .map(numOrNull)
    .filter((n): n is number => n !== null && n > 0)
    .map(Math.round);
  const allowed = durations.length ? durations : [1, 24, 168, 720];
  const wantHours = numOrNull(policy.default_duration_hours) ?? 24;
  const rt = dictOf(d.realtime);
  const warn = numOrNull(d.accuracy_warning_threshold_meters);
  return {
    provider,
    apiVersion,
    engine,
    loaderUrl,
    configured,
    // A map needs the backend's loader for a version this page draws (§7.1:
    // 2.1). An unknown version or no loader is the list, never a broken map.
    usable: configured && (provider === "" || provider === "yandex") && engine !== "" && loaderUrl !== "",
    center,
    zoom: zoomN === null ? DEFAULT_MAP_ZOOM : clampZoom(zoomN),
    sellerMapUrl: relPath(d.seller_map_url, DEFAULT_SELLER_MAP_URL),
    coordinateOrder: order,
    debounceMs: debounce !== null && debounce >= 100 && debounce <= 3000 ? Math.round(debounce) : DEFAULT_DEBOUNCE_MS,
    nearbySearchUrl: relPath(d.nearby_search_url, DEFAULT_NEARBY_SEARCH_URL),
    consentUrl: relPath(d.location_consent_url, DEFAULT_CONSENT_URL),
    officeUrl: relPath(d.seller_office_location_url, DEFAULT_OFFICE_URL),
    navigationTemplate: navTemplateOf(d.navigation_url_template),
    geocoderSearchUrl: relPath(d.geocoder_search_url, DEFAULT_GEOCODER_SEARCH_URL),
    geocoderReverseUrl: relPath(d.geocoder_reverse_url, DEFAULT_GEOCODER_REVERSE_URL),
    geocoderOn: d.geocoder_configured !== false,
    accuracyWarnM: warn !== null && warn > 0 ? Math.round(warn) : 500,
    consentHours: allowed.includes(wantHours) ? wantHours : allowed.includes(24) ? 24 : allowed[0],
    consentDurations: allowed,
    countryBbox: bboxOf(loc.country_bbox ?? d.country_bbox, "longitude_latitude"),
    markerPrecision: trimmed(dictOf(d.privacy).public_marker_precision).toLowerCase() || "approximate_500m",
    nearbyPrecision: trimmed(dictOf(d.privacy).nearby_precision).toLowerCase() || "approximate_50m",
    realtime: {
      subscribe: eventName(rt.subscribe_event, DEFAULT_REALTIME.subscribe),
      unsubscribe: eventName(rt.unsubscribe_event, DEFAULT_REALTIME.unsubscribe),
      subscribed: eventName(rt.subscribed_event, DEFAULT_REALTIME.subscribed),
      update: eventName(rt.update_event, DEFAULT_REALTIME.update),
    },
  };
}

// The config when the backend could not be asked: no map, the list only.
export function offlineMapConfig(): MapConfig {
  return { ...normMapConfig({ configured: false }), usable: false };
}

let configPromise: Promise<MapConfig> | null = null;

export function getMapConfig(): Promise<MapConfig> {
  if (!configPromise) {
    const p = http("/marketplace/map/config").then(normMapConfig);
    configPromise = p;
    p.catch(() => {
      if (configPromise === p) configPromise = null;
    });
  }
  return configPromise;
}

export function resetMapConfig(): void {
  configPromise = null;
}

export function bboxOfBounds(bounds: unknown): MapBbox | null {
  if (!Array.isArray(bounds) || bounds.length < 2) return null;
  const a = lngLatOf(bounds[0]);
  const b = lngLatOf(bounds[1]);
  if (!a || !b) return null;
  return { minLon: Math.min(a[0], b[0]), minLat: Math.min(a[1], b[1]), maxLon: Math.max(a[0], b[0]), maxLat: Math.max(a[1], b[1]) };
}

export function bboxOf(v: unknown, order: CoordOrder = "longitude_latitude"): MapBbox | null {
  if (Array.isArray(v) && v.length === 4) {
    const n = v.map(numOrNull);
    if (n.some((x) => x === null)) return null;
    const [minLon, minLat, maxLon, maxLat] = n as number[];
    return validLngLat(minLon, minLat) && validLngLat(maxLon, maxLat) && minLon <= maxLon && minLat <= maxLat ? { minLon, minLat, maxLon, maxLat } : null;
  }
  if (Array.isArray(v) && v.length === 2) {
    const a = lngLatOf(v[0], order);
    const b = lngLatOf(v[1], order);
    return a && b ? bboxOfBounds([a, b]) : null;
  }
  const d = dictOf(v);
  const minLon = numOrNull(d.min_longitude ?? d.min_lon ?? d.west);
  const minLat = numOrNull(d.min_latitude ?? d.min_lat ?? d.south);
  const maxLon = numOrNull(d.max_longitude ?? d.max_lon ?? d.east);
  const maxLat = numOrNull(d.max_latitude ?? d.max_lat ?? d.north);
  if (minLon === null || minLat === null || maxLon === null || maxLat === null) return null;
  return validLngLat(minLon, minLat) && validLngLat(maxLon, maxLat) && minLon <= maxLon && minLat <= maxLat ? { minLon, minLat, maxLon, maxLat } : null;
}

export function roundBboxOut(b: MapBbox): MapBbox {
  let minLon = fix2(clamp(Math.floor(b.minLon * 100) / 100, -180, 180));
  let maxLon = fix2(clamp(Math.ceil(b.maxLon * 100) / 100, -180, 180));
  let minLat = fix2(clamp(Math.floor(b.minLat * 100) / 100, -90, 90));
  let maxLat = fix2(clamp(Math.ceil(b.maxLat * 100) / 100, -90, 90));
  if (maxLon <= minLon) {
    if (minLon >= 180) minLon = 179.99;
    maxLon = fix2(minLon + 0.01);
  }
  if (maxLat <= minLat) {
    if (minLat >= 90) minLat = 89.99;
    maxLat = fix2(minLat + 0.01);
  }
  return { minLon, minLat, maxLon, maxLat };
}

export function bboxParam(b: MapBbox): string {
  const r = roundBboxOut(b);
  return [r.minLon, r.minLat, r.maxLon, r.maxLat].map(String).join(",");
}

function flatFeature(v: unknown): Dict {
  const d = dictOf(v);
  const props = dictOf(d.properties ?? d.props ?? d.data);
  const geom = dictOf(d.geometry);
  return { ...props, ...d, coordinates: d.coordinates ?? d.coords ?? d.position ?? d.center ?? geom.coordinates ?? props.coordinates };
}

function isClusterFeature(f: Dict): boolean {
  const kind = trimmed(f.type ?? f.kind ?? f.object_type).toLowerCase();
  if (kind === "cluster") return true;
  if (kind) return false;
  const count = numOrNull(f.count ?? f.size ?? f.point_count);
  const seller = trimmed(f.seller_user_id ?? f.lawyer_user_id ?? f.user_id ?? f.seller_id);
  return count !== null && count > 1 && !seller;
}

export function locationSourceOf(v: unknown): LocationSource {
  const d = dictOf(v);
  const s = trimmed(d.location_source ?? dictOf(d.location).source).toLowerCase();
  return s === "live" || s === "office" || s === "profile_region" ? s : "";
}

function sellerOf(v: unknown, order: CoordOrder, precision: string): MapSeller | null {
  const f = flatFeature(v);
  const seller = dictOf(f.seller ?? f.lawyer);
  const sellerId = trimmed(f.seller_user_id ?? f.lawyer_user_id ?? f.user_id ?? f.seller_id ?? seller.user_id ?? seller.id) || trimmed(f.id);
  const base = normNearby({ items: [{ ...f, name: f.display_name ?? f.name, seller_user_id: sellerId, location_precision: f.location_precision ?? f.precision ?? precision }] }).items[0];
  if (!base) return null;
  const own = lngLatOf(f.coordinates, order);
  const coords = own ?? (base.longitude !== null && base.latitude !== null && validLngLat(base.longitude, base.latitude) ? ([base.longitude, base.latitude] as LngLat) : null);
  if (!coords) return null;
  return { ...base, longitude: coords[0], latitude: coords[1], coords, exact: false, source: locationSourceOf(f), nav: sellerNavOf(f), service: serviceActionOf(f) };
}

function clusterOf(v: unknown, order: CoordOrder, i: number): MapCluster | null {
  const f = flatFeature(v);
  const coords = lngLatOf(f.coordinates, order) ?? lngLatOf(f, order);
  const count = numOrNull(f.count ?? f.size ?? f.total ?? f.sellers_count ?? f.point_count);
  if (!coords || count === null || count < 1) return null;
  return { id: trimmed(f.id ?? f.cluster_id) || `c${i}:${coords.join(",")}`, coords, count: Math.round(count), bbox: bboxOf(f.bbox ?? f.bounds, order) };
}

export function normSellersMap(v: unknown, fallbackOrder: CoordOrder = "longitude_latitude"): SellersMapResult {
  const d = dictOf(v);
  const order = d.coordinate_order === undefined ? fallbackOrder : coordOrderOf(d.coordinate_order);
  const precision = trimmed(d.location_precision).toLowerCase();
  const sellers: MapSeller[] = [];
  const seen = new Set<string>();
  const clusters: MapCluster[] = [];
  const markers = firstArr(d.markers);
  for (const raw of firstArr(d.items, d.sellers)) {
    const s = sellerOf(raw, order, precision);
    const k = s ? s.sellerUserId || `${s.name}@${s.coords.join(",")}` : "";
    if (s && !seen.has(k)) {
      seen.add(k);
      sellers.push(s);
    }
  }
  markers.forEach((raw, i) => {
    const f = flatFeature(raw);
    if (isClusterFeature(f)) {
      const c = clusterOf(raw, order, i);
      if (c) clusters.push(c);
      return;
    }
    const s = sellerOf(raw, order, precision);
    const k = s ? s.sellerUserId || `${s.name}@${s.coords.join(",")}` : "";
    if (s && !seen.has(k)) {
      seen.add(k);
      sellers.push(s);
    }
  });
  firstArr(d.clusters).forEach((raw, i) => {
    const c = clusterOf(raw, order, i + markers.length);
    if (c) clusters.push(c);
  });
  const shown = sellers.length + clusters.reduce((n, c) => n + c.count, 0);
  const total = numOrNull(d.total_in_bbox ?? d.total);
  return {
    sellers,
    clusters,
    count: asNum(d.count, sellers.length),
    total: total !== null && total >= 0 ? Math.round(total) : shown,
    truncated: d.truncated === true,
    precision,
    raw: d,
  };
}

export function emptySellersMap(): SellersMapResult {
  return { sellers: [], clusters: [], count: 0, total: 0, truncated: false, precision: "", raw: {} };
}

export type SellerTypeFilter = "" | "advokat" | "yurist" | "advokat_tashkiloti";
export const SELLER_TYPE_FILTERS: readonly Exclude<SellerTypeFilter, "">[] = ["advokat", "yurist", "advokat_tashkiloti"];
export const MIN_RATING_STEPS: readonly number[] = [0, 3, 4, 4.5];
// The map and nearby filters. verified_only is on by default (the backend's
// own default): unverified specialists show only when the client asks.
export type MapFilters = { serviceId: string; categoryId: string; subcategoryId: string; sellerType: SellerTypeFilter; minRating: number; verifiedOnly: boolean };
export const DEFAULT_MAP_FILTERS: MapFilters = { serviceId: "", categoryId: "", subcategoryId: "", sellerType: "", minRating: 0, verifiedOnly: true };

export function sellerTypeFilterOf(v: unknown): SellerTypeFilter {
  const s = trimmed(v).toLowerCase();
  return (SELLER_TYPE_FILTERS as readonly string[]).includes(s) ? (s as SellerTypeFilter) : "";
}

export function filtersKey(f: MapFilters): string {
  return [f.serviceId, f.categoryId, f.subcategoryId, f.sellerType, f.minRating, f.verifiedOnly ? 1 : 0].join("|");
}

export function filterParams(f: MapFilters, qs: URLSearchParams): URLSearchParams {
  const put = (k: string, v: string) => {
    const s = v.trim();
    if (s) qs.set(k, s);
  };
  put("service_id", f.serviceId);
  put("category_id", f.categoryId);
  put("subcategory_id", f.subcategoryId);
  put("seller_type", f.sellerType);
  if (f.minRating > 0) qs.set("minimum_rating", String(clamp(f.minRating, 0, 5)));
  qs.set("verified_only", f.verifiedOnly ? "true" : "false");
  return qs;
}

export type SellersMapQuery = { url?: string; bbox: MapBbox; zoom: number; filters?: MapFilters; serviceId?: string; sellerType?: string; limit?: number; order?: CoordOrder };

export async function getSellersMap(q: SellersMapQuery, signal?: AbortSignal): Promise<SellersMapResult> {
  const qs = new URLSearchParams({ bbox: bboxParam(q.bbox), zoom: String(clampZoom(q.zoom)) });
  const f: MapFilters = q.filters ?? { ...DEFAULT_MAP_FILTERS, serviceId: q.serviceId ?? "", sellerType: sellerTypeFilterOf(q.sellerType) };
  filterParams(f, qs);
  if (q.limit && Number.isFinite(q.limit)) qs.set("limit", String(clamp(Math.round(q.limit), 1, 500)));
  return normSellersMap(await http(`${relPath(q.url, DEFAULT_SELLER_MAP_URL)}?${qs}`, { signal }), q.order);
}

export type SellersMapFailure = "aborted" | "missing" | "load";

export function sellersMapFailureOf(e: unknown): SellersMapFailure {
  if (!(e instanceof ApiError)) return "load";
  if (e.status === 0 && e.detail === "aborted") return "aborted";
  if (!e.code && (e.status === 404 || e.status === 405 || e.status === 501) && (!e.detail || e.detail === "Not Found")) return "missing";
  return "load";
}

export function isEmptyMap(r: SellersMapResult): boolean {
  return r.sellers.length === 0 && r.clusters.length === 0 && r.total === 0;
}

export function zoomForCluster(c: MapCluster, zoom: number): number {
  if (c.bbox) {
    const span = Math.max(c.bbox.maxLon - c.bbox.minLon, (c.bbox.maxLat - c.bbox.minLat) * 1.4, 0.0005);
    const fit = Math.floor(Math.log2(360 / span)) - 1;
    return clamp(Math.max(fit, clampZoom(zoom) + 1), 0, 19);
  }
  return clamp(clampZoom(zoom) + 2, 0, 19);
}

export type MapSellerView = { name: string; sellerType: string; region: string; rating: number; reviewsCount: number; verified: boolean; priceFrom: number };

function firstText(own: string, more: readonly MarketSeller[], get: (m: MarketSeller) => string): string {
  if (own) return own;
  for (const m of more) {
    const v = trimmed(get(m));
    if (v) return v;
  }
  return "";
}

export function mapSellerView(s: MapSeller, ...more: (MarketSeller | null | undefined)[]): MapSellerView {
  const src = more.filter((m): m is MarketSeller => !!m);
  const rated = s.rating > 0 ? { rating: s.rating, reviewsCount: s.reviewsCount } : (src.find((m) => m.rated && m.rating > 0) ?? null);
  const priced = src.find((m) => m.priceFrom > 0);
  return {
    name: firstText(s.name, src, (m) => m.name),
    sellerType: firstText(s.sellerType, src, (m) => m.sellerType).toLowerCase(),
    region: firstText(s.region, src, (m) => m.region),
    rating: rated ? rated.rating : 0,
    reviewsCount: rated ? rated.reviewsCount : 0,
    verified: s.verified || src.some((m) => m.verified),
    priceFrom: priced ? priced.priceFrom : 0,
  };
}

export type MapSellerInfo = ReadonlyMap<string, MarketSeller | null>;

const INFO_PARALLEL = 3;
const INFO_RETRY_MS = 30_000;
const INFO_QUEUE_MAX = 40;
const EMPTY_INFO: MapSellerInfo = new Map();
let infoSnap: MapSellerInfo = EMPTY_INFO;
let infoGen = 0;
const infoBusy = new Set<string>();
const infoQueue: string[] = [];
const infoRetryAt = new Map<string, number>();
const infoSubs = new Set<() => void>();

function putInfo(id: string, v: MarketSeller | null): void {
  infoSnap = new Map(infoSnap).set(id, v);
  for (const fn of [...infoSubs]) fn();
}

export function subscribeMapSellerInfo(fn: () => void): () => void {
  infoSubs.add(fn);
  return () => {
    infoSubs.delete(fn);
  };
}

export function mapSellerInfoSnapshot(): MapSellerInfo {
  return infoSnap;
}

export function mapSellerInfoServerSnapshot(): MapSellerInfo {
  return EMPTY_INFO;
}

function infoDue(id: string, now: number): boolean {
  if (!infoSnap.has(id)) return true;
  const at = infoRetryAt.get(id);
  return at !== undefined && at <= now;
}

function pumpInfo(): void {
  while (infoBusy.size < INFO_PARALLEL && infoQueue.length) {
    const id = infoQueue.shift() as string;
    if (infoBusy.has(id) || !infoDue(id, Date.now())) continue;
    infoBusy.add(id);
    const gen = infoGen;
    getMarketplaceSeller(id).then(
      (s) => {
        if (gen !== infoGen) return;
        infoRetryAt.delete(id);
        putInfo(id, s.name || s.userId ? s : null);
      },
      (e) => {
        if (gen !== infoGen) return;
        if (e instanceof ApiError && (e.status === 404 || e.status === 410)) infoRetryAt.delete(id);
        else infoRetryAt.set(id, Date.now() + INFO_RETRY_MS);
        putInfo(id, null);
      },
    ).finally(() => {
      if (gen !== infoGen) return;
      infoBusy.delete(id);
      pumpInfo();
    });
  }
}

export function loadMapSellerInfo(ids: readonly string[]): void {
  const now = Date.now();
  for (const raw of ids) {
    const id = trimmed(raw);
    if (!id || infoBusy.has(id) || infoQueue.includes(id) || !infoDue(id, now)) continue;
    infoQueue.push(id);
  }
  if (infoQueue.length > INFO_QUEUE_MAX) infoQueue.splice(0, infoQueue.length - INFO_QUEUE_MAX);
  pumpInfo();
}

export function resetMapSellerInfo(): void {
  infoGen++;
  infoBusy.clear();
  infoQueue.length = 0;
  infoRetryAt.clear();
  infoSnap = EMPTY_INFO;
  for (const fn of [...infoSubs]) fn();
}
