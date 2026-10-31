"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { EMPTY_FILTER, downloadCeoExport, getCeoDashboardFull, isCeoEmpty, viewerTimeZone, type CeoDashboardFull } from "@/lib/services/dash";
import DatePicker from "@/components/DatePicker";
import { useResourceOne } from "@/lib/useResource";
import { getQualityOverview } from "@/lib/services/backend";
import { fmtUzsShort } from "@/lib/money";
import { fmtDate, fmtNum, fmtPct, monthNames, shortDate } from "@/lib/date";
import { ApiError, isAborted } from "@/lib/http";
import { humanizeSlug } from "@/lib/lawyers";
import { leadSourceInfo, sourceGroup, type SourceGroup } from "@/lib/leadLabels";
import { useAiSelection } from "@/lib/ai/registry";
import { useScrollEdges } from "@/lib/useScrollEdges";
import { notify } from "@/lib/toast";
import StatDrillModal, { type Drill, type DrillRow } from "@/components/admin/StatDrillModal";
import { EmptyState, ErrorState } from "@/components/portal/DataState";
import Segmented from "@/components/ui/Segmented";
import Menu, { type MenuEntry } from "@/components/ui/Menu";
import { IconAlert, IconArrowRight, IconChartBar, IconDownload, IconList, IconRefresh } from "@/components/icons";

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
const TABLE_TOP = 8;
const CARD_TOP = 5;
type Health = "good" | "watch" | "bad" | "na" | "info";
type SortKey = "revenue" | "leads" | "payments";
type Channel = CeoDashboardFull["channels"][number];
type Got = { ok: true; data: CeoDashboardFull } | { ok: false; error: unknown };
type Seen = { got: Got; kept: CeoDashboardFull | null };
type Point = { label: string; value: number };
type JumpId = "rev" | "unit" | "funnel" | "channels" | "aud" | "gifts";
type Fold = { rows: Channel[]; folded: Channel[] };
const STALE_ID = "ceo-stale";
const SPY_TAIL = 360;
const UZ_MON = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

function chartDay(iso: string, locale: string): string {
  const day = iso.slice(0, 10);
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  return locale === "uz" && m >= 1 && m <= 12 && d >= 1 ? `${d}-${UZ_MON[m - 1]}` : shortDate(day, locale);
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
}

const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (NICE.find((x) => f <= x + 1e-9) ?? 10) * p;
}

function Section({ id, ai, title, scope, tag, action, children }: { id: JumpId; ai: string; title: string; scope?: string; tag?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={`ceo-sec-${id}`} className="ceo-sec" aria-labelledby={`ceo-${id}`} data-ai-target={ai}>
      <header className="ceo-sec__h">
        <div className="ceo-sec__tt">
          <div className="ceo-sec__tl">
            <h2 id={`ceo-${id}`} tabIndex={-1}>{title}</h2>
          </div>
          {scope ? (
            <p className="ceo-sec__scope">
              {scope}
              {tag ? <>{" "}<span className="ceo-chip ceo-chip--na">{tag}</span></> : null}
            </p>
          ) : null}
        </div>
        {action ? <div className="ceo-sec__a">{action}</div> : null}
      </header>
      <div className="ceo-sec__b">{children}</div>
    </section>
  );
}

function JumpNav({ items, label }: { items: { id: JumpId; label: string }[]; label: string }) {
  const nav = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const lock = useRef(0);
  const [active, setActive] = useState<JumpId>(items[0]?.id ?? "rev");
  useScrollEdges(strip, { silent: true });
  const ids = items.map((x) => x.id).join(",");

  useEffect(() => {
    const bar = nav.current;
    if (!bar) return;
    const box = scrollParent(bar);
    const list = ids.split(",") as JumpId[];
    let raf = 0;
    const read = () => {
      raf = 0;
      if (lock.current || !list.length) return;
      const sc = box ?? document.scrollingElement ?? document.documentElement;
      const line = bar.getBoundingClientRect().bottom + 48;
      const max = sc.scrollHeight - sc.clientHeight;
      if (max <= 0) {
        setActive(list[0]);
        return;
      }
      const y = sc.scrollTop;
      const at = list.map((id) => {
        const el = document.getElementById(`ceo-sec-${id}`);
        return el ? y + el.getBoundingClientRect().top - line : Number.POSITIVE_INFINITY;
      });
      const from = Math.max(0, max - SPY_TAIL);
      const lastAt = at[at.length - 1];
      const fit = (a: number) => (lastAt > max && a > from ? from + ((a - from) * (max - from)) / (lastAt - from) : a);
      let cur = list[0];
      list.forEach((id, i) => {
        if (fit(at[i]) <= y + 1) cur = id;
      });
      setActive(cur);
    };
    const onScroll = () => {
      if (lock.current) {
        window.clearTimeout(lock.current);
        lock.current = window.setTimeout(() => {
          lock.current = 0;
        }, 160);
        return;
      }
      if (!raf) raf = requestAnimationFrame(read);
    };
    const target: HTMLElement | Window = box ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);

  useEffect(() => {
    const box = strip.current;
    const pill = box?.querySelector<HTMLElement>(`[data-jump="${active}"]`);
    if (!box || !pill || box.scrollWidth <= box.clientWidth) return;
    const l = pill.offsetLeft;
    const r = l + pill.offsetWidth;
    if (l < box.scrollLeft + 24) box.scrollLeft = Math.max(0, l - 24);
    else if (r > box.scrollLeft + box.clientWidth - 24) box.scrollLeft = r - box.clientWidth + 24;
  }, [active]);

  const go = (e: MouseEvent<HTMLAnchorElement>, id: JumpId) => {
    const sec = document.getElementById(`ceo-sec-${id}`);
    if (!sec) return;
    e.preventDefault();
    window.clearTimeout(lock.current);
    lock.current = window.setTimeout(() => {
      lock.current = 0;
    }, 900);
    setActive(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sec.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    sec.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

  return (
    <nav ref={nav} className="ceo-jump" aria-label={label} data-ai-id="admin.ceo.sections" data-ai-type="list">
      <div ref={strip} className="ceo-jump__list scue-x">
        {items.map((x) => (
          <a
            key={x.id}
            href={`#ceo-sec-${x.id}`}
            className="ceo-jump__a"
            data-jump={x.id}
            aria-current={active === x.id ? "location" : undefined}
            onClick={(e) => go(e, x.id)}
            data-ai-id={`admin.ceo.sections.${x.id}`}
            data-ai-type="link"
          >
            {x.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

type ChartText = { aria: string; hint: string; max: (value: string) => string };

function RevenueChart({ points, full, brief, day, dayLong, text }: { points: Point[]; full: (n: number) => string; brief: (n: number) => string; day: (iso: string) => string; dayLong: (iso: string) => string; text: ChartText }) {
  const hintId = useId();
  const [sel, setSel] = useState<number | null>(null);
  const focused = useRef(false);
  const n = points.length;
  if (n < 2) return <div className="lchart__empty">{n ? `${dayLong(points[0].label)} · ${full(points[0].value)}` : "—"}</div>;

  const W = 600;
  const H = 200;
  const peak = Math.max(0, ...points.map((p) => p.value));
  const step = peak > 0 ? niceStep(peak / 2) : 0;
  const ticks = step ? [0, step, step * 2] : [0];
  const top = step ? step * 2 : 1;
  const xp = (i: number) => (i / (n - 1)) * 100;
  const yp = (v: number) => 100 - (Math.max(0, v) / top) * 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${((xp(i) * W) / 100).toFixed(1)} ${((yp(p.value) * H) / 100).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const mi = points.findIndex((p) => p.value === peak);
  const last = n - 1;
  const showMax = peak > 0 && mi !== last;
  const maxAlign = xp(mi) < 14 ? "start" : xp(mi) > 86 ? "end" : "center";
  const crowded = showMax && last - mi <= Math.max(2, Math.round(n / 6)) && Math.abs(yp(points[last].value) - yp(peak)) < 22;
  const mid = Math.floor(last / 2);
  const at = sel != null && sel < n ? sel : null;
  const cur = at != null ? points[at] : null;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = Math.max(0, (at ?? n) - 1);
    else if (e.key === "ArrowRight") next = Math.min(last, (at ?? -1) + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape" && at != null) {
      e.preventDefault();
      e.stopPropagation();
      setSel(null);
      return;
    }
    if (next == null) return;
    e.preventDefault();
    setSel(next);
  };

  return (
    <div className="ceo-ch">
      <div
        className={`ceo-ch__plot${at != null ? " is-sel" : ""}`}
        tabIndex={0}
        role="group"
        aria-label={text.aria}
        aria-describedby={hintId}
        onKeyDown={onKey}
        onFocus={() => {
          focused.current = true;
          if (at == null) setSel(last);
        }}
        onBlur={() => {
          focused.current = false;
          setSel(null);
        }}
        data-ai-id="admin.ceo.revenue-chart"
        data-ai-type="section"
      >
        {ticks.map((v) => (
          <div key={v} className="ceo-ch__grid" style={{ bottom: `${(v / top) * 100}%` }}>
            <span>{brief(v)}</span>
          </div>
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="ceo-ch__svg" aria-hidden="true">
          <defs>
            <linearGradient id="ceo-ch-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--b600)" stopOpacity="0.18" />
              <stop offset="1" stopColor="var(--b600)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#ceo-ch-fill)" />
          <path d={line} fill="none" className="ceo-ch__line" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {showMax ? (
          <>
            <span className="ceo-ch__pt" style={{ left: `${xp(mi)}%`, top: `${yp(peak)}%` }} aria-hidden="true" />
            <span className="ceo-ch__mk ceo-ch__mk--max" data-align={maxAlign} style={{ left: `${xp(mi)}%`, top: `${yp(peak)}%` }} aria-hidden="true">
              {text.max(brief(peak))}
              <span className="ceo-ch__mkd"> · {day(points[mi].label)}</span>
            </span>
          </>
        ) : null}
        <span className="ceo-ch__pt ceo-ch__pt--end" style={{ left: "100%", top: `${yp(points[last].value)}%` }} aria-hidden="true" />
        <span className={`ceo-ch__mk ceo-ch__mk--end${crowded ? " is-low" : ""}`} style={{ left: "100%", top: `${yp(points[last].value)}%` }} aria-hidden="true">
          <span className="ceo-ch__mkd">{day(points[last].label)}: </span>
          {peak > 0 && mi === last ? text.max(brief(points[last].value)) : brief(points[last].value)}
        </span>
        {cur && at != null ? (
          <>
            <span className="lchart__guide" style={{ left: `${xp(at)}%` }} aria-hidden="true" />
            <span className="lchart__dot" style={{ left: `${xp(at)}%`, top: `${yp(cur.value)}%` }} aria-hidden="true" />
            <div className="lchart__tip" style={{ left: `${Math.min(88, Math.max(12, xp(at)))}%`, top: `${yp(cur.value)}%` }} aria-hidden="true">
              <b>{full(cur.value)}</b>
              <span>{dayLong(cur.label)}</span>
            </div>
          </>
        ) : null}
        <div
          className="ceo-ch__hit"
          onMouseLeave={() => {
            if (!focused.current) setSel(null);
          }}
        >
          {points.map((p, i) => (
            <span key={`${p.label}-${i}`} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} />
          ))}
        </div>
      </div>
      <div className="ceo-ch__x" aria-hidden="true">
        <span style={{ left: "0%" }} data-align="start">{day(points[0].label)}</span>
        {mid > 0 && mid < last ? (
          <span className="ceo-ch__xm" style={{ left: `${xp(mid)}%` }}>
            {day(points[mid].label)}
          </span>
        ) : null}
        <span style={{ left: "100%" }} data-align="end">{day(points[last].label)}</span>
      </div>
      <p id={hintId} className="sr-only">
        {text.hint}
      </p>
      <p className="sr-only" aria-live="polite">
        {cur ? `${dayLong(cur.label)}: ${full(cur.value)}` : ""}
      </p>
    </div>
  );
}

function DayTable({ points, full, dayLong, caption, colDay, colValue }: { points: Point[]; full: (n: number) => string; dayLong: (iso: string) => string; caption: string; colDay: string; colValue: string }) {
  return (
    <table className="ceo-days" data-ai-id="admin.ceo.revenue-days" data-ai-type="table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{colDay}</th>
          <th scope="col" className="is-num">{colValue}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p, i) => (
          <tr key={`${p.label}-${i}`} className={p.value ? undefined : "is-zero"}>
            <th scope="row">{dayLong(p.label)}</th>
            <td className="is-num">{full(p.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A time zone in words a reader knows ("GMT+5"), never its IANA name.
function tzOffsetLabel(tz: string, locale: string): string {
  try {
    const part = new Intl.DateTimeFormat(locale === "uz" ? "uz-Latn" : locale, { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName");
    return part?.value || "";
  } catch {
    return "";
  }
}

export default function AdminCeo() {
  const t = useTranslations("admin.ceo");
  const tr = useTranslations("admin.ceo.report");
  const locale = useLocale();
  const td = useTranslations("admin.dash");
  const tc = useTranslations("admin.overview.crm");
  const te = useTranslations("enums");
  const tnf = useTranslations("common.notify");
  const ta = useTranslations("common.a11y");
  const [tick, setTick] = useState(0);
  // TSK-328538: the KPIs for a chosen period (both ends picked), else all time.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const ranged = !!from && !!to;
  const filter = ranged ? { ...EMPTY_FILTER, from, to } : undefined;
  const res = useResourceOne(() => getCeoDashboardFull(filter).then((data): Got => ({ ok: true, data }), (error: unknown): Got => ({ ok: false, error })), [tick, ranged ? from : "", ranged ? to : ""]);
  // Service quality (TSK-328538): rating, answer-on-time and complaints from
  // the backend's quality overview. It has no period filter, so these always
  // read as all time; a failure only hides them.
  const quality = useResourceOne(() => getQualityOverview().catch(() => null), [tick]);
  const got = res.data;
  const [seen, setSeen] = useState<Seen | null>(null);
  if (got && got !== seen?.got) setSeen({ got, kept: got.ok ? got.data : seen?.kept ?? null });
  const [drill, setDrill] = useState<Drill | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "revenue", dir: -1 });
  const [span, setSpan] = useState<Span>(14);
  const [tableView, setTableView] = useState(false);
  const [allCh, setAllCh] = useState(false);
  const loading = res.status === "loading";
  const last = got ?? seen?.got ?? null;
  const fail = last && !last.ok ? last : null;
  const report = got?.ok ? got.data : seen?.kept ?? null;
  // Nothing recorded yet for this period: an honest empty state, never
  // sample figures (owner decision 2026-10-31).
  const empty = report !== null && isCeoEmpty(report);
  const d = report ?? EMPTY;
  const first = !last;
  const failed = !first && !report;
  const stale = report !== null && fail !== null;
  const raised = useRef<Got | null>(null);
  const retry = () => setTick((n) => n + 1);
  const failErr = fail?.error;
  const failTitle =
    failErr instanceof ApiError && failErr.status >= 500
      ? tr("failedServer", { status: failErr.status })
      : failErr instanceof ApiError && failErr.status === 0 && !isAborted(failErr)
        ? tr("failedOffline")
        : tr("failed");

  useEffect(() => {
    if (!got) return;
    if (got.ok) {
      notify.dismiss(STALE_ID);
      return;
    }
    // With nothing kept the error state says it on the page.
    if (got === raised.current || !report) return;
    raised.current = got;
    notify.error(td("notUpdated"), { id: STALE_ID, error: got.error, action: { label: tnf("retry"), onClick: () => setTick((n) => n + 1) } });
  }, [got, report, td, tnf]);
  useEffect(() => () => notify.dismiss(STALE_ID), []);

  const stage = (k: string) => (t.has(`stage.${k}`) ? t(`stage.${k}`) : humanizeSlug(k));
  const sourceName = (k: string) => leadSourceInfo(te, k).label || "—";
  const units = { mln: td("units.mln"), mlrd: td("units.mlrd") };
  const som = tc("som");
  const money = (n: number) => `${fmtNum(n, locale)} ${som}`;
  const short = (n: number) => `${Math.abs(n) >= 1e6 ? fmtUzsShort(n, units, locale) : fmtNum(n, locale)} ${som}`;
  const brief = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e6) return fmtUzsShort(n, units, locale);
    if (a >= 1e3) return tr("kShort", { n: fmtNum(n / 1e3, locale, a < 1e4 ? 1 : 0) });
    return fmtNum(n, locale);
  };
  const num = (n: number) => fmtNum(n, locale);
  const pct = (n: number, digits = 1) => fmtPct(n, locale, digits);
  const day = (iso: string) => chartDay(iso, locale);
  const dayLong = (iso: string) => fmtDate(iso.slice(0, 10), locale);
  const NA = tr("na");
  const na = (value: string) => (value === NA ? "is-na" : undefined);
  const row = (label: string, value: string, sub?: string): DrillRow => ({ label, value, sub, tone: value === NA ? "muted" : undefined });

  useAiSelection("dashboard_period", tr("allTime"));
  useAiSelection("revenue_chart_period", tr("spanDays", { n: span }));

  // Revenue and payments as the backend counts them. Test data has no
  // canonical flag yet (2026-10-31 §2.4), so no channel is guessed to be a
  // test one and nothing is subtracted here.
  const headRevenue = d.revenue;
  const headPayments = d.paidPayments;
  const gmvSame = d.gmv === d.revenue;
  const gmv = d.gmv;
  // MRR is the backend's normalised recurring subscription revenue; it is
  // shown as sent, never worked out here.
  const mrr = d.mrr;
  const mrrNote = mrr ? tr("notes.mrr") : tr("notes.mrrNa");
  const arrNote = tr("notes.arr");
  const paidRaw = d.funnel.find((x) => x.label === "paid")?.value ?? d.paidPayments;
  const paidSame = paidRaw === d.paidPayments;
  const paid = paidSame ? headPayments : paidRaw;
  const ltvCac = Math.round(d.ltvCac * 10) / 10;
  const ltvCacText = d.ltvCac ? `${fmtNum(ltvCac, locale, 1)}×` : NA;
  const payback = Math.round(d.paybackMonths * 10) / 10;

  const q = quality.data ?? null;
  const ledger = [
    { key: "gmv", label: t("kpi.gmv"), value: gmv ? money(gmv) : NA, note: gmv && gmvSame ? tr("notes.gmvEq") : tr("notes.gmv") },
    { key: "mrr", label: t("mrr"), value: mrr ? money(mrr) : NA, note: mrrNote },
    { key: "arr", label: t("kpi.arr"), value: d.arr ? money(d.arr) : NA, note: arrNote },
    ...(d.activeSubscriptions !== undefined
      ? [
          { key: "subs", label: tr("subs"), value: num(d.activeSubscriptions), note: tr("subsNote", { added: num(d.newSubscriptions ?? 0), cancelled: num(d.cancelledSubscriptions ?? 0) }) },
          { key: "orders", label: tr("orders"), value: num(d.ordersPaid ?? 0), note: tr("ordersNote", { created: num(d.ordersCreated ?? 0) }) },
        ]
      : []),
    ...(d.renewalRatePct !== undefined && d.renewalRatePct !== null ? [{ key: "renewal", label: tr("renewal"), value: pct(d.renewalRatePct), note: tr("renewalNote", { n: num(d.renewedSubscriptions ?? 0) }) }] : []),
    ...(d.churnRatePct !== undefined && d.churnRatePct !== null ? [{ key: "churn", label: tr("churn"), value: pct(d.churnRatePct), note: tr("churnNote", { n: num(d.cancelledSubscriptions ?? 0) }) }] : []),
    ...(d.refundRatePct !== undefined && d.refundRatePct !== null ? [{ key: "refunds", label: tr("refunds"), value: pct(d.refundRatePct), note: tr("refundsNote", { amount: money(d.refundedAmount ?? 0) }) }] : []),
    ...(q
      ? [
          { key: "avgRating", label: tr("quality.rating"), value: q.avgRating ? fmtNum(q.avgRating, locale, 1) : NA, note: tr("quality.allTime") },
          { key: "responseSla", label: tr("quality.sla"), value: pct(q.responseSlaPct), note: tr("quality.allTime") },
          { key: "complaintRate", label: tr("quality.complaints"), value: pct(q.complaintRate), note: tr("quality.resolved", { pct: pct(q.resolvedPct, 0) }) },
        ]
      : []),
    { key: "arpu", label: t("kpi.arpu"), value: d.arpu ? money(d.arpu) : NA, note: tr("notes.arpu") },
    { key: "take", label: t("kpi.takeRate"), value: d.takeRate ? pct(d.takeRate) : NA, note: tr("notes.take") },
    { key: "cac", label: t("kpi.cac"), value: d.cac ? money(d.cac) : NA, note: d.cac ? t("kpi.cacSplit", { client: money(d.cacClient), advocate: money(d.cacAdvocate) }) : tr("notes.cacNa") },
    { key: "ltv", label: t("kpi.ltv"), value: d.ltv ? money(d.ltv) : NA, note: tr("notes.ltv") },
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
  const giftActivated = Math.round((g.giftPurchases * g.giftActivationRate) / 100);
  const giftPaid = Math.round((giftActivated * g.giftToPaidConversion) / 100);

  const trend = d.revenueTrend.slice(-span);
  const total = trend.reduce((s, p) => s + p.value, 0);
  const days = trend.length;
  const best = trend.reduce<Point | null>((m, p) => (!m || p.value > m.value ? p : m), null);
  const activeDays = trend.filter((p) => p.value > 0).length;
  const dayAvg = days ? short(total / days) : NA;
  const dayBest = best && best.value ? short(best.value) : NA;

  const leads = d.funnel.find((x) => x.label === "leads")?.value ?? 0;
  const orders = d.funnel.find((x) => x.label === "orders")?.value ?? 0;
  const steps = [
    { key: "leads", value: leads },
    { key: "orders", value: orders },
  ].map((s, i, all) => {
    const prev = i ? all[i - 1].value : 0;
    const kept = i && prev ? fmtNum((s.value / prev) * 100, locale, 1) : fmtNum(100, locale);
    return { ...s, sub: i ? tr("kept", { pct: kept, lost: num(Math.max(0, prev - s.value)) }) : tr("entry") };
  });
  const stepMax = Math.max(1, leads, orders);

  const channelSub = (c: Channel) => [tr("chLeads", { n: num(c.leads), count: c.leads }), tr("chPayments", { n: num(c.payments), count: c.payments })].join(" · ");
  const open = (drl: Omit<Drill, "demo" | "variant" | "closeLabel">) => setDrill({ ...drl, variant: "report", closeLabel: ta("close") });
  const kv = (title: string, rows: DrillRow[]): Drill["sections"][number] => ({ kind: "kv", title, rows });
  const channelBars = (): Drill["sections"][number] => {
    const list = d.channels.slice().sort((a, b) => b.revenue - a.revenue);
    const mixed = GROUPS.every((key) => list.some((c) => sourceGroup(c.name) === key));
    const earning = list.filter((c) => c.revenue > 0).length;
    return {
      kind: "bars",
      title: `${t("channels")} · ${tr("allTime")}`,
      limit: earning ? Math.min(TABLE_TOP, earning) : TABLE_TOP,
      moreLabel: tr("all", { n: list.length }),
      lessLabel: tr("less"),
      rows: list.map((c): DrillRow => {
        const tag = mixed && sourceGroup(c.name) === "payment" ? tr("paymentTag") : "";
        const name = sourceName(c.name);
        return { label: tag ? `${name} · ${tag}` : name, title: leadSourceInfo(te, c.name).title || undefined, value: money(c.revenue), short: short(c.revenue), n: c.revenue, sub: channelSub(c) };
      }),
    };
  };
  const unitEcon = () => kv(t("kpi.title"), ledger.filter((r) => r.key !== "payback" && !(d.ltvCac && r.key === "ltvCac")).map((r) => row(r.label, r.value)));
  const drillRevenue = () =>
    open({
      title: t("revenueTrend"),
      value: money(total),
      caption: [tr("figTotalDays", { n: days || span }), tr("allRegions")].join(" · "),
      sections: [
        { kind: "series", title: tr("byDay"), points: trend, format: money, controls: false },
        {
          kind: "table",
          caption: tr("byDay"),
          head: [{ label: tr("colDay") }, { label: t("channelTable.revenue"), num: true }],
          lines: trend.map((p) => ({ cells: [dayLong(p.label), money(p.value)], tone: p.value ? undefined : "muted" })),
        },
        channelBars(),
      ],
    });
  const drillUnit = () =>
    open({
      title: tr("unit"),
      value: d.ltvCac ? ltvCacText : undefined,
      caption: d.ltvCac ? `${t("kpi.ltvCac")} · ${tr("notes.ltvCac")}` : undefined,
      sections: [unitEcon(), kv(td("drill.cac"), [row(td("drill.cacClient"), d.cacClient ? money(d.cacClient) : NA), row(td("drill.cacAdvocate"), d.cacAdvocate ? money(d.cacAdvocate) : NA)])],
    });
  const drillFunnel = () =>
    open({
      title: t("funnel"),
      value: pct(d.conversionPct),
      caption: `${tr("fig.conv")} · ${tr("allTime")}`,
      sections: [
        { kind: "steps", title: tr("steps"), rows: steps.map((s) => ({ label: stage(s.key), value: num(s.value), n: s.value, sub: s.sub })) },
        { kind: "note", text: tr("paidLine", { n: num(paid), count: paid }) },
      ],
      link: { href: "/admin/crm/leads?tab=all&view=board", label: td("drill.goPipeline"), primary: true },
    });
  const more = (onClick: () => void, label: string) => (
    <button type="button" className="ceo-more" onClick={onClick} aria-label={`${td("drill.details")}: ${label}`}>
      {td("drill.details")}
      <IconArrowRight aria-hidden="true" />
    </button>
  );

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

  const health = (key: string): Health => {
    if (key === "ltvCac") return !d.ltvCac ? "na" : ltvCac >= 3 ? "good" : ltvCac >= 1 ? "watch" : "bad";
    if (key === "cac" || key === "payback") return (key === "cac" ? d.cac : d.paybackMonths) ? "info" : "na";
    return "info";
  };

  const chList = d.channels;
  const sorted = chList.slice().sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir || b.revenue - a.revenue);
  const earning = sorted.filter((c) => c.revenue > 0);
  const idle = sorted.filter((c) => c.revenue <= 0);
  const fold = (top: number): Fold => (allCh ? { rows: sorted, folded: [] } : earning.length && idle.length > 1 ? { rows: earning.slice(0, top), folded: idle } : { rows: sorted.slice(0, top), folded: [] });
  const tableFold = fold(TABLE_TOP);
  const cardFold = fold(CARD_TOP);
  const canFold = (top: number) => (earning.length && idle.length > 1 ? Math.min(top, earning.length) : Math.min(top, sorted.length)) < sorted.length;
  const groups = GROUPS.map((key) => ({ key, rows: tableFold.rows.filter((c) => sourceGroup(c.name) === key) })).filter((grp) => grp.rows.length);
  const grouped = groups.some((grp) => grp.key === "payment");
  const rowsMax = Math.max(1, ...chList.map((c) => c.revenue));
  const shownRevenue = chList.reduce((s, c) => s + c.revenue, 0) || 1;
  const sortBy = (key: SortKey) => setSort((cur) => ({ key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : -1 }));
  const th = (key: SortKey, label: string) => {
    const on = sort.key === key;
    return (
      <th scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={key === "revenue" ? "ceo-table__revh" : undefined}>
        <button type="button" onClick={() => sortBy(key)}>
          {label}
          <span className="ceo-sortic" aria-hidden="true">{on ? (sort.dir === 1 ? "▲" : "▼") : SORT_NONE}</span>
        </button>
      </th>
    );
  };
  const share = (c: Channel) => pct((c.revenue / shownRevenue) * 100, 0);
  const width = (c: Channel) => `${Math.min(100, (Math.max(0, c.revenue) / rowsMax) * 100)}%`;
  const sumOf = (list: Channel[], key: "leads" | "payments") => list.reduce((s, c) => s + c[key], 0);
  const allBtn = (controls: string, top: number) =>
    canFold(top) ? (
      <button type="button" className="btn btn--line btn--sm ceo-chall" aria-expanded={allCh} aria-controls={controls} onClick={() => setAllCh((v) => !v)} data-ai-id="admin.ceo.channels.all" data-ai-type="button">
        {allCh ? tr("less") : tr("all", { n: sorted.length })}
      </button>
    ) : null;

  const asOfDay = d.fetchedAt ? fmtDate(d.fetchedAt, locale) : "";
  const tzLabel = tzOffsetLabel(report?.period?.timezone || viewerTimeZone(), locale);
  const scopeAll = ranged ? tr("periodScope", { from: fmtDate(from, locale), to: fmtDate(to, locale) }) : asOfDay ? tr("allTimeAsOf", { date: asOfDay }) : tr("allTime");
  const B = (chunks: ReactNode) => <b>{chunks}</b>;
  const revenueCaption = tr("fig.revenue");
  const kpis = [
    { key: "revenue", label: t("revenue"), value: short(headRevenue), sub: revenueCaption },
    { key: "payments", label: t("channelTable.payments"), value: num(headPayments), sub: tr("fig.payments") },
    { key: "conv", label: t("conversion"), value: pct(d.conversionPct), sub: tr("fig.conv") },
    { key: "users", label: t("users"), value: num(d.users), sub: tr("fig.users") },
    { key: "mau", label: aud.mau, value: num(d.mau), sub: tr("fig.mau") },
  ];
  const jumps: { id: JumpId; label: string }[] = [
    { id: "rev", label: t("revenue") },
    { id: "unit", label: tr("unit") },
    { id: "funnel", label: t("funnel") },
    { id: "channels", label: t("channelTable.title") },
    { id: "aud", label: tr("audience") },
    { id: "gifts", label: td("drill.gifts") },
  ];
  const actions: MenuEntry[] = [
    { key: "refresh", label: tr("refresh"), icon: <IconRefresh />, onSelect: retry, aiId: "admin.ceo.actions.refresh" },
    {
      key: "export",
      label: exporting ? tr("exporting") : tr("export"),
      icon: <IconDownload />,
      disabled: exporting ? tr("exporting") : empty ? tr("exportEmpty") : false,
      onSelect: () => {
        // One file at a time: the backend builds it while the request is open.
        if (exportingRef.current) return;
        exportingRef.current = true;
        setExporting(true);
        downloadCeoExport(filter)
          .then(() => notify.success(tr("exported"), { id: "ceo-export" }))
          .catch((e) => notify.error(tr("exportFailed"), { id: "ceo-export", error: e }))
          .finally(() => {
            exportingRef.current = false;
            setExporting(false);
          });
      },
      aiId: "admin.ceo.actions.export",
    },
  ];

  return (
    <div className="ceo">
      <article className={`ceo-sheet${loading ? "" : " is-ready"}`} aria-busy={loading}>
        {!first && loading ? (
          <div className="ceo-pin">
            <span className="ceo-pin__bar" aria-hidden="true" />
          </div>
        ) : null}
        <div className="ceo-act" data-ai-target="stats:filters" data-ai-label={tr("actions")}>
          <Menu label={tr("actions")} items={actions} tipSide="bottom" tipAlign="end" minWidth={280} maxWidth={340} aiId="admin.ceo.actions" />
        </div>
        {first ? (
          <>
            <div className="ceo-sk" aria-hidden="true">
              <span className="ceo-sk__l" />
              <span className="ceo-sk__l ceo-sk__l--s" />
              <div className="ceo-sk__figs">
                <span /><span /><span /><span /><span />
              </div>
              <div className="ceo-sk__pills">
                <span /><span /><span /><span /><span /><span />
              </div>
              <div className="ceo-sk__sec">
                <span className="ceo-sk__h" />
                <span className="ceo-sk__chart" />
              </div>
              <div className="ceo-sk__sec">
                <span className="ceo-sk__h" />
                <span className="ceo-sk__row" /><span className="ceo-sk__row" /><span className="ceo-sk__row" />
              </div>
            </div>
            <p className="sr-only" role="status">{td("drill.loading")}</p>
          </>
        ) : failed ? (
          <ErrorState title={failTitle} error={failErr} onRetry={retry} />
        ) : (
          <>
            <header className={`ceo-head${empty ? " ceo-head--bare" : ""}`} data-ai-target="ceo:kpis">
              {empty ? null : (
                <>
                  <p className="ceo-head__lead">
                    {tr.rich("summary", { revenue: short(headRevenue), payments: num(headPayments), count: headPayments, conv: pct(d.conversionPct), users: num(d.users), b: B })}
                  </p>
                  <dl className="ceo-kpis">
                    {kpis.map((k) => (
                      <div key={k.key}>
                        <dt>{k.label}</dt>
                        <dd className="ceo-kpis__v">{k.value}</dd>
                        <dd className="ceo-kpis__s">{k.sub}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              <div className="ceo-range" role="group" aria-label={tr("period")}>
                <DatePicker value={from} onChange={setFrom} max={to || undefined} placeholder={tr("periodFrom")} ariaLabel={tr("periodFrom")} />
                <DatePicker value={to} onChange={setTo} min={from || undefined} placeholder={tr("periodTo")} ariaLabel={tr("periodTo")} />
                {from || to ? (
                  <button type="button" className="btn btn--line btn--sm" onClick={() => (setFrom(""), setTo(""))}>
                    {tr("periodAll")}
                  </button>
                ) : null}
              </div>
              <p className="ceo-head__meta">
                <span>{scopeAll}</span>
                {tzLabel ? <span>{tr("timezone", { tz: tzLabel })}</span> : null}
              </p>
              {exporting ? (
                <p className="ceo-exporting" role="status">
                  <IconRefresh className="mk-spin" aria-hidden="true" />
                  {tr("exportBusy")}
                </p>
              ) : null}
              {stale ? <p className="ceo-hint"><IconAlert aria-hidden="true" />{td("staleHint")}</p> : null}
            </header>

            {empty ? (
              <EmptyState
                className="ceo-none"
                icon={<IconChartBar />}
                title={ranged ? tr("none.titleRange", { from: fmtDate(from, locale), to: fmtDate(to, locale) }) : tr("none.title")}
                text={ranged ? tr("none.textRange") : tr("none.text")}
                action={
                  <>
                    {ranged ? (
                      <button type="button" className="btn btn--line btn--sm" onClick={() => (setFrom(""), setTo(""))} data-ai-id="admin.ceo.empty.all-time">
                        {tr("periodAll")}
                      </button>
                    ) : null}
                    <button type="button" className="btn btn--line btn--sm" onClick={retry} data-ai-id="admin.ceo.empty.refresh">
                      <IconRefresh aria-hidden="true" />
                      {tr("refresh")}
                    </button>
                  </>
                }
              />
            ) : (
              <>
              <JumpNav items={jumps} label={tr("jumpAria")} />

              <Section
                id="rev"
                ai="ceo:revenue-trend"
                title={t("revenueTrend")}
                scope={[tr("lastDays", { n: span }), tr("allRegions")].join(" · ")}
                action={<>{spanSwitch}{more(drillRevenue, t("revenueTrend"))}</>}
              >
                {!trend.length ? (
                  <p className="ceo-empty">{t("noData")}</p>
                ) : tableView ? (
                  <DayTable points={trend} full={money} dayLong={dayLong} caption={tr("byDay")} colDay={tr("colDay")} colValue={t("channelTable.revenue")} />
                ) : (
                  <RevenueChart points={trend} full={money} brief={brief} day={day} dayLong={dayLong} text={{ aria: tr("chartAria"), hint: tr("chartHint"), max: (value) => tr("chartMax", { value }) }} />
                )}
                <div className="ceo-revfoot">
                  <dl className="ceo-figs">
                    <div><dt>{tr("figTotalDays", { n: days || span })}</dt><dd>{short(total)}</dd></div>
                    <div><dt>{tr("figAvg")}</dt><dd className={na(dayAvg)}>{dayAvg}</dd></div>
                    <div><dt>{tr("figBest")}</dt><dd className={na(dayBest)}>{dayBest}{best && best.value ? <small>{dayLong(best.label)}</small> : null}</dd></div>
                    <div><dt>{tr("figActive")}</dt><dd>{tr("daysOf", { n: activeDays, total: days })}</dd></div>
                  </dl>
                  {trend.length ? (
                    <button type="button" className="btn btn--line btn--sm ceo-tview" aria-pressed={tableView} onClick={() => setTableView((v) => !v)} data-ai-id="admin.ceo.revenue-table" data-ai-type="button">
                      <IconList aria-hidden="true" />
                      {tr("tableView")}
                    </button>
                  ) : null}
                </div>
              </Section>

              <Section id="unit" ai="ceo:kpi-system" title={tr("unit")} scope={scopeAll} action={more(drillUnit, tr("unit"))}>
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
                            <span className="ceo-ledger__note">{line.note}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Section>

              <Section id="funnel" ai="ceo:funnel" title={t("funnel")} scope={scopeAll} action={more(drillFunnel, t("funnel"))}>
                <ol className="ceo-steps">
                  {steps.map((s) => (
                    <li key={s.key}>
                      <span className="ceo-steps__l">{stage(s.key)}</span>
                      <span className="ceo-steps__bar"><span style={{ width: `${Math.max(2, (s.value / stepMax) * 100)}%` }} /></span>
                      <b>{num(s.value)}</b>
                      <small>{s.sub}</small>
                    </li>
                  ))}
                </ol>
                <p className="ceo-aside">
                  {tr.rich("paidNote", { n: num(paid), b: B })}
                </p>
              </Section>

              <Section
                id="channels"
                ai="ceo:channels"
                title={t("channelTable.title")}
                scope={scopeAll}
              >
                {sorted.length ? (
                  <>
                    <div className="ceo-chdesk">
                      <div className="ceo-tablewrap" data-ai-target="ceo:channel-table">
                        <table className="ceo-table" id="ceo-ch-table">
                          <thead>
                            <tr>
                              <th scope="col">{t("channelTable.source")}</th>
                              {th("leads", t("channelTable.leads"))}
                              {th("payments", t("channelTable.payments"))}
                              {th("revenue", t("channelTable.revenue"))}
                            </tr>
                          </thead>
                          {groups.map((grp) => (
                            <tbody key={grp.key}>
                              {grouped ? (
                                <tr className="ceo-table__grp">
                                  <th scope="rowgroup" colSpan={4}>
                                    {tr(grp.key === "payment" ? "groupPayments" : "groupChannels")}
                                    {grp.key === "payment" ? <small>{tr("groupPaymentsNote")}</small> : null}
                                  </th>
                                </tr>
                              ) : null}
                              {grp.rows.map((c, i) => {
                                const src = leadSourceInfo(te, c.name);
                                return (
                                  <tr key={`${c.name}-${i}`}>
                                    <th scope="row" title={src.title || undefined}>{src.label || "—"}</th>
                                    <td className="is-num">{num(c.leads)}</td>
                                    <td className="is-num">{num(c.payments)}</td>
                                    <td className="ceo-table__rv">
                                      <span className="ceo-rev">
                                        <span className="ceo-rev__t">
                                          <b>{short(c.revenue)}</b>
                                          <small>· {share(c)}</small>
                                        </span>
                                        <i className="ceo-rev__bar" aria-hidden="true"><span style={{ width: width(c) }} /></i>
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          ))}
                          {tableFold.folded.length ? (
                            <tbody className="ceo-table__fold">
                              <tr>
                                <th scope="row">{tr("zeroRow", { n: tableFold.folded.length })}</th>
                                <td className="is-num">{num(sumOf(tableFold.folded, "leads"))}</td>
                                <td className="is-num">{num(sumOf(tableFold.folded, "payments"))}</td>
                                <td className="ceo-table__rv">
                                  <span className="ceo-rev">
                                    <span className="ceo-rev__t"><b>{short(0)}</b></span>
                                    <i className="ceo-rev__bar" aria-hidden="true" />
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          ) : null}
                        </table>
                      </div>
                      {allBtn("ceo-ch-table", TABLE_TOP)}
                    </div>
                    <div className="ceo-chmob">
                      <ul className="ceo-chcards" id="ceo-ch-cards" data-ai-target="ceo:channel-table">
                        {cardFold.rows.map((c, i) => {
                          const src = leadSourceInfo(te, c.name);
                          return (
                            <li key={`${c.name}-${i}`} className="ceo-chcard">
                              <span className="ceo-chcard__n" title={src.title || undefined}>
                                {src.label || "—"}
                              </span>
                              <b className="ceo-chcard__v">{short(c.revenue)}</b>
                              <i className="ceo-chcard__bar" aria-hidden="true"><span style={{ width: width(c) }} /></i>
                              <small className="ceo-chcard__p">{share(c)}</small>
                              <span className="ceo-chcard__s">{channelSub(c)}</span>
                            </li>
                          );
                        })}
                        {cardFold.folded.length ? (
                          <li className="ceo-chcard ceo-chcard--fold">
                            <span className="ceo-chcard__n">{tr("zeroRow", { n: cardFold.folded.length })}</span>
                            <b className="ceo-chcard__v">{short(0)}</b>
                            <span className="ceo-chcard__s">
                              {[tr("chLeads", { n: num(sumOf(cardFold.folded, "leads")), count: sumOf(cardFold.folded, "leads") }), tr("chPayments", { n: num(sumOf(cardFold.folded, "payments")), count: sumOf(cardFold.folded, "payments") })].join(" · ")}
                            </span>
                          </li>
                        ) : null}
                      </ul>
                      {allBtn("ceo-ch-cards", CARD_TOP)}
                    </div>
                  </>
                ) : (
                  <p className="ceo-empty">{t("noData")}</p>
                )}
              </Section>

              <Section id="aud" ai="ceo:audience" title={tr("audience")} scope={scopeAll}>
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

              <Section id="gifts" ai="ceo:gift-kpis" title={td("drill.gifts")} scope={scopeAll}>
                <ol className="ceo-gchain">
                  <li>
                    <b className="ceo-gchain__n">{num(g.giftPurchases)}</b>
                    <span className="ceo-gchain__t">{tr("gift.bought", { count: g.giftPurchases })}</span>
                  </li>
                  <li>
                    <b className="ceo-gchain__n">{num(giftActivated)}<small> · {pct(g.giftActivationRate)}</small></b>
                    <span className="ceo-gchain__t">{tr("gift.activated", { count: giftActivated })}</span>
                    <span className="ceo-gchain__b">{tr("gift.ofBought")}</span>
                  </li>
                  <li>
                    <b className="ceo-gchain__n">{num(giftPaid)}<small> · {pct(g.giftToPaidConversion)}</small></b>
                    <span className="ceo-gchain__t">{tr("gift.paid", { count: giftPaid })}</span>
                    <span className="ceo-gchain__b">{tr("gift.ofActivated")}</span>
                  </li>
                </ol>
                <dl className="ceo-minor">
                  <div><dt>{t("kpi.avgGift")}</dt><dd className={na(giftAvg)}>{giftAvg}</dd></div>
                  <div><dt>{t("kpi.giftLtv")}</dt><dd className={na(giftLtv)}>{giftLtv}</dd></div>
                  <div><dt>{t("kpi.giftReferralRate")}</dt><dd>{pct(g.referralRate)}</dd></div>
                  <div><dt>{t("kpi.giftCac")}</dt><dd className={na(giftCac)}>{giftCac}</dd></div>
                </dl>
              </Section>
              </>
            )}
          </>
        )}
      </article>
      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
