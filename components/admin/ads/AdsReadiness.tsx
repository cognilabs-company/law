"use client";

import "./adsReadiness.css";
import { useEffect, useState, type ComponentType, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { asDict, http, isAborted, logApiError } from "@/lib/http";
import { IconShieldCheck, IconStar, IconTarget, IconUsers } from "@/components/icons";

// Whether advertising may be sold yet (TZ market conditions, enterprise
// contract §16): enough registered clients and really rated, verified
// sellers. Until then ads run in admin/test mode only. The figures and the
// verdict are the backend's (GET /admin/marketplace/advertising-readiness).

type Gate = { current: number; required: number; met: boolean };
type Readiness = { ready: boolean; clients: Gate | null; sellers: Gate | null; premiumMin: number | null };

const gateOf = (v: unknown): Gate | null => {
  const d = asDict(v);
  if (!Object.keys(d).length) return null;
  return { current: Number(d.current) || 0, required: Number(d.required) || 0, met: d.met === true };
};

export default function AdsReadiness(): ReactElement | null {
  const t = useTranslations("admin.adsReadiness");
  const [r, setR] = useState<Readiness | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    http("/admin/marketplace/advertising-readiness", { signal: ctl.signal }).then(
      (v) => {
        const d = asDict(v);
        const min = Number(d.premium_minimum_rating);
        setR({ ready: d.ready === true, clients: gateOf(d.clients), sellers: gateOf(d.rated_verified_sellers), premiumMin: Number.isFinite(min) && min > 0 ? min : null });
      },
      (e: unknown) => {
        if (!isAborted(e)) logApiError("ads.readiness", e);
      },
    );
    return () => ctl.abort();
  }, []);
  if (!r) return null;
  const row = (label: string, g: Gate | null, Ico: ComponentType) => {
    if (!g) return null;
    const pct = g.required ? Math.min(100, Math.round((g.current / g.required) * 100)) : 0;
    return (
      <li data-met={g.met ? "" : undefined}>
        <span className="adsr__ico" aria-hidden="true">
          <Ico />
        </span>
        <span className="adsr__l">{label}</span>
        <span className="adsr__num">
          <b>{t("of", { current: g.current, required: g.required })}</b>
          <em>{pct}%</em>
        </span>
        <span className="adsr__bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={g.required} aria-valuenow={g.current}>
          <i style={{ width: `${pct}%` }} />
        </span>
        <small>{g.met ? t("met") : t("missing", { n: Math.max(0, g.required - g.current) })}</small>
      </li>
    );
  };
  return (
    <section className="adsr" data-ready={r.ready ? "" : undefined} aria-label={t("title")} data-ai-target="ads:readiness">
      <header>
        <span className="adsr__hico" aria-hidden="true">
          <IconTarget />
        </span>
        <b>{t("title")}</b>
        <span className="adsr__state">{r.ready ? t("ready") : t("testOnly")}</span>
      </header>
      <p className="adsr__lead">{r.ready ? t("readyText") : t("testOnlyText")}</p>
      <ul>
        {row(t("clients"), r.clients, IconUsers)}
        {row(t("sellers"), r.sellers, IconShieldCheck)}
      </ul>
      {r.premiumMin !== null ? (
        <p className="adsr__note">
          <IconStar />
          {t("premium", { n: r.premiumMin.toFixed(1) })}
        </p>
      ) : null}
    </section>
  );
}
