"use client";

import { useSyncExternalStore } from "react";
import { bboxOfBounds, clampZoom, lngLatOf, type LngLat, type MapBbox, type MapConfig } from "@/lib/services/sellersMap";
import { hasConsent, subscribeConsent } from "@/lib/consent";

// The Yandex map behind both map components (the seller map, the point
// picker). The script comes only from the config's maps_loader_url and is
// drawn by the renderer for its api_version (§7.1: JS API 2.1). The
// components see only MapHandle, never the Yandex objects. The loader URL
// carries the key: it is never logged and never part of an error.
// Yandex sets its own cookies, so the script is loaded only with the
// visitor's "functional" cookie consent (lib/consent.ts, MapConsentGate).

// ── The parts of the JS API 2.1 used here ───────────────────────────────
type YEvent = { get: (key: string) => unknown };
type YEvents = { add: (type: string, cb: (e: YEvent) => void) => unknown };
type YProps = Record<string, unknown>;
type YManager = { set: (v: YProps) => unknown; get?: (key: string) => unknown };
type YGeometry = { setCoordinates?: (c: unknown) => unknown };
type YGeoObject = { events: YEvents; properties: YManager; options: YManager; geometry?: YGeometry };
type YCluster = YGeoObject & { getBounds: () => unknown };
type YCollection = { add: (o: unknown) => unknown; remove: (o: unknown) => unknown };
type YClusterer = YCollection & { createCluster: (center: unknown, geoObjects: YGeoObject[]) => YCluster };
type YMoveOpts = { duration?: number; checkZoomRange?: boolean; zoomMargin?: number };
type YProjection = { toGlobalPixels: (point: number[], zoom: number) => unknown; fromGlobalPixels: (px: number[], zoom: number) => unknown };
type YMap = {
  geoObjects: YCollection;
  events: YEvents;
  panes: { get: (key: string) => { getElement: () => HTMLElement } | null };
  options?: { get: (key: string) => unknown };
  container?: { getSize?: () => unknown };
  getGlobalPixelCenter?: () => unknown;
  getBounds: () => unknown;
  getZoom: () => number;
  getCenter: () => unknown;
  setCenter: (center: number[], zoom?: number, opts?: YMoveOpts) => unknown;
  setZoom: (zoom: number, opts?: YMoveOpts) => unknown;
  destroy: () => void;
};
type Ymaps21 = {
  ready: (ok: () => void, fail?: (e: unknown) => void) => unknown;
  Map: new (el: HTMLElement, state: YProps, options?: YProps) => YMap;
  Placemark: new (coords: number[], props: YProps, options: YProps) => YGeoObject;
  Polyline?: new (coords: number[][], props: YProps, options: YProps) => YGeoObject;
  Clusterer: { new (options: YProps): YClusterer; prototype: YClusterer };
  templateLayoutFactory: { createClass: (template: string) => unknown };
  meta?: { coordinatesOrder?: string };
};

const LOAD_TIMEOUT_MS = 15000;
let pending: Promise<Ymaps21> | null = null;
let loadedUrl = "";

function globalYmaps(): Ymaps21 | null {
  const y = (window as unknown as { ymaps?: Partial<Record<keyof Ymaps21, unknown>> }).ymaps;
  return y && typeof y === "object" && typeof y.ready === "function" ? (y as Ymaps21) : null;
}

const complete = (y: Ymaps21) =>
  typeof y.Map === "function" && typeof y.Placemark === "function" && typeof y.Clusterer === "function" && typeof y.templateLayoutFactory?.createClass === "function";

function loadYmaps21(loaderUrl: string, timeoutMs = LOAD_TIMEOUT_MS): Promise<Ymaps21> {
  if (loadedUrl && loadedUrl !== loaderUrl && (pending || globalYmaps())) unloadYmaps();
  if (pending) return pending;
  loadedUrl = loaderUrl;
  const p = new Promise<Ymaps21>((resolve, reject) => {
    let script: HTMLScriptElement | null = null;
    let settled = false;
    const finish = (err: Error | null, y?: Ymaps21) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (err) {
        if (script && !globalYmaps()) script.remove();
        reject(err);
      } else resolve(y as Ymaps21);
    };
    const timer = window.setTimeout(() => finish(new Error("ymaps_timeout")), timeoutMs);
    const whenReady = () => {
      const y = globalYmaps();
      if (!y) return finish(new Error("ymaps_missing"));
      try {
        y.ready(
          () => (complete(y) ? finish(null, y) : finish(new Error("ymaps_incomplete"))),
          () => finish(new Error("ymaps_not_ready")),
        );
      } catch {
        finish(new Error("ymaps_not_ready"));
      }
    };
    if (globalYmaps()) return whenReady();
    script = document.createElement("script");
    script.src = loaderUrl;
    script.async = true;
    script.dataset.lexgoMap = "yandex";
    script.onload = whenReady;
    script.onerror = () => finish(new Error("ymaps_load"));
    document.head.appendChild(script);
  });
  pending = p;
  p.catch(() => {
    if (pending === p) pending = null;
  });
  return p;
}

// ── What the components use ─────────────────────────────────────────────
// A marker drawn from one of our templates. Values are plain text: the API
// escapes them and `safe` strips the characters that could leave an
// attribute anyway. `onActivate` runs on a click and, for the focusable
// kinds, on Enter or Space.
export type MarkKind = "pin" | "pin-mute" | "group" | "me" | "pick" | "dest" | "pulse" | "radar" | "ring";
export type MarkFx = "drop" | "pop" | "";
export type MarkSpec = {
  kind: MarkKind;
  coords: LngLat;
  title: string;
  text?: string;
  cls?: string;
  size?: string;
  seller?: string;
  cluster?: string;
  sellers?: string;
  src?: string;
  z: number;
  fx?: MarkFx;
  i?: number;
  onActivate?: () => void;
};
export type Mark = {
  set: (p: { title?: string; text?: string; cls?: string; size?: string }) => void;
  move: (coords: LngLat, ms?: number) => void;
  vars: (v: Record<string, string | number | null>) => void;
  flag: (name: string, on: boolean, ms?: number) => void;
  remove: () => void;
};
export type MarkGroup = { marks: Mark[]; remove: () => void };
export type GroupOptions = { gridPx: number; title: (n: number) => string; moveMs: () => number };
export type PinSpec = MarkSpec & { id: string };
export type PinSet = { sync: (specs: PinSpec[]) => void; get: (id: string) => Mark | undefined; remove: () => void };
export type Pad = { top: number; right: number; bottom: number; left: number };
export type FitOptions = { ms: number; maxZoom?: number; margin?: number };
export type RouteOptions = { color: string; casing: string; glow: string; past: string; drawMs: number; delayMs?: number; flow: boolean; straight: boolean };
export type GuideRoute = { set: (points: LngLat[], ms?: number) => void; progress: (at: LngLat | null) => void; remove: () => void };
export type RadiusRing = { set: (center: LngLat, km: number, title?: string) => void; remove: () => void };
export type MapHandle = {
  bbox: () => MapBbox | null;
  zoom: () => number;
  center: () => LngLat | null;
  moveTo: (center: LngLat, zoom: number, ms: number) => void;
  setZoom: (zoom: number, ms: number) => void;
  onView: (cb: () => void) => void;
  onClick: (cb: (p: LngLat) => void) => void;
  onGesture: (cb: () => void) => void;
  setTheme: (theme: "light" | "dark") => void;
  setPadding: (p: Partial<Pad>) => void;
  pixel: (ll: LngLat) => [number, number] | null;
  inView: (ll: LngLat) => boolean;
  fit: (points: LngLat[], opts: FitOptions) => void;
  follow: (point: LngLat, opts: { zoom?: number; ms: number }) => void;
  mark: (spec: MarkSpec) => Mark;
  // Seller pins grouped by the API's Clusterer: pins closer than gridPx on
  // screen show as one count that zooms in on a click or Enter.
  group: (specs: MarkSpec[], opts: GroupOptions) => MarkGroup;
  pins: (opts: GroupOptions) => PinSet;
  select: (seller: string | null) => void;
  spreadFrom: (origin: LngLat, ms: number) => void;
  route: (points: LngLat[], opts: RouteOptions) => GuideRoute;
  ring: (center: LngLat, km: number, title: string) => RadiusRing;
  destroy: () => void;
};
export type MapView = { center: LngLat; zoom: number; theme: "light" | "dark" };

export function mapSupported(config: MapConfig): boolean {
  return config.usable && config.engine === "2.1";
}

// Consent turned off: the script and its global go, so nothing of Yandex
// keeps running in the page (the gate has already taken the maps down).
function unloadYmaps(): void {
  document.querySelectorAll('script[data-lexgo-map="yandex"]').forEach((el) => el.remove());
  try {
    delete (window as unknown as { ymaps?: unknown }).ymaps;
  } catch {
    /* a non-configurable global: it stays unused */
  }
  pending = null;
  loadedUrl = "";
}

if (typeof window !== "undefined") {
  subscribeConsent(() => {
    if (!hasConsent("functional") && (pending || globalYmaps())) unloadYmaps();
  });
}

export function openYandexMap(config: MapConfig, box: HTMLElement, view: MapView): Promise<MapHandle> {
  if (!hasConsent("functional")) return Promise.reject(new Error("ymaps_consent"));
  if (!mapSupported(config)) return Promise.reject(new Error("ymaps_unsupported"));
  return loadYmaps21(config.loaderUrl).then((y) => build21(y, box, view));
}

// The 2.1 API has no dark scheme: in dark mode the tile pane alone is
// inverted and re-tinted, so roads and water read as a night map while the
// pins (their own pane) keep their colours.
const DARK_TILES = "invert(1) hue-rotate(180deg) brightness(.92) contrast(.9) saturate(.55)";

const safe = (s: string | undefined) => (s ?? "").replace(/"/g, "”").replace(/[<>]/g, "");

const TEMPLATES: Record<MarkKind | "cluster", string> = {
  pin: '<span class="ymk-pin{{ properties.cls }}" data-ymk-key="{{ properties.key }}" data-seller="{{ properties.seller }}" data-src="{{ properties.src }}" title="{{ properties.title }}" aria-label="{{ properties.title }}" role="button" tabindex="0"><span class="ymk-pin__in">{{ properties.text }}</span></span>',
  "pin-mute": '<span class="ymk-pin ymk-pin--mute{{ properties.cls }}" data-ymk-key="{{ properties.key }}" data-src="{{ properties.src }}" title="{{ properties.title }}"><span class="ymk-pin__in">{{ properties.text }}</span></span>',
  group: '<span class="ymk-group{{ properties.cls }}" data-size="{{ properties.size }}" data-ymk-key="{{ properties.key }}" data-cluster="{{ properties.cluster }}" title="{{ properties.title }}" aria-label="{{ properties.title }}" role="button" tabindex="0">{{ properties.text }}</span>',
  cluster: '<span class="ymk-group ymk-group--near" data-size="{{ properties.size }}" data-ymk-key="{{ properties.key }}" data-sellers="{{ properties.sellers }}" title="{{ properties.title }}" aria-label="{{ properties.title }}" role="button" tabindex="0">{{ properties.text }}</span>',
  me: '<span class="ymk-me{{ properties.cls }}" data-ymk-key="{{ properties.key }}" title="{{ properties.title }}"><span class="ymk-me__hd"></span><span class="ymk-me__dot"></span><span class="ymk-me__arw"></span></span>',
  pick: '<span class="ymk-pick{{ properties.cls }}" data-ymk-key="{{ properties.key }}" title="{{ properties.title }}"></span>',
  dest: '<span class="ymk-dest{{ properties.cls }}" data-ymk-key="{{ properties.key }}" title="{{ properties.title }}"><span class="ymk-dest__pin"></span></span>',
  pulse: '<span class="ymk-pulse" data-ymk-key="{{ properties.key }}"></span>',
  radar: '<span class="ymk-radar" data-ymk-key="{{ properties.key }}"><span class="ymk-radar__sweep"></span></span>',
  ring: '<span class="ymk-ring" data-ymk-key="{{ properties.key }}" title="{{ properties.title }}"><svg class="ymk-ring__svg" focusable="false" aria-hidden="true"><circle class="ymk-ring__c" cx="50%" cy="50%" r="49%" pathLength="100"></circle></svg></span>',
};
const SHAPES: Partial<Record<MarkKind | "cluster", YProps>> = {
  pin: { type: "Circle", coordinates: [0, 0], radius: 20 },
  group: { type: "Circle", coordinates: [0, 0], radius: 26 },
  cluster: { type: "Circle", coordinates: [0, 0], radius: 26 },
};

const sizeOf = (n: number) => (n < 10 ? "s" : n < 100 ? "m" : "l");
export const countText = (n: number) => (n > 999 ? "999+" : String(n));

const FX_WINDOW_MS = 700;
const OUT_MS = 220;
const DROP_MS = 620;
const STAGGER_MS = 35;
const STAGGER_CAP = 13;
const SPREAD_MS = 520;
const SPREAD_WAIT_MS = 1600;
const SPREAD_MAX_PX = 560;
const GLIDE_MS = 600;
const RING_MAX_PX = 5200;
const TILE_PX = 256;
const RING_GROW_MS = 640;

const lerp = (a: LngLat, b: LngLat, t: number): LngLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clampPx = (v: number) => Math.round(Math.max(-SPREAD_MAX_PX, Math.min(SPREAD_MAX_PX, v)));
const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];
const flatM = (a: LngLat, b: LngLat) => {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111320;
};
const lengthsOf = (path: LngLat[]) => {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + flatM(path[i - 1], path[i]));
  return out;
};
const along = (path: LngLat[], lens: number[], d: number): { at: LngLat; i: number } => {
  if (path.length < 2) return { at: path[0], i: 0 };
  const total = lens[lens.length - 1];
  const want = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < lens.length - 1 && lens[i] < want) i++;
  const seg = lens[i] - lens[i - 1];
  return { at: seg > 0 ? lerp(path[i - 1], path[i], (want - lens[i - 1]) / seg) : path[i], i };
};
const prefixOf = (path: LngLat[], lens: number[], d: number): LngLat[] => {
  if (path.length < 2) return path.slice();
  const { at, i } = along(path, lens, d);
  return [...path.slice(0, i), at];
};
const snapTo = (path: LngLat[], p: LngLat): { at: LngLat; i: number } => {
  let best = { at: path[0], i: 1, d: Number.POSITIVE_INFINITY };
  const k = Math.cos((p[1] * Math.PI) / 180);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = (b[0] - a[0]) * k;
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * k * dx + (p[1] - a[1]) * dy) / len)) : 0;
    const q: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = flatM(q, p);
    if (d < best.d) best = { at: q, i, d };
  }
  return { at: best.at, i: best.i };
};
const TRAIL_MAX = 400;

const mercator = {
  to: (ll: LngLat, z: number): [number, number] => {
    const w = TILE_PX * 2 ** z;
    const s = Math.sin((Math.max(-85, Math.min(85, ll[1])) * Math.PI) / 180);
    return [((ll[0] + 180) / 360) * w, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * w];
  },
  from: (p: [number, number], z: number): LngLat => {
    const w = TILE_PX * 2 ** z;
    const n = Math.PI - (2 * Math.PI * p[1]) / w;
    return [(p[0] / w) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))];
  },
};

const pairOf = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length >= 2 && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1])) ? [Number(v[0]), Number(v[1])] : null;

type Live = { coords: LngLat; flags: Set<string>; vars: Map<string, string>; fx: MarkFx; i: number; until: number; members: string[] | null };
type Spread = { keys: Set<string>; any: boolean; origin: LngLat; until: number };

function build21(y: Ymaps21, box: HTMLElement, view: MapView): MapHandle {
  // 2.1 takes [latitude, longitude] unless the loader asked for longlat.
  const longlat = y.meta?.coordinatesOrder === "longlat";
  const toY = (ll: LngLat): number[] => (longlat ? [ll[0], ll[1]] : [ll[1], ll[0]]);
  const fromY = (v: unknown): LngLat | null => lngLatOf(v, longlat ? "longitude_latitude" : "latitude_longitude");
  const layouts = new Map<string, unknown>();
  const layout = (k: MarkKind | "cluster") => {
    let l = layouts.get(k);
    if (!l) layouts.set(k, (l = y.templateLayoutFactory.createClass(TEMPLATES[k])));
    return l;
  };

  const map = new y.Map(box, { center: toY(view.center), zoom: clampZoom(view.zoom), controls: [] }, {
    suppressMapOpenBlock: true,
    yandexMapDisablePoiInteractivity: true,
    avoidFractionalZoom: true,
    // 2.1 doesn't see its box resize by itself (the page settles, a phone turns).
    autoFitToViewport: "always",
  });

  // Every focusable marker has a key; Enter or Space on it does what a click does.
  const actions = new Map<string, () => void>();
  let seq = 0;
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const el = (ev.target as Element | null)?.closest?.("[data-ymk-key]");
    const run = el ? actions.get(el.getAttribute("data-ymk-key") ?? "") : undefined;
    if (!run) return;
    ev.preventDefault();
    ev.stopPropagation();
    run();
  };
  box.addEventListener("keydown", onKey);

  const quiet = (fn: () => unknown) => {
    try {
      fn();
    } catch {}
  };

  const lives = new Map<string, Live>();
  const timers = new Set<number>();
  const glides = new Map<string, number>();
  const stops = new Set<() => void>();
  const rings = new Set<(z?: number) => void>();
  const gestures = new Set<() => void>();
  const seen = new WeakSet<Element>();
  let chosen: string | null = null;
  let spread: Spread | null = null;
  let pad: Pad = { top: 0, right: 0, bottom: 0, left: 0 };

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const projection = (): YProjection | null => {
    try {
      const p = map.options?.get?.("projection") as Partial<YProjection> | undefined;
      return p && typeof p.toGlobalPixels === "function" && typeof p.fromGlobalPixels === "function" ? (p as YProjection) : null;
    } catch {
      return null;
    }
  };
  const gpx = (ll: LngLat, z: number): [number, number] => {
    const p = projection();
    if (p) {
      try {
        const v = pairOf(p.toGlobalPixels(toY(ll), z));
        if (v) return v;
      } catch {}
    }
    return mercator.to(ll, z);
  };
  const ungpx = (px: [number, number], z: number): LngLat | null => {
    const p = projection();
    if (p) {
      try {
        const v = fromY(p.fromGlobalPixels(px, z));
        if (v) return v;
      } catch {}
    }
    return lngLatOf(mercator.from(px, z));
  };
  const size = (): [number, number] => {
    try {
      const s = pairOf(map.container?.getSize?.());
      if (s && s[0] > 0 && s[1] > 0) return s;
    } catch {}
    return [box.clientWidth || 1, box.clientHeight || 1];
  };
  const pixel = (ll: LngLat): [number, number] | null => {
    try {
      const z = Number(map.getZoom());
      let c = pairOf(map.getGlobalPixelCenter?.());
      if (!c) {
        const cc = fromY(map.getCenter());
        c = cc ? gpx(cc, z) : null;
      }
      if (!c) return null;
      const [w, h] = size();
      const p = gpx(ll, z);
      return [p[0] - c[0] + w / 2, p[1] - c[1] + h / 2];
    } catch {
      return null;
    }
  };
  const centerFor = (ll: LngLat, z: number): LngLat => {
    const dx = (pad.left - pad.right) / 2;
    const dy = (pad.top - pad.bottom) / 2;
    if (!dx && !dy) return ll;
    const p = gpx(ll, z);
    return ungpx([p[0] - dx, p[1] - dy], z) ?? ll;
  };
  const go = (ll: LngLat, zoom: number, ms: number) => {
    const z = clampZoom(zoom);
    quiet(() => map.setCenter(toY(centerFor(ll, z)), z, { duration: ms, checkZoomRange: true }));
  };
  const fit = (pts: LngLat[], o: FitOptions) => {
    if (!pts.length) return;
    const [w, h] = size();
    const m = o.margin ?? 40;
    const aw = Math.max(48, w - pad.left - pad.right - 2 * m);
    const ah = Math.max(48, h - pad.top - pad.bottom - 2 * m);
    const span = (z: number) => {
      const ps = pts.map((p) => gpx(p, z));
      const xs = ps.map((p) => p[0]);
      const ys = ps.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      return { w: x1 - x0, h: y1 - y0, mid: [(x0 + x1) / 2, (y0 + y1) / 2] as [number, number] };
    };
    let z = clampZoom(o.maxZoom ?? 17);
    let s = span(z);
    while (z > 2 && (s.w > aw || s.h > ah)) {
      z -= 1;
      s = span(z);
    }
    const mid = ungpx(s.mid, z);
    if (mid) go(mid, z, o.ms);
  };

  const els = (key: string): HTMLElement[] => (key ? Array.from(box.querySelectorAll<HTMLElement>(`[data-ymk-key="${key}"]`)) : []);
  const flag = (key: string, name: string, on: boolean) => {
    const st = lives.get(key);
    if (!st) return;
    if (on) st.flags.add(name);
    else st.flags.delete(name);
    for (const el of els(key)) el.classList.toggle(name, on);
  };
  const setVars = (key: string, v: Record<string, string | number | null>) => {
    const st = lives.get(key);
    if (!st) return;
    const list = els(key);
    for (const [k, val] of Object.entries(v)) {
      if (val === null) {
        st.vars.delete(k);
        for (const el of list) el.style.removeProperty(k);
      } else {
        st.vars.set(k, String(val));
        for (const el of list) el.style.setProperty(k, String(val));
      }
    }
  };
  const paintSel = (el: HTMLElement) => {
    if (!el.classList.contains("ymk-pin") && !el.classList.contains("ymk-group")) return;
    const on = !!chosen && (el.getAttribute("data-seller") === chosen || (el.getAttribute("data-sellers") ?? "").split(" ").includes(chosen));
    el.classList.toggle("is-on", on);
    el.classList.toggle("is-dim", !!chosen && !on);
  };
  const once = (el: HTMLElement, cls: string, i: number, ms: number) => {
    el.style.setProperty("--i", String(i));
    el.classList.add(cls);
    later(() => el.classList.remove(cls), ms + 120);
  };
  const decorate = (el: HTMLElement) => {
    if (seen.has(el)) return;
    seen.add(el);
    const key = el.getAttribute("data-ymk-key") ?? "";
    const st = lives.get(key);
    if (!st) return;
    for (const f of st.flags) el.classList.add(f);
    for (const [k, v] of st.vars) el.style.setProperty(k, v);
    paintSel(el);
    const now = performance.now();
    const fresh = !!st.fx && now < st.until;
    const sp = spread && now < spread.until ? spread : null;
    if (sp && (sp.keys.has(key) || !!st.members?.some((k) => sp.keys.has(k)) || (sp.any && fresh))) {
      const o = pixel(sp.origin);
      const p = pixel(st.coords);
      if (o && p) {
        el.style.setProperty("--fx", `${clampPx(o[0] - p[0])}px`);
        el.style.setProperty("--fy", `${clampPx(o[1] - p[1])}px`);
        once(el, "is-spread", 0, SPREAD_MS);
        return;
      }
    }
    if (fresh) once(el, `is-${st.fx}`, st.i, DROP_MS + st.i * STAGGER_MS + 800);
  };
  const scan = (n: Node) => {
    if (!(n instanceof HTMLElement)) return;
    if (n.hasAttribute("data-ymk-key")) decorate(n);
    n.querySelectorAll<HTMLElement>("[data-ymk-key]").forEach(decorate);
  };
  const watcher =
    typeof MutationObserver === "function"
      ? new MutationObserver((records) => {
          for (const r of records) r.addedNodes.forEach(scan);
        })
      : null;
  watcher?.observe(box, { childList: true, subtree: true });

  const fadeOut = (key: string, done: () => void) => {
    if (readMotion() || !els(key).length) {
      done();
      return;
    }
    flag(key, "is-out", true);
    later(done, OUT_MS);
  };

  const stopGlide = (key: string) => {
    const r = glides.get(key);
    if (r !== undefined) cancelAnimationFrame(r);
    glides.delete(key);
  };
  const glide = (key: string, pm: YGeoObject, to: LngLat, ms: number) => {
    const st = lives.get(key);
    if (!st) return;
    stopGlide(key);
    const put = (c: LngLat) => {
      st.coords = c;
      quiet(() => pm.geometry?.setCoordinates?.(toY(c)));
    };
    const from = st.coords;
    if (same(from, to)) return;
    if (ms <= 0 || readMotion()) {
      put(to);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      put(p < 1 ? lerp(from, to, easeOut(p)) : to);
      if (p < 1) glides.set(key, requestAnimationFrame(step));
      else glides.delete(key);
    };
    glides.set(key, requestAnimationFrame(step));
  };

  const props = (s: MarkSpec, key: string): YProps => ({
    key,
    title: safe(s.title),
    text: safe(s.text),
    cls: s.cls ? ` ${safe(s.cls)}` : "",
    size: s.size ?? "",
    seller: safe(s.seller),
    cluster: safe(s.cluster),
    sellers: safe(s.sellers),
    src: s.src ?? "",
  });

  const placemark = (s: MarkSpec): { pm: YGeoObject; key: string } => {
    const key = `m${++seq}`;
    lives.set(key, { coords: s.coords, flags: new Set(), vars: new Map(), fx: s.fx ?? "", i: Math.min(s.i ?? 0, STAGGER_CAP), until: performance.now() + FX_WINDOW_MS, members: null });
    const pm = new y.Placemark(toY(s.coords), props(s, key), {
      iconLayout: layout(s.kind),
      ...(SHAPES[s.kind] ? { iconShape: SHAPES[s.kind] } : {}),
      zIndex: s.z,
      hasBalloon: false,
      hasHint: false,
      openBalloonOnClick: false,
      // Markers that do nothing (the client's own dot, the picked point, a
      // pin without a profile) let a tap through to the map.
      ...(s.onActivate ? {} : { interactivityModel: "default#transparent" }),
    });
    if (s.onActivate) {
      const run = s.onActivate;
      actions.set(key, run);
      pm.events.add("click", () => run());
    }
    return { pm, key };
  };

  const markOf = (key: string, pm: YGeoObject, s: MarkSpec, detach: () => void): Mark => {
    const last = { title: safe(s.title), text: safe(s.text), cls: s.cls ? ` ${safe(s.cls)}` : "", size: s.size ?? "" };
    let gone = false;
    return {
      set: (p) => {
        const next: YProps = {};
        if (p.title !== undefined && safe(p.title) !== last.title) next.title = last.title = safe(p.title);
        if (p.text !== undefined && safe(p.text) !== last.text) next.text = last.text = safe(p.text);
        if (p.size !== undefined && p.size !== last.size) next.size = last.size = p.size;
        if (p.cls !== undefined) {
          const cls = p.cls ? ` ${safe(p.cls)}` : "";
          if (cls !== last.cls) next.cls = last.cls = cls;
        }
        if (Object.keys(next).length) quiet(() => pm.properties.set(next));
      },
      move: (to, ms = 0) => glide(key, pm, to, ms),
      vars: (v) => setVars(key, v),
      flag: (name, on, ms) => {
        flag(key, name, on);
        if (on && ms) later(() => flag(key, name, false), ms);
      },
      remove: () => {
        if (gone) return;
        gone = true;
        actions.delete(key);
        stopGlide(key);
        const done = () => {
          detach();
          lives.delete(key);
        };
        if (s.kind === "pulse") done();
        else fadeOut(key, done);
      },
    };
  };

  const mark = (s: MarkSpec): Mark => {
    const { pm, key } = placemark(s);
    map.geoObjects.add(pm);
    return markOf(key, pm, s, () => quiet(() => map.geoObjects.remove(pm)));
  };

  const pins = (opts: GroupOptions): PinSet => {
    const clusterer = new y.Clusterer({
      clusterIconLayout: layout("cluster"),
      clusterIconShape: SHAPES.cluster,
      gridSize: opts.gridPx,
      // From here on pins are never grouped (the backend keeps nearby
      // pins a few metres apart, so they separate before this zoom).
      maxZoom: 17,
      hasBalloon: false,
      hasHint: false,
      clusterDisableClickZoom: true,
      clusterOpenBalloonOnClick: false,
      zoomMargin: 48,
    });
    const items = new Map<string, { key: string; mark: Mark }>();
    const clusterKeys = new Set<string>();
    let freshUntil = 0;
    const prune = () => {
      if (clusterKeys.size < 64) return;
      for (const k of clusterKeys) {
        if (els(k).length) continue;
        clusterKeys.delete(k);
        actions.delete(k);
        lives.delete(k);
      }
    };
    clusterer.createCluster = function (this: YClusterer, center: unknown, geoObjects: YGeoObject[]) {
      const cluster = y.Clusterer.prototype.createCluster.call(this, center, geoObjects);
      prune();
      const key = `c${++seq}`;
      const members = geoObjects.map((o) => String(o.properties.get?.("key") ?? "")).filter(Boolean);
      const sellers = geoObjects
        .map((o) => String(o.properties.get?.("seller") ?? ""))
        .filter(Boolean)
        .join(" ");
      const memberCoords = members.map((k) => lives.get(k)?.coords).filter((c): c is LngLat => !!c);
      const at = fromY(center) ?? memberCoords[0] ?? view.center;
      const now = performance.now();
      lives.set(key, { coords: at, flags: new Set(), vars: new Map(), fx: now < freshUntil ? "pop" : "", i: 0, until: freshUntil, members });
      const open = () => {
        const ms = opts.moveMs();
        flag(key, "is-burst", true);
        later(() => flag(key, "is-burst", false), ms + SPREAD_WAIT_MS);
        spread = { keys: new Set(members), any: false, origin: at, until: performance.now() + ms + SPREAD_WAIT_MS };
        fit(memberCoords.length ? memberCoords : [at], { ms, maxZoom: 19, margin: 48 });
      };
      clusterKeys.add(key);
      actions.set(key, open);
      cluster.properties.set({ key, title: safe(opts.title(geoObjects.length)), text: countText(geoObjects.length), size: sizeOf(geoObjects.length), sellers: safe(sellers) });
      cluster.events.add("click", () => open());
      return cluster;
    };
    map.geoObjects.add(clusterer);
    return {
      sync: (specs) => {
        const next = new Set(specs.map((s) => s.id));
        for (const [id, it] of items) {
          if (next.has(id)) continue;
          items.delete(id);
          it.mark.remove();
        }
        const add: YGeoObject[] = [];
        let n = 0;
        for (const s of specs) {
          const it = items.get(s.id);
          if (it) {
            it.mark.set({ title: s.title, text: s.text, cls: s.cls });
            it.mark.move(s.coords, GLIDE_MS);
            continue;
          }
          const spec: MarkSpec = { ...s, fx: s.fx ?? "drop", i: Math.min(n++, STAGGER_CAP) };
          const { pm, key } = placemark(spec);
          items.set(s.id, { key, mark: markOf(key, pm, spec, () => quiet(() => clusterer.remove(pm))) });
          add.push(pm);
        }
        if (add.length) {
          freshUntil = performance.now() + FX_WINDOW_MS;
          quiet(() => clusterer.add(add));
        }
      },
      get: (id) => items.get(id)?.mark,
      remove: () => {
        const keys = [...[...items.values()].map((it) => it.key), ...clusterKeys];
        for (const k of keys) actions.delete(k);
        items.clear();
        const done = () => {
          quiet(() => map.geoObjects.remove(clusterer));
          for (const k of keys) lives.delete(k);
          clusterKeys.clear();
        };
        if (readMotion() || !keys.some((k) => els(k).length)) {
          done();
          return;
        }
        for (const k of keys) flag(k, "is-out", true);
        later(done, OUT_MS);
      },
    };
  };

  const onBounds = () => {
    for (const f of rings) f();
  };
  map.events.add("boundschange", onBounds);
  map.events.add("actiontick", (e) => {
    if (!rings.size) return;
    const tick = e.get("tick") as { zoom?: unknown } | undefined;
    const z = Number(tick?.zoom);
    if (Number.isFinite(z)) for (const f of rings) f(z);
  });

  let press: [number, number] | null = null;
  let pressed = false;
  const tell = () => {
    for (const f of gestures) f();
  };
  const onDown = (e: PointerEvent) => {
    press = [e.clientX, e.clientY];
    pressed = false;
  };
  const onMove = (e: PointerEvent) => {
    if (!press || pressed || !e.buttons) return;
    if (Math.hypot(e.clientX - press[0], e.clientY - press[1]) < 6) return;
    pressed = true;
    tell();
  };
  const onUp = () => {
    press = null;
  };
  box.addEventListener("pointerdown", onDown, true);
  box.addEventListener("pointermove", onMove, true);
  box.addEventListener("pointerup", onUp, true);
  box.addEventListener("pointercancel", onUp, true);
  box.addEventListener("wheel", tell, { capture: true, passive: true });

  return {
    bbox: () => {
      const b = map.getBounds();
      if (!Array.isArray(b) || b.length < 2) return null;
      const a = fromY(b[0]);
      const c = fromY(b[1]);
      return a && c ? bboxOfBounds([a, c]) : null;
    },
    zoom: () => clampZoom(Number(map.getZoom())),
    center: () => fromY(map.getCenter()),
    moveTo: (center, zoom, ms) => go(center, zoom, ms),
    setZoom: (zoom, ms) => void map.setZoom(clampZoom(zoom), { duration: ms, checkZoomRange: true }),
    onView: (cb) => void map.events.add("boundschange", () => cb()),
    onClick: (cb) =>
      void map.events.add("click", (e) => {
        const ll = fromY(e.get("coords"));
        if (ll) cb(ll);
      }),
    onGesture: (cb) => void gestures.add(cb),
    setTheme: (theme) => {
      const ground = map.panes.get("ground")?.getElement();
      if (ground) ground.style.filter = theme === "dark" ? DARK_TILES : "";
    },
    setPadding: (p) => {
      pad = { ...pad, ...p };
    },
    pixel,
    inView: (ll) => {
      const p = pixel(ll);
      if (!p) return true;
      const [w, h] = size();
      return p[0] >= pad.left && p[0] <= w - pad.right && p[1] >= pad.top && p[1] <= h - pad.bottom;
    },
    fit,
    follow: (point, o) => go(point, o.zoom ?? Number(map.getZoom()), o.ms),
    mark,
    group: (specs, opts) => {
      const set = pins(opts);
      const ids = specs.map((s, i) => s.seller || `i${i}`);
      set.sync(specs.map((s, i) => ({ ...s, id: ids[i] })));
      return { marks: ids.map((id) => set.get(id)).filter((m): m is Mark => !!m), remove: set.remove };
    },
    pins,
    select: (seller) => {
      chosen = seller || null;
      box.querySelectorAll<HTMLElement>(".ymk-pin, .ymk-group").forEach(paintSel);
    },
    spreadFrom: (origin, ms) => {
      spread = { keys: new Set(), any: true, origin, until: performance.now() + ms };
    },
    route: (points, o) => {
      const P = y.Polyline;
      if (typeof P !== "function" || points.length < 2) return { set: () => undefined, progress: () => undefined, remove: () => undefined };
      let path = points.slice();
      let lens = lengthsOf(path);
      let left = path;
      let leftLens = lens;
      let trail: LngLat[] = [];
      let k = o.drawMs > 0 && !readMotion() ? 0 : 1;
      let t0 = performance.now() + Math.max(0, o.delayMs ?? 0);
      let drawMs = o.drawMs;
      let dead = false;
      let raf = 0;
      let pulse: Mark | null = null;
      let p0 = 0;
      const flow = o.flow && !readMotion();
      const opts = (color: string, width: number, opacity: number, style: string, z: number): YProps => ({
        strokeColor: color,
        strokeWidth: width,
        strokeOpacity: opacity,
        strokeStyle: style,
        zIndex: z,
        hasBalloon: false,
        hasHint: false,
        openBalloonOnClick: false,
        interactivityModel: "default#transparent",
      });
      const glow = new P([], {}, opts(o.glow, 24, 0.22, "solid", 1));
      const casing = new P([], {}, opts(o.casing, 13, 1, "solid", 2));
      const main = new P([], {}, opts(o.color, 7, 1, "solid", 3));
      const past = new P([], {}, opts(o.past, 5, 0.95, "dot", 4));
      for (const line of [glow, casing, past, main]) quiet(() => map.geoObjects.add(line));
      const coords = (list: LngLat[]) => list.map(toY);
      const paint = () => {
        const total = leftLens[leftLens.length - 1];
        const shown = k >= 1 ? left : prefixOf(left, leftLens, total * easeInOut(k));
        const c = coords(shown.length >= 2 ? shown : [left[0], left[0]]);
        quiet(() => glow.geometry?.setCoordinates?.(c));
        quiet(() => casing.geometry?.setCoordinates?.(c));
        quiet(() => main.geometry?.setCoordinates?.(c));
        quiet(() => past.geometry?.setCoordinates?.(coords(trail.length >= 2 ? trail : [])));
      };
      const stop = () => {
        dead = true;
        cancelAnimationFrame(raf);
        raf = 0;
        pulse?.remove();
        pulse = null;
      };
      const busy = () => k < 1 || flow;
      const loop = (now: number) => {
        raf = 0;
        if (dead) return;
        if (k < 1) {
          k = drawMs > 0 ? Math.max(0, Math.min(1, (now - t0) / drawMs)) : 1;
          paint();
        }
        if (k >= 1 && flow) {
          const total = leftLens[leftLens.length - 1];
          if (!pulse) {
            pulse = mark({ kind: "pulse", coords: left[0], title: "", z: 36 });
            p0 = now;
          }
          const period = Math.max(1400, Math.min(4200, total * 3));
          const ph = ((now - p0) % period) / period;
          pulse.move(along(left, leftLens, total * easeInOut(ph)).at, 0);
          pulse.vars({ "--o": Math.sin(Math.PI * ph).toFixed(3) });
        }
        if (busy()) raf = requestAnimationFrame(loop);
      };
      const kick = () => {
        if (!raf && !dead && busy()) raf = requestAnimationFrame(loop);
      };
      paint();
      kick();
      stops.add(stop);
      return {
        set: (next, ms = 0) => {
          if (dead || next.length < 2) return;
          path = next.slice();
          lens = lengthsOf(path);
          left = path;
          leftLens = lens;
          if (ms > 0 && !readMotion()) {
            k = 0;
            drawMs = ms;
            t0 = performance.now();
            kick();
          } else k = 1;
          paint();
        },
        progress: (at) => {
          if (dead) return;
          if (!at) {
            trail = [];
            left = path;
            leftLens = lens;
            paint();
            return;
          }
          const last = trail[trail.length - 1];
          if (!last || flatM(last, at) > 3) trail = [...trail.slice(-(TRAIL_MAX - 1)), at];
          if (o.straight) left = [at, path[path.length - 1]];
          else {
            const q = snapTo(path, at);
            left = [q.at, ...path.slice(q.i)];
          }
          leftLens = lengthsOf(left);
          paint();
        },
        remove: () => {
          stop();
          stops.delete(stop);
          for (const line of [main, past, casing, glow]) quiet(() => map.geoObjects.remove(line));
        },
      };
    },
    ring: (c0, km, title) => {
      let c = c0;
      let r = km;
      const m = mark({ kind: "ring", coords: c, title, z: 3 });
      const resize = (at?: number) => {
        const z = at ?? Number(map.getZoom());
        const lat = Math.max(-85, Math.min(85, c[1]));
        const east: LngLat = [c[0] + r / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180))), c[1]];
        const d = Math.abs(gpx(east, z)[0] - gpx(c, z)[0]) * 2;
        m.vars({ "--d": d > 8 && d < RING_MAX_PX ? `${Math.round(d)}px` : "0px" });
      };
      resize();
      rings.add(resize);
      return {
        set: (nc, nk, nt) => {
          if (nk !== r) m.flag("is-grow", true, RING_GROW_MS);
          c = nc;
          r = nk;
          m.move(nc, 0);
          if (nt !== undefined) m.set({ title: nt });
          resize();
        },
        remove: () => {
          rings.delete(resize);
          m.remove();
        },
      };
    },
    destroy: () => {
      watcher?.disconnect();
      box.removeEventListener("keydown", onKey);
      box.removeEventListener("pointerdown", onDown, true);
      box.removeEventListener("pointermove", onMove, true);
      box.removeEventListener("pointerup", onUp, true);
      box.removeEventListener("pointercancel", onUp, true);
      box.removeEventListener("wheel", tell, true);
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
      for (const r of glides.values()) cancelAnimationFrame(r);
      glides.clear();
      for (const stop of stops) stop();
      stops.clear();
      rings.clear();
      gestures.clear();
      actions.clear();
      lives.clear();
      quiet(() => map.destroy());
    },
  };
}

// ── Page state the maps follow ──────────────────────────────────────────
function subscribeTheme(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

const readTheme = (): "light" | "dark" => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

export function useHtmlTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "light");
}

function subscribeMotion(cb: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

const readMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, readMotion, () => false);
}
