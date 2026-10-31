"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { IconMinus, IconPlus } from "@/components/icons";
import type { LngLat, MapConfig } from "@/lib/services/sellersMap";
import type { Point } from "@/lib/services/mapLocation";
import { openYandexMap, useHtmlTheme, useReducedMotion, type MapHandle } from "./ymaps";
import "./sellersMap.css";

const PICK_ZOOM = 16;

// A Yandex map for choosing one point (a seller's office): a tap or click
// sets the point, the pin shows it. The address search beside it is the
// keyboard way; this map is the pointer way, and it keeps working when the
// address search is down. A script that fails to load calls onFail and the
// caller keeps only the search.
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
  const theme = useHtmlTheme();
  const still = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState(false);
  // The point the map already shows (a tap is where the map already is).
  const shownRef = useRef("");

  const fail = useEffectEvent(() => onFail());
  const click = useEffectEvent((ll: LngLat) => {
    shownRef.current = `${ll[0]},${ll[1]}`;
    onPick({ longitude: ll[0], latitude: ll[1] });
  });
  const startup = useEffectEvent(() => ({
    theme,
    center: point ? ([point.longitude, point.latitude] as LngLat) : config.center,
    zoom: point ? PICK_ZOOM : config.zoom,
  }));

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const init = startup();
    let dead = false;
    let made: MapHandle | null = null;
    openYandexMap(config, box, init).then(
      (h) => {
        if (dead) {
          h.destroy();
          return;
        }
        made = h;
        try {
          h.setTheme(init.theme);
          h.onClick((ll) => click(ll));
        } catch {
          h.destroy();
          made = null;
          fail();
          return;
        }
        liveRef.current = h;
        setReady(true);
      },
      () => {
        if (!dead) fail();
      },
    );
    return () => {
      dead = true;
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

  const pointKey = point ? `${point.longitude},${point.latitude}` : "";
  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live || !point) return;
    const m = live.mark({ kind: "pick", coords: [point.longitude, point.latitude], title: pinLabel, cls: "ymk-pick--office", z: 40 });
    return () => m.remove();
    // pointKey stands for the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pointKey, pinLabel]);

  // A point chosen from the address search moves the map to it.
  useEffect(() => {
    const live = liveRef.current;
    if (!ready || !live || !point || pointKey === shownRef.current) return;
    shownRef.current = pointKey;
    live.moveTo([point.longitude, point.latitude], Math.max(live.zoom(), 14), still ? 0 : 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pointKey]);

  const zoomBy = (d: number) => {
    const live = liveRef.current;
    if (live) live.setZoom(live.zoom() + d, still ? 0 : 250);
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
