"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { ApiError, asArr, asDict, asStr, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { subscribeUserEvents } from "@/lib/userSocket";
import { subscribeInternalEvents } from "@/lib/internalSocket";
import {
  createAttendanceEvent,
  createExecutionTask,
  createKpiMetric,
  createPayrollEntry,
  getAnalyticsDashboard,
  getAttendanceDays,
  getExecutionTasks,
  getKpiMetrics,
  getPayrollEntries,
  getPayrollSummary,
  getAnalyticsExport,
  updateExecutionTask,
  commentExecutionTask,
  recordLabel,
  recordName,
  recordStatus,
  type InternalPage,
  type InternalRecord,
} from "@/lib/services/internalHrm";
import { IconCalendar, IconClock, IconDownload, IconPlus, IconRefresh } from "@/components/icons";
import { humanize } from "@/lib/labels";
import DatePicker from "@/components/DatePicker";
import InternalPagination from "@/components/internal/InternalPagination";
import InternalField from "@/components/internal/InternalField";

type Mode = "execution" | "time" | "kpi" | "payroll" | "analytics";
const EXECUTION_STATUSES = ["new", "accepted", "in_progress", "in_review", "done", "returned", "paused", "cancelled"] as const;
const KPI_SOURCES = ["execution", "attendance", "sales", "manual"] as const;
const PAYROLL_ENTRY_TYPES = ["salary", "kpi_bonus", "sales_bonus", "one_time_bonus", "penalty", "advance", "deduction", "adjustment"] as const;

function value(row: Dict, ...keys: string[]) {
  for (const key of keys) { const v = asStr(row[key]).trim(); if (v) return v; }
  return "—";
}

export default function InternalOperationsPages({ mode }: { mode: Mode }) {
  const t = useTranslations("internal.operations");
  const common = useTranslations("common");
  const [page, setPage] = useState<InternalPage<InternalRecord>>({ items: [], total: 0, offset: 0, limit: 25, hasMore: false });
  const [summary, setSummary] = useState<Dict>({});
  const [form, setForm] = useState({ title: "", description: "", due_at: "", priority: "normal", project: "", unit_id: "", name: "", target: "", actual: "", weight: "100", source: "manual", period: "", employee_id: "", entryType: "salary", amount: "", note: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState("");
  const [commentTaskId, setCommentTaskId] = useState("");
  const [comment, setComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({ q: "", status: "", responsibleEmployeeId: "", project: "", employeeId: "", dateFrom: "", dateTo: "", period: "" });

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setOffset(0);
  }

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try {
      if (mode === "execution") setPage(await getExecutionTasks({ q: filters.q || undefined, status: filters.status || undefined, responsible_employee_id: filters.responsibleEmployeeId || undefined, project: filters.project || undefined, date_from: filters.dateFrom || undefined, date_to: filters.dateTo || undefined, limit: 25, offset }, signal));
      else if (mode === "time") setPage(await getAttendanceDays({ employee_id: filters.employeeId || undefined, date_from: filters.dateFrom || undefined, date_to: filters.dateTo || undefined, limit: 25, offset }, signal));
      else if (mode === "kpi") setPage(await getKpiMetrics({ employee_id: filters.employeeId || undefined, period: filters.period || undefined, limit: 25, offset }, signal));
      else if (mode === "payroll") { const [rows, totals] = await Promise.all([getPayrollEntries({ employee_id: filters.employeeId || undefined, period: filters.period || undefined, limit: 25, offset }, signal), getPayrollSummary({ period: filters.period || undefined }, signal)]); setPage(rows); setSummary(asDict(totals)); }
      else setSummary(asDict(await getAnalyticsDashboard({ date_from: filters.dateFrom || undefined, date_to: filters.dateTo || undefined }, signal)));
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [filters, mode, offset]);

  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) void load(); }), [load]);
  useEffect(() => {
    if (!commentTaskId) return;
    return subscribeInternalEvents(`task:${commentTaskId}`, (event) => {
      if (event.event.startsWith("internal.")) void load();
    });
  }, [commentTaskId, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return; setSaving(true); setError(false);
    try {
      if (mode === "execution") await createExecutionTask({ title: form.title.trim(), description: form.description.trim(), project: form.project.trim() || "internal", responsible_employee_id: form.employee_id.trim() || null, org_unit_id: form.unit_id.trim() || null, priority: form.priority, deadline_at: form.due_at ? `${form.due_at}T18:00:00+05:00` : null, checklist: [], participants: [], attachments: [], meta: {} });
      if (mode === "kpi") await createKpiMetric({ employee_id: form.employee_id.trim(), period: form.period.trim(), metric_code: form.name.trim().toLowerCase().replace(/\s+/g, "_"), title: form.name.trim(), target_value: Number(form.target) || 0, actual_value: Number(form.actual) || 0, score: 0, weight: Number(form.weight) || 100, source: form.source, status: "active", meta: {} });
      if (mode === "payroll") await createPayrollEntry({ employee_id: form.employee_id.trim(), period: form.period.trim(), entry_type: form.entryType, title: form.note.trim() || form.entryType, amount: Number(form.amount) || 0, currency: "UZS", status: "draft", paid_at: null, meta: {} });
      setForm({ title: "", description: "", due_at: "", priority: "normal", project: "", unit_id: "", name: "", target: "", actual: "", weight: "100", source: "manual", period: "", employee_id: "", entryType: "salary", amount: "", note: "" }); await load();
    } catch { setError(true); } finally { setSaving(false); }
  }

  async function attendanceEvent(eventType: "check_in" | "check_out" | "break_start" | "break_end") {
    if (eventBusy) return; setEventBusy(true); setError(false);
    try { await createAttendanceEvent({ event_type: eventType }); await load(); } catch { setError(true); } finally { setEventBusy(false); }
  }

  async function setTaskStatus(id: string, status: string) {
    if (!id || statusBusy) return;
    setStatusBusy(id); setError(false);
    try { await updateExecutionTask(id, { status }); await load(); } catch { setError(true); } finally { setStatusBusy(""); }
  }

  async function saveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentTaskId || !comment.trim() || commentSaving) return;
    setCommentSaving(true); setError(false);
    try { await commentExecutionTask(commentTaskId, { body: comment.trim().slice(0, 2000) }); setComment(""); setCommentTaskId(""); await load(); } catch { setError(true); } finally { setCommentSaving(false); }
  }

  async function exportAnalytics() {
    try { const blob = await getAnalyticsExport({ date_from: filters.dateFrom || undefined, date_to: filters.dateTo || undefined }); saveBlob(blob, "lexgo-internal-analytics.xlsx"); } catch { setError(true); }
  }

  return <section className="internal-page">
    <div className="internal-section-head"><div><span className="internal-kicker">{t("kicker")}</span><h2>{t(`titles.${mode}`)}</h2><p>{t(`subtitles.${mode}`)}</p></div><div className="internal-action-row"><button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button>{mode === "analytics" && <button className="btn btn--pri btn--sm" type="button" onClick={() => void exportAnalytics()}><IconDownload />{t("export")}</button>}</div></div>
    {error && <div className="internal-notice internal-notice--error" role="alert">{t("error")}</div>}
    {mode === "execution" && <div className="internal-toolbar internal-toolbar--filters"><InternalField label={t("filters.search")}><div className="internal-search"><input value={filters.q} onChange={(event) => setFilter("q", event.target.value)} placeholder={t("filters.search")} maxLength={120} /></div></InternalField><InternalField label={t("filters.project")}><input value={filters.project} onChange={(event) => setFilter("project", event.target.value)} placeholder={t("filters.project")} maxLength={80} /></InternalField><InternalField label={t("filters.employeeId")}><input value={filters.responsibleEmployeeId} onChange={(event) => setFilter("responsibleEmployeeId", event.target.value)} placeholder={t("filters.employeeId")} maxLength={80} /></InternalField><InternalField label={t("filters.status")}><select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}><option value="">{t("filters.allStatuses")}</option>{EXECUTION_STATUSES.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}</select></InternalField><InternalField label={t("filters.dateFrom")}><DatePicker value={filters.dateFrom} onChange={(value) => setFilter("dateFrom", value)} placeholder={t("filters.dateFrom")} ariaLabel={t("filters.dateFrom")} max={filters.dateTo || undefined} clearLabel={common("clear")} /></InternalField><InternalField label={t("filters.dateTo")}><DatePicker value={filters.dateTo} onChange={(value) => setFilter("dateTo", value)} placeholder={t("filters.dateTo")} ariaLabel={t("filters.dateTo")} min={filters.dateFrom || undefined} clearLabel={common("clear")} /></InternalField></div>}
    {mode === "time" && <><div className="internal-toolbar internal-toolbar--filters"><InternalField label={t("filters.employeeId")}><input value={filters.employeeId} onChange={(event) => setFilter("employeeId", event.target.value)} placeholder={t("filters.employeeId")} maxLength={80} /></InternalField><InternalField label={t("filters.dateFrom")}><DatePicker value={filters.dateFrom} onChange={(value) => setFilter("dateFrom", value)} placeholder={t("filters.dateFrom")} ariaLabel={t("filters.dateFrom")} max={filters.dateTo || undefined} clearLabel={common("clear")} /></InternalField><InternalField label={t("filters.dateTo")}><DatePicker value={filters.dateTo} onChange={(value) => setFilter("dateTo", value)} placeholder={t("filters.dateTo")} ariaLabel={t("filters.dateTo")} min={filters.dateFrom || undefined} clearLabel={common("clear")} /></InternalField></div><div className="internal-panel internal-time-actions"><div><IconCalendar /><b>{t("attendanceActions")}</b><small>{t("attendanceHint")}</small></div><div className="internal-action-row"><button className="btn btn--pri btn--sm" type="button" onClick={() => void attendanceEvent("check_in")} disabled={eventBusy}><IconClock />{t("checkIn")}</button><button className="btn btn--line btn--sm" type="button" onClick={() => void attendanceEvent("check_out")} disabled={eventBusy}><IconClock />{t("checkOut")}</button><button className="btn btn--line btn--sm" type="button" onClick={() => void attendanceEvent("break_start")} disabled={eventBusy}><IconClock />{t("breakStart")}</button><button className="btn btn--line btn--sm" type="button" onClick={() => void attendanceEvent("break_end")} disabled={eventBusy}><IconClock />{t("breakEnd")}</button></div></div></>}
    {(mode === "kpi" || mode === "payroll") && <div className="internal-toolbar internal-toolbar--filters"><InternalField label={t("filters.employeeId")}><input value={filters.employeeId} onChange={(event) => setFilter("employeeId", event.target.value)} placeholder={t("filters.employeeId")} maxLength={80} /></InternalField><InternalField label={t("filters.period")}><input value={filters.period} onChange={(event) => setFilter("period", event.target.value)} placeholder={t("filters.period")} maxLength={30} /></InternalField></div>}
    {mode === "analytics" && <div className="internal-toolbar internal-toolbar--filters"><InternalField label={t("filters.dateFrom")}><DatePicker value={filters.dateFrom} onChange={(value) => setFilter("dateFrom", value)} placeholder={t("filters.dateFrom")} ariaLabel={t("filters.dateFrom")} max={filters.dateTo || undefined} clearLabel={common("clear")} /></InternalField><InternalField label={t("filters.dateTo")}><DatePicker value={filters.dateTo} onChange={(value) => setFilter("dateTo", value)} placeholder={t("filters.dateTo")} ariaLabel={t("filters.dateTo")} min={filters.dateFrom || undefined} clearLabel={common("clear")} /></InternalField></div>}
    {mode === "analytics" ? <div className="internal-metric-grid">{Object.entries(summary).filter(([key]) => !["items", "series", "data"].includes(key)).slice(0, 8).map(([key, raw]) => <div className="internal-panel internal-metric" key={key}><span>{humanize(key)}</span><b>{typeof raw === "object" ? asArr(raw).length : asStr(raw, "—")}</b></div>)}{!Object.keys(summary).length && !loading && <div className="internal-panel internal-empty">{t("emptyAnalytics")}</div>}</div> : <div className="internal-panel">{loading ? <div className="internal-loading" aria-busy="true" /> : <OperationsTable mode={mode} rows={page.items} empty={t(`empty.${mode}`)} onStatus={mode === "execution" ? setTaskStatus : undefined} statusBusy={statusBusy} onComment={mode === "execution" ? setCommentTaskId : undefined} />}<InternalPagination page={page} onChange={setOffset} /></div>}
    {mode === "execution" && commentTaskId && <form className="internal-panel internal-comment-form" onSubmit={saveComment}><div className="internal-panel__head"><h3>{t("commentTitle")}</h3><button className="btn btn--line btn--sm" type="button" onClick={() => setCommentTaskId("")}>{t("cancel")}</button></div><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("commentPlaceholder")} aria-label={t("commentPlaceholder")} maxLength={2000} rows={3} required /><button className="btn btn--pri btn--sm" type="submit" disabled={commentSaving}>{commentSaving ? t("saving") : t("sendComment")}</button></form>}
    {mode !== "time" && mode !== "analytics" && <OperationsForm mode={mode} form={form} setForm={setForm} submit={submit} saving={saving} t={t} clearLabel={common("clear")} />}
  </section>;
}

function OperationsTable({ mode, rows, empty, onStatus, statusBusy, onComment }: { mode: Exclude<Mode, "analytics">; rows: InternalRecord[]; empty: string; onStatus?: (id: string, status: string) => void; statusBusy: string; onComment?: (id: string) => void }) {
  const t = useTranslations("internal.operations");
  if (!rows.length) return <p className="internal-empty">{empty}</p>;
  return <div className="internal-table-wrap"><table className="internal-table"><thead><tr>{mode === "execution" ? <><th>{t("columns.task")}</th><th>{t("columns.assignee")}</th><th>{t("columns.status")}</th><th>{t("columns.due")}</th><th>{t("columns.actions")}</th></> : mode === "time" ? <><th>{t("columns.date")}</th><th>{t("columns.employee")}</th><th>{t("columns.status")}</th><th>{t("columns.hours")}</th></> : mode === "kpi" ? <><th>{t("columns.metric")}</th><th>{t("columns.employee")}</th><th>{t("columns.value")}</th><th>{t("columns.period")}</th></> : <><th>{t("columns.employee")}</th><th>{t("columns.period")}</th><th>{t("columns.amount")}</th><th>{t("columns.status")}</th></>}</tr></thead><tbody>{rows.map((row, index) => <tr key={asStr(row.id, `${recordLabel(row)}-${index}`)}>
    {mode === "execution" && <><td><b>{recordName(row)}</b><small>{value(row, "description")}</small></td><td>{value(row, "assignee_name", "employee_code")}</td><td><select className="internal-status-select" value={recordStatus(row)} onChange={(event) => onStatus?.(asStr(row.id), event.target.value)} disabled={!onStatus || statusBusy === asStr(row.id)} aria-label={t("columns.status")}>{EXECUTION_STATUSES.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}</select></td><td>{value(row, "due_at", "due_date")}</td><td><button className="btn btn--line btn--sm" type="button" onClick={() => onComment?.(asStr(row.id))} disabled={!onComment}>{t("comment")}</button></td></>}
    {mode === "time" && <><td>{value(row, "date", "day")}</td><td>{value(row, "employee_name", "employee_code")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td><td>{value(row, "hours", "worked_hours")}</td></>}
    {mode === "kpi" && <><td><b>{recordName(row)}</b></td><td>{value(row, "employee_name", "employee_code")}</td><td>{value(row, "value", "score", "target")}</td><td>{value(row, "period")}</td></>}
    {mode === "payroll" && <><td>{value(row, "employee_name", "employee_code")}</td><td>{value(row, "period")}</td><td>{value(row, "amount", "total")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td></>}
  </tr>)}</tbody></table></div>;
}

type OpsForm = { title: string; description: string; due_at: string; priority: string; project: string; unit_id: string; name: string; target: string; actual: string; weight: string; source: string; period: string; employee_id: string; entryType: string; amount: string; note: string };
type FormProps = { mode: "execution" | "kpi" | "payroll"; form: OpsForm; setForm: Dispatch<SetStateAction<OpsForm>>; submit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; t: ReturnType<typeof useTranslations>; clearLabel: string };
function OperationsForm({ mode, form, setForm, submit, saving, t, clearLabel }: FormProps) {
  const set = (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return <form className="internal-panel internal-form" onSubmit={submit}><div className="internal-panel__head"><h3>{t(`new.${mode}`)}</h3><IconPlus /></div><div className="internal-form-grid">
    {mode === "execution" && <>
      <InternalField label={t("title")}><input value={form.title} onChange={set("title")} placeholder={t("title")} maxLength={160} required /></InternalField>
      <InternalField label={t("description")}><input value={form.description} onChange={set("description")} placeholder={t("description")} maxLength={1000} /></InternalField>
      <InternalField label={t("project")}><input value={form.project} onChange={set("project")} placeholder={t("project")} maxLength={80} /></InternalField>
      <InternalField label={t("employeeId")}><input value={form.employee_id} onChange={set("employee_id")} placeholder={t("employeeId")} maxLength={80} /></InternalField>
      <InternalField label={t("unitId")}><input value={form.unit_id} onChange={set("unit_id")} placeholder={t("unitId")} maxLength={80} /></InternalField>
      <InternalField label={t("due")}><DatePicker value={form.due_at} onChange={(value) => setForm((current) => ({ ...current, due_at: value }))} placeholder={t("due")} ariaLabel={t("due")} clearLabel={clearLabel} /></InternalField>
      <InternalField label={t("priority")}><select value={form.priority} onChange={set("priority")}><option value="low">{t("low")}</option><option value="normal">{t("normal")}</option><option value="high">{t("high")}</option></select></InternalField>
    </>}
    {mode === "kpi" && <>
      <InternalField label={t("metricName")}><input value={form.name} onChange={set("name")} placeholder={t("metricName")} maxLength={120} required /></InternalField>
      <InternalField label={t("target")}><input value={form.target} onChange={set("target")} placeholder={t("target")} inputMode="decimal" maxLength={40} /></InternalField>
      <InternalField label={t("actual")}><input value={form.actual} onChange={set("actual")} placeholder={t("actual")} inputMode="decimal" maxLength={40} /></InternalField>
      <InternalField label={t("weight")}><input value={form.weight} onChange={set("weight")} placeholder={t("weight")} inputMode="decimal" maxLength={40} /></InternalField>
      <InternalField label={t("source")}><select value={form.source} onChange={set("source")}>{KPI_SOURCES.map((source) => <option value={source} key={source}>{t(`sources.${source}`)}</option>)}</select></InternalField>
      <InternalField label={t("period")}><input value={form.period} onChange={set("period")} placeholder={t("period")} maxLength={30} /></InternalField>
      <InternalField label={t("employeeId")}><input value={form.employee_id} onChange={set("employee_id")} placeholder={t("employeeId")} maxLength={80} /></InternalField>
    </>}
    {mode === "payroll" && <>
      <InternalField label={t("employeeId")}><input value={form.employee_id} onChange={set("employee_id")} placeholder={t("employeeId")} maxLength={80} required /></InternalField>
      <InternalField label={t("period")}><input value={form.period} onChange={set("period")} placeholder={t("period")} maxLength={30} required /></InternalField>
      <InternalField label={t("entryType")}><select value={form.entryType} onChange={set("entryType")}>{PAYROLL_ENTRY_TYPES.map((entryType) => <option value={entryType} key={entryType}>{t(`entryTypes.${entryType}`)}</option>)}</select></InternalField>
      <InternalField label={t("amount")}><input value={form.amount} onChange={set("amount")} placeholder={t("amount")} inputMode="decimal" maxLength={30} required /></InternalField>
      <InternalField label={t("note")}><input value={form.note} onChange={set("note")} placeholder={t("note")} maxLength={300} /></InternalField>
    </>}
  </div><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconPlus />{saving ? t("saving") : t("create")}</button></form>;
}
