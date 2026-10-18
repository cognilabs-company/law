"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { NearbySeller } from "@/lib/services/marketRuntime";
import { precisionMeters, type Spot } from "@/lib/services/marketDiscovery";

// The nearby specialists on a map of their own (2026-10-18, location
// privacy): drawn here, around the client's rounded position, with no map
// tiles, so no outside service ever learns where anyone is. The general
// search only ever has rounded coordinates, and a marker shows that: an
// area as wide as the backend's precision, not a point. A pin is drawn
// only for an exact location, which the backend gives only for the
// client's own paid order. Someone without coordinates stays in the list.
const KM_PER_LAT = 110.57;
const KM_PER_LON = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);
const VIEW = 200;

export default function NearbyMap({ spot, radiusKm, items, base, label }: { spot: Spot; radiusKm: number; items: readonly NearbySeller[]; base: string; label: string }) {
  const t = useTranslations("marketplace.nearby.map");
  const uid = useId();
  const placed = items
    .filter((s) => s.latitude !== null && s.longitude !== null)
    .map((s) => ({
      s,
      dx: ((s.longitude as number) - spot.longitude) * KM_PER_LON(spot.latitude),
      dy: ((s.latitude as number) - spot.latitude) * KM_PER_LAT,
    }));
  const far = placed.reduce((m, p) => Math.max(m, Math.hypot(p.dx, p.dy)), 0);
  // The map spans the search radius, or the farthest one shown if further.
  const span = Math.max(radiusKm, far * 1.1, 1);
  const scale = VIEW / 2 / span;
  const rings = [radiusKm / 2, radiusKm].filter((r) => r > 0 && r <= span);
  const missing = items.length - placed.length;

  return (
    <figure className="mknb-map" aria-labelledby={`${uid}-c`}>
      <svg viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`} role="img" aria-label={label}>
        <defs>
          <radialGradient id={`${uid}-g`}>
            <stop offset="0" stopColor="currentColor" stopOpacity=".1" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle r={VIEW / 2} className="mknb-map__bg" fill={`url(#${uid}-g)`} />
        <path d={`M${-VIEW / 2} 0H${VIEW / 2}M0 ${-VIEW / 2}V${VIEW / 2}`} className="mknb-map__axis" />
        {rings.map((r) => (
          <g key={r}>
            <circle r={r * scale} className="mknb-map__ring" />
            <text x={r * scale * 0.7071 + 2} y={-r * scale * 0.7071 - 2} className="mknb-map__rl">
              {t("km", { n: Math.round(r * 10) / 10 })}
            </text>
          </g>
        ))}
        <text x="0" y={-VIEW / 2 + 9} className="mknb-map__n">
          {t("north")}
        </text>
        <circle r="4.5" className="mknb-map__me" />
        {placed.map(({ s, dx, dy }) => {
          const x = dx * scale;
          const y = -dy * scale;
          const area = Math.max(5, (precisionMeters(s.precision) / 1000) * scale);
          const name = s.name || t("unnamed");
          const dist = s.distanceKm !== null ? t("away", { d: Math.round(s.distanceKm * 10) / 10 }) : "";
          const tip = [name, dist, s.exact ? t("exact") : t("approx")].filter(Boolean).join(" · ");
          const mark = s.exact ? (
            <path d={`M${x} ${y}c-4-5-6-8-6-11a6 6 0 0 1 12 0c0 3-2 6-6 11z`} className="mknb-map__pin" />
          ) : (
            <>
              <circle cx={x} cy={y} r={area} className="mknb-map__area" />
              <circle cx={x} cy={y} r="2.2" className="mknb-map__dot" />
            </>
          );
          return s.sellerUserId ? (
            <Link key={s.sellerUserId} href={`${base}/${encodeURIComponent(s.sellerUserId)}`} className="mknb-map__m" aria-label={tip}>
              <title>{tip}</title>
              {mark}
            </Link>
          ) : (
            <g key={`${name}-${x}-${y}`} className="mknb-map__m" aria-label={tip}>
              <title>{tip}</title>
              {mark}
            </g>
          );
        })}
      </svg>
      <figcaption id={`${uid}-c`} className="mknb-map__legend">
        <span>
          <i className="mknb-map__k mknb-map__k--me" aria-hidden="true" />
          {t("you")}
        </span>
        <span>
          <i className="mknb-map__k mknb-map__k--area" aria-hidden="true" />
          {t("approx")}
        </span>
        <span>
          <i className="mknb-map__k mknb-map__k--pin" aria-hidden="true" />
          {t("exactPaid")}
        </span>
        {missing > 0 ? <small>{t("missing", { n: missing })}</small> : null}
      </figcaption>
    </figure>
  );
}
