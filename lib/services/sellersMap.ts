import { ApiError, asNum, asStr, http, type Dict } from "@/lib/http";
import { normNearby, type NearbySeller } from "@/lib/services/marketRuntime";

export type LngLat = [number, number];
export type MapBbox = { minLon: number; minLat: number; maxLon: number; maxLat: number };
export type CoordOrder = "longitude_latitude" | "latitude_longitude";

export type MapConfig = {
  provider: string;
  apiVersion: string;
  apiKey: string;
  configured: boolean;
  usable: boolean;
  center: LngLat;
  zoom: number;
  sellerMapUrl: string;
  coordinateOrder: CoordOrder;
  debounceMs: number;
  raw: Dict;
};

export type MapSeller = NearbySeller & { coords: LngLat };
export type MapCluster = { id: string; coords: LngLat; count: number; bbox: MapBbox | null };
export type SellersMapResult = { sellers: MapSeller[]; clusters: MapCluster[]; count: number; total: number; truncated: boolean; precision: string; raw: Dict };
export type MapLayout = { singles: MapSeller[]; groups: MapCluster[] };

export const DEFAULT_MAP_CENTER: LngLat = [69.2401, 41.2995];
export const DEFAULT_MAP_ZOOM = 11;
export const SPOT_ZOOM = 13;
export const DEFAULT_SELLER_MAP_URL = "/marketplace/sellers/map";
const DEFAULT_DEBOUNCE_MS = 400;
const CLUSTER_CELL_PX = 48;

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

function relPath(v: unknown, fallback: string): string {
  const s = trimmed(v);
  return /^\/(?!\/)[A-Za-z0-9/_-]+$/.test(s) ? s : fallback;
}

export function normMapConfig(v: unknown): MapConfig {
  const d = dictOf(v);
  const loc = dictOf(d.default_location ?? d.default_center);
  const order = coordOrderOf(d.coordinate_order);
  const center = lngLatOf(loc.center ?? (Object.keys(loc).length ? loc : d.center), order) ?? DEFAULT_MAP_CENTER;
  const zoomN = numOrNull(loc.zoom ?? d.default_zoom);
  const provider = trimmed(d.provider).toLowerCase();
  const apiVersion = trimmed(d.api_version).toLowerCase();
  const apiKey = trimmed(d.maps_api_key ?? d.api_key ?? d.apikey);
  const configured = d.configured !== false && apiKey !== "";
  const debounce = numOrNull(d.viewport_debounce_ms);
  return {
    provider,
    apiVersion,
    apiKey,
    configured,
    usable: configured && provider === "yandex" && (apiVersion === "" || apiVersion === "v3") && /^[A-Za-z0-9-]{8,80}$/.test(apiKey),
    center,
    zoom: zoomN === null ? DEFAULT_MAP_ZOOM : clampZoom(zoomN),
    sellerMapUrl: relPath(d.seller_map_url, DEFAULT_SELLER_MAP_URL),
    coordinateOrder: order,
    debounceMs: debounce !== null && debounce >= 100 && debounce <= 3000 ? Math.round(debounce) : DEFAULT_DEBOUNCE_MS,
    raw: d,
  };
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

export function yandexLang(locale: string): string {
  return locale.trim().toLowerCase().startsWith("en") ? "en_US" : "ru_RU";
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

function sellerOf(v: unknown, order: CoordOrder, precision: string): MapSeller | null {
  const f = flatFeature(v);
  const seller = dictOf(f.seller ?? f.lawyer);
  const sellerId = trimmed(f.seller_user_id ?? f.lawyer_user_id ?? f.user_id ?? f.seller_id ?? seller.user_id ?? seller.id) || trimmed(f.id);
  const base = normNearby({ items: [{ ...f, seller_user_id: sellerId, location_precision: f.location_precision ?? f.precision ?? precision }] }).items[0];
  if (!base) return null;
  const own = lngLatOf(f.coordinates, order);
  const coords = own ?? (base.longitude !== null && base.latitude !== null && validLngLat(base.longitude, base.latitude) ? ([base.longitude, base.latitude] as LngLat) : null);
  if (!coords) return null;
  return { ...base, longitude: coords[0], latitude: coords[1], coords, exact: false };
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

export type SellersMapQuery = { url?: string; bbox: MapBbox; zoom: number; serviceId?: string; sellerType?: string; limit?: number; order?: CoordOrder };

export async function getSellersMap(q: SellersMapQuery, signal?: AbortSignal): Promise<SellersMapResult> {
  const qs = new URLSearchParams({ bbox: bboxParam(q.bbox), zoom: String(clampZoom(q.zoom)) });
  const sid = (q.serviceId ?? "").trim();
  if (sid) qs.set("service_id", sid);
  const type = (q.sellerType ?? "").trim();
  if (type) qs.set("seller_type", type);
  if (q.limit && Number.isFinite(q.limit)) qs.set("limit", String(clamp(Math.round(q.limit), 1, 500)));
  try {
    return normSellersMap(await http(`${relPath(q.url, DEFAULT_SELLER_MAP_URL)}?${qs}`, { signal }), q.order);
  } catch (e) {
    if (e instanceof ApiError && e.code === "service_not_found") return emptySellersMap();
    throw e;
  }
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

export function gridCluster(sellers: readonly MapSeller[], zoom: number, cellPx = CLUSTER_CELL_PX): MapLayout {
  if (sellers.length < 2) return { singles: [...sellers], groups: [] };
  const z = clampZoom(zoom);
  const lonCell = (cellPx * 360) / (256 * 2 ** z);
  const midLat = sellers.reduce((s, x) => s + x.coords[1], 0) / sellers.length;
  const latCell = lonCell * Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  const cells = new Map<string, MapSeller[]>();
  for (const s of sellers) {
    const key = `${Math.floor(s.coords[0] / lonCell)}:${Math.floor(s.coords[1] / latCell)}`;
    const list = cells.get(key);
    if (list) list.push(s);
    else cells.set(key, [s]);
  }
  const singles: MapSeller[] = [];
  const groups: MapCluster[] = [];
  for (const [key, list] of cells) {
    if (list.length === 1) {
      singles.push(list[0]);
      continue;
    }
    const lon = list.reduce((s, x) => s + x.coords[0], 0) / list.length;
    const lat = list.reduce((s, x) => s + x.coords[1], 0) / list.length;
    groups.push({
      id: `g${key}`,
      coords: [lon, lat],
      count: list.length,
      bbox: bboxOfBounds([
        [Math.min(...list.map((x) => x.coords[0])), Math.min(...list.map((x) => x.coords[1]))],
        [Math.max(...list.map((x) => x.coords[0])), Math.max(...list.map((x) => x.coords[1]))],
      ]),
    });
  }
  return { singles, groups };
}

export function layoutOf(r: SellersMapResult, zoom: number): MapLayout {
  if (r.clusters.length) return { singles: r.sellers, groups: r.clusters };
  return gridCluster(r.sellers, zoom);
}

export function zoomForCluster(c: MapCluster, zoom: number): number {
  if (c.bbox) {
    const span = Math.max(c.bbox.maxLon - c.bbox.minLon, (c.bbox.maxLat - c.bbox.minLat) * 1.4, 0.0005);
    const fit = Math.floor(Math.log2(360 / span)) - 1;
    return clamp(Math.max(fit, clampZoom(zoom) + 1), 0, 19);
  }
  return clamp(clampZoom(zoom) + 2, 0, 19);
}
