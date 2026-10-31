"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import VerifiedBadge from "@/components/VerifiedBadge";
import { IconBuilding, IconClose, IconMapPin, IconMinus, IconPlus, IconRefresh, IconStarRate, IconTarget, IconUsers } from "@/components/icons";
import { Navigation } from "lucide-react";
import { aiId } from "@/lib/ai/ids";
import { regionLabel } from "@/lib/labels";
import { humanizeSlug, initials } from "@/lib/lawyers";
import { fmtRating } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import type { MarketSeller } from "@/lib/services/marketplace";
import { precisionMeters, type Spot } from "@/lib/services/marketDiscovery";
import { mapErrorKey, type MapErrorKey } from "@/lib/services/mapLocation";
import {
  bboxParam,
  clampZoom,
  filtersKey,
  getSellersMap,
  isEmptyMap,
  loadMapSellerInfo,
  mapSellerInfoServerSnapshot,
  mapSellerInfoSnapshot,
  mapSellerView,
  sellersMapFailureOf,
  SPOT_ZOOM,
  subscribeMapSellerInfo,
  zoomForCluster,
  type LocationSource,
  type MapBbox,
  type MapCluster,
  type MapConfig,
  type MapFilters,
  type MapSeller,
  type SellersMapResult,
} from "@/lib/services/sellersMap";
import type { RouteTarget } from "./NavigateDialog";
import type { MapLive } from "./useMapRealtime";
import { ServiceActionLink, useActionPrice } from "./SellerRow";
import { Monogram, sellerTypeLabel } from "../bits";
import { countText, openYandexMap, useHtmlTheme, useReducedMotion, type Mark, type MapHandle } from "./ymaps";
import "./sellersMap.css";

export type Viewport = { bbox: MapBbox; zoom: number };
type ResState = { key: string; result: SellersMapResult | null; fail: MapErrorKey | null };

const LIST_MAX = 12;
// Pins closer than this on screen are grouped by the Clusterer.
const GROUP_PX = 48;

export function MapPlaceholder({ label }: { label: string }) {
  return (
    <div className="ymk">
      <div className="ymk-stage ymk-stage--wait" aria-busy="true">
        <div className="ymk-veil">
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
  live,
  picking,
  pickPoint,
  onPick,
  base,
  known,
  locating,
  onLocate,
  onFail,
  onShowAll,
  onViewport,
  onNavigate,
  hideList,
}: {
  config: MapConfig;
  spot: Spot | null;
  // Move the map here (the client's point, a place they searched for).
  center: Spot | null;
  filters: MapFilters;
  // Bumped by realtime updates and reconnects: refetch the viewport.
  refresh: number;
  live: MapLive;
  // Manual point selection (browser location denied): a tap marks the point.
  picking: boolean;
  pickPoint: Spot | null;
  onPick: (p: Spot) => void;
  base: string;
  known: (userId: string) => MarketSeller | null;
  locating: boolean;
  onLocate: () => void;
  onFail: () => void;
  onShowAll: () => void;
  onViewport?: (v: Viewport) => void;
  onNavigate?: (target: RouteTarget) => void;
  hideList?: boolean;
}) {
  const t = useTranslations("marketplace.ymap");
  const tn = useTranslations("marketplace.nearby");
  const tm = useTranslations("marketplace");
  const tx = useTranslations("marketMap");
  const te = useTranslations("enums");
  const locale = useLocale();
  const uid = useId();
  const theme = useHtmlTheme();
  const still = useReducedMotion();
  const actionPrice = useActionPrice();

  const boxRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const liveRef = useRef<MapHandle | null>(null);
  const pinsRef = useRef(new Map<string, Mark>());

  const [ready, setReady] = useState(false);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [res, setRes] = useState<ResState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const info = useSyncExternalStore(subscribeMapSellerInfo, mapSellerInfoSnapshot, mapSellerInfoServerSnapshot);
  const viewOf = (s: MapSeller) => mapSellerView(s, s.sellerUserId ? known(s.sellerUserId) : null, s.sellerUserId ? info.get(s.sellerUserId) : null);
  const nameOf = (s: MapSeller) => viewOf(s).name || tn("map.unnamed");
  const srcText = (src: LocationSource) => (src ? tx(`src.${src}`) : "");

  const fail = useEffectEvent(() => onFail());
  const mapClick = useEffectEvent((ll: [number, number]) => {
    if (picking) onPick({ longitude: ll[0], latitude: ll[1] });
  });
  const seen = useEffectEvent((v: Viewport) => onViewport?.(v));
  const startup = useEffectEvent(() => ({ theme, center: config.center, zoom: config.zoom, debounce: config.debounceMs }));
  const motion = useEffectEvent((ms: number) => (still ? 0 : ms));
  const pinTitle = useEffectEvent((s: MapSeller) => (s.source ? tx(`pin.${s.source}`, { name: nameOf(s) }) : t("approx", { name: nameOf(s) })));
  // No avatar_url on map markers yet (§7.4, a backend gap): the pin is the
  // generated initials avatar, like the cards.
  const pinText = useEffectEvent((s: MapSeller) => initials(nameOf(s)) || "LG");
  const pinCls = useEffectEvent((s: MapSeller) => [s.source === "office" ? "ymk-pin--office" : "", s.sellerUserId && s.sellerUserId === selected ? "is-on" : ""].filter(Boolean).join(" "));
  const groupTitle = useEffectEvent((n: number) => t("cluster", { n }));
  const meTitle = useEffectEvent(() => tn("map.you"));
  const pickTitle = useEffectEvent(() => tx("manual.pinned"));

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
    if (!ready || !live || !center) return;
    live.moveTo([center.longitude, center.latitude], Math.max(live.zoom(), SPOT_ZOOM), motion(500));
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
  const empty = !loading && !!shown && isEmptyMap(shown);

  const pick = useEffectEvent((id: string) => setSelected(id));
  const openGroup = useEffectEvent((c: MapCluster) => {
    const live = liveRef.current;
    if (live) live.moveTo(c.coords, zoomForCluster(c, live.zoom()), motion(350));
  });

  // Below marker zoom the backend sends its own clusters; the pins it sends
  // go to the Clusterer, which groups the ones that overlap on screen.
  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live || !shown) return;
    const groups: Mark[] = shown.clusters.map((c) =>
      live.mark({ kind: "group", coords: c.coords, title: groupTitle(c.count), text: countText(c.count), size: c.count < 10 ? "s" : c.count < 100 ? "m" : "l", cluster: c.id, z: 30, onActivate: () => openGroup(c) }),
    );
    const specs = shown.sellers.map((s) =>
      s.sellerUserId
        ? { kind: "pin" as const, coords: s.coords, title: pinTitle(s), text: pinText(s), cls: pinCls(s), seller: s.sellerUserId, src: s.source, z: 20, onActivate: () => pick(s.sellerUserId) }
        : { kind: "pin-mute" as const, coords: s.coords, title: pinTitle(s), text: pinText(s), cls: pinCls(s), src: s.source, z: 20 },
    );
    const pinned = live.group(specs, { gridPx: GROUP_PX, title: groupTitle, moveMs: () => motion(350) });
    const pins = new Map<string, Mark>();
    shown.sellers.forEach((s, i) => {
      if (s.sellerUserId) pins.set(s.sellerUserId, pinned.marks[i]);
    });
    pinsRef.current = pins;
    return () => {
      pinsRef.current = new Map();
      pinned.remove();
      for (const g of groups) g.remove();
    };
  }, [ready, shown]);

  // Names arrive later for pins the map endpoint sent without one.
  useEffect(() => {
    if (!ready || !shown) return;
    void info;
    for (const s of shown.sellers) pinsRef.current.get(s.sellerUserId)?.set({ title: pinTitle(s), text: pinText(s) });
  }, [ready, shown, info]);

  useEffect(() => {
    if (!ready || !shown) return;
    void selected;
    for (const s of shown.sellers) pinsRef.current.get(s.sellerUserId)?.set({ cls: pinCls(s) });
  }, [ready, shown, selected]);

  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live || !spot) return;
    const m = live.mark({ kind: "me", coords: [spot.longitude, spot.latitude], title: meTitle(), z: 10 });
    return () => m.remove();
  }, [ready, spot]);

  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live || !pickPoint) return;
    const m = live.mark({ kind: "pick", coords: [pickPoint.longitude, pickPoint.latitude], title: pickTitle(), z: 40 });
    return () => m.remove();
  }, [ready, pickPoint]);

  const sel = selected && shown ? (shown.sellers.find((s) => s.sellerUserId === selected) ?? null) : null;

  useEffect(() => {
    if (selected) cardRef.current?.focus();
  }, [selected]);

  const zoomBy = (d: number) => {
    const live = liveRef.current;
    if (live) live.setZoom(clampZoom(live.zoom() + d), still ? 0 : 250);
  };

  const closeCard = () => {
    const id = selected;
    setSelected(null);
    if (!id) return;
    const btn = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-seller]") ?? []).find((b) => b.dataset.seller === id);
    if (btn) btn.focus();
    else boxRef.current?.focus();
  };

  const listed = shown ? shown.sellers.filter((s) => s.sellerUserId) : [];
  const precM = precisionMeters(/\d/.test(shown?.precision ?? "") ? (shown?.precision as string) : config.markerPrecision);
  const sources = new Set(listed.map((s) => s.source).filter(Boolean));
  const wantKey = [...listed.slice(0, LIST_MAX), ...(sel ? [sel] : [])]
    .filter((s) => !s.name && !known(s.sellerUserId)?.name)
    .map((s) => s.sellerUserId)
    .filter((id, i, all) => all.indexOf(id) === i)
    .join("|");

  useEffect(() => {
    if (wantKey) loadMapSellerInfo(wantKey.split("|"));
  }, [wantKey]);

  const renderCard = (s: MapSeller) => {
    const id = s.sellerUserId;
    const v = viewOf(s);
    const name = v.name || tn("map.unnamed");
    const type = v.sellerType;
    const region = v.region;
    const pending = !v.name && info.get(id) === undefined;
    const href = `${base}/${encodeURIComponent(id)}`;
    return (
      <section
        ref={cardRef}
        tabIndex={-1}
        className="ymk-card"
        aria-label={t("selected")}
        aria-busy={pending || undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            closeCard();
          }
        }}
        data-ai-id="marketplace.map.card"
        data-ai-type="section"
        data-ai-entity-type="seller"
        data-ai-entity-id={id}
      >
        <Monogram name={name} rating={v.rating} showRing={v.rating > 0} />
        <div className="ymk-card__who">
          <span className="ymk-card__title">
            <b>{name}</b>
            {v.verified ? <VerifiedBadge label={false} name={name} subtitle={type ? sellerTypeLabel(tm, type) : undefined} /> : null}
          </span>
          <span className="ymk-card__sub">
            {type ? <span>{sellerTypeLabel(tm, type)}</span> : null}
            {region ? <span>{regionLabel(te, /[_-]/.test(region) ? humanizeSlug(region) : region)}</span> : null}
            {v.rating > 0 ? (
              <span className="ymk-card__rate">
                <IconStarRate aria-hidden="true" />
                {fmtRating(v.rating, locale)}
                {v.reviewsCount > 0 ? <small>({tm("card.reviews", { count: v.reviewsCount })})</small> : null}
              </span>
            ) : (
              <span className="ymk-card__rate">{tm("card.newSeller")}</span>
            )}
          </span>
          {s.source ? (
            <span className="ymk-card__src" data-src={s.source} data-ai-id="marketplace.map.card.source">
              {s.source === "office" ? <IconBuilding aria-hidden="true" /> : <IconMapPin aria-hidden="true" />}
              {srcText(s.source)}
            </span>
          ) : null}
          <span className="ymk-card__approx" data-ai-id="marketplace.map.card.approx">
            {s.source === "profile_region" ? tx("card.approxRegion") : tx("card.approx", { m: precM })}
          </span>
          {s.service?.price ? (
            <b className="ymk-card__price">{actionPrice(s.service)}</b>
          ) : v.priceFrom ? (
            <b className="ymk-card__price">{tm("card.priceFrom", { price: fmtUzs(v.priceFrom) })}</b>
          ) : null}
          <span className="ymk-card__acts">
            <Link href={href} className="btn btn--grad btn--sm ymk-card__go" data-ai-id="marketplace.map.card.profile">
              {t("profile")}
            </Link>
            {s.service ? <ServiceActionLink action={s.service} href={href} className="btn btn--line btn--sm ymk-card__go" ai="marketplace.map.card.service" /> : null}
            {s.nav.available && onNavigate ? (
              <button
                type="button"
                className="btn btn--line btn--sm ymk-card__go"
                onClick={() => onNavigate({ sellerUserId: id, name, endpoint: s.nav.endpoint, modes: s.nav.modes })}
                data-ai-id="marketplace.map.card.route"
              >
                <Navigation aria-hidden="true" />
                {tx("route.open")}
              </button>
            ) : null}
          </span>
        </div>
        <button type="button" className="ymk-card__x" onClick={closeCard} aria-label={t("close")} data-ai-id="marketplace.map.card.close">
          <IconClose aria-hidden="true" />
        </button>
      </section>
    );
  };

  return (
    <div className="ymk" data-ai-id="marketplace.map" data-ai-type="section">
      <div className="ymk-status" aria-live="polite">
        {shown && !failed ? <b className="ymk-status__n">{t("count", { n: shown.total })}</b> : null}
        <span className="ymk-status__prec">{t("precision", { m: precM })}</span>
        {sources.size && !failed ? (
          <span className="ymk-legend" data-ai-id="marketplace.map.legend">
            {(["live", "office", "profile_region"] as const)
              .filter((src) => sources.has(src))
              .map((src) => (
                <span key={src} className="ymk-legend__i">
                  <i className="ymk-legend__k" data-src={src} aria-hidden="true" />
                  {srcText(src)}
                </span>
              ))}
          </span>
        ) : null}
        {shown?.truncated && !failed ? <span className="ymk-status__more">{t("truncated")}</span> : null}
        {live !== "off" ? (
          <span className={`ymk-live ymk-live--${live}`} data-ai-id="marketplace.map.live">
            <i aria-hidden="true" />
            {tx(`live.${live}`)}
          </span>
        ) : null}
      </div>
      <p className="sr-only" role="status">
        {!ready ? t("loadingMap") : loading ? t("loading") : ""}
      </p>
      <div className={`ymk-stage${ready ? "" : " ymk-stage--wait"}${picking ? " ymk-stage--pick" : ""}`}>
        <div ref={boxRef} className="ymk-canvas" role="region" tabIndex={-1} aria-label={t("region")} aria-describedby={`${uid}-n`} />
        {picking && ready ? (
          <p className="ymk-pickhint" role="status" data-ai-id="marketplace.map.pick-hint">
            <IconTarget aria-hidden="true" />
            {pickPoint ? tx("manual.moved") : tx("manual.tap")}
          </p>
        ) : null}
        <p id={`${uid}-n`} className="sr-only">
          {t("regionHint")}
        </p>
        {!ready ? (
          <div className="ymk-veil" aria-hidden="true">
            <span className="ymk-spin" />
          </div>
        ) : null}
        {ready && loading ? <span className="ymk-bar" aria-hidden="true" /> : null}
        <div className="ymk-ctl">
          <button type="button" onClick={() => zoomBy(1)} disabled={!ready} aria-label={t("zoomIn")} title={t("zoomIn")} data-ai-id="marketplace.map.zoom-in">
            <IconPlus aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoomBy(-1)} disabled={!ready} aria-label={t("zoomOut")} title={t("zoomOut")} data-ai-id="marketplace.map.zoom-out">
            <IconMinus aria-hidden="true" />
          </button>
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
        </div>
        {empty ? (
          <div className="ymk-empty" data-ai-id="marketplace.map.empty" data-ai-type="section">
            <span className="ymk-empty__ic" aria-hidden="true">
              <IconMapPin />
            </span>
            <b>{t("emptyTitle")}</b>
            <span>{t("emptyText")}</span>
            <button type="button" className="btn btn--line btn--sm" onClick={onShowAll} data-ai-id="marketplace.map.show-all">
              <IconUsers aria-hidden="true" />
              {tn("showAll")}
            </button>
          </div>
        ) : null}
        {failed && res?.fail ? (
          <div className="ymk-err" role="alert">
            <span>{res.fail === "generic" || res.fail === "offline" || res.fail === "not_found" ? t("loadError") : tx(`errors.${res.fail}`)}</span>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setTick((n) => n + 1)} data-ai-id="marketplace.map.retry">
              <IconRefresh aria-hidden="true" />
              {t("retry")}
            </button>
          </div>
        ) : null}
        {sel ? renderCard(sel) : null}
      </div>
      {listed.length && !hideList ? (
        <div className="ymk-list">
          <h3 id={`${uid}-l`}>{t("listTitle")}</h3>
          <ul ref={listRef} aria-labelledby={`${uid}-l`} data-ai-id="marketplace.map.list" data-ai-type="list">
            {listed.slice(0, LIST_MAX).map((s) => {
              const v = viewOf(s);
              const name = v.name || tn("map.unnamed");
              return (
                <li key={s.sellerUserId}>
                  <button
                    type="button"
                    aria-pressed={selected === s.sellerUserId}
                    onClick={() => setSelected(s.sellerUserId)}
                    title={s.source ? srcText(s.source) : undefined}
                    data-src={s.source || undefined}
                    data-seller={s.sellerUserId}
                    data-ai-id={aiId("marketplace.map.seller", s.sellerUserId)}
                    data-ai-type="list_item"
                    data-ai-entity-type="seller"
                    data-ai-entity-id={s.sellerUserId}
                  >
                    <Monogram name={name} rating={v.rating} showRing={v.rating > 0} />
                    <span>{name}</span>
                    {v.rating > 0 ? (
                      <small className="ymk-list__rate">
                        <IconStarRate aria-hidden="true" />
                        {fmtRating(v.rating, locale)}
                      </small>
                    ) : null}
                    {s.source ? <span className="sr-only">{srcText(s.source)}</span> : null}
                  </button>
                </li>
              );
            })}
            {listed.length > LIST_MAX ? <li className="ymk-list__more">{t("more", { n: listed.length - LIST_MAX })}</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
