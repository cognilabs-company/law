"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError, asArr, asDict, asStr, type Dict } from "@/lib/http";
import { assignEmployee, createEmployee, createOrgUnit, createPosition, getEmployee360, getEmployees, getOrgBoard, getPositions, recordLabel, recordName, recordStatus, updateEmployee, updateOrgUnit, updatePosition, type InternalPage, type InternalRecord } from "@/lib/services/internalHrm";
import { IconBuilding, IconEdit, IconPlus, IconRefresh, IconSearch, IconUsers } from "@/components/icons";
import InternalPagination from "@/components/internal/InternalPagination";

type Mode = "employees" | "org";

function field(row: Dict, ...keys: string[]): string {
  for (const key of keys) { const value = asStr(row[key]).trim(); if (value) return value; }
  return "—";
}

export default function InternalPeoplePages({ mode }: { mode: Mode }) {
  const t = useTranslations("internal.people");
  const [employees, setEmployees] = useState<InternalPage<InternalRecord>>({ items: [], total: 0, offset: 0, limit: 25, hasMore: false });
  const [positions, setPositions] = useState<InternalPage<InternalRecord>>({ items: [], total: 0, offset: 0, limit: 25, hasMore: false });
  const [board, setBoard] = useState<Dict | null>(null);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ full_name: "", phone: "", position_id: "", unit_id: "" });
  const [positionForm, setPositionForm] = useState({ name: "", code: "", unit_id: "" });
  const [unitForm, setUnitForm] = useState({ name: "", code: "", parent_id: "" });
  const [editingPositionId, setEditingPositionId] = useState("");
  const [editingUnitId, setEditingUnitId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeDetail, setEmployeeDetail] = useState<Dict | null>(null);
  const [assignment, setAssignment] = useState({ org_unit_id: "", position_id: "", manager_employee_id: "", salary_amount: "" });
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try {
      if (mode === "employees") setEmployees(await getEmployees({ q, limit: 25, offset }, signal));
      else {
        const [raw, rows] = await Promise.all([getOrgBoard("people", signal), getPositions({ limit: 50, offset: 0 }, signal)]);
        setBoard(asDict(raw)); setPositions(rows);
      }
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [mode, q, offset]);

  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) void load(); }), [load]);

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!form.full_name.trim() || saving) return;
    setSaving(true); setError(false);
    try {
      const names = form.full_name.trim().split(/\s+/);
      const created = await createEmployee({ first_name: names[0] || "", last_name: names.slice(1).join(" "), display_name: form.full_name.trim(), phone: form.phone.trim(), employment_status: "active", profile: {} });
      const id = asStr(created.id).trim();
      if (id && (form.position_id.trim() || form.unit_id.trim())) await assignEmployee(id, { org_unit_id: form.unit_id.trim() || null, position_id: form.position_id.trim() || null, manager_employee_id: null, employment_type: "full_time", rate: 100, currency: "UZS", status: "active", meta: {} });
      setForm({ full_name: "", phone: "", position_id: "", unit_id: "" }); await load();
    } catch { setError(true); } finally { setSaving(false); }
  }

  async function savePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!positionForm.name.trim() || saving) return;
    setSaving(true); setError(false);
    try {
      const payload = { title: positionForm.name.trim(), name: positionForm.name.trim(), code: positionForm.code.trim(), unit_id: positionForm.unit_id.trim() || null, status: "active" };
      if (editingPositionId) await updatePosition(editingPositionId, payload); else await createPosition(payload);
      setPositionForm({ name: "", code: "", unit_id: "" }); setEditingPositionId(""); await load();
    } catch { setError(true); } finally { setSaving(false); }
  }

  async function saveUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!unitForm.name.trim() || saving) return;
    setSaving(true); setError(false);
    try {
      const payload = { name: unitForm.name.trim(), code: unitForm.code.trim(), parent_id: unitForm.parent_id.trim() || null, status: "active" };
      if (editingUnitId) await updateOrgUnit(editingUnitId, payload); else await createOrgUnit(payload);
      setUnitForm({ name: "", code: "", parent_id: "" }); setEditingUnitId(""); await load();
    } catch { setError(true); } finally { setSaving(false); }
  }

  async function openEmployee(row: InternalRecord) {
    const id = asStr(row.id).trim();
    if (!id) return;
    setEmployeeId(id); setEmployeeDetail(null); setDetailLoading(true); setError(false);
    try {
      const detail = asDict(await getEmployee360(id));
      const employee = asDict(detail.employee ?? detail);
      setEmployeeDetail(detail);
      setProfileForm({ full_name: recordName(employee) === "—" ? "" : recordName(employee), phone: field(employee, "phone") === "—" ? "" : field(employee, "phone") });
    } catch { setError(true); } finally { setDetailLoading(false); }
  }

  async function saveEmployeeProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!employeeId || !profileForm.full_name.trim() || saving) return;
    setSaving(true); setError(false);
    try {
      const names = profileForm.full_name.trim().split(/\s+/);
      await updateEmployee(employeeId, { first_name: names[0] || "", last_name: names.slice(1).join(" "), display_name: profileForm.full_name.trim(), phone: profileForm.phone.trim(), status: "active", meta: {} });
      setEmployeeDetail(asDict(await getEmployee360(employeeId))); await load();
    } catch { setError(true); } finally { setSaving(false); }
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!employeeId || saving) return;
    setSaving(true); setError(false);
    try { await assignEmployee(employeeId, { org_unit_id: assignment.org_unit_id.trim() || null, position_id: assignment.position_id.trim() || null, manager_employee_id: assignment.manager_employee_id.trim() || null, employment_type: "full_time", rate: 100, salary_amount: assignment.salary_amount ? Number(assignment.salary_amount) : null, currency: "UZS", status: "active", meta: {} }); setEmployeeDetail(asDict(await getEmployee360(employeeId))); await load(); } catch { setError(true); } finally { setSaving(false); }
  }

  function editUnit(node: Dict) {
    setEditingUnitId(asStr(node.id));
    setUnitForm({ name: field(node, "name", "title") === "—" ? "" : field(node, "name", "title"), code: field(node, "code") === "—" ? "" : field(node, "code"), parent_id: asStr(node.parent_id) });
  }

  function editPosition(row: InternalRecord) {
    setEditingPositionId(asStr(row.id));
    setPositionForm({ name: recordName(row) === "—" ? "" : recordName(row), code: field(row, "code", "work_code") === "—" ? "" : field(row, "code", "work_code"), unit_id: asStr(row.unit_id) });
  }

  function treeNode(node: Dict, depth = 0): ReactNode {
    const children = Array.isArray(node.children) ? node.children as Dict[] : [];
    const people = asArr(node.people ?? node.employees).map(asDict);
    return <li key={asStr(node.id, `${depth}-${asStr(node.name, "unit")}`)} className="internal-tree__node"><div className="internal-tree__item" style={{ marginInlineStart: `${depth * 4}px` }}><IconBuilding /><div><b>{field(node, "name", "title")}</b><small>{field(node, "code")} · {people.length} {t("peopleShort")}</small></div>{asStr(node.id) ? <button className="internal-link-button" type="button" onClick={() => editUnit(node)} title={t("editUnit")} aria-label={t("editUnit")}><IconEdit /></button> : null}</div>{people.length ? <ul className="internal-tree__people">{people.map((person, index) => <li key={asStr(person.id, `${recordName(person)}-${index}`)}>{recordName(person)}</li>)}</ul> : null}{children.length ? <ul className="internal-tree__children">{children.map((child) => treeNode(child, depth + 1))}</ul> : null}</li>;
  }

  return <section className="internal-page">
    <div className="internal-section-head"><div><span className="internal-kicker">{t("kicker")}</span><h2>{t(`titles.${mode}`)}</h2><p>{t(`subtitles.${mode}`)}</p></div><button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button></div>
    {error && <div className="internal-notice internal-notice--error" role="alert">{t("error")}</div>}
    {mode === "employees" ? <>
      <div className="internal-toolbar"><label className="internal-search"><IconSearch /><input value={q} onChange={(event) => { setQ(event.target.value); setOffset(0); }} placeholder={t("searchEmployees")} aria-label={t("searchEmployees")} maxLength={120} /></label><span className="pill pill--gray">{employees.total} {t("total")}</span></div>
      <div className="internal-panel">{loading ? <div className="internal-loading" aria-busy="true" /> : employees.items.length ? <div className="internal-table-wrap"><table className="internal-table"><thead><tr><th>{t("columns.employee")}</th><th>{t("columns.position")}</th><th>{t("columns.unit")}</th><th>{t("columns.status")}</th><th>{t("columns.action")}</th></tr></thead><tbody>{employees.items.map((row, index) => <tr key={asStr(row.id, `${recordLabel(row)}-${index}`)}><td><b>{recordName(row)}</b><small>{recordLabel(row)} · {field(row, "phone")}</small></td><td>{field(row, "position_name", "position")}</td><td>{field(row, "unit_name", "department")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td><td><button className="btn btn--line btn--sm" type="button" onClick={() => void openEmployee(row)}>{t("detail")}</button></td></tr>)}</tbody></table></div> : <p className="internal-empty">{t("emptyEmployees")}</p>}<InternalPagination page={employees} onChange={setOffset} /></div>
      <form className="internal-panel internal-form" onSubmit={saveEmployee}><div className="internal-panel__head"><h3>{t("newEmployee")}</h3><IconPlus /></div><div className="internal-form-grid"><input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} placeholder={t("fullName")} aria-label={t("fullName")} maxLength={160} required /><input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder={t("phone")} aria-label={t("phone")} inputMode="tel" maxLength={30} /><input value={form.position_id} onChange={(event) => setForm((current) => ({ ...current, position_id: event.target.value }))} placeholder={t("positionId")} aria-label={t("positionId")} maxLength={80} /><input value={form.unit_id} onChange={(event) => setForm((current) => ({ ...current, unit_id: event.target.value }))} placeholder={t("unitId")} aria-label={t("unitId")} maxLength={80} /></div><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconPlus />{saving ? t("saving") : t("create")}</button></form>
    </> : <>
      <div className="internal-board-grid"><div className="internal-panel internal-board-summary"><span className="internal-stat__icon"><IconBuilding /></span><div><b>{field(board ?? {}, "name", "organization_name")}</b><small>{t("organizationBoard")}</small></div></div><div className="internal-panel internal-board-summary"><span className="internal-stat__icon"><IconUsers /></span><div><b>{asArr(board?.people ?? board?.employees).length}</b><small>{t("peopleInBoard")}</small></div></div><div className="internal-panel internal-board-summary"><span className="internal-stat__icon"><IconBuilding /></span><div><b>{asArr(board?.units ?? board?.departments).length}</b><small>{t("unitsInBoard")}</small></div></div></div>
      <div className="internal-panel"><div className="internal-panel__head"><h3>{t("tree")}</h3><IconBuilding /></div>{asArr(board?.roots ?? board?.units ?? board?.departments).length ? <ul className="internal-tree">{asArr(board?.roots ?? board?.units ?? board?.departments).map((node) => treeNode(asDict(node)))}</ul> : <p className="internal-empty">{t("emptyUnits")}</p>}</div>
      <div className="internal-panel"><div className="internal-panel__head"><h3>{t("positions")}</h3><span className="pill pill--gray">{positions.total}</span></div>{loading ? <div className="internal-loading" aria-busy="true" /> : positions.items.length ? <div className="internal-table-wrap"><table className="internal-table"><thead><tr><th>{t("columns.position")}</th><th>{t("columns.code")}</th><th>{t("columns.unit")}</th><th>{t("columns.status")}</th><th>{t("columns.action")}</th></tr></thead><tbody>{positions.items.map((row, index) => <tr key={asStr(row.id, `${recordLabel(row)}-${index}`)}><td><b>{recordName(row)}</b></td><td>{field(row, "code", "work_code")}</td><td>{field(row, "unit_name", "department")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td><td><button className="internal-link-button" type="button" onClick={() => editPosition(row)} title={t("editPosition")} aria-label={t("editPosition")}><IconEdit /></button></td></tr>)}</tbody></table></div> : <p className="internal-empty">{t("emptyPositions")}</p>}</div>
      <form className="internal-panel internal-form" onSubmit={savePosition}><div className="internal-panel__head"><h3>{editingPositionId ? t("editPosition") : t("newPosition")}</h3><IconPlus /></div><div className="internal-form-grid"><input value={positionForm.name} onChange={(event) => setPositionForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("positionName")} aria-label={t("positionName")} maxLength={160} required /><input value={positionForm.code} onChange={(event) => setPositionForm((current) => ({ ...current, code: event.target.value }))} placeholder={t("positionCode")} aria-label={t("positionCode")} maxLength={50} /><input value={positionForm.unit_id} onChange={(event) => setPositionForm((current) => ({ ...current, unit_id: event.target.value }))} placeholder={t("unitId")} aria-label={t("unitId")} maxLength={80} /></div><div className="internal-action-row"><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconPlus />{saving ? t("saving") : editingPositionId ? t("save") : t("create")}</button>{editingPositionId ? <button className="btn btn--line btn--sm" type="button" onClick={() => { setEditingPositionId(""); setPositionForm({ name: "", code: "", unit_id: "" }); }}>{t("cancelEdit")}</button> : null}</div></form>
      <form className="internal-panel internal-form" onSubmit={saveUnit}><div className="internal-panel__head"><h3>{editingUnitId ? t("editUnit") : t("newUnit")}</h3><IconPlus /></div><div className="internal-form-grid"><input value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("unitName")} aria-label={t("unitName")} maxLength={160} required /><input value={unitForm.code} onChange={(event) => setUnitForm((current) => ({ ...current, code: event.target.value }))} placeholder={t("unitCode")} aria-label={t("unitCode")} maxLength={50} /><input value={unitForm.parent_id} onChange={(event) => setUnitForm((current) => ({ ...current, parent_id: event.target.value }))} placeholder={t("parentId")} aria-label={t("parentId")} maxLength={80} /></div><div className="internal-action-row"><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconPlus />{saving ? t("saving") : editingUnitId ? t("save") : t("create")}</button>{editingUnitId ? <button className="btn btn--line btn--sm" type="button" onClick={() => { setEditingUnitId(""); setUnitForm({ name: "", code: "", parent_id: "" }); }}>{t("cancelEdit")}</button> : null}</div></form>
      {employeeId ? <div className="internal-panel internal-detail"><div className="internal-panel__head"><h3>{t("employee360")}</h3><button className="btn btn--line btn--sm" type="button" onClick={() => { setEmployeeId(""); setEmployeeDetail(null); }}>{t("close")}</button></div>{detailLoading ? <div className="internal-loading" aria-busy="true" /> : employeeDetail ? <><form className="internal-form" onSubmit={saveEmployeeProfile}><div className="internal-panel__head"><h4>{t("editProfile")}</h4></div><div className="internal-form-grid"><input value={profileForm.full_name} onChange={(event) => setProfileForm((current) => ({ ...current, full_name: event.target.value }))} placeholder={t("fullName")} aria-label={t("fullName")} maxLength={160} required /><input value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} placeholder={t("phone")} aria-label={t("phone")} maxLength={30} inputMode="tel" /></div><button className="btn btn--pri btn--sm" type="submit" disabled={saving}>{saving ? t("saving") : t("saveProfile")}</button></form><div className="internal-kv"><span>{t("employee")}</span><b>{recordName(asDict(employeeDetail.employee ?? employeeDetail))}</b></div><div className="internal-kv"><span>{t("tasksCount")}</span><b>{asArr(employeeDetail.tasks).length}</b></div><div className="internal-kv"><span>{t("attendanceCount")}</span><b>{asArr(employeeDetail.attendance).length}</b></div><div className="internal-kv"><span>{t("kpiCount")}</span><b>{asArr(employeeDetail.kpis).length}</b></div><div className="internal-kv"><span>{t("payrollCount")}</span><b>{asArr(employeeDetail.payroll ?? employeeDetail.payroll_entries).length}</b></div><form className="internal-form" onSubmit={saveAssignment}><div className="internal-panel__head"><h4>{t("assignment")}</h4></div><div className="internal-form-grid"><input value={assignment.org_unit_id} onChange={(event) => setAssignment((current) => ({ ...current, org_unit_id: event.target.value }))} placeholder={t("unitId")} aria-label={t("unitId")} /><input value={assignment.position_id} onChange={(event) => setAssignment((current) => ({ ...current, position_id: event.target.value }))} placeholder={t("positionId")} aria-label={t("positionId")} /><input value={assignment.manager_employee_id} onChange={(event) => setAssignment((current) => ({ ...current, manager_employee_id: event.target.value }))} placeholder={t("managerId")} aria-label={t("managerId")} /><input value={assignment.salary_amount} onChange={(event) => setAssignment((current) => ({ ...current, salary_amount: event.target.value }))} placeholder={t("salary")} aria-label={t("salary")} inputMode="numeric" /></div><button className="btn btn--pri btn--sm" type="submit" disabled={saving}>{saving ? t("saving") : t("saveAssignment")}</button></form></> : null}</div> : null}
    </>}
  </section>;
}
