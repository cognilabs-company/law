"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError, asStr, type Dict } from "@/lib/http";
import { createSchedule, getSchedules, recordName, recordStatus, type InternalPage, type InternalRecord } from "@/lib/services/internalHrm";
import { IconCalendar, IconPlus, IconRefresh } from "@/components/icons";
import InternalPagination from "@/components/internal/InternalPagination";

function field(row: Dict, ...keys: string[]): string {
  for (const key of keys) {
    const value = asStr(row[key]).trim();
    if (value) return value;
  }
  return "—";
}

export default function InternalSchedulesPage() {
  const t = useTranslations("internal.schedules");
  const [page, setPage] = useState<InternalPage<InternalRecord>>({ items: [], total: 0, offset: 0, limit: 25, hasMore: false });
  const [form, setForm] = useState({ title: "", employee_id: "", org_unit_id: "", start: "09:00", end: "18:00" });
  const [filters, setFilters] = useState({ employeeId: "", orgUnitId: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      setPage(await getSchedules({ employee_id: filters.employeeId || undefined, org_unit_id: filters.orgUnitId || undefined, limit: 25, offset }, signal));
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) void load(); }), [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    setError(false);
    try {
      await createSchedule({
        title: form.title.trim(),
        employee_id: form.employee_id.trim() || null,
        org_unit_id: form.org_unit_id.trim() || null,
        schedule_type: "weekly",
        timezone: "Asia/Tashkent",
        weekly: [{ day: 1, start: form.start, end: form.end, enabled: true }],
        status: "active",
      });
      setForm({ title: "", employee_id: "", org_unit_id: "", start: "09:00", end: "18:00" });
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return <section className="internal-page">
    <div className="internal-section-head"><div><span className="internal-kicker">{t("kicker")}</span><h2>{t("title")}</h2><p>{t("lead")}</p></div><button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button></div>
    {error ? <div className="internal-notice internal-notice--error" role="alert">{t("error")}</div> : null}
    <div className="internal-panel"><div className="internal-panel__head"><h3>{t("list")}</h3><IconCalendar /></div><div className="internal-toolbar internal-toolbar--filters"><input value={filters.employeeId} onChange={(event) => { setFilters((current) => ({ ...current, employeeId: event.target.value })); setOffset(0); }} placeholder={t("employeeId")} aria-label={t("employeeId")} maxLength={80} /><input value={filters.orgUnitId} onChange={(event) => { setFilters((current) => ({ ...current, orgUnitId: event.target.value })); setOffset(0); }} placeholder={t("unitId")} aria-label={t("unitId")} maxLength={80} /></div>{loading ? <div className="internal-loading" aria-busy="true" /> : page.items.length ? <div className="internal-table-wrap"><table className="internal-table"><thead><tr><th>{t("columns.name")}</th><th>{t("columns.scope")}</th><th>{t("columns.time")}</th><th>{t("columns.status")}</th></tr></thead><tbody>{page.items.map((row, index) => <tr key={String(row.id ?? index)}><td><b>{recordName(row)}</b><small>{field(row, "schedule_type", "timezone")}</small></td><td>{field(row, "employee_name", "employee_id", "org_unit_name", "org_unit_id")}</td><td>{field(row, "start", "start_time")} – {field(row, "end", "end_time")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td></tr>)}</tbody></table></div> : <p className="internal-empty">{t("empty")}</p>}<InternalPagination page={page} onChange={setOffset} /></div>
    <form className="internal-panel internal-form" onSubmit={submit}><div className="internal-panel__head"><h3>{t("new")}</h3><IconPlus /></div><div className="internal-form-grid"><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={t("name")} aria-label={t("name")} maxLength={160} required /><input value={form.employee_id} onChange={(event) => setForm((current) => ({ ...current, employee_id: event.target.value }))} placeholder={t("employeeId")} aria-label={t("employeeId")} maxLength={80} /><input value={form.org_unit_id} onChange={(event) => setForm((current) => ({ ...current, org_unit_id: event.target.value }))} placeholder={t("unitId")} aria-label={t("unitId")} maxLength={80} /><label>{t("start")}<input type="time" value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} /></label><label>{t("end")}<input type="time" value={form.end} onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))} /></label></div><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconPlus />{saving ? t("saving") : t("create")}</button></form>
  </section>;
}
