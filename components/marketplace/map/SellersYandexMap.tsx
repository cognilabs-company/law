"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconMinus, IconPlus, IconRefresh, IconTarget } from "@/components/icons";
import { initials } from "@/lib/lawyers";
import type { MarketSeller } from "@/lib/services/marketplace";
import type { Spot } from "@/lib/services/marketDiscovery";
import { mapErrorKey, type MapErrorKey } from "@/lib/services/mapLocation";
import {
  bboxParam,
  clampZoom,
  filtersKey,
  getSellersMap,
  loadMapSellerInfo,
  mapSellerInfoServerSnapshot,
  mapSellerInfoSnapshot,
  mapSellerView,
  sellersMapFailureOf,
  SPOT_ZOOM,
  subscribeMapSellerInfo,
  zoomForCluster,
  type LngLat,
  type MapBbox,
  type MapConfig,
  type MapFilters,
  type MapSeller,
  type SellersMapResult,
} from "@/lib/services/sellersMap";
import { countText, openYandexMap, useHtmlTheme, useReducedMotion, type GuideRoute, type Mark, type MapHandle, type PinSet, type PinSpec, type RadiusRing } from "./ymaps";
import "./sellersMap.css";
import "./navigator.css";

export type Viewport = { bbox: MapBbox; zoom: number };
export type MapGuide = { from: Spot; to: Spot; name?: string; path?: Spot[] | null };
export type MapFollow = { point: Spot; heading: number | null };
export type MapInset = { left: number; bottom: number };
type ResState = { key: string; result: SellersMapResult | null; fail: MapErrorKey | null };

// Pins closer than this on screen are grouped by the Clusterer.
const GROUP_PX = 48;
const NAME_MAX = 24;
const MOVE_MS = 420;
const GLIDE_MS = 480;
const FIT_MS = 460;
const DRAW_MS = 620;
const SIDE_PAD = 64;
const FOLLOW_ZOOM = 16;
const GUIDE_ZOOM = 16;
const RING_ZOOM = 15;
const LINE_COLORS = {
  light: { color: "#1460DC", casing: "#FFFFFF" },
  dark: { color: "#6EA8FF", casing: "#0A1120" },
} as const;

const llOf = (s: Spot): LngLat => [s.longitude, s.latitude];
const keyOf = (s: Spot | null | undefined) => (s ? `${s.longitude},${s.latitude}` : "");
const sizeOf = (n: number) => (n < 10 ? "s" : n < 100 ? "m" : "l");

function ringBox(c: Spot, km: number): LngLat[] {
  const dLat = km / 110.574;
  const dLon = km / (111.32 * Math.max(0.05, Math.cos((c.latitude * Math.PI) / 180)));
  return [
    [c.longitude - dLon, c.latitude],
    [c.longitude + dLon, c.latitude],
    [c.longitude, c.latitude - dLat],
    [c.longitude, c.latitude + dLat],
  ];
}

export function MapPlaceholder({ label }: { label: string }) {
  return (
    <div className="ymk ymk--full">
      <div className="ymk-stage ymk-stage--wait" aria-busy="true">
        <div className="ymk-veil ymk-veil--art">
          <span className="ymk-spin" aria-hidden="true" />
          <span className="sr-only" role="status">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SellersYandexMap({
  config,
  spot,
  center,
  filters,
  refresh,
  picking,
  pickPoint,
  onPick,
  known,
  locating = false,
  onLocate,
  onFail,
  onViewport,
  onSellers,
  selectedId,
  onSelect,
  guide = null,
  follow = null,
  panelInset,
  topInset = 0,
  overlay,
  radiusKm = null,
}: {
  config: MapConfig;
  spot: Spot | null;
  // Move the map here (the client's point, a place they searched for).
  center: Spot | null;
  filters: MapFilters;
  // Bumped by realtime updates and reconnects: refetch the viewport.
  refresh: number;
  // Manual point selection (browser location denied): a tap marks the point.
  picking: boolean;
  pickPoint: Spot | null;
  onPick: (p: Spot) => void;
  base?: string;
  known: (userId: string) => MarketSeller | null;
  locating?: boolean;
  onLocate?: () => void;
  onFail: () => void;
  onShowAll?: () => void;
  onViewport?: (v: Viewport) => void;
  onSellers?: (list: MapSeller[]) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  guide?: MapGuide | null;
  follow?: MapFollow | null;
  panelInset?: MapInset;
  // What floats over the top of the map (the phone's search bar).
  topInset?: number;
  overlay?: ReactNode;
  radiusKm?: number | null;
}) {
  const t = useTranslations("marketplace.ymap");
  const tn = useTranslations("marketplace.nearby");
  const tx = useTranslations("marketMap");
  const uid = useId();
  const theme = useHtmlTheme();
  const still = useReducedMotion();

  const boxRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<MapHandle | null>(null);
  const pinsRef = useRef<PinSet | null>(null);
  const groupsRef = useRef(new Map<string, Mark>());
  const meRef = useRef<Mark | null>(null);
  const lineRef = useRef<GuideRoute | null>(null);
  const ringRef = useRef<RadiusRing | null>(null);
  const turnRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [res, setRes] = useState<ResState | null>(null);
  const [own, setOwn] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const selected = selectedId === undefined ? own : selectedId;
  const padL = Math.max(0, Math.round(panelInset?.left ?? 0));
  const padB = Math.max(0, Math.round(panelInset?.bottom ?? 0));
  const padT = Math.max(0, Math.round(topInset));

  const info = useSyncExternalStore(subscribeMapSellerInfo, mapSellerInfoSnapshot, mapSellerInfoServerSnapshot);
  const nameOf = (s: MapSeller) => mapSellerView(s, s.sellerUserId ? known(s.sellerUserId) : null, s.sellerUserId ? info.get(s.sellerUserId) : null).name || tn("map.unnamed");

  const fail = useEffectEvent(() => onFail());
  const mapClick = useEffectEvent((ll: LngLat) => {
    if (picking) onPick({ longitude: ll[0], latitude: ll[1] });
  });
  const seen = useEffectEvent((v: Viewport) => onViewport?.(v));
  const listed = useEffectEvent((list: MapSeller[]) => onSellers?.(list));
  const startup = useEffectEvent(() => ({
    theme,
    still,
    center: config.center,
    zoom: config.zoom,
    debounce: config.debounceMs,
    pad: { top: padT, right: SIDE_PAD, bottom: padB, left: padL },
  }));
  const motion = useEffectEvent((ms: number) => (still ? 0 : ms));
  const pinTitle = useEffectEvent((s: MapSeller) => (s.source ? tx(`pin.${s.source}`, { name: nameOf(s) }) : t("approx", { name: nameOf(s) })));
  // No avatar_url on map markers yet (§7.4, a backend gap): the pin is the
  // generated initials avatar, like the cards.
  const pinText = useEffectEvent((s: MapSeller) => initials(nameOf(s)) || "LG");
  const pinCls = useEffectEvent((s: MapSeller) => (s.source === "office" ? "ymk-pin--office" : ""));
  const groupTitle = useEffectEvent((n: number) => t("cluster", { n }));
  const meTitle = useEffectEvent(() => tn("map.you"));
  const pickTitle = useEffectEvent(() => tx("manual.pinned"));
  const pick = useEffectEvent((id: string) => {
    if (selectedId === undefined) setOwn(id);
    onSelect?.(id);
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const init = startup();
    let dead = false;
    let timer = 0;
    let tries = 0;
    let made: MapHandle | null = null;
    const read = () => {
      const live = liveRef.current;
      if (!live) return;
      const bbox = live.bbox();
      if (!bbox) {
        if (tries++ < 20) timer = window.setTimeout(read, 150);
        return;
      }
      tries = 0;
      const zoom = live.zoom();
      setViewport((prev) => (prev && prev.zoom === zoom && bboxParam(prev.bbox) === bboxParam(bbox) ? prev : { bbox, zoom }));
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, init.debounce);
    };
    openYandexMap(config, box, { center: init.center, zoom: init.zoom, theme: init.theme }).then(
      (h) => {
        if (dead) {
          h.destroy();
          return;
        }
        made = h;
        try {
          h.setTheme(init.theme);
          h.setPadding(init.pad);
          h.onView(schedule);
          h.onClick((ll) => mapClick(ll));
        } catch {
          h.destroy();
          made = null;
          fail();
          return;
        }
        liveRef.current = h;
        setReady(true);
        timer = window.setTimeout(read, 60);
      },
      () => {
        if (!dead) fail();
      },
    );
    return () => {
      dead = true;
      window.clearTimeout(timer);
      liveRef.current = null;
      made?.destroy();
    };
    // The map is built once per loader; the rest follows through effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.loaderUrl, config.engine]);

  useEffect(() => {
    const live = liveRef.current;
    if (ready && live) live.setTheme(theme);
  }, [ready, theme]);

  useEffect(() => {
    const live = liveRef.current;
    if (ready && live) live.setPadding({ top: padT, right: SIDE_PAD, bottom: padB, left: padL });
  }, [ready, padT, padB, padL]);

  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live || !center) return;
    live.moveTo(llOf(center), Math.max(live.zoom(), SPOT_ZOOM), motion(GLIDE_MS));
  }, [ready, center]);

  const fKey = filtersKey(filters);
  const key = viewport ? `${bboxParam(viewport.bbox)}|${viewport.zoom}|${fKey}|${tick}|${refresh}` : "";

  useEffect(() => {
    if (viewport) seen(viewport);
  }, [viewport]);

  useEffect(() => {
    if (!viewport) return;
    const c = new AbortController();
    getSellersMap({ url: config.sellerMapUrl, bbox: viewport.bbox, zoom: viewport.zoom, filters, order: config.coordinateOrder }, c.signal).then(
      (result) => {
        if (!c.signal.aborted) setRes({ key, result, fail: null });
      },
      (e) => {
        if (c.signal.aborted) return;
        const f = sellersMapFailureOf(e);
        if (f === "missing") fail();
        else if (f === "load") setRes({ key, result: null, fail: mapErrorKey(e) });
      },
    );
    return () => c.abort();
    // fKey stands for filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, config.sellerMapUrl, config.coordinateOrder]);

  // Keep the last answer on screen while the next viewport loads.
  const shown = res?.result ?? null;
  const loading = !!viewport && res?.key !== key;
  const failed = !loading && !!res?.fail;

  useEffect(() => {
    if (shown) listed(shown.sellers);
  }, [shown]);

  const openGroup = useEffectEvent((id: string) => {
    const live = liveRef.current;
    const c = shown?.clusters.find((x) => x.id === id);
    if (!live || !c) return;
    const ms = motion(MOVE_MS);
    groupsRef.current.get(id)?.flag("is-burst", true, ms + 2400);
    if (ms) live.spreadFrom(c.coords, ms + config.debounceMs + 2400);
    live.moveTo(c.coords, zoomForCluster(c, live.zoom()), ms);
  });

  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live) return;
    const set = live.pins({ gridPx: GROUP_PX, title: groupTitle, moveMs: () => motion(MOVE_MS) });
    const groups = groupsRef.current;
    pinsRef.current = set;
    return () => {
      pinsRef.current = null;
      set.remove();
      for (const g of groups.values()) g.remove();
      groups.clear();
    };
  }, [ready]);

  // Below marker zoom the backend sends its own clusters; the pins it sends
  // go to the Clusterer, which groups the ones that overlap on screen.
  useEffect(() => {
    const live = liveRef.current;
    const set = pinsRef.current;
    if (!ready || !live || !set || !shown) return;
    const ids = new Map<string, number>();
    const specs: PinSpec[] = shown.sellers.map((s) => {
      const base = s.sellerUserId || `@${s.coords[0]},${s.coords[1]}`;
      const n = ids.get(base) ?? 0;
      ids.set(base, n + 1);
      const id = n ? `${base}#${n}` : base;
      const look = { id, coords: s.coords, title: pinTitle(s), text: pinText(s), cls: pinCls(s), src: s.source, z: 20 };
      return s.sellerUserId ? { ...look, kind: "pin", seller: s.sellerUserId, onActivate: () => pick(s.sellerUserId) } : { ...look, kind: "pin-mute" };
    });
    set.sync(specs);
    const groups = groupsRef.current;
    const next = new Set(shown.clusters.map((c) => c.id));
    for (const [id, m] of groups) {
      if (next.has(id)) continue;
      groups.delete(id);
      m.remove();
    }
    shown.clusters.forEach((c, i) => {
      const title = groupTitle(c.count);
      const had = groups.get(c.id);
      if (had) {
        had.set({ title, text: countText(c.count), size: sizeOf(c.count) });
        had.move(c.coords, motion(MOVE_MS));
        return;
      }
      groups.set(c.id, live.mark({ kind: "group", coords: c.coords, title, text: countText(c.count), size: sizeOf(c.count), cluster: c.id, z: 30, fx: "pop", i, onActivate: () => openGroup(c.id) }));
    });
  }, [ready, shown]);

  // Names arrive later for pins the map endpoint sent without one.
  useEffect(() => {
    const set = pinsRef.current;
    if (!ready || !set || !shown) return;
    void info;
    for (const s of shown.sellers) if (s.sellerUserId) set.get(s.sellerUserId)?.set({ title: pinTitle(s), text: pinText(s) });
  }, [ready, shown, info]);

  const wantKey = (shown?.sellers ?? [])
    .filter((s) => s.sellerUserId && !s.name && !known(s.sellerUserId)?.name)
    .slice(0, NAME_MAX)
    .map((s) => s.sellerUserId)
    .filter((id, i, all) => all.indexOf(id) === i)
    .join("|");

  useEffect(() => {
    if (wantKey) loadMapSellerInfo(wantKey.split("|"));
  }, [wantKey]);

  const reveal = useEffectEvent((id: string) => {
    const live = liveRef.current;
    const s = shown?.sellers.find((x) => x.sellerUserId === id);
    if (live && s && !live.inView(s.coords)) live.moveTo(s.coords, live.zoom(), motion(GLIDE_MS));
  });

  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live) return;
    live.select(selected);
    if (selected) reveal(selected);
  }, [ready, selected]);

  const hasSpot = !!spot;
  const spotKey = keyOf(spot);
  const spotNow = useEffectEvent(() => spot);

  useEffect(() => {
    const live = liveRef.current;
    const at = spotNow();
    if (!ready || !live || !hasSpot || !at) return;
    const m = live.mark({ kind: "me", coords: llOf(at), title: meTitle(), z: 10, fx: "pop" });
    meRef.current = m;
    turnRef.current = null;
    return () => {
      meRef.current = null;
      m.remove();
    };
  }, [ready, hasSpot]);

  const moveMe = useEffectEvent(() => {
    if (spot) meRef.current?.move(llOf(spot), motion(GLIDE_MS));
  });
  useEffect(() => {
    if (ready) moveMe();
  }, [ready, spotKey]);

  const navOn = !!follow;
  useEffect(() => {
    const m = meRef.current;
    if (!ready || !m) return;
    m.set({ cls: navOn ? " is-nav" : "" });
  }, [ready, hasSpot, navOn]);

  const heading = follow?.heading ?? null;
  useEffect(() => {
    const m = meRef.current;
    if (!ready || !m) return;
    if (heading === null || !Number.isFinite(heading)) {
      m.flag("has-hd", false);
      return;
    }
    const prev = turnRef.current;
    const next = prev === null ? heading : prev + ((((heading - prev) % 360) + 540) % 360) - 180;
    turnRef.current = next;
    m.vars({ "--hd": `${next.toFixed(1)}deg` });
    m.flag("has-hd", true);
  }, [ready, hasSpot, heading]);

  const ringOn = ready && hasSpot && !!radiusKm && radiusKm > 0;
  const ringNow = useEffectEvent(() => (spot && radiusKm ? { at: spot, km: radiusKm, title: tx("stage.radius", { r: radiusKm }) } : null));
  const fitRing = useEffectEvent(() => {
    const live = liveRef.current;
    if (live && spot && radiusKm && !follow) live.fit(ringBox(spot, radiusKm), { ms: motion(FIT_MS), maxZoom: RING_ZOOM, margin: 28 });
  });

  useEffect(() => {
    const live = liveRef.current;
    const r = ringNow();
    if (!ringOn || !live || !r) return;
    const ring = live.ring(llOf(r.at), r.km, r.title);
    ringRef.current = ring;
    return () => {
      ringRef.current = null;
      ring.remove();
    };
  }, [ringOn]);

  const syncRing = useEffectEvent(() => {
    const r = ringNow();
    if (r) ringRef.current?.set(llOf(r.at), r.km, r.title);
  });
  useEffect(() => {
    if (ringOn) syncRing();
  }, [ringOn, spotKey, radiusKm]);

  useEffect(() => {
    if (ringOn) fitRing();
  }, [ringOn, radiusKm]);

  const routed = !!guide?.path && guide.path.length >= 2;
  const guideKey = guide ? `${keyOf(guide.to)}|${routed ? "r" : "s"}` : "";
  const pathKey = guide?.path && guide.path.length >= 2 ? `${guide.path.length}:${keyOf(guide.path[0])}:${keyOf(guide.path[guide.path.length - 1])}` : "";
  const pointsOf = (g: MapGuide, from: Spot): LngLat[] => (g.path && g.path.length >= 2 ? g.path.map(llOf) : [llOf(from), llOf(g.to)]);
  const guideNow = useEffectEvent(() =>
    guide ? { points: pointsOf(guide, spot ?? guide.from), to: guide.to, straight: !routed, title: guide.name ? tx("stage.dest", { name: guide.name }) : tx("stage.destPlain") } : null,
  );

  useEffect(() => {
    const live = liveRef.current;
    const g = guideNow();
    if (!ready || !live || !g) return;
    const ink = LINE_COLORS[theme];
    const line = live.route(g.points, { color: ink.color, casing: ink.casing, drawMs: still ? 0 : DRAW_MS, delayMs: still ? 0 : 120, straight: g.straight });
    const dest = live.mark({ kind: "dest", coords: llOf(g.to), title: g.title, z: 34, fx: "drop" });
    lineRef.current = line;
    live.fit([...g.points, llOf(g.to)], { ms: still ? 0 : FIT_MS, maxZoom: GUIDE_ZOOM, margin: 56 });
    return () => {
      lineRef.current = null;
      line.remove();
      dest.remove();
    };
  }, [ready, guideKey, theme, still]);

  // A new path (a recalculation, another way of travel) replaces the line in
  // place. Only when nobody is being guided does the view fit the new path.
  const reroute = useEffectEvent(() => {
    if (!guide?.path || guide.path.length < 2) return;
    const points = guide.path.map(llOf);
    lineRef.current?.set(points);
    if (!follow) liveRef.current?.fit([...points, llOf(guide.to)], { ms: motion(FIT_MS), maxZoom: GUIDE_ZOOM, margin: 56 });
  });
  useEffect(() => {
    if (ready && pathKey) reroute();
  }, [ready, pathKey]);

  const followAt = keyOf(follow?.point);
  const trail = useEffectEvent(() => {
    const line = lineRef.current;
    if (!line || !guide) return;
    if (follow) line.progress(llOf(follow.point));
    else if (!routed && spot) line.set([llOf(spot), llOf(guide.to)]);
  });
  useEffect(() => {
    if (ready && guideKey) trail();
  }, [ready, guideKey, spotKey, followAt]);

  const clearTrail = useEffectEvent(() => lineRef.current?.progress(null));
  useEffect(() => {
    if (ready && guideKey && !navOn) clearTrail();
  }, [ready, guideKey, navOn]);

  const followKey = follow ? keyOf(follow.point) : "";
  const camera = useEffectEvent(() => {
    const live = liveRef.current;
    if (!live || !follow) return;
    const z = live.zoom();
    live.follow(llOf(follow.point), { zoom: Math.max(z, FOLLOW_ZOOM), ms: motion(GLIDE_MS) });
  });
  useEffect(() => {
    if (ready && followKey) camera();
  }, [ready, followKey]);

  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live || !pickPoint) return;
    const m = live.mark({ kind: "pick", coords: llOf(pickPoint), title: pickTitle(), z: 40, fx: "drop" });
    return () => m.remove();
  }, [ready, pickPoint]);

  const zoomBy = (d: number) => {
    const live = liveRef.current;
    if (live) live.setZoom(clampZoom(live.zoom() + d), still ? 0 : 300);
  };

  const guideSaid = guide ? (guide.name ? tx("stage.guideShown", { name: guide.name }) : tx("stage.guideShownPlain")) : "";
  const stageStyle = { "--ymk-pl": `${padL}px`, "--ymk-pb": `${padB}px`, "--ymk-pt": `${padT}px` } as CSSProperties;
  const chips = (failed && !!res?.fail) || (!!shown?.truncated && !failed);

  return (
    <div className={`ymk${overlay ? " ymk--full" : ""}`} data-ai-id="marketplace.map" data-ai-type="section">
      <p className="sr-only" role="status">
        {!ready ? t("loadingMap") : loading ? t("loading") : guideSaid}
      </p>
      <div className={`ymk-stage${ready ? " is-ready" : " ymk-stage--wait"}${picking ? " ymk-stage--pick" : ""}${selected ? " has-sel" : ""}${guide ? " has-guide" : ""}${ready && navOn ? " is-nav" : ""}`} style={stageStyle}>
        <div ref={boxRef} className="ymk-canvas" role="region" tabIndex={-1} aria-label={t("region")} aria-describedby={`${uid}-n`} />
        <p id={`${uid}-n`} className="sr-only">
          {tx("stage.hint")}
        </p>
        <div className={`ymk-veil ymk-veil--art${ready ? " is-off" : ""}`} aria-hidden="true">
          {ready ? null : <span className="ymk-spin" />}
        </div>
        {ready && loading ? <span className="ymk-bar" aria-hidden="true" /> : null}
        {picking && ready ? (
          <p className="ymk-pickhint" role="status" data-ai-id="marketplace.map.pick-hint">
            <IconTarget aria-hidden="true" />
            {pickPoint ? tx("manual.moved") : overlay ? tx("stage.pick") : tx("manual.tap")}
          </p>
        ) : null}
        {chips ? (
          <div className="ymk-chips">
            {failed && res?.fail ? (
              <div className="ymk-err" role="alert">
                <span>{res.fail === "generic" || res.fail === "offline" || res.fail === "not_found" ? t("loadError") : tx(`errors.${res.fail}`)}</span>
                <button type="button" onClick={() => setTick((n) => n + 1)} data-ai-id="marketplace.map.retry">
                  <IconRefresh aria-hidden="true" />
                  {t("retry")}
                </button>
              </div>
            ) : (
              <span className="ymk-chip" data-ai-id="marketplace.map.truncated">
                {t("truncated")}
              </span>
            )}
          </div>
        ) : null}
        <div className="ymk-ctl" role="group" aria-label={tx("stage.controls")}>
          <button type="button" onClick={() => zoomBy(1)} disabled={!ready} aria-label={t("zoomIn")} title={t("zoomIn")} data-ai-id="marketplace.map.zoom-in">
            <IconPlus aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoomBy(-1)} disabled={!ready} aria-label={t("zoomOut")} title={t("zoomOut")} data-ai-id="marketplace.map.zoom-out">
            <IconMinus aria-hidden="true" />
          </button>
          {onLocate ? (
            <button
              type="button"
              className="ymk-ctl__me"
              onClick={onLocate}
              disabled={locating}
              aria-busy={locating || undefined}
              aria-label={locating ? t("locating") : t("locate")}
              title={locating ? t("locating") : t("locate")}
              data-ai-id="marketplace.map.locate"
            >
              <IconTarget aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {overlay}
      </div>
    </div>
  );
}
