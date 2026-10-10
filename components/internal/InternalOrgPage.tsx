"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError } from "@/lib/http";
import {
  createOrgUnit,
  createPosition,
  getOrgBoard,
  getPositions,
  normOrgBoard,
  normPosition,
  updateOrgUnit,
  updatePosition,
  type HrmPosition,
  type OrgBoard,
} from "@/lib/services/internalHrm";
import { IconBriefcase, IconBuilding, IconCheck, IconEdit, IconPlus, IconRefresh } from "@/components/icons";
import Select from "@/components/Select";
import InternalField from "@/components/internal/InternalField";
import InternalOrgBoard from "@/components/internal/InternalOrgBoard";
import { Employee360, EmployeeCreate } from "@/components/internal/EmployeeDrawers";
import { refreshHrmDirectory, useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { EntitySelect, HrmDrawer, HrmEmpty, HrmError, HrmHead, HrmLoading, HrmPanel, HrmStatus, useStatusLabel } from "@/components/internal/HrmUi";

const UNIT_TYPES = ["company", "department", "team", "branch", "division"] as const;
const POSITION_CATEGORIES = ["management", "operations", "support", "legal", "documents", "marketplace", "sales", "finance", "hr", "quality"] as const;
const STATUSES = ["active", "inactive"] as const;
const EMPTY_BOARD: OrgBoard = { nodes: [], edges: [], stats: {}, layout: {}, raw: {} };

export default function InternalOrgPage() {
  const t = useTranslations("internal.people");
  const dir = useHrmDirectory();
  const [board, setBoard] = useState<OrgBoard>(EMPTY_BOARD);
  const [positions, setPositions] = useState<HrmPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unitForm, setUnitForm] = useState<{ id: string; parentId: string } | null>(null);
  const [positionForm, setPositionForm] = useState<HrmPosition | "new" | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [newEmployeeUnit, setNewEmployeeUnit] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const [raw, rows] = await Promise.all([getOrgBoard("people", signal), getPositions({ limit: 100 }, signal)]);
      setBoard(normOrgBoard(raw));
      setPositions(rows.items.map(normPosition));
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => load(c.signal));
    return () => c.abort();
  }, [load]);
  const reload = useCallback(() => {
    refreshHrmDirectory();
    void load();
  }, [load]);
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) void load(); }), [load]);

  const employee = employeeId ? dir.employee(employeeId) ?? null : null;

  return (
    <section className="hrm-page">
      <HrmHead
        kicker={t("kicker")}
        title={t("titles.org")}
        lead={t("subtitles.org")}
        actions={
          <>
            <button className="btn btn--line btn--sm" type="button" onClick={reload} disabled={loading}><IconRefresh />{t("refresh")}</button>
            <button className="btn btn--line btn--sm" type="button" onClick={() => setPositionForm("new")}><IconPlus />{t("newPosition")}</button>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setUnitForm({ id: "", parentId: "" })}><IconPlus />{t("newUnit")}</button>
          </>
        }
      />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}

      <InternalOrgBoard
        board={board}
        loading={loading}
        onEditUnit={(id) => setUnitForm({ id, parentId: "" })}
        onAddUnit={(parentId) => setUnitForm({ id: "", parentId })}
        onAddEmployee={(unitId) => setNewEmployeeUnit(unitId)}
        onOpenEmployee={setEmployeeId}
      />

      <HrmPanel flush title={t("positions")} icon={IconBriefcase} count={positions.length} actions={<button className="btn btn--line btn--sm" type="button" onClick={() => setPositionForm("new")}><IconPlus />{t("newPosition")}</button>}>
        {loading ? <div style={{ padding: 16 }}><HrmLoading rows={3} /></div> : positions.length ? (
          <div className="hrm-table-wrap">
            <table className="hrm-table">
              <thead><tr><th>{t("columns.position")}</th><th>{t("columns.category")}</th><th>{t("columns.grade")}</th><th>{t("columns.people")}</th><th>{t("columns.status")}</th><th aria-label={t("editPosition")} /></tr></thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.title}</b><small>{[p.code, p.description].filter(Boolean).join(" · ")}</small></td>
                    <td className="hrm-muted">{p.category ? (t.has(`categories.${p.category}`) ? t(`categories.${p.category}`) : p.category) : "—"}</td>
                    <td>{p.grade ? <span className="hrm-chip">{p.grade}</span> : "—"}</td>
                    <td className="hrm-num">{dir.employees.filter((e) => e.positionId === p.id).length}</td>
                    <td><HrmStatus value={p.status} /></td>
                    <td><button className="org-detail__edit" type="button" onClick={() => setPositionForm(p)} aria-label={t("editPosition")} title={t("editPosition")}><IconEdit /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <HrmEmpty icon={IconBriefcase} title={t("emptyPositions")} />}
      </HrmPanel>

      <UnitDrawer state={unitForm} board={board} onClose={() => setUnitForm(null)} onSaved={() => { setUnitForm(null); reload(); }} />
      <PositionDrawer value={positionForm} onClose={() => setPositionForm(null)} onSaved={() => { setPositionForm(null); reload(); }} />
      <Employee360 employee={employee} onClose={() => setEmployeeId("")} onSaved={reload} />
      <EmployeeCreate open={newEmployeeUnit !== null} unitId={newEmployeeUnit ?? ""} onClose={() => setNewEmployeeUnit(null)} onCreated={(id) => { setNewEmployeeUnit(null); reload(); setEmployeeId(id); }} />
    </section>
  );
}

function UnitDrawer({ state, board, onClose, onSaved }: { state: { id: string; parentId: string } | null; board: OrgBoard; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("internal.people");
  const tu = useTranslations("internal.ui");
  const label = useStatusLabel();
  const dir = useHrmDirectory();
  const blank = { name: "", code: "", unit_type: "department", parent_id: "", head_employee_id: "", status: "active" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [prev, setPrev] = useState<typeof state>(null);
  if (state !== prev) {
    setPrev(state);
    setError(false);
    if (state) {
      const u = state.id ? dir.unit(state.id) : undefined;
      const node = state.id ? board.nodes.find((n) => n.entityId === state.id && n.type !== "employee") : undefined;
      setForm(u
        ? { name: u.name, code: u.code, unit_type: u.type || "department", parent_id: u.parentId, head_employee_id: u.headId, status: u.status || "active" }
        : node
          ? { ...blank, name: node.label, code: node.subtitle, parent_id: node.parentId.replace(/^unit:/, ""), head_employee_id: String(node.raw.head && (node.raw.head as Record<string, unknown>).id || "") }
          : { ...blank, parent_id: state.parentId });
    }
  }
  // A unit can't be its own parent; the rest are fair game.
  const parents = useMemo(() => dir.unitOptions.filter((o) => o.value !== state?.id), [dir.unitOptions, state?.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || busy || !form.name.trim()) return;
    setBusy(true);
    setError(false);
    try {
      const payload = { name: form.name.trim(), code: form.code.trim(), unit_type: form.unit_type, parent_id: form.parent_id || null, head_employee_id: form.head_employee_id || null, status: form.status };
      if (state.id) await updateOrgUnit(state.id, payload);
      else await createOrgUnit({ ...payload, meta: {} });
      onSaved();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer open={!!state} onClose={onClose} title={state?.id ? t("editUnit") : t("newUnit")} sub={state?.id ? form.name : t("newUnitLead")}>
      <form className="hrm-form" onSubmit={submit}>
        {error ? <HrmError text={t("saveError")} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("unitName")}><input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} maxLength={160} required /></InternalField>
          <InternalField label={t("unitCode")}><input value={form.code} onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))} maxLength={50} placeholder="DEP-001" /></InternalField>
          <InternalField label={t("unitType")}><Select value={form.unit_type} onChange={(v) => setForm((c) => ({ ...c, unit_type: v }))} options={UNIT_TYPES.map((x) => ({ value: x, label: tu(`unitType.${x}`) }))} ariaLabel={t("unitType")} /></InternalField>
          <InternalField label={t("parentId")}><EntitySelect value={form.parent_id} onChange={(v) => setForm((c) => ({ ...c, parent_id: v }))} options={parents} placeholder={tu("choose.parent")} ariaLabel={t("parentId")} /></InternalField>
          <InternalField label={t("unitHead")}><EntitySelect value={form.head_employee_id} onChange={(v) => setForm((c) => ({ ...c, head_employee_id: v }))} options={dir.employeeOptions} placeholder={tu("choose.head")} ariaLabel={t("unitHead")} /></InternalField>
          <InternalField label={t("statusFilter")}><Select value={form.status} onChange={(v) => setForm((c) => ({ ...c, status: v }))} options={STATUSES.map((s) => ({ value: s, label: label(s) }))} ariaLabel={t("statusFilter")} /></InternalField>
        </div>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy}>{state?.id ? <IconCheck /> : <IconBuilding />}{busy ? t("saving") : state?.id ? t("save") : t("create")}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>{t("cancelEdit")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

function PositionDrawer({ value, onClose, onSaved }: { value: HrmPosition | "new" | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("internal.people");
  const label = useStatusLabel();
  const blank = { title: "", code: "", category: "operations", grade: "", default_role_code: "", description: "", status: "active" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [prev, setPrev] = useState<typeof value>(null);
  if (value !== prev) {
    setPrev(value);
    setError(false);
    if (value && value !== "new") setForm({ title: value.title, code: value.code, category: value.category || "operations", grade: value.grade, default_role_code: value.roleCode, description: value.description, status: value.status || "active" });
    else if (value === "new") setForm(blank);
  }
  const editing = value && value !== "new" ? value : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value || busy || !form.title.trim()) return;
    setBusy(true);
    setError(false);
    try {
      const payload = { title: form.title.trim(), code: form.code.trim(), category: form.category, grade: form.grade.trim(), default_role_code: form.default_role_code.trim(), description: form.description.trim(), status: form.status };
      if (editing) await updatePosition(editing.id, payload);
      else await createPosition({ ...payload, requirements: {} });
      onSaved();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer open={!!value} onClose={onClose} title={editing ? t("editPosition") : t("newPosition")} sub={editing ? editing.title : t("newPositionLead")}>
      <form className="hrm-form" onSubmit={submit}>
        {error ? <HrmError text={t("saveError")} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("positionName")}><input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} maxLength={160} required /></InternalField>
          <InternalField label={t("positionCode")}><input value={form.code} onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))} maxLength={50} placeholder="POS-001" /></InternalField>
          <InternalField label={t("columns.category")}><Select value={form.category} onChange={(v) => setForm((c) => ({ ...c, category: v }))} options={POSITION_CATEGORIES.map((x) => ({ value: x, label: t(`categories.${x}`) }))} ariaLabel={t("columns.category")} /></InternalField>
          <InternalField label={t("columns.grade")}><input value={form.grade} onChange={(e) => setForm((c) => ({ ...c, grade: e.target.value }))} maxLength={40} placeholder="Middle" /></InternalField>
          <InternalField label={t("statusFilter")}><Select value={form.status} onChange={(v) => setForm((c) => ({ ...c, status: v }))} options={STATUSES.map((s) => ({ value: s, label: label(s) }))} ariaLabel={t("statusFilter")} /></InternalField>
          <InternalField label={t("description")}><textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} maxLength={1000} rows={3} /></InternalField>
        </div>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy}><IconCheck />{busy ? t("saving") : editing ? t("save") : t("create")}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>{t("cancelEdit")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}
