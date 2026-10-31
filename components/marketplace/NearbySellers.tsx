"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Select from "@/components/Select";
import CheckBox from "@/components/CheckBox";
import { IconBriefcase, IconClose, IconInfo, IconList, IconLock, IconMap, IconMapPin, IconRefresh, IconTarget, IconUsers } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/date";
import type { CategoryRow } from "@/lib/services/categoryTree";
import { categoryTitleName } from "@/lib/categoryNames";
import { NEARBY_RADII, type NearbyRadius } from "@/lib/services/marketRuntime";
import type { MarketSeller } from "@/lib/services/marketplace";
import { geoFailureOf, precisionMeters, roundCoord, type GeoFailure, type NearbyMode, type Spot } from "@/lib/services/marketDiscovery";
import { readPosition } from "@/lib/services/locationShare";
import {
  filterOfError,
  getLocationConsent,
  isAborted,
  mapErrorKey,
  NEARBY_SORTS,
  recordLocationConsent,
  searchNearbySellers,
  type LocationConsent,
  type MapErrorKey,
  type NearbySearchResult,
  type NearbySort,
  type Place,
} from "@/lib/services/mapLocation";
import {
  DEFAULT_MAP_FILTERS,
  filtersKey,
  getMapConfig,
  MIN_RATING_STEPS,
  offlineMapConfig,
  SELLER_TYPE_FILTERS,
  type MapConfig,
  type MapFilters,
  type SellerTypeFilter,
} from "@/lib/services/sellersMap";
import { sellerTypeLabel } from "./bits";
import AreaList from "./map/AreaList";
import NavigateDialog, { type RouteTarget } from "./map/NavigateDialog";
import PlaceSearch from "./map/PlaceSearch";
import SellerRow from "./map/SellerRow";
import SellersYandexMap, { MapPlaceholder, type Viewport } from "./map/SellersYandexMap";
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
type Here = { point: Spot; accuracyM: number | null; source: "web" | "manual" };
type Res = { key: string; result: NearbySearchResult | null; fail: MapErrorKey | null };
type Geo = { busy: boolean; fail: GeoFailure | null };

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
  const { session } = useAuth();
  const signedIn = !!session?.token;

  const [cfg, setCfg] = useState<MapConfig | null>(null);
  const [broken, setBroken] = useState(false);
  const [view, setView] = useState<"list" | "map">("map");
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
  const [routeTo, setRouteTo] = useState<RouteTarget | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let dead = false;
    getMapConfig().then(
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
  }, []);

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

  const live = useMapRealtime(cfg?.realtime ?? null, signedIn && !!cfg, cfg?.debounceMs ?? 400, () => setRefresh((n) => n + 1));

  const mapOn = !!cfg?.usable && !broken;
  const shownView = mapOn ? view : "list";
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

  const locate = () => {
    if (geo.busy || !cfg) return;
    if (!signedIn) {
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
        setHere({ point, accuracyM: Number.isFinite(fix.accuracy) ? Math.round(fix.accuracy) : null, source: "web" });
        setCenter(point);
        setTick((n) => n + 1);
      },
      (e) => {
        const kind = geoFailureOf(e);
        setGeo({ busy: false, fail: kind });
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
    setManual(true);
    setPickPoint(null);
    if (mapOn) setView("map");
  };

  const choosePlace = (p: Place) => {
    setPickPoint(p.point);
    setCenter(p.point);
  };

  const confirmManual = async (p: Spot | null = pickPoint) => {
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
  };

  const revoke = async () => {
    if (!cfg || consentBusy) return;
    setConsentBusy(true);
    try {
      setConsent(await recordLocationConsent({ granted: false, permissionState: "denied", source: here?.source ?? "web" }, cfg.consentUrl));
      setHere(null);
      setRes(null);
      setManual(false);
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
  const filtersOn = fKey !== filtersKey(DEFAULT_MAP_FILTERS);

  const filterBar = (
    <div className="mmf" data-ai-target="marketplace:filters" data-ai-id="marketplace.map.filters">
      <div className="mmf__f" data-ai-id="marketplace.map.filter.service" data-ai-type="select">
        <span className="mmf__l">{tx("filters.service")}</span>
        <Select value={filters.serviceId} onChange={(v) => setFilter("serviceId", v)} options={[{ value: "", label: t("allServices") }, ...svcOptions.map((s) => ({ value: s.value, label: s.label }))]} ariaLabel={tx("filters.service")} search />
      </div>
      {topCats.length ? (
        <div className="mmf__f" data-ai-id="marketplace.map.filter.category" data-ai-type="select">
          <span className="mmf__l">{tx("filters.category")}</span>
          <Select value={filters.categoryId} onChange={(v) => setFilter("categoryId", v)} options={[{ value: "", label: tx("filters.anyCategory") }, ...topCats.map((r) => ({ value: r.node.id, label: catName(r.node.title) }))]} ariaLabel={tx("filters.category")} search />
        </div>
      ) : null}
      {topCats.length ? (
        <div className="mmf__f" data-ai-id="marketplace.map.filter.subcategory" data-ai-type="select">
          <span className="mmf__l">{tx("filters.subcategory")}</span>
          <Select
            value={filters.subcategoryId}
            onChange={(v) => setFilter("subcategoryId", v)}
            options={[{ value: "", label: filters.categoryId ? tx("filters.anySubcategory") : tx("filters.pickCategory") }, ...subCats.map((r) => ({ value: r.node.id, label: r.path.slice(1).map(catName).join(" › ") }))]}
            ariaLabel={tx("filters.subcategory")}
            disabled={!filters.categoryId || !subCats.length}
            search
          />
        </div>
      ) : null}
      <div className="mmf__f mmf__f--s" data-ai-id="marketplace.map.filter.type" data-ai-type="select">
        <span className="mmf__l">{tx("filters.type")}</span>
        <Select value={filters.sellerType} onChange={(v) => setFilter("sellerType", v as SellerTypeFilter)} options={[{ value: "", label: tx("filters.anyType") }, ...SELLER_TYPE_FILTERS.map((v) => ({ value: v, label: sellerTypeLabel(tm, v) }))]} ariaLabel={tx("filters.type")} />
      </div>
      <div className="mmf__f mmf__f--s" data-ai-id="marketplace.map.filter.rating" data-ai-type="select">
        <span className="mmf__l">{tx("filters.rating")}</span>
        <Select
          value={String(filters.minRating)}
          onChange={(v) => setFilter("minRating", Number(v) || 0)}
          options={MIN_RATING_STEPS.map((n) => ({ value: String(n), label: n > 0 ? tx("filters.ratingFrom", { n: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n) }) : tx("filters.anyRating") }))}
          ariaLabel={tx("filters.rating")}
        />
      </div>
      <div className="mmf__chk" data-ai-id="marketplace.map.filter.verified">
        <CheckBox checked={filters.verifiedOnly} onChange={(on) => setFilter("verifiedOnly", on)}>
          {tx("filters.verified")}
        </CheckBox>
      </div>
      {filtersOn ? (
        <button type="button" className="mmf__reset" onClick={clearFilters} data-ai-id="marketplace.map.filters.reset">
          <IconClose aria-hidden="true" />
          {tx("filters.reset")}
        </button>
      ) : null}
    </div>
  );

  const viewToggle = mapOn ? (
    <div className="mknb-view" role="group" aria-label={t("map.view")}>
      <button type="button" aria-pressed={shownView === "map"} onClick={() => setView("map")} data-ai-id="marketplace.nearby.view.map">
        <IconMap aria-hidden="true" />
        {t("map.map")}
      </button>
      <button type="button" aria-pressed={shownView === "list"} onClick={() => setView("list")} data-ai-id="marketplace.nearby.view.list">
        <IconList aria-hidden="true" />
        {t("map.list")}
      </button>
    </div>
  ) : null;

  // ── The "near me" panel: prompt, denied, manual, active ───────────────
  const consentUntil = consent?.granted && consent.expiresAt ? fmtDateTime(consent.expiresAt, locale, false) : "";
  const consentChip = consent?.granted ? (
    <span className="mml__consent" data-ai-id="marketplace.map.consent">
      <IconLock aria-hidden="true" />
      <span>{consentUntil ? tx("consent.until", { time: consentUntil }) : tx("consent.on")}</span>
      <button type="button" onClick={revoke} disabled={consentBusy} data-ai-id="marketplace.map.consent.revoke">
        {tx("consent.revoke")}
      </button>
    </span>
  ) : null;

  const manualPanel = (
    <div className="mml mml--manual" data-ai-id="marketplace.map.manual" data-ai-type="section">
      <span className="mml__ic mml__ic--pick" aria-hidden="true">
        <IconTarget />
      </span>
      <div className="mml__txt">
        <b>{tx("manual.title")}</b>
        <p>{mapOn ? tx("manual.textMap") : tx("manual.textList")}</p>
        <PlaceSearch url={cfg?.geocoderSearchUrl ?? ""} off={!cfg?.geocoderOn} mapOn={mapOn} label={tx("manual.searchLabel")} placeholder={tx("manual.searchPlaceholder")} onSelect={choosePlace} aiId="marketplace.map.manual.place" autoFocus={!mapOn} />
        {pickPoint ? (
          <p className="mml__picked" role="status">
            <IconMapPin aria-hidden="true" />
            {tx("manual.pinned")}
          </p>
        ) : null}
        <div className="mml__acts">
          <button type="button" className="btn btn--grad btn--sm" onClick={() => confirmManual()} disabled={!pickPoint || consentBusy} aria-busy={consentBusy || undefined} data-ai-id="marketplace.map.manual.confirm">
            <IconMapPin aria-hidden="true" />
            {tx("manual.confirm")}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => { setManual(false); setPickPoint(null); }} data-ai-id="marketplace.map.manual.cancel">
            {tx("manual.cancel")}
          </button>
        </div>
        <p className="mml__fine">{tx("manual.consent")}</p>
      </div>
    </div>
  );

  let panel: ReactNode;
  if (!cfg) panel = null;
  else if (needLogin && !signedIn) {
    panel = (
      <div className="mml mml--login" role="status" data-ai-id="marketplace.map.login">
        <span className="mml__ic" aria-hidden="true">
          <IconLock />
        </span>
        <div className="mml__txt">
          <b>{tx("login.title")}</b>
          <p>{tx("login.text")}</p>
          <div className="mml__acts">
            <Link href="/login" className="btn btn--grad btn--sm" data-ai-id="marketplace.map.login.go">
              {tx("login.go")}
            </Link>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setNeedLogin(false)}>
              {tx("manual.cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  } else if (manual) panel = manualPanel;
  else if (geo.fail) {
    const denied = geo.fail === "denied";
    const canRetry = geo.fail !== "insecure" && geo.fail !== "unsupported";
    panel = (
      <div className="mml mml--warn" role="alert" data-ai-id={denied ? "marketplace.map.denied" : "marketplace.map.geo-failed"}>
        <span className="mml__ic mml__ic--warn" aria-hidden="true">
          <IconMapPin />
        </span>
        <div className="mml__txt">
          <b>{denied ? tx("denied.title") : tx("geoFail.title")}</b>
          <p>{tx(`geoFail.${geo.fail}`)}</p>
          <div className="mml__acts">
            <button type="button" className="btn btn--grad btn--sm" onClick={startManual} data-ai-id="marketplace.map.manual.start">
              <IconTarget aria-hidden="true" />
              {mapOn ? tx("denied.pickMap") : tx("denied.pickAddress")}
            </button>
            {canRetry ? (
              <button type="button" className="btn btn--line btn--sm" onClick={locate} data-ai-id="marketplace.map.locate.retry">
                <IconRefresh aria-hidden="true" />
                {t("retry")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  } else if (here) {
    panel = (
      <div className="mml mml--on" data-ai-id="marketplace.map.near" data-ai-type="section">
        <div className="mml__row">
          <span className="mml__from">
            <IconMapPin aria-hidden="true" />
            {here.source === "manual" ? tx("from.manual") : tx("from.web")}
          </span>
          {consentChip}
        </div>
        <div className="mml__ctl">
          <div className="mknb-chips" role="group" aria-label={t("radiusLabel")} data-ai-id="marketplace.map.radius">
            {NEARBY_RADII.map((r) => (
              <button key={r} type="button" className="mk-chip mk-chip--sm" aria-pressed={radius === r} onClick={() => pickRadius(r)} data-ai-id={`marketplace.nearby.radius.${r}`}>
                {t("radiusKm", { n: r })}
              </button>
            ))}
          </div>
          <div className="mml__sort" data-ai-id="marketplace.map.sort" data-ai-type="select">
            <Select value={sort} onChange={(v) => setSort(v as NearbySort)} options={NEARBY_SORTS.map((s) => ({ value: s, label: tx(`sort.${s}`) }))} ariaLabel={tx("sort.label")} />
          </div>
          <span className="mml__more">
            <button type="button" className="btn btn--line btn--sm" onClick={locate} disabled={geo.busy} aria-busy={geo.busy || undefined} data-ai-id="marketplace.nearby.relocate">
              <IconRefresh aria-hidden="true" />
              {geo.busy ? tx("locate.asking") : t("relocate")}
            </button>
            <button type="button" className="btn btn--line btn--sm" onClick={startManual} data-ai-id="marketplace.map.manual.again">
              <IconTarget aria-hidden="true" />
              {tx("manual.other")}
            </button>
          </span>
        </div>
      </div>
    );
  } else {
    panel = (
      <div className="mml mml--ask" data-ai-id="marketplace.map.ask" data-ai-type="section">
        <span className="mml__ic" aria-hidden="true">
          <IconTarget />
        </span>
        <div className="mml__txt">
          <b>{tx("locate.title")}</b>
          <p>{tx("locate.text")}</p>
          {consentErr ? (
            <p className="mml__err" role="alert">
              {tx(`errors.${consentErr}`)}
            </p>
          ) : null}
          <div className="mml__acts">
            <button type="button" className="btn btn--grad mknb-locate" onClick={locate} disabled={geo.busy} aria-busy={geo.busy || undefined} data-ai-id="marketplace.nearby.locate">
              <IconTarget aria-hidden="true" />
              {geo.busy ? tx("locate.asking") : tx("locate.go")}
            </button>
            {consentChip}
          </div>
          <p className="mml__fine">{tx("locate.fine", { h: consentHours })}</p>
        </div>
      </div>
    );
  }

  // ── Nearby results ────────────────────────────────────────────────────
  const precText = t("precision", { m: precisionMeters(cfg?.nearbyPrecision ?? "approximate_50m") });
  const lowAccuracy = !!result && (result.accuracyWarning || (here?.source === "web" && here.accuracyM !== null && here.accuracyM > (cfg?.accuracyWarnM ?? 500)));
  const shownR = result ? result.radiusKm : radius;
  const nextRadius = NEARBY_RADII.find((r) => r > radius) ?? null;
  const badFilter = fail ? filterOfError(fail) : null;
  const openRoute = signedIn ? (rt: RouteTarget) => setRouteTo(rt) : () => setNeedLogin(true);

  let results: ReactNode = null;
  if (here && signedIn) {
    if (searching) {
      results = (
        <div className="mmres" aria-busy="true">
          <p className="sr-only" role="status">
            {t("loading")}
          </p>
          <ul className="mknb-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="mknb-row mknb-row--ghost" />
            ))}
          </ul>
        </div>
      );
    } else if (fail && fail !== "client_location_consent_required") {
      results = (
        <div className="mknb-msg" role="alert" data-ai-id="marketplace.map.near.error">
          <p>{fail === "radius_invalid" ? tm("errors.radius_invalid", { list: NEARBY_RADII.join(", ") }) : tx(`errors.${fail}`)}</p>
          <div className="mknb-msg__acts">
            {badFilter ? (
              <button type="button" className="btn btn--grad btn--sm" onClick={() => setFilter(badFilter, DEFAULT_MAP_FILTERS[badFilter])} data-ai-id="marketplace.map.near.clear-filter">
                <IconClose aria-hidden="true" />
                {tx("filters.clearOne")}
              </button>
            ) : (
              <button type="button" className="btn btn--grad btn--sm" onClick={() => setTick((n) => n + 1)} data-ai-id="marketplace.nearby.retry">
                <IconRefresh aria-hidden="true" />
                {t("retry")}
              </button>
            )}
          </div>
        </div>
      );
    } else if (result && result.items.length) {
      results = (
        <div className="mmres" data-ai-id="marketplace.map.near.results">
          <div className="mknb-meta" aria-live="polite">
            <span className="mknb-meta__n">{result.fallbackNearest ? t("countNearest", { n: result.items.length }) : t("count", { n: result.items.length, r: shownR })}</span>
            <span className="mknb-prec">{precText}</span>
            <p className="mknb-note">{tx("approxNote")}</p>
          </div>
          {result.fallbackNearest ? (
            <p className="mknb-fallback" data-ai-id="marketplace.map.near.fallback">
              <IconInfo aria-hidden="true" />
              <span>{tx("fallback", { r: shownR })}</span>
            </p>
          ) : null}
          {lowAccuracy ? (
            <div className="mml__low" role="status" data-ai-id="marketplace.map.near.accuracy">
              <IconInfo aria-hidden="true" />
              <span>{tx("accuracy.text")}</span>
              <button type="button" onClick={startManual} data-ai-id="marketplace.map.near.accuracy.pick">
                {tx("accuracy.pick")}
              </button>
            </div>
          ) : null}
          <ul className="mknb-list" aria-label={t("listLabel")} data-ai-id="marketplace.nearby.results" data-ai-type="list">
            {result.items.map((s) => (
              <SellerRow key={s.sellerUserId || s.name} s={s} known={s.sellerUserId ? known(s.sellerUserId) : null} base={base} precText={precText} withDistance onNavigate={openRoute} ai="marketplace.nearby.seller" />
            ))}
          </ul>
        </div>
      );
    } else if (result) {
      results = (
        <div className="mk-empty mknb-empty" aria-live="polite" data-ai-id="marketplace.map.near.empty">
          <IconMapPin aria-hidden="true" />
          <b>{t("emptyTitle")}</b>
          <span>{result.fallbackNearest ? tx("emptyNone") : tx("emptyText", { r: shownR })}</span>
          <div className="mk-empty__acts">
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
          </div>
        </div>
      );
    }
  }

  let body: ReactNode;
  if (!cfg) body = <MapPlaceholder label={ty("loadingMap")} />;
  else if (shownView === "map") {
    body = (
      <>
        <SellersYandexMap
          config={cfg}
          spot={here?.point ?? null}
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
          onLocate={locate}
          onFail={() => setBroken(true)}
          onShowAll={onShowAll}
          onViewport={setViewport}
          onNavigate={openRoute}
          hideList={!!results}
        />
        {results}
      </>
    );
  } else {
    body = results ?? <AreaList config={cfg} bbox={mapOn ? (viewport?.bbox ?? null) : null} filters={filters} refresh={refresh} base={base} known={known} onNavigate={openRoute} onShowAll={onShowAll} />;
  }

  return (
    <section className="mknb" aria-labelledby={titleId} data-ai-target="marketplace:lawyer-list" data-ai-id="marketplace.nearby" data-ai-type="section">
      <div className="mknb-head">
        <span className="mknb-head__ic" aria-hidden="true">
          <IconMap />
        </span>
        <div className="mknb-head__txt">
          <h2 id={titleId}>{tx("title")}</h2>
          <p>{tx("lead")}</p>
          <p className="mknb-privacy">
            <IconLock aria-hidden="true" />
            <span>{tx("privacy")}</span>
          </p>
        </div>
        {viewToggle ? <div className="ymk-switch">{viewToggle}</div> : null}
      </div>

      {filterBar}

      {cfg && !mapOn ? (
        <p className="mmoff" role="status" data-ai-id="marketplace.map.unavailable">
          <IconInfo aria-hidden="true" />
          <span>{broken ? tx("unavailable.failed") : tx("unavailable.off")}</span>
        </p>
      ) : null}

      {panel}

      <div className="mknb-body">{body}</div>

      {routeTo && cfg ? (
        <NavigateDialog
          target={routeTo}
          point={here?.point ?? null}
          locating={geo.busy}
          geoFailed={!!geo.fail}
          template={cfg.navigationTemplate}
          geocoderUrl={cfg.geocoderOn ? cfg.geocoderSearchUrl : ""}
          signedIn={signedIn}
          onLocate={locate}
          onManual={(p) => void confirmManual(p.point)}
          onConsentNeeded={consentLost}
          onClose={() => setRouteTo(null)}
        />
      ) : null}
    </section>
  );
}
