"use client";

import "../../panel/panel.css";
import "../leads/leads.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { fmtNum } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { loadCrmMeta, useCrmEvents, useLiveState, useNow } from "@/lib/crm/useCrm";
import { claimCrmLead, crmCan, getMyCrmMetrics, isClaimRace, isFinalStatus, leadCan, listCrmLeads, type CrmLead, type CrmMetrics } from "@/lib/services/crm";
import { prettyPhone } from "../../now/feed";
import { IcArrowRight, IcAward, IcClock, IcInbox, IcLayers, IcRefresh, IcUser } from "../../icons";
import { crmHref, leadHref, type CrmSectionProps } from "../nav";
import { IcBars, IcCalendar, IcPercent, IcPower } from "../leads/icons";
import { NewLeadButton } from "../leads/NewLeadSheet";
import { stageStyle, stageVars, useCrmErr, useDayTime, useStageLabel, useWhen } from "../leads/util";

type Period = "7" | "30" | "all";
const PERIODS: Period[] = ["7", "30", "all"];
const rangeOf = (p: Period): { from?: string } => (p === "all" ? {} : { from: new Date(Date.now() - Number(p) * 86_400_000).toISOString().slice(0, 10) });

function useSpan(): (min: number) => string {
  const tw = useTranslations("crm.when");
  const locale = useLocale();
  return (min) => {
    const m = Math.max(0, min);
    if (m < 60) return tw("min", { n: Math.round(m) });
    const one = (v: number) => fmtNum(v, locale, v < 10 ? 1 : 0);
    if (m < 1440) return tw("h", { n: one(m / 60) });
    return tw("d", { n: one(m / 1440) });
  };
}

export default function CrmOverviewX({ meta }: CrmSectionProps) {
  const t = useTranslations("crm.overview");
  const tl = useTranslations("crm.leads");
  const tlive = useTranslations("crm.live");
  const ttel = useTranslations("crm.tel");
  const tn = useTranslations("crm.notify");
  const tx = useTranslations("admin.ccx.crmLeads");
  const locale = useLocale();
  const router = useRouter();
  const crmErr = useCrmErr();
  const now = useNow();
  const live = useLiveState();
  const label = useStageLabel(meta);
  const when = useWhen();
  const dayTime = useDayTime();
  const span = useSpan();
  const [queue, setQueue] = useState<number | null>(null);
  const [top, setTop] = useState<CrmLead | null>(null);
  const [mine, setMine] = useState<CrmLead[] | null>(null);
  const [mineTotal, setMineTotal] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<CrmMetrics | null>(null);
  const [period, setPeriod] = useState<Period>("30");
  const [err, setErr] = useState("");
  const [bump, setBump] = useState(0);
  const [taking, setTaking] = useState(false);
  const prevQueue = useRef<number | null>(null);
  const canLeads = crmCan(meta, "crm.leads.view");
  const canSelf = crmCan(meta, "crm.analytics.self");
  const tel = meta.telephony;

  const loadLists = useCallback(
    async (signal?: AbortSignal) => {
      if (!canLeads) return;
      try {
        const [q, m] = await Promise.all([listCrmLeads({ queueOnly: true, limit: 1 }, signal), listCrmLeads({ mineOnly: true, limit: 100 }, signal)]);
        setQueue(q.total);
        setTop(q.items[0] ?? null);
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
    if (ev.invalidate.includes("meta") || ev.invalidate.includes("all")) void loadCrmMeta(true);
    if (ev.invalidate.some((k) => k === "all" || k === "queue" || k === "lists" || k === "counts" || k === "lead")) void loadLists();
    if (ev.invalidate.some((k) => k === "all" || k === "metrics")) void loadMetrics();
  });

  const take = async () => {
    if (!top || taking) return;
    setTaking(true);
    try {
      await claimCrmLead(top.id);
      toast(tl("claimed", { title: top.title || top.workId }), { tone: "ok" });
      router.push(leadHref(top.id));
    } catch (e) {
      if (isClaimRace(e)) {
        toast(tl("claimLost"), { tone: "err" });
        void loadLists();
      } else toast(crmErr(e), { tone: "err" });
    } finally {
      setTaking(false);
    }
  };

  const agenda = (mine ?? [])
    .filter((l) => l.nextActionAt && !isFinalStatus(meta, l.status))
    .sort((a, b) => Date.parse(a.nextActionAt) - Date.parse(b.nextActionAt))
    .slice(0, 8);
  const overdue = metrics?.overdue ?? agenda.filter((l) => !!now && Date.parse(l.nextActionAt) < now).length;
  const total = meta.statuses.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const peak = metrics ? Math.max(0, ...meta.statuses.map((s) => metrics.statusCounts[s] ?? 0)) : 0;
  const toStatus = (s: string) => router.push(crmHref("leads", { scope: "all", status: s, layout: "list" }));

  return (
    <div className="opx-ov" style={stageVars(meta)} data-ai-target="callcenter:crm-overview">
      <div className="opx-ov-top">
        <span className="opx-ov-live" data-s={live} role="status">
          <i aria-hidden="true" />
          {tlive(live)}
        </span>
        <p>{t("heroLead")}</p>
        <NewLeadButton meta={meta} />
      </div>

      {err ? (
        <p className="opx-ld-warn" role="alert">
          {err}
          <button type="button" onClick={() => void loadLists()}>
            <IcRefresh size={15} />
            {t("retry")}
          </button>
        </p>
      ) : null}

      {canLeads ? (
        <div className="opx-ov-kpis">
          <section className="opx-ov-kpi" data-bump={bump || undefined} key={`q-${bump}`}>
            <Link href={crmHref("leads", { scope: "queue" })} className="opx-ov-kpi__main">
              <span className="opx-ov-kpi__ic" aria-hidden="true">
                <IcInbox size={26} />
              </span>
              <span className="opx-ov-kpi__txt">
                <small>{t("queue")}</small>
                <b className="opx-num">{queue === null ? "—" : fmtNum(queue, locale)}</b>
                <span>{t("queueSub")}</span>
              </span>
            </Link>
            {top && leadCan(top, "claim") ? (
              <button type="button" className="opx-ov-take" onClick={() => void take()} disabled={taking} aria-busy={taking || undefined}>
                <IcLayers size={16} />
                {tx("take")}
                <IcArrowRight size={15} />
              </button>
            ) : null}
          </section>
          <section className="opx-ov-kpi" data-tone="ok">
            <Link href={crmHref("leads", { scope: "mine" })} className="opx-ov-kpi__main">
              <span className="opx-ov-kpi__ic" aria-hidden="true">
                <IcUser size={26} />
              </span>
              <span className="opx-ov-kpi__txt">
                <small>{t("mine")}</small>
                <b className="opx-num">{mineTotal === null ? "—" : fmtNum(metrics?.active ?? mineTotal, locale)}</b>
                <span>{t("mineSub")}</span>
              </span>
            </Link>
          </section>
          <section className="opx-ov-kpi" data-tone={overdue > 0 ? "hot" : undefined}>
            <Link href={crmHref("leads", { scope: "mine", due: "overdue" })} className="opx-ov-kpi__main">
              <span className="opx-ov-kpi__ic" aria-hidden="true">
                <IcClock size={26} />
              </span>
              <span className="opx-ov-kpi__txt">
                <small>{t("overdue")}</small>
                <b className="opx-num">{mine === null && !metrics ? "—" : fmtNum(overdue, locale)}</b>
                <span>{t("overdueSub")}</span>
              </span>
            </Link>
          </section>
        </div>
      ) : null}

      {canLeads ? (
        <section className="opx-ov-card" aria-labelledby="opx-ov-rib">
          <header className="opx-ov-h">
            <IcBars size={19} />
            <h3 id="opx-ov-rib">{t("ribbon")}</h3>
            {total ? <small>{t("donut.hint")}</small> : null}
          </header>
          {total ? (
            <>
              <div className="opx-ov-ribbon">
                {meta.statuses.map((s) => {
                  const n = counts[s] ?? 0;
                  if (!n) return null;
                  const p = Math.round((n / total) * 100);
                  return (
                    <button key={s} type="button" className="opx-ov-seg" style={{ ...stageStyle(s), flexGrow: n }} aria-label={t("donut.row", { status: label(s), n, p })} title={`${label(s)}: ${n}`} onClick={() => toStatus(s)}>
                      {p >= 8 ? <span className="opx-num">{`${n} (${p}%)`}</span> : null}
                    </button>
                  );
                })}
              </div>
              <ul className="opx-ov-legend">
                {meta.statuses.map((s) => (
                  <li key={s}>
                    <button type="button" style={stageStyle(s)} onClick={() => toStatus(s)}>
                      <i aria-hidden="true" />
                      {label(s)}
                      <b className="opx-num">{counts[s] ?? 0}</b>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : queue === null ? (
            <i className="opx-shim opx-ov-ribbon-sk" />
          ) : (
            <p className="opx-ov-none">{t("donut.empty")}</p>
          )}
        </section>
      ) : null}

      <div className={`opx-ov-grid${canLeads ? "" : " is-solo"}`}>
        {canLeads ? (
          <section className="opx-ov-card opx-ov-agenda" aria-labelledby="opx-ov-today">
            <header className="opx-ov-h">
              <IcCalendar size={19} />
              <h3 id="opx-ov-today">{t("today")}</h3>
              {agenda.length ? <em className="opx-ov-count opx-num">{t("todayN", { n: agenda.length })}</em> : null}
              <Link href={crmHref("leads", { scope: "mine" })} className="opx-ov-all">
                {tx("seeAll")}
                <IcArrowRight size={14} />
              </Link>
            </header>
            {mine === null ? (
              <div className="opx-ov-sk">
                <i className="opx-shim" />
                <i className="opx-shim" />
                <i className="opx-shim" />
              </div>
            ) : agenda.length ? (
              <ol className="opx-ov-list">
                {agenda.map((l) => {
                  const w = when(l.nextActionAt, now);
                  return (
                    <li key={l.id}>
                      <Link href={leadHref(l.id)} className="opx-ov-row" data-tone={w?.tone || undefined}>
                        <span className="opx-ov-time opx-num">{dayTime(l.nextActionAt, now, true)}</span>
                        <span className="opx-ov-who">
                          <small className="opx-num">{l.workId}</small>
                          <b>{l.customer?.name || "—"}</b>
                          {l.customer?.phone ? (
                            <small className="opx-num" dir="ltr">
                              {prettyPhone(l.customer.phone)}
                            </small>
                          ) : null}
                        </span>
                        <span className="opx-ov-what">
                          <b>{l.title || l.workId}</b>
                          <small>
                            <span className="opx-ld-stage" style={stageStyle(l.status)}>
                              <i aria-hidden="true" />
                              {label(l.status)}
                            </span>
                            {w ? <em>{w.text}</em> : null}
                          </small>
                        </span>
                        <span className="opx-ov-open">
                          {tn("open")}
                          <IcArrowRight size={14} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="opx-ld-empty is-flat">
                <span className="opx-ld-empty__ic" aria-hidden="true">
                  <IcCalendar size={24} />
                </span>
                <b>{t("todayEmpty")}</b>
                <p>{t("todayEmptyText")}</p>
              </div>
            )}
          </section>
        ) : null}

        <div className="opx-ov-side">
          {canSelf ? (
            <section className="opx-ov-card" aria-labelledby="opx-ov-me">
              <header className="opx-ov-h">
                <IcAward size={19} />
                <h3 id="opx-ov-me">{t("me")}</h3>
                <div className="opx-ld-seg opx-ov-period" role="group" aria-label={t("period")}>
                  {PERIODS.map((p) => (
                    <button key={p} type="button" className={period === p ? "is-on" : undefined} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                      {t(`p${p}`)}
                    </button>
                  ))}
                </div>
              </header>
              {metrics ? (
                <>
                  <div className="opx-ov-tiles">
                    <div className="opx-ov-tile">
                      <span>
                        <IcAward size={16} />
                        {label("won")}
                      </span>
                      <b className="opx-num">{fmtNum(metrics.won, locale)}</b>
                      <small>{t("won", { n: metrics.total })}</small>
                    </div>
                    <div className="opx-ov-tile">
                      <span>
                        <IcPercent size={16} />
                        {t("conversion")}
                      </span>
                      <b className="opx-num">{`${fmtNum(metrics.conversion, locale, 1)}%`}</b>
                    </div>
                    <div className="opx-ov-tile">
                      <span>
                        <IcClock size={16} />
                        {t("firstResponse")}
                      </span>
                      <b className="opx-num">{metrics.firstResponseMin === null ? "—" : span(metrics.firstResponseMin)}</b>
                    </div>
                    <div className="opx-ov-tile">
                      <span>
                        <IcLayers size={16} />
                        {tx("active")}
                      </span>
                      <b className="opx-num">{fmtNum(metrics.active, locale)}</b>
                    </div>
                  </div>
                  <div className="opx-ov-chart">
                    <p className="opx-ov-chart__h">{tx("byStatus")}</p>
                    {peak ? (
                      <div className="opx-ov-bars" role="list">
                        {meta.statuses.map((s) => {
                          const n = metrics.statusCounts[s] ?? 0;
                          return (
                            <div key={s} role="listitem" className="opx-ov-bar" style={stageStyle(s)} aria-label={`${label(s)}: ${n}`}>
                              <b className="opx-num">{n}</b>
                              <span className="opx-ov-bar__track">
                                <i style={{ height: `${n ? Math.max(4, (n / peak) * 100) : 0}%` }} />
                              </span>
                              <small title={label(s)}>{label(s)}</small>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="opx-ov-none">{t("donut.empty")}</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="opx-ov-sk">
                  <i className="opx-shim" />
                  <i className="opx-shim" />
                </div>
              )}
              <p className="opx-ov-note">{t("noRevenue")}</p>
            </section>
          ) : null}
          <div className="opx-ov-tel" data-off={!tel.enabled || undefined} role="status">
            <span className="opx-ov-tel__ic" aria-hidden="true">
              <IcPower size={18} />
            </span>
            <span>
              <b>{tel.enabled ? ttel("on", { provider: tel.provider }) : ttel("off")}</b>
              <small>{tel.enabled ? (tel.recordingConsentRequired ? ttel("consent") : ttel("onText")) : ttel("offText")}</small>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
