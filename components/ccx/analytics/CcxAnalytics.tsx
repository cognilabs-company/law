"use client";

import "../panel/panel.css";
import "./analytics.css";
import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EMPTY_FILTER, getCallAnalyticsFull, isCallsEmpty, isFiltered, todayIso, trimSeries, type DashFilter } from "@/lib/services/dash";
import { demoCalls, useDemoForced } from "@/lib/demoStats";
import { useResourceOne } from "@/lib/useResource";
import { fmtInt } from "@/lib/date";
import { Note } from "../panel/bits";
import PickField from "../tasks/PickField";
import { IcArrowRight, IcBolt, IcChart, IcCheck, IcClock, IcClose, IcPhone, IcRefresh, IcUser } from "../icons";
import AnaChart from "./AnaChart";
import AnaDrill from "./AnaDrill";
import { EMPTY_CALLS, PERIODS, applyPeriod, mmss, modeOf, periodOf, rates, type DrillKind, type Mode, type Period } from "./model";

type TileTone = "ok" | "hot" | "info";

function Tile({ icon, tone, label, value, sub, more, onOpen, i }: { icon: ReactNode; tone: TileTone; label: string; value: string; sub: string; more: string; onOpen: () => void; i: number }) {
  return (
    <button type="button" className="opx-an-tile" data-tone={tone} onClick={onOpen} style={{ animationDelay: `${i * 55}ms` }} aria-label={`${label}: ${value}. ${more}`}>
      <span className="opx-an-tile__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="opx-an-tile__txt">
        <small>{label}</small>
        <b className="opx-num">{value}</b>
        <span className="opx-an-tile__sub">{sub}</span>
      </span>
      <IcArrowRight size={16} className="opx-an-tile__go" />
    </button>
  );
}

export default function CcxAnalytics() {
  const t = useTranslations("admin.callAnalytics");
  const td = useTranslations("admin.dash");
  const tx = useTranslations("admin.ccx.analytics");
  const locale = useLocale();
  const [filter, setFilter] = useState<DashFilter>(EMPTY_FILTER);
  const [mode, setMode] = useState<Mode>("");
  const [demoForced, setDemoForced] = useDemoForced();
  const [rev, setRev] = useState(0);
  const [drill, setDrill] = useState<DrillKind | null>(null);
  const fkey = `${filter.region}|${filter.from}|${filter.to}|${rev}`;
  const res = useResourceOne(() => getCallAnalyticsFull(filter), [fkey]);
  const [settled, setSettled] = useState<typeof res | null>(null);
  if (res.status !== "loading" && settled !== res) setSettled(res);
  const view = res.status === "loading" ? settled : res;
  const loaded = view !== null;
  const busy = res.status === "loading";
  const viewData = view?.data ?? null;
  const failed = !demoForced && view?.status === "error";
  const demo = demoForced || (loaded && !failed && (!viewData || isCallsEmpty(viewData)));
  const a = useMemo(() => (demo ? demoCalls(todayIso()) : viewData ?? EMPTY_CALLS), [demo, viewData]);
  const byDay = trimSeries(a.byDay, filter);
  const r = rates(a);
  const period = periodOf(filter, mode);
  const daySum = byDay.reduce((s, p) => s + p.value, 0);
  const agentMax = Math.max(1, ...a.topAgents.map((ag) => ag.calls));
  const share = (n: number) => (a.total ? Math.min(100, (n / a.total) * 100) : 0);
  const more = td("drill.open");

  const pickPeriod = (p: Period) => {
    setMode(modeOf(p));
    setFilter(applyPeriod(filter, p));
  };
  const setDate = (patch: Partial<DashFilter>) => {
    setMode("custom");
    setFilter({ ...filter, ...patch, preset: "" });
  };
  const periodLabel = (p: Period) => (p === "" ? td("filter.allTime") : td(`filter.${p}`));

  return (
    <div className="opx-an" data-ai-target="callcenter:analytics">
      <header className="opx-an-head">
        <span className="opx-an-head__ic" aria-hidden="true">
          <IcChart size={22} />
        </span>
        <h2>{t("title")}</h2>
        <div className="opx-an-seg" role="group" aria-label={td("filter.period")}>
          {PERIODS.map((p) => (
            <button key={p || "all"} type="button" className={period === p ? "is-on" : undefined} aria-pressed={period === p} onClick={() => pickPeriod(p)}>
              {periodLabel(p)}
            </button>
          ))}
        </div>
        {period === "custom" ? (
          <div className="opx-an-dates" role="group" aria-label={td("filter.custom")}>
            <PickField value={filter.from} max={filter.to || undefined} label={tx("dateFrom")} placeholder={tx("dateFrom")} onChange={(v) => setDate({ from: v })} />
            <span aria-hidden="true">–</span>
            <PickField value={filter.to} min={filter.from || undefined} label={tx("dateTo")} placeholder={tx("dateTo")} onChange={(v) => setDate({ to: v })} />
          </div>
        ) : null}
        <div className="opx-an-head__tools">
          <button type="button" role="switch" aria-checked={demoForced} className={`opx-an-demo${demoForced ? " is-on" : ""}`} onClick={() => setDemoForced(!demoForced)} title={td("filter.demoTitle")}>
            <IcBolt size={16} />
            <span>{td("filter.demo")}</span>
            <i aria-hidden="true" />
          </button>
          <button type="button" className={`opx-an-sync${busy ? " is-busy" : ""}`} onClick={() => setRev((v) => v + 1)} aria-label={tx("refresh")} title={tx("refresh")} disabled={busy}>
            <IcRefresh size={17} />
          </button>
        </div>
      </header>

      {isFiltered(filter) ? <p className="opx-an-note">{tx("filterNote")}</p> : null}
      {demo && loaded ? <Note tone="info">{demoForced ? td("demo.forced") : tx("demoBanner")}</Note> : null}

      {failed ? (
        <div className={`opx-an-fail${busy ? " is-busy" : ""}`} role="alert">
          <span className="opx-an-fail__orb" aria-hidden="true">
            <IcChart size={26} />
          </span>
          <p>{tx("loadError")}</p>
          <button type="button" className="opx-pbtn" onClick={() => setRev((v) => v + 1)} disabled={busy}>
            <IcRefresh size={16} />
            {tx("retry")}
          </button>
        </div>
      ) : !loaded ? (
        <div className="opx-an-wait" aria-busy="true" aria-label={td("drill.loading")}>
          <div className="opx-an-tiles">
            {[0, 1, 2, 3].map((k) => (
              <i key={k} className="opx-shim opx-an-wait__tile" />
            ))}
          </div>
          <i className="opx-shim opx-an-wait__chart" />
        </div>
      ) : (
        <div className={`opx-an-body${busy ? " is-busy" : ""}`} aria-busy={busy}>
          <div className="opx-an-tiles" data-ai-target="call-analytics:kpis">
            <Tile i={0} tone="info" icon={<IcPhone size={22} />} label={t("total")} value={fmtInt(a.total, locale)} sub={more} more={more} onOpen={() => setDrill("total")} />
            <Tile i={1} tone="ok" icon={<IcCheck size={22} />} label={t("answered")} value={fmtInt(a.answered, locale)} sub={`${t("answerRate")}: ${r.answer}%`} more={more} onOpen={() => setDrill("answered")} />
            <Tile i={2} tone="hot" icon={<IcClose size={22} />} label={t("missed")} value={fmtInt(a.missed, locale)} sub={`${td("drill.missRate")}: ${r.miss}%`} more={more} onOpen={() => setDrill("missed")} />
            <Tile i={3} tone="info" icon={<IcClock size={22} />} label={t("avg")} value={mmss(a.avgDurationSec)} sub={more} more={more} onOpen={() => setDrill("avg")} />
          </div>

          <div className="opx-an-grid">
            <section className="opx-an-card opx-an-chart" data-ai-target="call-analytics:by-day" aria-labelledby="opx-an-byday">
              <header className="opx-an-card__head">
                <span className="opx-an-card__ic" aria-hidden="true">
                  <IcChart size={18} />
                </span>
                <span className="opx-an-card__t">
                  <h3 id="opx-an-byday">{t("byDay")}</h3>
                  <small>{t("total")}</small>
                </span>
                {demo ? (
                  <span className="opx-pill" data-tone="warn">
                    {td("demo.badge")}
                  </span>
                ) : null}
                {byDay.length ? <b className="opx-an-card__sum opx-num">{tx("inPeriod", { n: fmtInt(daySum, locale) })}</b> : null}
              </header>
              {byDay.length ? (
                <AnaChart
                  days={byDay.map((p) => p.label)}
                  series={[{ key: "total", label: t("total"), tone: "aqua", values: byDay.map((p) => p.value) }]}
                  label={tx("chartAria")}
                  hint={tx("chartKeys")}
                  totalLabel={td("drill.total")}
                />
              ) : (
                <p className="opx-an-none">{t("noData")}</p>
              )}
            </section>

            <div className="opx-an-side">
              <section className="opx-an-card opx-an-split" aria-labelledby="opx-an-rate">
                <header className="opx-an-card__head">
                  <span className="opx-an-card__ic" aria-hidden="true">
                    <IcCheck size={18} />
                  </span>
                  <span className="opx-an-card__t">
                    <h3 id="opx-an-rate">{t("answerRate")}</h3>
                  </span>
                  <b className="opx-an-split__pct opx-num">{a.total ? `${r.answer}%` : "—"}</b>
                </header>
                {a.total ? (
                  <>
                    <div className="opx-an-split__bar" aria-hidden="true">
                      <i data-tone="ok" style={{ width: `${share(a.answered)}%` }} />
                      <i data-tone="hot" style={{ width: `${share(a.missed)}%` }} />
                    </div>
                    <ul className="opx-an-split__keys">
                      <li data-tone="ok">
                        <i aria-hidden="true" />
                        <span>{t("answered")}</span>
                        <b className="opx-num">{fmtInt(a.answered, locale)}</b>
                      </li>
                      <li data-tone="hot">
                        <i aria-hidden="true" />
                        <span>{t("missed")}</span>
                        <b className="opx-num">{fmtInt(a.missed, locale)}</b>
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="opx-an-none">{t("noData")}</p>
                )}
              </section>

              <section className="opx-an-card opx-an-agents" data-ai-target="call-analytics:agents" aria-labelledby="opx-an-agents">
                <header className="opx-an-card__head">
                  <span className="opx-an-card__ic" aria-hidden="true">
                    <IcUser size={18} />
                  </span>
                  <span className="opx-an-card__t">
                    <h3 id="opx-an-agents">{t("topAgents")}</h3>
                  </span>
                  {a.topAgents.length ? <b className="opx-an-card__count opx-num">{a.topAgents.length}</b> : null}
                </header>
                {a.topAgents.length ? (
                  <ol className="opx-an-bars">
                    {a.topAgents.map((ag, i) => (
                      <li key={`${ag.name}-${i}`}>
                        <span className="opx-an-bars__n opx-num">{i + 1}</span>
                        <span className="opx-an-bars__name">{ag.name || "—"}</span>
                        <b className="opx-num">{fmtInt(ag.calls, locale)}</b>
                        <span className="opx-an-bars__track" aria-hidden="true">
                          <i style={{ width: `${(ag.calls / agentMax) * 100}%`, animationDelay: `${i * 70}ms` }} />
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="opx-an-none">{tx("noAgents")}</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {drill ? <AnaDrill kind={drill} data={a} days={byDay} demo={demo} onClose={() => setDrill(null)} /> : null}
    </div>
  );
}
