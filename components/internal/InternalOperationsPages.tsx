"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ApiError, asDict, asNum } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { humanize } from "@/lib/labels";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  createAttendanceEvent,
  createExecutionTask,
  createKpiMetric,
  createPayrollEntry,
  getAnalyticsDashboard,
  getAnalyticsExport,
  getAttendanceDays,
  getExecutionTasks,
  getKpiMetrics,
  getPayrollEntries,
  getPayrollSummary,
  normAttendance,
  normKpi,
  normPayroll,
  normTask,
  type HrmAttendance,
  type HrmKpi,
  type HrmPayroll,
  type HrmTask,
  type InternalPage,
} from "@/lib/services/internalHrm";
import { IconAlert, IconBriefcase, IconCalendar, IconCard, IconChartBar, IconChat, IconCheck, IconClock, IconDownload, IconPlus, IconRefresh, IconTrash, IconTrendingUp, IconUsers } from "@/components/icons";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import DatePicker from "@/components/DatePicker";
import MonthPicker from "@/components/MonthPicker";
import Select from "@/components/Select";
import InternalPagination from "@/components/internal/InternalPagination";
import InternalField from "@/components/internal/InternalField";
import TaskDrawer, { TASK_STATUSES } from "@/components/internal/TaskDrawer";
import { AttendanceTable } from "@/components/internal/InternalSelfPages";
import { useHrmDirectory, type HrmDirectory } from "@/components/internal/useHrmDirectory";
import {
  EntitySelect,
  HrmBar,
  HrmDrawer,
  HrmEmpty,
  HrmError,
  HrmHead,
  HrmLoading,
  HrmPanel,
  HrmPerson,
  HrmPriority,
  HrmStat,
  HrmStatus,
  isOverdue,
  useHrmFormat,
  useNow,
  useStatusLabel,
} from "@/components/internal/HrmUi";

type Mode = "execution" | "time" | "kpi" | "payroll" | "analytics";
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const KPI_SOURCES = ["execution", "attendance", "sales", "manual", "system"] as const;
const PAYROLL_ENTRY_TYPES = ["salary", "kpi_bonus", "sales_bonus", "one_time_bonus", "penalty", "advance", "deduction", "adjustment"] as const;
const PAYROLL_STATUSES = ["draft", "approved", "paid", "cancelled"] as const;
const EMPTY_PAGE = { items: [], total: 0, offset: 0, limit: 25, hasMore: false };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const aborted = (e: unknown) => e instanceof ApiError && e.detail === "aborted";

export default function InternalOperationsPages({ mode }: { mode: Mode }) {
  if (mode === "execution") return <ExecutionPage />;
  if (mode === "time") return <TimePage />;
  if (mode === "kpi") return <KpiPage />;
  if (mode === "payroll") return <PayrollPage />;
  return <AnalyticsPage />;
}

// Shared list loading: abortable fetch, a refetch on any internal.* event,
// and a stable reload for buttons and drawers.
function usePaged<T>(fetcher: (signal?: AbortSignal) => Promise<InternalPage<T>>) {
  const [page, setPage] = useState<InternalPage<T>>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      setPage(await fetcher(signal));
    } catch (cause) {
      if (!aborted(cause)) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [fetcher]);
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => load(c.signal));
    return () => c.abort();
  }, [load]);
  const reload = useCallback(() => void load(), [load]);
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) reload(); }), [reload]);
  return { page, loading, error, reload };
}

const employeeField = (key: string, label: string, value: string, onChange: (v: string) => void, dir: HrmDirectory, all: string): FilterField => ({
  key,
  label,
  icon: IconUsers,
  value,
  onChange,
  options: [{ value: "", label: all }, ...dir.employees.map((e) => ({ value: e.id, label: e.name || e.code }))],
  empty: "",
  hidden: !dir.employees.length,
});

function personOf(dir: HrmDirectory, id: string) {
  const e = dir.employee(id);
  return { name: e?.name || e?.code || "—", sub: [e?.code, dir.positionTitle(e?.positionId ?? "")].filter(Boolean).join(" · ") };
}

function RefreshButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return <button className="btn btn--line btn--sm" type="button" onClick={onClick} disabled={busy}><IconRefresh />{label}</button>;
}

// ── Execution ──────────────────────────────────────────────────────────────

function ExecutionPage() {
  const t = useTranslations("internal.operations");
  const tu = useTranslations("internal.ui");
  const label = useStatusLabel();
  const f = useHrmFormat();
  const now = useNow();
  const dir = useHrmDirectory();
  const [filters, setFilters] = useState({ q: "", status: "", responsible: "", dateFrom: "", dateTo: "" });
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState("");
  const [creating, setCreating] = useState(false);
  const set = (k: keyof typeof filters) => (v: string) => { setFilters((c) => ({ ...c, [k]: v })); setOffset(0); };

  const { page, loading, error, reload } = usePaged<HrmTask>(
    useCallback(async (signal?: AbortSignal) => {
      const res = await getExecutionTasks({ q: filters.q || undefined, status: filters.status || undefined, responsible_employee_id: filters.responsible || undefined, date_from: filters.dateFrom || undefined, date_to: filters.dateTo || undefined, limit: 50, offset }, signal);
      return { ...res, items: res.items.map(normTask) };
    }, [filters, offset]),
  );

  const stats = useMemo(() => ({
    open: page.items.filter((x) => !["done", "cancelled"].includes(x.status)).length,
    review: page.items.filter((x) => x.status === "in_review").length,
    done: page.items.filter((x) => x.status === "done").length,
    overdue: page.items.filter((x) => isOverdue(x.deadline, x.status, now)).length,
  }), [page.items, now]);
  const open = page.items.find((x) => x.id === openId) ?? null;

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("titles.execution")} lead={t("subtitles.execution")} actions={<><RefreshButton onClick={reload} busy={loading} label={t("refresh")} /><button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("new.execution")}</button></>} />
      <div className="hrm-stats">
        <HrmStat icon={IconBriefcase} tone="blue" label={t("stat.open")} value={loading ? "…" : stats.open} />
        <HrmStat icon={IconChat} tone="warn" label={t("stat.review")} value={loading ? "…" : stats.review} />
        <HrmStat icon={IconCheck} tone="ok" label={t("stat.done")} value={loading ? "…" : stats.done} />
        <HrmStat icon={IconAlert} tone="err" label={t("stat.overdue")} value={loading ? "…" : stats.overdue} />
      </div>
      <FilterBar
        search={{ value: filters.q, onChange: set("q"), placeholder: t("filters.search"), maxLength: 120 }}
        fields={[
          { key: "status", label: t("filters.status"), value: filters.status, onChange: set("status"), options: [{ value: "", label: t("filters.allStatuses") }, ...TASK_STATUSES.map((s) => ({ value: s, label: label(s) }))], empty: "" },
          employeeField("resp", t("filters.responsible"), filters.responsible, set("responsible"), dir, tu("all")),
          { key: "from", label: t("filters.dateFrom"), icon: IconCalendar, node: <DatePicker value={filters.dateFrom} onChange={set("dateFrom")} placeholder={t("filters.dateFrom")} ariaLabel={t("filters.dateFrom")} max={filters.dateTo || undefined} clearLabel={tu("clear")} />, active: !!filters.dateFrom, chip: filters.dateFrom ? `${t("filters.dateFrom")}: ${f.date(filters.dateFrom)}` : null, clear: () => set("dateFrom")("") },
          { key: "to", label: t("filters.dateTo"), icon: IconCalendar, node: <DatePicker value={filters.dateTo} onChange={set("dateTo")} placeholder={t("filters.dateTo")} ariaLabel={t("filters.dateTo")} min={filters.dateFrom || undefined} clearLabel={tu("clear")} />, active: !!filters.dateTo, chip: filters.dateTo ? `${t("filters.dateTo")}: ${f.date(filters.dateTo)}` : null, clear: () => set("dateTo")("") },
        ]}
        count={page.total}
        onReset={() => { setFilters({ q: "", status: "", responsible: "", dateFrom: "", dateTo: "" }); setOffset(0); }}
      />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <HrmPanel flush>
        {loading ? <div style={{ padding: 16 }}><HrmLoading rows={5} /></div> : page.items.length ? (
          <div className="hrm-table-wrap">
            <table className="hrm-table">
              <thead><tr><th>{t("columns.task")}</th><th>{t("columns.assignee")}</th><th>{t("columns.priority")}</th><th>{t("columns.status")}</th><th>{t("columns.due")}</th><th>{t("columns.checklist")}</th></tr></thead>
              <tbody>
                {page.items.map((x) => {
                  const late = isOverdue(x.deadline, x.status, now);
                  const done = x.checklist.filter((c) => c.done).length;
                  return (
                    <tr key={x.id} className="is-click" tabIndex={0} onClick={() => setOpenId(x.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(x.id); }}>
                      <td><b>{x.title}</b><small>{[x.code, x.project].filter(Boolean).join(" · ")}</small></td>
                      <td>{x.responsibleName ? <HrmPerson name={x.responsibleName} sub={x.responsibleCode} size="sm" /> : <span className="hrm-muted">{tu("unassigned")}</span>}</td>
                      <td><HrmPriority value={x.priority} /></td>
                      <td><HrmStatus value={x.status} /></td>
                      <td>{x.deadline ? <span className={late ? "hrm-late" : undefined}>{f.dateTime(x.deadline)}</span> : "—"}</td>
                      <td>{x.checklist.length ? <span className="hrm-check-mini"><HrmBar value={(done / x.checklist.length) * 100} /><small>{done}/{x.checklist.length}</small></span> : <span className="hrm-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <HrmEmpty icon={IconBriefcase} title={t("empty.execution")} text={t("emptyExecutionLead")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("new.execution")}</button>} />}
        <InternalPagination page={page} onChange={setOffset} />
      </HrmPanel>
      <TaskDrawer task={open} manage onClose={() => setOpenId("")} onChanged={reload} unitName={open ? dir.unitName(open.unitId) : ""} />
      <TaskCreate open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />
    </section>
  );
}

function TaskCreate({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("internal.operations");
  const tu = useTranslations("internal.ui");
  const dir = useHrmDirectory();
  const blank = { title: "", description: "", project: "", responsible: "", unit: "", priority: "normal", due: "" };
  const [form, setForm] = useState(blank);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const set = (k: keyof typeof blank) => (v: string) => setForm((c) => ({ ...c, [k]: v }));
  // Picking the responsible person fills in their unit, which is nearly
  // always the unit the task belongs to; it stays editable.
  const pickResponsible = (id: string) => setForm((c) => ({ ...c, responsible: id, unit: c.unit || dir.employee(id)?.unitId || "" }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !form.title.trim()) return;
    setBusy(true);
    setError(false);
    try {
      await createExecutionTask({
        title: form.title.trim(),
        description: form.description.trim(),
        project: form.project.trim() || "internal",
        responsible_employee_id: form.responsible || null,
        org_unit_id: form.unit || null,
        priority: form.priority,
        // The end of the working day in Tashkent on the chosen date.
        deadline_at: form.due ? `${form.due}T18:00:00+05:00` : null,
        checklist: checklist.map((c) => c.trim()).filter(Boolean).map((title) => ({ title, done: false })),
        participants: [],
        attachments: [],
        meta: {},
      });
      setForm(blank);
      setChecklist([]);
      onCreated();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer open={open} onClose={onClose} title={t("new.execution")} sub={t("newExecutionLead")}>
      <form className="hrm-form" onSubmit={submit}>
        {error ? <HrmError text={t("error")} /> : null}
        <InternalField label={t("title")}><input value={form.title} onChange={(e) => set("title")(e.target.value)} maxLength={160} required /></InternalField>
        <InternalField label={t("description")}><textarea value={form.description} onChange={(e) => set("description")(e.target.value)} maxLength={2000} rows={3} /></InternalField>
        <div className="hrm-form__grid">
          <InternalField label={t("responsible")}><EntitySelect value={form.responsible} onChange={pickResponsible} options={dir.employeeOptions} placeholder={tu("choose.employee")} ariaLabel={t("responsible")} /></InternalField>
          <InternalField label={t("unitId")}><EntitySelect value={form.unit} onChange={set("unit")} options={dir.unitOptions} placeholder={tu("choose.unit")} ariaLabel={t("unitId")} /></InternalField>
          <InternalField label={t("project")}><input value={form.project} onChange={(e) => set("project")(e.target.value)} maxLength={80} placeholder="LexGo HRM" /></InternalField>
          <InternalField label={t("priority")}><Select value={form.priority} onChange={set("priority")} options={PRIORITIES.map((p) => ({ value: p, label: tu(`priority.${p}`) }))} ariaLabel={t("priority")} /></InternalField>
          <InternalField label={t("due")}><DatePicker value={form.due} onChange={set("due")} placeholder={t("due")} ariaLabel={t("due")} clearLabel={tu("clear")} /></InternalField>
        </div>
        <div className="hrm-form">
          <span className="ldrw__lbl">{t("checklist")}</span>
          {checklist.map((c, i) => (
            <div className="hrm-check-row" key={i}>
              <input className="hrm-input" value={c} onChange={(e) => setChecklist((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder={t("checklistItem")} maxLength={160} aria-label={t("checklistItem")} />
              <button type="button" className="org-detail__edit" onClick={() => setChecklist((l) => l.filter((_, j) => j !== i))} aria-label={t("remove")} title={t("remove")}><IconTrash /></button>
            </div>
          ))}
          <button type="button" className="btn btn--line btn--sm" style={{ justifySelf: "start" }} onClick={() => setChecklist((l) => [...l, ""])}><IconPlus />{t("addChecklist")}</button>
        </div>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy}><IconPlus />{busy ? t("saving") : t("create")}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// ── Time & attendance ──────────────────────────────────────────────────────

function TimePage() {
  const t = useTranslations("internal.operations");
  const tu = useTranslations("internal.ui");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [filters, setFilters] = useState({ employee: "", dateFrom: "", dateTo: "" });
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<"" | "ok" | "err">("");
  const set = (k: keyof typeof filters) => (v: string) => { setFilters((c) => ({ ...c, [k]: v })); setOffset(0); };

  const { page, loading, error, reload } = usePaged<HrmAttendance>(
    useCallback(async (signal?: AbortSignal) => {
      const res = await getAttendanceDays({ employee_id: filters.employee || undefined, date_from: filters.dateFrom || undefined, date_to: filters.dateTo || undefined, limit: 50, offset }, signal);
      return { ...res, items: res.items.map(normAttendance) };
    }, [filters, offset]),
  );

  async function event(eventType: "check_in" | "check_out" | "break_start" | "break_end") {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      await createAttendanceEvent({ event_type: eventType, source: "manual", event_at: null, note: "", meta: {} });
      setNote("ok");
      reload();
    } catch {
      setNote("err");
    } finally {
      setBusy(false);
    }
  }

  const sum = useMemo(() => {
    const items = page.items;
    const worked = items.reduce((s, r) => s + r.workedMinutes, 0);
    return {
      present: items.filter((r) => r.status === "present" || r.workedMinutes > 0).length,
      absent: items.filter((r) => r.status === "absent").length,
      late: items.filter((r) => r.lateMinutes > 0).length,
      avg: items.length ? Math.round(worked / Math.max(1, items.filter((r) => r.workedMinutes > 0).length)) : 0,
    };
  }, [page.items]);

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("titles.time")} lead={t("subtitles.time")} actions={<RefreshButton onClick={reload} busy={loading} label={t("refresh")} />} />
      <HrmPanel className="hrm-clock-panel">
        <div className="hrm-clock">
          <div className="hrm-clock__t">
            <span className="hrm-panel__i"><IconClock /></span>
            <span><b>{t("attendanceActions")}</b><small className="hrm-muted" style={{ display: "block" }}>{t("attendanceHint")}</small></span>
          </div>
          <div className="hrm-clock__a">
            <button className="btn btn--pri btn--sm" type="button" onClick={() => void event("check_in")} disabled={busy}><IconClock />{t("checkIn")}</button>
            <button className="btn btn--line btn--sm" type="button" onClick={() => void event("break_start")} disabled={busy}>{t("breakStart")}</button>
            <button className="btn btn--line btn--sm" type="button" onClick={() => void event("break_end")} disabled={busy}>{t("breakEnd")}</button>
            <button className="btn btn--line btn--sm" type="button" onClick={() => void event("check_out")} disabled={busy}><IconClock />{t("checkOut")}</button>
          </div>
        </div>
        {note === "ok" ? <div className="hrm-ok" style={{ marginTop: 12 }}><IconCheck />{t("eventSaved")}</div> : note === "err" ? <div style={{ marginTop: 12 }}><HrmError text={t("eventError")} /></div> : null}
      </HrmPanel>
      <div className="hrm-stats">
        <HrmStat icon={IconCheck} tone="ok" label={t("stat.present")} value={loading ? "…" : sum.present} />
        <HrmStat icon={IconAlert} tone="err" label={t("stat.absent")} value={loading ? "…" : sum.absent} />
        <HrmStat icon={IconCalendar} tone="warn" label={t("stat.late")} value={loading ? "…" : sum.late} />
        <HrmStat icon={IconClock} tone="blue" label={t("stat.avgDay")} value={loading ? "…" : f.minutes(sum.avg)} />
      </div>
      <FilterBar
        fields={[
          employeeField("emp", t("filters.employeeId"), filters.employee, set("employee"), dir, tu("all")),
          { key: "from", label: t("filters.dateFrom"), icon: IconCalendar, node: <DatePicker value={filters.dateFrom} onChange={set("dateFrom")} placeholder={t("filters.dateFrom")} ariaLabel={t("filters.dateFrom")} max={filters.dateTo || undefined} clearLabel={tu("clear")} />, active: !!filters.dateFrom, chip: filters.dateFrom ? `${t("filters.dateFrom")}: ${f.date(filters.dateFrom)}` : null, clear: () => set("dateFrom")("") },
          { key: "to", label: t("filters.dateTo"), icon: IconCalendar, node: <DatePicker value={filters.dateTo} onChange={set("dateTo")} placeholder={t("filters.dateTo")} ariaLabel={t("filters.dateTo")} min={filters.dateFrom || undefined} clearLabel={tu("clear")} />, active: !!filters.dateTo, chip: filters.dateTo ? `${t("filters.dateTo")}: ${f.date(filters.dateTo)}` : null, clear: () => set("dateTo")("") },
        ]}
        count={page.total}
        onReset={() => { setFilters({ employee: "", dateFrom: "", dateTo: "" }); setOffset(0); }}
      />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <HrmPanel flush>
        {loading ? <div style={{ padding: 16 }}><HrmLoading rows={5} /></div> : page.items.length ? <AttendanceTable rows={page.items} nameOf={(r) => personOf(dir, r.employeeId)} /> : <HrmEmpty icon={IconCalendar} title={t("empty.time")} />}
        <InternalPagination page={page} onChange={setOffset} />
      </HrmPanel>
    </section>
  );
}

// ── KPI ────────────────────────────────────────────────────────────────────

function KpiPage() {
  const t = useTranslations("internal.operations");
  const tu = useTranslations("internal.ui");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [filters, setFilters] = useState({ employee: "", period: "" });
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const set = (k: keyof typeof filters) => (v: string) => { setFilters((c) => ({ ...c, [k]: v })); setOffset(0); };

  const { page, loading, error, reload } = usePaged<HrmKpi>(
    useCallback(async (signal?: AbortSignal) => {
      const res = await getKpiMetrics({ employee_id: filters.employee || undefined, period: filters.period || undefined, limit: 50, offset }, signal);
      return { ...res, items: res.items.map(normKpi) };
    }, [filters, offset]),
  );

  const sum = useMemo(() => {
    const items = page.items;
    return {
      avg: items.length ? items.reduce((s, k) => s + k.score, 0) / items.length : 0,
      people: new Set(items.map((k) => k.employeeId)).size,
      below: items.filter((k) => k.target > 0 && k.actual < k.target).length,
    };
  }, [page.items]);

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("titles.kpi")} lead={t("subtitles.kpi")} actions={<><RefreshButton onClick={reload} busy={loading} label={t("refresh")} /><button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("new.kpi")}</button></>} />
      <div className="hrm-stats">
        <HrmStat icon={IconTrendingUp} tone="blue" label={t("stat.avgScore")} value={loading ? "…" : f.num(sum.avg)} />
        <HrmStat icon={IconChartBar} tone="violet" label={t("stat.metrics")} value={loading ? "…" : page.total} />
        <HrmStat icon={IconUsers} tone="ok" label={t("stat.people")} value={loading ? "…" : sum.people} />
        <HrmStat icon={IconAlert} tone="warn" label={t("stat.belowTarget")} value={loading ? "…" : sum.below} />
      </div>
      <FilterBar
        fields={[
          employeeField("emp", t("filters.employeeId"), filters.employee, set("employee"), dir, tu("all")),
          { key: "period", label: t("filters.period"), icon: IconCalendar, node: <MonthPicker value={filters.period} onChange={set("period")} placeholder={tu("choose.period")} ariaLabel={t("filters.period")} clearLabel={tu("clear")} />, active: !!filters.period, chip: filters.period ? f.period(filters.period) : null, clear: () => set("period")("") },
        ]}
        count={page.total}
        onReset={() => { setFilters({ employee: "", period: "" }); setOffset(0); }}
      />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <HrmPanel flush>
        {loading ? <div style={{ padding: 16 }}><HrmLoading rows={5} /></div> : page.items.length ? (
          <div className="hrm-table-wrap">
            <table className="hrm-table">
              <thead><tr><th>{t("columns.employee")}</th><th>{t("columns.metric")}</th><th>{t("columns.progress")}</th><th className="hrm-num">{t("columns.score")}</th><th className="hrm-num">{t("weight")}</th><th>{t("columns.period")}</th></tr></thead>
              <tbody>
                {page.items.map((k) => {
                  const who = personOf(dir, k.employeeId);
                  const pct = k.target ? (k.actual / k.target) * 100 : k.score;
                  return (
                    <tr key={k.id}>
                      <td><HrmPerson name={who.name} sub={who.sub} size="sm" /></td>
                      <td><b>{k.title}</b><small>{[k.code, k.source && t.has(`sources.${k.source}`) ? t(`sources.${k.source}`) : k.source].filter(Boolean).join(" · ")}</small></td>
                      <td><span className="hrm-check-mini"><HrmBar value={pct} /><small>{`${f.num(k.actual)} / ${f.num(k.target)}${k.unit === "percent" ? " %" : ""}`}</small></span></td>
                      <td className="hrm-num"><b>{f.num(k.score)}</b></td>
                      <td className="hrm-num">{k.weight ? `${f.num(k.weight)}%` : "—"}</td>
                      <td className="hrm-muted">{f.period(k.period)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <HrmEmpty icon={IconChartBar} title={t("empty.kpi")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("new.kpi")}</button>} />}
        <InternalPagination page={page} onChange={setOffset} />
      </HrmPanel>
      <KpiCreate open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />
    </section>
  );
}

function KpiCreate({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("internal.operations");
  const tu = useTranslations("internal.ui");
  const dir = useHrmDirectory();
  const blank = { employee: "", period: thisMonth(), title: "", target: "", actual: "", weight: "100", source: "manual" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const set = (k: keyof typeof blank) => (v: string) => setForm((c) => ({ ...c, [k]: v }));
  const numeric = (v: string) => v.replace(/[^\d.,]/g, "").replace(",", ".");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !form.employee || !form.title.trim() || !form.period) return;
    setBusy(true);
    setError(false);
    try {
      await createKpiMetric({
        employee_id: form.employee,
        period: form.period,
        metric_code: form.title.trim().toLowerCase().replace(/[^a-z0-9а-яёўқғҳ]+/gi, "_").replace(/^_|_$/g, "").slice(0, 60) || "metric",
        title: form.title.trim(),
        target_value: Number(form.target) || 0,
        actual_value: Number(form.actual) || 0,
        // 0 = let the backend work the score out of target/actual (10-08).
        score: 0,
        weight: Number(form.weight) || 100,
        source: form.source,
        status: "active",
        meta: {},
      });
      setForm(blank);
      onCreated();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer open={open} onClose={onClose} title={t("new.kpi")} sub={t("newKpiLead")}>
      <form className="hrm-form" onSubmit={submit}>
        {error ? <HrmError text={t("error")} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("employeeId")}><EntitySelect value={form.employee} onChange={set("employee")} options={dir.employeeOptions} placeholder={tu("choose.employee")} ariaLabel={t("employeeId")} /></InternalField>
          <InternalField label={t("period")}><MonthPicker value={form.period} onChange={set("period")} placeholder={tu("choose.period")} ariaLabel={t("period")} /></InternalField>
          <InternalField label={t("metricName")}><input value={form.title} onChange={(e) => set("title")(e.target.value)} maxLength={120} required placeholder={t("metricPh")} /></InternalField>
          <InternalField label={t("source")}><Select value={form.source} onChange={set("source")} options={KPI_SOURCES.map((s) => ({ value: s, label: t(`sources.${s}`) }))} ariaLabel={t("source")} /></InternalField>
          <InternalField label={t("target")}><input value={form.target} onChange={(e) => set("target")(numeric(e.target.value))} inputMode="decimal" maxLength={12} placeholder="100" /></InternalField>
          <InternalField label={t("actual")}><input value={form.actual} onChange={(e) => set("actual")(numeric(e.target.value))} inputMode="decimal" maxLength={12} placeholder="0" /></InternalField>
          <InternalField label={t("weight")} hint={t("weightHint")}><input value={form.weight} onChange={(e) => set("weight")(numeric(e.target.value))} inputMode="decimal" maxLength={6} /></InternalField>
        </div>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !form.employee}><IconPlus />{busy ? t("saving") : t("create")}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// ── Payroll ────────────────────────────────────────────────────────────────

function PayrollPage() {
  const t = useTranslations("internal.operations");
  const tu = useTranslations("internal.ui");
  const label = useStatusLabel();
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [filters, setFilters] = useState({ employee: "", period: "", status: "" });
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<{ total: number; count: number; byType: [string, number][]; period: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const set = (k: keyof typeof filters) => (v: string) => { setFilters((c) => ({ ...c, [k]: v })); setOffset(0); };

  const { page, loading, error, reload } = usePaged<HrmPayroll>(
    useCallback(async (signal?: AbortSignal) => {
      const [rows, totals] = await Promise.all([
        getPayrollEntries({ employee_id: filters.employee || undefined, period: filters.period || undefined, status: filters.status || undefined, limit: 50, offset }, signal),
        getPayrollSummary({ period: filters.period || undefined }, signal).catch(() => null),
      ]);
      const s = asDict(totals);
      setSummary(totals ? { total: asNum(s.total_amount), count: asNum(s.entries_count), byType: Object.entries(asDict(s.by_type)).map(([k, v]) => [k, asNum(v)]), period: String(s.period ?? "") } : null);
      return { ...rows, items: rows.items.map(normPayroll) };
    }, [filters, offset]),
  );
  const typeLabel = (type: string) => (t.has(`entryTypes.${type}`) ? t(`entryTypes.${type}`) : humanize(type));

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("titles.payroll")} lead={t("subtitles.payroll")} actions={<><RefreshButton onClick={reload} busy={loading} label={t("refresh")} /><button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("new.payroll")}</button></>} />
      {summary ? (
        <div className="hrm-grid hrm-grid--side">
          <div className="hrm-payroll-total">
            <span className="hrm-kicker">{t("payrollTotal")}{summary.period ? ` · ${f.period(summary.period)}` : ""}</span>
            <b>{f.money(summary.total)}</b>
            <small>{t("entriesCount", { n: summary.count })}</small>
          </div>
          <HrmPanel title={t("byType")} icon={IconCard}>
            {summary.byType.length ? (
              <ul className="hrm-list">
                {summary.byType.map(([type, amount]) => (
                  <li key={type} className="hrm-share">
                    <span className="hrm-share__row"><b>{typeLabel(type)}</b><b className="hrm-num">{f.moneyShort(amount)}</b></span>
                    <HrmBar value={summary.total ? (amount / summary.total) * 100 : 0} tone="blue" />
                  </li>
                ))}
              </ul>
            ) : <p className="hrm-muted">{tu("noData")}</p>}
          </HrmPanel>
        </div>
      ) : null}
      <FilterBar
        fields={[
          employeeField("emp", t("filters.employeeId"), filters.employee, set("employee"), dir, tu("all")),
          { key: "period", label: t("filters.period"), icon: IconCalendar, node: <MonthPicker value={filters.period} onChange={set("period")} placeholder={tu("choose.period")} ariaLabel={t("filters.period")} clearLabel={tu("clear")} />, active: !!filters.period, chip: filters.period ? f.period(filters.period) : null, clear: () => set("period")("") },
          { key: "status", label: t("filters.status"), value: filters.status, onChange: set("status"), options: [{ value: "", label: t("filters.allStatuses") }, ...PAYROLL_STATUSES.map((s) => ({ value: s, label: label(s) }))], empty: "" },
        ]}
        count={page.total}
        onReset={() => { setFilters({ employee: "", period: "", status: "" }); setOffset(0); }}
      />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <HrmPanel flush>
        {loading ? <div style={{ padding: 16 }}><HrmLoading rows={5} /></div> : page.items.length ? (
          <div className="hrm-table-wrap">
            <table className="hrm-table">
              <thead><tr><th>{t("columns.employee")}</th><th>{t("entryType")}</th><th>{t("columns.period")}</th><th className="hrm-num">{t("columns.amount")}</th><th>{t("columns.status")}</th></tr></thead>
              <tbody>
                {page.items.map((p) => {
                  const who = personOf(dir, p.employeeId);
                  const negative = ["penalty", "deduction", "advance"].includes(p.type);
                  return (
                    <tr key={p.id}>
                      <td><HrmPerson name={who.name} sub={who.sub} size="sm" /></td>
                      <td><b>{typeLabel(p.type)}</b>{p.title && p.title !== typeLabel(p.type) ? <small>{p.title}</small> : null}</td>
                      <td className="hrm-muted">{f.period(p.period)}</td>
                      <td className={`hrm-num${negative ? " hrm-late" : ""}`}>{negative ? "−" : ""}{f.money(p.amount)}</td>
                      <td><HrmStatus value={p.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <HrmEmpty icon={IconCard} title={t("empty.payroll")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("new.payroll")}</button>} />}
        <InternalPagination page={page} onChange={setOffset} />
      </HrmPanel>
      <PayrollCreate open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} typeLabel={typeLabel} />
    </section>
  );
}

function PayrollCreate({ open, onClose, onCreated, typeLabel }: { open: boolean; onClose: () => void; onCreated: () => void; typeLabel: (t: string) => string }) {
  const t = useTranslations("internal.operations");
  const tu = useTranslations("internal.ui");
  const dir = useHrmDirectory();
  const blank = { employee: "", period: thisMonth(), type: "salary", amount: "", title: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const set = (k: keyof typeof blank) => (v: string) => setForm((c) => ({ ...c, [k]: v }));
  // A salary entry starts at the person's assigned salary.
  const pickEmployee = (id: string) => setForm((c) => ({ ...c, employee: id, amount: c.amount || (c.type === "salary" && dir.employee(id)?.salary ? String(dir.employee(id)!.salary) : c.amount) }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount.replace(/\s/g, ""));
    if (busy || !form.employee || !form.period || !amount) return;
    setBusy(true);
    setError(false);
    try {
      await createPayrollEntry({ employee_id: form.employee, period: form.period, entry_type: form.type, title: form.title.trim() || typeLabel(form.type), amount, currency: "UZS", status: "draft", paid_at: null, meta: {} });
      setForm(blank);
      onCreated();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer open={open} onClose={onClose} title={t("new.payroll")} sub={t("newPayrollLead")}>
      <form className="hrm-form" onSubmit={submit}>
        {error ? <HrmError text={t("error")} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("employeeId")}><EntitySelect value={form.employee} onChange={pickEmployee} options={dir.employeeOptions} placeholder={tu("choose.employee")} ariaLabel={t("employeeId")} /></InternalField>
          <InternalField label={t("period")}><MonthPicker value={form.period} onChange={set("period")} placeholder={tu("choose.period")} ariaLabel={t("period")} /></InternalField>
          <InternalField label={t("entryType")}><Select value={form.type} onChange={set("type")} options={PAYROLL_ENTRY_TYPES.map((x) => ({ value: x, label: typeLabel(x) }))} ariaLabel={t("entryType")} /></InternalField>
          <InternalField label={t("amount")}><input value={form.amount} onChange={(e) => set("amount")(e.target.value.replace(/[^\d\s]/g, ""))} inputMode="numeric" maxLength={16} required placeholder="0" /></InternalField>
          <InternalField label={t("note")}><input value={form.title} onChange={(e) => set("title")(e.target.value)} maxLength={160} placeholder={typeLabel(form.type)} /></InternalField>
        </div>
        <p className="hrm-form__note">{t("payrollApprovalNote")}</p>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !form.employee || !form.amount}><IconPlus />{busy ? t("saving") : t("create")}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// ── Analytics (CEO dashboard) ──────────────────────────────────────────────

function AnalyticsPage() {
  const t = useTranslations("internal.operations");
  const tu = useTranslations("internal.ui");
  const f = useHrmFormat();
  const [dates, setDates] = useState({ from: "", to: "" });
  const [blocks, setBlocks] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const d = asDict(await getAnalyticsDashboard({ date_from: dates.from || undefined, date_to: dates.to || undefined }, signal));
      const b = asDict(d.blocks ?? d);
      setBlocks(Object.fromEntries(Object.entries(b).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v)).map(([k, v]) => [k, asDict(v)])));
    } catch (cause) {
      if (!aborted(cause)) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dates]);
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => load(c.signal));
    return () => c.abort();
  }, [load]);

  async function exportXlsx() {
    if (exporting) return;
    setExporting(true);
    try {
      saveBlob(await getAnalyticsExport({ date_from: dates.from || undefined, date_to: dates.to || undefined }), `lexgo-internal-analytics${dates.from ? `-${dates.from}` : ""}.xlsx`);
    } catch {
      setError(true);
    } finally {
      setExporting(false);
    }
  }

  const n = (block: string, key: string) => asNum(blocks[block]?.[key]);
  const ex = blocks.execution ?? {};
  const att = blocks.attendance_today ?? {};
  const present = asNum(att.present);
  const absent = asNum(att.absent);
  const known = new Set(["employees", "attendance_today", "execution", "finance", "support"]);
  const extra = Object.entries(blocks).filter(([k]) => !known.has(k));

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("titles.analytics")} lead={t("subtitles.analytics")} actions={<><RefreshButton onClick={() => void load()} busy={loading} label={t("refresh")} /><button className="btn btn--pri btn--sm" type="button" onClick={() => void exportXlsx()} disabled={exporting}><IconDownload />{exporting ? t("exporting") : t("export")}</button></>} />
      <FilterBar
        fields={[
          { key: "from", label: t("filters.dateFrom"), icon: IconCalendar, node: <DatePicker value={dates.from} onChange={(v) => setDates((d) => ({ ...d, from: v }))} placeholder={t("filters.dateFrom")} ariaLabel={t("filters.dateFrom")} max={dates.to || undefined} clearLabel={tu("clear")} />, active: !!dates.from, chip: dates.from ? `${t("filters.dateFrom")}: ${f.date(dates.from)}` : null, clear: () => setDates((d) => ({ ...d, from: "" })) },
          { key: "to", label: t("filters.dateTo"), icon: IconCalendar, node: <DatePicker value={dates.to} onChange={(v) => setDates((d) => ({ ...d, to: v }))} placeholder={t("filters.dateTo")} ariaLabel={t("filters.dateTo")} min={dates.from || undefined} clearLabel={tu("clear")} />, active: !!dates.to, chip: dates.to ? `${t("filters.dateTo")}: ${f.date(dates.to)}` : null, clear: () => setDates((d) => ({ ...d, to: "" })) },
        ]}
        onReset={() => setDates({ from: "", to: "" })}
      />
      {error ? <HrmError text={t("error")} onRetry={() => void load()} retryLabel={t("refresh")} /> : null}
      {loading ? <HrmPanel><HrmLoading rows={4} /></HrmPanel> : !Object.keys(blocks).length ? <HrmPanel><HrmEmpty icon={IconChartBar} title={t("emptyAnalytics")} /></HrmPanel> : (
        <>
          <div className="hrm-stats">
            <HrmStat icon={IconUsers} tone="blue" label={t("a.activeEmployees")} value={n("employees", "active")} />
            <HrmStat icon={IconCheck} tone="ok" label={t("a.presentToday")} value={present} hint={present + absent ? t("a.attendanceRate", { pct: Math.round((present / (present + absent)) * 100) }) : undefined} />
            <HrmStat icon={IconCard} tone="violet" label={t("a.paidAmount")} value={f.moneyShort(n("finance", "paid_amount"))} hint={t("a.payments", { n: n("finance", "payments_count") })} />
            <HrmStat icon={IconChat} tone="cyan" label={t("a.tickets")} value={n("support", "tickets")} />
          </div>
          <div className="hrm-grid hrm-grid--2">
            <HrmPanel title={t("a.execution")} icon={IconBriefcase} count={asNum(ex.total)}>
              <AnalyticsBars rows={[
                { label: t("a.open"), value: asNum(ex.open), total: asNum(ex.total), tone: "blue" },
                { label: t("a.done"), value: asNum(ex.done), total: asNum(ex.total), tone: "ok" },
                { label: t("a.overdue"), value: asNum(ex.overdue), total: asNum(ex.total), tone: "err" },
              ]} />
            </HrmPanel>
            <HrmPanel title={t("a.finance")} icon={IconTrendingUp}>
              <div className="hrm-minis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
                <div className="hrm-mini"><b>{f.moneyShort(n("finance", "paid_amount"))}</b><span>{t("a.paidAmount")}</span></div>
                <div className="hrm-mini"><b>{n("finance", "payments_count")}</b><span>{t("a.paymentsCount")}</span></div>
                <div className="hrm-mini"><b>{n("finance", "orders_count")}</b><span>{t("a.orders")}</span></div>
              </div>
              <div className="hrm-minis" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))", marginTop: 8 }}>
                <div className="hrm-mini"><b>{n("support", "tickets")}</b><span>{t("a.tickets")}</span></div>
                <div className="hrm-mini"><b>{f.num(n("support", "queued_notifications"))}</b><span>{t("a.queued")}</span></div>
              </div>
            </HrmPanel>
          </div>
          {extra.length ? (
            <div className="hrm-grid hrm-grid--3">
              {extra.map(([k, v]) => (
                <HrmPanel key={k} title={humanize(k)} icon={IconChartBar}>
                  <ul className="hrm-list">{Object.entries(v).filter(([, x]) => typeof x === "number" || typeof x === "string").map(([kk, x]) => <li key={kk}><span className="hrm-list__t"><b>{humanize(kk)}</b></span><b className="hrm-num">{String(x)}</b></li>)}</ul>
                </HrmPanel>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function AnalyticsBars({ rows }: { rows: { label: string; value: number; total: number; tone: "ok" | "warn" | "err" | "blue" }[] }) {
  return (
    <ul className="hrm-list">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hrm-list__t"><b>{r.label}</b></span>
          <span className="hrm-list__a org-headcount"><HrmBar value={r.total ? (r.value / r.total) * 100 : 0} tone={r.tone} /><b className="hrm-num">{r.value}</b></span>
        </li>
      ))}
    </ul>
  );
}

