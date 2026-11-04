"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlarmClock, ArrowUpRight, Bot, CircleAlert, ClipboardCheck, Gauge, Inbox, PhoneCall, Repeat, Target, Timer, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtNum } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { initials } from "@/lib/lawyers";
import { crmCan, getCrmKanban, getMyCrmMetrics, listCrmLeads, listCrmOperators, listLiveCalls, type CrmKanban, type CrmMeta, type CrmMetrics, type CrmOperator, type LiveCall } from "@/lib/services/crm";
import { getAutomationMetrics, listApprovalDrafts, type AutomationMetrics } from "@/lib/services/crmAutomation";
import { useCrmEvents } from "@/lib/crm/useCrm";
import CrmFrame from "../CrmFrame";
import { CrmDate } from "../fields";
import { useCrmError } from "../bits";

// The ROP overview (ROP final contract §6, §24): operational cards only.
// Built from /crm/me/metrics, the Kanban counts, the unassigned queue,
// /crm/operators, /crm/automation/metrics + drafts and /crm/live-calls.
// GET /crm/analytics is never called here (superadmin-only), and no revenue,
// income, commission or salary figure exists on this page.

type Data = {
  metrics: CrmMetrics | null;
  kanban: CrmKanban | null;
  queue: number | null;
  ops: CrmOperator[] | null;
  auto: AutomationMetrics | null;
  drafts: number | null;
  calls: LiveCall[] | null;
};
const EMPTY: Data = { metrics: null, kanban: null, queue: null, ops: null, auto: null, drafts: null, calls: null };
const iso = (d: string, end = false) => (d ? new Date(`${d}T${end ? "23:59:59" : "00:00:00"}`).toISOString() : undefined);
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export default function RopOverview(): ReactElement {
  const t = useTranslations("rop");
  return (
    <CrmFrame section="overview" title={t("nav.overview")} noTray>
      {(api) => <Board meta={api.meta} />}
    </CrmFrame>
  );
}

function Board({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("rop.ov");
  const locale = useLocale();
  const crmErr = useCrmError();
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<Data>(EMPTY);
  const [errs, setErrs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const canAuto = crmCan(meta, "crm.automation.manage");
  const canLive = crmCan(meta, "crm.live_calls.view");
  const canLeads = crmCan(meta, "crm.leads.view");

  const load = useCallback(
    (signal?: AbortSignal) => {
      const range = { from: iso(from), to: iso(to, true) };
      const none = Promise.resolve(null);
      return Promise.allSettled([
        getMyCrmMetrics(range, signal),
        canLeads ? getCrmKanban({ columnLimit: 1 }, signal) : none,
        canLeads ? listCrmLeads({ queueOnly: true, limit: 1 }, signal) : none,
        canLeads ? listCrmOperators("", signal) : none,
        canAuto ? getAutomationMetrics(range, signal) : none,
        canAuto ? listApprovalDrafts({ status: "pending_approval", limit: 1 }, signal) : none,
        canLive ? listLiveCalls(signal) : none,
      ]).then((r) => {
        const v = <T,>(i: number): T | null => (r[i].status === "fulfilled" ? ((r[i] as PromiseFulfilledResult<T>).value ?? null) : null);
        const failed = r.filter((x) => x.status === "rejected" && !isAborted((x as PromiseRejectedResult).reason)) as PromiseRejectedResult[];
        failed.forEach((x) => logApiError("rop.overview", x.reason));
        setErrs(failed.map((x) => crmErr(x.reason)));
        setData({
          metrics: v<CrmMetrics>(0),
          kanban: v<CrmKanban>(1),
          queue: v<{ total: number }>(2)?.total ?? null,
          ops: v<CrmOperator[]>(3),
          auto: v<AutomationMetrics>(4),
          drafts: v<{ total: number }>(5)?.total ?? null,
          calls: v<{ items: LiveCall[] }>(6)?.items ?? null,
        });
        setLoading(false);
      });
    },
    [from, to, canAuto, canLive, canLeads, crmErr],
  );
  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load]);
  // Realtime: any CRM change refreshes the cards, at most every 1.2 s.
  useCrmEvents(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void load(), 1200);
  });

  const m = data.metrics;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmtNum(v, locale));
  const columns = data.kanban?.columns ?? [];
  const totalLeads = data.kanban ? data.kanban.total || columns.reduce((s, c) => s + c.count, 0) : null;
  const maxCol = Math.max(1, ...columns.map((c) => c.count));
  const ops = useMemo(() => (data.ops ?? []).slice().sort((a, b) => b.activeLeads - a.activeLeads), [data.ops]);
  const maxOp = Math.max(1, ...ops.map((o) => o.activeLeads));
  const failed = data.auto ? (data.auto.byStatus.failed ?? 0) + (data.auto.byStatus.partially_failed ?? 0) : null;
  const span = (min: number | null) => (min === null ? "—" : min < 60 ? t("min", { n: Math.round(min) }) : t("hours", { n: fmtNum(min / 60, locale, 1) }));

  return (
    <div className="rop-page" data-rop-overview="">
      <div className="rop-toolbar">
        <p className="rop-muted">{t("lead")}</p>
        <div className="rop-toolbar__sp">
          <CrmDate value={from} onChange={(v) => setFrom(v)} label={t("from")} max={to || undefined} />
          <CrmDate value={to} onChange={(v) => setTo(v)} label={t("to")} min={from || undefined} />
        </div>
      </div>
      {errs.length ? (
        <p className="rop-pill rop-pill--warn" role="status" style={{ height: "auto", padding: "8px 12px", whiteSpace: "normal" }}>
          <CircleAlert aria-hidden="true" />
          {t("partial")}
        </p>
      ) : null}

      <div className="rop-grid rop-grid--kpi">
        <Kpi tone="pri" Icon={Target} label={t("allLeads")} value={n(totalLeads)} note={t("activeN", { n: n(m?.active) })} href="/admin/crm/kanban" loading={loading} />
        <Kpi Icon={Inbox} label={t("queue")} value={n(data.queue)} note={t("queueNote")} href="/admin/crm/leads?tab=queue" loading={loading} />
        <Kpi tone={m && m.overdue > 0 ? "warn" : undefined} Icon={AlarmClock} label={t("overdue")} value={n(m?.overdue)} note={t("overdueNote")} href="/admin/crm/leads?tab=all&due=overdue" loading={loading} />
        {canLive ? <Kpi Icon={PhoneCall} label={t("calls")} value={n(data.calls?.length)} note={t("callsNote")} href="/admin/crm/live" loading={loading} /> : <Kpi Icon={Gauge} label={t("conversion")} value={m ? `${fmtNum(m.conversion, locale, 1)}%` : "—"} note={t("conversionNote")} loading={loading} />}
      </div>

      <div className="rop-grid rop-grid--2">
        <section className="rop-card" aria-labelledby="rop-st">
          <div className="rop-card__h">
            <h2 id="rop-st" className="rop-h2"><Target aria-hidden="true" />{t("byStatus")}</h2>
            <span className="rop-pill">{t("leadsN", { n: n(totalLeads) })}</span>
          </div>
          {loading ? <Sk n={6} /> : columns.length ? (
            <ul className="rop-bars">
              {columns.map((c) => (
                <li key={c.key} style={{ "--c": c.color || "var(--lx-blue)" } as React.CSSProperties}>
                  <span><i className="rop-dot" />{c.title}</span>
                  <i><em style={{ width: `${(c.count / maxCol) * 100}%` }} /></i>
                  <span>{n(c.count)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty Icon={Target} text={t("noLeads")} />}
          <div className="rop-grid rop-grid--3" style={{ gap: 12 }}>
            <Mini label={t("conversion")} value={m ? `${fmtNum(m.conversion, locale, 1)}%` : "—"} Icon={Gauge} />
            <Mini label={t("firstResponse")} value={span(m?.firstResponseMin ?? null)} Icon={Timer} />
            <Mini label={t("wonClosed")} value={m ? `${n(m.won)} / ${n(m.closed)}` : "—"} Icon={Target} />
          </div>
        </section>

        <section className="rop-card" aria-labelledby="rop-ops">
          <div className="rop-card__h">
            <h2 id="rop-ops" className="rop-h2"><Users aria-hidden="true" />{t("workload")}</h2>
            <Link href="/admin/crm/operators" className="crm-btn">{t("allOperators")}<ArrowUpRight aria-hidden="true" /></Link>
          </div>
          {loading ? <Sk n={5} /> : ops.length ? (
            <ul className="rop-list">
              {ops.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link className="rop-row" href={`/admin/crm/leads?tab=all&operator=${encodeURIComponent(o.id)}`}>
                    <span className="rop-av">{initials(o.name || "O")}</span>
                    <span className="rop-row__b">
                      <b>{o.name}</b>
                      <span className="rop-bars" style={{ display: "block" }}><i style={{ display: "block" }}><em style={{ width: `${(o.activeLeads / maxOp) * 100}%` }} /></i></span>
                    </span>
                    <span className="rop-pill rop-pill--blue">{t("activeLeads", { n: o.activeLeads })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty Icon={Users} text={t("noOperators")} />}
        </section>
      </div>

      <div className="rop-grid rop-grid--3">
        {canAuto ? (
          <section className="rop-card" aria-labelledby="rop-auto">
            <div className="rop-card__h">
              <h2 id="rop-auto" className="rop-h2"><Bot aria-hidden="true" />{t("robots")}</h2>
              <Link href="/admin/crm/automation/runs" className="crm-btn">{t("runs")}</Link>
            </div>
            {loading ? <Sk n={3} /> : data.auto ? (
              <dl className="rop-kv">
                <dt>{t("runsTotal")}</dt>
                <dd>{n(data.auto.total)}</dd>
                <dt>{t("successRate")}</dt>
                <dd>{data.auto.successRate === null ? "—" : `${fmtNum(data.auto.successRate, locale, 1)}%`}</dd>
                <dt>{t("failures")}</dt>
                <dd>{failed ? <Link href="/admin/crm/automation/runs?status=failed" className="rop-pill rop-pill--bad">{n(failed)}</Link> : n(failed)}</dd>
                <dt>{t("queueSize")}</dt>
                <dd>{n(data.auto.queueSize)}</dd>
                <dt>{t("queueLag")}</dt>
                <dd>{data.auto.queueLagSec === null ? "—" : span(data.auto.queueLagSec / 60)}</dd>
              </dl>
            ) : <Empty Icon={Bot} text={t("noRobots")} />}
          </section>
        ) : null}
        {canAuto ? (
          <section className="rop-card" aria-labelledby="rop-dr">
            <div className="rop-card__h">
              <h2 id="rop-dr" className="rop-h2"><ClipboardCheck aria-hidden="true" />{t("approvals")}</h2>
            </div>
            <b className="rop-kpi__v">{n(data.drafts)}</b>
            <p className="rop-muted">{t("approvalsNote")}</p>
            <Link href="/admin/crm/automation/drafts" className="crm-btn crm-btn--pri">{t("review")}</Link>
          </section>
        ) : null}
        <section className="rop-card" aria-labelledby="rop-cy">
          <div className="rop-card__h">
            <h2 id="rop-cy" className="rop-h2"><Repeat aria-hidden="true" />{t("cycles")}</h2>
          </div>
          {loading ? <Sk n={3} /> : m ? (
            <dl className="rop-kv">
              <dt>{t("cyclesTotal")}</dt>
              <dd>{n(m.cycles.total)}</dd>
              <dt>{t("cyclesOpen")}</dt>
              <dd>{n(m.cycles.open)}</dd>
              <dt>{t("cyclesWon")}</dt>
              <dd>{n(m.cycles.won)}</dd>
              <dt>{t("cyclesRejected")}</dt>
              <dd>{n(m.cycles.rejected)}</dd>
              <dt>{t("conversion")}</dt>
              <dd>{`${fmtNum(m.cycles.conversion, locale, 1)}%`}</dd>
            </dl>
          ) : <Empty Icon={Repeat} text={t("noData")} />}
        </section>
      </div>

      {canLive ? (
        <section className="rop-card" aria-labelledby="rop-live">
          <div className="rop-card__h">
            <h2 id="rop-live" className="rop-h2"><PhoneCall aria-hidden="true" />{t("liveNow")}</h2>
            <Link href="/admin/crm/live" className="crm-btn">{t("openLive")}</Link>
          </div>
          {loading ? <Sk n={2} /> : data.calls?.length ? (
            <ul className="rop-list">
              {data.calls.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link className="rop-row" href={`/admin/crm/live?call=${encodeURIComponent(c.id)}`}>
                    <span className="rop-ic"><PhoneCall /></span>
                    <span className="rop-row__b">
                      <b>{c.customerName || c.lead?.title || t("call")}</b>
                      <small>{[c.operator?.name, c.lead?.workId].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className="rop-pill rop-pill--ok">{t("live")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty Icon={PhoneCall} text={t("noCalls")} />}
        </section>
      ) : null}
    </div>
  );
}

function Kpi({ Icon, label, value, note, href, tone, loading }: { Icon: typeof Target; label: string; value: string; note: string; href?: string; tone?: "pri" | "warn" | "bad"; loading: boolean }): ReactElement {
  const body = (
    <>
      <span className="rop-kpi__top">
        <span className="rop-kpi__ic"><Icon /></span>
        {href ? <ArrowUpRight aria-hidden="true" style={{ width: 18, height: 18, opacity: 0.6 }} /> : null}
      </span>
      <span className="rop-kpi__l">{label}</span>
      <b className="rop-kpi__v">{loading ? "…" : value}</b>
      <span className="rop-kpi__note">{note}</span>
    </>
  );
  const cls = `rop-kpi${tone ? ` rop-kpi--${tone}` : ""}`;
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}
function Mini({ label, value, Icon }: { label: string; value: string; Icon: typeof Target }): ReactElement {
  return (
    <div className="rop-row" style={{ cursor: "default" }}>
      <span className="rop-ic"><Icon /></span>
      <span className="rop-row__b">
        <small>{label}</small>
        <b>{value}</b>
      </span>
    </div>
  );
}
function Sk({ n }: { n: number }): ReactElement {
  return (
    <div className="rop-list" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <span key={i} className="rop-sk" style={{ height: 40 }} />)}
    </div>
  );
}
function Empty({ Icon, text }: { Icon: typeof Target; text: string }): ReactElement {
  return (
    <div className="rop-empty">
      <span className="rop-empty__ic"><Icon /></span>
      <p>{text}</p>
    </div>
  );
}
