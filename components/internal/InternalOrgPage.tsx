"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError, asDict, asStr } from "@/lib/http";
import { toast } from "@/lib/toast";
import Modal from "@/components/admin/Modal";
import { apiMessage } from "@/components/internal/live/bits";
import {
  createOrgUnit,
  createPosition,
  getOrgBoard,
  getPositions,
  normEmployee,
  normOrgBoard,
  normPosition,
  updateOrgUnit,
  updatePosition,
  type HrmPosition,
  type OrgBoard,
} from "@/lib/services/internalHrm";
import { IconBriefcase, IconBuilding, IconChartBar, IconCheck, IconEdit, IconList, IconPlus, IconRefresh } from "@/components/icons";
import Select from "@/components/Select";
import InternalField from "@/components/internal/InternalField";
import InternalOrgBoard, { type OrgView } from "@/components/internal/InternalOrgBoard";
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
  const [unitForm, setUnitForm] = useState<UnitFormState | null>(null);
  const [closing, setClosing] = useState<{ id: string; name: string } | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeErr, setCloseErr] = useState("");
  const [positionForm, setPositionForm] = useState<HrmPosition | "new" | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [newEmployeeUnit, setNewEmployeeUnit] = useState<string | null>(null);
  const [view, setView] = useState<OrgView>("board");

  // `quiet`: a live update re-reads in place — the board keeps its zoom,
  // scroll and open panel instead of dropping back to a skeleton.
  const load = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(false);
    try {
      // The positions table is a second list: if it fails, the board still shows.
      const [raw, rows] = await Promise.all([getOrgBoard("people", signal), getPositions({ limit: 100 }, signal).catch((cause: unknown) => (cause instanceof ApiError && cause.detail === "aborted" ? Promise.reject(cause) : null))]);
      setBoard(normOrgBoard(raw));
      if (rows) setPositions(rows.items.map(normPosition));
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
  // Only changes to the org structure itself redraw the board (a task or a
  // schedule event does not).
  useEffect(
    () =>
      subscribeUserEvents((event) => {
        if (/^internal\.(org|unit|units|position|positions|employee|employees|assignment|assignments)\b/.test(event.event)) void load(undefined, true);
      }),
    [load],
  );

  // Open 360 works for anyone on the board, also when the directory did not
  // load them (it reads the first 100, and only with employees access).
  const employee = useMemo(() => {
    if (!employeeId) return null;
    const known = dir.employee(employeeId);
    if (known) return known;
    const node = board.nodes.find((n) => n.id === `employee:${employeeId}`);
    if (!node) return null;
    return normEmployee({ ...asDict(node.raw.employee), id: employeeId, display_name: node.label, employee_code: node.raw.employee_code, assignment: node.raw.assignment });
  }, [employeeId, dir, board.nodes]);

  return (
    <section className="hrm-page">
      <HrmHead
        kicker={t("kicker")}
        title={t("titles.org")}
        lead={t("subtitles.org")}
        actions={
          <>
            <div className="hrm-tabs org-views" role="tablist" aria-label={t("board.views")}>
              {(["board", "list", "stats"] as OrgView[]).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
                  {v === "board" ? <IconBuilding /> : v === "list" ? <IconList /> : <IconChartBar />}
                  {v === "board" ? t("board.viewBoard") : v === "list" ? t("board.viewList") : t("board.viewStats")}
                </button>
              ))}
            </div>
            <button className="btn btn--line btn--sm" type="button" onClick={reload} disabled={loading} aria-label={t("refresh")} title={t("refresh")}><IconRefresh /></button>
            <button className="btn btn--line btn--sm" type="button" onClick={() => setPositionForm("new")}><IconPlus />{t("newPosition")}</button>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setUnitForm({ id: "", parentId: "" })}><IconPlus />{t("newUnit")}</button>
          </>
        }
      />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}

      <InternalOrgBoard
        board={board}
        loading={loading}
        view={view}
        failed={error}
        actions={{
          onRename: async (id, name) => {
            try {
              await updateOrgUnit(id, { name });
              void load(undefined, true);
            } catch (cause) {
              toast(apiMessage(cause, t("saveError")), { tone: "err" });
            }
          },
          onDuplicate: (id) => setUnitForm({ id: "", parentId: "", copyOf: id }),
          onAddAbove: (id) => setUnitForm({ id: "", parentId: dir.unit(id)?.parentId ?? (board.nodes.find((n) => n.entityId === id && n.type !== "employee")?.parentId.replace(/^unit:/, "") ?? ""), above: id }),
          onCloseUnit: (id) => {
            setCloseErr("");
            setClosing({ id, name: dir.unitName(id) || board.nodes.find((n) => n.entityId === id)?.label || "" });
          },
        }}
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

      <UnitDrawer state={unitForm} board={board} onClose={() => setUnitForm(null)} onSaved={() => { setUnitForm(null); refreshHrmDirectory(); void load(undefined, true); }} />
      <Modal
        open={!!closing}
        onClose={() => !closeBusy && setClosing(null)}
        title={t("board.menu.closeTitle", { name: closing?.name ?? "" })}
        aiId="internal.org.close-unit"
        footer={
          <>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setClosing(null)} disabled={closeBusy}>{t("cancelEdit")}</button>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              disabled={closeBusy}
              onClick={async () => {
                if (!closing) return;
                setCloseBusy(true);
                setCloseErr("");
                try {
                  await updateOrgUnit(closing.id, { status: "inactive" });
                  setClosing(null);
                  refreshHrmDirectory();
                  void load(undefined, true);
                } catch (cause) {
                  setCloseErr(apiMessage(cause, t("saveError")));
                } finally {
                  setCloseBusy(false);
                }
              }}
            >
              {closeBusy ? t("saving") : t("board.menu.closeConfirm")}
            </button>
          </>
        }
      >
        <p>{t("board.menu.closeLead")}</p>
        {closeErr ? <HrmError text={closeErr} /> : null}
      </Modal>
      <PositionDrawer value={positionForm} onClose={() => setPositionForm(null)} onSaved={() => { setPositionForm(null); reload(); }} />
      <Employee360 employee={employee} onClose={() => setEmployeeId("")} onSaved={reload} />
      <EmployeeCreate open={newEmployeeUnit !== null} unitId={newEmployeeUnit ?? ""} onClose={() => setNewEmployeeUnit(null)} onCreated={(id) => { setNewEmployeeUnit(null); reload(); setEmployeeId(id); }} />
    </section>
  );
}

// A unit to edit (id), a new one (under parentId), a copy of one (copyOf), or
// a new one put in between a unit and its parent (above).
type UnitFormState = { id: string; parentId: string; copyOf?: string; above?: string };

function UnitDrawer({ state, board, onClose, onSaved }: { state: UnitFormState | null; board: OrgBoard; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("internal.people");
  const tu = useTranslations("internal.ui");
  const label = useStatusLabel();
  const dir = useHrmDirectory();
  const blank = { name: "", code: "", unit_type: "department", parent_id: "", head_employee_id: "", status: "active", order: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prev, setPrev] = useState<typeof state>(null);
  if (state !== prev) {
    setPrev(state);
    setError("");
    if (state) {
      const src = state.id || state.copyOf || "";
      const u = src ? dir.unit(src) : undefined;
      const node = src ? board.nodes.find((n) => n.entityId === src && n.type !== "employee") : undefined;
      if (state.copyOf) {
        const name = u?.name || node?.label || "";
        setForm({ ...blank, name: name ? t("board.menu.copyNamed", { name }) : "", unit_type: u?.type || asStr(node?.raw.unit_type) || "department", parent_id: u?.parentId || node?.parentId.replace(/^unit:/, "") || "", status: "active" });
      } else setForm(u
        ? { name: u.name, code: u.code, unit_type: u.type || "department", parent_id: u.parentId, head_employee_id: u.headId, status: u.status || "active", order: String(u.order || "") }
        : node
          ? { ...blank, name: node.label, code: node.subtitle, parent_id: node.parentId.replace(/^unit:/, ""), head_employee_id: String(node.raw.head && (node.raw.head as Record<string, unknown>).id || "") }
          : { ...blank, parent_id: state.parentId });
    }
  }
  // A unit can't be its own parent, nor sit under one of its own sub-units
  // (that would be a cycle); the backend checks again and says why.
  const parents = useMemo(() => {
    const id = state?.id;
    if (!id) return dir.unitOptions;
    const below = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const u of dir.units) if (u.parentId && below.has(u.parentId) && !below.has(u.id)) {
        below.add(u.id);
        grew = true;
      }
    }
    return dir.unitOptions.filter((o) => !below.has(o.value));
  }, [dir.unitOptions, dir.units, state?.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || busy || !form.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const payload = { name: form.name.trim(), code: form.code.trim(), unit_type: form.unit_type, parent_id: form.parent_id || null, head_employee_id: form.head_employee_id || null, status: form.status, ...(form.order ? { order_index: Number(form.order) } : {}) };
      if (state.id) await updateOrgUnit(state.id, payload);
      else {
        const created = asDict(await createOrgUnit({ ...payload, meta: {} }));
        const newId = asStr(created.id) || asStr(asDict(created.unit).id);
        // In between: the unit it was put above now hangs under it.
        if (state.above && newId) await updateOrgUnit(state.above, { parent_id: newId });
      }
      onSaved();
    } catch (cause) {
      // The backend's own reason (a cycle, a duplicate code, no right to
      // this branch) rather than a generic failure.
      setError(apiMessage(cause, t("saveError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer
      open={!!state}
      onClose={onClose}
      title={state?.id ? t("editUnit") : state?.above ? t("board.menu.addAbove") : state?.copyOf ? t("board.menu.duplicate") : t("newUnit")}
      sub={state?.id ? form.name : state?.above ? t("board.menu.aboveLead", { name: dir.unitName(state.above) || board.nodes.find((n) => n.entityId === state.above)?.label || "" }) : t("newUnitLead")}
    >
      <form className="hrm-form" onSubmit={submit}>
        {error ? <HrmError text={error} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("unitName")}><input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} maxLength={160} required /></InternalField>
          <InternalField label={t("unitCode")}><input value={form.code} onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))} maxLength={50} placeholder="DEP-001" /></InternalField>
          <InternalField label={t("unitType")}><Select value={form.unit_type} onChange={(v) => setForm((c) => ({ ...c, unit_type: v }))} options={UNIT_TYPES.map((x) => ({ value: x, label: tu(`unitType.${x}`) }))} ariaLabel={t("unitType")} /></InternalField>
          <InternalField label={t("parentId")}><EntitySelect value={form.parent_id} onChange={(v) => setForm((c) => ({ ...c, parent_id: v }))} options={parents} placeholder={tu("choose.parent")} ariaLabel={t("parentId")} /></InternalField>
          <InternalField label={t("unitHead")}><EntitySelect value={form.head_employee_id} onChange={(v) => setForm((c) => ({ ...c, head_employee_id: v }))} options={dir.employeeOptions} placeholder={tu("choose.head")} ariaLabel={t("unitHead")} /></InternalField>
          <InternalField label={t("statusFilter")}><Select value={form.status} onChange={(v) => setForm((c) => ({ ...c, status: v }))} options={STATUSES.map((s) => ({ value: s, label: label(s) }))} ariaLabel={t("statusFilter")} /></InternalField>
          <InternalField label={t("unitOrder")} hint={t("unitOrderHint")}><input value={form.order} onChange={(e) => setForm((c) => ({ ...c, order: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" maxLength={4} placeholder="10" /></InternalField>
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
  const [error, setError] = useState("");
  const [prev, setPrev] = useState<typeof value>(null);
  if (value !== prev) {
    setPrev(value);
    setError("");
    if (value && value !== "new") setForm({ title: value.title, code: value.code, category: value.category || "operations", grade: value.grade, default_role_code: value.roleCode, description: value.description, status: value.status || "active" });
    else if (value === "new") setForm(blank);
  }
  const editing = value && value !== "new" ? value : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value || busy || !form.title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const payload = { title: form.title.trim(), code: form.code.trim(), category: form.category, grade: form.grade.trim(), default_role_code: form.default_role_code.trim(), description: form.description.trim(), status: form.status };
      if (editing) await updatePosition(editing.id, payload);
      else await createPosition({ ...payload, requirements: {} });
      onSaved();
    } catch (cause) {
      setError(apiMessage(cause, t("saveError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <HrmDrawer open={!!value} onClose={onClose} title={editing ? t("editPosition") : t("newPosition")} sub={editing ? editing.title : t("newPositionLead")}>
      <form className="hrm-form" onSubmit={submit}>
        {error ? <HrmError text={error} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("positionName")}><input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} maxLength={160} required /></InternalField>
          <InternalField label={t("positionCode")}><input value={form.code} onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))} maxLength={50} placeholder="POS-001" /></InternalField>
          <InternalField label={t("columns.category")}><Select value={form.category} onChange={(v) => setForm((c) => ({ ...c, category: v }))} options={POSITION_CATEGORIES.map((x) => ({ value: x, label: t(`categories.${x}`) }))} ariaLabel={t("columns.category")} /></InternalField>
          <InternalField label={t("columns.grade")}><input value={form.grade} onChange={(e) => setForm((c) => ({ ...c, grade: e.target.value }))} maxLength={40} placeholder={t("gradePh")} /></InternalField>
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
