"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getCeoDashboardFull, isCeoEmpty, ceoTestSplit, isTestChannel, todayIso, type CeoDashboardFull } from "@/lib/services/dash";
import { demoCeo, useDemoForced } from "@/lib/demoStats";
import { useResourceOne } from "@/lib/useResource";
import { fmtUzsShort } from "@/lib/money";
import { fmtDate, fmtNum, fmtPct, monthNames } from "@/lib/date";
import { humanizeSlug } from "@/lib/lawyers";
import { leadSourceInfo, sourceGroup, type SourceGroup } from "@/lib/leadLabels";
import { useAiSelection } from "@/lib/ai/registry";
import { notify } from "@/lib/toast";
import LineChart from "@/components/admin/LineChart";
import StatDrillModal, { type Drill, type DrillRow } from "@/components/admin/StatDrillModal";
import { ErrorState } from "@/components/portal/DataState";
import Segmented from "@/components/ui/Segmented";
import { IconAlert, IconArrowRight, IconBolt, IconInfo } from "@/components/icons";

const GIFT0 = { giftPurchases: 0, giftActivationRate: 0, recipientConversion: 0, giftToPaidConversion: 0, averageGiftValue: 0, referralRate: 0, giftCac: 0, giftLtv: 0 };
const EMPTY: CeoDashboardFull = {
  fetchedAt: "",
  revenue: 0, revenueDeltaPct: 0, mrr: 0, users: 0, activeUsers: 0, conversionPct: 0, funnel: [], channels: [], revenueTrend: [],
  mau: 0, dau: 0, gmv: 0, arr: 0, arpu: 0, takeRate: 0, cac: 0, ltv: 0, ltvCac: 0, paybackMonths: 0,
  cacClient: 0, cacAdvocate: 0, paidPayments: 0,
  npsClient: 0, npsAdvocate: 0, newClients: 0, newAdvocates: 0, newLawyers: 0, giftKpis: GIFT0,
};
const SPANS = [7, 14] as const;
type Span = (typeof SPANS)[number];
const GROUPS: readonly SourceGroup[] = ["channel", "payment"];
const SORT_NONE = "↕︎";
type Health = "good" | "watch" | "bad" | "na" | "info";
type SortKey = "revenue" | "leads" | "payments" | "pct";
type Channel = CeoDashboardFull["channels"][number];
type Got = { ok: true; data: CeoDashboardFull } | { ok: false; error: unknown; at: string };
type Seen = { got: Got; kept: CeoDashboardFull | null };
const STALE_ID = "ceo-stale";

function Section({ id, ai, title, scope, tag, note, action, children }: { id: string; ai: string; title: string; scope?: string; tag?: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ceo-sec" aria-labelledby={`ceo-${id}`} data-ai-target={ai}>
      <header className="ceo-sec__h">
        <h2 id={`ceo-${id}`}>{title}</h2>
        {scope ? (
          <p className="ceo-sec__scope">
            {scope}
            {tag ? <>{" "}<span className="ceo-chip ceo-chip--na">{tag}</span></> : null}
          </p>
        ) : null}
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
  const te = useTranslations("enums");
  const tnf = useTranslations("common.notify");
  const [demoForced, setDemoForced] = useDemoForced();
  const [tick, setTick] = useState(0);
  const res = useResourceOne(() => getCeoDashboardFull().then((data): Got => ({ ok: true, data }), (error: unknown): Got => ({ ok: false, error, at: todayIso() })), [tick]);
  const got = res.data;
  const [seen, setSeen] = useState<Seen | null>(null);
  if (got && got !== seen?.got) setSeen({ got, kept: got.ok ? got.data : seen?.kept ?? null });
  const [drill, setDrill] = useState<Drill | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "revenue", dir: -1 });
  const [showTest, setShowTest] = useState(false);
  const [span, setSpan] = useState<Span>(14);
  const loading = res.status === "loading";
  const last = got ?? seen?.got ?? null;
  const fail = last && !last.ok ? last : null;
  const report = got?.ok ? got.data : seen?.kept ?? null;
  const demo = demoForced || (report !== null && isCeoEmpty(report));
  const today = report?.fetchedAt || fail?.at || "";
  const d = useMemo(() => (demo ? demoCeo(today) : report ?? EMPTY), [demo, today, report]);
  const first = !last;
  const failed = !first && !report && !demo;
  const stale = !demo && report !== null && fail !== null;
  const raised = useRef<Got | null>(null);
  const retry = () => setTick((n) => n + 1);

  useEffect(() => {
    if (!got) return;
    if (got.ok) {
      notify.dismiss(STALE_ID);
      return;
    }
    if (got === raised.current || (!report && !demoForced)) return;
    raised.current = got;
    notify.error(report ? td("notUpdated") : tr("realFailed"), { id: STALE_ID, error: got.error, action: { label: tnf("retry"), onClick: () => setTick((n) => n + 1) } });
  }, [got, report, demoForced, td, tr, tnf]);
  useEffect(() => () => notify.dismiss(STALE_ID), []);

  const stage = (k: string) => (t.has(`stage.${k}`) ? t(`stage.${k}`) : humanizeSlug(k));
  const sourceName = (k: string) => leadSourceInfo(te, k).label || "—";
  const units = { mln: td("units.mln"), mlrd: td("units.mlrd") };
  const som = tc("som");
  const money = (n: number) => `${fmtNum(n, locale)} ${som}`;
  const short = (n: number) => `${Math.abs(n) >= 1e6 ? fmtUzsShort(n, units, locale) : fmtNum(n, locale)} ${som}`;
  const num = (n: number) => fmtNum(n, locale);
  const pct = (n: number, digits = 1) => fmtPct(n, locale, digits);
  const NA = tr("na");
  const na = (value: string) => (value === NA ? "is-na" : undefined);
  const row = (label: string, value: string, sub?: string): DrillRow => ({ label, value, sub, tone: value === NA ? "muted" : undefined });

  useAiSelection("dashboard_period", tr("allTime"));
  useAiSelection("revenue_chart_period", tr("spanDays", { n: span }));
  const toggleDemo = () => {
    setDemoForced(!demoForced);
    notify.info(td(demoForced ? "demo.disabled" : "demo.enabled"), { id: "ceo-demo" });
  };

  const split = ceoTestSplit(d);
  const hasTest = !demo && (split.revenue > 0 || split.payments > 0);
  const cut = hasTest && !showTest;
  const headRevenue = cut ? Math.max(0, d.revenue - split.revenue) : d.revenue;
  const headPayments = cut ? Math.max(0, d.paidPayments - split.payments) : d.paidPayments;
  const withTest = hasTest ? tr("withTest") : undefined;
  const tagged = (n: number) => (n ? withTest : undefined);
  const testLine = hasTest ? tr(cut ? "testExcluded" : "testIncluded", { amount: short(split.revenue), n: split.payments }) : "";
  const gmvSame = d.gmv === d.revenue;
  const gmv = gmvSame ? headRevenue : d.gmv;
  const gmvTag = gmvSame && cut ? undefined : tagged(gmv);
  const mrrStub = !demo && d.mrr === d.revenue;
  const mrr = mrrStub ? d.arr / 12 : d.mrr;
  const mrrNote = !mrrStub ? tr("notes.mrr") : mrr ? tr("notes.mrrSubs") : tr("notes.mrrNa");
  const arrNote = mrr && !mrrStub && Math.abs(d.arr - mrr * 12) < 12 ? tr("notes.arr") : tr("notes.arrSubs");
  const paidRaw = d.funnel.find((x) => x.label === "paid")?.value ?? d.paidPayments;
  const paidSame = paidRaw === d.paidPayments;
  const paid = paidSame ? headPayments : paidRaw;
  const paidTag = paidSame && cut ? undefined : tagged(paid);
  const ltvCac = Math.round(d.ltvCac * 10) / 10;
  const ltvCacText = d.ltvCac ? `${fmtNum(ltvCac, locale, 1)}×` : NA;
  const payback = Math.round(d.paybackMonths * 10) / 10;

  const ledger = [
    { key: "gmv", label: t("kpi.gmv"), value: gmv ? money(gmv) : NA, note: gmv && gmvSame ? tr("notes.gmvEq") : tr("notes.gmv"), tag: gmvTag },
    { key: "mrr", label: t("mrr"), value: mrr ? money(mrr) : NA, note: mrrNote, tag: tagged(mrr) },
    { key: "arr", label: t("kpi.arr"), value: d.arr ? money(d.arr) : NA, note: arrNote, tag: tagged(d.arr) },
    { key: "arpu", label: t("kpi.arpu"), value: d.arpu ? money(d.arpu) : NA, note: tr("notes.arpu"), tag: tagged(d.arpu) },
    { key: "take", label: t("kpi.takeRate"), value: d.takeRate ? pct(d.takeRate) : NA, note: tr("notes.take"), tag: tagged(d.takeRate) },
    { key: "cac", label: t("kpi.cac"), value: d.cac ? money(d.cac) : NA, note: d.cac ? t("kpi.cacSplit", { client: money(d.cacClient), advocate: money(d.cacAdvocate) }) : tr("notes.cacNa") },
    { key: "ltv", label: t("kpi.ltv"), value: d.ltv ? money(d.ltv) : NA, note: tr("notes.ltv"), tag: tagged(d.ltv) },
    { key: "ltvCac", label: t("kpi.ltvCac"), value: ltvCacText, note: d.ltvCac ? tr("notes.ltvCac") : tr("notes.cacNa") },
    { key: "payback", label: tr("payback"), value: d.paybackMonths ? tr("months", { n: fmtNum(payback, locale, 1), count: payback }) : NA, note: d.paybackMonths ? tr("notes.payback") : tr("notes.cacNa") },
  ];

  const month = Number(d.fetchedAt.slice(5, 7));
  const monthWord = month >= 1 && month <= 12 ? monthNames(locale)[month - 1] : "";
  const aud = {
    mau: monthWord ? tr("aud.mau", { month: locale === "en" ? monthWord : monthWord.toLowerCase() }) : t("kpi.mau"),
    dau: tr("aud.dau"),
    newClients: tr("aud.newClients"),
    newAdvocates: tr("aud.newAdvocates"),
    newLawyers: tr("aud.newLawyers"),
  };
  const stickiness = d.mau ? pct((d.dau / d.mau) * 100, 0) : NA;
  const npsClient = d.npsClient ? num(d.npsClient) : NA;
  const npsAdvocate = d.npsAdvocate ? num(d.npsAdvocate) : NA;
  const g = d.giftKpis;
  const giftAvg = g.averageGiftValue ? short(g.averageGiftValue) : NA;
  const giftLtv = g.giftLtv ? short(g.giftLtv) : NA;
  const giftCac = g.giftCac ? short(g.giftCac) : NA;

  const channelSub = (c: Channel) =>
    [tr("chLeads", { n: num(c.leads), count: c.leads }), tr("chPayments", { n: num(c.payments), count: c.payments }), c.leads && c.pct <= 100 ? tr("chConv", { pct: pct(c.pct) }) : ""].filter(Boolean).join(" · ");
  const open = (drl: Omit<Drill, "demo">) => setDrill({ ...drl, demo });
  const kv = (title: string, rows: DrillRow[]): Drill["sections"][number] => ({ kind: "kv", title, rows });
  const channelBars = (): Drill["sections"][number] => {
    const list = d.channels.filter((c) => showTest || !isTestChannel(c.name));
    const ordered = GROUPS.flatMap((key) => list.filter((c) => sourceGroup(c.name) === key));
    const mixed = GROUPS.every((key) => list.some((c) => sourceGroup(c.name) === key));
    return {
      kind: "bars",
      title: t("channels"),
      rows: ordered.map((c): DrillRow => {
        const test = isTestChannel(c.name);
        const tag = test ? tr("testTag") : mixed && sourceGroup(c.name) === "payment" ? tr("paymentTag") : "";
        const name = sourceName(c.name);
        return { label: tag ? `${name} · ${tag}` : name, title: leadSourceInfo(te, c.name).title || undefined, value: money(c.revenue), short: short(c.revenue), n: c.revenue, sub: channelSub(c), tone: test ? "muted" : undefined };
      }),
    };
  };
  const funnelBars = (): Drill["sections"][number] => ({
    kind: "bars",
    title: t("funnel"),
    rows: d.funnel.map((x) => {
      const isPaid = x.label === "paid";
      const v = isPaid ? paid : x.value;
      return { label: isPaid && paidTag ? `${stage(x.label)} · ${paidTag}` : stage(x.label), value: num(v), n: v };
    }),
  });
  const unitEcon = () => kv(t("kpi.title"), ledger.filter((r) => r.key !== "payback").map((r) => row(r.label, r.value, r.key === "mrr" ? [mrrStub && mrr ? tr("bySubs") : "", r.tag ?? ""].filter(Boolean).join(" · ") || undefined : r.tag)));
  const drillRevenue = () => open({ title: t("revenue"), value: money(headRevenue), note: testLine || undefined, sections: [{ kind: "series", title: withTest ? `${t("revenueTrend")} · ${withTest}` : t("revenueTrend"), points: d.revenueTrend, format: money, controls: false }, channelBars()] });
  const drillUnit = () => open({ title: tr("unit"), sections: [unitEcon(), kv(td("drill.cac"), [row(td("drill.cacClient"), d.cacClient ? money(d.cacClient) : NA), row(td("drill.cacAdvocate"), d.cacAdvocate ? money(d.cacAdvocate) : NA)])] });
  const drillFunnel = () => open({ title: t("conversion"), value: pct(d.conversionPct), sections: [funnelBars(), channelBars()], link: { href: "/admin/pipeline", label: td("drill.goPipeline") } });
  const drillAudience = () => open({ title: t("users"), value: num(d.users), sections: [
    kv(t("kpi.title"), [row(aud.mau, num(d.mau), tr("aud.mauDef")), row(aud.dau, num(d.dau), tr("aud.dauDef")), row(tr("stickiness"), stickiness, tr("aud.stickDef"))]),
    kv(tr("aud.newcomers"), [row(aud.newClients, num(d.newClients)), row(aud.newAdvocates, num(d.newAdvocates)), row(aud.newLawyers, num(d.newLawyers))]),
    kv(td("drill.nps"), [row(t("kpi.npsClient"), npsClient, tr("aud.npsDef")), row(t("kpi.npsAdvocate"), npsAdvocate, tr("aud.npsDef"))]),
  ] });
  const drillGifts = () => open({ title: t("kpi.giftTitle"), value: num(g.giftPurchases), sections: [kv(td("drill.gifts"), [
    row(t("kpi.giftActivation"), pct(g.giftActivationRate)), row(t("kpi.giftToPaid"), pct(g.giftToPaidConversion)), row(t("kpi.avgGift"), g.averageGiftValue ? money(g.averageGiftValue) : NA),
    row(t("kpi.recipientConversion"), pct(g.recipientConversion)), row(t("kpi.giftReferralRate"), pct(g.referralRate)), row(t("kpi.giftCac"), g.giftCac ? money(g.giftCac) : NA), row(t("kpi.giftLtv"), g.giftLtv ? money(g.giftLtv) : NA),
  ])] });
  const more = (onClick: () => void, label: string) => (
    <button type="button" className="ceo-more" onClick={onClick} aria-label={`${td("drill.details")}: ${label}`}>
      {td("drill.details")}
      <IconArrowRight aria-hidden="true" />
    </button>
  );

  const trend = d.revenueTrend.slice(-span);
  const total = trend.reduce((s, p) => s + p.value, 0);
  const days = trend.length;
  const best = trend.reduce<{ label: string; value: number } | null>((m, p) => (!m || p.value > m.value ? p : m), null);
  const activeDays = trend.filter((p) => p.value > 0).length;
  const dayAvg = days ? short(total / days) : NA;
  const dayBest = best && best.value ? short(best.value) : NA;
  const spanSwitch = (
    <Segmented
      value={String(span)}
      onChange={(v) => setSpan(SPANS.find((n) => String(n) === v) ?? 14)}
      options={SPANS.map((n) => ({ value: String(n), label: tr("spanDays", { n }) }))}
      label={tr("spanAria")}
      look="soft"
      className="ceo-span"
      aiId="admin.ceo.revenue-span"
    />
  );

  const leads = d.funnel.find((x) => x.label === "leads")?.value ?? 0;
  const orders = d.funnel.find((x) => x.label === "orders")?.value ?? 0;
  const steps = [
    { key: "leads", value: leads },
    { key: "orders", value: orders },
  ];
  const stepMax = Math.max(1, leads, orders);

  const health = (key: string): Health => {
    if (key === "ltvCac") return !d.ltvCac ? "na" : ltvCac >= 3 ? "good" : ltvCac >= 1 ? "watch" : "bad";
    if (key === "cac" || key === "payback") return (key === "cac" ? d.cac : d.paybackMonths) ? "info" : "na";
    return "info";
  };

  const rows = d.channels.filter((c) => showTest || !isTestChannel(c.name)).slice().sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
  const groups = GROUPS.map((key) => ({ key, rows: rows.filter((c) => sourceGroup(c.name) === key) })).filter((grp) => grp.rows.length);
  const grouped = groups.some((grp) => grp.key === "payment");
  const rowsMax = Math.max(1, ...rows.map((c) => c.revenue));
  const shownRevenue = rows.reduce((s, c) => s + c.revenue, 0) || 1;
  const sortBy = (key: SortKey) => setSort((cur) => ({ key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : -1 }));
  const th = (key: SortKey, label: string) => {
    const on = sort.key === key;
    return (
      <th scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => sortBy(key)}>
          {label}
          <span className="ceo-sortic" aria-hidden="true">{on ? (sort.dir === 1 ? "▲" : "▼") : SORT_NONE}</span>
        </button>
      </th>
    );
  };

  const asOfDay = d.fetchedAt ? fmtDate(d.fetchedAt, locale) : "";
  const scopeAll = asOfDay ? tr("allTimeAsOf", { date: asOfDay }) : tr("allTime");
  const B = (chunks: ReactNode) => <b>{chunks}</b>;

  return (
    <div className="ceo">
      <div className="ceo-bar" data-ai-target="stats:filters" data-ai-label={tf("aria")}>
        <button type="button" role="switch" aria-checked={demoForced} className="ceo-demo" onClick={toggleDemo} title={tf("demoTitle")}>
          <IconBolt aria-hidden="true" />
          {tf("demo")}
          <i aria-hidden="true" />
        </button>
      </div>

      <article className={`ceo-sheet${loading ? "" : " is-ready"}`} aria-busy={loading}>
        {!first && (loading || demo) ? (
          <div className="ceo-pin">
            {loading ? <span className="ceo-pin__bar" aria-hidden="true" /> : null}
            {demo ? <span className="ceo-pin__demo">{tr("demoPill")}</span> : null}
          </div>
        ) : null}
        {first ? (
          <div className="ceo-skel" aria-hidden="true"><span /><span /><span /><span /></div>
        ) : failed ? (
          <ErrorState title={tr("failed")} error={fail?.error} onRetry={retry} />
        ) : (
          <>
            <header className="ceo-head" data-ai-target="ceo:kpis">
              <p className="ceo-head__lead">
                {tr.rich("summary", { revenue: short(headRevenue), payments: num(headPayments), count: headPayments, conv: pct(d.conversionPct), users: num(d.users), b: B })}
              </p>
              {testLine ? <p className="ceo-head__foot"><IconInfo aria-hidden="true" />{testLine}</p> : null}
              <p className="ceo-head__meta">
                {[t("title"), tr("allTime"), asOfDay ? tr("asOf", { date: asOfDay }) : ""].filter(Boolean).join("  ·  ")}
              </p>
              {demo ? <p className="ceo-head__demo"><IconInfo aria-hidden="true" />{demoForced ? td("demo.forced") : td("demo.banner")}</p> : null}
              {stale ? <p className="ceo-hint"><IconAlert aria-hidden="true" />{td("staleHint")}</p> : null}
            </header>

            <Section id="rev" ai="ceo:revenue-trend" title={t("revenueTrend")} scope={asOfDay ? tr("asOf", { date: asOfDay }) : undefined} tag={withTest} note={tr("revNote")} action={<>{spanSwitch}{more(drillRevenue, t("revenue"))}</>}>
              {trend.length ? <LineChart points={trend} format={money} controls={false} /> : <p className="ceo-empty">{t("noData")}</p>}
              <dl className="ceo-figs">
                <div><dt>{tr("figTotalDays", { n: days || span })}</dt><dd>{short(total)}</dd></div>
                <div><dt>{tr("figAvg")}</dt><dd className={na(dayAvg)}>{dayAvg}</dd></div>
                <div><dt>{tr("figBest")}</dt><dd className={na(dayBest)}>{dayBest}{best && best.value ? <small>{fmtDate(best.label.slice(0, 10), locale)}</small> : null}</dd></div>
                <div><dt>{tr("figActive")}</dt><dd>{tr("daysOf", { n: activeDays, total: days })}</dd></div>
              </dl>
            </Section>

            <Section id="unit" ai="ceo:kpi-system" title={tr("unit")} scope={scopeAll} note={tr("unitNote")} action={more(drillUnit, tr("unit"))}>
              <table className="ceo-ledger">
                <thead>
                  <tr>
                    <th scope="col">{tr("colMetric")}</th>
                    <th scope="col" className="is-num">{tr("colValue")}</th>
                    <th scope="col">{tr("colNote")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((line) => {
                    const h = health(line.key);
                    return (
                      <tr key={line.key} className={na(line.value)}>
                        <th scope="row">{line.label}</th>
                        <td className="is-num">{line.value}</td>
                        <td>
                          {h !== "info" && h !== "na" ? <span className={`ceo-chip ceo-chip--${h}`}>{tr(`health.${h}`)}</span> : null}
                          {line.tag ? <span className="ceo-chip ceo-chip--na">{line.tag}</span> : null}
                          <span className="ceo-ledger__note">{line.note}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>

            <Section id="funnel" ai="ceo:funnel" title={t("funnel")} scope={scopeAll} note={tr("funnelNote")} action={more(drillFunnel, t("funnel"))}>
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
              <p className="ceo-aside">
                {tr.rich("paidNote", { n: num(paid), b: B })}
                {paidTag ? <>{" "}<span className="ceo-chip ceo-chip--na">{paidTag}</span></> : null}
              </p>
            </Section>

            <Section
              id="channels"
              ai="ceo:channels"
              title={t("channelTable.title")}
              scope={scopeAll}
              note={split.count ? tr(showTest ? "testNoteShown" : "testNote", { n: split.count, amount: short(split.revenue) }) : tr("channelsNote")}
              action={
                split.count ? (
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
                    {groups.map((grp) => (
                      <tbody key={grp.key}>
                        {grouped ? (
                          <tr className="ceo-table__grp">
                            <th scope="rowgroup" colSpan={5}>
                              {tr(grp.key === "payment" ? "groupPayments" : "groupChannels")}
                              {grp.key === "payment" ? <small>{tr("groupPaymentsNote")}</small> : null}
                            </th>
                          </tr>
                        ) : null}
                        {grp.rows.map((c, i) => {
                          const src = leadSourceInfo(te, c.name);
                          const test = isTestChannel(c.name);
                          return (
                            <tr key={`${c.name}-${i}`} className={test ? "is-test" : undefined}>
                              <th scope="row" title={src.title || undefined}>{src.label || "—"}{test ? <em>{tr("testTag")}</em> : null}</th>
                              <td className="is-num">{num(c.leads)}</td>
                              <td className="is-num">{num(c.payments)}</td>
                              <td className="is-num ceo-table__rev">
                                <span>{short(c.revenue)}</span>
                                <i aria-hidden="true"><span style={{ width: `${(c.revenue / rowsMax) * 100}%` }} /></i>
                                <small>{pct((c.revenue / shownRevenue) * 100, 0)}</small>
                              </td>
                              <td className="is-num">{c.leads && c.pct <= 100 ? pct(c.pct) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    ))}
                  </table>
                </div>
              ) : (
                <p className="ceo-empty">{t("noData")}</p>
              )}
            </Section>

            <Section id="aud" ai="ceo:audience" title={tr("audience")} scope={scopeAll} note={tr("audienceNote")} action={more(drillAudience, tr("audience"))}>
              <div className="ceo-cols">
                <dl>
                  <div><dt>{t("users")}</dt><dd>{num(d.users)}</dd></div>
                  <div><dt>{aud.mau} <small className="ceo-def">{tr("aud.mauDef")}</small></dt><dd>{num(d.mau)}</dd></div>
                  <div><dt>{aud.dau} <small className="ceo-def">{tr("aud.dauDef")}</small></dt><dd>{num(d.dau)}</dd></div>
                  <div><dt>{tr("stickiness")} <small className="ceo-def">{tr("aud.stickDef")}</small></dt><dd className={na(stickiness)}>{stickiness}</dd></div>
                </dl>
                <dl>
                  <div><dt>{aud.newClients}</dt><dd>{num(d.newClients)}</dd></div>
                  <div><dt>{aud.newAdvocates}</dt><dd>{num(d.newAdvocates)}</dd></div>
                  <div><dt>{aud.newLawyers}</dt><dd>{num(d.newLawyers)}</dd></div>
                </dl>
                <div className="ceo-cols__grp">
                  <dl>
                    <div><dt>{t("kpi.npsClient")}</dt><dd className={na(npsClient)}>{npsClient}</dd></div>
                    <div><dt>{t("kpi.npsAdvocate")}</dt><dd className={na(npsAdvocate)}>{npsAdvocate}</dd></div>
                  </dl>
                  <p className="ceo-def">{tr("aud.npsDef")}</p>
                </div>
              </div>
            </Section>

            <Section id="gifts" ai="ceo:gift-kpis" title={t("kpi.giftTitle")} scope={scopeAll} note={tr("giftNote")} action={more(drillGifts, t("kpi.giftTitle"))}>
              <ol className="ceo-chain">
                <li><b>{num(g.giftPurchases)}</b><span>{t("kpi.giftPurchases")}</span></li>
                <li><b>{pct(g.giftActivationRate)}</b><span>{t("kpi.giftActivation")}</span></li>
                <li><b>{pct(g.giftToPaidConversion)}</b><span>{t("kpi.giftToPaid")}</span></li>
              </ol>
              <dl className="ceo-figs">
                <div><dt>{t("kpi.avgGift")}</dt><dd className={na(giftAvg)}>{giftAvg}</dd></div>
                <div><dt>{t("kpi.giftLtv")}</dt><dd className={na(giftLtv)}>{giftLtv}</dd></div>
                <div><dt>{t("kpi.giftReferralRate")}</dt><dd>{pct(g.referralRate)}</dd></div>
                <div><dt>{t("kpi.giftCac")}</dt><dd className={na(giftCac)}>{giftCac}</dd></div>
              </dl>
            </Section>
          </>
        )}
      </article>
      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
