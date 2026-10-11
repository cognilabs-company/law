"use client";

import { useEffect, useMemo, useState } from "react";
import DatePicker from "@/components/DatePicker";
import { getLiveAnalytics, type LiveAnalytics as Data } from "@/lib/services/internalLive";
import { IconCheck, IconChartBar, IconClock, IconHourglass, IconPause, IconTrendingUp, IconUsers } from "@/components/icons";
import { EntitySelect, HrmBar, HrmEmpty, HrmError, HrmLoading, HrmPanel, HrmPerson, HrmStat, useHrmFormat } from "@/components/internal/HrmUi";
import type { SearchOption } from "@/components/SearchSelect";
import { apiMessage, dayIso, hms, useLiveText } from "./bits";

const MAX_DAYS = 367;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

// Monitoring analytics (§11): the period, a unit or one person go to the
// backend as filters; every duration reads h:mm:ss.
export default function LiveAnalytics({ employeeId, onEmployee, unitOptions, employeeOptions }: { employeeId: string; onEmployee: (id: string) => void; unitOptions: SearchOption[]; employeeOptions: SearchOption[] }) {
  const { t, module } = useLiveText();
  const f = useHrmFormat();
  const [range, setRange] = useState({ from: dayIso(6), to: dayIso(0) });
  const [unitId, setUnitId] = useState("");
  const [data, setData] = useState<{ key: string; d: Data } | null>(null);
  const [err, setErr] = useState("");
  const span = range.from && range.to ? daysBetween(range.from, range.to) : 0;
  const tooLong = span > MAX_DAYS;
  const key = `${range.from}|${range.to}|${unitId}|${employeeId}`;

  useEffect(() => {
    if (tooLong) return;
    const c = new AbortController();
    getLiveAnalytics({ from: range.from || undefined, to: range.to || undefined, unitId: unitId || undefined, employeeId: employeeId || undefined }, c.signal)
      .then((d) => {
        if (!c.signal.aborted) {
          setData({ key, d });
          setErr("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setErr(apiMessage(e, t("errors.load")));
      });
    return () => c.abort();
  }, [key, range.from, range.to, unitId, employeeId, tooLong, t]);

  const d = data?.key === key ? data.d : null;
  const modules = useMemo(() => Object.entries(d?.totals.modules ?? {}).sort((a, b) => b[1] - a[1]), [d]);
  const maxModule = Math.max(1, ...modules.map(([, v]) => v));
  const people = useMemo(() => [...(d?.employees ?? [])].sort((a, b) => b.active - a.active || b.online - a.online), [d]);
  const quick = (back: number) => setRange({ from: dayIso(back), to: dayIso(0) });

  return (
    <div className="lv-an">
      <div className="lv-an__bar">
        <div className="lv-an__quick" role="group" aria-label={t("filters.period")}>
          {[0, 6, 29].map((b) => (
            <button key={b} type="button" className={range.from === dayIso(b) && range.to === dayIso(0) ? "on" : ""} onClick={() => quick(b)}>
              {t(`filters.last${b}`)}
            </button>
          ))}
        </div>
        <DatePicker value={range.from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} placeholder={t("filters.from")} ariaLabel={t("filters.from")} max={range.to || undefined} />
        <DatePicker value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} placeholder={t("filters.to")} ariaLabel={t("filters.to")} min={range.from || undefined} />
        <div className="lv-an__sel">
          <EntitySelect value={unitId} onChange={setUnitId} options={unitOptions} placeholder={t("filters.allUnits")} ariaLabel={t("filters.unit")} />
        </div>
        <div className="lv-an__sel">
          <EntitySelect value={employeeId} onChange={onEmployee} options={employeeOptions} placeholder={t("filters.allPeople")} ariaLabel={t("filters.employee")} />
        </div>
      </div>
      {tooLong ? <HrmError text={t("analytics.tooLong", { n: MAX_DAYS })} /> : null}
      {err ? <HrmError text={err} /> : null}
      {!d && !err && !tooLong ? (
        <HrmPanel>
          <HrmLoading rows={4} />
        </HrmPanel>
      ) : d ? (
        <>
          <div className="hrm-stats lv-an__stats">
            <HrmStat icon={IconUsers} tone="blue" label={t("analytics.online")} value={hms(d.totals.online)} />
            <HrmStat icon={IconTrendingUp} tone="ok" label={t("analytics.active")} value={hms(d.totals.active)} />
            <HrmStat icon={IconPause} tone="violet" label={t("analytics.inactive")} value={hms(d.totals.inactive)} />
            <HrmStat icon={IconHourglass} tone="warn" label={t("analytics.busy")} value={hms(d.totals.busy)} hint={t("analytics.busyCount", { n: d.totals.busyCount })} />
            <HrmStat icon={IconChartBar} tone="cyan" label={t("analytics.actions")} value={d.totals.actions} />
            <HrmStat icon={IconCheck} tone="ok" label={t("analytics.completed")} value={d.totals.completed} />
          </div>
          <div className="hrm-grid hrm-grid--2">
            <HrmPanel title={t("analytics.byModule")} icon={IconChartBar} count={modules.length}>
              {modules.length ? (
                <ul className="hrm-list">
                  {modules.map(([m, n]) => (
                    <li key={m}>
                      <span className="hrm-list__t">
                        <b>{module(m)}</b>
                      </span>
                      <span className="hrm-list__a org-headcount">
                        <HrmBar value={(n / maxModule) * 100} tone="blue" />
                        <b className="hrm-num">{n}</b>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hrm-muted">{t("analytics.noActions")}</p>
              )}
            </HrmPanel>
            <HrmPanel title={t("analytics.byDay")} icon={IconClock} count={d.days.length}>
              {d.days.length ? (
                <div className="hrm-table-wrap">
                  <table className="hrm-table lv-days">
                    <thead>
                      <tr>
                        <th>{t("cols.date")}</th>
                        <th className="hrm-num">{t("cols.online")}</th>
                        <th className="hrm-num">{t("cols.active")}</th>
                        <th className="hrm-num">{t("cols.busy")}</th>
                        <th className="hrm-num">{t("cols.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.days.map((x) => (
                        <tr key={x.date}>
                          <td>{f.date(x.date)}</td>
                          <td className="hrm-num">{hms(x.online)}</td>
                          <td className="hrm-num">{hms(x.active)}</td>
                          <td className="hrm-num">{hms(x.busy)}</td>
                          <td className="hrm-num">{x.actions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="hrm-muted">{t("analytics.noDays")}</p>
              )}
            </HrmPanel>
          </div>
          <HrmPanel title={t("analytics.byPerson")} icon={IconUsers} count={people.length} flush>
            {people.length ? (
              <div className="hrm-table-wrap">
                <table className="hrm-table">
                  <thead>
                    <tr>
                      <th>{t("cols.employee")}</th>
                      <th className="hrm-num">{t("cols.online")}</th>
                      <th className="hrm-num">{t("cols.active")}</th>
                      <th className="hrm-num">{t("cols.inactive")}</th>
                      <th className="hrm-num">{t("cols.busy")}</th>
                      <th className="hrm-num">{t("cols.actions")}</th>
                      <th className="hrm-num">{t("cols.completed")}</th>
                      <th>{t("cols.reasons")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.id} className="is-click" tabIndex={0} onClick={() => onEmployee(p.id)} onKeyDown={(e) => e.key === "Enter" && onEmployee(p.id)}>
                        <td>
                          <HrmPerson name={p.name} sub={p.code} size="sm" />
                        </td>
                        <td className="hrm-num">{hms(p.online)}</td>
                        <td className="hrm-num">{hms(p.active)}</td>
                        <td className="hrm-num">{hms(p.inactive)}</td>
                        <td className="hrm-num">
                          {hms(p.busy)}
                          {p.busyCount ? <small> ×{p.busyCount}</small> : null}
                        </td>
                        <td className="hrm-num">{p.actions}</td>
                        <td className="hrm-num">{p.completed}</td>
                        <td className="lv-an__reasons">{p.reasons.length ? p.reasons.slice(0, 3).map((r) => r.reason).join(", ") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <HrmEmpty icon={IconUsers} title={t("analytics.noPeople")} />
            )}
          </HrmPanel>
        </>
      ) : null}
    </div>
  );
}
