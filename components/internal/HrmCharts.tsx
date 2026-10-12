import type { ReactNode } from "react";

type Slice = { label: string; value: number; color: string };

// A donut for "parts of a whole" (who is in / out, tasks by state). Colour is
// never the only signal: every slice is also named with its number beside it.
export function HrmDonut({ slices, center, caption }: { slices: Slice[]; center: ReactNode; caption?: string }) {
  const total = slices.reduce((n, s) => n + Math.max(0, s.value), 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="hrm-donut">
      <svg viewBox="0 0 110 110" role="img" aria-label={caption ?? slices.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        <circle cx="55" cy="55" r={R} fill="none" stroke="var(--dk-surface-2,#EEF3FB)" strokeWidth="14" />
        {total > 0
          ? slices.filter((s) => s.value > 0).map((s) => {
              const len = (s.value / total) * C;
              const el = <circle key={s.label} cx="55" cy="55" r={R} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`} strokeDashoffset={-acc} transform="rotate(-90 55 55)" strokeLinecap="butt" />;
              acc += len;
              return el;
            })
          : null}
        <text x="55" y="59" textAnchor="middle" className="hrm-donut__c">{center}</text>
      </svg>
      <ul className="hrm-donut__l">
        {slices.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} aria-hidden />
            <span>{s.label}</span>
            <b>{s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Vertical bars over time or categories, each with its value on top.
export function HrmBars({ data, color = "var(--b500)", format = (n: number) => String(n) }: { data: { label: string; value: number }[]; color?: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hrm-bars" role="img" aria-label={data.map((d) => `${d.label}: ${format(d.value)}`).join(", ")}>
      {data.map((d) => (
        <div key={d.label} className="hrm-bars__c">
          <small>{d.value ? format(d.value) : ""}</small>
          <i style={{ height: `${Math.max(d.value ? 4 : 0, (d.value / max) * 100)}%`, background: color }} />
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
