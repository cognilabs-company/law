"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { sessionRoles, useAuth, type Session } from "@/lib/auth";
import { fmtDate, fmtInt, shortDateTime } from "@/lib/date";
import { listAdminPayouts, listRegisterRequests, seedDemoData } from "@/lib/services/backend";
import {
  getAdminDashboardFull,
  getCeoDashboardFull,
  getQualityFull,
  getDashboardDrilldown,
  isAdminDashboardEmpty,
  isCeoEmpty,
  isQualityEmpty,
  trimSeries,
  isFiltered,
  type AdminDashboardFull,
  type CeoDashboardFull,
  type DashFilter,
  type DrilldownMetric,
  type DashListItem,
  todayIso,
  type QualityFull,
} from "@/lib/services/dash";
import { demoAdminDashboard, demoCeo, demoQuality } from "@/lib/demoStats";
import { humanizeSlug } from "@/lib/lawyers";
import { leadSourceInfo, leadSourceLabel } from "@/lib/leadLabels";
import { ApiError, isDemoUnavailable } from "@/lib/http";
import { useResourceOne, type ResStatus } from "@/lib/useResource";
import { useDemoTools } from "@/lib/demoTools";
import { notify } from "@/lib/toast";
import { fmtUzs, fmtUzsShort } from "@/lib/money";
import LineChart from "@/components/admin/LineChart";
import Modal from "@/components/admin/Modal";
import StatDrillModal, { type Drill, type DrillSection, type DrillRow } from "@/components/admin/StatDrillModal";
import DashFilterBar, { useDashFilter } from "@/components/admin/DashFilterBar";
import { CountUp, Donut, Gauge, Legend, Meter, SegmentBar, type Slice, type Tone } from "@/components/admin/overview/viz";
import {
  IconAlert,
  IconArrowRight,
  IconBolt,
  IconChartBar,
  IconCircleCheck,
  IconClipboardList,
  IconCoins,
  IconFlag,
  IconHourglass,
  IconInfo,
  IconPackage,
  IconRefresh,
  IconShieldCheck,
  IconStar,
  IconTarget,
  IconTrendingUp,
  IconUserPlus,
  IconUsers,
} from "@/components/icons";
import { fmtRating } from "@/lib/date";
import { humanize } from "@/lib/labels";

// Grouped by lib/date.ts#fmtInt, which uses a space in uz/ru and a comma
// in en; the old toLocaleString("ru-RU") gave English a space too.
const fmt = (n: number, locale = "uz") => (Math.abs(n) >= 1000 ? fmtInt(n, locale) : String(Math.round(n)));
const DASH = "—";

const PERMS: Record<string, string> = {
  ceo: "",
  pipeline: "leads.manage",
  payouts: "payments.manage",
  registerRequests: "users.manage",
  services: "services.manage",
};

function can(key: string, session: Session | null): boolean {
  const roles = sessionRoles(session);
  if (roles.includes("superadmin") || roles.includes("admin")) return true;
  const permission = PERMS[key];
  return Boolean(permission && session?.permissions?.includes(permission));
}

function adminLinkFor(key: string, href: string, label: string, session: Session | null): { href: string; label: string } | undefined {
  return can(key, session) ? { href, label } : undefined;
}

// Order statuses folded into the five stages a manager reads at a glance;
// the drill-down keeps every raw status.
const ORDER_GROUPS: { key: string; tone: Tone; statuses: string[] }[] = [
  { key: "new", tone: "blue", statuses: ["new", "waiting_info", "waiting_docs", "seller_selection"] },
  { key: "pay", tone: "warn", statuses: ["pending_payment", "waiting_payment"] },
  { key: "work", tone: "violet", statuses: [] },
  { key: "done", tone: "ok", statuses: ["completed", "rated"] },
  { key: "lost", tone: "err", statuses: ["cancelled", "declined", "lost", "rejected", "refunded"] },
];
const groupOf = (status: string) => ORDER_GROUPS.find((g) => g.statuses.includes(status))?.key ?? "work";
const DONE_TASK = new Set(["done", "completed", "closed", "cancelled", "archived"]);
const TEST_CHANNEL = /(^|[_-])(demo|test|auto_test|fixture|qa|sandbox)([_-]|$)/i;

type PanelProps = { id: string; ai: string; Icon: typeof IconAlert; tone: Tone; title: string; action?: () => void; state: string; className?: string; text: { more: string; failed: string; retry: string }; onRetry: () => void; children: ReactNode };

function Panel({ id, ai, Icon, tone, title, action, state, className, text, onRetry, children }: PanelProps) {
  return (
    <section className={`aov-panel${className ? ` ${className}` : ""}`} aria-labelledby={`aov-${id}`} data-ai-id={`admin.dashboard.${ai}`} data-ai-type="section" data-ai-label={title}>
      <header className="aov-panel__h">
        <span className={`aov-ic aov-ic--${tone}`} aria-hidden="true"><Icon /></span>
        <h3 id={`aov-${id}`}>{title}</h3>
        {action && state === "ready" ? (
          <button type="button" className="aov-more" onClick={action} aria-label={`${text.more}: ${title}`} data-ai-id={`admin.dashboard.${ai}.details`}>
            {text.more}
            <IconArrowRight aria-hidden="true" />
          </button>
        ) : null}
      </header>
      {state === "loading" ? (
        <div className="aov-skel" aria-busy="true"><span /><span /><span /></div>
      ) : state === "error" ? (
        <div className="aov-err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{text.failed}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={onRetry}><IconRefresh />{text.retry}</button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

type Stamp<T> = { data: T; filter: DashFilter; at: string; today: string };
const stamp = <T,>(p: Promise<T>, filter: DashFilter): Promise<Stamp<T>> => p.then((data) => ({ data, filter, at: new Date().toISOString(), today: todayIso() }));

type Fail = { ok: false; error: unknown };
type Got<T> = { ok: true; data: T } | Fail;
const settle = <T,>(p: Promise<T>): Promise<Got<T>> => p.then((data): Got<T> => ({ ok: true, data }), (error: unknown): Got<T> => ({ ok: false, error }));
const STALE_ID = "aov-stale";

function useKeptOne<T>(fetcher: () => Promise<T>, deps: unknown[], scope?: unknown): { status: ResStatus; data: T | null; stale: Fail | null } {
  const res = useResourceOne(() => settle(fetcher()), deps);
  const [kept, setKept] = useState<{ data: T; scope: unknown } | null>(null);
  const got = res.data;
  if (got?.ok && kept?.data !== got.data) setKept({ data: got.data, scope });
  const prev = kept && kept.scope === scope ? kept : null;
  if (res.status === "loading") return { status: "loading", data: null, stale: null };
  if (got?.ok) return { status: "ready", data: got.data, stale: null };
  return prev && got ? { status: "ready", data: prev.data, stale: got } : { status: "error", data: null, stale: null };
}

// Admin overview: what needs attention first, then revenue, people, the
// order pipeline, quality, channels and the latest activity. Every panel
// opens the drill-down behind its numbers; demo data stays labelled.
export default function AdminOverview() {
  const tcm = useTranslations("common");
  const t = useTranslations("admin.overview");
  const tb = useTranslations("admin.overview.board");
  const tc = useTranslations("admin.overview.crm");
  const tn = useTranslations("admin");
  const td = useTranslations("admin.dash");
  const te = useTranslations("enums.regions");
  const tsrc = useTranslations("enums");
  const tnf = useTranslations("common.notify");
  const locale = useLocale();
  const { session } = useAuth();
  const { filter, setFilter, demoForced, setDemoForced } = useDashFilter();
  const [tick, setTick] = useState(0);
  const fkey = `${filter.region}|${filter.from}|${filter.to}|${tick}`;
  const ceo = useKeptOne(() => stamp(getCeoDashboardFull(filter), filter), [fkey]);
  const qual = useKeptOne(() => stamp(getQualityFull(filter), filter), [fkey]);
  const dash = useKeptOne(() => stamp(getAdminDashboardFull(filter), filter), [fkey]);
  const seeRegs = can("registerRequests", session);
  const seePayouts = can("payouts", session);
  const regs = useKeptOne(() => (seeRegs ? listRegisterRequests("pending") : Promise.resolve([])), [seeRegs, tick], seeRegs);
  const payouts = useKeptOne(() => (seePayouts ? listAdminPayouts() : Promise.resolve([])), [seePayouts, tick], seePayouts);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [tab, setTab] = useState<"tasks" | "reviews" | "b2b">("tasks");
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedAsk, setSeedAsk] = useState(false);
  const demoTools = useDemoTools();

  async function seed() {
    if (seedBusy) return;
    setSeedBusy(true);
    notify.dismiss("aov-seed");
    try {
      const r = await seedDemoData();
      notify.success(t("seedDone"), { id: "aov-seed", body: [r.removed > 0 ? t("seedRemoved", { n: r.removed }) : "", t("seedRerun")].filter(Boolean).join(" ") });
    } catch (e) {
      if (isDemoUnavailable(e)) notify.warning(t("seedUnavailable"), { id: "aov-seed" });
      else notify.error(t("seedFailed"), { id: "aov-seed", error: e, action: !(e instanceof ApiError) || e.status === 0 || (e.status >= 500 && e.status !== 501) ? { label: tnf("retry"), onClick: () => void seed() } : undefined });
    } finally {
      setSeedBusy(false);
    }
  }

  // Demo fallback: forced by the toggle, or when every real number is zero.
  const loaded = ceo.status !== "loading" && qual.status !== "loading" && dash.status !== "loading";
  const allEmpty = loaded && (!dash.data || isAdminDashboardEmpty(dash.data.data)) && (!ceo.data || isCeoEmpty(ceo.data.data)) && (!qual.data || isQualityEmpty(qual.data.data));
  const demo = demoForced || allEmpty;
  const view = useMemo(() => {
    const today = dash.data?.today ?? ceo.data?.today ?? todayIso();
    if (!demo) return { d: dash.data?.data ?? null, c: ceo.data?.data ?? null, q: qual.data?.data ?? null, today };
    return { d: demoAdminDashboard(today) as AdminDashboardFull, c: demoCeo(today) as CeoDashboardFull, q: demoQuality(today) as QualityFull, today };
  }, [demo, dash.data, ceo.data, qual.data]);
  const { d, c, q, today } = view;
  const asOf = dash.data?.at ?? ceo.data?.at ?? "";
  const stateOf = (r: { status: string }) => (demo ? "ready" : r.status);
  const retry = () => setTick((n) => n + 1);
  const stale = ceo.stale ?? qual.stale ?? dash.stale ?? regs.stale ?? payouts.stale;
  const fresh = [ceo, qual, dash, regs, payouts].every((r) => r.status === "ready" && !r.stale);
  const raised = useRef(new WeakSet<Fail>());

  useEffect(() => {
    if (stale && !demoForced) {
      if (!raised.current.has(stale)) notify.error(td("notUpdated"), { id: STALE_ID, error: stale.error, action: { label: tnf("retry"), onClick: () => setTick((n) => n + 1) } });
      for (const f of [ceo.stale, qual.stale, dash.stale, regs.stale, payouts.stale]) if (f) raised.current.add(f);
    } else if (fresh) notify.dismiss(STALE_ID);
  }, [stale, fresh, demoForced, td, tnf, ceo.stale, qual.stale, dash.stale, regs.stale, payouts.stale]);
  useEffect(() => () => notify.dismiss(STALE_ID), []);

  const som = tc("som");
  const money = (n?: number) => (n ? `${fmtUzs(n)} ${som}` : DASH);
  const units = { mln: td("units.mln"), mlrd: td("units.mlrd") };
  const short = (n: number) => fmtUzsShort(n, units, locale);
  const moneyShort = (n?: number) => (n ? `${short(n)} ${som}` : DASH);
  const pct = (n?: number) => (n || n === 0 ? `${Math.round(n)}%` : DASH);
  const num = (n: number) => fmt(n, locale);
  const funnel = c?.funnel ?? [];
  const trend = trimSeries(c?.revenueTrend ?? [], !demo && ceo.data ? ceo.data.filter : filter);
  const stat = (k: string) => d?.totals.find((x) => x.label === k)?.value;
  const total = (k: string) => Number(d?.groups.totals[k] ?? stat(k) ?? 0);
  const chart = (k: string) => (d?.charts.find((x) => x.key === k)?.points ?? []).filter((x) => x.label);
  const byStatus = chart("orders_by_status").sort((a, b) => b.value - a.value);
  const byScore = chart("leads_by_score").sort((a, b) => b.value - a.value);
  const byRole = chart("sellers_by_role");
  const byRegionAll = chart("leads_by_region");
  const byRegion = filter.region ? byRegionAll.filter((x) => x.label === filter.region) : byRegionAll;
  const label = (group: string, k: string) => (tc.has(`${group}.${k}`) ? tc(`${group}.${k}`) : humanizeSlug(k));
  const regionName = (k: string) => (te.has(k) ? te(k) : humanizeSlug(k));

  // Drill-down builders — everything comes from the payloads already loaded,
  // except `withDetail`, which appends the real record list from the 2026-09-19
  // GET /admin/dashboard/drilldown endpoint (metric/region/date_from/date_to/limit).
  const open = (drl: Drill) => setDrill({ ...drl, demo });
  const drillRow = (x: DashListItem): DrillRow => ({
    label: x.title || x.meta || x.id,
    value: x.amount ? money(x.amount) : x.status ? label("status", x.status) : "",
    sub: [x.title && x.meta ? x.meta : "", x.date ? fmtDate(x.date.slice(0, 10), locale) : ""].filter(Boolean).join(" · "),
  });
  // A token so a slower, earlier fetch (a fast second click, or switching
  // panels) never clobbers the modal with stale rows once it resolves.
  const drillToken = useRef(0);
  function withDetail(metric: DrilldownMetric, drl: Drill) {
    const mine = ++drillToken.current;
    const detail: DrillSection = { kind: "list", title: td("drill.details"), rows: [], empty: td("drill.loading") };
    open({ ...drl, sections: [...drl.sections, detail] });
    getDashboardDrilldown(metric, filter)
      .then((rows) => {
        if (drillToken.current !== mine) return;
        setDrill((cur) => (cur ? { ...cur, sections: cur.sections.map((s, i) => (i === cur.sections.length - 1 ? { ...s, rows: rows.map(drillRow) } : s)) } : cur));
      })
      .catch(() => {
        if (drillToken.current !== mine) return;
        setDrill((cur) => (cur ? { ...cur, sections: cur.sections.map((s, i) => (i === cur.sections.length - 1 ? { ...s, empty: td("drill.backendWait") } : s)) } : cur));
      });
  }
  const channels = c?.channels ?? [];
  const drillRevenue = () => open({
    title: tc("revenue"), value: money(c?.revenue), sub: c?.revenueDeltaPct ? `${c.revenueDeltaPct > 0 ? tb("up") : tb("down")} ${Math.abs(c.revenueDeltaPct)}%` : undefined,
    sections: [
      { kind: "series", title: td("drill.trend"), points: trend, format: (v) => `${fmtUzs(v)} ${som}` },
      { kind: "kv", title: td("drill.payments"), rows: [
        { label: td("drill.paid"), value: money(stat("paid_amount")), n: stat("paid_amount") },
        { label: td("drill.pending"), value: money(stat("pending_amount")), n: stat("pending_amount") },
        { label: td("drill.paidCount"), value: num(stat("paid_count") ?? 0) },
        { label: td("drill.pendingCount"), value: num(stat("pending_count") ?? 0) },
      ] },
      { kind: "bars", title: td("drill.channels"), rows: channels.map((ch) => ({ label: TEST_CHANNEL.test(ch.name) ? `${leadSourceLabel(tsrc, ch.name)} · ${tb("testTag")}` : leadSourceLabel(tsrc, ch.name), title: leadSourceInfo(tsrc, ch.name).title || undefined, value: money(ch.revenue), short: `${short(ch.revenue)} ${som}`, n: ch.revenue, tone: TEST_CHANNEL.test(ch.name) ? "muted" : undefined })) },
    ],
    link: adminLinkFor("ceo", "/admin/ceo", td("drill.goCeo"), session),
  });
  const drillMoney = () => open({
    title: tc("monetization"), note: td("drill.mrrNote"),
    sections: [{ kind: "kv", rows: [
      { label: td("drill.mrr"), value: money(c?.mrr) }, { label: td("drill.arr"), value: money(c?.arr) }, { label: td("drill.arpu"), value: money(c?.arpu) }, { label: td("drill.gmv"), value: money(c?.gmv) },
      { label: td("drill.takeRate"), value: pct(c?.takeRate) }, { label: td("drill.ltv"), value: money(c?.ltv) }, { label: td("drill.cac"), value: money(c?.cac) },
    ] }],
    link: adminLinkFor("ceo", "/admin/ceo", td("drill.goCeo"), session),
  });
  const drillUsers = () => withDetail("users", {
    title: tc("users"), value: c ? num(c.users) : DASH, sub: c ? `${td("drill.activeUsers")}: ${num(c.activeUsers)}` : undefined,
    sections: [
      { kind: "kv", title: td("drill.newUsers"), rows: [
        { label: td("drill.newClients"), value: num(c?.newClients ?? 0) }, { label: td("drill.newAdvocates"), value: num(c?.newAdvocates ?? 0) }, { label: td("drill.newLawyers"), value: num(c?.newLawyers ?? 0) },
      ] },
      { kind: "bars", title: td("drill.byRole"), rows: byRole.map((x) => ({ label: td.has(`role.${x.label}`) ? td(`role.${x.label}`) : humanizeSlug(x.label), value: num(x.value), n: x.value })) },
      { kind: "bars", title: td("drill.byRegion"), rows: byRegion.map((x) => ({ label: regionName(x.label), value: num(x.value), n: x.value })), empty: td("drill.regionUnknown") },
    ],
  });
  const drillConversion = () => open({
    title: tc("conversion"), value: pct(c?.conversionPct),
    sections: [
      { kind: "bars", title: td("drill.funnel"), rows: funnel.map((f2) => ({ label: label("stage", f2.label), value: num(f2.value), n: f2.value })) },
      { kind: "bars", title: td("drill.byScore"), rows: byScore.map((x) => ({ label: label("score", x.label), value: num(x.value), n: x.value })) },
    ],
    link: adminLinkFor("pipeline", "/admin/crm/leads?tab=all&view=board", td("drill.goPipeline"), session),
  });
  const drillQuality = () => open({
    title: tc("quality"), value: q?.avgRating ? fmtRating(q.avgRating, locale) : DASH, note: td("drill.constNote"),
    sections: [
      { kind: "kv", rows: [{ label: td("drill.complaints"), value: pct(q?.complaintRate) }, { label: td("drill.resolved"), value: pct(q?.resolvedPct) }, { label: td("drill.sla"), value: pct(q?.responseSlaPct) }] },
      { kind: "list", title: td("drill.flagged"), rows: (q?.flagged ?? []).map((f2) => ({ label: f2.title, value: t.has(`severity.${f2.severity}`) ? t(`severity.${f2.severity}`) : humanize(f2.severity), sub: f2.detail, tone: f2.severity === "high" ? "bad" : "muted" })), empty: tb("noFlags") },
    ],
  });
  const drillPayments = (k: "paid" | "pending") => withDetail("payments", {
    title: k === "paid" ? tc("paidAmount") : tc("pendingAmount"), value: money(stat(`${k}_amount`)), sub: `${num(stat(`${k}_count`) ?? 0)} ${td("drill.payments").toLowerCase()}`,
    sections: [{ kind: "series", title: td("drill.trend"), points: trend, format: (v) => `${fmtUzs(v)} ${som}` }],
  });
  const drillLeads = () => withDetail("leads", {
    title: td("drill.leads"), value: num(stat("leads") ?? byScore.reduce((s, x) => s + x.value, 0)),
    sections: [
      { kind: "bars", title: td("drill.byScore"), rows: byScore.map((x) => ({ label: label("score", x.label), value: num(x.value), n: x.value })) },
      { kind: "bars", title: td("drill.byRegion"), rows: byRegion.map((x) => ({ label: regionName(x.label), value: num(x.value), n: x.value })), empty: td("drill.regionUnknown") },
    ],
    link: adminLinkFor("pipeline", "/admin/crm/leads?tab=all&view=board", td("drill.goLeads"), session),
  });
  const drillOrders = () => withDetail("orders", {
    title: tc("ordersByStatus"), value: num(byStatus.reduce((s, x) => s + x.value, 0)),
    sections: [{ kind: "bars", title: td("drill.byStatus"), rows: byStatus.map((x) => ({ label: label("status", x.label), value: num(x.value), n: x.value })) }],
  });
  const tasks = d?.lists.tasks ?? [];
  const overdue = tasks.filter((x) => x.due && x.due.slice(0, 10) < today && !DONE_TASK.has(x.status));
  const drillTasks = (onlyLate = false) => open({
    title: onlyLate ? tb("attn.tasks") : t("metrics.tasks"), value: num(onlyLate ? overdue.length : tasks.length),
    sections: [{ kind: "list", rows: (onlyLate ? overdue : [...overdue, ...tasks.filter((x) => !overdue.includes(x))]).map((x) => ({ ...drillRow(x), tone: overdue.includes(x) ? "bad" : undefined, sub: [x.due ? `${tb("due")}: ${fmtDate(x.due.slice(0, 10), locale)}` : "", drillRow(x).sub].filter(Boolean).join(" · ") })) }],
  });
  const drillB2b = () => open({
    title: t("metrics.b2b_clients"), value: num(d?.lists.b2bClients.length ?? 0),
    sections: [{ kind: "list", rows: (d?.lists.b2bClients ?? []).map(drillRow) }],
  });
  const drillReviews = () => open({
    title: t("metrics.reviews"), value: num(d?.lists.reviews.length ?? 0),
    sections: [{ kind: "list", rows: (d?.lists.reviews ?? []).map(drillRow) }],
  });
  const drillCases = () => withDetail("cases", { title: t("metrics.cases"), value: num(total("cases")), sections: [] });

  // ── Attention rail ─────────────────────────────────────────────
  const pendingCount = stat("pending_count") ?? 0;
  const unpaid = (payouts.data ?? []).filter((p) => p.status !== "paid");
  const flags = q?.flagged.length ?? 0;
  type Attn = { key: string; Icon: typeof IconAlert; tone: Tone; n: number | null; title: string; sub: string; href?: string; show?: (n: number) => string };
  const attention: Attn[] = [
    { key: "payments", Icon: IconHourglass, tone: "warn", n: stateOf(dash) === "ready" ? pendingCount : null, title: tb("attn.payments"), sub: moneyShort(stat("pending_amount")) },
    ...(seeRegs ? [{ key: "sellers", Icon: IconUserPlus, tone: "violet" as Tone, n: regs.status === "ready" ? regs.data?.length ?? 0 : null, title: tb("attn.sellers"), sub: tb("attn.sellersSub"), href: "/admin/register-requests" }] : []),
    ...(seePayouts ? [{ key: "payouts", Icon: IconCoins, tone: "blue" as Tone, n: payouts.status === "ready" ? unpaid.length : null, title: tb("attn.payouts"), sub: moneyShort(unpaid.reduce((s, p) => s + p.sellerShare, 0)), href: "/admin/payouts" }] : []),
    { key: "tasks", Icon: IconClipboardList, tone: "err", n: stateOf(dash) === "ready" ? overdue.length : null, title: tb("attn.tasks"), sub: tb("attn.tasksSub", { n: num(tasks.filter((x) => !DONE_TASK.has(x.status)).length) }) },
    { key: "quality", Icon: IconFlag, tone: "err", n: stateOf(qual) === "ready" ? Math.round(q?.complaintRate ?? 0) + flags : null, show: () => pct(q?.complaintRate), title: tb("attn.quality"), sub: tb("attn.qualitySub", { n: num(flags), resolved: pct(q?.resolvedPct) }) },
  ];
  const failed = (r: { status: string }) => !demo && r.status === "error";
  const openAttn = (key: string) => {
    if (key === "payments") drillPayments("pending");
    else if (key === "tasks") drillTasks(true);
    else if (key === "quality") drillQuality();
  };

  // ── Panel data ─────────────────────────────────────────────────
  const people: Slice[] = [
    { key: "clients", label: td("drill.clients"), value: total("clients"), tone: "blue" },
    { key: "advokats", label: tb("people.advokats"), value: total("advokats"), tone: "violet" },
    { key: "yurists", label: tb("people.yurists"), value: total("yurists"), tone: "cyan" },
    { key: "organizations", label: td("drill.organizations"), value: total("organizations"), tone: "warn" },
  ];
  const usersTotal = c?.users || total("users");
  const otherUsers = usersTotal - people.reduce((s, x) => s + x.value, 0);
  if (otherUsers > 0) people.push({ key: "other", label: tb("people.other"), value: otherUsers, tone: "mute" });
  const stick = c && c.mau ? Math.round((c.dau / c.mau) * 100) : 0;

  const leadsN = funnel.find((x) => x.label === "leads")?.value ?? stat("leads") ?? 0;
  const ordersN = funnel.find((x) => x.label === "orders")?.value ?? stat("orders") ?? 0;
  const paidN = funnel.find((x) => x.label === "paid")?.value ?? stat("paid_count") ?? 0;
  const SCORE_TONE: Record<string, Tone> = { hot: "warn", warm: "cyan", cold: "mute" };
  const temps: Slice[] = ["hot", "warm", "cold"].map((k) => ({ key: k, label: label("score", k), value: byScore.find((x) => x.label === k)?.value ?? 0, tone: SCORE_TONE[k] }));

  const orderGroups: Slice[] = ORDER_GROUPS.map((g) => ({ key: g.key, label: tb(`orders.${g.key}`), value: byStatus.filter((x) => groupOf(x.label) === g.key).reduce((s, x) => s + x.value, 0), tone: g.tone }));
  const ordersTotal = orderGroups.reduce((s, x) => s + x.value, 0);

  const paidAmt = stat("paid_amount") ?? 0;
  const pendAmt = stat("pending_amount") ?? 0;
  const flow: Slice[] = [
    { key: "paid", label: td("drill.paid"), value: paidAmt, tone: "ok" },
    { key: "pending", label: td("drill.pending"), value: pendAmt, tone: "warn" },
  ];
  const realChannels = channels.filter((ch) => !TEST_CHANNEL.test(ch.name) && ch.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const testChannels = channels.filter((ch) => TEST_CHANNEL.test(ch.name));
  const realSum = realChannels.reduce((s, ch) => s + ch.revenue, 0) || 1;
  const testSum = testChannels.reduce((s, ch) => s + ch.revenue, 0);
  const facts = [
    { key: "arr", label: td("drill.arr"), value: moneyShort(c?.arr), show: Boolean(c?.arr) },
    { key: "arpu", label: td("drill.arpu"), value: moneyShort(c?.arpu), show: Boolean(c?.arpu) },
    { key: "take", label: td("drill.takeRate"), value: pct(c?.takeRate), show: Boolean(c?.takeRate) },
    { key: "mrr", label: td("drill.mrr"), value: moneyShort(c?.mrr), show: Boolean(c?.mrr && c.mrr !== c.revenue) },
    { key: "gmv", label: td("drill.gmv"), value: moneyShort(c?.gmv), show: Boolean(c?.gmv && c.gmv !== c.revenue) },
    { key: "ltv", label: td("drill.ltv"), value: moneyShort(c?.ltv), show: Boolean(c?.ltv) },
  ].filter((x) => x.show).slice(0, 4);

  const activity = {
    tasks: { rows: [...overdue, ...tasks.filter((x) => !overdue.includes(x))], drill: () => drillTasks(), n: tasks.length },
    reviews: { rows: d?.lists.reviews ?? [], drill: drillReviews, n: d?.lists.reviews.length ?? 0 },
    b2b: { rows: d?.lists.b2bClients ?? [], drill: drillB2b, n: d?.lists.b2bClients.length ?? 0 },
  };
  const tabs: { key: "tasks" | "reviews" | "b2b"; label: string }[] = [
    { key: "tasks", label: td("drill.tasks") },
    { key: "reviews", label: td("drill.reviews") },
    { key: "b2b", label: td("drill.b2b") },
  ];

  const panelText = { more: td("drill.details"), failed: tb("failed"), retry: tb("retry") };

  return (
    <div className="aov">
      <div className="aov-top">
        <div className="aov-top__t">
          <h2>{t("hi", { name: session?.name ?? "" })}</h2>
          <p>{tc("sub")}</p>
        </div>
        <div className="aov-top__meta">
          {asOf ? <span className="aov-asof">{tb("asOf", { time: shortDateTime(asOf, locale) })}</span> : null}
          <button type="button" className="btn btn--line btn--sm" onClick={retry} disabled={!loaded} data-ai-id="admin.dashboard.refresh">
            <IconRefresh />
            {tb("refresh")}
          </button>
          {demoTools ? (
            <button className="btn btn--line btn--sm" type="button" onClick={() => setSeedAsk(true)} disabled={seedBusy}>
              <IconBolt />
              {seedBusy ? t("seeding") : t("seed")}
            </button>
          ) : null}
        </div>
        {stale && !demo ? <p className="aov-top__msg">{td("staleHint")}</p> : null}
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

      <DashFilterBar value={filter} onChange={setFilter} demoForced={demoForced} onDemoForced={(on) => { setDemoForced(on); notify.info(td(on ? "demo.enabled" : "demo.disabled"), { id: "aov-demo" }); }} note={isFiltered(filter) ? td("filter.regionNote") : undefined} />
      {demo && loaded ? (
        <p className="bhnote" role="status"><IconInfo />{demoForced ? td("demo.forced") : td("demo.banner")}</p>
      ) : null}

      <section className="aov-attn" aria-labelledby="aov-attn" data-ai-target="overview:kpis" data-ai-id="admin.dashboard.kpis" data-ai-type="section" data-ai-label={tb("attention")}>
        <h3 id="aov-attn" className="aov-attn__h">{tb("attention")}</h3>
        <ul className="aov-attn__list">
          {attention.map((a) => {
            const calm = a.n === 0;
            const body = (
              <>
                <span className={`aov-ic aov-ic--${calm ? "ok" : a.tone}`} aria-hidden="true">{calm ? <IconCircleCheck /> : <a.Icon />}</span>
                <span className="aov-attn__n">{a.n === null ? (failed(a.key === "sellers" ? regs : a.key === "payouts" ? payouts : a.key === "quality" ? qual : dash) ? DASH : <i className="aov-attn__wait" />) : a.show ? a.show(a.n) : <CountUp value={a.n} format={num} />}</span>
                <span className="aov-attn__t">{a.title}</span>
                {a.n === null ? null : <small>{calm ? tb("attn.clear") : a.sub}</small>}
                <IconArrowRight className="aov-attn__go" aria-hidden="true" />
              </>
            );
            return (
              <li key={a.key} className={calm ? "is-calm" : `is-${a.tone}`}>
                {a.href ? (
                  <Link href={a.href} className="aov-attn__item" data-ai-id={`admin.dashboard.attention.${a.key}`}>{body}</Link>
                ) : (
                  <button type="button" className="aov-attn__item" onClick={() => openAttn(a.key)} disabled={a.n === null} data-ai-id={`admin.dashboard.attention.${a.key}`}>{body}</button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="aov-grid aov-grid--hero" data-ai-target="overview:charts">
        <Panel text={panelText} onRetry={retry} id="revenue" ai="revenue" Icon={IconTrendingUp} tone="blue" title={tc("revenue")} action={drillRevenue} state={stateOf(ceo)} className="aov-rev">
          <div className="aov-rev__head">
            <b className="aov-big"><CountUp value={c?.revenue ?? 0} format={(n) => (n ? `${short(n)} ${som}` : `0 ${som}`)} /></b>
            {c?.revenueDeltaPct ? (
              <span className={`aov-delta ${c.revenueDeltaPct > 0 ? "is-up" : "is-down"}`}>
                <IconTrendingUp aria-hidden="true" />
                {c.revenueDeltaPct > 0 ? tb("up") : tb("down")} {Math.abs(c.revenueDeltaPct)}%
                <small>{tb("vsPrev")}</small>
              </span>
            ) : null}
          </div>
          {testSum > 0 ? <p className="aov-note">{tb("inclTest", { amount: moneyShort(testSum) })}</p> : null}
          <div className="aov-rev__chart">
            {trend.length ? <LineChart points={trend} format={(v) => `${fmtUzs(v)} ${som}`} controls={false} /> : <p className="aov-empty">{t("empty")}</p>}
          </div>
          {paidAmt + pendAmt > 0 ? (
            <div className="aov-flow">
              <div className="aov-flow__h">
                <span>{tb("flow")}</span>
                <button type="button" onClick={() => drillPayments("pending")}>{tb("flowPending", { amount: moneyShort(pendAmt) })}</button>
              </div>
              <SegmentBar slices={flow} label={tb("flow")} />
              <Legend slices={flow} format={(n) => moneyShort(n)} onPick={(k) => drillPayments(k as "paid" | "pending")} />
            </div>
          ) : null}
          {facts.length ? (
            <dl className="aov-facts">
              {facts.map((f2) => (
                <div key={f2.key}>
                  <dt>{f2.label}</dt>
                  <dd>{f2.value}</dd>
                </div>
              ))}
              <button type="button" className="aov-facts__more" onClick={drillMoney}>{tc("monetization")}<IconArrowRight aria-hidden="true" /></button>
            </dl>
          ) : null}
        </Panel>

        <Panel text={panelText} onRetry={retry} id="users" ai="users" Icon={IconUsers} tone="violet" title={tc("users")} action={drillUsers} state={stateOf(dash)}>
          <div className="aov-people">
            <Donut slices={people} center={<CountUp value={usersTotal} format={num} />} sub={tb("people.total")} label={people.map((p) => `${p.label}: ${num(p.value)}`).join(", ")} />
            <Legend slices={people} format={num} />
          </div>
          {c && c.mau ? (
            <div className="aov-stick">
              <div className="aov-stick__h">
                <span>{tb("stickiness")}</span>
                <b>{stick}%</b>
              </div>
              <Meter pct={stick} tone="violet" />
              <small>{tb("dauMau", { dau: num(c.dau), mau: num(c.mau) })}</small>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="aov-grid aov-grid--3" data-ai-id="admin.dashboard.payments" data-ai-label={tc("payments")}>
        <Panel text={panelText} onRetry={retry} id="conv" ai="conversion" Icon={IconTarget} tone="cyan" title={tc("conversion")} action={drillConversion} state={stateOf(ceo)}>
          <div className="aov-conv">
            <div className="aov-conv__stage">
              <b><CountUp value={leadsN} format={num} /></b>
              <span>{label("stage", "leads")}</span>
            </div>
            <div className="aov-conv__arrow" role="img" aria-label={tb("convLabel", { pct: pct(c?.conversionPct) })}>
              <span>{pct(c?.conversionPct)}</span>
              <IconArrowRight aria-hidden="true" />
            </div>
            <div className="aov-conv__stage">
              <b><CountUp value={ordersN} format={num} /></b>
              <span>{label("stage", "orders")}</span>
            </div>
          </div>
          <p className="aov-note">{tb("paidPayments", { n: num(paidN) })}</p>
          {temps.some((x) => x.value) ? (
            <div className="aov-sub">
              <div className="aov-sub__h">
                <span>{tb("leadTemp")}</span>
                <button type="button" onClick={drillLeads}>{tb("allLeads")}</button>
              </div>
              <SegmentBar slices={temps} label={tb("leadTemp")} />
              <Legend slices={temps} format={num} />
            </div>
          ) : null}
        </Panel>

        <Panel text={panelText} onRetry={retry} id="orders" ai="orders" Icon={IconPackage} tone="warn" title={tc("ordersByStatus")} action={drillOrders} state={stateOf(dash)}>
          {ordersTotal ? (
            <>
              <div className="aov-orders__head">
                <b className="aov-mid"><CountUp value={ordersTotal} format={num} /></b>
                <span>{tb("ordersTotal")}</span>
              </div>
              <SegmentBar slices={orderGroups} label={tc("ordersByStatus")} />
              <Legend slices={orderGroups} format={num} />
            </>
          ) : (
            <p className="aov-empty">{t("empty")}</p>
          )}
          <div className="aov-chips">
            <button type="button" onClick={drillCases}>
              {t("metrics.cases")} <b>{num(total("cases"))}</b>
            </button>
            {can("services", session) ? (
              <Link href="/admin/services">
                {tb("services")} <b>{num(total("services"))}</b>
              </Link>
            ) : (
              <span>
                {tb("services")} <b>{num(total("services"))}</b>
              </span>
            )}
          </div>
        </Panel>

        <Panel text={panelText} onRetry={retry} id="quality" ai="quality" Icon={IconShieldCheck} tone="ok" title={tc("quality")} action={drillQuality} state={stateOf(qual)}>
          <div className="aov-gauges">
            <Gauge pct={((q?.avgRating ?? 0) / 5) * 100} tone="ok" value={q?.avgRating ? fmtRating(q.avgRating, locale) : DASH} label={tc("rating")} note={tb("of5")} />
            <Gauge pct={q?.responseSlaPct ?? 0} tone="blue" value={pct(q?.responseSlaPct)} label={tc("sla")} />
            <Gauge pct={q?.complaintRate ?? 0} tone="err" value={pct(q?.complaintRate)} label={tc("complaints")} note={tb("lowerBetter")} />
          </div>
          <p className="aov-note">
            {tc("resolved")}: <b>{pct(q?.resolvedPct)}</b> · {tb("flags", { n: num(flags) })}
          </p>
        </Panel>
      </div>

      <div className="aov-grid aov-grid--2">
        <Panel text={panelText} onRetry={retry} id="channels" ai="channels" Icon={IconChartBar} tone="blue" title={tb("channels")} action={drillRevenue} state={stateOf(ceo)}>
          {realChannels.length ? (
            <ol className="aov-rank">
              {realChannels.slice(0, 5).map((ch) => (
                <li key={ch.name}>
                  <span className="aov-rank__n" title={leadSourceInfo(tsrc, ch.name).title || undefined}>{leadSourceLabel(tsrc, ch.name)}</span>
                  <b>{moneyShort(ch.revenue)}</b>
                  <Meter pct={(ch.revenue / realSum) * 100} tone="blue" />
                  <small>{tb("channelSub", { leads: ch.leads, payments: ch.payments, share: Math.round((ch.revenue / realSum) * 100) })}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="aov-empty">{tb("noChannels")}</p>
          )}
          {testChannels.length ? (
            <p className="aov-test">
              <IconInfo aria-hidden="true" />
              {tb("testChannels", { n: testChannels.length, amount: moneyShort(testSum) })}
            </p>
          ) : null}
        </Panel>

        <Panel text={panelText} onRetry={retry} id="activity" ai="activity" Icon={IconClipboardList} tone="violet" title={tb("activity")} action={activity[tab].drill} state={stateOf(dash)} className="aov-act">
          <div className="aov-tabs" role="tablist" aria-label={tb("activity")} data-ai-target="overview:activity">
            {tabs.map((x) => (
              <button key={x.key} type="button" role="tab" id={`aov-tab-${x.key}`} aria-selected={tab === x.key} aria-controls="aov-tabpanel" tabIndex={tab === x.key ? 0 : -1} onClick={() => setTab(x.key)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  const i = tabs.findIndex((y) => y.key === tab);
                  const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].key;
                  setTab(next);
                  document.getElementById(`aov-tab-${next}`)?.focus();
                }}>
                {x.label}
                <span>{num(activity[x.key].n)}</span>
              </button>
            ))}
          </div>
          <div id="aov-tabpanel" role="tabpanel" aria-labelledby={`aov-tab-${tab}`}>
            {activity[tab].rows.length ? (
              <ul className="aov-feed">
                {activity[tab].rows.slice(0, 5).map((x) => {
                  const late = tab === "tasks" && overdue.includes(x);
                  return (
                    <li key={x.id} className={late ? "is-late" : undefined}>
                      <span className="aov-feed__t">{x.title || x.meta || tcm("untitled")}</span>
                      <span className="aov-feed__s">
                        {late ? <em>{tb("late")}</em> : x.status ? <em>{label("status", x.status)}</em> : null}
                        {tab === "reviews" && x.meta ? <span className="aov-feed__rate"><IconStar aria-hidden="true" />{x.meta}</span> : x.amount ? <span>{moneyShort(x.amount)}</span> : null}
                        {x.due && tab === "tasks" ? <time>{tb("due")}: {fmtDate(x.due.slice(0, 10), locale)}</time> : x.date ? <time>{fmtDate(x.date.slice(0, 10), locale)}</time> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="aov-empty">{t("empty")}</p>
            )}
          </div>
        </Panel>
      </div>

      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
