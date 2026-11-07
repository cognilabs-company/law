"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bike, Bus, Car, Footprints, MapPinned, Navigation, Route as RouteIcon, Square, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { IconExternal, IconLock, IconRefresh } from "@/components/icons";
import { http, isRateLimited, retryAfterSec } from "@/lib/http";
import type { Spot } from "@/lib/services/marketDiscovery";
import { mapErrorKey, navigationBody, navigationPath, navSessionId, normNavRoute, recalcArmed, safeRouteUrl, type MapErrorKey, type NavRoute, type Place, type RouteInfo } from "@/lib/services/mapLocation";
import { lngLatOf, mapLocaleOf, NAV_MODES, type MapLocale, type NavMode } from "@/lib/services/sellersMap";
import { Segmented } from "./MapPanel";
import PlaceSearch from "./PlaceSearch";
import { isHandheld, openRoute, webRouteOf } from "./route";
import { useDistanceText } from "./SellerRow";
import { distanceMeters } from "./useFollow";
import { etaSeconds, useDurationText } from "./navText";
import "./sellerDetail.css";

export type RouteTarget = { sellerUserId: string; name: string; endpoint: string; modes: NavMode[]; paidOrderId?: string };
export type Guide = {
  sellerUserId: string;
  name: string;
  mode: NavMode;
  route: NavRoute;
  from: Spot;
  dest: Spot | null;
  navigatorUrl: string;
  target: RouteTarget;
  path: Spot[] | null;
  info: RouteInfo | null;
  sessionId: string;
};

const MODE_ICON: Record<NavMode, ReactNode> = {
  driving: <Car aria-hidden="true" strokeWidth={1.75} />,
  walking: <Footprints aria-hidden="true" strokeWidth={1.75} />,
  transit: <Bus aria-hidden="true" strokeWidth={1.75} />,
  bicycle: <Bike aria-hidden="true" strokeWidth={1.75} />,
};

const dictOf = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export async function requestGuide(q: { target: RouteTarget; template: string; point: Spot; mode: NavMode; recalculate: boolean; sessionId: string; locale: MapLocale; signal?: AbortSignal }): Promise<Guide> {
  const body = navigationBody({ point: q.point, mode: q.mode, paidOrderId: q.target.paidOrderId, recalculate: q.recalculate, sessionId: q.sessionId, locale: q.locale });
  const raw = await http(navigationPath(q.target.sellerUserId, q.target.endpoint, q.template), { method: "POST", body: JSON.stringify(body), signal: q.signal });
  const d = dictOf(raw);
  const dst = dictOf(d.destination);
  const ll = lngLatOf({ latitude: dst.latitude, longitude: dst.longitude }) ?? lngLatOf(dst.coordinates);
  const route = normNavRoute(raw);
  const info = route.info;
  return {
    sellerUserId: q.target.sellerUserId,
    name: q.target.name,
    mode: q.mode,
    route,
    from: q.point,
    dest: ll ? { latitude: ll[1], longitude: ll[0] } : null,
    navigatorUrl: safeRouteUrl(dictOf(d.app_urls).yandex_navigator, true),
    target: q.target,
    path: info?.available ? info.path.map(([longitude, latitude]) => ({ latitude, longitude })) : null,
    info,
    sessionId: q.sessionId,
  };
}

export function openInNavigator(g: Guide): void {
  openRoute({ ...g.route, appUrl: g.navigatorUrl || g.route.appUrl }, null);
}

type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "fail"; err: MapErrorKey };

// How to get there. One choice (the way of travel), one main action, and the
// answer in one line. A route can only be promised when the backend drew it:
// without one the block says so and sends the client to Yandex, which can.
export default function NavigatorBlock({
  target,
  point,
  signedIn,
  locating,
  geoFailed,
  geocoderUrl,
  template,
  guide,
  following,
  waitS,
  waitProvider,
  recalcM,
  serverRoute,
  autoBuild,
  onLocate,
  onManual,
  onPickOnMap,
  onConsentNeeded,
  onLogin,
  onGuide,
  onStart,
  onStop,
  onRateLimited,
  onProviderLimited,
}: {
  target: RouteTarget;
  point: Spot | null;
  signedIn: boolean;
  locating: boolean;
  geoFailed: boolean;
  geocoderUrl: string;
  template: string;
  guide: Guide | null;
  following: boolean;
  waitS: number;
  waitProvider: boolean;
  recalcM: number;
  serverRoute: boolean;
  // The client just marked a starting point on the map for this route.
  autoBuild?: boolean;
  onLocate: (then: (p: Spot) => void) => void;
  onManual: (p: Place, then: (p: Spot) => void) => void;
  onPickOnMap?: () => void;
  onConsentNeeded: () => void;
  onLogin: () => void;
  onGuide: (g: Guide | null) => void;
  onStart: () => void;
  onStop: () => void;
  onRateLimited: (sec: number) => void;
  onProviderLimited: (info: RouteInfo | null) => boolean;
}) {
  const t = useTranslations("marketMap.nav");
  const tr = useTranslations("marketMap.route");
  const tx = useTranslations("marketMap");
  const uid = useId();
  const distText = useDistanceText();
  const dur = useDurationText();
  const locale = mapLocaleOf(useLocale());
  const modes = target.modes.length ? target.modes : [...NAV_MODES];
  const [mode, setMode] = useState<NavMode>(guide && modes.includes(guide.mode) ? guide.mode : modes[0]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [asked, setAsked] = useState(false);
  const busy = phase.kind === "busy";
  const done = guide && guide.sellerUserId === target.sellerUserId ? guide : null;
  const alive = useRef(true);
  const pendingSid = useRef("");
  const seq = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const build = async (from: Spot, how: NavMode = mode) => {
    const my = ++seq.current;
    setPhase({ kind: "busy" });
    if (!guide?.sessionId && !pendingSid.current) pendingSid.current = navSessionId();
    const sessionId = guide?.sessionId || pendingSid.current;
    try {
      const g = await requestGuide({ target, template, point: from, mode: how, recalculate: false, sessionId, locale });
      if (!alive.current || my !== seq.current) return;
      pendingSid.current = "";
      setPhase({ kind: "idle" });
      onProviderLimited(g.info);
      onGuide(g);
    } catch (e) {
      if (!alive.current || my !== seq.current) return;
      const err = mapErrorKey(e);
      setPhase({ kind: "fail", err });
      // The line on the map still belongs to the old way of travel.
      if (guide) setMode(guide.mode);
      if (isRateLimited(e)) onRateLimited(retryAfterSec(e, 60));
      if (err === "client_location_consent_required") onConsentNeeded();
      if (err === "login_required") onLogin();
    }
  };

  const go = () => {
    if (busy || waitS > 0) return;
    if (!signedIn) {
      onLogin();
      return;
    }
    if (!point) {
      setAsked(true);
      onLocate((p) => void build(p));
      return;
    }
    void build(point);
  };

  const started = useRef(false);
  useEffect(() => {
    if (!autoBuild || !point || started.current) return;
    started.current = true;
    void build(point);
    // Once, as the block comes back with the point the client just marked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBuild, point]);

  // Changing how you travel redraws the route you are already looking at.
  const pickMode = (m: NavMode) => {
    if (busy || locating) return;
    setMode(m);
    setPhase({ kind: "idle" });
    if (done && point && waitS === 0 && m !== done.mode) void build(point, m);
  };

  const info = done?.info ?? null;
  const routed = !!info?.available;
  const routeLen = routed && info?.distanceM ? distText(info.distanceM / 1000, "") : null;
  const straightM = done?.dest ? distanceMeters(done.from, done.dest) : null;
  const straight = !routed && straightM !== null ? distText(straightM / 1000, "") : null;
  const eta = done && routed && info?.durationS !== null && info?.durationS !== undefined ? dur(info.durationS) : done && straightM !== null ? dur(etaSeconds(straightM, done.mode, null).s) : "";
  const traffic = routed && info?.trafficS && info.trafficS !== info.durationS ? dur(info.trafficS) : "";
  const resends = done ? recalcArmed(info) : serverRoute;
  const web = done ? webRouteOf(done.route) : "";
  const phone = isHandheld();
  const appLink = done ? done.navigatorUrl || done.route.appUrl : "";
  // No road line to follow: Yandex can draw one, so that is the main way on.
  const yandexFirst = !!done && !routed && !!web;

  const startBtn = done?.dest ? (
    <button type="button" className={`btn btn--sm ${following || yandexFirst ? "btn--line" : "btn--grad"} mnv__start`} onClick={following ? onStop : onStart} aria-pressed={following} data-sheet-fit={yandexFirst ? undefined : ""} data-ai-id="marketplace.route.follow">
      {following ? <Square aria-hidden="true" strokeWidth={1.75} /> : <Navigation aria-hidden="true" strokeWidth={1.75} />}
      {following ? t("stop") : t("start")}
    </button>
  ) : null;
  const webBtn = web ? (
    <a className={`btn btn--sm ${yandexFirst ? "btn--grad" : "btn--line"}`} href={web} target="_blank" rel="noopener noreferrer" data-sheet-fit={yandexFirst ? "" : undefined} data-ai-id="marketplace.route.web">
      <IconExternal aria-hidden="true" />
      {t("mapsWeb")}
    </a>
  ) : null;

  return (
    <div className="mnv" role="group" aria-labelledby={`${uid}h`} data-ai-id="marketplace.route" data-ai-type="section">
      <h4 id={`${uid}h`} className="mnv__title">
        {t("title")}
      </h4>

      <Segmented
        className="mnv__modes"
        value={mode}
        onChange={pickMode}
        label={tr("how")}
        disabled={busy || locating || following}
        ai="marketplace.route.modes"
        options={modes.map((m) => ({ value: m, label: t(`mode.${m}`), icon: MODE_ICON[m], ai: `marketplace.route.mode.${m}`, title: tr(`mode.${m}`) }))}
      />

      {!signedIn ? (
        <div className="mnv__login">
          <p className="mnv__note">{tx("errors.login_required")}</p>
          <Link href="/login" className="btn btn--grad btn--sm" data-ai-id="marketplace.route.login">
            {tx("login.go")}
          </Link>
        </div>
      ) : null}

      {signedIn && !point && asked && geoFailed && !locating ? (
        <div className="mnv__ask">
          <p className="mnv__note">{tr("manualHint")}</p>
          {onPickOnMap ? (
            <button type="button" className="btn btn--line btn--sm" onClick={onPickOnMap} data-ai-id="marketplace.route.pick-map">
              <MapPinned aria-hidden="true" strokeWidth={1.75} />
              {tx("denied.pickMap")}
            </button>
          ) : null}
          <PlaceSearch url={geocoderUrl} off={!geocoderUrl} mapOn={!!onPickOnMap} label={tx("manual.searchLabel")} placeholder={tx("manual.searchPlaceholder")} onSelect={(p) => onManual(p, (sp) => void build(sp))} aiId="marketplace.route.place" />
        </div>
      ) : null}

      {phase.kind === "fail" ? (
        <p className="mnv__err" role="alert">
          {tx(`errors.${phase.err}`)}
        </p>
      ) : signedIn && waitS > 0 ? (
        <p className="mnv__err" role="status" data-ai-id="marketplace.route.wait">
          {waitProvider ? tx("errors.routing_provider_rate_limit", { n: waitS }) : tx("errors.routing_rate_limit_exceeded")}
        </p>
      ) : null}

      {!signedIn ? null : done ? (
        <div className="mnv__done" role="status" aria-busy={busy || undefined} data-ai-id="marketplace.route.done">
          <div className="mnv__sum">
            {routeLen ? (
              <p className="mnv__dist mnv__dist--route" data-ai-id="marketplace.route.eta">
                <b>{eta}</b>
                <span>{t("routeLen", { d: routeLen.text })}</span>
              </p>
            ) : straight ? (
              <p className="mnv__dist" data-ai-id="marketplace.route.straight">
                <span>{t("straight", { d: straight.text })}</span>
                {eta ? <em className="mnv__eta">{t("approxTime", { t: eta })}</em> : null}
              </p>
            ) : (
              <p className="mnv__note">{t("noDest")}</p>
            )}
            {!following ? (
              <button type="button" className="mnv__x" onClick={() => onGuide(null)} aria-label={t("hide")} title={t("hide")} data-ai-id="marketplace.route.hide">
                <X aria-hidden="true" strokeWidth={2} />
              </button>
            ) : null}
          </div>
          {traffic ? <p className="mnv__fine">{t("traffic", { t: traffic })}</p> : null}
          {!routed && straight ? <p className="mnv__fine">{t("noRoad")}</p> : null}
          {done.route.destinationSource === "paid_order_live_location" ? <p className="mnv__fine">{tr("destLive")}</p> : null}
          <div className="mnv__acts">
            {yandexFirst ? webBtn : startBtn}
            {phone && appLink ? (
              <button type="button" className="btn btn--line btn--sm" onClick={() => openInNavigator(done)} data-ai-id="marketplace.route.app">
                <Navigation aria-hidden="true" strokeWidth={1.75} />
                {t("navigatorApp")}
              </button>
            ) : null}
            {yandexFirst ? startBtn : webBtn}
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--grad mnv__go" onClick={go} disabled={busy || locating || waitS > 0} aria-busy={busy || locating || undefined} data-sheet-fit="" data-ai-id="marketplace.route.build">
          {phase.kind === "fail" ? <IconRefresh aria-hidden="true" /> : <RouteIcon aria-hidden="true" strokeWidth={1.75} />}
          {busy ? tr("building") : locating ? tx("locate.asking") : waitS > 0 ? tr("retryIn", { n: waitS }) : phase.kind === "fail" ? tr("retry") : t("show")}
        </button>
      )}

      <details className="mnv__privacy">
        <summary>
          <IconLock aria-hidden="true" />
          {tr("privacyShort")}
        </summary>
        <p>{resends ? tr("privacyFollow", { m: Math.round(info?.recalcM ?? recalcM) }) : tr("privacy")}</p>
      </details>
    </div>
  );
}
