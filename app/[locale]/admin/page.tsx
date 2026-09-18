"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/date";
import { seedDemoData } from "@/lib/services/backend";
import {
  getAdminDashboardFull,
  getCeoDashboardFull,
  getRetentionData,
  getQualityFull,
  isAdminDashboardEmpty,
  isCeoEmpty,
  isRetentionEmpty,
  isQualityEmpty,
  trimSeries,
  isFiltered,
  type AdminDashboardFull,
  type CeoDashboardFull,
  type RetentionData,
  todayIso,
  type QualityFull,
} from "@/lib/services/dash";
import { demoAdminDashboard, demoCeo, demoRetention, demoQuality } from "@/lib/demoStats";
import { humanizeSlug } from "@/lib/lawyers";
import { isDemoUnavailable } from "@/lib/http";
import { useResourceOne } from "@/lib/useResource";
import { useDemoTools } from "@/lib/demoTools";
import { fmtUzs } from "@/lib/money";
import { Skeleton } from "@/components/portal/DataState";
import LineChart from "@/components/admin/LineChart";
import Modal from "@/components/admin/Modal";
import StatTile from "@/components/admin/StatTile";
import StatDrillModal, { type Drill } from "@/components/admin/StatDrillModal";
import DashFilterBar, { useDashFilter } from "@/components/admin/DashFilterBar";
import {
  IconBolt,
  IconUsers,
  IconTrendingUp,
  IconAward,
  IconCard,
  IconShieldCheck,
  IconBuilding,
  IconPhone,
  IconArrowRight,
  IconInfo,
} from "@/components/icons";

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("ru-RU").replace(/,/g, " ") : String(n));
const DASH = "—";

const MODULES = [
  { href: "/admin/pipeline", key: "pipeline", Icon: IconTrendingUp },
  { href: "/admin/verifications", key: "verifications", Icon: IconAward },
  { href: "/admin/payouts", key: "payouts", Icon: IconCard },
  { href: "/admin/quality", key: "quality", Icon: IconShieldCheck },
  { href: "/admin/b2b", key: "b2b", Icon: IconBuilding },
  { href: "/admin/retention", key: "retention", Icon: IconUsers },
  { href: "/admin/call-center", key: "callCenter", Icon: IconPhone },
];

// Admin overview: KPI tiles (each opens a drill-down with the breakdown
// behind the number), region/date filter bar, and a demo-data fallback
// labelled as such while the platform has no real activity.
export default function AdminOverview() {
  const t = useTranslations("admin.overview");
  const tc = useTranslations("admin.overview.crm");
  const tn = useTranslations("admin");
  const td = useTranslations("admin.dash");
  const tr = useTranslations("admin.retention");
  const te = useTranslations("enums.regions");
  const locale = useLocale();
  const { session } = useAuth();
  const { filter, setFilter, demoForced, setDemoForced } = useDashFilter();
  const fkey = `${filter.region}|${filter.from}|${filter.to}`;
  const ceo = useResourceOne(() => getCeoDashboardFull(filter), [fkey]);
  const ret = useResourceOne(() => getRetentionData(filter), [fkey]);
  const qual = useResourceOne(() => getQualityFull(filter), [fkey]);
  const dash = useResourceOne(() => getAdminDashboardFull(filter), [fkey]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [seedAsk, setSeedAsk] = useState(false);
  const demoTools = useDemoTools();

  async function seed() {
    if (seedBusy) return;
    setSeedBusy(true);
    setSeedMsg(null);
    try {
      const r = await seedDemoData();
      setSeedMsg([t("seedReady"), r.removed > 0 ? t("seedRemoved", { n: r.removed }) : ""].filter(Boolean).join(" "));
    } catch (e) {
      setSeedMsg(isDemoUnavailable(e) ? t("seedUnavailable") : t("seedError"));
    } finally {
      setSeedBusy(false);
    }
  }

  // Demo fallback: forced by the toggle, or when every real number is zero.
  const loaded = ceo.status !== "loading" && ret.status !== "loading" && qual.status !== "loading" && dash.status !== "loading";
  const allEmpty = loaded && (!dash.data || isAdminDashboardEmpty(dash.data)) && (!ceo.data || isCeoEmpty(ceo.data)) && (!ret.data || isRetentionEmpty(ret.data)) && (!qual.data || isQualityEmpty(qual.data));
  const demo = demoForced || allEmpty;
  const view = useMemo(() => {
    if (!demo) return { d: dash.data, c: ceo.data, r: ret.data, q: qual.data };
    const today = todayIso();
    return { d: demoAdminDashboard(today) as AdminDashboardFull, c: demoCeo(today) as CeoDashboardFull, r: demoRetention(today) as RetentionData, q: demoQuality(today) as QualityFull };
  }, [demo, dash.data, ceo.data, ret.data, qual.data]);
  const { d, c, r, q } = view;

  const money = (n?: number) => (n ? `${fmtUzs(n)} ${tc("som")}` : DASH);
  const pct = (n?: number) => (n || n === 0 ? `${Math.round(n)}%` : DASH);
  const funnel = c?.funnel ?? [];
  const fMax = Math.max(...funnel.map((f2) => f2.value), 1);
  const trend = trimSeries(c?.revenueTrend ?? [], filter);
  const lastPoint = trend[trend.length - 1];
  const lastDate = lastPoint ? fmtDate(lastPoint.label, locale) : "";
  const stat = (k: string) => d?.totals.find((x) => x.label === k)?.value;
  const chart = (k: string) => (d?.charts.find((x) => x.key === k)?.points ?? []).filter((x) => x.label);
  const byStatus = chart("orders_by_status").sort((a, b) => b.value - a.value);
  const byScore = chart("leads_by_score").sort((a, b) => b.value - a.value);
  const byRole = chart("sellers_by_role");
  const byRegionAll = chart("leads_by_region");
  const byRegion = filter.region ? byRegionAll.filter((x) => x.label === filter.region) : byRegionAll;
  const sMax = Math.max(...byStatus.map((x) => x.value), 1);
  const label = (group: string, k: string) => (tc.has(`${group}.${k}`) ? tc(`${group}.${k}`) : humanizeSlug(k));
  const regionName = (k: string) => (te.has(k) ? te(k) : humanizeSlug(k));
  const regionHint = filter.region ? td("hint.regionNa") : undefined;
  const dateHint = isFiltered(filter) && (filter.from || filter.to) ? td("hint.dateNa") : undefined;

  // Drill-down builders — everything comes from the payloads already loaded.
  const open = (drl: Drill) => setDrill({ ...drl, demo });
  const drillRevenue = () => open({
    title: tc("revenue"), value: money(c?.revenue), sub: c?.revenueDeltaPct ? `${c.revenueDeltaPct > 0 ? "▲" : "▼"} ${Math.abs(c.revenueDeltaPct)}%` : undefined,
    sections: [
      { kind: "series", title: td("drill.trend"), points: trend, format: (v) => `${fmtUzs(v)} ${tc("som")}` },
      { kind: "kv", title: td("drill.payments"), rows: [
        { label: td("drill.paid"), value: money(stat("paid_amount")), n: stat("paid_amount") },
        { label: td("drill.pending"), value: money(stat("pending_amount")), n: stat("pending_amount") },
        { label: td("drill.paidCount"), value: fmt(stat("paid_count") ?? 0) },
        { label: td("drill.pendingCount"), value: fmt(stat("pending_count") ?? 0) },
      ] },
      { kind: "bars", title: td("drill.channels"), rows: (c?.channels ?? []).map((ch) => ({ label: ch.name, value: money(ch.revenue), n: ch.revenue, sub: `${fmt(ch.leads)} · ${ch.pct}%` })) },
    ],
    link: { href: "/admin/ceo", label: td("drill.goCeo") },
  });
  const drillMrr = () => open({
    title: tc("mrr"), value: money(c?.mrr), note: td("drill.mrrNote"),
    sections: [{ kind: "kv", rows: [
      { label: td("drill.arr"), value: money(c?.arr) }, { label: td("drill.arpu"), value: money(c?.arpu) }, { label: td("drill.gmv"), value: money(c?.gmv) },
      { label: td("drill.takeRate"), value: pct(c?.takeRate) }, { label: td("drill.ltv"), value: money(c?.ltv) }, { label: td("drill.cac"), value: money(c?.cac) },
    ] }],
    link: { href: "/admin/ceo", label: td("drill.goCeo") },
  });
  const drillUsers = () => open({
    title: tc("users"), value: c ? fmt(c.users) : DASH, sub: c ? `${td("drill.activeUsers")}: ${fmt(c.activeUsers)}` : undefined,
    sections: [
      { kind: "kv", title: td("drill.newUsers"), rows: [
        { label: td("drill.newClients"), value: fmt(c?.newClients ?? 0) }, { label: td("drill.newAdvocates"), value: fmt(c?.newAdvocates ?? 0) }, { label: td("drill.newLawyers"), value: fmt(c?.newLawyers ?? 0) },
      ] },
      { kind: "bars", title: td("drill.byRole"), rows: byRole.map((x) => ({ label: td.has(`role.${x.label}`) ? td(`role.${x.label}`) : humanizeSlug(x.label), value: fmt(x.value), n: x.value })) },
      { kind: "bars", title: td("drill.byRegion"), rows: byRegion.map((x) => ({ label: regionName(x.label), value: fmt(x.value), n: x.value })), empty: td("drill.regionUnknown") },
    ],
  });
  const drillConversion = () => open({
    title: tc("conversion"), value: pct(c?.conversionPct),
    sections: [
      { kind: "bars", title: td("drill.funnel"), rows: funnel.map((f2) => ({ label: label("stage", f2.label), value: fmt(f2.value), n: f2.value })) },
      { kind: "bars", title: td("drill.byScore"), rows: byScore.map((x) => ({ label: label("score", x.label), value: fmt(x.value), n: x.value })) },
    ],
    link: { href: "/admin/pipeline", label: td("drill.goPipeline") },
  });
  const drillRetained = () => open({
    title: tc("retained"), value: pct(r?.retainedPct),
    sections: [{ kind: "kv", title: td("drill.retention"), rows: [
      { label: td("drill.prevActive"), value: fmt(r?.previousPeriodActive ?? 0) }, { label: td("drill.curActive"), value: fmt(r?.currentPeriodActive ?? 0) },
      { label: td("drill.retainedClients"), value: fmt(r?.retainedClients ?? 0) }, { label: td("drill.churned"), value: fmt(r?.churnedThisMonth ?? 0), tone: "bad" },
    ] }],
    link: { href: "/admin/retention", label: td("drill.goRetention") },
  });
  const drillRating = () => open({
    title: tc("rating"), value: q?.avgRating ? q.avgRating.toFixed(1) : DASH, note: td("drill.constNote"),
    sections: [
      { kind: "kv", rows: [{ label: td("drill.complaints"), value: pct(q?.complaintRate) }, { label: td("drill.resolved"), value: pct(q?.resolvedPct) }, { label: td("drill.sla"), value: pct(q?.responseSlaPct) }] },
      { kind: "list", title: td("drill.flagged"), rows: (q?.flagged ?? []).map((f2) => ({ label: f2.title, value: f2.severity, sub: f2.detail, tone: f2.severity === "high" ? "bad" : "muted" })) },
    ],
    link: { href: "/admin/quality", label: td("drill.goQuality") },
  });
  const drillSla = () => open({
    title: tc("sla"), value: pct(q?.responseSlaPct), note: td("drill.constNote"),
    sections: [{ kind: "kv", rows: [{ label: td("drill.rating"), value: q?.avgRating ? q.avgRating.toFixed(1) : DASH }, { label: td("drill.complaints"), value: pct(q?.complaintRate) }] }],
    link: { href: "/admin/quality", label: td("drill.goQuality") },
  });
  const drillAtRisk = () => open({
    title: tc("atRisk"), value: r ? fmt(r.atRisk) : DASH, sub: r ? `${td("drill.atRiskLeads")}: ${fmt(r.atRiskLeads)}` : undefined,
    sections: [{ kind: "list", rows: (r?.atRiskClients ?? []).map((x) => ({ label: x.name || x.phone, value: x.lastPaidAt ? fmtDate(x.lastPaidAt, locale) : "", sub: x.reasons.map((k) => (tr.has(`reason.${k}`) ? tr(`reason.${k}`) : humanizeSlug(k))).join(", "), tone: "bad" })) }],
    link: { href: "/admin/retention", label: td("drill.goRetention") },
  });
  const drillPayments = (k: "paid" | "pending") => open({
    title: k === "paid" ? tc("paidAmount") : tc("pendingAmount"), value: money(stat(`${k}_amount`)), sub: `${fmt(stat(`${k}_count`) ?? 0)} ${td("drill.payments").toLowerCase()}`,
    sections: [{ kind: "series", title: td("drill.trend"), points: trend, format: (v) => `${fmtUzs(v)} ${tc("som")}` }],
  });
  const drillLeads = () => open({
    title: td("drill.leads"), value: fmt(stat("leads") ?? byScore.reduce((s, x) => s + x.value, 0)),
    sections: [
      { kind: "bars", title: td("drill.byScore"), rows: byScore.map((x) => ({ label: label("score", x.label), value: fmt(x.value), n: x.value })) },
      { kind: "bars", title: td("drill.byRegion"), rows: byRegion.map((x) => ({ label: regionName(x.label), value: fmt(x.value), n: x.value })), empty: td("drill.regionUnknown") },
    ],
    link: { href: "/admin/pipeline", label: td("drill.goLeads") },
  });
  const drillOrders = () => open({
    title: tc("ordersByStatus"), value: fmt(byStatus.reduce((s, x) => s + x.value, 0)),
    sections: [{ kind: "bars", title: td("drill.byStatus"), rows: byStatus.map((x) => ({ label: label("status", x.label), value: fmt(x.value), n: x.value })) }],
  });

  return (
    <>
      <div className="advhero">
        <div className="advhero__t">
          <span className="advhero__k">{tc("kicker")}</span>
          <h2 className="psec-h" style={{ color: "#fff" }}>{t("hi", { name: session?.name ?? "" })}</h2>
          <p>{tc("sub")}</p>
        </div>
        <div className="advhero__done" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          {demoTools ? (
            <button className="btn btn--glass btn--sm" type="button" onClick={() => setSeedAsk(true)} disabled={seedBusy}>
              <IconBolt />
              {seedBusy ? t("seeding") : t("seed")}
            </button>
          ) : null}
          {seedMsg ? <span style={{ fontSize: ".8rem", color: "#B7CDEC" }}>{seedMsg}</span> : null}
        </div>
      </div>

      <Modal open={seedAsk} onClose={() => setSeedAsk(false)} title={t("seedConfirmTitle")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p className="advmuted" style={{ margin: 0 }}>{t("seedConfirmText")}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn--ghost" type="button" onClick={() => setSeedAsk(false)}>{tn("form.cancel")}</button>
            <button className="btn btn--pri" type="button" disabled={seedBusy} onClick={() => { setSeedAsk(false); seed(); }}>{t("seedConfirm")}</button>
          </div>
        </div>
      </Modal>

      <DashFilterBar value={filter} onChange={setFilter} demoForced={demoForced} onDemoForced={setDemoForced} note={isFiltered(filter) ? td("filter.regionNote") : undefined} />
      {demo && loaded ? (
        <p className="bhnote" role="status"><IconInfo />{demoForced ? td("demo.forced") : td("demo.banner")}</p>
      ) : null}

      {!loaded ? <Skeleton rows={3} /> : null}

      {/* Headline KPIs — each tile opens its breakdown */}
      <div className="ppanel">
        <div className="kpanel">
          <StatTile variant="ktile" label={tc("revenue")} value={money(c?.revenue)} delta={c?.revenueDeltaPct} demo={demo} hint={regionHint} onClick={drillRevenue} />
          <StatTile variant="ktile" label={tc("mrr")} value={money(c?.mrr)} demo={demo} hint={regionHint ?? dateHint} onClick={drillMrr} />
          <StatTile variant="ktile" label={tc("users")} value={c ? fmt(c.users) : DASH} demo={demo} hint={dateHint} onClick={drillUsers} />
          <StatTile variant="ktile" label={tc("conversion")} value={pct(c?.conversionPct)} demo={demo} hint={regionHint} onClick={drillConversion} />
          <StatTile variant="ktile" label={tc("retained")} value={pct(r?.retainedPct)} demo={demo} hint={regionHint ?? dateHint} onClick={drillRetained} />
          <StatTile variant="ktile" label={tc("rating")} value={q?.avgRating ? q.avgRating.toFixed(1) : DASH} demo={demo} hint={regionHint ?? dateHint} onClick={drillRating} />
          <StatTile variant="ktile" label={tc("sla")} value={pct(q?.responseSlaPct)} demo={demo} hint={regionHint ?? dateHint} onClick={drillSla} />
          <StatTile variant="ktile" label={tc("atRisk")} value={r ? fmt(r.atRisk) : DASH} demo={demo} hint={regionHint} onClick={drillAtRisk} />
        </div>
      </div>

      <div className="pgrid2">
        <div className="ppanel">
          <div className="ppanel__h">
            <b>{tc("revenueTrend")}</b>
            {lastPoint ? <span className="advmuted">{lastDate} · {money(lastPoint.value)}</span> : null}
          </div>
          {trend.length ? <LineChart points={trend} format={(v) => `${fmtUzs(v)} ${tc("som")}`} /> : <p className="advmuted">{t("empty")}</p>}
        </div>
        <div className="ppanel">
          <div className="ppanel__h"><b>{tc("funnel")}</b><button type="button" className="btn btn--line btn--sm" onClick={drillConversion}>{td("drill.details")}</button></div>
          {funnel.length ? (
            <div className="kfunnel">
              {funnel.map((fn, i) => (
                <div className="kfunnel__row" key={i}>
                  <span className="kfunnel__lbl">{label("stage", fn.label)}</span>
                  <span className="kfunnel__bar"><span style={{ width: `${Math.max(4, (fn.value / fMax) * 100)}%` }} /></span>
                  <b className="kfunnel__v">{fmt(fn.value)}</b>
                </div>
              ))}
            </div>
          ) : <p className="advmuted">{t("empty")}</p>}
        </div>
      </div>

      {d ? (
        <div className="pgrid2">
          <div className="ppanel">
            <div className="ppanel__h"><b>{tc("payments")}</b></div>
            <div className="kpanel kpanel--2">
              <StatTile variant="ktile" label={tc("paidAmount")} value={money(stat("paid_amount"))} demo={demo} onClick={() => drillPayments("paid")} />
              <StatTile variant="ktile" label={tc("pendingAmount")} value={money(stat("pending_amount"))} demo={demo} onClick={() => drillPayments("pending")} />
              <StatTile variant="ktile" label={tc("paidCount")} value={fmt(stat("paid_count") ?? 0)} demo={demo} onClick={() => drillPayments("paid")} />
              <StatTile variant="ktile" label={tc("pendingCount")} value={fmt(stat("pending_count") ?? 0)} demo={demo} onClick={() => drillPayments("pending")} />
            </div>
            {byScore.length ? (
              <>
                <div className="ppanel__h" style={{ marginTop: 16 }}><b>{tc("leadsByScore")}</b><button type="button" className="btn btn--line btn--sm" onClick={drillLeads}>{td("drill.details")}</button></div>
                <div className="aitem__tags">
                  {byScore.map((x) => (
                    <span className="creq__badge" key={x.label}>{label("score", x.label)} · {fmt(x.value)}</span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <div className="ppanel">
            <div className="ppanel__h"><b>{tc("ordersByStatus")}</b><button type="button" className="btn btn--line btn--sm" onClick={drillOrders}>{td("drill.details")}</button></div>
            {byStatus.length ? (
              <div className="kfunnel">
                {byStatus.map((x) => (
                  <div className="kfunnel__row" key={x.label}>
                    <span className="kfunnel__lbl">{label("status", x.label)}</span>
                    <span className="kfunnel__bar"><span style={{ width: `${Math.max(4, (x.value / sMax) * 100)}%` }} /></span>
                    <b className="kfunnel__v">{fmt(x.value)}</b>
                  </div>
                ))}
              </div>
            ) : <p className="advmuted">{t("empty")}</p>}
          </div>
        </div>
      ) : null}

      <div className="ppanel">
        <div className="ppanel__h"><b>{tc("modules")}</b></div>
        <div className="kmods">
          {MODULES.map(({ href, key, Icon }) => (
            <Link href={href} key={key} className="kmod">
              <span className="kmod__i"><Icon /></span>
              <span className="kmod__t">{tn(`nav.${key}`)}</span>
              <IconArrowRight className="kmod__a" />
            </Link>
          ))}
        </div>
      </div>

      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
    </>
  );
}
