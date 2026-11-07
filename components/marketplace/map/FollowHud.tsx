"use client";

import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowDownRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Check, CornerUpLeft, CornerUpRight, Flag, LocateFixed, Navigation2, RotateCcw, Undo2, X } from "lucide-react";
import { IconExternal } from "@/components/icons";
import type { RouteManeuver } from "@/lib/services/mapLocation";
import { compassOf, distanceMeters, type FollowState } from "./useFollow";
import { isHandheld, webRouteOf } from "./route";
import { openInNavigator, type Guide } from "./NavigatorBlock";
import { pathLength, snapOnPath } from "./geoMath";
import { arrivedNear, etaSeconds, nextManeuverAt, pathRemainM, routeRemainM, stepMarks, TURN_OF, turnKeyOf, useClockText, useDurationText } from "./navText";
import "./followHud.css";

const MAN_ICON: Record<RouteManeuver, ReactNode> = {
  straight: <ArrowUp strokeWidth={1.75} />,
  slight_left: <ArrowUpLeft strokeWidth={1.75} />,
  left: <CornerUpLeft strokeWidth={1.75} />,
  sharp_left: <ArrowDownLeft strokeWidth={1.75} />,
  slight_right: <ArrowUpRight strokeWidth={1.75} />,
  right: <CornerUpRight strokeWidth={1.75} />,
  sharp_right: <ArrowDownRight strokeWidth={1.75} />,
  uturn: <Undo2 strokeWidth={1.75} />,
  roundabout: <RotateCcw strokeWidth={1.75} />,
  arrive: <Flag strokeWidth={1.75} />,
};

function useMetersText(): (m: number) => string {
  const t = useTranslations("marketplace.nearby");
  const locale = useLocale();
  return (m: number) => {
    if (m < 1000) return t("distanceM", { d: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(10, Math.round(m / 10) * 10)) });
    return t("distanceKm", { d: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m / 1000) });
  };
}

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export default function FollowHud({
  guide,
  state,
  paused,
  floating,
  onRecenter,
  onStop,
  onSize,
}: {
  guide: Guide;
  state: FollowState;
  paused: boolean;
  floating: boolean;
  onRecenter: () => void;
  onStop: () => void;
  onSize?: (h: number) => void;
}) {
  const t = useTranslations("marketMap.follow");
  const tn = useTranslations("marketMap.nav");
  const uid = useId();
  const dock = useRef<HTMLDivElement>(null);
  const fmt = useMetersText();
  const dur = useDurationText();
  const clock = useClockText();
  const now = useNow(30000);
  const routed = !!guide.info?.available && !!guide.path;
  const path = routed ? guide.path : null;
  const len = useMemo(() => (path ? pathLength(path) : 0), [path]);
  const endGap = useMemo(() => (path && guide.dest ? distanceMeters(path[path.length - 1], guide.dest) : 0), [path, guide.dest]);
  const tracked = routeRemainM(path, len, state);
  const point = state.point;
  const fallback = useMemo(() => (path && point && tracked === null ? pathRemainM(path, point) : null), [path, point, tracked]);
  const remain = point ? (path ? (tracked ?? fallback) : state.meters) : null;
  const arrived = arrivedNear(state.meters, path ? remain : null, endGap);
  const eta = remain === null ? null : etaSeconds(remain, guide.mode, routed ? (guide.info ?? null) : null);
  const marks = useMemo(() => (path && guide.info ? stepMarks(path, guide.info.steps) : []), [path, guide.info]);
  const here = path && state.path === path && state.along !== null ? state.along : null;
  const next = useMemo(() => {
    if (!marks.length || !path || !point) return null;
    return nextManeuverAt(marks, here ?? snapOnPath(path, point).along);
  }, [marks, path, point, here]);
  const step = next ? next.step : routed && !marks.length ? (guide.info?.steps[0] ?? null) : null;
  const web = webRouteOf(guide.route);
  const appLink = guide.navigatorUrl || guide.route.appUrl;
  const phone = isHandheld();
  const turn = state.heading === null ? null : turnKeyOf(state.turn);
  const head = arrived
    ? guide.name || t("arrived")
    : !state.point
      ? t("waiting")
      : step
        ? step.maneuver === "arrive"
          ? t("arriveAhead")
          : step.text || (step.maneuver ? t(`turn.${TURN_OF[step.maneuver]}`) : t("waiting"))
        : turn
          ? t(`turn.${turn}`)
          : state.bearing !== null
            ? t(`go.${compassOf(state.bearing)}`)
            : t("waiting");
  const headDist = arrived || remain === null ? "" : next ? fmt(next.distM) : step?.distanceM ? fmt(step.distanceM) : fmt(remain);
  const street = arrived || !step ? null : step.street;
  const big = arrived ? t("arrived") : eta ? (eta.sure ? dur(eta.s) : t("approx", { t: dur(eta.s) })) : t("waiting");
  const sub = !arrived && remain !== null && eta ? t("remainAt", { d: fmt(remain), time: clock(now + eta.s * 1000) }) : arrived ? t("arrivedText") : "";
  const turnQ = next && next.step.maneuver !== "arrive" ? Math.round(next.distM / 50) * 50 : null;
  const totalQ = remain === null ? 0 : turnQ !== null && next ? turnQ + Math.round(Math.max(0, remain - next.distM) / 50) * 50 : Math.round(remain / 50) * 50;
  const said = arrived ? t("arrived") : remain === null ? t("waiting") : `${head}${street ? ` — ${t("onStreet", { street })}` : ""}${turnQ !== null ? ` · ${fmt(turnQ)}` : ""}. ${t("remainAt", { d: fmt(totalQ), time: eta ? clock(now + eta.s * 1000) : "" })}`;
  const size = useEffectEvent((gone: boolean) => {
    onSize?.(gone || !dock.current ? 0 : dock.current.offsetHeight + (floating ? 12 : 0));
  });

  useEffect(() => {
    const el = dock.current;
    if (!el) return;
    size(false);
    if (typeof ResizeObserver === "undefined") return () => size(true);
    const ro = new ResizeObserver(() => size(false));
    ro.observe(el);
    return () => {
      ro.disconnect();
      size(true);
    };
  }, []);

  return (
    <section
      className={`mfh${floating ? " mfh--float" : ""}${arrived ? " is-arrived" : ""}${state.fail ? " is-fail" : ""}`}
      aria-labelledby={`${uid}h`}
      data-ai-id="marketplace.map.follow"
      data-ai-type="section"
    >
      <h3 id={`${uid}h`} className="sr-only">
        {t("label", { name: guide.name })}
      </h3>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>

      <div className="mfh__man" aria-hidden="true">
        <span className={`mfh__tile${arrived ? " is-done" : ""}`}>
          {arrived ? (
            <Check strokeWidth={2} />
          ) : step?.maneuver ? (
            <span key={`${step.index}-${step.maneuver}`} className="mfh__mi" data-man={step.maneuver}>
              {MAN_ICON[step.maneuver]}
            </span>
          ) : (
            <span className="mfh__arrow" style={{ "--turn": `${state.turn}deg` } as CSSProperties} data-wait={state.point ? undefined : ""}>
              <Navigation2 strokeWidth={1.75} />
            </span>
          )}
        </span>
        <span className="mfh__mantxt">
          <b key={head} className="mfh__head">
            {head}
          </b>
          {street ? (
            <span key={street} className="mfh__street">
              {t("onStreet", { street })}
            </span>
          ) : null}
          {headDist ? <span className="mfh__headd">{headDist}</span> : null}
        </span>
      </div>

      {paused && floating ? (
        <button type="button" className="mfh__re" onClick={onRecenter} data-ai-id="marketplace.map.follow.recenter">
          <LocateFixed aria-hidden="true" strokeWidth={1.75} />
          <span>{t("recenter")}</span>
        </button>
      ) : null}

      <div ref={dock} className="mfh__dock">
        <div className="mfh__eta">
          <b className="mfh__big">{big}</b>
          {sub ? <span className="mfh__sub">{sub}</span> : null}
          {arrived ? null : <span className="mfh__to">{t("to", { name: guide.name })}</span>}
        </div>
        <button type="button" className="mfh__stop" onClick={onStop} aria-label={t("stop")} title={t("stop")} data-ai-id="marketplace.map.follow.stop">
          <X aria-hidden="true" strokeWidth={2} />
        </button>
        {state.fail ? (
          <div className="mfh__fail" role="alert">
            <span>{t(`fail.${state.fail}`)}</span>
            <span className="mfh__ext">
              {phone && appLink ? (
                <button type="button" className="btn btn--line btn--sm" onClick={() => openInNavigator(guide)} data-ai-id="marketplace.map.follow.app">
                  {tn("navigatorApp")}
                </button>
              ) : null}
              {web ? (
                <a className="btn btn--line btn--sm" href={web} target="_blank" rel="noopener noreferrer" data-ai-id="marketplace.map.follow.web">
                  <IconExternal aria-hidden="true" />
                  {tn("mapsWeb")}
                </a>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
