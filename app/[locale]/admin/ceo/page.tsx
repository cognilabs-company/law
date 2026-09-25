"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getCeoDashboardFull, isCeoEmpty, trimSeries, isFiltered, todayIso, type CeoDashboardFull } from "@/lib/services/dash";
import { demoCeo } from "@/lib/demoStats";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzs, fmtUzsShort } from "@/lib/money";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton } from "@/components/portal/DataState";
import LineChart from "@/components/admin/LineChart";
import DonutChart from "@/components/admin/DonutChart";
import StatTile from "@/components/admin/StatTile";
import StatDrillModal, { type Drill, type DrillRow } from "@/components/admin/StatDrillModal";
import DashFilterBar, { useDashFilter } from "@/components/admin/DashFilterBar";
import { IconCard, IconStar, IconUsers, IconTarget, IconTrendingUp, IconInfo } from "@/components/icons";

const GIFT0 = { giftPurchases: 0, giftActivationRate: 0, recipientConversion: 0, giftToPaidConversion: 0, averageGiftValue: 0, referralRate: 0, giftCac: 0, giftLtv: 0 };
const EMPTY: CeoDashboardFull = {
  fetchedAt: "",
  revenue: 0, revenueDeltaPct: 0, mrr: 0, users: 0, activeUsers: 0, conversionPct: 0, funnel: [], channels: [], revenueTrend: [],
  mau: 0, dau: 0, gmv: 0, arr: 0, arpu: 0, takeRate: 0, cac: 0, ltv: 0, ltvCac: 0, paybackMonths: 0,
  cacClient: 0, cacAdvocate: 0, paidPayments: 0,
  npsClient: 0, npsAdvocate: 0, newClients: 0, newAdvocates: 0, newLawyers: 0, giftKpis: GIFT0,
};
const som = (n: number) => fmtUzs(n);
const pct = (n: number) => `${n}%`;

// CEO dashboard: every KPI tile opens a drill-down; region/date filter is
// sent to the backend and applied to the trend in the browser; demo numbers
// are shown (and labelled) while the platform has no real activity.
export default function AdminCeo() {
  const t = useTranslations("admin.ceo");
  const locale = useLocale();
  const td = useTranslations("admin.dash");
  const tc = useTranslations("admin.overview.crm");
  const { filter, setFilter, demoForced, setDemoForced } = useDashFilter();
  const fkey = `${filter.region}|${filter.from}|${filter.to}`;
  const res = useResourceOne(() => getCeoDashboardFull(filter), [fkey]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const loaded = res.status !== "loading";
  const demo = demoForced || (loaded && (!res.data || isCeoEmpty(res.data)));
  const d = useMemo(() => (demo ? demoCeo(todayIso()) : res.data ?? EMPTY), [demo, res.data]);
  const trend = trimSeries(d.revenueTrend, filter);
  const funnelMax = Math.max(1, ...d.funnel.map((x) => x.value));
  // Funnel stages (leads / orders / paid) and channel sources arrive as slugs.
  const stage = (k: string) => (t.has(`stage.${k}`) ? t(`stage.${k}`) : humanizeSlug(k));
  const source = (k: string) => (k ? (t.has(`source.${k}`) ? t(`source.${k}`) : humanizeSlug(k)) : "—");
  const units = { mln: td("units.mln"), mlrd: td("units.mlrd") };
  const short = (n: number) => `${fmtUzsShort(n, units, locale)} ${tc("som")}`;
  const regionHint = filter.region ? td("hint.regionNa") : undefined;
  const dateHint = filter.from || filter.to ? td("hint.dateNa") : undefined;

  const open = (drl: Omit<Drill, "demo">) => setDrill({ ...drl, demo });
  const kv = (title: string, rows: DrillRow[]): Drill["sections"][number] => ({ kind: "kv", title, rows });
  const channelBars = (): Drill["sections"][number] => ({ kind: "bars", title: t("channels"), rows: d.channels.map((c) => ({ label: source(c.name), value: som(c.revenue), n: c.revenue, sub: `${c.leads} · ${c.payments} · ${c.pct}%` })) });
  const funnelBars = (): Drill["sections"][number] => ({ kind: "bars", title: t("funnel"), rows: d.funnel.map((x) => ({ label: stage(x.label), value: String(x.value), n: x.value })) });
  const unitEcon = () => kv(t("kpi.title"), [
    { label: t("kpi.gmv"), value: som(d.gmv) }, { label: t("kpi.arr"), value: som(d.arr) }, { label: t("kpi.arpu"), value: som(d.arpu) }, { label: t("kpi.takeRate"), value: pct(d.takeRate) },
    { label: t("kpi.cac"), value: som(d.cac) }, { label: t("kpi.ltv"), value: som(d.ltv) }, { label: t("kpi.ltvCac"), value: d.ltvCac ? `${d.ltvCac}×` : "—" }, { label: t("kpi.payback", { n: d.paybackMonths }), value: "" },
  ]);
  const drillRevenue = () => open({ title: t("revenue"), value: som(d.revenue), sub: `${d.revenueDeltaPct >= 0 ? "▲" : "▼"} ${Math.abs(d.revenueDeltaPct)}%`, sections: [{ kind: "series", title: t("revenueTrend"), points: trend, format: som }, channelBars(), unitEcon()] });
  const drillMrr = () => open({ title: t("mrr"), value: som(d.mrr), note: td("drill.mrrNote"), sections: [unitEcon(), kv(td("drill.payments"), [{ label: t("kpi.paidPayments"), value: String(d.paidPayments) }])] });
  const drillUsers = () => open({ title: t("users"), value: String(d.users), sub: `${d.activeUsers} ${t("active")}`, sections: [
    kv(t("kpi.title"), [{ label: t("kpi.mau"), value: String(d.mau) }, { label: t("kpi.dau"), value: String(d.dau) }]),
    kv(td("drill.newUsers"), [{ label: t("kpi.newClients"), value: String(d.newClients) }, { label: td("drill.newAdvocates"), value: String(d.newAdvocates) }, { label: td("drill.newLawyers"), value: String(d.newLawyers) }]),
    kv(td("drill.nps"), [{ label: t("kpi.npsClient"), value: String(d.npsClient) }, { label: t("kpi.npsAdvocate"), value: String(d.npsAdvocate) }]),
  ] });
  const drillConversion = () => open({ title: t("conversion"), value: pct(d.conversionPct), sections: [funnelBars(), channelBars()], link: { href: "/admin/pipeline", label: td("drill.goPipeline") } });
  const drillCac = () => open({ title: t("kpi.cac"), value: som(d.cac), sections: [kv(td("drill.cac"), [{ label: td("drill.cacClient"), value: som(d.cacClient) }, { label: td("drill.cacAdvocate"), value: som(d.cacAdvocate) }, { label: t("kpi.ltv"), value: som(d.ltv) }, { label: t("kpi.ltvCac"), value: d.ltvCac ? `${d.ltvCac}×` : "—" }]), channelBars()] });
  const drillGifts = () => open({ title: t("kpi.giftTitle"), value: String(d.giftKpis.giftPurchases), sections: [kv(td("drill.gifts"), [
    { label: t("kpi.giftActivation"), value: pct(d.giftKpis.giftActivationRate) }, { label: t("kpi.giftToPaid"), value: pct(d.giftKpis.giftToPaidConversion) }, { label: t("kpi.avgGift"), value: som(d.giftKpis.averageGiftValue) },
    { label: t("kpi.recipientConversion"), value: pct(d.giftKpis.recipientConversion) }, { label: t("kpi.giftReferralRate"), value: pct(d.giftKpis.referralRate) }, { label: t("kpi.giftCac"), value: som(d.giftKpis.giftCac) }, { label: t("kpi.giftLtv"), value: som(d.giftKpis.giftLtv) },
  ])] });
  const simple = (title: string, value: string, extra?: DrillRow[]) => () => open({ title, value, sections: extra ? [kv(t("kpi.title"), extra)] : [unitEcon()] });

  return (
    <div className="ppanel">
      <div className="ppanel__h"><b>{t("title")}</b></div>
      <DashFilterBar value={filter} onChange={setFilter} demoForced={demoForced} onDemoForced={setDemoForced} note={isFiltered(filter) ? td("filter.regionNote") : undefined} compact />
      {demo && loaded ? <p className="bhnote" role="status"><IconInfo />{demoForced ? td("demo.forced") : td("demo.banner")}</p> : null}
      {!loaded ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <div className="castat">
            <StatTile icon={<IconCard />} value={short(d.revenue)} label={t("revenue")} sub={`${d.revenueDeltaPct >= 0 ? "+" : ""}${d.revenueDeltaPct}%`} demo={demo} hint={regionHint} onClick={drillRevenue} />
            <StatTile icon={<IconTrendingUp />} tone="ok" value={short(d.mrr)} label={t("mrr")} demo={demo} hint={regionHint ?? dateHint} onClick={drillMrr} />
            <StatTile icon={<IconUsers />} value={String(d.users)} label={t("users")} sub={`${d.activeUsers} ${t("active")}`} demo={demo} hint={dateHint} onClick={drillUsers} />
            <StatTile icon={<IconTarget />} value={pct(d.conversionPct)} label={t("conversion")} demo={demo} hint={regionHint} onClick={drillConversion} />
          </div>

          <div className="cachart">
            <h3>{t("revenueTrend")}</h3>
            {trend.length ? (
              <LineChart points={trend} format={(v) => som(v)} controls={false} />
            ) : <p className="advmuted">{t("noData")}</p>}
          </div>

          <div className="pgrid2">
            <div className="cablock">
              <h3>{t("funnel")}</h3>
              {d.funnel.length ? (
                <div className="fnl">
                  {d.funnel.map((x, i) => (
                    <div className="fnl__row" key={i}>
                      <span className="fnl__l">{stage(x.label)}</span>
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
                  data={d.channels.map((c) => ({ label: source(c.name), value: c.leads || c.payments || c.pct }))}
                  centerLabel={td("drill.channels")}
                  format={(v) => String(v)}
                  max={8}
                  otherLabel={td("drill.other")}
                />
              ) : <p className="advmuted">{t("noData")}</p>}
            </div>
          </div>

          {d.channels.length ? (
            <div className="cablock">
              <h3>{t("channelTable.title")}</h3>
              <div className="ceoch">
                <div className="ceoch__row ceoch__row--h">
                  <span>{t("channelTable.source")}</span>
                  <span>{t("channelTable.leads")}</span>
                  <span>{t("channelTable.payments")}</span>
                  <span>{t("channelTable.revenue")}</span>
                  <span>{t("channelTable.conversion")}</span>
                </div>
                {d.channels.map((c, i) => (
                  <div className="ceoch__row" key={`${c.name}-${i}`}>
                    <b>{source(c.name)}</b>
                    <span>{c.leads}</span>
                    <span>{c.payments}</span>
                    <span>{som(c.revenue)}</span>
                    <span>{c.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Chapter V KPI system */}
          <div className="cachart" style={{ paddingBottom: 0 }}><h3>{t("kpi.title")}</h3></div>
          <div className="castat">
            <StatTile icon={<IconUsers />} value={String(d.mau)} label={t("kpi.mau")} sub={`${d.dau} ${t("kpi.dau")}`} demo={demo} hint={regionHint} onClick={drillUsers} />
            <StatTile icon={<IconTrendingUp />} tone="ok" value={short(d.gmv)} label={t("kpi.gmv")} demo={demo} hint={regionHint} onClick={simple(t("kpi.gmv"), som(d.gmv))} />
            <StatTile icon={<IconCard />} tone="ok" value={short(d.arr)} label={t("kpi.arr")} demo={demo} hint={regionHint ?? dateHint} onClick={drillMrr} />
            <StatTile icon={<IconCard />} value={som(d.arpu)} label={t("kpi.arpu")} demo={demo} hint={regionHint} onClick={simple(t("kpi.arpu"), som(d.arpu))} />
          </div>
          <div className="castat">
            <StatTile icon={<IconTarget />} value={pct(d.takeRate)} label={t("kpi.takeRate")} demo={demo} hint={regionHint} onClick={simple(t("kpi.takeRate"), pct(d.takeRate))} />
            <StatTile icon={<IconCard />} value={som(d.cac)} label={t("kpi.cac")} sub={d.cacClient || d.cacAdvocate ? t("kpi.cacSplit", { client: som(d.cacClient), advocate: som(d.cacAdvocate) }) : undefined} demo={demo} hint={regionHint} onClick={drillCac} />
            <StatTile icon={<IconTrendingUp />} tone="ok" value={som(d.ltv)} label={t("kpi.ltv")} demo={demo} hint={regionHint} onClick={drillCac} />
            <StatTile icon={<IconTarget />} value={d.ltvCac ? `${d.ltvCac}×` : "—"} label={t("kpi.ltvCac")} sub={t("kpi.payback", { n: d.paybackMonths })} demo={demo} hint={regionHint} onClick={drillCac} />
          </div>
          <div className="castat">
            <StatTile icon={<IconStar />} value={String(d.npsClient)} label={t("kpi.npsClient")} demo={demo} hint={regionHint} onClick={simple(t("kpi.npsClient"), String(d.npsClient), [{ label: t("kpi.npsClient"), value: String(d.npsClient) }, { label: t("kpi.npsAdvocate"), value: String(d.npsAdvocate) }])} />
            <StatTile icon={<IconStar />} value={String(d.npsAdvocate)} label={t("kpi.npsAdvocate")} demo={demo} hint={regionHint} onClick={simple(t("kpi.npsAdvocate"), String(d.npsAdvocate), [{ label: t("kpi.npsClient"), value: String(d.npsClient) }, { label: t("kpi.npsAdvocate"), value: String(d.npsAdvocate) }])} />
            <StatTile icon={<IconUsers />} value={String(d.newClients)} label={t("kpi.newClients")} demo={demo} hint={regionHint} onClick={drillUsers} />
            <StatTile icon={<IconUsers />} value={String(d.newAdvocates + d.newLawyers)} label={t("kpi.newSellers")} demo={demo} hint={regionHint} onClick={drillUsers} />
            <StatTile icon={<IconCard />} tone="ok" value={String(d.paidPayments)} label={t("kpi.paidPayments")} demo={demo} hint={regionHint} onClick={drillRevenue} />
          </div>

          <div className="cablock">
            <h3>{t("kpi.giftTitle")}</h3>
            <div className="castat">
              <StatTile icon={<IconCard />} value={String(d.giftKpis.giftPurchases)} label={t("kpi.giftPurchases")} demo={demo} hint={regionHint} onClick={drillGifts} />
              <StatTile icon={<IconTarget />} value={pct(d.giftKpis.giftActivationRate)} label={t("kpi.giftActivation")} demo={demo} hint={regionHint} onClick={drillGifts} />
              <StatTile icon={<IconTrendingUp />} tone="ok" value={pct(d.giftKpis.giftToPaidConversion)} label={t("kpi.giftToPaid")} demo={demo} hint={regionHint} onClick={drillGifts} />
              <StatTile icon={<IconCard />} value={som(d.giftKpis.averageGiftValue)} label={t("kpi.avgGift")} demo={demo} hint={regionHint} onClick={drillGifts} />
            </div>
            <div className="castat">
              <StatTile icon={<IconTarget />} value={pct(d.giftKpis.recipientConversion)} label={t("kpi.recipientConversion")} demo={demo} hint={regionHint} onClick={drillGifts} />
              <StatTile icon={<IconUsers />} value={pct(d.giftKpis.referralRate)} label={t("kpi.giftReferralRate")} demo={demo} hint={regionHint} onClick={drillGifts} />
              <StatTile icon={<IconCard />} value={som(d.giftKpis.giftCac)} label={t("kpi.giftCac")} demo={demo} hint={regionHint} onClick={drillGifts} />
              <StatTile icon={<IconTrendingUp />} tone="ok" value={som(d.giftKpis.giftLtv)} label={t("kpi.giftLtv")} demo={demo} hint={regionHint} onClick={drillGifts} />
            </div>
          </div>
        </>
      )}
      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
