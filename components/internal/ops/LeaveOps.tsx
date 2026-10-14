"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/lib/auth";
import { canInternal } from "@/lib/services/internalHrm";
import { checkLeave, getLeaveBalances, getLeaveCalendar, getMyLeaveBalances, isBlocking, type LeaveBalance, type LeaveCheck } from "@/lib/services/hrmOps";
import HrmCalendar, { monthOf, monthRange, type CalDay } from "@/components/internal/HrmCalendar";
import { EntitySelect, HrmBar, HrmEmpty, HrmError, HrmLoading, HrmPanel, HrmPerson, useHrmFormat } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { IconAlert, IconCalendar, IconCheck, IconInfo, IconSun, IconUsers } from "@/components/icons";
import { todayIso, useOps } from "./useOps";

type Tab = "mine" | "team" | "calendar";

// Leave after MedControl: one's own balance, the team's balances and who
// is away on a month's calendar. The numbers are the backend's; approving a
// request debits the balance on the server, and the next read shows it.
export default function LeavePanel() {
  const t = useTranslations("internal.ops.leave");
  const { session } = useAuth();
  const manage = canInternal(session, "internal_time.manage") || canInternal(session, "internal_hr.manage");
  const [tab, setTab] = useState<Tab>("mine");
  const tabs: Tab[] = manage ? ["mine", "team", "calendar"] : ["mine", "calendar"];
  const Icon = { mine: IconSun, team: IconUsers, calendar: IconCalendar } as const;
  return (
    <HrmPanel title={t("title")} icon={IconSun} className="ops-panel">
      <div className="hrm-tabs hrm-viewtabs" role="tablist" aria-label={t("title")}>
        {tabs.map((k) => {
          const I = Icon[k];
          return (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              <I />
              {t(`tab.${k}`)}
            </button>
          );
        })}
      </div>
      {tab === "mine" ? <MyBalances /> : tab === "team" ? <TeamBalances /> : <LeaveCalendar />}
    </HrmPanel>
  );
}

function BalanceCard({ b }: { b: LeaveBalance }) {
  const t = useTranslations("internal.ops.leave");
  const f = useHrmFormat();
  const total = b.accrued || b.used + b.remaining;
  return (
    <li className="ops-bal">
      <b>{b.typeName || t("anyType")}</b>
      <span className="ops-bal__n"><strong>{f.num(b.remaining)}</strong><small>{t("daysLeft")}</small></span>
      <HrmBar value={total ? (b.remaining / total) * 100 : 0} />
      <small className="hrm-muted">{t("balanceLine", { accrued: f.num(b.accrued), used: f.num(b.used), year: b.year || "—" })}</small>
    </li>
  );
}

function MyBalances() {
  const t = useTranslations("internal.ops.leave");
  const { data, error, reload } = useOps((s) => getMyLeaveBalances(s), [], ["leave"]);
  if (error) return <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} />;
  if (!data) return <HrmLoading rows={2} />;
  if (!data.length) return <HrmEmpty icon={IconSun} title={t("noBalance")} text={t("noBalanceText")} />;
  return <ul className="ops-bals">{data.map((b, i) => <BalanceCard key={b.id || `${b.typeId}-${i}`} b={b} />)}</ul>;
}

function TeamBalances() {
  const t = useTranslations("internal.ops.leave");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [unit, setUnit] = useState("");
  const year = new Date().getFullYear();
  const { data, error, reload } = useOps((s) => getLeaveBalances({ unitId: unit || undefined, year }, s), [unit, year], ["leave"]);
  return (
    <>
      {dir.unitOptions.length ? (
        <div className="hrm-toolbar__sel ops-sel">
          <EntitySelect value={unit} onChange={setUnit} options={dir.unitOptions} placeholder={t("allUnits")} ariaLabel={t("unit")} />
        </div>
      ) : null}
      {error ? (
        error instanceof ApiError && error.status === 403 ? <p className="hrm-muted">{t("noAccess")}</p> : <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} />
      ) : !data ? <HrmLoading rows={4} /> : !data.items.length ? (
        <HrmEmpty icon={IconUsers} title={t("noTeam")} text={t("noTeamText", { year })} />
      ) : (
        <div className="hrm-table-wrap">
          <table className="hrm-table">
            <thead><tr><th>{t("col.employee")}</th><th>{t("col.type")}</th><th className="hrm-num">{t("col.accrued")}</th><th className="hrm-num">{t("col.used")}</th><th className="hrm-num">{t("col.remaining")}</th></tr></thead>
            <tbody>
              {data.items.map((b, i) => (
                <tr key={b.id || i}>
                  <td><HrmPerson name={b.employeeName || dir.employeeName(b.employeeId) || "—"} sub={dir.employee(b.employeeId)?.code} size="sm" /></td>
                  <td>{b.typeName || "—"}</td>
                  <td className="hrm-num">{f.num(b.accrued)}</td>
                  <td className="hrm-num">{f.num(b.used)}</td>
                  <td className={`hrm-num${b.remaining <= 0 ? " hrm-late" : ""}`}><b>{f.num(b.remaining)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LeaveCalendar() {
  const t = useTranslations("internal.ops.leave");
  const dir = useHrmDirectory();
  const today = todayIso();
  const [month, setMonth] = useState(monthOf());
  const [unit, setUnit] = useState("");
  const range = monthRange(month);
  const { data, error, reload } = useOps((s) => getLeaveCalendar({ ...range, unitId: unit || undefined }, s), [month, unit], ["leave"]);
  const days = useMemo(() => {
    const out: Record<string, CalDay & { names: string[] }> = {};
    for (const s of data ?? []) {
      const end = s.end || s.start;
      for (let d = new Date(`${s.start}T12:00`); ; d.setDate(d.getDate() + 1)) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (k > end || k > range.to) break;
        if (k < range.from) continue;
        const c = out[k] ?? { tone: "ok" as const, names: [] };
        c.names.push(s.employeeName || dir.employeeName(s.employeeId) || "—");
        if (/pend|submit|review/.test(s.status)) c.tone = "warn";
        out[k] = c;
      }
    }
    for (const c of Object.values(out)) {
      c.label = c.names.length > 1 ? t("away", { n: c.names.length }) : c.names[0];
      c.sub = c.names.length > 1 ? c.names.slice(0, 2).join(", ") : undefined;
    }
    return out;
  }, [data, range.from, range.to, dir, t]);
  return (
    <>
      {dir.unitOptions.length ? (
        <div className="hrm-toolbar__sel ops-sel">
          <EntitySelect value={unit} onChange={setUnit} options={dir.unitOptions} placeholder={t("allUnits")} ariaLabel={t("unit")} />
        </div>
      ) : null}
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} /> : null}
      <HrmCalendar month={month} onMonth={setMonth} days={days} today={today} legend={<><span><i className="hrm-cal__cell--ok" />{t("approved")}</span><span><i className="hrm-cal__cell--warn" />{t("pending")}</span></>} />
      {data && !data.length ? <p className="hrm-muted ops-note">{t("nobodyAway")}</p> : null}
    </>
  );
}

// The pre-check of a leave request (POST /internal/hrm/leave/requests/check)
// as the form is filled: days counted, balance left and the findings. A
// finding at level "block" keeps the request from being sent.
type Values = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
export function useLeaveCheck(values: Values | null, selfId = ""): { check: LeaveCheck | null; busy: boolean; blocked: boolean } {
  const employee = values ? s(values.employee_id) || selfId : "";
  const type = values ? s(values.leave_type_id) : "";
  const start = values ? s(values.start_date).slice(0, 10) : "";
  const end = values ? s(values.end_date).slice(0, 10) : "";
  const ready = Boolean(employee && type && start && end && end >= start);
  const key = ready ? `${employee}|${type}|${start}|${end}` : "";
  const [res, setRes] = useState<{ key: string; check: LeaveCheck | null }>({ key: "", check: null });
  useEffect(() => {
    if (!key) return;
    const c = new AbortController();
    const h = setTimeout(() => {
      checkLeave({ employee_id: employee, leave_type_id: type, start_date: start, end_date: end }, c.signal)
        .then((check) => !c.signal.aborted && setRes({ key, check }))
        .catch(() => !c.signal.aborted && setRes({ key, check: null }));
    }, 300);
    return () => {
      clearTimeout(h);
      c.abort();
    };
    // `key` carries every input of the check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const check = key && res.key === key ? res.check : null;
  return { check, busy: Boolean(key) && res.key !== key, blocked: isBlocking(check) };
}

export function LeaveCheckNote({ state }: { state: { check: LeaveCheck | null; busy: boolean; blocked: boolean } }) {
  const t = useTranslations("internal.ops.leave");
  const f = useHrmFormat();
  const { check, busy, blocked } = state;
  if (busy) return <p className="ops-check is-busy"><span className="stu-spin" aria-hidden />{t("checking")}</p>;
  if (!check) return null;
  return (
    <div className={`ops-check${blocked ? " is-block" : check.findings.length ? " is-warn" : " is-ok"}`} role={blocked ? "alert" : "status"}>
      <p className="ops-check__sum">
        {blocked ? <IconAlert aria-hidden /> : <IconCheck aria-hidden />}
        <b>{blocked ? t("blocked") : t("checkOk")}</b>
        {check.days !== null ? <span>{t("days", { n: f.num(check.days) })}</span> : null}
        {check.remaining !== null ? <span>{t("remaining", { n: f.num(check.remaining) })}</span> : null}
      </p>
      {check.findings.length ? (
        <ul>
          {check.findings.map((x, i) => (
            <li key={i} className={`is-${x.level}`}>
              {x.level === "block" ? <IconAlert aria-hidden /> : <IconInfo aria-hidden />}
              {x.message || (t.has(`finding.${x.code}`) ? t(`finding.${x.code}`) : x.code)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
