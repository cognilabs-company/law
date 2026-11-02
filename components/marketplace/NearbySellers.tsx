"use client";

import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconBriefcase, IconClose, IconInfo, IconLock, IconMap, IconMapPin, IconRefresh, IconTarget, IconUsers } from "@/components/icons";
import { Route as IconRoute } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isRateLimited, retryAfterSec } from "@/lib/http";
import { fmtDateTime } from "@/lib/date";
import type { CategoryRow } from "@/lib/services/categoryTree";
import { categoryTitleName } from "@/lib/categoryNames";
import { NEARBY_RADII, type NearbyRadius } from "@/lib/services/marketRuntime";
import { getMarketplaceSeller, type MarketSeller } from "@/lib/services/marketplace";
import { geoFailureOf, precisionMeters, roundCoord, type GeoFailure, type NearbyMode, type Spot } from "@/lib/services/marketDiscovery";
import { readPosition } from "@/lib/services/locationShare";
import { useConsent } from "@/lib/useConsent";
import { useDeadline } from "@/lib/useOtpTimer";
import {
  filterOfError,
  getLocationConsent,
  isAborted,
  mapErrorKey,
  navCoord,
  NEARBY_SORTS,
  recalcArmed,
  recordLocationConsent,
  searchNearbySellers,
  type LocationConsent,
  type MapErrorKey,
  type NearbySearchResult,
  type NearbySort,
  type Place,
} from "@/lib/services/mapLocation";
import { DEFAULT_MAP_FILTERS, filtersKey, getMapConfig, mapLocaleOf, NAV_MODES, offlineMapConfig, SELLER_TYPE_FILTERS, type MapConfig, type MapFilters, type MapSeller, type SellerTypeFilter } from "@/lib/services/sellersMap";
import { sellerTypeLabel } from "./bits";
import AreaList, { useAreaSellers } from "./map/AreaList";
import FilterSheet from "./map/FilterSheet";
import FollowHud from "./map/FollowHud";
import MapPanel, { RollText, Segmented, useNarrow, type Inset, type PanelVariant, type Snap } from "./map/MapPanel";
import MapTopBar, { type PanelView } from "./map/MapTopBar";
import NavigatorBlock, { requestGuide, type Guide } from "./map/NavigatorBlock";
import PlaceSearch from "./map/PlaceSearch";
import SellerDetail from "./map/SellerDetail";
import SellerRow, { type RowSeller } from "./map/SellerRow";
import SellersYandexMap, { MapPlaceholder, type Viewport } from "./map/SellersYandexMap";
import { askCompass, distanceMeters, useFollow } from "./map/useFollow";
import { pathLength } from "./map/geoMath";
import { arrivedNear, routeRemainM } from "./map/navText";
import MapConsentGate from "./map/MapConsentGate";
import { useMapRealtime } from "./map/useMapRealtime";
import "./nearbySellers.css";
import "./map/marketMap.css";

export type NearbyServiceOption = { value: string; label: string; categoryId?: string };

export function MarketModeSwitch({ mode, onChange }: { mode: NearbyMode; onChange: (m: NearbyMode) => void }) {
  const t = useTranslations("marketplace.mode");
  return (
    <div className="mknb-mode" role="group" aria-label={t("label")}>
      <button type="button" className="mknb-mode__b" aria-pressed={mode === "all"} onClick={() => onChange("all")} data-ai-id="marketplace.mode.all" data-ai-type="tab">
        <IconUsers aria-hidden="true" />
        <span>{t("all")}</span>
      </button>
      <button type="button" className="mknb-mode__b" aria-pressed={mode === "services"} onClick={() => onChange("services")} data-ai-id="marketplace.mode.services" data-ai-type="tab">
        <IconBriefcase aria-hidden="true" />
        <span>{t("services")}</span>
      </button>
      <button type="button" className="mknb-mode__b" aria-pressed={mode === "nearby"} onClick={() => onChange("nearby")} data-ai-id="marketplace.mode.nearby" data-ai-type="tab">
        <IconMap aria-hidden="true" />
        <span>{t("nearby")}</span>
      </button>
    </div>
  );
}

// Where the nearby search starts: the browser's position (source "web") or
// a point the client chose after the browser refused (source "manual").
// Held in memory only — never in localStorage or sessionStorage.
type Here = { point: Spot; nav?: Spot; accuracyM: number | null; source: "web" | "manual" };
type Res = { key: string; result: NearbySearchResult | null; fail: MapErrorKey | null };
type Geo = { busy: boolean; fail: GeoFailure | null };
type Then = (p: Spot) => void;
type Picked = { s: RowSeller; near: boolean };
type OrderRoute = { sellerUserId: string; orderId: string };

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const REROUTE_TIMEOUT_MS = 30000;

function orderRouteOf(search: string): OrderRoute | null {
  const q = new URLSearchParams(search);
  const id = (q.get("route") ?? "").trim();
  const order = (q.get("order") ?? "").trim();
  if (!SAFE_ID.test(id) || (order && !SAFE_ID.test(order))) return null;
  return { sellerUserId: id, orderId: order };
}

function orderRow(id: string, name: string, verified: boolean): RowSeller {
  return {
    sellerUserId: id,
    name,
    sellerType: "",
    serviceId: "",
    distanceKm: null,
    latitude: null,
    longitude: null,
    precision: "",
    exact: false,
    rating: 0,
    reviewsCount: 0,
    verified,
    region: "",
    raw: {},
    source: "",
    nav: { available: true, modes: [...NAV_MODES], endpoint: "" },
    service: null,
  };
}

function liveWanted(e: Record<string, unknown>, f: MapFilters): boolean {
  if (f.verifiedOnly && e.is_verified === false) return false;
  if (f.sellerType && typeof e.seller_type === "string" && e.seller_type && e.seller_type !== f.sellerType) return false;
  const cat = f.subcategoryId || f.categoryId;
  const cats = Array.isArray(e.category_ids) ? e.category_ids.map(String) : null;
  if (cat && cats && cats.length && !cats.includes(cat)) return false;
  return true;
}

const SHEET_FILTERS = ["categoryId", "subcategoryId", "sellerType", "minRating", "verifiedOnly"] as const;

export default function NearbySellers({
  base,
  services,
  categoryTree,
  initialRadius,
  initialServiceId,
  known,
  onShowAll,
  onChange,
}: {
  base: string;
  services: readonly NearbyServiceOption[];
  categoryTree: readonly CategoryRow[] | null;
  initialRadius: NearbyRadius;
  initialServiceId: string;
  known: (userId: string) => MarketSeller | null;
  onShowAll: () => void;
  onChange: (s: { radius: NearbyRadius; serviceId: string }) => void;
}) {
  const t = useTranslations("marketplace.nearby");
  const tx = useTranslations("marketMap");
  const ty = useTranslations("marketplace.ymap");
  const tm = useTranslations("marketplace");
  const locale = useLocale();
  const uid = useId();
  const titleId = `${uid}t`;
  const headId = `${uid}h`;
  const { session } = useAuth();
  const signedIn = !!session?.token;
  const phone = useNarrow();
  const rootRef = useRef<HTMLElement>(null);
  const filterBtn = useRef<HTMLButtonElement>(null);

  const [cfg, setCfg] = useState<MapConfig | null>(null);
  const [broken, setBroken] = useState(false);
  const [view, setView] = useState<PanelView>("map");
  const [filters, setFilters] = useState<MapFilters>(() => ({ ...DEFAULT_MAP_FILTERS, serviceId: initialServiceId }));
  const [radius, setRadius] = useState<NearbyRadius>(initialRadius);
  const [sort, setSort] = useState<NearbySort>("nearest");
  const [here, setHere] = useState<Here | null>(null);
  const [geo, setGeo] = useState<Geo>({ busy: false, fail: null });
  const [needLogin, setNeedLogin] = useState(false);
  const [manual, setManual] = useState(false);
  const [pickPoint, setPickPoint] = useState<Spot | null>(null);
  const [center, setCenter] = useState<Spot | null>(null);
  const [consent, setConsent] = useState<LocationConsent | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentErr, setConsentErr] = useState<MapErrorKey | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [tick, setTick] = useState(0);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [pinRows, setPinRows] = useState<readonly MapSeller[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [following, setFollowing] = useState(false);
  const [routeWaitUntil, setRouteWaitUntil] = useState(0);
  const routeWaitS = useDeadline(routeWaitUntil);
  const holdRoutes = (sec: number) => setRouteWaitUntil(Date.now() + Math.max(1, sec) * 1000);
  const rerouteCtl = useRef<AbortController | null>(null);
  const [rerouted, setRerouted] = useState(0);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snap>("peek");
  const [inset, setInset] = useState<Inset>({ left: 0, bottom: 0 });
  const [hudH, setHudH] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    let dead = false;
    getMapConfig(locale).then(
      (c) => {
        if (!dead) setCfg(c);
      },
      () => {
        if (!dead) setCfg(offlineMapConfig());
      },
    );
    return () => {
      dead = true;
    };
  }, [locale]);

  const consentUrl = cfg?.consentUrl;
  useEffect(() => {
    if (!signedIn || !consentUrl) return;
    const c = new AbortController();
    getLocationConsent(consentUrl, c.signal).then(
      (v) => {
        if (!c.signal.aborted) setConsent(v);
      },
      () => undefined,
    );
    return () => c.abort();
  }, [signedIn, consentUrl]);

  const live = useMapRealtime(cfg?.realtime ?? null, signedIn && !!cfg, cfg?.debounceMs ?? 400, () => setRefresh((n) => n + 1), (e) => liveWanted(e, filters));

  const mapConsent = useConsent("functional");
  const needConsent = !!cfg?.usable && !broken && mapConsent === false;
  const mapOn = !!cfg?.usable && !broken && mapConsent === true;
  const shownView: PanelView = mapOn || needConsent ? view : "list";
  const fKey = filtersKey(filters);
  const searchKey = here && signedIn ? `${here.point.latitude},${here.point.longitude}|${here.accuracyM ?? ""}|${radius}|${sort}|${fKey}|${tick}` : "";

  useEffect(() => {
    if (!searchKey || !here || !cfg) return;
    const c = new AbortController();
    searchNearbySellers({ point: here.point, accuracyM: here.accuracyM, radius, sort, filters, limit: 50 }, cfg.nearbySearchUrl, c.signal).then(
      (result) => {
        if (c.signal.aborted) return;
        setRes({ key: searchKey, result, fail: null });
        if (result.consent) setConsent(result.consent);
      },
      (e) => {
        if (c.signal.aborted || isAborted(e)) return;
        const k = mapErrorKey(e);
        setRes({ key: searchKey, result: null, fail: k });
        // The consent is gone (expired, or revoked elsewhere): forget the
        // point and ask again. A lost session asks to sign in.
        if (k === "client_location_consent_required") {
          setHere(null);
          setConsent((v) => (v ? { ...v, granted: false } : v));
        }
        if (k === "login_required") setNeedLogin(true);
      },
    );
    return () => c.abort();
    // searchKey stands for the point, radius, sort and filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, cfg]);

  const searching = !!searchKey && res?.key !== searchKey;
  const current = !searching && res?.key === searchKey ? res : null;
  const result = current?.result ?? null;
  const fail = current?.fail ?? null;
  const area = useAreaSellers({ config: cfg, bbox: mapOn ? (viewport?.bbox ?? null) : null, filters, refresh, on: !!cfg && (!mapOn || !!viewport) });
  const findSeller = (id: string): Picked | null => {
    const n = here && signedIn ? result?.items.find((s) => s.sellerUserId === id) : undefined;
    if (n) return { s: n, near: true };
    const a = area.rows.find((s) => s.sellerUserId === id) ?? pinRows.find((s) => s.sellerUserId === id);
    return a ? { s: a, near: false } : null;
  };

  // ── Location: only after the client asks ──────────────────────────────
  const consentHours = cfg?.consentHours ?? 24;
  const grant = async (source: "web" | "manual"): Promise<boolean> => {
    if (!cfg) return false;
    setConsentErr(null);
    try {
      setConsent(await recordLocationConsent({ granted: true, source, durationHours: consentHours }, cfg.consentUrl));
      return true;
    } catch (e) {
      const k = mapErrorKey(e);
      setConsentErr(k);
      if (k === "login_required") setNeedLogin(true);
      return false;
    }
  };

  const locate = (then?: Then) => {
    if (geo.busy || !cfg) return;
    if (!signedIn) {
      select(null);
      setNeedLogin(true);
      return;
    }
    setNeedLogin(false);
    setManual(false);
    setPickPoint(null);
    setGeo({ busy: true, fail: null });
    readPosition({ maximumAgeMs: 60_000, timeoutMs: 15_000 }).then(
      async (fix) => {
        const ok = await grant("web");
        setGeo({ busy: false, fail: null });
        if (!ok) return;
        const point = { latitude: roundCoord(fix.latitude), longitude: roundCoord(fix.longitude) };
        const nav = { latitude: navCoord(fix.latitude), longitude: navCoord(fix.longitude) };
        setHere({ point, nav, accuracyM: Number.isFinite(fix.accuracy) ? Math.round(fix.accuracy) : null, source: "web" });
        setCenter(point);
        setTick((n) => n + 1);
        setSnap((s) => (s === "peek" ? "half" : s));
        then?.(nav);
      },
      (e) => {
        const kind = geoFailureOf(e);
        setGeo({ busy: false, fail: kind });
        setSnap((s) => (s === "peek" ? "half" : s));
        // The browser said no: that is recorded too (it revokes an active consent).
        if (kind === "denied") recordLocationConsent({ granted: false, permissionState: "denied", source: "web" }, cfg.consentUrl).then(setConsent, () => undefined);
      },
    );
  };

  const startManual = () => {
    if (!signedIn) {
      setNeedLogin(true);
      return;
    }
    setFiltersOpen(false);
    select(null);
    setManual(true);
    setPickPoint(null);
    setSnap("half");
    if (mapOn) setView("map");
  };

  const cancelManual = () => {
    setManual(false);
    setPickPoint(null);
  };

  const choosePlace = (p: Place) => {
    setPickPoint(p.point);
    setCenter(p.point);
  };

  const confirmManual = async (p: Spot | null = pickPoint, then?: Then) => {
    if (!p || consentBusy) return;
    setConsentBusy(true);
    const ok = await grant("manual");
    setConsentBusy(false);
    if (!ok) return;
    const point = { latitude: roundCoord(p.latitude), longitude: roundCoord(p.longitude) };
    setHere({ point, accuracyM: null, source: "manual" });
    setGeo({ busy: false, fail: null });
    setManual(false);
    setPickPoint(null);
    setTick((n) => n + 1);
    then?.(point);
  };

  const revoke = async () => {
    if (!cfg || consentBusy) return;
    setConsentBusy(true);
    try {
      setConsent(await recordLocationConsent({ granted: false, permissionState: "denied", source: here?.source ?? "web" }, cfg.consentUrl));
      setHere(null);
      setRes(null);
      setManual(false);
      setGuide(null);
      setFollowing(false);
      setPaused(false);
    } catch (e) {
      setConsentErr(mapErrorKey(e));
    } finally {
      setConsentBusy(false);
    }
  };

  const consentLost = () => {
    setHere(null);
    setRes(null);
    setConsent((c) => (c ? { ...c, granted: false } : c));
  };

  const leaveNearby = () => {
    setHere(null);
    setRes(null);
  };

  const focusSoon = (sel: string) =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true })));

  const stopFollow = () => {
    const hadFocus = !!document.activeElement?.closest?.('[data-ai-id="marketplace.map.follow"]');
    rerouteCtl.current?.abort();
    setFollowing(false);
    setPaused(false);
    if (hadFocus) focusSoon('[data-ai-id="marketplace.route.follow"]');
  };
  const followPath = guide?.info?.available ? guide.path : null;
  const fol = useFollow({ active: following, dest: guide?.dest ?? null, path: followPath, onHidden: stopFollow });

  const select = (id: string | null) => {
    if (id === selected) return;
    if (!following && guide && guide.sellerUserId !== id) setGuide(null);
    setSelected(id);
    setPicked(id ? findSeller(id) : null);
    if (id) setSnap((s) => (s === "peek" ? "half" : s));
  };

  const closeDetail = () => {
    const id = selected;
    select(null);
    if (!id) return;
    window.requestAnimationFrame(() => {
      const row = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(".mmrow__btn[data-seller]") ?? []).find((b) => b.dataset.seller === id);
      (row ?? rootRef.current?.querySelector<HTMLElement>(".ymk-canvas"))?.focus({ preventScroll: true });
    });
  };

  const takeGuide = (g: Guide | null) => {
    setGuide(g);
    if (!g) stopFollow();
  };

  const startFollow = () => {
    if (!guide?.dest) return;
    askCompass();
    fol.reset();
    setPaused(false);
    setFollowing(true);
    if (phone) focusSoon('[data-ai-id="marketplace.map.follow.stop"]');
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!following || !root) return;
    let down: { x: number; y: number } | null = null;
    const onCanvas = (e: Event) => !!(e.target as Element | null)?.closest?.(".ymk-canvas");
    const onDown = (e: PointerEvent) => {
      down = onCanvas(e) ? { x: e.clientX, y: e.clientY } : null;
    };
    const onMove = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) return;
      down = null;
      setPaused(true);
    };
    const onUp = () => {
      down = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (onCanvas(e)) setPaused(true);
    };
    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("pointermove", onMove, true);
    root.addEventListener("pointerup", onUp, true);
    root.addEventListener("pointercancel", onUp, true);
    root.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => {
      root.removeEventListener("pointerdown", onDown, true);
      root.removeEventListener("pointermove", onMove, true);
      root.removeEventListener("pointerup", onUp, true);
      root.removeEventListener("pointercancel", onUp, true);
      root.removeEventListener("wheel", onWheel, true);
    };
  }, [following]);

  const followPoint = following ? fol.point : null;
  const followView = useMemo(() => (following && !paused && fol.point ? { point: fol.point, heading: fol.heading } : null), [following, paused, fol.point, fol.heading]);
  const guideLine = useMemo(() => (guide?.dest ? { from: guide.from, to: guide.dest, name: guide.name, path: guide.path } : null), [guide]);

  const recalcM = guide?.info?.recalcM ?? cfg?.routing.recalcM ?? 100;
  const guideDest = guide?.dest ?? null;
  const routeLen = useMemo(() => (followPath ? pathLength(followPath) : 0), [followPath]);
  const endGap = useMemo(() => (followPath && guideDest ? distanceMeters(followPath[followPath.length - 1], guideDest) : 0), [followPath, guideDest]);
  const arrivedNow = arrivedNear(fol.meters, followPath ? routeRemainM(followPath, routeLen, fol) : null, endGap);
  const needReroute =
    following && routeWaitS === 0 && !arrivedNow && !!guide && recalcArmed(guide.info) && !!fol.point && distanceMeters(fol.point, guide.from) - (fol.accuracy ?? 0) >= recalcM;
  const rerouting = useRef(false);
  const reroute = useEffectEvent(() => {
    const g = guide;
    const p = fol.point;
    if (!g || !p || !cfg || rerouting.current) return;
    rerouting.current = true;
    const ctl = new AbortController();
    rerouteCtl.current = ctl;
    const timer = window.setTimeout(() => ctl.abort(), REROUTE_TIMEOUT_MS);
    const settle = () => {
      window.clearTimeout(timer);
      if (rerouteCtl.current === ctl) rerouteCtl.current = null;
      rerouting.current = false;
      setRerouted((n) => n + 1);
    };
    const from = { latitude: navCoord(p.latitude), longitude: navCoord(p.longitude) };
    requestGuide({ target: g.target, template: cfg.navigationTemplate, point: from, mode: g.mode, recalculate: true, sessionId: g.sessionId, locale: mapLocaleOf(locale), signal: ctl.signal }).then(
      (next) => {
        settle();
        setGuide((cur) => {
          if (cur !== g) return cur;
          const sameDest = !!next.dest && !!cur.dest && next.route.destinationSource === cur.route.destinationSource && distanceMeters(next.dest, cur.dest) < 60;
          return next.info?.available || !cur.info?.available || !sameDest ? { ...next, from: p } : { ...cur, from: p };
        });
      },
      (e) => {
        settle();
        if (isAborted(e)) return;
        if (isRateLimited(e)) {
          holdRoutes(retryAfterSec(e, 60));
          return;
        }
        const k = mapErrorKey(e);
        if (k === "client_location_consent_required") {
          stopFollow();
          consentLost();
          return;
        }
        if (k === "login_required") {
          stopFollow();
          setNeedLogin(true);
          return;
        }
        if (k === "seller_not_found" || k === "paid_order_not_found" || k === "active_paid_order_required" || k === "public_office_navigation_unavailable") {
          takeGuide(null);
          return;
        }
        setGuide((cur) => (cur === g ? { ...cur, from: p } : cur));
      },
    );
  });
  useEffect(() => {
    if (needReroute) reroute();
  }, [needReroute, rerouted]);

  const [orderRoute] = useState<OrderRoute | null>(() => (typeof window === "undefined" ? null : orderRouteOf(window.location.search)));
  const openedOrder = useRef(false);
  const openOrder = useEffectEvent(() => {
    const o = orderRoute;
    if (!o || openedOrder.current) return;
    openedOrder.current = true;
    const k = known(o.sellerUserId);
    const show = (name: string, verified: boolean) => {
      setSelected(o.sellerUserId);
      setPicked({ s: orderRow(o.sellerUserId, name, verified), near: false });
      setSnap((v) => (v === "peek" ? "half" : v));
    };
    if (k) {
      show(k.name, k.verified);
      return;
    }
    getMarketplaceSeller(o.sellerUserId).then(
      (m) => show(m.name, m.verified),
      () => show("", false),
    );
  });
  useEffect(() => {
    if (cfg && signedIn && orderRoute) openOrder();
  }, [cfg, signedIn, orderRoute]);
  const hudOn = following && !!guide && mapOn;
  const hudOver = hudOn && phone;
  const mapInset = useMemo(() => ({ left: inset.left, bottom: hudOn ? Math.max(hudH, inset.bottom) : inset.bottom }), [inset.left, inset.bottom, hudOn, hudH]);
  const takeInset = (v: Inset) => setInset((p) => (p.left === v.left && p.bottom === v.bottom ? p : v));

  // ── Filters ───────────────────────────────────────────────────────────
  const rowsById = useMemo(() => new Map((categoryTree ?? []).map((r) => [r.node.id, r])), [categoryTree]);
  const inCategory = (catOfService: string, cat: string) => catOfService === cat || !!rowsById.get(catOfService)?.ancestors.includes(cat);
  const setFilter = <K extends keyof MapFilters>(k: K, v: MapFilters[K]) => {
    setFilters((f) => {
      const next = { ...f, [k]: v };
      if (k === "categoryId") next.subcategoryId = "";
      if (k === "categoryId" || k === "subcategoryId") {
        const cat = String(k === "categoryId" ? v : f.categoryId);
        const svc = services.find((s) => s.value === next.serviceId);
        if (svc?.categoryId && cat && !inCategory(svc.categoryId, cat)) next.serviceId = "";
      }
      return next;
    });
    if (k === "serviceId") onChange({ radius, serviceId: String(v) });
  };

  const catName = (title: string) => categoryTitleName(title, locale);
  const topCats = (categoryTree ?? []).filter((r) => r.depth === 0);
  const subCats = filters.categoryId ? (categoryTree ?? []).filter((r) => r.ancestors.includes(filters.categoryId)) : [];
  const svcOptions = services.filter((s) => !filters.categoryId || !s.categoryId || inCategory(s.categoryId, filters.subcategoryId || filters.categoryId));

  const pickRadius = (r: NearbyRadius) => {
    setRadius(r);
    onChange({ radius: r, serviceId: filters.serviceId });
  };

  const clearFilters = () => {
    setFilters({ ...DEFAULT_MAP_FILTERS });
    onChange({ radius, serviceId: "" });
  };
  const clearSheet = () => setFilters((f) => ({ ...DEFAULT_MAP_FILTERS, serviceId: f.serviceId }));
  const filtersOn = fKey !== filtersKey(DEFAULT_MAP_FILTERS);
  const activeFilters = SHEET_FILTERS.filter((k) => filters[k] !== DEFAULT_MAP_FILTERS[k]).length;

  const topBar = (
    <MapTopBar
      floating={mapOn}
      serviceId={filters.serviceId}
      services={[{ value: "", label: t("allServices") }, ...svcOptions.map((s) => ({ value: s.value, label: s.label }))]}
      onService={(v) => setFilter("serviceId", v)}
      active={activeFilters}
      filtersOpen={filtersOpen}
      onFilters={() => setFiltersOpen((o) => !o)}
      filterRef={filterBtn}
      view={shownView}
      onView={setView}
      mapOn={mapOn || needConsent}
    />
  );

  const precText = t("precision", { m: precisionMeters(cfg?.nearbyPrecision ?? "approximate_50m") });
  const areaPrec = tx("approxArea", { m: precisionMeters(cfg?.markerPrecision ?? "approximate_500m") });
  const lowAccuracy = !!result && (result.accuracyWarning || (here?.source === "web" && here.accuracyM !== null && here.accuracyM > (cfg?.accuracyWarnM ?? 500)));
  const shownR = result ? result.radiusKm : radius;
  const nextRadius = NEARBY_RADII.find((r) => r > radius) ?? null;
  const badFilter = fail ? filterOfError(fail) : null;
  const nearOn = !!here && signedIn;

  const consentUntil = consent?.granted && consent.expiresAt ? fmtDateTime(consent.expiresAt, locale, false) : "";
  const consentChip = consent?.granted ? (
    <span className="mmchip" data-ai-id="marketplace.map.consent">
      <IconLock aria-hidden="true" />
      <span>{consentUntil ? tx("consent.chip", { time: consentUntil }) : tx("consent.chipOn")}</span>
      <button type="button" onClick={revoke} disabled={consentBusy} data-ai-id="marketplace.map.consent.revoke">
        {tx("consent.cancel")}
      </button>
    </span>
  ) : null;

  const head: ReactNode = nearOn ? (
    <div className="mph mph--near">
      <span className="mph__ic" aria-hidden="true">
        <IconTarget />
      </span>
      <div className="mph__txt" aria-live="polite">
        <b id={headId}>
          {searching ? t("loading") : <RollText value={result?.items.length ?? 0} render={(n) => (result?.fallbackNearest ? tx("panel.nearest", { n }) : tx("panel.near", { n }))} />}
        </b>
        <span className="mph__sub">
          {here?.source === "manual" ? tx("from.manual") : tx("from.web")} · {precText}
        </span>
      </div>
      <button type="button" className="mph__x" onClick={leaveNearby} aria-label={tx("panel.exitNear")} title={tx("panel.exitNear")} data-ai-id="marketplace.map.near.exit">
        <IconClose aria-hidden="true" />
      </button>
    </div>
  ) : (
    <div className="mph">
      <span className="mph__ic" aria-hidden="true">
        <IconMap />
      </span>
      <div className="mph__txt" aria-live="polite">
        <b id={headId}>
          {area.loading && !area.rows.length ? ty("loading") : <RollText value={area.total} render={(n) => (area.country ? tx("area.countAll", { n }) : tx("panel.area", { n }))} />}
        </b>
        <span className="mph__sub">{areaPrec}</span>
      </div>
    </div>
  );

  const loginLine =
    needLogin && !signedIn ? (
      <div className="mmnote mmnote--login" role="status" data-ai-id="marketplace.map.login">
        <IconLock aria-hidden="true" />
        <span className="mmnote__txt">
          <b>{tx("login.title")}</b>
        </span>
        <span className="mmnote__acts">
          <Link href="/login" className="mmnote__act mmnote__act--main" data-ai-id="marketplace.map.login.go">
            {tx("login.go")}
          </Link>
          <button type="button" className="mmnote__x" onClick={() => setNeedLogin(false)} aria-label={tx("manual.cancel")}>
            <IconClose aria-hidden="true" />
          </button>
        </span>
      </div>
    ) : null;

  const geoLine =
    geo.fail && !manual ? (
      <div className="mmnote mmnote--warn" role="alert" data-ai-id={geo.fail === "denied" ? "marketplace.map.denied" : "marketplace.map.geo-failed"}>
        <IconMapPin aria-hidden="true" />
        <span className="mmnote__txt">
          <b>{geo.fail === "denied" ? tx("denied.title") : tx("geoFail.title")}</b>
          <small>{tx(`geoFail.${geo.fail}`)}</small>
        </span>
        <span className="mmnote__acts">
          <button type="button" className="mmnote__act mmnote__act--main" onClick={startManual} data-ai-id="marketplace.map.manual.start">
            <IconTarget aria-hidden="true" />
            {mapOn ? tx("denied.pickMap") : tx("denied.pickAddress")}
          </button>
          {geo.fail !== "insecure" && geo.fail !== "unsupported" ? (
            <button type="button" className="mmnote__act" onClick={() => locate()} data-ai-id="marketplace.map.locate.retry">
              <IconRefresh aria-hidden="true" />
              {t("retry")}
            </button>
          ) : null}
        </span>
      </div>
    ) : null;

  const manualBlock = (
    <div className="mmman" data-ai-id="marketplace.map.manual" data-ai-type="section">
      <div className="mmman__head">
        <span className="mmman__ic" aria-hidden="true">
          <IconTarget />
        </span>
        <b>{tx("manual.title")}</b>
      </div>
      <p className="mmman__lead">{mapOn ? tx("manual.textMap") : tx("manual.textList")}</p>
      <PlaceSearch url={cfg?.geocoderSearchUrl ?? ""} off={!cfg?.geocoderOn} mapOn={mapOn} label={tx("manual.searchLabel")} placeholder={tx("manual.searchPlaceholder")} onSelect={choosePlace} aiId="marketplace.map.manual.place" autoFocus={!mapOn} />
      {pickPoint ? (
        <p className="mmman__picked" role="status">
          <IconMapPin aria-hidden="true" />
          {tx("manual.pinned")}
        </p>
      ) : null}
      <div className="mmman__acts">
        <button type="button" className="btn btn--grad btn--sm" onClick={() => void confirmManual()} disabled={!pickPoint || consentBusy} aria-busy={consentBusy || undefined} data-ai-id="marketplace.map.manual.confirm">
          <IconMapPin aria-hidden="true" />
          {tx("manual.confirm")}
        </button>
        <button type="button" className="btn btn--line btn--sm" onClick={cancelManual} data-ai-id="marketplace.map.manual.cancel">
          {tx("manual.cancel")}
        </button>
      </div>
      <p className="mmman__fine">{tx("manual.consent")}</p>
    </div>
  );

  const intro =
    !nearOn && !geo.fail && !manual ? (
      <div className="mmintro" data-ai-id="marketplace.map.ask" data-ai-type="section">
        <span className="mmintro__art" aria-hidden="true" />
        <span className="mmintro__txt">
          <b>{tx("locate.title")}</b>
          <small>{tx("locate.fine", { h: consentHours })}</small>
          {consent?.state === "expired" ? (
            <small className="mmintro__warn" data-ai-id="marketplace.map.consent.expired">
              {tx("consent.expired")}
            </small>
          ) : null}
          {consentErr ? (
            <small className="mmintro__err" role="alert">
              {tx(`errors.${consentErr}`)}
            </small>
          ) : null}
        </span>
        <button
          type="button"
          className="btn btn--grad btn--sm mmintro__go"
          onClick={() => locate()}
          disabled={geo.busy}
          aria-busy={geo.busy || undefined}
          data-ai-id={mapOn ? "marketplace.map.intro.locate" : "marketplace.nearby.locate"}
        >
          <IconTarget aria-hidden="true" />
          {geo.busy ? tx("locate.asking") : tx("fab.near")}
        </button>
        {consentChip ? <span className="mmintro__chip">{consentChip}</span> : null}
      </div>
    ) : null;

  let nearBody: ReactNode = null;
  if (nearOn) {
    const controls = (
      <div className="mmnear" data-ai-id="marketplace.map.near" data-ai-type="section">
        <Segmented
          value={String(radius)}
          options={NEARBY_RADII.map((r) => ({ value: String(r), label: t("radiusKm", { n: r }), ai: `marketplace.nearby.radius.${r}` }))}
          onChange={(v) => pickRadius(Number(v) as NearbyRadius)}
          label={t("radiusLabel")}
          ai="marketplace.map.radius"
        />
        <Segmented
          value={sort}
          options={NEARBY_SORTS.map((s) => ({ value: s, label: tx(`sortShort.${s}`), title: tx(`sort.${s}`), ai: `marketplace.map.sort.${s}` }))}
          onChange={setSort}
          label={tx("sort.label")}
          ai="marketplace.map.sort"
        />
        <div className="mmnear__row">
          {consentChip}
          <button type="button" className="mmlink" onClick={startManual} data-ai-id="marketplace.map.manual.again">
            <IconTarget aria-hidden="true" />
            {tx("manual.other")}
          </button>
        </div>
      </div>
    );
    let list: ReactNode = null;
    if (searching) {
      list = (
        <div className="mmres" aria-busy="true">
          <p className="sr-only" role="status">
            {t("loading")}
          </p>
          <ul className="mmlist" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="mmrow mmrow--ghost" />
            ))}
          </ul>
        </div>
      );
    } else if (fail && fail !== "client_location_consent_required") {
      list = (
        <div className="mmnote mmnote--warn" role="alert" data-ai-id="marketplace.map.near.error">
          <span className="mmnote__txt">{fail === "radius_invalid" ? tm("errors.radius_invalid", { list: NEARBY_RADII.join(", ") }) : tx(`errors.${fail}`)}</span>
          <span className="mmnote__acts">
            {badFilter ? (
              <button type="button" className="mmnote__act mmnote__act--main" onClick={() => setFilter(badFilter, DEFAULT_MAP_FILTERS[badFilter])} data-ai-id="marketplace.map.near.clear-filter">
                <IconClose aria-hidden="true" />
                {tx("filters.clearOne")}
              </button>
            ) : (
              <button type="button" className="mmnote__act mmnote__act--main" onClick={() => setTick((n) => n + 1)} data-ai-id="marketplace.nearby.retry">
                <IconRefresh aria-hidden="true" />
                {t("retry")}
              </button>
            )}
          </span>
        </div>
      );
    } else if (result && result.items.length) {
      list = (
        <div className="mmres" data-ai-id="marketplace.map.near.results">
          {result.fallbackNearest ? (
            <p className="mmline" data-ai-id="marketplace.map.near.fallback">
              <IconInfo aria-hidden="true" />
              <span>{tx("fallback", { r: shownR })}</span>
            </p>
          ) : null}
          {lowAccuracy ? (
            <p className="mmline mmline--warn" role="status" data-ai-id="marketplace.map.near.accuracy">
              <IconInfo aria-hidden="true" />
              <span>{tx("accuracy.text")}</span>
              <button type="button" onClick={startManual} data-ai-id="marketplace.map.near.accuracy.pick">
                {tx("accuracy.pick")}
              </button>
            </p>
          ) : null}
          <ul className="mmlist" aria-label={t("listLabel")} data-ai-id="marketplace.nearby.results" data-ai-type="list">
            {result.items.map((s, i) => (
              <SellerRow
                key={s.sellerUserId || s.name}
                s={s}
                known={s.sellerUserId ? known(s.sellerUserId) : null}
                precText={precText}
                withDistance
                selected={!!s.sellerUserId && s.sellerUserId === selected}
                onSelect={select}
                index={i}
                ai="marketplace.nearby.seller"
              />
            ))}
          </ul>
          <p className="mmlist__more">{tx("approxNote")}</p>
        </div>
      );
    } else if (result) {
      list = (
        <div className="mmempty" aria-live="polite" data-ai-id="marketplace.map.near.empty">
          <span className="mmempty__ic" aria-hidden="true">
            <IconMapPin />
          </span>
          <b>{t("emptyTitle")}</b>
          <span>{result.fallbackNearest ? tx("emptyNone") : tx("emptyText", { r: shownR })}</span>
          <span className="mmempty__acts">
            {nextRadius && !result.fallbackNearest ? (
              <button type="button" className="btn btn--grad btn--sm" onClick={() => pickRadius(nextRadius)} data-ai-id="marketplace.nearby.widen">
                {t("widen", { r: nextRadius })}
              </button>
            ) : null}
            {filtersOn ? (
              <button type="button" className="btn btn--line btn--sm" onClick={clearFilters}>
                {tx("filters.reset")}
              </button>
            ) : null}
            <button type="button" className="btn btn--line btn--sm" onClick={onShowAll} data-ai-id="marketplace.nearby.show-all">
              <IconUsers aria-hidden="true" />
              {t("showAll")}
            </button>
          </span>
        </div>
      );
    }
    nearBody = (
      <>
        {controls}
        {list}
      </>
    );
  }

  const listBody = (
    <div className="mpn__stack">
      {loginLine}
      {manual ? (
        manualBlock
      ) : (
        <>
          {geoLine}
          {nearOn ? (
            nearBody
          ) : (
            <>
              {intro}
              <AreaList state={area} known={known} precText={areaPrec} selectedId={selected} onSelect={select} onShowAll={onShowAll} />
            </>
          )}
        </>
      )}
    </div>
  );

  const hit = (selected ? findSeller(selected) : null) ?? (picked && picked.s.sellerUserId === selected ? picked : null);
  const inNear = !!hit?.near;
  const sel: RowSeller | null = hit?.s ?? null;
  const selName = sel ? sel.name || known(sel.sellerUserId)?.name || t("map.unnamed") : "";

  const detail =
    sel && cfg ? (
      <SellerDetail
        s={sel}
        known={known(sel.sellerUserId)}
        base={base}
        precM={precisionMeters(inNear ? cfg.nearbyPrecision : cfg.markerPrecision)}
        precText={inNear ? precText : areaPrec}
        withDistance={inNear}
        labelId={`${uid}d`}
        onBack={closeDetail}
      >
        {sel.nav.available || (orderRoute?.sellerUserId === sel.sellerUserId && !!orderRoute.orderId) ? (
          <NavigatorBlock
            key={sel.sellerUserId}
            target={{ sellerUserId: sel.sellerUserId, name: selName, endpoint: sel.nav.endpoint, modes: sel.nav.modes, paidOrderId: orderRoute?.sellerUserId === sel.sellerUserId ? orderRoute.orderId : undefined }}
            point={here?.nav ?? here?.point ?? null}
            signedIn={signedIn}
            locating={geo.busy}
            geoFailed={!!geo.fail}
            geocoderUrl={cfg.geocoderOn ? cfg.geocoderSearchUrl : ""}
            template={cfg.navigationTemplate}
            guide={guide?.sellerUserId === sel.sellerUserId ? guide : null}
            following={following}
            waitS={routeWaitS}
            recalcM={cfg.routing.recalcM}
            serverRoute={cfg.routing.serverRoute}
            onLocate={(then) => locate(then)}
            onManual={(p, then) => void confirmManual(p.point, then)}
            onConsentNeeded={consentLost}
            onLogin={() => setNeedLogin(true)}
            onGuide={takeGuide}
            onStart={startFollow}
            onStop={stopFollow}
            onRateLimited={holdRoutes}
          />
        ) : (
          <div className="msd__nonav" data-ai-id="marketplace.map.card.no-route">
            <IconRoute aria-hidden="true" strokeWidth={1.75} />
            <span>
              <b>{tx("card.noRouteTitle")}</b>
              {tx("card.noRouteText")}
            </span>
          </div>
        )}
      </SellerDetail>
    ) : null;

  const variant: PanelVariant = !mapOn ? "flat" : shownView === "list" ? "full" : phone ? "sheet" : "float";

  const panel = (
    <MapPanel
      variant={variant}
      snap={snap}
      onSnap={setSnap}
      labelId={headId}
      head={head}
      detail={detail}
      detailKey={sel?.sellerUserId ?? ""}
      hidden={hudOver}
      onInset={takeInset}
    >
      {listBody}
    </MapPanel>
  );

  const hud =
    following && guide ? (
      <FollowHud guide={guide} state={fol} paused={paused} floating={mapOn} onRecenter={() => setPaused(false)} onStop={stopFollow} onSize={setHudH} />
    ) : null;

  const fab = mapOn && shownView !== "list" ? (
    <button
      type="button"
      className={`mmfab mmx-in${geo.busy ? " is-busy" : ""}${nearOn ? " is-on" : ""}`}
      style={{ "--d": "120ms" } as CSSProperties}
      onClick={() => locate()}
      disabled={geo.busy}
      aria-busy={geo.busy || undefined}
      title={tx("fab.hint", { h: consentHours })}
      data-ai-id="marketplace.nearby.locate"
    >
      <span className="mmfab__ring" aria-hidden="true" />
      <IconTarget aria-hidden="true" />
      <span>{geo.busy ? tx("fab.locating") : tx("fab.near")}</span>
    </button>
  ) : null;

  const overlay = (
    <>
      {manual ? null : topBar}
      {fab}
      {panel}
      {hud}
    </>
  );

  return (
    <section
      ref={rootRef}
      className={`mknb mmx${mapOn ? " mmx--map" : " mmx--flat"}${following ? " is-following" : ""}`}
      style={{ "--mx-sheet": `${mapInset.bottom}px`, "--mx-left": `${mapInset.left}px`, "--mx-hud": `${following ? hudH : 0}px` } as CSSProperties}
      aria-labelledby={titleId}
      data-ai-target="marketplace:lawyer-list"
      data-ai-id="marketplace.nearby"
      data-ai-type="section"
    >
      <div className="mmx-title">
        <h2 id={titleId}>{tx("title")}</h2>
        <button
          type="button"
          className="mmx-lock"
          aria-expanded={privacyOpen}
          aria-controls={`${uid}p`}
          onClick={() => setPrivacyOpen((v) => !v)}
          title={tx("privacy")}
          data-ai-id="marketplace.map.privacy"
        >
          <IconLock aria-hidden="true" />
          <span className="sr-only">{tx("privacyShow")}</span>
        </button>
      </div>
      <p id={`${uid}p`} className={privacyOpen ? "mmx-privacy" : "sr-only"}>
        {tx("privacy")}
      </p>

      {cfg && !mapOn && !needConsent && mapConsent !== undefined ? (
        <p className="mmoff" role="status" data-ai-id="marketplace.map.unavailable">
          <IconInfo aria-hidden="true" />
          <span>{broken ? tx("unavailable.failed") : tx("unavailable.off")}</span>
        </p>
      ) : null}

      {!cfg || (cfg.usable && !broken && mapConsent === undefined) ? (
        <MapPlaceholder label={ty("loadingMap")} />
      ) : mapOn ? (
        <SellersYandexMap
          config={cfg}
          spot={followPoint ?? here?.point ?? null}
          center={center}
          filters={filters}
          refresh={refresh}
          live={live}
          picking={manual}
          pickPoint={pickPoint}
          onPick={setPickPoint}
          base={base}
          known={known}
          locating={geo.busy}
          onLocate={() => locate()}
          onFail={() => setBroken(true)}
          onShowAll={onShowAll}
          onViewport={setViewport}
          onSellers={setPinRows}
          selectedId={selected}
          onSelect={select}
          guide={guideLine}
          follow={followView}
          panelInset={mapInset}
          searching={searching}
          radiusKm={nearOn ? shownR : null}
          overlay={overlay}
        />
      ) : (
        <div className="mmx-flat">
          {topBar}
          {hud}
          {needConsent && view === "map" ? <MapConsentGate onList={() => setView("list")}>{null}</MapConsentGate> : panel}
        </div>
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        trigger={filterBtn}
        filters={filters}
        onFilter={setFilter}
        onClear={clearSheet}
        active={activeFilters}
        categories={topCats.length ? [{ value: "", label: tx("filters.anyCategory") }, ...topCats.map((r) => ({ value: r.node.id, label: catName(r.node.title) }))] : null}
        subcategories={[{ value: "", label: filters.categoryId ? tx("filters.anySubcategory") : tx("filters.pickCategory") }, ...subCats.map((r) => ({ value: r.node.id, label: r.path.slice(1).map(catName).join(" › ") }))]}
        types={[{ value: "", label: tx("filters.anyType") }, ...SELLER_TYPE_FILTERS.map((v) => ({ value: v as SellerTypeFilter, label: sellerTypeLabel(tm, v) }))]}
      />
    </section>
  );
}
