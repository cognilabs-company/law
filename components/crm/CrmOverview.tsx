"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { IconAlert, IconCalendar, IconChartBar, IconDownload, IconPlus, IconPower, IconRefresh, IconTarget } from "@/components/icons";
import { fmtNum } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { CRM_STATUSES, crmCan, getMyCrmMetrics, listCrmLeads, type CrmLead, type CrmMeta, type CrmMetrics } from "@/lib/services/crm";
import { useCrmEvents, useNow } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Empty, StatusPill, WhenChip, useCrmError } from "./bits";
import { StatusDonut } from "./StatusDonut";

type Period = "7" | "30" | "all";
const PERIODS: Period[] = ["7", "30", "all"];
const rangeOf = (p: Period): { from?: string } => (p === "all" ? {} : { from: new Date(Date.now() - Number(p) * 86_400_000).toISOString().slice(0, 10) });

export default function CrmOverview(): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame
      title={t("overview.title")}
      tools={(api) => (
        <>
          {crmCan(api.meta, "crm.exports.create") ? (
            <button type="button" className="crm-btn crm-btn--icon" onClick={() => api.open("export")} aria-label={t("export.title")} title={t("export.title")}>
              <IconDownload aria-hidden="true" />
            </button>
          ) : null}
          {crmCan(api.meta, "crm.leads.manage") ? (
            <button type="button" className="crm-btn crm-btn--pri" onClick={() => api.open("lead")}>
              <IconPlus aria-hidden="true" />
              {t("newLead.title")}
            </button>
          ) : null}
        </>
      )}
    >
      {(api) => <Mission meta={api.meta} />}
    </CrmFrame>
  );
}

function Ring({ value, max, label, display }: { value: number; max: number; label: string; display: string }): ReactElement {
  const r = 38;
  const c = 2 * Math.PI * r;
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="crm-gauge">
      <svg viewBox="0 0 92 92" aria-hidden="true">
        <defs>
          <linearGradient id="crm-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--crm-acc)" />
            <stop offset="1" stopColor="var(--crm-cyan)" />
          </linearGradient>
        </defs>
        <circle className="bg" cx="46" cy="46" r={r} />
        <circle className="fg" cx="46" cy="46" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <b className="crm-gauge__v" data-long={String(display).length > 4 || undefined}>
        {display}
      </b>
      <small>{label}</small>
    </div>
  );
}

function Mission({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.overview");
  const locale = useLocale();
  const router = useRouter();
  const crmErr = useCrmError();
  const now = useNow();
  const [queue, setQueue] = useState<number | null>(null);
  const [mine, setMine] = useState<CrmLead[] | null>(null);
  const [mineTotal, setMineTotal] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<CrmMetrics | null>(null);
  const [period, setPeriod] = useState<Period>("30");
  const [err, setErr] = useState("");
  const [bump, setBump] = useState(0);
  const prevQueue = useRef<number | null>(null);
  const canLeads = crmCan(meta, "crm.leads.view");
  const canSelf = crmCan(meta, "crm.analytics.self");

  const loadLists = useCallback(
    async (signal?: AbortSignal) => {
      if (!canLeads) return;
      try {
        const [q, m] = await Promise.all([listCrmLeads({ queueOnly: true, limit: 1 }, signal), listCrmLeads({ mineOnly: true, limit: 100 }, signal)]);
        setQueue(q.total);
        setCounts(q.counts);
        setMine(m.items);
        setMineTotal(m.total);
        setErr("");
        if (prevQueue.current !== null && q.total > prevQueue.current) setBump((b) => b + 1);
        prevQueue.current = q.total;
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.overview", e);
        setErr(crmErr(e));
      }
    },
    [canLeads, crmErr],
  );
  const loadMetrics = useCallback(
    async (signal?: AbortSignal) => {
      if (!canSelf) return;
      try {
        setMetrics(await getMyCrmMetrics(rangeOf(period), signal));
      } catch (e) {
        if (!isAborted(e)) logApiError("crm.metrics", e);
      }
    },
    [canSelf, period],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void loadLists(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [loadLists]);
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void loadMetrics(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [loadMetrics]);
  useCrmEvents((ev) => {
    if (ev.invalidate.some((k) => k === "all" || k === "queue" || k === "lists" || k === "counts" || k === "lead")) void loadLists();
    if (ev.invalidate.some((k) => k === "all" || k === "metrics")) void loadMetrics();
  });

  const agenda = (mine ?? [])
    .filter((l) => l.nextActionAt && l.status !== "closed" && l.status !== "won")
    .sort((a, b) => Date.parse(a.nextActionAt) - Date.parse(b.nextActionAt))
    .slice(0, 8);
  const overdue = metrics?.overdue ?? agenda.filter((l) => now && Date.parse(l.nextActionAt) < now).length;

  return (
    <>
      <section className="crm-hero" aria-labelledby="crm-hero-t">
        <div className="crm-hero__top">
          <h2 id="crm-hero-t">{t("hero")}</h2>
          <p>{t("heroLead")}</p>
        </div>
        <div className="crm-counters">
          <Link className="crm-counter" href="/admin/crm/leads?tab=queue" data-bump={bump ? bump : undefined} key={`q-${bump}`}>
            <small>{t("queue")}</small>
            <b>{queue === null ? "—" : fmtNum(queue, locale)}</b>
            <span>{t("queueSub")}</span>
          </Link>
          <Link className="crm-counter" href="/admin/crm/leads?tab=mine">
            <small>{t("mine")}</small>
            <b>{mineTotal === null ? "—" : fmtNum(metrics?.active ?? mineTotal, locale)}</b>
            <span>{t("mineSub")}</span>
          </Link>
          <Link className="crm-counter" href="/admin/crm/leads?tab=mine&due=overdue" data-tone={overdue > 0 ? "bad" : undefined}>
            <small>{t("overdue")}</small>
            <b>{fmtNum(overdue, locale)}</b>
            <span>{t("overdueSub")}</span>
          </Link>
        </div>
      </section>

      {err ? (
        <div className="crm-err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{err}</span>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void loadLists()}>
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
      ) : null}

      {canLeads ? (
        <section className="crm-card crm-rise" aria-labelledby="crm-by-status">
          <h3 className="crm-card__h" id="crm-by-status">
            <IconChartBar aria-hidden="true" />
            {t("ribbon")}
            <small className="crm-hide-sm">{t("donut.hint")}</small>
          </h3>
          <StatusDonut counts={counts} statuses={CRM_STATUSES} onPick={(s) => router.push(`/admin/crm/leads?tab=all&status=${s}`)} />
        </section>
      ) : null}

      <div className="crm-grid">
        <section className="crm-card" aria-labelledby="crm-today">
          <h3 className="crm-card__h" id="crm-today">
            <IconCalendar aria-hidden="true" />
            {t("today")}
            <small>{agenda.length ? t("todayN", { n: agenda.length }) : ""}</small>
          </h3>
          {mine === null ? (
            <>
              <span className="crm-sk" />
              <span className="crm-sk" style={{ width: "70%" }} />
              <span className="crm-sk" style={{ width: "85%" }} />
            </>
          ) : agenda.length ? (
            <ol className="crm-agenda">
              {agenda.map((l) => {
                const late = !!now && Date.parse(l.nextActionAt) < now;
                return (
                  <li key={l.id} data-overdue={late || undefined}>
                    <i aria-hidden="true" />
                    <Link href={`/admin/crm/leads/${encodeURIComponent(l.id)}`}>
                      <b>{l.title || l.workId}</b>
                      <small>
                        {l.customer?.name || "—"} · <StatusPill status={l.status} />
                      </small>
                    </Link>
                    <WhenChip at={l.nextActionAt} now={now} />
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty icon={<IconCalendar />} title={t("todayEmpty")} text={t("todayEmptyText")} />
          )}
        </section>

        <div className="crm-rise" style={{ display: "grid", gap: 16 }}>
          {canSelf ? (
            <section className="crm-card" aria-labelledby="crm-me">
              <h3 className="crm-card__h" id="crm-me">
                <IconTarget aria-hidden="true" />
                {t("me")}
                <span className="crm-period" role="group" aria-label={t("period")}>
                  {PERIODS.map((p) => (
                    <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                      {t(`p${p}`)}
                    </button>
                  ))}
                </span>
              </h3>
              {metrics ? (
                <div className="crm-gauges">
                  <Ring value={metrics.conversion} max={100} display={`${fmtNum(metrics.conversion, locale, 1)}%`} label={t("conversion")} />
                  <Ring
                    value={metrics.firstResponseMin === null ? 0 : Math.max(0, 120 - metrics.firstResponseMin)}
                    max={120}
                    display={metrics.firstResponseMin === null ? "—" : t("minShort", { n: Math.round(metrics.firstResponseMin) })}
                    label={t("firstResponse")}
                  />
                  <Ring value={metrics.won} max={Math.max(1, metrics.total)} display={fmtNum(metrics.won, locale)} label={t("won", { n: metrics.total })} />
                </div>
              ) : (
                <span className="crm-sk crm-sk--block" />
              )}
              <p className="crm-sub">{t("noRevenue")}</p>
            </section>
          ) : null}
          <Telephony meta={meta} />
          {crmCan(meta, "crm.analytics.global") && meta.revenueVisible ? (
            <Link href="/admin/crm/analytics" className="crm-btn" style={{ justifySelf: "start" }}>
              <IconChartBar aria-hidden="true" />
              {t("toAnalytics")}
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}

// Honest about the phone line: no provider, no fake call (§7).
export function Telephony({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.tel");
  const tel = meta.telephony;
  return (
    <div className="crm-tel" data-off={!tel.enabled || undefined} role="status">
      <i aria-hidden="true">
        <IconPower />
      </i>
      <span>
        <b>{tel.enabled ? t("on", { provider: tel.provider }) : t("off")}</b>
        <p>{tel.enabled ? (tel.recordingConsentRequired ? t("consent") : t("onText")) : t("offText")}</p>
      </span>
    </div>
  );
}
