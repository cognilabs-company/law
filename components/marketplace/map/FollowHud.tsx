"use client";

import { useEffect, useEffectEvent, useId, useRef, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, LocateFixed, Navigation2, Square } from "lucide-react";
import { IconExternal } from "@/components/icons";
import { ARRIVED_M, compassOf, useRoll, type FollowState } from "./useFollow";
import { isHandheld, webRouteOf } from "./route";
import { openInNavigator, type Guide } from "./NavigatorBlock";
import "./followHud.css";

function useMetersText(): (m: number) => string {
  const t = useTranslations("marketplace.nearby");
  const locale = useLocale();
  return (m: number) => {
    if (m < 1000) return t("distanceM", { d: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(10, Math.round(m / 10) * 10)) });
    return t("distanceKm", { d: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m / 1000) });
  };
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
  const ref = useRef<HTMLElement>(null);
  const meters = state.meters;
  const arrived = meters !== null && meters < ARRIVED_M;
  const rolled = useRoll(meters ?? 0, 700);
  const fmt = useMetersText();
  const web = webRouteOf(guide.route);
  const appLink = guide.navigatorUrl || guide.route.appUrl;
  const phone = isHandheld();
  const step = meters === null ? null : meters < 1000 ? Math.round(meters / 50) * 50 : Math.round(meters / 250) * 250;
  const dir = state.bearing === null ? "" : t(`dir.${compassOf(state.bearing)}`);
  const said = arrived ? t("arrived") : step === null ? t("waiting") : t("left", { d: fmt(step), dir });
  const size = useEffectEvent((gone: boolean) => {
    onSize?.(gone || !ref.current ? 0 : ref.current.offsetHeight);
  });

  useEffect(() => {
    const el = ref.current;
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
      ref={ref}
      className={`mfh${floating ? " mfh--float" : ""}${arrived ? " is-arrived" : ""}${state.fail ? " is-fail" : ""}`}
      aria-labelledby={`${uid}h`}
      data-ai-id="marketplace.map.follow"
      data-ai-type="section"
    >
      <div className="mfh__dial" aria-hidden="true">
        {arrived ? (
          <span className="mfh__done">
            <Check strokeWidth={1.75} />
          </span>
        ) : (
          <span className="mfh__arrow" style={{ "--turn": `${state.turn}deg` } as CSSProperties} data-wait={state.point ? undefined : ""}>
            <Navigation2 strokeWidth={1.75} />
          </span>
        )}
        {state.heading === null && !arrived ? <i className="mfh__north">{t("north")}</i> : null}
      </div>
      <div className="mfh__txt">
        <h3 id={`${uid}h`} className="sr-only">
          {t("label", { name: guide.name })}
        </h3>
        <b className="mfh__big" aria-hidden="true">
          {arrived ? t("arrived") : meters === null ? t("waiting") : fmt(rolled)}
        </b>
        <span className="mfh__to">{arrived ? t("arrivedText") : t("to", { name: guide.name })}</span>
        {!arrived && meters !== null ? <span className="mfh__hint">{state.heading === null ? t("northUp") : t("straight")}</span> : null}
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
      </div>
      <div className="mfh__acts">
        {paused && floating ? (
          <button type="button" className="mfh__btn" onClick={onRecenter} data-ai-id="marketplace.map.follow.recenter">
            <LocateFixed aria-hidden="true" strokeWidth={1.75} />
            <span>{t("recenter")}</span>
          </button>
        ) : null}
        <button type="button" className="mfh__btn mfh__btn--stop" onClick={onStop} data-ai-id="marketplace.map.follow.stop">
          <Square aria-hidden="true" strokeWidth={1.75} />
          <span>{t("stop")}</span>
        </button>
      </div>
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
    </section>
  );
}
