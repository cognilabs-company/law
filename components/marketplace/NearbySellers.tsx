"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Select from "@/components/Select";
import VerifiedBadge from "@/components/VerifiedBadge";
import { IconBuilding, IconInfo, IconList, IconLock, IconMap, IconMapPin, IconRefresh, IconStarRate, IconUsers } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";
import { regionLabel } from "@/lib/labels";
import { humanizeSlug } from "@/lib/lawyers";
import { fmtRating } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { NEARBY_RADII, type NearbyRadius, type NearbyResult, type NearbySeller } from "@/lib/services/marketRuntime";
import type { MarketSeller } from "@/lib/services/marketplace";
import { approxDistance, findNearby, geoFailureOf, locateClient, nearbyFailureOf, nearbyKey, precisionMeters, sortNearby, type GeoFailure, type NearbyFailure, type NearbyMode, type Spot } from "@/lib/services/marketDiscovery";
import { getMapConfig, locationSourceOf, type MapConfig } from "@/lib/services/sellersMap";
import { Monogram, sellerTypeLabel } from "./bits";
import NearbyMap from "./NearbyMap";
import SellersYandexMap, { MapPlaceholder } from "./map/SellersYandexMap";
import "./nearbySellers.css";

export type NearbyServiceOption = { value: string; label: string };

export function MarketModeSwitch({ mode, onChange }: { mode: NearbyMode; onChange: (m: NearbyMode) => void }) {
  const t = useTranslations("marketplace.mode");
  return (
    <div className="mknb-mode" role="group" aria-label={t("label")}>
      <button type="button" className="mknb-mode__b" aria-pressed={mode === "all"} onClick={() => onChange("all")} data-ai-id="marketplace.mode.all" data-ai-type="tab">
        <IconUsers aria-hidden="true" />
        <span>{t("all")}</span>
      </button>
      <button type="button" className="mknb-mode__b" aria-pressed={mode === "nearby"} onClick={() => onChange("nearby")} data-ai-id="marketplace.mode.nearby" data-ai-type="tab">
        <IconMapPin aria-hidden="true" />
        <span>{t("nearby")}</span>
      </button>
    </div>
  );
}

type GeoState = { busy: boolean; fail: GeoFailure | null };
type ResState = { key: string; result: NearbyResult | null; fail: NearbyFailure | null };
type YandexState = { cfg: MapConfig | null; off: boolean };

export default function NearbySellers({
  base,
  services,
  initialRadius,
  initialServiceId,
  known,
  onShowAll,
  onChange,
}: {
  base: string;
  services: readonly NearbyServiceOption[];
  initialRadius: NearbyRadius;
  initialServiceId: string;
  known: (userId: string) => MarketSeller | null;
  onShowAll: () => void;
  onChange: (s: { radius: NearbyRadius; serviceId: string }) => void;
}) {
  const t = useTranslations("marketplace.nearby");
  const ty = useTranslations("marketplace.ymap");
  const tm = useTranslations("marketplace");
  const te = useTranslations("enums");
  const locale = useLocale();
  const uid = useId();
  const titleId = `${uid}t`;
  const radiusErrId = `${uid}r`;

  const [radius, setRadius] = useState<NearbyRadius>(initialRadius);
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [geo, setGeo] = useState<GeoState>({ busy: false, fail: null });
  const [res, setRes] = useState<ResState | null>(null);
  const [tick, setTick] = useState(0);
  // The results as a list, or on the map around the client.
  const [view, setView] = useState<"list" | "map" | null>(null);
  const [yandex, setYandex] = useState<YandexState>({ cfg: null, off: false });

  useEffect(() => {
    let dead = false;
    getMapConfig().then(
      (cfg) => {
        if (!dead) setYandex(cfg.usable ? { cfg, off: false } : { cfg: null, off: true });
      },
      () => {
        if (!dead) setYandex({ cfg: null, off: true });
      },
    );
    return () => {
      dead = true;
    };
  }, []);

  const yCfg = yandex.off ? null : yandex.cfg;
  const yPending = !yandex.cfg && !yandex.off;
  const shownView = view ?? (yCfg || yPending ? "map" : "list");
  const yMapOn = !!yCfg && shownView === "map";
  const listWanted = !(yCfg || yPending) || shownView === "list";

  const key = `${nearbyKey(spot, radius, serviceId)}#${tick}`;

  useEffect(() => {
    if (!spot || !listWanted) return;
    const c = new AbortController();
    findNearby(spot, radius, serviceId, c.signal).then(
      (result) => {
        if (!c.signal.aborted) setRes({ key, result, fail: null });
      },
      (e) => {
        if (!c.signal.aborted) setRes({ key, result: null, fail: nearbyFailureOf(e) });
      },
    );
    return () => c.abort();
  }, [key, spot, radius, serviceId, listWanted]);

  const loading = !!spot && res?.key !== key;
  const current = !loading && res?.key === key ? res : null;
  const fail = current?.fail ?? null;
  const result = current?.result ?? null;

  const locate = () => {
    if (geo.busy) return;
    setGeo({ busy: true, fail: null });
    locateClient().then(
      (s) => {
        setSpot(s);
        setTick((n) => n + 1);
        setGeo({ busy: false, fail: null });
      },
      (e) => setGeo({ busy: false, fail: geoFailureOf(e) }),
    );
  };

  const pickRadius = (r: NearbyRadius) => {
    setRadius(r);
    onChange({ radius: r, serviceId });
  };

  const pickService = (v: string) => {
    setServiceId(v);
    onChange({ radius, serviceId: v });
  };

  const radiusFail = fail?.kind === "radius" ? fail : null;
  const shownR: number = result && result.radiusKm > 0 ? result.radiusKm : radius;
  const nextRadius = NEARBY_RADII.find((r) => r > radius) ?? null;
  const rows = result ? sortNearby(result.items) : [];
  const precM = precisionMeters(rows[0]?.precision ?? "");
  const precText = t("precision", { m: precM });
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  const serviceOptions = [{ value: "", label: t("allServices") }, ...services.map((s) => ({ value: s.value, label: s.label }))];

  const showAllBtn = (
    <button type="button" className="btn btn--line btn--sm" onClick={onShowAll} data-ai-id="marketplace.nearby.show-all">
      <IconUsers aria-hidden="true" />
      {t("showAll")}
    </button>
  );

  const renderRow = (s: NearbySeller) => {
    const id = s.sellerUserId;
    const k = id ? known(id) : null;
    const name = s.name || k?.name || "";
    const href = id ? `${base}/${encodeURIComponent(id)}` : "";
    const d = approxDistance(s.distanceKm);
    const dText = d ? (d.unit === "m" ? t("distanceM", { d: num.format(d.value) }) : t("distanceKm", { d: num.format(d.value) })) : t("distanceUnknown");
    const dAria = d ? t("distanceAria", { d: dText.replace(/^≈\s*/, ""), p: precText }) : t("distanceUnknown");
    const price = k && k.priceFrom > 0 ? k.priceFrom : 0;
    const rowAi = aiId("marketplace.nearby.seller", id || name);
    const region = s.region || k?.region || "";
    const type = s.sellerType || k?.sellerType || "";
    const src = s.exact ? "" : locationSourceOf(s.raw);
    return (
      <li key={id || name} className="mknb-row" data-ai-id={rowAi} data-ai-type="list_item" data-ai-entity-type="seller" data-ai-entity-id={id || undefined}>
        <Monogram name={name} rating={s.rating} showRing={s.rating > 0} />
        <div className="mknb-row__who">
          <span className="mknb-row__title">
            {href ? (
              <Link href={href} className="mknb-row__name">
                {name}
              </Link>
            ) : (
              <span className="mknb-row__name">{name}</span>
            )}
            {s.verified ? <VerifiedBadge label={false} name={name} subtitle={type ? sellerTypeLabel(tm, type) : undefined} /> : null}
          </span>
          <span className="mknb-row__sub">
            {type ? <span>{sellerTypeLabel(tm, type)}</span> : null}
            {region ? (
              <>
                {type ? <i aria-hidden="true">·</i> : null}
                <span>{regionLabel(te, /[_-]/.test(region) ? humanizeSlug(region) : region)}</span>
              </>
            ) : null}
            {s.rating > 0 ? (
              <>
                {type || region ? <i aria-hidden="true">·</i> : null}
                <span className="mknb-row__rate">
                  <IconStarRate aria-hidden="true" />
                  {fmtRating(s.rating, locale)}
                  {s.reviewsCount > 0 ? <small>({tm("card.reviews", { count: s.reviewsCount })})</small> : null}
                </span>
              </>
            ) : null}
            {src ? (
              <>
                {type || region || s.rating > 0 ? <i aria-hidden="true">·</i> : null}
                <span className="mknb-row__src" data-src={src}>
                  {src === "office" ? <IconBuilding aria-hidden="true" /> : <IconMapPin aria-hidden="true" />}
                  {ty(`src.${src}`)}
                </span>
              </>
            ) : null}
          </span>
          {price ? <b className="mknb-row__price">{tm("card.priceFrom", { price: fmtUzs(price) })}</b> : null}
        </div>
        <span className={`mknb-dist${d ? "" : " mknb-dist--none"}`} title={d ? precText : undefined}>
          <IconMapPin aria-hidden="true" />
          <span aria-hidden="true">{dText}</span>
          <span className="sr-only">{dAria}</span>
        </span>
        {href ? (
          <Link href={href} className="btn btn--line btn--sm mknb-row__go" data-ai-id={`${rowAi}.detail`}>
            {t("profile")}
          </Link>
        ) : null}
      </li>
    );
  };

  const viewToggle = (
    <div className="mknb-view" role="group" aria-label={t("map.view")}>
      <button type="button" aria-pressed={shownView === "list"} onClick={() => setView("list")} data-ai-id="marketplace.nearby.view.list">
        <IconList aria-hidden="true" />
        {t("map.list")}
      </button>
      <button type="button" aria-pressed={shownView === "map"} onClick={() => setView("map")} data-ai-id="marketplace.nearby.view.map">
        <IconMap aria-hidden="true" />
        {t("map.map")}
      </button>
    </div>
  );
  const mapWaiting = yPending && shownView === "map";

  let body: ReactNode = null;
  if (yMapOn && yCfg) {
    body = (
      <>
        {geo.fail ? (
          <div className="mknb-msg" role="alert">
            <p>{t(`geo.${geo.fail}`)}</p>
          </div>
        ) : null}
        <SellersYandexMap
          config={yCfg}
          spot={spot}
          serviceId={serviceId}
          base={base}
          known={known}
          locating={geo.busy}
          onLocate={locate}
          onFail={() => setYandex({ cfg: null, off: true })}
          onShowAll={onShowAll}
        />
      </>
    );
  } else if (mapWaiting) {
    body = <MapPlaceholder label={ty("loadingMap")} />;
  } else if (geo.fail) {
    const canRetry = geo.fail !== "insecure" && geo.fail !== "unsupported";
    body = (
      <div className="mknb-msg" role="alert">
        <p>{t(`geo.${geo.fail}`)}</p>
        <div className="mknb-msg__acts">
          {canRetry ? (
            <button type="button" className="btn btn--grad btn--sm" onClick={locate} data-ai-id="marketplace.nearby.retry">
              <IconRefresh aria-hidden="true" />
              {t("retry")}
            </button>
          ) : null}
          {showAllBtn}
        </div>
      </div>
    );
  } else if (!spot) {
    body = (
      <div className="mknb-intro">
        <span className="mknb-intro__ic" aria-hidden="true">
          <IconMapPin />
        </span>
        <p>{t("approxNote")}</p>
        <button type="button" className="btn btn--grad mknb-locate" onClick={locate} disabled={geo.busy} aria-busy={geo.busy || undefined} data-ai-id="marketplace.nearby.locate">
          <IconMapPin aria-hidden="true" />
          {geo.busy ? t("locating") : t("locate")}
        </button>
      </div>
    );
  } else if (loading) {
    body = (
      <>
        <p className="sr-only" role="status">
          {t("loading")}
        </p>
        <ul className="mknb-list" aria-busy="true" aria-label={t("listLabel")}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="mknb-row mknb-row--ghost" aria-hidden="true" />
          ))}
        </ul>
      </>
    );
  } else if (fail?.kind === "load") {
    body = (
      <div className="mknb-msg" role="alert">
        <p>{t("loadError")}</p>
        <div className="mknb-msg__acts">
          <button type="button" className="btn btn--grad btn--sm" onClick={() => setTick((n) => n + 1)} data-ai-id="marketplace.nearby.retry">
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
          {showAllBtn}
        </div>
      </div>
    );
  } else if (result && rows.length) {
    body = (
      <>
        <div className="mknb-meta" aria-live="polite">
          <span className="mknb-meta__n">{result.fallbackNearest ? t("countNearest", { n: rows.length }) : t("count", { n: rows.length, r: shownR })}</span>
          <span className="mknb-prec">{precText}</span>
          <p className="mknb-note">{t("approxNote")}</p>
          {yCfg ? null : viewToggle}
        </div>
        {result.fallbackNearest ? (
          <p className="mknb-fallback">
            <IconInfo aria-hidden="true" />
            <span>{t("fallback", { r: shownR })}</span>
          </p>
        ) : null}
        {shownView === "map" && spot ? <NearbyMap spot={spot} radiusKm={shownR} items={rows} base={base} label={t("map.label", { n: rows.length, r: shownR })} /> : null}
        <ul className="mknb-list" aria-label={t("listLabel")} data-ai-id="marketplace.nearby.results" data-ai-type="list" hidden={shownView === "map"}>
          {rows.map(renderRow)}
        </ul>
      </>
    );
  } else if (result) {
    body = (
      <div className="mk-empty mknb-empty" aria-live="polite">
        <IconMapPin aria-hidden="true" />
        <b>{t("emptyTitle")}</b>
        <span>{result.fallbackNearest ? t("emptyNone") : t("emptyText", { r: shownR })}</span>
        <div className="mk-empty__acts">
          {nextRadius && !result.fallbackNearest ? (
            <button type="button" className="btn btn--grad btn--sm" onClick={() => pickRadius(nextRadius)} data-ai-id="marketplace.nearby.widen">
              {t("widen", { r: nextRadius })}
            </button>
          ) : null}
          {showAllBtn}
        </div>
      </div>
    );
  }

  return (
    <section className="mknb" aria-labelledby={titleId} data-ai-target="marketplace:lawyer-list" data-ai-id="marketplace.nearby" data-ai-type="section">
      <div className="mknb-head">
        <span className="mknb-head__ic" aria-hidden="true">
          <IconMapPin />
        </span>
        <div className="mknb-head__txt">
          <h2 id={titleId}>{t("title")}</h2>
          <p>{t("lead")}</p>
          <p className="mknb-privacy">
            <IconLock aria-hidden="true" />
            <span>{yMapOn || mapWaiting ? ty("privacy") : t("privacy")}</span>
          </p>
        </div>
      </div>

      <div className="mknb-bar" data-ai-target="marketplace:filters">
        {yMapOn || mapWaiting ? null : (
          <div className="mknb-radius">
            <div className="mknb-chips" role="group" aria-label={t("radiusLabel")}>
              {NEARBY_RADII.map((r) => (
                <button key={r} type="button" className="mk-chip mk-chip--sm" aria-pressed={radius === r} onClick={() => pickRadius(r)} aria-describedby={radiusFail ? radiusErrId : undefined} data-ai-id={`marketplace.nearby.radius.${r}`}>
                  {t("radiusKm", { n: r })}
                </button>
              ))}
            </div>
            {radiusFail ? (
              <p className="mknb-err" role="alert" id={radiusErrId}>
                {tm("errors.radius_invalid", { list: radiusFail.allowed.join(", ") })}
              </p>
            ) : null}
          </div>
        )}
        <div className="mknb-svc" data-ai-id="marketplace.nearby.service" data-ai-type="select">
          <Select value={serviceId} onChange={pickService} options={serviceOptions} ariaLabel={t("serviceLabel")} search />
        </div>
        {yCfg || mapWaiting ? <div className="ymk-switch">{viewToggle}</div> : null}
        {spot && !yMapOn && !mapWaiting ? (
          <button type="button" className="btn btn--line btn--sm mknb-relocate" onClick={locate} disabled={geo.busy} aria-busy={geo.busy || undefined} data-ai-id="marketplace.nearby.relocate">
            <IconRefresh aria-hidden="true" />
            {geo.busy ? t("locating") : t("relocate")}
          </button>
        ) : null}
      </div>

      <div className="mknb-body">{body}</div>
    </section>
  );
}
