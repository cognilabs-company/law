"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getCeoDashboardFull, isCeoEmpty, trimSeries, isFiltered, todayIso, EMPTY_FILTER, type CeoDashboardFull } from "@/lib/services/dash";
import { demoCeo, dayBefore } from "@/lib/demoStats";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzs, fmtUzsShort } from "@/lib/money";
import { fmtDate, fmtInt } from "@/lib/date";
import { humanizeSlug, REGION_KEYS } from "@/lib/lawyers";
import { useAiSelection } from "@/lib/ai/registry";
import LineChart from "@/components/admin/LineChart";
import Select from "@/components/Select";
import StatDrillModal, { type Drill, type DrillRow } from "@/components/admin/StatDrillModal";
import { useDashFilter } from "@/components/admin/DashFilterBar";
import { IconAlert, IconArrowRight, IconBolt, IconInfo, IconRefresh } from "@/components/icons";

const GIFT0 = { giftPurchases: 0, giftActivationRate: 0, recipientConversion: 0, giftToPaidConversion: 0, averageGiftValue: 0, referralRate: 0, giftCac: 0, giftLtv: 0 };
const EMPTY: CeoDashboardFull = {
  fetchedAt: "",
  revenue: 0, revenueDeltaPct: 0, mrr: 0, users: 0, activeUsers: 0, conversionPct: 0, funnel: [], channels: [], revenueTrend: [],
  mau: 0, dau: 0, gmv: 0, arr: 0, arpu: 0, takeRate: 0, cac: 0, ltv: 0, ltvCac: 0, paybackMonths: 0,
  cacClient: 0, cacAdvocate: 0, paidPayments: 0,
  npsClient: 0, npsAdvocate: 0, newClients: 0, newAdvocates: 0, newLawyers: 0, giftKpis: GIFT0,
};
const PERIODS: { key: "" | "d7" | "d30" | "d90"; days: number }[] = [
  { key: "", days: 0 },
  { key: "d7", days: 7 },
  { key: "d30", days: 30 },
  { key: "d90", days: 90 },
];
const TEST_CHANNEL = /(^|[_-])(demo|test|auto_test|fixture|qa|sandbox)([_-]|$)/i;
type Health = "good" | "watch" | "bad" | "na" | "info";
type SortKey = "revenue" | "leads" | "payments" | "pct";

function Section({ id, ai, title, note, action, children }: { id: string; ai: string; title: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ceo-sec" aria-labelledby={`ceo-${id}`} data-ai-target={ai}>
      <header className="ceo-sec__h">
        <h2 id={`ceo-${id}`}>{title}</h2>
        {note ? <p>{note}</p> : null}
        {action}
      </header>
      <div className="ceo-sec__b">{children}</div>
    </section>
  );
}

// CEO report: one sheet read top to bottom — a written summary, the revenue
// curve with its period figures, unit economics as a ledger with a health
// note per line, the funnel with what each step loses, a sortable channel
// table, audience and the gift programme. Every section opens the matching
// drill-down; demo numbers stay labelled.
export default function AdminCeo() {
  const t = useTranslations("admin.ceo");
  const tr = useTranslations("admin.ceo.report");
  const locale = useLocale();
  const td = useTranslations("admin.dash");
  const tf = useTranslations("admin.dash.filter");
  const tc = useTranslations("admin.overview.crm");
  const te = useTranslations("enums.regions");
  const { filter, setFilter, demoForced, setDemoForced } = useDashFilter();
  const [tick, setTick] = useState(0);
  const fkey = `${filter.region}|${filter.from}|${filter.to}|${tick}`;
  const res = useResourceOne(() => getCeoDashboardFull(filter), [fkey]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "revenue", dir: -1 });
  const [showTest, setShowTest] = useState(false);
  const loaded = res.status !== "loading";
  const failed = res.status === "error" && !demoForced;
  const demo = demoForced || (res.status === "ready" && (!res.data || isCeoEmpty(res.data)));
  const d = useMemo(() => (demo ? demoCeo(todayIso()) : res.data ?? EMPTY), [demo, res.data]);
  const trend = trimSeries(d.revenueTrend, filter);
  const stage = (k: string) => (t.has(`stage.${k}`) ? t(`stage.${k}`) : humanizeSlug(k));
  const source = (k: string) => (k ? (t.has(`source.${k}`) ? t(`source.${k}`) : humanizeSlug(k)) : "—");
  const units = { mln: td("units.mln"), mlrd: td("units.mlrd") };
  const som = tc("som");
  const money = (n: number) => `${fmtUzs(n)} ${som}`;
  const short = (n: number) => `${fmtUzsShort(n, units, locale)} ${som}`;
  const num = (n: number) => (Math.abs(n) >= 1000 ? fmtInt(n, locale) : String(Math.round(n)));
  const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", locale === "en" ? "." : ",")}%`;
  const NA = tr("na");

  useAiSelection("dashboard_region", filter.region);
  useAiSelection("dashboard_period", filter.preset ? tf(filter.preset) : "");
  const pickPeriod = (key: "" | "d7" | "d30" | "d90") => {
    const p = PERIODS.find((x) => x.key === key);
    if (!p || !p.days) {
      setFilter({ ...filter, from: "", to: "", preset: "" });
      return;
    }
    const today = todayIso();
    setFilter({ ...filter, from: dayBefore(today, p.days - 1), to: today, preset: p.key });
  };

  const open = (drl: Omit<Drill, "demo">) => setDrill({ ...drl, demo });
  const kv = (title: string, rows: DrillRow[]): Drill["sections"][number] => ({ kind: "kv", title, rows });
  const channelBars = (): Drill["sections"][number] => ({ kind: "bars", title: t("channels"), rows: d.channels.map((c) => ({ label: source(c.name), value: money(c.revenue), n: c.revenue, sub: `${c.leads} · ${c.payments} · ${c.pct}%`, tone: TEST_CHANNEL.test(c.name) ? "muted" : undefined })) });
  const funnelBars = (): Drill["sections"][number] => ({ kind: "bars", title: t("funnel"), rows: d.funnel.map((x) => ({ label: stage(x.label), value: num(x.value), n: x.value })) });
  const unitEcon = () => kv(t("kpi.title"), [
    { label: t("kpi.gmv"), value: money(d.gmv) }, { label: t("kpi.arr"), value: money(d.arr) }, { label: t("kpi.arpu"), value: money(d.arpu) }, { label: t("kpi.takeRate"), value: pct(d.takeRate) },
    { label: t("kpi.cac"), value: d.cac ? money(d.cac) : NA }, { label: t("kpi.ltv"), value: money(d.ltv) }, { label: t("kpi.ltvCac"), value: d.ltvCac ? `${d.ltvCac}×` : NA },
  ]);
  const drillRevenue = () => open({ title: t("revenue"), value: money(d.revenue), sub: d.revenueDeltaPct ? `${d.revenueDeltaPct > 0 ? "+" : "−"}${Math.abs(d.revenueDeltaPct)}%` : undefined, sections: [{ kind: "series", title: t("revenueTrend"), points: trend, format: money }, channelBars()] });
  const drillUnit = () => open({ title: tr("unit"), note: td("drill.mrrNote"), sections: [unitEcon(), kv(td("drill.cac"), [{ label: td("drill.cacClient"), value: d.cacClient ? money(d.cacClient) : NA }, { label: td("drill.cacAdvocate"), value: d.cacAdvocate ? money(d.cacAdvocate) : NA }])] });
  const drillFunnel = () => open({ title: t("conversion"), value: pct(d.conversionPct), sections: [funnelBars(), channelBars()], link: { href: "/admin/pipeline", label: td("drill.goPipeline") } });
  const drillAudience = () => open({ title: t("users"), value: num(d.users), sections: [
    kv(t("kpi.title"), [{ label: t("kpi.mau"), value: num(d.mau) }, { label: t("kpi.dau"), value: num(d.dau) }]),
    kv(td("drill.newUsers"), [{ label: t("kpi.newClients"), value: num(d.newClients) }, { label: td("drill.newAdvocates"), value: num(d.newAdvocates) }, { label: td("drill.newLawyers"), value: num(d.newLawyers) }]),
    kv(td("drill.nps"), [{ label: t("kpi.npsClient"), value: d.npsClient ? String(d.npsClient) : NA }, { label: t("kpi.npsAdvocate"), value: d.npsAdvocate ? String(d.npsAdvocate) : NA }]),
  ] });
  const g = d.giftKpis;
  const drillGifts = () => open({ title: t("kpi.giftTitle"), value: num(g.giftPurchases), sections: [kv(td("drill.gifts"), [
    { label: t("kpi.giftActivation"), value: pct(g.giftActivationRate) }, { label: t("kpi.giftToPaid"), value: pct(g.giftToPaidConversion) }, { label: t("kpi.avgGift"), value: money(g.averageGiftValue) },
    { label: t("kpi.recipientConversion"), value: pct(g.recipientConversion) }, { label: t("kpi.giftReferralRate"), value: pct(g.referralRate) }, { label: t("kpi.giftCac"), value: g.giftCac ? money(g.giftCac) : NA }, { label: t("kpi.giftLtv"), value: money(g.giftLtv) },
  ])] });
  const more = (onClick: () => void, label: string) => (
    <button type="button" className="ceo-more" onClick={onClick} aria-label={`${td("drill.details")}: ${label}`}>
      {td("drill.details")}
      <IconArrowRight aria-hidden="true" />
    </button>
  );

  const total = trend.reduce((s, p) => s + p.value, 0);
  const days = trend.length;
  const best = trend.reduce<{ label: string; value: number } | null>((m, p) => (!m || p.value > m.value ? p : m), null);
  const activeDays = trend.filter((p) => p.value > 0).length;

  const leads = d.funnel.find((x) => x.label === "leads")?.value ?? 0;
  const orders = d.funnel.find((x) => x.label === "orders")?.value ?? 0;
  const paid = d.funnel.find((x) => x.label === "paid")?.value ?? d.paidPayments;
  const steps = [
    { key: "leads", value: leads },
    { key: "orders", value: orders },
  ];
  const stepMax = Math.max(1, leads, orders);

  const health = (key: string): Health => {
    if (key === "ltvCac") return !d.ltvCac ? "na" : d.ltvCac >= 3 ? "good" : d.ltvCac >= 1 ? "watch" : "bad";
    if (key === "cac" || key === "payback") return (key === "cac" ? d.cac : d.paybackMonths) ? "info" : "na";
    if (key === "mrr") return d.mrr && d.mrr === d.revenue ? "watch" : "info";
    return "info";
  };
  const ledger = [
    { key: "gmv", label: t("kpi.gmv"), value: d.gmv ? money(d.gmv) : NA, note: d.gmv && d.gmv === d.revenue ? tr("notes.gmvEq") : tr("notes.gmv") },
    { key: "mrr", label: t("mrr"), value: d.mrr ? money(d.mrr) : NA, note: d.mrr && d.mrr === d.revenue ? tr("notes.mrrEq") : tr("notes.mrr") },
    { key: "arr", label: t("kpi.arr"), value: d.arr ? money(d.arr) : NA, note: tr("notes.arr") },
    { key: "arpu", label: t("kpi.arpu"), value: d.arpu ? money(d.arpu) : NA, note: tr("notes.arpu") },
    { key: "take", label: t("kpi.takeRate"), value: d.takeRate ? pct(d.takeRate) : NA, note: tr("notes.take") },
    { key: "cac", label: t("kpi.cac"), value: d.cac ? money(d.cac) : NA, note: d.cac ? t("kpi.cacSplit", { client: money(d.cacClient), advocate: money(d.cacAdvocate) }) : tr("notes.cacNa") },
    { key: "ltv", label: t("kpi.ltv"), value: d.ltv ? money(d.ltv) : NA, note: tr("notes.ltv") },
    { key: "ltvCac", label: t("kpi.ltvCac"), value: d.ltvCac ? `${d.ltvCac}×` : NA, note: d.ltvCac ? tr("notes.ltvCac") : tr("notes.cacNa") },
    { key: "payback", label: tr("payback"), value: d.paybackMonths ? tr("months", { n: d.paybackMonths }) : NA, note: d.paybackMonths ? tr("notes.payback") : tr("notes.cacNa") },
  ];

  const testChannels = d.channels.filter((c) => TEST_CHANNEL.test(c.name));
  const rows = d.channels.filter((c) => showTest || !TEST_CHANNEL.test(c.name)).slice().sort((a, b) => {
    const k = sort.key === "pct" ? "pct" : sort.key;
    return (a[k] - b[k]) * sort.dir;
  });
  const rowsMax = Math.max(1, ...rows.map((c) => c.revenue));
  const shownRevenue = rows.reduce((s, c) => s + c.revenue, 0) || 1;
  const sortBy = (key: SortKey) => setSort((cur) => ({ key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : -1 }));
  const th = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sortBy(key)}>
        {label}
        <span className={`ceo-sort${sort.key === key ? (sort.dir === 1 ? " is-up" : " is-down") : ""}`} aria-hidden="true" />
      </button>
    </th>
  );

  const asOfDay = d.fetchedAt ? fmtDate(d.fetchedAt, locale) : "";
  const periodLabel = filter.preset ? tf(filter.preset) : filter.from || filter.to ? tr("custom") : tf("allTime");
  const B = (chunks: ReactNode) => <b>{chunks}</b>;

  return (
    <div className="ceo">
      <div className="ceo-bar" data-ai-target="stats:filters" data-ai-label={tf("aria")}>
        <div className="ceo-seg" role="radiogroup" aria-label={tf("period")}>
          {PERIODS.map((p) => (
            <button key={p.key || "all"} type="button" role="radio" aria-checked={(filter.preset || "") === p.key && (p.key !== "" || (!filter.from && !filter.to))} onClick={() => pickPeriod(p.key)}>
              {p.key ? tf(p.key) : tf("allTime")}
            </button>
          ))}
        </div>
        <div className="ceo-bar__region">
          <Select value={filter.region} onChange={(v) => setFilter({ ...filter, region: v })} ariaLabel={tf("region")} options={[{ value: "", label: tr("allRegions") }, ...REGION_KEYS.map((k) => ({ value: k, label: te.has(k) ? te(k) : humanizeSlug(k) }))]} />
        </div>
        {isFiltered(filter) ? (
          <button type="button" className="ceo-bar__reset" onClick={() => setFilter(EMPTY_FILTER)}>{tf("reset")}</button>
        ) : null}
        <button type="button" role="switch" aria-checked={demoForced} className="ceo-demo" onClick={() => setDemoForced(!demoForced)} title={tf("demoTitle")}>
          <IconBolt aria-hidden="true" />
          {tf("demo")}
          <i aria-hidden="true" />
        </button>
      </div>
      {isFiltered(filter) ? <p className="ceo-hint"><IconInfo aria-hidden="true" />{td("filter.regionNote")}</p> : null}
      {demo && loaded ? <p className="bhnote" role="status"><IconInfo />{demoForced ? td("demo.forced") : td("demo.banner")}</p> : null}

      <article className={`ceo-sheet${loaded ? " is-ready" : ""}`} aria-busy={!loaded}>
        {!loaded ? (
          <div className="ceo-skel" aria-hidden="true"><span /><span /><span /><span /></div>
        ) : failed ? (
          <div className="ceo-fail" role="alert">
            <IconAlert aria-hidden="true" />
            <span>{tr("failed")}</span>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setTick((n) => n + 1)}><IconRefresh />{tr("retry")}</button>
          </div>
        ) : (
          <>
            <header className="ceo-head" data-ai-target="ceo:kpis">
              <p className="ceo-head__lead">
                {tr.rich("summary", { revenue: short(d.revenue), payments: num(d.paidPayments), conv: pct(d.conversionPct), users: num(d.users), b: B })}
                {d.revenueDeltaPct ? <> {tr.rich(d.revenueDeltaPct > 0 ? "deltaUp" : "deltaDown", { n: Math.abs(d.revenueDeltaPct), b: B })}</> : null}
              </p>
              <p className="ceo-head__meta">
                {[t("title"), `${periodLabel}${filter.region ? ` · ${te.has(filter.region) ? te(filter.region) : humanizeSlug(filter.region)}` : ""}`, asOfDay ? tr("asOf", { date: asOfDay }) : ""].filter(Boolean).join("  ·  ")}
              </p>
            </header>

            <Section id="rev" ai="ceo:revenue-trend" title={t("revenueTrend")} note={tr("revNote")} action={more(drillRevenue, t("revenue"))}>
              {trend.length ? <LineChart points={trend} format={money} controls={false} /> : <p className="ceo-empty">{t("noData")}</p>}
              <dl className="ceo-figs">
                <div><dt>{tr("figTotal")}</dt><dd>{short(total)}</dd></div>
                <div><dt>{tr("figAvg")}</dt><dd>{days ? short(total / days) : NA}</dd></div>
                <div><dt>{tr("figBest")}</dt><dd>{best && best.value ? short(best.value) : NA}{best && best.value ? <small>{fmtDate(best.label.slice(0, 10), locale)}</small> : null}</dd></div>
                <div><dt>{tr("figActive")}</dt><dd>{tr("daysOf", { n: activeDays, total: days })}</dd></div>
              </dl>
            </Section>

            <Section id="unit" ai="ceo:kpi-system" title={tr("unit")} note={tr("unitNote")} action={more(drillUnit, tr("unit"))}>
              <table className="ceo-ledger">
                <thead>
                  <tr>
                    <th scope="col">{tr("colMetric")}</th>
                    <th scope="col" className="is-num">{tr("colValue")}</th>
                    <th scope="col">{tr("colNote")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => {
                    const h = health(row.key);
                    return (
                      <tr key={row.key} className={row.value === NA ? "is-na" : undefined}>
                        <th scope="row">{row.label}</th>
                        <td className="is-num">{row.value}</td>
                        <td>
                          {h !== "info" && h !== "na" ? <span className={`ceo-chip ceo-chip--${h}`}>{tr(`health.${h}`)}</span> : null}
                          <span className="ceo-ledger__note">{row.note}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>

            <Section id="funnel" ai="ceo:funnel" title={t("funnel")} note={tr("funnelNote")} action={more(drillFunnel, t("funnel"))}>
              <ol className="ceo-steps">
                {steps.map((s, i) => {
                  const prev = i ? steps[i - 1].value : 0;
                  const kept = i && prev ? Math.round((s.value / prev) * 100) : 100;
                  return (
                    <li key={s.key}>
                      <span className="ceo-steps__l">{stage(s.key)}</span>
                      <span className="ceo-steps__bar"><span style={{ width: `${Math.max(2, (s.value / stepMax) * 100)}%` }} /></span>
                      <b>{num(s.value)}</b>
                      <small>{i ? tr("kept", { pct: kept, lost: num(Math.max(0, prev - s.value)) }) : tr("entry")}</small>
                    </li>
                  );
                })}
              </ol>
              <p className="ceo-aside">{tr.rich("paidNote", { n: num(paid), b: B })}</p>
            </Section>

            <Section
              id="channels"
              ai="ceo:channels"
              title={t("channelTable.title")}
              note={testChannels.length ? tr("testNote", { n: testChannels.length, amount: short(testChannels.reduce((s, c) => s + c.revenue, 0)) }) : tr("channelsNote")}
              action={
                testChannels.length ? (
                  <button type="button" role="switch" aria-checked={showTest} className="ceo-toggle" onClick={() => setShowTest((v) => !v)}>
                    <i aria-hidden="true" />
                    {tr("showTest")}
                  </button>
                ) : null
              }
            >
              {rows.length ? (
                <div className="ceo-tablewrap" data-ai-target="ceo:channel-table">
                  <table className="ceo-table">
                    <thead>
                      <tr>
                        <th scope="col">{t("channelTable.source")}</th>
                        {th("leads", t("channelTable.leads"))}
                        {th("payments", t("channelTable.payments"))}
                        {th("revenue", t("channelTable.revenue"))}
                        {th("pct", t("channelTable.conversion"))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c, i) => (
                        <tr key={`${c.name}-${i}`} className={TEST_CHANNEL.test(c.name) ? "is-test" : undefined}>
                          <th scope="row">{source(c.name)}{TEST_CHANNEL.test(c.name) ? <em>{tr("testTag")}</em> : null}</th>
                          <td className="is-num">{num(c.leads)}</td>
                          <td className="is-num">{num(c.payments)}</td>
                          <td className="is-num ceo-table__rev">
                            <span>{short(c.revenue)}</span>
                            <i aria-hidden="true"><span style={{ width: `${(c.revenue / rowsMax) * 100}%` }} /></i>
                            <small>{Math.round((c.revenue / shownRevenue) * 100)}%</small>
                          </td>
                          <td className="is-num">{c.leads && c.pct <= 100 ? pct(c.pct) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="ceo-empty">{t("noData")}</p>
              )}
            </Section>

            <Section id="aud" ai="ceo:audience" title={tr("audience")} note={tr("audienceNote")} action={more(drillAudience, tr("audience"))}>
              <div className="ceo-cols">
                <dl>
                  <div><dt>{t("users")}</dt><dd>{num(d.users)}</dd></div>
                  <div><dt>{t("kpi.mau")}</dt><dd>{num(d.mau)}</dd></div>
                  <div><dt>{t("kpi.dau")}</dt><dd>{num(d.dau)}</dd></div>
                  <div><dt>{tr("stickiness")}</dt><dd>{d.mau ? `${Math.round((d.dau / d.mau) * 100)}%` : NA}</dd></div>
                </dl>
                <dl>
                  <div><dt>{t("kpi.newClients")}</dt><dd>{num(d.newClients)}</dd></div>
                  <div><dt>{td("drill.newAdvocates")}</dt><dd>{num(d.newAdvocates)}</dd></div>
                  <div><dt>{td("drill.newLawyers")}</dt><dd>{num(d.newLawyers)}</dd></div>
                </dl>
                <dl>
                  <div><dt>{t("kpi.npsClient")}</dt><dd className={d.npsClient ? undefined : "is-na"}>{d.npsClient ? d.npsClient : NA}</dd></div>
                  <div><dt>{t("kpi.npsAdvocate")}</dt><dd className={d.npsAdvocate ? undefined : "is-na"}>{d.npsAdvocate ? d.npsAdvocate : NA}</dd></div>
                </dl>
              </div>
            </Section>

            <Section id="gifts" ai="ceo:gift-kpis" title={t("kpi.giftTitle")} note={tr("giftNote")} action={more(drillGifts, t("kpi.giftTitle"))}>
              <ol className="ceo-chain">
                <li><b>{num(g.giftPurchases)}</b><span>{t("kpi.giftPurchases")}</span></li>
                <li><b>{pct(g.giftActivationRate)}</b><span>{t("kpi.giftActivation")}</span></li>
                <li><b>{pct(g.giftToPaidConversion)}</b><span>{t("kpi.giftToPaid")}</span></li>
              </ol>
              <dl className="ceo-figs">
                <div><dt>{t("kpi.avgGift")}</dt><dd>{g.averageGiftValue ? short(g.averageGiftValue) : NA}</dd></div>
                <div><dt>{t("kpi.giftLtv")}</dt><dd>{g.giftLtv ? short(g.giftLtv) : NA}</dd></div>
                <div><dt>{t("kpi.giftReferralRate")}</dt><dd>{pct(g.referralRate)}</dd></div>
                <div><dt>{t("kpi.giftCac")}</dt><dd>{g.giftCac ? short(g.giftCac) : NA}</dd></div>
              </dl>
            </Section>
          </>
        )}
      </article>
      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
