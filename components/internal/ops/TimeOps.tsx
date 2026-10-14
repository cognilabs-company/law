"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { notify } from "@/lib/toast";
import { hrmErrorOf } from "@/lib/services/hrm";
import {
  createManualEvent,
  createTimesheet,
  getMySchedule,
  getOnDuty,
  getScheduleMatrix,
  getTeamToday,
  listTimesheets,
  MANUAL_EVENTS,
  TEAM_GROUPS,
  type ManualEvent,
  type Matrix,
  type MatrixCell,
  type TeamGroup,
  type Timesheet,
} from "@/lib/services/hrmOps";
import DatePicker from "@/components/DatePicker";
import MonthPicker from "@/components/MonthPicker";
import Select from "@/components/Select";
import InternalField from "@/components/internal/InternalField";
import HrmCalendar, { monthOf, monthRange, type CalDay } from "@/components/internal/HrmCalendar";
import { EntitySelect, HrmDrawer, HrmEmpty, HrmError, HrmLoading, HrmPanel, HrmPerson, HrmStatus, useHrmFormat } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { domainHref } from "@/components/internal/hrm/routes";
import { IconArrowRight, IconCalendar, IconCheck, IconClipboardList, IconClock, IconEdit, IconPlus, IconUsers } from "@/components/icons";
import { dayToIso, opsError, todayIso, useMissingNames, useOps } from "./useOps";
import FieldErr from "./FieldErr";

const pad = (n: number) => String(n).padStart(2, "0");
const nowLocal = () => {
  const d = new Date();
  return { day: todayIso(), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

// ── Today's team (§7) ───────────────────────────────────────────────────────

// Who is working, late, absent, away or without a shift today, read from
// the backend's daily aggregate and read again when an attendance event
// arrives — no polling. A manager corrects a missed mark from here.
export function TeamTodayPanel() {
  const t = useTranslations("internal.ops.team");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [unit, setUnit] = useState("");
  const [group, setGroup] = useState<TeamGroup>("working");
  const [fix, setFix] = useState<{ employee: string } | null>(null);
  const { data, error, reload } = useOps((s) => getTeamToday(unit, s), [unit], ["attendance", "time"]);
  // The first group with anyone in it is the one opened first.
  const shown = data && !data.groups[group].length ? (TEAM_GROUPS.find((g) => data.groups[g].length) ?? group) : group;
  const list = data?.groups[shown] ?? [];
  return (
    <HrmPanel
      title={t("title")}
      icon={IconUsers}
      className="ops-panel"
      count={data ? TEAM_GROUPS.reduce((s, g) => s + data.counts[g], 0) : undefined}
      actions={<button type="button" className="btn btn--pri btn--sm" onClick={() => setFix({ employee: "" })}><IconEdit />{t("manual")}</button>}
    >
      {dir.unitOptions.length ? (
        <div className="hrm-toolbar__sel ops-sel">
          <EntitySelect value={unit} onChange={setUnit} options={dir.unitOptions} placeholder={t("allUnits")} ariaLabel={t("unit")} />
        </div>
      ) : null}
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} /> : !data ? <HrmLoading rows={3} /> : (
        <>
          <div className="ops-groups" role="tablist" aria-label={t("title")}>
            {TEAM_GROUPS.map((g) => (
              <button key={g} type="button" role="tab" aria-selected={shown === g} className={`ops-group ops-group--${g}${shown === g ? " on" : ""}`} onClick={() => setGroup(g)}>
                <b>{data.counts[g]}</b>
                <span>{t(`group.${g}`)}</span>
              </button>
            ))}
          </div>
          {list.length ? (
            <ul className="ops-people">
              {list.map((m) => (
                <li key={m.id}>
                  <HrmPerson name={m.name || dir.employeeName(m.id) || "—"} sub={[m.code, dir.positionTitle(m.positionId)].filter(Boolean).join(" · ")} size="sm" />
                  <span className="ops-people__t">
                    {m.firstIn ? `${f.time(m.firstIn)}${m.lastOut ? ` – ${f.time(m.lastOut)}` : ""}` : null}
                    {m.lateMinutes > 0 ? <em className="hrm-late">{t("lateBy", { m: f.minutes(m.lateMinutes) })}</em> : null}
                  </span>
                  <button type="button" className="btn btn--soft btn--sm" onClick={() => setFix({ employee: m.id })} aria-label={t("manualFor", { name: m.name })}><IconEdit /></button>
                </li>
              ))}
            </ul>
          ) : <p className="hrm-muted ops-note">{t("emptyGroup")}</p>}
        </>
      )}
      {fix ? <ManualEventDrawer employee={fix.employee} onClose={() => setFix(null)} onDone={() => { setFix(null); reload(); }} /> : null}
    </HrmPanel>
  );
}

// POST /internal/time/attendance/events/manual: a mark someone missed, at
// the time it should have been, with the reason it is being added.
export function ManualEventDrawer({ employee, onClose, onDone }: { employee: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("internal.ops.team");
  const dir = useHrmDirectory();
  const start = nowLocal();
  const [who, setWho] = useState(employee);
  const [type, setType] = useState<ManualEvent>("check_in");
  const [day, setDay] = useState(start.day);
  const [time, setTime] = useState(start.time);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const missing = { who: !who, reason: !reason.trim(), when: !day || !/^\d{2}:\d{2}$/.test(time) };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (busy || missing.who || missing.reason || missing.when) return;
    setBusy(true);
    setErr(null);
    try {
      await createManualEvent({ employee_id: who, event_type: type, event_at: dayToIso(day, time), reason: reason.trim() });
      notify.success(t("saved"));
      onDone();
    } catch (cause) {
      const x = hrmErrorOf(cause);
      setErr({ message: x.message || opsError(cause) || t("saveError"), fields: x.fields });
    } finally {
      setBusy(false);
    }
  }
  return (
    <HrmDrawer open onClose={onClose} title={t("manual")} sub={t("manualLead")}>
      <form className="hrm-form" onSubmit={submit} noValidate>
        {err ? <HrmError text={err.message} /> : null}
        <div>
          <InternalField label={`${t("employee")} *`}>
            <EntitySelect value={who} onChange={setWho} options={dir.employeeOptions} placeholder={t("pickEmployee")} ariaLabel={t("employee")} />
          </InternalField>
          <FieldErr text={err?.fields.employee_id ?? (tried && missing.who ? t("required") : undefined)} />
        </div>
        <div className="hrm-form__grid">
          <InternalField label={t("eventType")}>
            <Select value={type} onChange={(v) => setType(MANUAL_EVENTS.find((x) => x === v) ?? "check_in")} options={MANUAL_EVENTS.map((x) => ({ value: x, label: t(`event.${x}`) }))} ariaLabel={t("eventType")} />
          </InternalField>
          <div>
            <InternalField label={t("day")}>
              <DatePicker value={day} onChange={setDay} placeholder={t("day")} ariaLabel={t("day")} max={todayIso()} />
            </InternalField>
            <FieldErr text={err?.fields.event_at} />
          </div>
          <div>
            <InternalField label={t("time")}>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("time")} />
            </InternalField>
            <FieldErr text={tried && missing.when ? t("required") : undefined} />
          </div>
        </div>
        <div>
          <InternalField label={`${t("reason")} *`}>
            <textarea rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPh")} aria-invalid={tried && missing.reason} />
          </InternalField>
          <FieldErr text={err?.fields.reason ?? (tried && missing.reason ? t("required") : undefined)} />
        </div>
        <p className="hrm-form__note">{t("manualNote")}</p>
        <div className="hrm-form__foot">
          <button type="submit" className="btn btn--pri btn--sm" disabled={busy}>{busy ? <span className="stu-spin" aria-hidden /> : <IconCheck />}{t("save")}</button>
          <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// ── Timesheets (§8) ─────────────────────────────────────────────────────────

// Monthly sheets the backend generates from attendance: one row per
// employee, one cell per day with its code, hours and where it came from.
// A new sheet starts as a draft and moves on through the catalog workflow.
export function TimesheetsPanel() {
  const t = useTranslations("internal.ops.sheet");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [month, setMonth] = useState(monthOf());
  const [unit, setUnit] = useState("");
  const [openId, setOpenId] = useState("");
  const [creating, setCreating] = useState(false);
  const [y, m] = month.split("-").map(Number);
  const { data, error, reload } = useOps((s) => listTimesheets({ year: y, month: m, unitId: unit || undefined }, s), [month, unit], ["timesheet", "attendance"]);
  const open = data?.items.find((x) => x.id === openId) ?? null;
  return (
    <HrmPanel
      title={t("title")}
      icon={IconClipboardList}
      className="ops-panel"
      count={data?.total}
      actions={<button type="button" className="btn btn--pri btn--sm" onClick={() => setCreating(true)}><IconPlus />{t("new")}</button>}
    >
      <div className="ops-bar">
        <div className="ops-bar__m"><MonthPicker value={month} onChange={(v) => setMonth(v || monthOf())} placeholder={t("month")} ariaLabel={t("month")} /></div>
        {dir.unitOptions.length ? <div className="hrm-toolbar__sel"><EntitySelect value={unit} onChange={setUnit} options={dir.unitOptions} placeholder={t("allUnits")} ariaLabel={t("unit")} /></div> : null}
      </div>
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} /> : !data ? <HrmLoading rows={3} /> : !data.items.length ? (
        <HrmEmpty icon={IconClipboardList} title={t("empty", { month: f.period(month) })} text={t("emptyText")} action={<button type="button" className="btn btn--pri btn--sm" onClick={() => setCreating(true)}><IconPlus />{t("new")}</button>} />
      ) : (
        <ul className="ops-sheets">
          {data.items.map((s) => (
            <li key={s.id} className={openId === s.id ? "on" : ""}>
              <button type="button" onClick={() => setOpenId(openId === s.id ? "" : s.id)} aria-expanded={openId === s.id}>
                <b>{s.title || f.period(`${s.year}-${pad(s.month)}`)}</b>
                <small>{[s.code, dir.unitName(s.unitId) || t("allUnits"), t("rows", { n: s.rows.length })].filter(Boolean).join(" · ")}</small>
                <HrmStatus value={s.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open ? <SheetGrid sheet={open} /> : null}
      {creating ? (
        <SheetCreate
          month={month}
          unit={unit}
          onClose={() => setCreating(false)}
          onDone={(s) => {
            setCreating(false);
            if (s.month && s.year) setMonth(`${s.year}-${pad(s.month)}`);
            setOpenId(s.id);
            reload();
          }}
        />
      ) : null}
    </HrmPanel>
  );
}

const CELL_TONE = (code: string) => {
  const c = code.toUpperCase();
  if (!c) return "";
  if (/^(Я|Y|P|W|\d)/.test(c)) return "ok";
  if (/^(Н|N|A|ПР|PR)/.test(c)) return "err";
  if (/^(О|O|L|V|ОТ|B|Б|S)/.test(c)) return "info";
  if (/^(В|DO|OFF|X)/.test(c)) return "off";
  return "warn";
};

function SheetGrid({ sheet }: { sheet: Timesheet }) {
  const t = useTranslations("internal.ops.sheet");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  // The backend's own day list; else the sheet's whole month; else the
  // days its cells name.
  const days = sheet.days.length ? sheet.days : sheet.year && sheet.month ? (() => {
    const r = monthRange(`${sheet.year}-${pad(sheet.month)}`);
    const out: string[] = [];
    for (let d = Number(r.from.slice(8)); d <= Number(r.to.slice(8)); d++) out.push(`${r.from.slice(0, 8)}${pad(d)}`);
    return out;
  })() : [...new Set(sheet.rows.flatMap((r) => Object.keys(r.cells)))].sort();
  const sources = [...new Set(sheet.rows.flatMap((r) => Object.values(r.cells).map((c) => c.source)).filter(Boolean))];
  return (
    <div className="ops-grid-wrap">
      <div className="ops-grid__head">
        <b>{sheet.title || f.period(`${sheet.year}-${pad(sheet.month)}`)}</b>
        <HrmStatus value={sheet.status} />
        <Link className="btn btn--line btn--sm" href={domainHref("timesheet", "", sheet.id)}>{t("openRecord")}<IconArrowRight /></Link>
      </div>
      {!sheet.rows.length ? <p className="hrm-muted ops-note">{t("noRows")}</p> : (
        <div className="ops-grid-scroll" tabIndex={0} aria-label={t("gridLabel")}>
          <table className="ops-grid">
            <thead>
              <tr>
                <th className="ops-grid__who">{t("employee")}</th>
                {days.map((d) => {
                  const wd = new Date(`${d}T12:00`).getDay();
                  return <th key={d} className={wd === 0 || wd === 6 ? "is-we" : undefined}>{Number(d.slice(8))}</th>;
                })}
                <th className="hrm-num">{t("hours")}</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => {
                const hours = Object.values(r.cells).reduce((s, c) => s + (c.hours ?? 0), 0);
                const total = typeof r.totals.hours === "number" ? r.totals.hours : typeof r.totals.total_hours === "number" ? r.totals.total_hours : hours;
                return (
                  <tr key={r.employeeId || r.name}>
                    <th className="ops-grid__who" scope="row"><HrmPerson name={r.name || dir.employeeName(r.employeeId) || "—"} sub={r.code || dir.employee(r.employeeId)?.code} size="sm" /></th>
                    {days.map((d) => {
                      const c = r.cells[d];
                      return (
                        <td key={d} className={c ? `ops-cell ops-cell--${CELL_TONE(c.code) || "none"}` : "ops-cell"} title={c ? [c.code, c.hours !== null ? t("hoursN", { n: f.num(c.hours) }) : "", c.source ? (t.has(`source.${c.source}`) ? t(`source.${c.source}`) : c.source) : ""].filter(Boolean).join(" · ") : undefined}>
                          {c ? <><b>{c.code || "·"}</b>{c.hours !== null && c.hours > 0 ? <small>{f.num(c.hours)}</small> : null}</> : null}
                        </td>
                      );
                    })}
                    <td className="hrm-num"><b>{f.num(total)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {sources.length ? <p className="ops-legend">{sources.map((s) => <span key={s}>{t.has(`source.${s}`) ? t(`source.${s}`) : s}</span>)}</p> : null}
    </div>
  );
}

function SheetCreate({ month, unit, onClose, onDone }: { month: string; unit: string; onClose: () => void; onDone: (s: Timesheet) => void }) {
  const t = useTranslations("internal.ops.sheet");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [m, setM] = useState(month);
  const [u, setU] = useState(unit);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const auto = f.period(m);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !m) return;
    const [y, mm] = m.split("-").map(Number);
    setBusy(true);
    setErr("");
    try {
      const s = await createTimesheet({ title: title.trim() || [auto, dir.unitName(u)].filter(Boolean).join(" · "), year: y, month: mm, org_unit_id: u || null });
      notify.success(t("created"));
      onDone(s.id ? s : { ...s, year: y, month: mm });
    } catch (cause) {
      setErr(hrmErrorOf(cause).message || opsError(cause) || t("createError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <HrmDrawer open onClose={onClose} title={t("new")} sub={t("newLead")}>
      <form className="hrm-form" onSubmit={submit} noValidate>
        {err ? <HrmError text={err} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("month")}><MonthPicker value={m} onChange={(v) => setM(v || month)} placeholder={t("month")} ariaLabel={t("month")} /></InternalField>
          <InternalField label={t("unit")} hint={t("unitHint")}><EntitySelect value={u} onChange={setU} options={dir.unitOptions} placeholder={t("allUnits")} ariaLabel={t("unit")} /></InternalField>
        </div>
        <InternalField label={t("name")}><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={[auto, dir.unitName(u)].filter(Boolean).join(" · ")} /></InternalField>
        <p className="hrm-form__note">{t("newNote")}</p>
        <div className="hrm-form__foot">
          <button type="submit" className="btn btn--pri btn--sm" disabled={busy}>{busy ? <span className="stu-spin" aria-hidden /> : <IconPlus />}{t("generate")}</button>
          <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// ── Scheduling (§9) ─────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = { scheduled: "ok", working: "ok", leave: "info", vacation: "info", sick: "info", holiday: "off", day_off: "off", off: "off", no_shift: "none", absent: "err" };
// A planned day without a shift is a day off in the plan.
const cellTone = (c: MatrixCell | undefined) => (!c ? "none" : c.shift ? STATUS_TONE[c.status] ?? "ok" : c.status === "scheduled" ? "off" : STATUS_TONE[c.status] ?? "none");

function MatrixTable({ matrix, nameOf }: { matrix: Matrix; nameOf: (id: string) => { name: string; sub: string } }) {
  const t = useTranslations("internal.ops.plan");
  const today = todayIso();
  return (
    <div className="ops-grid-scroll" tabIndex={0} aria-label={t("gridLabel")}>
      <table className="ops-grid ops-grid--plan">
        <thead>
          <tr>
            <th className="ops-grid__who">{t("employee")}</th>
            {matrix.days.map((d) => {
              const wd = new Date(`${d}T12:00`).getDay();
              return <th key={d} className={`${wd === 0 || wd === 6 ? "is-we" : ""}${d === today ? " is-today" : ""}`}>{Number(d.slice(8))}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => {
            const who = nameOf(r.employeeId);
            return (
              <tr key={r.employeeId}>
                <th className="ops-grid__who" scope="row"><HrmPerson name={who.name} sub={who.sub} size="sm" /></th>
                {matrix.days.map((d) => {
                  const c = r.cells[d];
                  const tone = cellTone(c);
                  const st = c && !c.shift && c.status === "scheduled" ? "day_off" : c?.status ?? "";
                  const label = st && t.has(`status.${st}`) ? t(`status.${st}`) : st;
                  return (
                    <td key={d} className={`ops-cell ops-cell--${tone}${d === today ? " is-today" : ""}`} title={[c?.shift ? `${c.shift.start}–${c.shift.end}` : "", label].filter(Boolean).join(" · ")}>
                      {c?.shift ? <><b>{c.shift.start.replace(/:00$/, "")}</b><small>{c.shift.end.replace(/:00$/, "")}</small></> : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Who works which shift on which day (GET /internal/hrm/scheduling/matrix),
// and who is on duty right now.
export function ScheduleMatrixPanel() {
  const t = useTranslations("internal.ops.plan");
  const dir = useHrmDirectory();
  const [month, setMonth] = useState(monthOf());
  const [unit, setUnit] = useState("");
  const range = monthRange(month);
  const { data, error, reload } = useOps((s) => getScheduleMatrix({ ...range, unitId: unit || undefined }, s), [month, unit], ["scheduling", "schedule"]);
  const duty = useOps((s) => getOnDuty(new Date().toISOString(), s), [], ["scheduling", "attendance"]);
  const extra = useMissingNames((data?.rows ?? []).map((r) => r.employeeId).filter((id) => !dir.employee(id)), dir.ready && !!data);
  const nameOf = (id: string) => {
    const e = dir.employee(id);
    if (!e && extra[id]) return { name: extra[id].name || extra[id].code, sub: extra[id].code };
    return { name: e?.name || e?.code || "—", sub: [e?.code, dir.positionTitle(e?.positionId ?? "")].filter(Boolean).join(" · ") };
  };
  return (
    <HrmPanel title={t("title")} icon={IconCalendar} className="ops-panel" count={data?.total}>
      <div className="ops-bar">
        <div className="ops-bar__m"><MonthPicker value={month} onChange={(v) => setMonth(v || monthOf())} placeholder={t("month")} ariaLabel={t("month")} /></div>
        {dir.unitOptions.length ? <div className="hrm-toolbar__sel"><EntitySelect value={unit} onChange={setUnit} options={dir.unitOptions} placeholder={t("allUnits")} ariaLabel={t("unit")} /></div> : null}
      </div>
      <div className="ops-duty">
        <span className="ops-duty__h"><IconClock aria-hidden />{t("onDuty")}</span>
        {duty.data ? duty.data.length ? duty.data.map((m) => <span key={m.id} className="ops-duty__p">{m.name || dir.employeeName(m.id)}</span>) : <span className="hrm-muted">{t("nobodyOnDuty")}</span> : <span className="hrm-muted">…</span>}
      </div>
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} /> : !data ? <HrmLoading rows={4} /> : !data.rows.length ? <HrmEmpty icon={IconCalendar} title={t("empty")} /> : <MatrixTable matrix={data} nameOf={nameOf} />}
      <p className="ops-legend">
        {(["scheduled", "leave", "day_off", "no_shift"] as const).map((s) => <span key={s} className={`ops-legend--${STATUS_TONE[s]}`}>{t(`status.${s}`)}</span>)}
      </p>
    </HrmPanel>
  );
}

// One's own month (GET /internal/me/schedule): each day's shift as the
// backend planned it.
export function MySchedulePanel() {
  const t = useTranslations("internal.ops.plan");
  const today = todayIso();
  const [month, setMonth] = useState(monthOf());
  const range = monthRange(month);
  const { data, error, reload } = useOps((s) => getMySchedule(range, s), [month], ["scheduling", "schedule"]);
  const days = useMemo(() => {
    const out: Record<string, CalDay> = {};
    const row = data?.rows[0];
    for (const [d, c] of Object.entries(row?.cells ?? {})) {
      const tone = cellTone(c);
      if (tone === "none") continue;
      if (tone === "off") {
        out[d] = { tone: "gray", label: t("status.day_off") };
        continue;
      }
      out[d] = {
        tone: tone === "ok" ? "ok" : tone === "info" ? "info" : tone === "err" ? "err" : "gray",
        label: c.shift ? `${c.shift.start}–${c.shift.end}` : t.has(`status.${c.status}`) ? t(`status.${c.status}`) : c.status,
        sub: c.shift && c.shift.breakMinutes ? t("breakM", { m: c.shift.breakMinutes }) : undefined,
      };
    }
    return out;
  }, [data, t]);
  return (
    <HrmPanel title={t("mine")} icon={IconCalendar} className="ops-panel">
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} /> : null}
      {data && !Object.keys(days).length ? <p className="hrm-muted ops-note">{t("mineEmpty")}</p> : null}
      <HrmCalendar month={month} onMonth={setMonth} days={days} today={today} />
    </HrmPanel>
  );
}
