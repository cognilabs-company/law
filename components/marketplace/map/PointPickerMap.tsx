"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { IconMinus, IconPlus } from "@/components/icons";
import { clampZoom, lngLatOf, yandexLang, type MapConfig } from "@/lib/services/sellersMap";
import type { Point } from "@/lib/services/mapLocation";
import { loadYmaps3, useHtmlTheme, useReducedMotion, type YEntity, type YMapInstance, type Ymaps3 } from "./ymaps";
import "./sellersMap.css";

type Live = { y: Ymaps3; map: YMapInstance; scheme: YEntity };

const PICK_ZOOM = 16;

// A Yandex map for choosing one point (a seller's office): a tap or click
// sets the point, the pin shows it. The address search beside it is the
// keyboard way; this map is the pointer way. A script that fails to load
// calls onFail and the caller keeps only the search.
export default function PointPickerMap({
  config,
  point,
  onPick,
  onFail,
  label,
  hint,
  pinLabel,
  zoomInLabel,
  zoomOutLabel,
}: {
  config: MapConfig;
  point: Point | null;
  onPick: (p: Point) => void;
  onFail: () => void;
  label: string;
  hint: string;
  pinLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
}) {
  const locale = useLocale();
  const theme = useHtmlTheme();
  const still = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<Live | null>(null);
  const [ready, setReady] = useState(false);
  // The point the map already shows (a tap is where the map already is).
  const shownRef = useRef("");

  const fail = useEffectEvent(() => onFail());
  const click = useEffectEvent((ev: unknown) => {
    const ll = lngLatOf((ev as { coordinates?: unknown } | null)?.coordinates);
    if (!ll) return;
    shownRef.current = `${ll[0]},${ll[1]}`;
    onPick({ longitude: ll[0], latitude: ll[1] });
  });
  const startup = useEffectEvent(() => ({
    theme,
    center: point ? ([point.longitude, point.latitude] as [number, number]) : config.center,
    zoom: point ? PICK_ZOOM : config.zoom,
    lang: yandexLang(locale),
  }));

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const init = startup();
    let dead = false;
    let made: YMapInstance | null = null;
    loadYmaps3(config.apiKey, init.lang).then(
      (y) => {
        if (dead) return;
        try {
          const map = new y.YMap(box, { location: { center: init.center, zoom: init.zoom }, theme: init.theme });
          made = map;
          const scheme = new y.YMapDefaultSchemeLayer({ theme: init.theme });
          map.addChild(scheme);
          map.addChild(new y.YMapDefaultFeaturesLayer({}));
          map.addChild(new y.YMapListener({ layer: "any", onClick: (_o: unknown, ev: unknown) => click(ev) }));
          liveRef.current = { y, map, scheme };
        } catch {
          fail();
          return;
        }
        setReady(true);
      },
      () => {
        if (!dead) fail();
      },
    );
    return () => {
      dead = true;
      liveRef.current = null;
      try {
        made?.destroy();
      } catch {}
    };
  }, [config.apiKey]);

  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live) return;
    try {
      live.map.update({ theme });
      live.scheme.update?.({ theme });
    } catch {}
  }, [ready, theme]);

  const pointKey = point ? `${point.longitude},${point.latitude}` : "";
  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live || !point) return;
    const el = document.createElement("span");
    el.className = "ymk-pick ymk-pick--office";
    el.title = pinLabel;
    const m = new live.y.YMapMarker({ coordinates: [point.longitude, point.latitude], zIndex: 40 }, el);
    live.map.addChild(m);
    return () => {
      try {
        live.map.removeChild(m);
      } catch {}
    };
    // pointKey stands for the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pointKey, pinLabel]);

  // A point chosen from the address search moves the map to it.
  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live || !point || pointKey === shownRef.current) return;
    shownRef.current = pointKey;
    const z = Math.max(clampZoom(Number(live.map.zoom ?? 0)), 14);
    live.map.update({ location: { center: [point.longitude, point.latitude], zoom: z, duration: still ? 0 : 400 } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pointKey]);

  const zoomBy = (d: number) => {
    const live = liveRef.current;
    if (!live) return;
    const center = lngLatOf(live.map.center) ?? config.center;
    live.map.update({ location: { center, zoom: clampZoom(Number(live.map.zoom ?? config.zoom) + d), duration: still ? 0 : 250 } });
  };

  return (
    <div className={`ymk-stage ymk-stage--picker ymk-stage--pick${ready ? "" : " ymk-stage--wait"}`}>
      <div ref={boxRef} className="ymk-canvas" role="region" tabIndex={-1} aria-label={label} />
      {ready ? (
        <p className="ymk-pickhint" aria-hidden="true">
          {hint}
        </p>
      ) : (
        <div className="ymk-veil" aria-hidden="true">
          <span className="ymk-spin" />
        </div>
      )}
      <div className="ymk-ctl">
        <button type="button" onClick={() => zoomBy(1)} disabled={!ready} aria-label={zoomInLabel} title={zoomInLabel}>
          <IconPlus aria-hidden="true" />
        </button>
        <button type="button" onClick={() => zoomBy(-1)} disabled={!ready} aria-label={zoomOutLabel} title={zoomOutLabel}>
          <IconMinus aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
