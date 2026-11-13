"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ApiError, isForbidden, isRouteMissing } from "@/lib/http";
import { useLoad } from "@/lib/useLoad";
import { notify } from "@/lib/toast";
import { createDepartmentSchedule, getDepartmentDashboard, listDepartmentSchedules, type DepartmentScheduleInput, type DeptSchedule, type ScheduleType, type WeekSlot } from "@/lib/services/executive";
import { IconBuilding, IconCalendar, IconLock, IconPlus, IconRefresh, IconUser, IconUsers } from "@/components/icons";
import Select from "@/components/Select";
import TimePicker from "@/components/TimePicker";
import CheckBox from "@/components/CheckBox";
import InternalField from "@/components/internal/InternalField";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { EntitySelect, HrmCallout, HrmDrawer, HrmEmpty, HrmError, HrmHead, HrmLoading, HrmPanel, HrmStat, useHrmFormat } from "@/components/internal/HrmUi";
import "@/components/internal/handmade.css";
import "./execHrm.css";

// The department head's page (contract 2026-11-13 §6): their unit and its
// groups — people, who is online, schedules — and nothing about pay or
// money (the backend sends payroll_visible=false, finance_visible=false).
// The scope (which units, which people) is the backend's; this page only
// lists what it returned and lets the backend refuse anything else.
const TZ = "Asia/Tashkent";
// weekday 0 = Monday … 6 = Sunday (the contract's example week starts at 0).
type Day = { weekday: number; on: boolean; start: string; end: string };
const standardWeek = (): Day[] => Array.from({ length: 7 }, (_, i) => ({ weekday: i, on: i < 5, start: "09:00", end: "18:00" }));

export default function DepartmentPage() {
  const t = useTranslations("exec.dept");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const res = useLoad((signal) => getDepartmentDashboard(signal), []);
  const [tick, setTick] = useState(0);
  const schedules = useLoad(
    (signal) =>
      listDepartmentSchedules(signal).catch((e: unknown) => {
        // The list is not in the 11-13 contract: absent → only the count.
        if (isRouteMissing(e)) return null;
        throw e;
      }),
    [tick],
  );
  const [creating, setCreating] = useState(false);
  const d = res.data;
  const err = res.status === "error" ? res.error : null;

  const unitIds = useMemo(() => new Set(d?.units.map((u) => u.id) ?? []), [d]);
  const unitName = (id: string) => d?.units.find((u) => u.id === id)?.name || dir.unitName(id) || dir.people.find((p) => p.unitId === id)?.unit || t("unitUnnamed");
  const people = useMemo(() => dir.people.filter((p) => unitIds.has(p.unitId)), [dir.people, unitIds]);
  const reloadAll = () => {
    res.reload();
    setTick((n) => n + 1);
  };

  if (err && !d && isForbidden(err)) {
    return (
      <section className="hrm-page">
        <HrmHead title={t("title")} />
        <HrmEmpty icon={IconLock} title={t("denied.title")} text={t("denied.text")} />
      </section>
    );
  }

  const list: DeptSchedule[] | null = schedules.data ?? null;
  const scheduleCount = list ? list.length : d?.scheduleCount ?? null;
  const num = (n: number | null) => (n === null ? "—" : String(n));

  return (
    <section className="hrm-page">
      <HrmHead
        title={t("title")}
        lead={t("lead")}
        actions={
          <>
            <button className="btn btn--line btn--sm" type="button" onClick={reloadAll} disabled={res.refreshing}>
              <IconRefresh className={res.refreshing ? "mk-spin" : undefined} />
              {t("refresh")}
            </button>
            {d ? (
              <button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}>
                <IconPlus />
                {t("newSchedule")}
              </button>
            ) : null}
          </>
        }
      />
      {res.status === "loading" ? (
        <HrmPanel><HrmLoading rows={5} /></HrmPanel>
      ) : !d ? (
        <HrmError text={t("failed")} onRetry={reloadAll} retryLabel={t("refresh")} />
      ) : (
        <>
          <div className="hrm-stats exh-stats">
            <HrmStat icon={IconUsers} label={t("employees")} value={num(d.employeeCount)} />
            <HrmStat icon={IconUser} tone="ok" label={t("online")} value={num(d.onlineCount)} />
            <HrmStat icon={IconCalendar} tone="violet" label={t("schedules")} value={num(scheduleCount)} />
          </div>
          <HrmCallout tone="info">{t("noFinance")}</HrmCallout>
          <HrmPanel title={t("units")} icon={IconBuilding} count={d.units.length}>
            {d.units.length ? (
              <div className="exh-units">
                {d.units.map((u) => (
                  <span key={u.id} className="hrm-chip">{unitName(u.id)}</span>
                ))}
              </div>
            ) : (
              <p className="exh-note">{t("noUnits")}</p>
            )}
          </HrmPanel>
          <HrmPanel title={t("people")} icon={IconUsers} count={people.length || undefined} flush>
            {people.length ? (
              <div className="hrm-table-wrap">
                <table className="hrm-table">
                  <thead><tr><th>{t("col.name")}</th><th>{t("col.position")}</th><th>{t("col.unit")}</th></tr></thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.id}>
                        <td><b>{p.name || p.code}</b>{p.code ? <small>{p.code}</small> : null}</td>
                        <td>{p.position || "—"}</td>
                        <td>{p.unit || unitName(p.unitId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <HrmEmpty icon={IconUsers} title={t("noPeople")} text={t("noPeopleText")} />
            )}
          </HrmPanel>
          <HrmPanel title={t("scheduleList")} icon={IconCalendar} count={list ? list.length : undefined} flush>
            {schedules.status === "loading" ? (
              <div style={{ padding: 16 }}><HrmLoading rows={3} /></div>
            ) : schedules.status === "error" ? (
              <HrmError text={t("schedulesFailed")} onRetry={() => setTick((n) => n + 1)} retryLabel={t("refresh")} />
            ) : list === null ? (
              <p className="exh-note" style={{ padding: 16 }}>{t("listSoon", { n: num(d.scheduleCount) })}</p>
            ) : list.length ? (
              <div className="hrm-table-wrap">
                <table className="hrm-table">
                  <thead><tr><th>{t("col.title")}</th><th>{t("col.target")}</th><th>{t("col.days")}</th><th>{t("col.hours")}</th></tr></thead>
                  <tbody>
                    {list.map((s) => {
                      const on = new Set(s.weekly.map((w) => w.weekday));
                      const always = s.type === "24_7";
                      return (
                        <tr key={s.id}>
                          <td><b>{s.title || "—"}</b><small>{always ? t("type.24_7") : t("type.weekly")}</small></td>
                          <td>
                            <span className="hrm-scope">
                              {s.employeeId ? <IconUser /> : <IconBuilding />}
                              {s.employeeId ? dir.employeeName(s.employeeId) || t("targetEmployee") : unitName(s.orgUnitId)}
                            </span>
                          </td>
                          <td>
                            <span className="hrm-week">
                              {[0, 1, 2, 3, 4, 5, 6].map((w) => <span key={w} className={always || on.has(w) ? "on" : undefined}>{f.weekday(w + 1)}</span>)}
                            </span>
                          </td>
                          <td><b className="hrm-num">{always ? "00:00 – 24:00" : s.weekly.length ? `${s.weekly[0].start} – ${s.weekly[0].end}` : "—"}</b></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <HrmEmpty icon={IconCalendar} title={t("noSchedules")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("newSchedule")}</button>} />
            )}
          </HrmPanel>
          <ScheduleCreate
            open={creating}
            onClose={() => setCreating(false)}
            units={d.units.map((u) => ({ value: u.id, label: unitName(u.id) }))}
            people={people.map((p) => ({ value: p.id, label: p.name || p.code, sub: p.position }))}
            onCreated={() => {
              setCreating(false);
              notify.success(t("created"));
              reloadAll();
            }}
          />
        </>
      )}
    </section>
  );
}

type Opt = { value: string; label: string; sub?: string };

function ScheduleCreate({ open, onClose, onCreated, units, people }: { open: boolean; onClose: () => void; onCreated: () => void; units: Opt[]; people: Opt[] }) {
  const t = useTranslations("exec.dept");
  const f = useHrmFormat();
  const [target, setTarget] = useState<"unit" | "employee">("unit");
  const [targetId, setTargetId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ScheduleType>("weekly");
  const [week, setWeek] = useState<Day[]>(standardWeek);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setDay = (i: number, patch: Partial<Day>) => setWeek((w) => w.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const weekly: WeekSlot[] = week.filter((d) => d.on).map((d) => ({ weekday: d.weekday, start: d.start, end: d.end }));
  const ready = !!title.trim() && !!targetId && (type === "24_7" || weekly.length > 0) && weekly.every((w) => w.start && w.end && w.start < w.end);

  function reset() {
    setTarget("unit");
    setTargetId("");
    setTitle("");
    setType("weekly");
    setWeek(standardWeek());
    setError("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    const input: DepartmentScheduleInput = {
      target: target === "employee" ? { employeeId: targetId } : { orgUnitId: targetId },
      title,
      type,
      timezone: TZ,
      weekly,
    };
    try {
      await createDepartmentSchedule(input);
      reset();
      onCreated();
    } catch (err) {
      const code = err instanceof ApiError ? err.code ?? "" : "";
      setError(
        code === "schedule_target_required"
          ? t("err.target")
          : code === "department_schedule_employee_scope_denied"
            ? t("err.employeeScope")
            : code === "department_schedule_scope_denied"
              ? t("err.scope")
              : err instanceof ApiError && err.status === 422
                ? t("err.invalid")
                : t("err.failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer open={open} onClose={onClose} title={t("newSchedule")} sub={t("newLead")}>
      <form className="hrm-form" onSubmit={submit}>
        {error ? <HrmError text={error} /> : null}
        <InternalField label={t("f.title")}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder={t("f.titlePh")} />
        </InternalField>
        <div className="hrm-form__grid">
          <InternalField label={t("f.target")}>
            <Select
              value={target}
              onChange={(v) => {
                setTarget(v === "employee" ? "employee" : "unit");
                setTargetId("");
              }}
              options={[{ value: "unit", label: t("targetUnit") }, ...(people.length ? [{ value: "employee", label: t("targetEmployee") }] : [])]}
              ariaLabel={t("f.target")}
            />
          </InternalField>
          <InternalField label={target === "employee" ? t("targetEmployee") : t("targetUnit")}>
            <EntitySelect
              value={targetId}
              onChange={setTargetId}
              options={(target === "employee" ? people : units).map((o) => ({ value: o.value, label: o.label, sub: o.sub }))}
              placeholder={target === "employee" ? t("f.pickEmployee") : t("f.pickUnit")}
              ariaLabel={target === "employee" ? t("targetEmployee") : t("targetUnit")}
            />
          </InternalField>
        </div>
        <span className="ldrw__lbl">{t("f.type")}</span>
        <div className="exh-type" role="radiogroup" aria-label={t("f.type")}>
          <label>
            <input type="radio" name="sched-type" checked={type === "weekly"} onChange={() => setType("weekly")} />
            {t("type.weekly")}
          </label>
          <label>
            <input type="radio" name="sched-type" checked={type === "24_7"} onChange={() => setType("24_7")} />
            {t("type.24_7")}
          </label>
        </div>
        {type === "24_7" ? (
          <p className="exh-note">{t("allDay")}</p>
        ) : (
          <>
            <span className="ldrw__lbl">{t("f.week")}</span>
            <div className="hrm-days hrm-days--drawer">
              {week.map((d, i) => (
                <div className={`hrm-day${d.on ? " on" : ""}`} key={d.weekday}>
                  <CheckBox className="hrm-day__t" checked={d.on} onChange={(on) => setDay(i, { on })}>{f.weekday(d.weekday + 1)}</CheckBox>
                  <div className="hrm-day__r">
                    <TimePicker value={d.start} onChange={(v) => setDay(i, { start: v })} placeholder={t("f.start")} ariaLabel={`${f.weekday(d.weekday + 1)} ${t("f.start")}`} disabled={!d.on} />
                    <TimePicker value={d.end} onChange={(v) => setDay(i, { end: v })} placeholder={t("f.end")} ariaLabel={`${f.weekday(d.weekday + 1)} ${t("f.end")}`} disabled={!d.on} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="exh-note">{t("tz", { tz: TZ })}</p>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !ready}>
            <IconPlus />
            {busy ? t("saving") : t("create")}
          </button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}
