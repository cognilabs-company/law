"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { ApiError, asArr, asDict, asStr, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
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

type Mode = "execution" | "time" | "kpi" | "payroll" | "analytics";

function value(row: Dict, ...keys: string[]) {
  for (const key of keys) { const v = asStr(row[key]).trim(); if (v) return v; }
  return "—";
}

export default function InternalOperationsPages({ mode }: { mode: Mode }) {
  const t = useTranslations("internal.operations");
  const [page, setPage] = useState<InternalPage<InternalRecord>>({ items: [], total: 0, offset: 0, limit: 25, hasMore: false });
  const [summary, setSummary] = useState<Dict>({});
  const [form, setForm] = useState({ title: "", description: "", due_at: "", priority: "normal", name: "", target: "", period: "", employee_id: "", amount: "", note: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState("");
  const [commentTaskId, setCommentTaskId] = useState("");
  const [comment, setComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try {
      if (mode === "execution") setPage(await getExecutionTasks({ limit: 25, offset: 0 }, signal));
      else if (mode === "time") setPage(await getAttendanceDays({ limit: 25, offset: 0 }, signal));
      else if (mode === "kpi") setPage(await getKpiMetrics({ limit: 25, offset: 0 }, signal));
      else if (mode === "payroll") { const [rows, totals] = await Promise.all([getPayrollEntries({ limit: 25, offset: 0 }, signal), getPayrollSummary({}, signal)]); setPage(rows); setSummary(asDict(totals)); }
      else setSummary(asDict(await getAnalyticsDashboard({}, signal)));
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [mode]);

  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return; setSaving(true); setError(false);
    try {
      if (mode === "execution") await createExecutionTask({ title: form.title, description: form.description, due_at: form.due_at, priority: form.priority });
      if (mode === "kpi") await createKpiMetric({ name: form.name, target: form.target, period: form.period, employee_id: form.employee_id });
      if (mode === "payroll") await createPayrollEntry({ employee_id: form.employee_id, period: form.period, amount: form.amount, note: form.note });
      setForm({ title: "", description: "", due_at: "", priority: "normal", name: "", target: "", period: "", employee_id: "", amount: "", note: "" }); await load();
    } catch { setError(true); } finally { setSaving(false); }
  }

  async function attendanceEvent(eventType: "check_in" | "check_out") {
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
    try { const blob = await getAnalyticsExport({}); saveBlob(blob, "lexgo-internal-analytics.xlsx"); } catch { setError(true); }
  }

  return <section className="internal-page">
    <div className="internal-section-head"><div><span className="internal-kicker">{t("kicker")}</span><h2>{t(`titles.${mode}`)}</h2><p>{t(`subtitles.${mode}`)}</p></div><div className="internal-action-row"><button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button>{mode === "analytics" && <button className="btn btn--pri btn--sm" type="button" onClick={() => void exportAnalytics()}><IconDownload />{t("export")}</button>}</div></div>
    {error && <div className="internal-notice internal-notice--error" role="alert">{t("error")}</div>}
    {mode === "time" && <div className="internal-panel internal-time-actions"><div><IconCalendar /><b>{t("attendanceActions")}</b><small>{t("attendanceHint")}</small></div><div className="internal-action-row"><button className="btn btn--pri btn--sm" type="button" onClick={() => void attendanceEvent("check_in")} disabled={eventBusy}><IconClock />{t("checkIn")}</button><button className="btn btn--line btn--sm" type="button" onClick={() => void attendanceEvent("check_out")} disabled={eventBusy}><IconClock />{t("checkOut")}</button></div></div>}
    {mode === "analytics" ? <div className="internal-metric-grid">{Object.entries(summary).filter(([key]) => !["items", "series", "data"].includes(key)).slice(0, 8).map(([key, raw]) => <div className="internal-panel internal-metric" key={key}><span>{key.replaceAll("_", " ")}</span><b>{typeof raw === "object" ? asArr(raw).length : asStr(raw, "—")}</b></div>)}{!Object.keys(summary).length && !loading && <div className="internal-panel internal-empty">{t("emptyAnalytics")}</div>}</div> : <div className="internal-panel">{loading ? <div className="internal-loading" aria-busy="true" /> : <OperationsTable mode={mode} rows={page.items} empty={t(`empty.${mode}`)} onStatus={mode === "execution" ? setTaskStatus : undefined} statusBusy={statusBusy} onComment={mode === "execution" ? setCommentTaskId : undefined} />}</div>}
    {mode === "execution" && commentTaskId && <form className="internal-panel internal-comment-form" onSubmit={saveComment}><div className="internal-panel__head"><h3>{t("commentTitle")}</h3><button className="btn btn--line btn--sm" type="button" onClick={() => setCommentTaskId("")}>{t("cancel")}</button></div><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("commentPlaceholder")} aria-label={t("commentPlaceholder")} maxLength={2000} rows={3} required /><button className="btn btn--pri btn--sm" type="submit" disabled={commentSaving}>{commentSaving ? t("saving") : t("sendComment")}</button></form>}
    {mode !== "time" && mode !== "analytics" && <OperationsForm mode={mode} form={form} setForm={setForm} submit={submit} saving={saving} t={t} />}
  </section>;
}

function OperationsTable({ mode, rows, empty, onStatus, statusBusy, onComment }: { mode: Exclude<Mode, "analytics">; rows: InternalRecord[]; empty: string; onStatus?: (id: string, status: string) => void; statusBusy: string; onComment?: (id: string) => void }) {
  const t = useTranslations("internal.operations");
  if (!rows.length) return <p className="internal-empty">{empty}</p>;
  return <div className="internal-table-wrap"><table className="internal-table"><thead><tr>{mode === "execution" ? <><th>{t("columns.task")}</th><th>{t("columns.assignee")}</th><th>{t("columns.status")}</th><th>{t("columns.due")}</th><th>{t("columns.actions")}</th></> : mode === "time" ? <><th>{t("columns.date")}</th><th>{t("columns.employee")}</th><th>{t("columns.status")}</th><th>{t("columns.hours")}</th></> : mode === "kpi" ? <><th>{t("columns.metric")}</th><th>{t("columns.employee")}</th><th>{t("columns.value")}</th><th>{t("columns.period")}</th></> : <><th>{t("columns.employee")}</th><th>{t("columns.period")}</th><th>{t("columns.amount")}</th><th>{t("columns.status")}</th></>}</tr></thead><tbody>{rows.map((row, index) => <tr key={asStr(row.id, `${recordLabel(row)}-${index}`)}>
    {mode === "execution" && <><td><b>{recordName(row)}</b><small>{value(row, "description")}</small></td><td>{value(row, "assignee_name", "employee_code")}</td><td><select className="internal-status-select" value={recordStatus(row)} onChange={(event) => onStatus?.(asStr(row.id), event.target.value)} disabled={!onStatus || statusBusy === asStr(row.id)} aria-label={t("columns.status")}><option value="todo">{t("status.todo")}</option><option value="in_progress">{t("status.in_progress")}</option><option value="blocked">{t("status.blocked")}</option><option value="done">{t("status.done")}</option></select></td><td>{value(row, "due_at", "due_date")}</td><td><button className="btn btn--line btn--sm" type="button" onClick={() => onComment?.(asStr(row.id))} disabled={!onComment}>{t("comment")}</button></td></>}
    {mode === "time" && <><td>{value(row, "date", "day")}</td><td>{value(row, "employee_name", "employee_code")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td><td>{value(row, "hours", "worked_hours")}</td></>}
    {mode === "kpi" && <><td><b>{recordName(row)}</b></td><td>{value(row, "employee_name", "employee_code")}</td><td>{value(row, "value", "score", "target")}</td><td>{value(row, "period")}</td></>}
    {mode === "payroll" && <><td>{value(row, "employee_name", "employee_code")}</td><td>{value(row, "period")}</td><td>{value(row, "amount", "total")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td></>}
  </tr>)}</tbody></table></div>;
}

type OpsForm = { title: string; description: string; due_at: string; priority: string; name: string; target: string; period: string; employee_id: string; amount: string; note: string };
type FormProps = { mode: "execution" | "kpi" | "payroll"; form: OpsForm; setForm: Dispatch<SetStateAction<OpsForm>>; submit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; t: ReturnType<typeof useTranslations> };
function OperationsForm({ mode, form, setForm, submit, saving, t }: FormProps) {
  const set = (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return <form className="internal-panel internal-form" onSubmit={submit}><div className="internal-panel__head"><h3>{t(`new.${mode}`)}</h3><IconPlus /></div><div className="internal-form-grid">
    {mode === "execution" && <><input value={form.title} onChange={set("title")} placeholder={t("title")} aria-label={t("title")} maxLength={160} required /><input value={form.description} onChange={set("description")} placeholder={t("description")} aria-label={t("description")} maxLength={1000} /><input value={form.due_at} onChange={set("due_at")} type="date" aria-label={t("due")} /><select value={form.priority} onChange={set("priority")} aria-label={t("priority")}><option value="low">{t("low")}</option><option value="normal">{t("normal")}</option><option value="high">{t("high")}</option></select></>}
    {mode === "kpi" && <><input value={form.name} onChange={set("name")} placeholder={t("metricName")} aria-label={t("metricName")} maxLength={120} required /><input value={form.target} onChange={set("target")} placeholder={t("target")} aria-label={t("target")} maxLength={40} /><input value={form.period} onChange={set("period")} placeholder={t("period")} aria-label={t("period")} maxLength={30} /><input value={form.employee_id} onChange={set("employee_id")} placeholder={t("employeeId")} aria-label={t("employeeId")} maxLength={80} /></>}
    {mode === "payroll" && <><input value={form.employee_id} onChange={set("employee_id")} placeholder={t("employeeId")} aria-label={t("employeeId")} maxLength={80} required /><input value={form.period} onChange={set("period")} placeholder={t("period")} aria-label={t("period")} maxLength={30} required /><input value={form.amount} onChange={set("amount")} placeholder={t("amount")} aria-label={t("amount")} inputMode="decimal" maxLength={30} required /><input value={form.note} onChange={set("note")} placeholder={t("note")} aria-label={t("note")} maxLength={300} /></>}
  </div><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconPlus />{saving ? t("saving") : t("create")}</button></form>;
}
