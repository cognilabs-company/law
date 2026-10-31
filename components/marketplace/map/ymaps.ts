"use client";

import { useSyncExternalStore } from "react";
import { bboxOfBounds, clampZoom, lngLatOf, type LngLat, type MapBbox, type MapConfig } from "@/lib/services/sellersMap";

// The Yandex map behind both map components (the seller map, the point
// picker). The script comes only from the config's maps_loader_url and is
// drawn by the renderer for its api_version (§7.1: JS API 2.1). The
// components see only MapHandle, never the Yandex objects. The loader URL
// carries the key: it is never logged and never part of an error.

// ── The parts of the JS API 2.1 used here ───────────────────────────────
type YEvent = { get: (key: string) => unknown };
type YEvents = { add: (type: string, cb: (e: YEvent) => void) => unknown };
type YProps = Record<string, unknown>;
type YManager = { set: (v: YProps) => unknown };
type YGeoObject = { events: YEvents; properties: YManager; options: YManager };
type YCluster = YGeoObject & { getBounds: () => unknown };
type YCollection = { add: (o: unknown) => unknown; remove: (o: unknown) => unknown };
type YClusterer = YCollection & { createCluster: (center: unknown, geoObjects: YGeoObject[]) => YCluster };
type YMoveOpts = { duration?: number; checkZoomRange?: boolean; zoomMargin?: number };
type YMap = {
  geoObjects: YCollection;
  events: YEvents;
  panes: { get: (key: string) => { getElement: () => HTMLElement } | null };
  getBounds: () => unknown;
  getZoom: () => number;
  getCenter: () => unknown;
  setCenter: (center: number[], zoom?: number, opts?: YMoveOpts) => unknown;
  setZoom: (zoom: number, opts?: YMoveOpts) => unknown;
  setBounds: (bounds: unknown, opts?: YMoveOpts) => unknown;
  destroy: () => void;
};
type Ymaps21 = {
  ready: (ok: () => void, fail?: (e: unknown) => void) => unknown;
  Map: new (el: HTMLElement, state: YProps, options?: YProps) => YMap;
  Placemark: new (coords: number[], props: YProps, options: YProps) => YGeoObject;
  Clusterer: { new (options: YProps): YClusterer; prototype: YClusterer };
  templateLayoutFactory: { createClass: (template: string) => unknown };
  meta?: { coordinatesOrder?: string };
};

const LOAD_TIMEOUT_MS = 15000;
let pending: Promise<Ymaps21> | null = null;

function globalYmaps(): Ymaps21 | null {
  const y = (window as unknown as { ymaps?: Partial<Record<keyof Ymaps21, unknown>> }).ymaps;
  return y && typeof y === "object" && typeof y.ready === "function" ? (y as Ymaps21) : null;
}

const complete = (y: Ymaps21) =>
  typeof y.Map === "function" && typeof y.Placemark === "function" && typeof y.Clusterer === "function" && typeof y.templateLayoutFactory?.createClass === "function";

function loadYmaps21(loaderUrl: string, timeoutMs = LOAD_TIMEOUT_MS): Promise<Ymaps21> {
  if (pending) return pending;
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
export type MarkKind = "pin" | "pin-mute" | "group" | "me" | "pick";
export type MarkSpec = { kind: MarkKind; coords: LngLat; title: string; text?: string; cls?: string; size?: string; seller?: string; cluster?: string; src?: string; z: number; onActivate?: () => void };
export type Mark = { set: (p: { title?: string; text?: string; cls?: string }) => void; remove: () => void };
export type MarkGroup = { marks: Mark[]; remove: () => void };
export type GroupOptions = { gridPx: number; title: (n: number) => string; moveMs: () => number };
export type MapHandle = {
  bbox: () => MapBbox | null;
  zoom: () => number;
  center: () => LngLat | null;
  moveTo: (center: LngLat, zoom: number, ms: number) => void;
  setZoom: (zoom: number, ms: number) => void;
  onView: (cb: () => void) => void;
  onClick: (cb: (p: LngLat) => void) => void;
  setTheme: (theme: "light" | "dark") => void;
  mark: (spec: MarkSpec) => Mark;
  // Seller pins grouped by the API's Clusterer: pins closer than gridPx on
  // screen show as one count that zooms in on a click or Enter.
  group: (specs: MarkSpec[], opts: GroupOptions) => MarkGroup;
  destroy: () => void;
};
export type MapView = { center: LngLat; zoom: number; theme: "light" | "dark" };

export function mapSupported(config: MapConfig): boolean {
  return config.usable && config.engine === "2.1";
}

export function openYandexMap(config: MapConfig, box: HTMLElement, view: MapView): Promise<MapHandle> {
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
  "pin-mute": '<span class="ymk-pin ymk-pin--mute{{ properties.cls }}" data-src="{{ properties.src }}" title="{{ properties.title }}"><span class="ymk-pin__in">{{ properties.text }}</span></span>',
  group: '<span class="ymk-group" data-size="{{ properties.size }}" data-ymk-key="{{ properties.key }}" data-cluster="{{ properties.cluster }}" title="{{ properties.title }}" aria-label="{{ properties.title }}" role="button" tabindex="0">{{ properties.text }}</span>',
  cluster: '<span class="ymk-group ymk-group--near" data-size="{{ properties.size }}" data-ymk-key="{{ properties.key }}" title="{{ properties.title }}" aria-label="{{ properties.title }}" role="button" tabindex="0">{{ properties.text }}</span>',
  me: '<span class="ymk-me" title="{{ properties.title }}"></span>',
  pick: '<span class="ymk-pick{{ properties.cls }}" title="{{ properties.title }}"></span>',
};
const SHAPES: Partial<Record<MarkKind | "cluster", YProps>> = {
  pin: { type: "Circle", coordinates: [0, 0], radius: 20 },
  group: { type: "Circle", coordinates: [0, 0], radius: 26 },
  cluster: { type: "Circle", coordinates: [0, 0], radius: 26 },
};

const sizeOf = (n: number) => (n < 10 ? "s" : n < 100 ? "m" : "l");
export const countText = (n: number) => (n > 999 ? "999+" : String(n));

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

  const props = (s: MarkSpec, key: string): YProps => ({
    key,
    title: safe(s.title),
    text: safe(s.text),
    cls: s.cls ? ` ${safe(s.cls)}` : "",
    size: s.size ?? "",
    seller: safe(s.seller),
    cluster: safe(s.cluster),
    src: s.src ?? "",
  });

  const placemark = (s: MarkSpec): { pm: YGeoObject; key: string; mark: (remove: () => void) => Mark } => {
    const key = s.onActivate ? `m${++seq}` : "";
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
    const mark = (remove: () => void): Mark => ({
      set: (p) => {
        const next: YProps = {};
        if (p.title !== undefined) next.title = safe(p.title);
        if (p.text !== undefined) next.text = safe(p.text);
        if (p.cls !== undefined) next.cls = p.cls ? ` ${safe(p.cls)}` : "";
        pm.properties.set(next);
      },
      remove: () => {
        if (key) actions.delete(key);
        remove();
      },
    });
    return { pm, key, mark };
  };

  const quiet = (fn: () => unknown) => {
    try {
      fn();
    } catch {}
  };

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
    moveTo: (center, zoom, ms) => void map.setCenter(toY(center), clampZoom(zoom), { duration: ms, checkZoomRange: true }),
    setZoom: (zoom, ms) => void map.setZoom(clampZoom(zoom), { duration: ms, checkZoomRange: true }),
    onView: (cb) => void map.events.add("boundschange", () => cb()),
    onClick: (cb) =>
      void map.events.add("click", (e) => {
        const ll = fromY(e.get("coords"));
        if (ll) cb(ll);
      }),
    setTheme: (theme) => {
      const ground = map.panes.get("ground")?.getElement();
      if (ground) ground.style.filter = theme === "dark" ? DARK_TILES : "";
    },
    mark: (s) => {
      const { pm, mark } = placemark(s);
      map.geoObjects.add(pm);
      return mark(() => quiet(() => map.geoObjects.remove(pm)));
    },
    group: (specs, opts) => {
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
      const clusterKeys = new Set<string>();
      clusterer.createCluster = function (this: YClusterer, center: unknown, geoObjects: YGeoObject[]) {
        const cluster = y.Clusterer.prototype.createCluster.call(this, center, geoObjects);
        const key = `c${++seq}`;
        const open = () => quiet(() => map.setBounds(cluster.getBounds(), { checkZoomRange: true, zoomMargin: 48, duration: opts.moveMs() }));
        clusterKeys.add(key);
        actions.set(key, open);
        cluster.properties.set({ key, title: safe(opts.title(geoObjects.length)), text: countText(geoObjects.length), size: sizeOf(geoObjects.length) });
        cluster.events.add("click", () => open());
        return cluster;
      };
      const made = specs.map((s) => placemark(s));
      clusterer.add(made.map((m) => m.pm));
      map.geoObjects.add(clusterer);
      const keys = made.map((m) => m.key).filter(Boolean);
      return {
        marks: made.map((m) => m.mark(() => undefined)),
        remove: () => {
          for (const k of keys) actions.delete(k);
          for (const k of clusterKeys) actions.delete(k);
          quiet(() => map.geoObjects.remove(clusterer));
        },
      };
    },
    destroy: () => {
      box.removeEventListener("keydown", onKey);
      actions.clear();
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
