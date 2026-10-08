"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ApiError, asArr, asDict, asStr, type Dict } from "@/lib/http";
import { createEmployee, createPosition, getEmployees, getOrgBoard, getPositions, recordLabel, recordName, recordStatus, type InternalPage, type InternalRecord } from "@/lib/services/internalHrm";
import { IconBuilding, IconPlus, IconRefresh, IconSearch, IconUsers } from "@/components/icons";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try {
      if (mode === "employees") setEmployees(await getEmployees({ q, limit: 25, offset: 0 }, signal));
      else {
        const [raw, rows] = await Promise.all([getOrgBoard("people", signal), getPositions({ limit: 50, offset: 0 }, signal)]);
        setBoard(asDict(raw)); setPositions(rows);
      }
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [mode, q]);

  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!form.full_name.trim() || saving) return;
    setSaving(true); setError(false);
    try { await createEmployee(form); setForm({ full_name: "", phone: "", position_id: "", unit_id: "" }); await load(); } catch { setError(true); } finally { setSaving(false); }
  }

  async function savePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!positionForm.name.trim() || saving) return;
    setSaving(true); setError(false);
    try { await createPosition(positionForm); setPositionForm({ name: "", code: "", unit_id: "" }); await load(); } catch { setError(true); } finally { setSaving(false); }
  }

  return <section className="internal-page">
    <div className="internal-section-head"><div><span className="internal-kicker">{t("kicker")}</span><h2>{t(`titles.${mode}`)}</h2><p>{t(`subtitles.${mode}`)}</p></div><button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button></div>
    {error && <div className="internal-notice internal-notice--error" role="alert">{t("error")}</div>}
    {mode === "employees" ? <>
      <div className="internal-toolbar"><label className="internal-search"><IconSearch /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("searchEmployees")} aria-label={t("searchEmployees")} maxLength={120} /></label><span className="pill pill--gray">{employees.total} {t("total")}</span></div>
      <div className="internal-panel">{loading ? <div className="internal-loading" aria-busy="true" /> : employees.items.length ? <div className="internal-table-wrap"><table className="internal-table"><thead><tr><th>{t("columns.employee")}</th><th>{t("columns.position")}</th><th>{t("columns.unit")}</th><th>{t("columns.status")}</th></tr></thead><tbody>{employees.items.map((row, index) => <tr key={asStr(row.id, `${recordLabel(row)}-${index}`)}><td><b>{recordName(row)}</b><small>{recordLabel(row)} · {field(row, "phone")}</small></td><td>{field(row, "position_name", "position")}</td><td>{field(row, "unit_name", "department")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td></tr>)}</tbody></table></div> : <p className="internal-empty">{t("emptyEmployees")}</p>}</div>
      <form className="internal-panel internal-form" onSubmit={saveEmployee}><div className="internal-panel__head"><h3>{t("newEmployee")}</h3><IconPlus /></div><div className="internal-form-grid"><input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} placeholder={t("fullName")} aria-label={t("fullName")} maxLength={160} required /><input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder={t("phone")} aria-label={t("phone")} inputMode="tel" maxLength={30} /><input value={form.position_id} onChange={(event) => setForm((current) => ({ ...current, position_id: event.target.value }))} placeholder={t("positionId")} aria-label={t("positionId")} maxLength={80} /><input value={form.unit_id} onChange={(event) => setForm((current) => ({ ...current, unit_id: event.target.value }))} placeholder={t("unitId")} aria-label={t("unitId")} maxLength={80} /></div><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconPlus />{saving ? t("saving") : t("create")}</button></form>
    </> : <>
      <div className="internal-board-grid"><div className="internal-panel internal-board-summary"><span className="internal-stat__icon"><IconBuilding /></span><div><b>{field(board ?? {}, "name", "organization_name")}</b><small>{t("organizationBoard")}</small></div></div><div className="internal-panel internal-board-summary"><span className="internal-stat__icon"><IconUsers /></span><div><b>{asArr(board?.people ?? board?.employees).length}</b><small>{t("peopleInBoard")}</small></div></div><div className="internal-panel internal-board-summary"><span className="internal-stat__icon"><IconBuilding /></span><div><b>{asArr(board?.units ?? board?.departments).length}</b><small>{t("unitsInBoard")}</small></div></div></div>
      <div className="internal-panel"><div className="internal-panel__head"><h3>{t("positions")}</h3><span className="pill pill--gray">{positions.total}</span></div>{loading ? <div className="internal-loading" aria-busy="true" /> : positions.items.length ? <div className="internal-table-wrap"><table className="internal-table"><thead><tr><th>{t("columns.position")}</th><th>{t("columns.code")}</th><th>{t("columns.unit")}</th><th>{t("columns.status")}</th></tr></thead><tbody>{positions.items.map((row, index) => <tr key={asStr(row.id, `${recordLabel(row)}-${index}`)}><td><b>{recordName(row)}</b></td><td>{field(row, "code", "work_code")}</td><td>{field(row, "unit_name", "department")}</td><td><span className="pill pill--gray">{recordStatus(row)}</span></td></tr>)}</tbody></table></div> : <p className="internal-empty">{t("emptyPositions")}</p>}</div>
      <form className="internal-panel internal-form" onSubmit={savePosition}><div className="internal-panel__head"><h3>{t("newPosition")}</h3><IconPlus /></div><div className="internal-form-grid"><input value={positionForm.name} onChange={(event) => setPositionForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("positionName")} aria-label={t("positionName")} maxLength={160} required /><input value={positionForm.code} onChange={(event) => setPositionForm((current) => ({ ...current, code: event.target.value }))} placeholder={t("positionCode")} aria-label={t("positionCode")} maxLength={50} /><input value={positionForm.unit_id} onChange={(event) => setPositionForm((current) => ({ ...current, unit_id: event.target.value }))} placeholder={t("unitId")} aria-label={t("unitId")} maxLength={80} /></div><button className="btn btn--pri btn--sm" type="submit" disabled={saving}><IconPlus />{saving ? t("saving") : t("create")}</button></form>
    </>}
  </section>;
}
