"use client";

import { useTranslations } from "next-intl";
import { getCeoDashboard } from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton } from "@/components/portal/DataState";
import LineChart from "@/components/admin/LineChart";
import DonutChart from "@/components/admin/DonutChart";
import { IconCard, IconStar, IconUsers, IconTarget, IconTrendingUp } from "@/components/icons";

const GIFT0 = { giftPurchases: 0, giftActivationRate: 0, recipientConversion: 0, giftToPaidConversion: 0, averageGiftValue: 0, referralRate: 0, giftCac: 0, giftLtv: 0 };
const EMPTY = {
  revenue: 0, revenueDeltaPct: 0, mrr: 0, users: 0, activeUsers: 0, conversionPct: 0, funnel: [], channels: [], revenueTrend: [],
  mau: 0, dau: 0, gmv: 0, arr: 0, arpu: 0, takeRate: 0, cac: 0, ltv: 0, ltvCac: 0, paybackMonths: 0,
  npsClient: 0, npsAdvocate: 0, newClients: 0, newAdvocates: 0, newLawyers: 0, giftKpis: GIFT0,
};
const som = (n: number) => fmtUzs(n);

export default function AdminCeo() {
  const t = useTranslations("admin.ceo");
  const res = useResourceOne(getCeoDashboard, []);
  const d = res.data ?? EMPTY;
  const funnelMax = Math.max(1, ...d.funnel.map((x) => x.value));

  return (
    <div className="ppanel">
      <div className="ppanel__h"><b>{t("title")}</b></div>
      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <div className="castat">
            <div className="castat__c"><span className="castat__i"><IconCard /></span><b>{som(d.revenue)}</b><span>{t("revenue")} · {d.revenueDeltaPct >= 0 ? "+" : ""}{d.revenueDeltaPct}%</span></div>
            <div className="castat__c"><span className="castat__i castat__i--ok"><IconTrendingUp /></span><b>{som(d.mrr)}</b><span>{t("mrr")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconUsers /></span><b>{d.users}</b><span>{t("users")} · {d.activeUsers} {t("active")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconTarget /></span><b>{d.conversionPct}%</b><span>{t("conversion")}</span></div>
          </div>

          <div className="cachart">
            <h3>{t("revenueTrend")}</h3>
            {d.revenueTrend.length ? (
              <LineChart points={d.revenueTrend} format={(v) => som(v)} />
            ) : <p className="advmuted">{t("noData")}</p>}
          </div>

          <div className="pgrid2">
            <div className="cablock">
              <h3>{t("funnel")}</h3>
              {d.funnel.length ? (
                <div className="fnl">
                  {d.funnel.map((x, i) => (
                    <div className="fnl__row" key={i}>
                      <span className="fnl__l">{x.label}</span>
                      <div className="fnl__bar"><span style={{ width: `${(x.value / funnelMax) * 100}%` }}>{x.value}</span></div>
                    </div>
                  ))}
                </div>
              ) : <p className="advmuted">{t("noData")}</p>}
            </div>
            <div className="cablock">
              <h3>{t("channels")}</h3>
              {d.channels.length ? (
                <DonutChart
                  data={d.channels.map((c) => ({ label: c.name, value: c.leads || c.pct }))}
                  centerLabel={t("channels")}
                  format={(v) => String(v)}
                />
              ) : <p className="advmuted">{t("noData")}</p>}
            </div>
          </div>

          {/* Chapter V KPI system */}
          <div className="cachart" style={{ paddingBottom: 0 }}><h3>{t("kpi.title")}</h3></div>
          <div className="castat">
            <div className="castat__c"><span className="castat__i"><IconUsers /></span><b>{d.mau}</b><span>{t("kpi.mau")} · {d.dau} {t("kpi.dau")}</span></div>
            <div className="castat__c"><span className="castat__i castat__i--ok"><IconTrendingUp /></span><b>{som(d.gmv)}</b><span>{t("kpi.gmv")}</span></div>
            <div className="castat__c"><span className="castat__i castat__i--ok"><IconCard /></span><b>{som(d.arr)}</b><span>{t("kpi.arr")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconCard /></span><b>{som(d.arpu)}</b><span>{t("kpi.arpu")}</span></div>
          </div>
          <div className="castat">
            <div className="castat__c"><span className="castat__i"><IconTarget /></span><b>{d.takeRate}%</b><span>{t("kpi.takeRate")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconCard /></span><b>{som(d.cac)}</b><span>{t("kpi.cac")}</span></div>
            <div className="castat__c"><span className="castat__i castat__i--ok"><IconTrendingUp /></span><b>{som(d.ltv)}</b><span>{t("kpi.ltv")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconTarget /></span><b>{d.ltvCac ? `${d.ltvCac}×` : "—"}</b><span>{t("kpi.ltvCac")} · {t("kpi.payback", { n: d.paybackMonths })}</span></div>
          </div>
          <div className="castat">
            <div className="castat__c"><span className="castat__i"><IconStar /></span><b>{d.npsClient}</b><span>{t("kpi.npsClient")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconStar /></span><b>{d.npsAdvocate}</b><span>{t("kpi.npsAdvocate")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconUsers /></span><b>{d.newClients}</b><span>{t("kpi.newClients")}</span></div>
            <div className="castat__c"><span className="castat__i"><IconUsers /></span><b>{d.newAdvocates + d.newLawyers}</b><span>{t("kpi.newSellers")}</span></div>
          </div>

          <div className="cablock">
            <h3>{t("kpi.giftTitle")}</h3>
            <div className="castat">
              <div className="castat__c"><span className="castat__i"><IconCard /></span><b>{d.giftKpis.giftPurchases}</b><span>{t("kpi.giftPurchases")}</span></div>
              <div className="castat__c"><span className="castat__i"><IconTarget /></span><b>{d.giftKpis.giftActivationRate}%</b><span>{t("kpi.giftActivation")}</span></div>
              <div className="castat__c"><span className="castat__i castat__i--ok"><IconTrendingUp /></span><b>{d.giftKpis.giftToPaidConversion}%</b><span>{t("kpi.giftToPaid")}</span></div>
              <div className="castat__c"><span className="castat__i"><IconCard /></span><b>{som(d.giftKpis.averageGiftValue)}</b><span>{t("kpi.avgGift")}</span></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
