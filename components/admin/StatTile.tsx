"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

// A dashboard stat card. With `onClick` it is a real <button> (keyboard
// reachable, hover/focus styles via .stile) that opens the drill-down modal.
// `variant` picks the existing visual base so tiles keep the page's look:
// "ktile" (admin overview KPI panel), "castat" (CEO/analytics cards),
// "amet" (seller portal metrics). `demo` shows the "Demo ma'lumot" badge;
// `hint` is the small "(filter does not apply)" note.
export type StatTone = "ok" | "bad";
export default function StatTile({
  label,
  value,
  sub,
  delta,
  icon,
  tone,
  variant = "castat",
  demo,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  icon?: ReactNode;
  tone?: StatTone;
  variant?: "ktile" | "castat" | "amet";
  demo?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  const t = useTranslations("admin.dash");
  const base = variant === "ktile" ? "ktile" : variant === "amet" ? "amet__c" : "castat__c";
  const cls = `${base} stile${onClick ? " stile--btn" : ""}${demo ? " stile--demo" : ""}`;
  const badge = demo ? <em className="stile__demo">{t("demo.badge")}</em> : null;
  const hintEl = hint ? <small className="stile__hint">{hint}</small> : null;

  let body: ReactNode;
  if (variant === "ktile") {
    body = (
      <>
        <span className="ktile__l">{label}</span>
        <b className="ktile__v">{value}</b>
        {typeof delta === "number" && delta !== 0 ? (
          <span className={`ktile__d ktile__d--${delta > 0 ? "up" : "down"}`}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        ) : null}
        {sub ? <span className="ktile__l">{sub}</span> : null}
        {hintEl}
        {badge}
      </>
    );
  } else if (variant === "amet") {
    body = (
      <>
        {icon ? <span className="amet__i">{icon}</span> : null}
        <b>{value}</b>
        <span className="amet__l">{sub ? `${label} · ${sub}` : label}</span>
        {hintEl}
        {badge}
      </>
    );
  } else {
    body = (
      <>
        {icon ? <span className={`castat__i${tone ? ` castat__i--${tone}` : ""}`}>{icon}</span> : null}
        <b>{value}</b>
        <span>{sub ? `${label} · ${sub}` : label}</span>
        {hintEl}
        {badge}
      </>
    );
  }

  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={`${label}: ${value}. ${t("drill.open")}`}>
      {body}
    </button>
  );
}
