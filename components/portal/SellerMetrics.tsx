"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SellerStats } from "@/lib/services/backend";
import { IconTrendingUp, IconClock, IconStar, IconEye, IconSun } from "@/components/icons";

// T1-11: "Ko'rsatkichlarim" — response rate, acceptance rate, average answer
// time and rating are always visible to the seller (S-20), plus the
// "Ta'tildaman" (vacation) switch. Vacation is kept in the browser until the
// backend stores availability (reported); while on, the seller sees a banner.
const VAC_KEY = (uid: string) => `lexgo_vacation_${uid}`;
export function readVacation(uid: string): boolean { try { return localStorage.getItem(VAC_KEY(uid)) === "1"; } catch { return false; } }

export default function SellerMetrics({ stats, userId }: { stats: SellerStats; userId: string }) {
  const t = useTranslations("portal.sellerDash.metrics");
  const p = stats.performance as Record<string, unknown>;
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : Number(p[k]) || 0);
  const pct = (v: number) => `${Math.round((v <= 1 ? v * 100 : v))}%`;
  const responseRate = num("response_rate");
  const acceptance = p.acceptance_rate != null ? num("acceptance_rate") : null;
  const avgMin = num("avg_response_minutes");
  const rating = num("rating");
  const [vacation, setVacation] = useState(false);
  useEffect(() => { const v = readVacation(userId); const h = setTimeout(() => setVacation(v), 0); return () => clearTimeout(h); }, [userId]);
  const toggle = () => { const v = !vacation; setVacation(v); try { localStorage.setItem(VAC_KEY(userId), v ? "1" : "0"); } catch { /* ignore */ } };
  const tip = avgMin > 15 ? t("tipSpeed", { now: avgMin, target: 15 }) : responseRate < 0.9 ? t("tipRate") : t("tipGood");

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
        <div className="amet__c"><span className="amet__i"><IconTrendingUp /></span><b>{pct(responseRate)}</b><span className="amet__l">{t("responseRate")}</span></div>
        <div className="amet__c"><span className="amet__i"><IconStar /></span><b>{acceptance == null ? "—" : pct(acceptance)}</b><span className="amet__l">{t("acceptanceRate")}</span></div>
        <div className="amet__c"><span className="amet__i"><IconClock /></span><b>{avgMin ? t("minutes", { n: avgMin }) : "—"}</b><span className="amet__l">{t("avgResponse")}</span></div>
        <div className="amet__c"><span className="amet__i"><IconEye /></span><b>{rating ? rating.toFixed(1) : "—"}</b><span className="amet__l">{t("rating")}</span></div>
      </div>
      <p className="advmuted" style={{ marginTop: 10, fontSize: ".82rem" }}>{tip}</p>
    </div>
  );
}
