"use client";

import { useState } from "react";

// Donut (pie) chart with hover: hovering a slice or legend row shows that
// slice's label + value + share in the center.
const COLORS = ["#1668f0", "#00b4d8", "#7c3aed", "#f59e0b", "#10b981", "#ef4444", "#64748b", "#ec4899"];

export default function DonutChart({
  data: rawData,
  max = 8,
  otherLabel = "…",
  centerLabel,
  format,
}: {
  data: { label: string; value: number }[];
  max?: number;
  otherLabel?: string;
  centerLabel: string;
  format?: (n: number) => string;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const fmtV = format ?? ((n: number) => String(n));
  // Largest slices first; anything past `max` becomes one "other" slice.
  const sorted = [...rawData].sort((a, b) => b.value - a.value);
  const data = sorted.length > max ? [...sorted.slice(0, max - 1), { label: otherLabel, value: sorted.slice(max - 1).reduce((s, d) => s + d.value, 0) }] : sorted;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 80, r = 50, C = 100;
  const arcs = data.map((d, i) => {
    const frac = d.value / total;
    const start = data.slice(0, i).reduce((s, x) => s + x.value, 0) / total;
    const a0 = start * 2 * Math.PI - Math.PI / 2;
    const a1 = (start + frac) * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const pt = (ang: number, rad: number) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
    const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r);
    // Full-circle guard (single slice = 100%).
    const path = frac >= 0.999
      ? `M${C - R} ${C} A${R} ${R} 0 1 1 ${C + R} ${C} A${R} ${R} 0 1 1 ${C - R} ${C} M${C - r} ${C} A${r} ${r} 0 1 0 ${C + r} ${C} A${r} ${r} 0 1 0 ${C - r} ${C} Z`
      : `M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} A${r} ${r} 0 ${large} 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z`;
    return { path, i };
  });
  const active = hi != null ? data[hi] : null;

  return (
    <div className="donut">
      <svg viewBox="0 0 200 200" className="donut__svg" role="img">
        {arcs.map((a) => (
          <path
            key={a.i}
            d={a.path}
            fill={COLORS[a.i % COLORS.length]}
            fillRule="evenodd"
            opacity={hi == null || hi === a.i ? 1 : 0.35}
            onMouseEnter={() => setHi(a.i)}
            onMouseLeave={() => setHi(null)}
            style={{ transition: "opacity .15s" }}
          />
        ))}
        <text x="100" y="97" textAnchor="middle" className="donut__ctxt">{active ? fmtV(active.value) : fmtV(total)}</text>
        <text x="100" y="116" textAnchor="middle" className="donut__csub">{active ? active.label : centerLabel}</text>
      </svg>
      <div className="donut__legend">
        {data.map((d, i) => (
          <button
            key={i}
            type="button"
            className="donut__li"
            onMouseEnter={() => setHi(i)}
            onMouseLeave={() => setHi(null)}
          >
            <span className="donut__dot" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="donut__ll">{d.label}</span>
            <b>{Math.round((d.value / total) * 100)}%</b>
          </button>
        ))}
      </div>
    </div>
  );
}
