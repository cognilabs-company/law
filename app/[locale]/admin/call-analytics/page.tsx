"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getCallAnalyticsFull, isCallsEmpty, trimSeries, isFiltered, todayIso, type CallAnalyticsFull } from "@/lib/services/dash";
import { demoCalls } from "@/lib/demoStats";
import { useResourceOne } from "@/lib/useResource";
import { Skeleton } from "@/components/portal/DataState";
import LineChart from "@/components/admin/LineChart";
import StatTile from "@/components/admin/StatTile";
import StatDrillModal, { type Drill } from "@/components/admin/StatDrillModal";
import DashFilterBar, { useDashFilter } from "@/components/admin/DashFilterBar";
import { IconPhone, IconCheck, IconClose, IconClock, IconInfo } from "@/components/icons";

const EMPTY: CallAnalyticsFull = { fetchedAt: "", total: 0, answered: 0, missed: 0, avgDurationSec: 0, byDay: [], topAgents: [] };
function mmss(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

export default function AdminCallAnalytics() {
  const t = useTranslations("admin.callAnalytics");
  const td = useTranslations("admin.dash");
  const { filter, setFilter, demoForced, setDemoForced } = useDashFilter();
  const fkey = `${filter.region}|${filter.from}|${filter.to}`;
  const res = useResourceOne(() => getCallAnalyticsFull(filter), [fkey]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const loaded = res.status !== "loading";
  const demo = demoForced || (loaded && (!res.data || isCallsEmpty(res.data)));
  const a = useMemo(() => (demo ? demoCalls(todayIso()) : res.data ?? EMPTY), [demo, res.data]);
  const byDay = trimSeries(a.byDay, filter);
  const answerRate = a.total ? Math.round((a.answered / a.total) * 100) : 0;
  const regionHint = filter.region ? td("hint.regionNa") : undefined;

  const agents = (): Drill["sections"][number] => ({ kind: "bars", title: t("topAgents"), rows: a.topAgents.map((ag) => ({ label: ag.name, value: String(ag.calls), n: ag.calls })), empty: t("noAgents") });
  const daily = (): Drill["sections"][number] => ({ kind: "series", title: t("byDay"), points: byDay, empty: t("noData") });
  const kv = (): Drill["sections"][number] => ({ kind: "kv", rows: [
    { label: t("answered"), value: String(a.answered), tone: "ok" }, { label: t("missed"), value: String(a.missed), tone: "bad" },
    { label: td("drill.answerRate"), value: `${answerRate}%` }, { label: td("drill.missRate"), value: `${100 - answerRate}%` }, { label: t("avg"), value: mmss(a.avgDurationSec) },
  ] });
  const open = (title: string, value: string, sub?: string) => setDrill({ title, value, sub, demo, sections: [kv(), daily(), agents()], link: { href: "/admin/call-center", label: td("drill.goCallCenter") } });

  return (
    <div className="ppanel">
      <div className="ppanel__h"><b>{t("title")}</b></div>
      <DashFilterBar value={filter} onChange={setFilter} demoForced={demoForced} onDemoForced={setDemoForced} note={isFiltered(filter) ? td("filter.regionNote") : undefined} compact />
      {demo && loaded ? <p className="bhnote" role="status"><IconInfo />{demoForced ? td("demo.forced") : td("demo.banner")}</p> : null}
      {!loaded ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <div className="castat">
            <StatTile icon={<IconPhone />} value={String(a.total)} label={t("total")} demo={demo} hint={regionHint} onClick={() => open(t("total"), String(a.total))} />
            <StatTile icon={<IconCheck />} tone="ok" value={String(a.answered)} label={t("answered")} sub={`${answerRate}%`} demo={demo} hint={regionHint} onClick={() => open(t("answered"), String(a.answered), `${t("answerRate")}: ${answerRate}%`)} />
            <StatTile icon={<IconClose />} tone="bad" value={String(a.missed)} label={t("missed")} demo={demo} hint={regionHint} onClick={() => open(t("missed"), String(a.missed), `${td("drill.missRate")}: ${100 - answerRate}%`)} />
            <StatTile icon={<IconClock />} value={mmss(a.avgDurationSec)} label={t("avg")} demo={demo} hint={regionHint} onClick={() => open(t("avg"), mmss(a.avgDurationSec))} />
          </div>

          <div className="cachart">
            <h3>{t("byDay")}</h3>
            {byDay.length ? (
              <LineChart points={byDay} />
            ) : (
              <p className="advmuted">{t("noData")}</p>
            )}
          </div>

          <div className="cablock">
            <h3>{t("topAgents")}</h3>
            {a.topAgents.length ? (
              <div className="alist">
                {a.topAgents.map((ag, i) => (
                  <div className="aitem" key={i}>
                    <span className="aitem__n">{i + 1}</span>
                    <div className="aitem__m"><b>{ag.name}</b></div>
                    <span className="creq__badge">{ag.calls}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="advmuted">{t("noAgents")}</p>
            )}
          </div>
        </>
      )}
      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
