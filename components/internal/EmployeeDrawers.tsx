"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ApiError, asArr, asDict, asStr } from "@/lib/http";
import { getStudioReference } from "@/lib/services/studio";
import {
  assignEmployee,
  createEmployee,
  getEmployee360,
  normAttendance,
  normKpi,
  normPayroll,
  normTask,
  updateEmployee,
  type HrmEmployee,
} from "@/lib/services/internalHrm";
import { IconChartBar, IconCheck, IconEdit, IconMail, IconMapPin, IconPhone, IconPlus } from "@/components/icons";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import InternalField from "@/components/internal/InternalField";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { EntitySelect, HrmAvatar, HrmDrawer, HrmError, HrmKv, HrmLoading, HrmPriority, HrmSection, HrmStatus, useHrmFormat, useStatusLabel } from "@/components/internal/HrmUi";

// The employee drawers — 360 overview, edit, create — shared by the
// employee list and the org board, so a person opens the same way from both.

// display_name is "First Last" — how the backend and the 10-08 guide write it
// ("Ali Valiyev"); the patronymic, when given, goes last.
const fullName = (p: { first_name: string; last_name: string; middle_name: string }) =>
  [p.first_name, p.last_name, p.middle_name].map((x) => x.trim()).filter(Boolean).join(" ");

export const EMPLOYMENT_STATUSES = ["active", "on_leave", "inactive", "terminated"] as const;
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern"] as const;

// ── Employee 360 ───────────────────────────────────────────────────────────

type Detail = { tasks: ReturnType<typeof normTask>[]; attendance: ReturnType<typeof normAttendance>[]; kpis: ReturnType<typeof normKpi>[]; payroll: ReturnType<typeof normPayroll>[] };

export function Employee360({ employee, onClose, onSaved }: { employee: HrmEmployee | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("internal.people");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"overview" | "edit">("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prevId, setPrevId] = useState("");
  const id = employee?.id ?? "";
  if (id !== prevId) {
    setPrevId(id);
    setDetail(null);
    setTab("overview");
    setError(false);
  }

  useEffect(() => {
    if (!id) return;
    const c = new AbortController();
    void Promise.resolve().then(async () => {
      setLoading(true);
      try {
        const d = asDict(await getEmployee360(id, c.signal));
        setDetail({
          tasks: asArr(d.tasks).map(normTask),
          attendance: asArr(d.attendance).map(normAttendance),
          kpis: asArr(d.kpis).map(normKpi),
          payroll: asArr(d.payroll ?? d.payroll_entries).map(normPayroll),
        });
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    });
    return () => c.abort();
  }, [id]);

  if (!employee) return null;
  const e = employee;

  return (
    <HrmDrawer
      open
      onClose={onClose}
      title={e.name || e.code}
      sub={[e.code, dir.positionTitle(e.positionId)].filter(Boolean).join(" · ")}
      head={<HrmAvatar name={e.name || e.code} size="lg" />}
    >
      <div className="hrm-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}><IconChartBar />{t("tabOverview")}</button>
        <button type="button" role="tab" aria-selected={tab === "edit"} className={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")}><IconEdit />{t("tabEdit")}</button>
      </div>
      {error ? <HrmError text={t("error")} /> : null}
      {tab === "overview" ? (
        <>
          <div className="hrm-minis">
            <div className="hrm-mini"><b>{detail ? detail.tasks.length : "…"}</b><span>{t("tasksCount")}</span></div>
            <div className="hrm-mini"><b>{detail ? detail.attendance.length : "…"}</b><span>{t("attendanceCount")}</span></div>
            <div className="hrm-mini"><b>{detail ? detail.kpis.length : "…"}</b><span>{t("kpiCount")}</span></div>
            <div className="hrm-mini"><b>{detail ? detail.payroll.length : "…"}</b><span>{t("payrollCount")}</span></div>
          </div>
          <HrmSection label={t("assignment")}>
            <HrmKv
              rows={[
                { label: t("columns.position"), value: dir.positionTitle(e.positionId) || "—" },
                { label: t("columns.unit"), value: dir.unitName(e.unitId) || "—" },
                { label: t("columns.manager"), value: dir.employeeName(e.managerId) || "—" },
                { label: t("employmentType"), value: e.employmentType ? t(`types.${e.employmentType}`) : "—" },
                { label: t("salary"), value: f.money(e.salary) },
                { label: t("hireDate"), value: f.date(e.hireDate) },
                { label: t("columns.status"), value: <HrmStatus value={e.status} /> },
              ]}
            />
          </HrmSection>
          <HrmSection label={t("contacts")}>
            <div className="hrm-profile__contacts" style={{ marginTop: 0, paddingTop: 0, border: 0 }}>
              {e.phone ? <a href={`tel:${e.phone.replace(/[^+\d]/g, "")}`}><IconPhone />{e.phone}</a> : null}
              {e.email ? <a href={`mailto:${e.email}`}><IconMail />{e.email}</a> : null}
              {e.region ? <span><IconMapPin />{e.region}</span> : null}
              {!e.phone && !e.email && !e.region ? <span className="hrm-muted">—</span> : null}
            </div>
          </HrmSection>
          {loading && !detail ? <HrmLoading rows={3} /> : detail ? (
            <>
              <HrmSection label={t("recentTasks")} aside={<span className="hrm-count">{detail.tasks.length}</span>}>
                {detail.tasks.length ? (
                  <ul className="hrm-list">
                    {detail.tasks.slice(0, 5).map((task) => (
                      <li key={task.id}><span className="hrm-list__t"><b>{task.title}</b><small>{[task.code, task.deadline ? f.dateTime(task.deadline) : ""].filter(Boolean).join(" · ")}</small></span><span className="hrm-list__a"><HrmPriority value={task.priority} /><HrmStatus value={task.status} /></span></li>
                    ))}
                  </ul>
                ) : <p className="hrm-muted">{t("noneYet")}</p>}
              </HrmSection>
              <HrmSection label={t("recentAttendance")} aside={<span className="hrm-count">{detail.attendance.length}</span>}>
                {detail.attendance.length ? (
                  <ul className="hrm-list">
                    {detail.attendance.slice(0, 5).map((a) => (
                      <li key={a.id || a.date}><span className="hrm-list__t"><b>{f.date(a.date)}</b><small>{`${f.time(a.firstIn)} – ${f.time(a.lastOut)} · ${f.minutes(a.workedMinutes)}`}</small></span><HrmStatus value={a.status} /></li>
                    ))}
                  </ul>
                ) : <p className="hrm-muted">{t("noneYet")}</p>}
              </HrmSection>
              {detail.kpis.length ? (
                <HrmSection label={t("kpiCount")}>
                  <ul className="hrm-list">
                    {detail.kpis.map((k) => <li key={k.id}><span className="hrm-list__t"><b>{k.title}</b><small>{`${f.num(k.actual)} / ${f.num(k.target)} · ${f.period(k.period)}`}</small></span><b className="hrm-num">{f.num(k.score)}</b></li>)}
                  </ul>
                </HrmSection>
              ) : null}
              {detail.payroll.length ? (
                <HrmSection label={t("payrollCount")}>
                  <ul className="hrm-list">
                    {detail.payroll.map((p) => <li key={p.id}><span className="hrm-list__t"><b>{p.title || p.type}</b><small>{f.period(p.period)}</small></span><span className="hrm-list__a"><b className="hrm-num">{f.money(p.amount)}</b><HrmStatus value={p.status} /></span></li>)}
                  </ul>
                </HrmSection>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <EmployeeEdit employee={e} onSaved={onSaved} />
      )}
    </HrmDrawer>
  );
}

function EmployeeEdit({ employee: e, onSaved }: { employee: HrmEmployee; onSaved: () => void }) {
  const t = useTranslations("internal.people");
  const tu = useTranslations("internal.ui");
  const label = useStatusLabel();
  const dir = useHrmDirectory();
  const raw = e.raw;
  const [profile, setProfile] = useState({
    last_name: asStr(raw.last_name),
    first_name: asStr(raw.first_name),
    middle_name: asStr(raw.middle_name),
    phone: e.phone,
    email: e.email,
    region: e.region,
    employment_status: e.status || "active",
  });
  const [assignment, setAssignment] = useState({ org_unit_id: e.unitId, position_id: e.positionId, manager_employee_id: e.managerId, employment_type: e.employmentType || "full_time", salary_amount: e.salary !== null ? String(e.salary) : "" });
  const [busy, setBusy] = useState<"" | "profile" | "assignment">("");
  const [saved, setSaved] = useState<"" | "profile" | "assignment">("");
  const [error, setError] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const display = fullName(profile);
    if (!display) return;
    setBusy("profile");
    setError(false);
    setSaved("");
    try {
      await updateEmployee(e.id, {
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
        middle_name: profile.middle_name.trim(),
        display_name: display,
        phone: profile.phone.trim(),
        email: profile.email.trim(),
        region: profile.region.trim(),
        employment_status: profile.employment_status,
      });
      setSaved("profile");
      onSaved();
    } catch {
      setError(true);
    } finally {
      setBusy("");
    }
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("assignment");
    setError(false);
    setSaved("");
    try {
      // A new active assignment closes the previous one (10-08 guide).
      await assignEmployee(e.id, {
        org_unit_id: assignment.org_unit_id || null,
        position_id: assignment.position_id || null,
        manager_employee_id: assignment.manager_employee_id || null,
        employment_type: assignment.employment_type,
        rate: 100,
        salary_amount: assignment.salary_amount ? Number(assignment.salary_amount.replace(/\s/g, "")) : null,
        currency: "UZS",
        status: "active",
        meta: {},
      });
      setSaved("assignment");
      onSaved();
    } catch {
      setError(true);
    } finally {
      setBusy("");
    }
  }

  const managers = dir.employeeOptions.filter((o) => o.value !== e.id);

  return (
    <>
      {error ? <HrmError text={t("saveError")} /> : null}
      <form className="hrm-form" onSubmit={saveProfile}>
        <span className="ldrw__lbl">{t("editProfile")}</span>
        <div className="hrm-form__grid">
          <InternalField label={t("lastName")}><input value={profile.last_name} onChange={(ev) => setProfile((c) => ({ ...c, last_name: ev.target.value }))} maxLength={80} required /></InternalField>
          <InternalField label={t("firstName")}><input value={profile.first_name} onChange={(ev) => setProfile((c) => ({ ...c, first_name: ev.target.value }))} maxLength={80} /></InternalField>
          <InternalField label={t("middleName")}><input value={profile.middle_name} onChange={(ev) => setProfile((c) => ({ ...c, middle_name: ev.target.value }))} maxLength={80} /></InternalField>
          <InternalField label={t("phone")}><input value={profile.phone} onChange={(ev) => setProfile((c) => ({ ...c, phone: ev.target.value }))} inputMode="tel" maxLength={30} placeholder="+998" /></InternalField>
          <InternalField label={t("email")}><input type="email" value={profile.email} onChange={(ev) => setProfile((c) => ({ ...c, email: ev.target.value }))} maxLength={120} /></InternalField>
          <InternalField label={t("region")}><input value={profile.region} onChange={(ev) => setProfile((c) => ({ ...c, region: ev.target.value }))} maxLength={80} /></InternalField>
          <InternalField label={t("statusFilter")}><Select value={profile.employment_status} onChange={(v) => setProfile((c) => ({ ...c, employment_status: v }))} options={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))} ariaLabel={t("statusFilter")} /></InternalField>
        </div>
        {saved === "profile" ? <div className="hrm-ok"><IconCheck />{t("savedProfile")}</div> : null}
        <div className="hrm-form__foot"><button className="btn btn--pri btn--sm" type="submit" disabled={!!busy}>{busy === "profile" ? t("saving") : t("saveProfile")}</button></div>
      </form>
      <form className="hrm-form" onSubmit={saveAssignment}>
        <span className="ldrw__lbl">{t("assignment")}</span>
        <div className="hrm-form__grid">
          <InternalField label={t("columns.unit")}><EntitySelect value={assignment.org_unit_id} onChange={(v) => setAssignment((c) => ({ ...c, org_unit_id: v }))} options={dir.unitOptions} placeholder={tu("choose.unit")} ariaLabel={t("columns.unit")} /></InternalField>
          <InternalField label={t("columns.position")}><EntitySelect value={assignment.position_id} onChange={(v) => setAssignment((c) => ({ ...c, position_id: v }))} options={dir.positionOptions} placeholder={tu("choose.position")} ariaLabel={t("columns.position")} /></InternalField>
          <InternalField label={t("columns.manager")}><EntitySelect value={assignment.manager_employee_id} onChange={(v) => setAssignment((c) => ({ ...c, manager_employee_id: v }))} options={managers} placeholder={tu("choose.manager")} ariaLabel={t("columns.manager")} /></InternalField>
          <InternalField label={t("employmentType")}><Select value={assignment.employment_type} onChange={(v) => setAssignment((c) => ({ ...c, employment_type: v }))} options={EMPLOYMENT_TYPES.map((x) => ({ value: x, label: t(`types.${x}`) }))} ariaLabel={t("employmentType")} /></InternalField>
          <InternalField label={t("salary")}><input value={assignment.salary_amount} onChange={(ev) => setAssignment((c) => ({ ...c, salary_amount: ev.target.value.replace(/[^\d\s]/g, "") }))} inputMode="numeric" maxLength={16} placeholder="0" /></InternalField>
        </div>
        {saved === "assignment" ? <div className="hrm-ok"><IconCheck />{t("savedAssignment")}</div> : null}
        <div className="hrm-form__foot"><button className="btn btn--pri btn--sm" type="submit" disabled={!!busy}>{busy === "assignment" ? t("saving") : t("saveAssignment")}</button></div>
      </form>
    </>
  );
}

// ── Create ─────────────────────────────────────────────────────────────────

export function EmployeeCreate({ open, onClose, onCreated, unitId = "" }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; unitId?: string }) {
  const t = useTranslations("internal.people");
  const tu = useTranslations("internal.ui");
  const dir = useHrmDirectory();
  const blank = { last_name: "", first_name: "", middle_name: "", phone: "", email: "", region: "", hire_date: "", user_id: "", org_unit_id: "", position_id: "", manager_employee_id: "", employment_type: "full_time", salary_amount: "" };
  const [form, setForm] = useState(blank);
  // Opened from a unit on the org board: that unit is already chosen.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setForm({ ...blank, org_unit_id: unitId });
  }
  const [userLabel, setUserLabel] = useState<SearchOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const set = (k: keyof typeof blank) => (v: string) => setForm((c) => ({ ...c, [k]: v }));

  // An existing login can be linked to the new employee (10-08 test step 4),
  // found by name or phone through the shared reference API — never typed.
  const searchUsers = useCallback(async (q: string): Promise<SearchOption[]> => {
    try {
      const items = await getStudioReference("users", q, 20);
      const out = items.map((i) => ({ value: i.value, label: i.label, sub: asStr(i.raw.role) }));
      setUserLabel(out);
      return out;
    } catch {
      return [];
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const display = fullName(form);
    if (!display || busy) return;
    setBusy(true);
    setError(false);
    try {
      const created = await createEmployee({
        user_id: form.user_id || null,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        middle_name: form.middle_name.trim(),
        display_name: display,
        phone: form.phone.trim(),
        email: form.email.trim(),
        region: form.region.trim(),
        employment_status: "active",
        hire_date: form.hire_date ? `${form.hire_date}T00:00:00Z` : null,
        profile: {},
      });
      const id = asStr(asDict(created).id);
      if (id && (form.org_unit_id || form.position_id)) {
        await assignEmployee(id, {
          org_unit_id: form.org_unit_id || null,
          position_id: form.position_id || null,
          manager_employee_id: form.manager_employee_id || null,
          employment_type: form.employment_type,
          rate: 100,
          salary_amount: form.salary_amount ? Number(form.salary_amount.replace(/\s/g, "")) : null,
          currency: "UZS",
          status: "active",
          meta: {},
        });
      }
      setForm(blank);
      onCreated(id);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer open={open} onClose={onClose} title={t("newEmployee")} sub={t("newEmployeeLead")}>
      <form className="hrm-form" onSubmit={submit} id="hrm-employee-create">
        {error ? <HrmError text={t("saveError")} /> : null}
        <span className="ldrw__lbl">{t("personal")}</span>
        <div className="hrm-form__grid">
          <InternalField label={t("lastName")}><input value={form.last_name} onChange={(e) => set("last_name")(e.target.value)} maxLength={80} required /></InternalField>
          <InternalField label={t("firstName")}><input value={form.first_name} onChange={(e) => set("first_name")(e.target.value)} maxLength={80} required /></InternalField>
          <InternalField label={t("middleName")}><input value={form.middle_name} onChange={(e) => set("middle_name")(e.target.value)} maxLength={80} /></InternalField>
          <InternalField label={t("phone")}><input value={form.phone} onChange={(e) => set("phone")(e.target.value)} inputMode="tel" maxLength={30} placeholder="+998" /></InternalField>
          <InternalField label={t("email")}><input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} maxLength={120} /></InternalField>
          <InternalField label={t("region")}><input value={form.region} onChange={(e) => set("region")(e.target.value)} maxLength={80} /></InternalField>
          <InternalField label={t("hireDate")}><DatePicker value={form.hire_date} onChange={set("hire_date")} placeholder={t("hireDate")} ariaLabel={t("hireDate")} clearLabel={tu("clear")} /></InternalField>
          <InternalField label={t("loginAccount")} hint={t("loginAccountHint")}>
            <SearchSelect single value={form.user_id ? [form.user_id] : []} onChange={(v) => set("user_id")(v[v.length - 1] ?? "")} options={userLabel} onSearch={searchUsers} placeholder={t("loginAccountPh")} searchPlaceholder={tu("search")} emptyText={tu("noOptions")} ariaLabel={t("loginAccount")} />
          </InternalField>
        </div>
        <span className="ldrw__lbl">{t("assignment")}</span>
        <div className="hrm-form__grid">
          <InternalField label={t("columns.unit")}><EntitySelect value={form.org_unit_id} onChange={set("org_unit_id")} options={dir.unitOptions} placeholder={tu("choose.unit")} ariaLabel={t("columns.unit")} /></InternalField>
          <InternalField label={t("columns.position")}><EntitySelect value={form.position_id} onChange={set("position_id")} options={dir.positionOptions} placeholder={tu("choose.position")} ariaLabel={t("columns.position")} /></InternalField>
          <InternalField label={t("columns.manager")}><EntitySelect value={form.manager_employee_id} onChange={set("manager_employee_id")} options={dir.employeeOptions} placeholder={tu("choose.manager")} ariaLabel={t("columns.manager")} /></InternalField>
          <InternalField label={t("employmentType")}><Select value={form.employment_type} onChange={set("employment_type")} options={EMPLOYMENT_TYPES.map((x) => ({ value: x, label: t(`types.${x}`) }))} ariaLabel={t("employmentType")} /></InternalField>
          <InternalField label={t("salary")}><input value={form.salary_amount} onChange={(e) => set("salary_amount")(e.target.value.replace(/[^\d\s]/g, ""))} inputMode="numeric" maxLength={16} placeholder="0" /></InternalField>
        </div>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy}><IconPlus />{busy ? t("saving") : t("create")}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>{t("cancelEdit")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

