"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bike, Bus, Car, Footprints, Navigation, Route as RouteIcon, Square } from "lucide-react";
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
  recalcM,
  serverRoute,
  onLocate,
  onManual,
  onConsentNeeded,
  onLogin,
  onGuide,
  onStart,
  onStop,
  onRateLimited,
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
  recalcM: number;
  serverRoute: boolean;
  onLocate: (then: (p: Spot) => void) => void;
  onManual: (p: Place, then: (p: Spot) => void) => void;
  onConsentNeeded: () => void;
  onLogin: () => void;
  onGuide: (g: Guide | null) => void;
  onStart: () => void;
  onStop: () => void;
  onRateLimited: (sec: number) => void;
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
  const done = guide && guide.sellerUserId === target.sellerUserId && guide.mode === mode ? guide : null;
  const alive = useRef(true);
  const pendingSid = useRef("");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const build = async (from: Spot) => {
    setPhase({ kind: "busy" });
    if (!guide?.sessionId && !pendingSid.current) pendingSid.current = navSessionId();
    const sessionId = guide?.sessionId || pendingSid.current;
    try {
      const g = await requestGuide({ target, template, point: from, mode, recalculate: false, sessionId, locale });
      if (!alive.current) return;
      pendingSid.current = "";
      setPhase({ kind: "idle" });
      onGuide(g);
    } catch (e) {
      if (!alive.current) return;
      const err = mapErrorKey(e);
      setPhase({ kind: "fail", err });
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

  const pickMode = (m: NavMode) => {
    if (busy || locating) return;
    setMode(m);
    setPhase({ kind: "idle" });
  };

  const info = done?.info ?? null;
  const routed = !!info?.available;
  const routeLen = routed && info?.distanceM ? distText(info.distanceM / 1000, "") : null;
  const straightM = done?.dest ? distanceMeters(done.from, done.dest) : null;
  const straight = !routed && straightM !== null ? distText(straightM / 1000, "") : null;
  const eta = done && routed && info?.durationS !== null && info?.durationS !== undefined ? dur(info.durationS) : done && straightM !== null ? dur(etaSeconds(straightM, done.mode, null).s) : "";
  const traffic = routed && info?.trafficS ? dur(info.trafficS) : "";
  const resends = done ? recalcArmed(info) : serverRoute;
  const web = done ? webRouteOf(done.route) : "";
  const phone = isHandheld();
  const appLink = done ? done.navigatorUrl || done.route.appUrl : "";

  return (
    <div className="mnv" role="group" aria-labelledby={`${uid}h`} data-ai-id="marketplace.route" data-ai-type="section">
      <div className="mnv__head">
        <span className="mnv__ic" aria-hidden="true">
          <Navigation strokeWidth={1.75} />
        </span>
        <h4 id={`${uid}h`}>{t("title")}</h4>
      </div>

      <Segmented
        className="mnv__modes"
        value={mode}
        onChange={pickMode}
        label={tr("how")}
        disabled={busy || locating}
        ai="marketplace.route.modes"
        options={modes.map((m) => ({ value: m, label: t(`mode.${m}`), icon: MODE_ICON[m], ai: `marketplace.route.mode.${m}`, title: tr(`mode.${m}`) }))}
      />

      {!signedIn ? (
        <div className="mnv__login">
          <p className="mnv__note mnv__note--warn">{tx("errors.login_required")}</p>
          <Link href="/login" className="btn btn--grad btn--sm" data-ai-id="marketplace.route.login">
            {tx("login.go")}
          </Link>
        </div>
      ) : null}

      {signedIn && !point && asked && geoFailed && !locating ? (
        <div className="mnv__ask">
          <p className="mnv__note">{tr("manualHint")}</p>
          <PlaceSearch url={geocoderUrl} off={!geocoderUrl} mapOn={false} label={tx("manual.searchLabel")} placeholder={tx("manual.searchPlaceholder")} onSelect={(p) => onManual(p, (sp) => void build(sp))} aiId="marketplace.route.place" />
        </div>
      ) : null}

      {phase.kind === "fail" ? (
        <p className="mnv__err" role="alert">
          {tx(`errors.${phase.err}`)}
        </p>
      ) : signedIn && !done && waitS > 0 ? (
        <p className="mnv__err" role="status" data-ai-id="marketplace.route.wait">
          {tx("errors.routing_rate_limit_exceeded")}
        </p>
      ) : null}

      {!signedIn ? null : done ? (
        <div className="mnv__done" role="status" data-ai-id="marketplace.route.done">
          {routeLen ? (
            <p className="mnv__dist mnv__dist--route" data-ai-id="marketplace.route.eta">
              <RouteIcon aria-hidden="true" strokeWidth={1.75} />
              <span>
                <b>{eta}</b>
                {t("routeLen", { d: routeLen.text })}
              </span>
            </p>
          ) : straight ? (
            <p className="mnv__dist" data-ai-id="marketplace.route.straight">
              <RouteIcon aria-hidden="true" strokeWidth={1.75} />
              <span>
                {t("straight", { d: straight.text })}
                {eta ? <em className="mnv__eta">{t("approxTime", { t: eta })}</em> : null}
              </span>
            </p>
          ) : (
            <p className="mnv__note">{t("noDest")}</p>
          )}
          <p className="mnv__fine">
            {done.route.destinationSource === "paid_order_live_location" ? tr("destLive") : tr("destOffice")}
            {routed ? ` · ${t("routeBy")}` : straight ? ` · ${t("straightNote")}` : ""}
            {traffic ? ` · ${t("traffic", { t: traffic })}` : ""}
          </p>
          <div className="mnv__acts">
            {done.dest ? (
              <button
                type="button"
                className={`btn btn--sm ${following ? "btn--line" : "btn--grad"} mnv__start`}
                onClick={following ? onStop : onStart}
                aria-pressed={following}
                data-ai-id="marketplace.route.follow"
              >
                {following ? <Square aria-hidden="true" strokeWidth={1.75} /> : <Navigation aria-hidden="true" strokeWidth={1.75} />}
                {following ? t("stop") : t("start")}
              </button>
            ) : null}
            {phone && appLink ? (
              <button type="button" className="btn btn--line btn--sm" onClick={() => openInNavigator(done)} data-ai-id="marketplace.route.app">
                <Navigation aria-hidden="true" strokeWidth={1.75} />
                {t("navigatorApp")}
              </button>
            ) : null}
            {web ? (
              <a className="btn btn--line btn--sm" href={web} target="_blank" rel="noopener noreferrer" data-ai-id="marketplace.route.web">
                <IconExternal aria-hidden="true" />
                {t("mapsWeb")}
              </a>
            ) : null}
          </div>
          {!following ? (
            <button type="button" className="mnv__hide" onClick={() => onGuide(null)} data-ai-id="marketplace.route.hide">
              {t("hide")}
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" className="btn btn--grad mnv__go" onClick={go} disabled={busy || locating || waitS > 0} aria-busy={busy || locating || undefined} data-ai-id="marketplace.route.build">
          {phase.kind === "fail" ? <IconRefresh aria-hidden="true" /> : <RouteIcon aria-hidden="true" strokeWidth={1.75} />}
          {busy ? tr("building") : locating ? tx("locate.asking") : waitS > 0 ? tr("retryIn", { n: waitS }) : phase.kind === "fail" ? tr("retry") : t("show")}
        </button>
      )}

      <p className="mnv__privacy">
        <IconLock aria-hidden="true" />
        <span>{resends ? tr("privacyFollow", { m: Math.round(info?.recalcM ?? recalcM) }) : tr("privacy")}</span>
      </p>
    </div>
  );
}
