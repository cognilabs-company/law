"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { BackendLawyer, SellerStats } from "@/lib/services/backend";
import { IconTrendingUp, IconClock, IconStar, IconEye, IconSun, IconCheck } from "@/components/icons";
import StatTile from "@/components/admin/StatTile";

// T1-11: "Ko'rsatkichlarim" — response rate, acceptance rate, average answer
// time and rating are always visible to the seller (S-20), plus the
// "Ta'tildaman" (vacation) switch. Vacation is kept in the browser until the
// backend stores availability (reported); while on, the seller sees a banner.
const VAC_KEY = (uid: string) => `lexgo_vacation_${uid}`;
export function readVacation(uid: string): boolean { try { return localStorage.getItem(VAC_KEY(uid)) === "1"; } catch { return false; } }
export function writeVacation(uid: string, on: boolean) { try { localStorage.setItem(VAC_KEY(uid), on ? "1" : "0"); } catch { /* ignore */ } }

// T3-12 §4: a rating built from fewer than 5 reviews reads as unreliably
// precise (one 5★ review would show as "5.0") — show "Yangi" instead of the
// number until there are enough of them.
const MIN_REVIEWS_FOR_RATING = 5;

export default function SellerMetrics({ stats, userId, profile, demo }: { stats: SellerStats; userId: string; profile?: BackendLawyer; demo?: boolean }) {
  const t = useTranslations("portal.sellerDash.metrics");
  const p = stats.performance as Record<string, unknown>;
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : Number(p[k]) || 0);
  const pct = (v: number) => `${Math.round((v <= 1 ? v * 100 : v))}%`;
  const responseRate = num("response_rate");
  const acceptance = p.acceptance_rate != null ? num("acceptance_rate") : null;
  const avgMin = num("avg_response_minutes");
  const rating = num("rating");
  const isNew = (profile?.reviews ?? MIN_REVIEWS_FOR_RATING) < MIN_REVIEWS_FOR_RATING;
  const [vacation, setVacation] = useState(false);
  useEffect(() => { const v = readVacation(userId); const h = setTimeout(() => setVacation(v), 0); return () => clearTimeout(h); }, [userId]);
  const toggle = () => { const v = !vacation; setVacation(v); try { localStorage.setItem(VAC_KEY(userId), v ? "1" : "0"); } catch { /* ignore */ } };
  const tip = avgMin > 15 ? t("tipSpeed", { now: avgMin, target: 15 }) : responseRate < 0.9 ? t("tipRate") : t("tipGood");

  // T2-04 §3: how close this advocate is to "Super advokat". Only the
  // criteria this dashboard actually has data for are shown — region-wide
  // case-outcome ranking and complaint history aren't exposed to the seller
  // cabinet yet, so they're left out entirely rather than shown stuck at
  // "unknown" forever.
  const superCriteria: { label: string; ok: boolean | null }[] = [
    { label: t("superRating"), ok: rating > 4.5 },
    { label: t("superResponse"), ok: responseRate > 0.9 },
    { label: t("superExperience", { n: profile?.experienceYears ?? 0 }), ok: profile ? profile.experienceYears >= 3 : null },
    { label: t("superCases", { n: profile?.totalCases ?? 0 }), ok: profile ? profile.totalCases >= 10 : null },
  ];

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <label className={`vac${vacation ? " on" : ""}`}>
          <input type="checkbox" checked={vacation} onChange={toggle} />
          <IconSun />{vacation ? t("vacationOn") : t("vacationOff")}
        </label>
      </div>
      {vacation ? <p className="anote anote--err" style={{ marginBottom: 12 }}>{t("vacationNote")}</p> : null}
      <div className="amet">
        <StatTile variant="amet" icon={<IconTrendingUp />} value={pct(responseRate)} label={t("responseRate")} demo={demo} />
        <StatTile variant="amet" icon={<IconStar />} value={acceptance == null ? "—" : pct(acceptance)} label={t("acceptanceRate")} demo={demo} />
        <StatTile variant="amet" icon={<IconClock />} value={avgMin ? t("minutes", { n: avgMin }) : "—"} label={t("avgResponse")} demo={demo} />
        <StatTile variant="amet" icon={<IconEye />} value={isNew ? t("newBadge") : rating ? rating.toFixed(1) : "—"} label={t("rating")} demo={demo} />
      </div>
      {isNew ? <p className="advmuted" style={{ marginTop: 8, fontSize: ".8rem" }}>{t("newBadgeHint")}</p> : null}
      <p className="advmuted" style={{ marginTop: 10, fontSize: ".82rem" }}>{tip}</p>
      <p className="advmuted" style={{ marginTop: 10, fontSize: ".8rem" }}>{t("ratingBreakdown")}</p>

      <div style={{ marginTop: 16 }}>
        <b style={{ fontSize: ".92rem" }}>{t("superTitle")}</b>
        <p className="advmuted" style={{ margin: "4px 0 10px", fontSize: ".8rem" }}>{t("superLead")}</p>
        <ol className="onbp__steps">
          {superCriteria.map((c, i) => (
            <li key={i} className={`onbp__s${c.ok ? " on" : ""}`}>
              <span className="onbp__n">{c.ok ? <IconCheck /> : i + 1}</span>
              <span className="onbp__t">
                <b>{c.label}</b>
                {c.ok == null ? <small>{t("superUnknown")}</small> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
