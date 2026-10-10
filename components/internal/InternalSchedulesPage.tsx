"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError } from "@/lib/http";
import { createSchedule, getSchedules, normSchedule, type HrmSchedule, type InternalPage } from "@/lib/services/internalHrm";
import { IconBuilding, IconCalendar, IconPlus, IconRefresh, IconUser, IconUsers } from "@/components/icons";
import FilterBar from "@/components/filters/FilterBar";
import Select from "@/components/Select";
import TimePicker from "@/components/TimePicker";
import InternalPagination from "@/components/internal/InternalPagination";
import InternalField from "@/components/internal/InternalField";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { EntitySelect, HrmDrawer, HrmEmpty, HrmError, HrmHead, HrmLoading, HrmPanel, HrmStatus, useHrmFormat } from "@/components/internal/HrmUi";

type WeeklyDay = { day: number; enabled: boolean; start: string; end: string };
const defaultWeekly = (): WeeklyDay[] => Array.from({ length: 7 }, (_, i) => ({ day: i + 1, enabled: i < 5, start: "09:00", end: "18:00" }));
const EMPTY_PAGE = { items: [], total: 0, offset: 0, limit: 25, hasMore: false };

export default function InternalSchedulesPage() {
  const t = useTranslations("internal.schedules");
  const tu = useTranslations("internal.ui");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [page, setPage] = useState<InternalPage<HrmSchedule>>(EMPTY_PAGE);
  const [filters, setFilters] = useState({ employeeId: "", orgUnitId: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const res = await getSchedules({ employee_id: filters.employeeId || undefined, org_unit_id: filters.orgUnitId || undefined, limit: 50, offset }, signal);
      setPage({ ...res, items: res.items.map(normSchedule) });
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filters, offset]);
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => load(c.signal));
    return () => c.abort();
  }, [load]);
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) void load(); }), [load]);

  // "09:00 – 18:00" when every working day shares the hours; otherwise the
  // earliest start and latest end, so a split week still reads at a glance.
  const hours = (s: HrmSchedule) => {
    if (!s.days.length) return "—";
    const starts = [...new Set(s.days.map((d) => d.start))];
    const ends = [...new Set(s.days.map((d) => d.end))];
    return starts.length === 1 && ends.length === 1 ? `${starts[0]} – ${ends[0]}` : `${starts.sort()[0]} – ${ends.sort().at(-1)}`;
  };

  return (
    <section className="hrm-page">
      <HrmHead
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        actions={
          <>
            <button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("new")}</button>
          </>
        }
      />
      <FilterBar
        fields={[
          { key: "emp", label: t("employeeId"), icon: IconUser, value: filters.employeeId, onChange: (v) => { setFilters((c) => ({ ...c, employeeId: v })); setOffset(0); }, options: [{ value: "", label: tu("all") }, ...dir.employees.map((e) => ({ value: e.id, label: e.name || e.code }))], empty: "", hidden: !dir.employees.length },
          { key: "unit", label: t("unitId"), icon: IconBuilding, value: filters.orgUnitId, onChange: (v) => { setFilters((c) => ({ ...c, orgUnitId: v })); setOffset(0); }, options: [{ value: "", label: tu("all") }, ...dir.units.map((u) => ({ value: u.id, label: u.name }))], empty: "", hidden: !dir.units.length },
        ]}
        count={page.total}
        onReset={() => { setFilters({ employeeId: "", orgUnitId: "" }); setOffset(0); }}
      />
      {error ? <HrmError text={t("error")} onRetry={() => void load()} retryLabel={t("refresh")} /> : null}
      <HrmPanel flush>
        {loading ? <div style={{ padding: 16 }}><HrmLoading rows={5} /></div> : page.items.length ? (
          <div className="hrm-table-wrap">
            <table className="hrm-table">
              <thead><tr><th>{t("columns.name")}</th><th>{t("columns.scope")}</th><th>{t("columns.days")}</th><th>{t("columns.time")}</th><th>{t("columns.break")}</th><th>{t("columns.status")}</th></tr></thead>
              <tbody>
                {page.items.map((s) => {
                  const on = new Set(s.days.map((d) => d.day));
                  const brk = s.days.find((d) => d.breakMinutes)?.breakMinutes ?? 0;
                  const scope = s.employeeId
                    ? { icon: <IconUser />, label: dir.employeeName(s.employeeId) || t("scopeEmployee") }
                    : s.unitId
                      ? { icon: <IconBuilding />, label: dir.unitName(s.unitId) || t("scopeUnit") }
                      : { icon: <IconUsers />, label: t("scopeAll") };
                  return (
                    <tr key={s.id}>
                      <td><b>{s.title || "—"}</b><small>{s.timezone}</small></td>
                      <td><span className="hrm-scope">{scope.icon}{scope.label}</span></td>
                      <td><span className="hrm-week">{[1, 2, 3, 4, 5, 6, 7].map((d) => <span key={d} className={on.has(d) ? "on" : undefined}>{f.weekday(d)}</span>)}</span></td>
                      <td><b className="hrm-num">{hours(s)}</b></td>
                      <td className="hrm-muted">{brk ? f.minutes(brk) : "—"}</td>
                      <td><HrmStatus value={s.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <HrmEmpty icon={IconCalendar} title={t("empty")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("new")}</button>} />}
        <InternalPagination page={page} onChange={setOffset} />
      </HrmPanel>
      <ScheduleCreate open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />
    </section>
  );
}

function ScheduleCreate({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("internal.schedules");
  const tu = useTranslations("internal.ui");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [form, setForm] = useState({ title: "", scope: "unit", target: "", weekly: defaultWeekly() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const setDay = (i: number, patch: Partial<WeeklyDay>) => setForm((c) => ({ ...c, weekly: c.weekly.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !form.title.trim() || !form.weekly.some((d) => d.enabled)) return;
    setBusy(true);
    setError(false);
    try {
      // The body the 10-08 guide documents: numbered days, only working ones.
      await createSchedule({
        title: form.title.trim(),
        employee_id: form.scope === "employee" ? form.target || null : null,
        org_unit_id: form.scope === "unit" ? form.target || null : null,
        schedule_type: "weekly",
        timezone: "Asia/Tashkent",
        weekly: form.weekly.filter((d) => d.enabled),
        status: "active",
      });
      setForm({ title: "", scope: "unit", target: "", weekly: defaultWeekly() });
      onCreated();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer open={open} onClose={onClose} title={t("new")} sub={t("newLead")}>
      <form className="hrm-form" onSubmit={submit}>
        {error ? <HrmError text={t("error")} /> : null}
        <InternalField label={t("name")}><input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} maxLength={160} required placeholder={t("namePh")} /></InternalField>
        <div className="hrm-form__grid">
          <InternalField label={t("scope")}>
            <Select value={form.scope} onChange={(v) => setForm((c) => ({ ...c, scope: v, target: "" }))} options={[{ value: "unit", label: t("scopeUnit") }, { value: "employee", label: t("scopeEmployee") }]} ariaLabel={t("scope")} />
          </InternalField>
          <InternalField label={form.scope === "employee" ? t("employeeId") : t("unitId")}>
            <EntitySelect value={form.target} onChange={(v) => setForm((c) => ({ ...c, target: v }))} options={form.scope === "employee" ? dir.employeeOptions : dir.unitOptions} placeholder={form.scope === "employee" ? tu("choose.employee") : tu("choose.unit")} ariaLabel={form.scope === "employee" ? t("employeeId") : t("unitId")} />
          </InternalField>
        </div>
        <span className="ldrw__lbl">{t("weeklyLabel")}</span>
        <div className="hrm-days hrm-days--drawer">
          {form.weekly.map((d, i) => (
            <div className={`hrm-day${d.enabled ? " on" : ""}`} key={d.day}>
              <label className="hrm-day__t"><input type="checkbox" checked={d.enabled} onChange={(e) => setDay(i, { enabled: e.target.checked })} />{f.weekday(d.day)}</label>
              <div className="hrm-day__r">
                <TimePicker value={d.start} onChange={(v) => setDay(i, { start: v })} placeholder={t("start")} ariaLabel={`${f.weekday(d.day)} ${t("start")}`} disabled={!d.enabled} />
                <TimePicker value={d.end} onChange={(v) => setDay(i, { end: v })} placeholder={t("end")} ariaLabel={`${f.weekday(d.day)} ${t("end")}`} disabled={!d.enabled} />
              </div>
            </div>
          ))}
        </div>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !form.weekly.some((d) => d.enabled)}><IconPlus />{busy ? t("saving") : t("create")}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}
