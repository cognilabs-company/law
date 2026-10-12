"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { asArr, asDict, asNum, asStr } from "@/lib/http";
import { getOrgUnitDetail, normEmployee, personName, type OrgBoard, type OrgBoardNode } from "@/lib/services/internalHrm";
import { IconBriefcase, IconBuilding, IconEdit, IconList, IconPlus, IconSearch, IconUser, IconUsers } from "@/components/icons";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { HrmAvatar, HrmBar, HrmEmpty, HrmError, HrmKv, HrmLoading, HrmPerson, HrmSection, HrmStat, HrmStatus, useHrmFormat } from "@/components/internal/HrmUi";
import Select from "@/components/Select";
import OrgWhiteboard from "./OrgWhiteboard";
import { buildTree, byPosition, filterTree, flatten, positionIdOf, subtreeOf, type Tree } from "./orgTree";

// HRM org chart (10-09 guide §10): the whiteboard (OrgWhiteboard), the same
// tree as a table with a detail panel, and the numbers.

export type OrgView = "board" | "list" | "stats";

export default function InternalOrgBoard({
  board,
  loading,
  view,
  onEditUnit,
  onAddUnit,
  onAddEmployee,
  onOpenEmployee,
  actions,
  failed,
}: {
  board: OrgBoard;
  loading: boolean;
  view: OrgView;
  // What the whiteboard's right-click menu and keys do to a unit.
  actions: Pick<Parameters<typeof OrgWhiteboard>[0], "onRename" | "onDuplicate" | "onAddAbove" | "onCloseUnit">;
  // The board could not be read: the page says so; no "no units yet" here.
  failed?: boolean;
  onEditUnit: (unitId: string) => void;
  onAddUnit: (parentId: string) => void;
  onAddEmployee: (unitId: string) => void;
  onOpenEmployee: (employeeId: string) => void;
}) {
  const t = useTranslations("internal.people");
  const tb = useTranslations("internal.people.board");
  const [query, setQuery] = useState("");
  const [showPeople, setShowPeople] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [unitF, setUnitF] = useState("");
  const [positionF, setPositionF] = useState("");

  const trees = useMemo(() => buildTree(board), [board]);
  const needle = query.trim().toLocaleLowerCase();
  const shown = useMemo(() => {
    let out = unitF ? subtreeOf(trees, unitF) : trees;
    if (positionF) out = byPosition(out, positionF);
    return filterTree(out, needle);
  }, [trees, needle, unitF, positionF]);
  const unitOpts = useMemo(
    () => [{ value: "", label: tb("allUnits") }, ...flatten(trees).map((u) => ({ value: u.node.id, label: `${"\u00a0".repeat(u.depth * 3)}${u.node.label}` }))],
    [trees, tb],
  );
  const positionOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of board.nodes) if (n.type === "employee" && positionIdOf(n)) m.set(positionIdOf(n), asStr(asDict(n.raw.position).title) || n.subtitle);
    return [{ value: "", label: tb("allPositions") }, ...[...m.entries()].sort((x, y) => x[1].localeCompare(y[1])).map(([value, label]) => ({ value, label }))];
  }, [board.nodes, tb]);
  const selected = board.nodes.find((n) => n.id === selectedId) ?? null;

  // A re-read keeps the board on screen (and its zoom and place).
  if (loading && !board.nodes.length) return <div className="hrm-panel"><HrmLoading rows={6} /></div>;
  if (failed && !trees.length) return null;
  if (!trees.length) {
    return <div className="hrm-panel"><HrmEmpty icon={IconBuilding} title={t("emptyUnits")} text={tb("emptyLead")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => onAddUnit("")}><IconPlus />{t("newUnit")}</button>} /></div>;
  }
  if (view === "board") return <OrgWhiteboard trees={trees} {...actions} onEditUnit={onEditUnit} onAddUnit={onAddUnit} onAddEmployee={onAddEmployee} onOpenEmployee={onOpenEmployee} />;
  if (view === "stats") return <OrgStats board={board} trees={trees} />;

  return (
    <section className="org">
      <div className="org__bar">
        <div className="uf-search org__search">
          <IconSearch aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tb("search")} aria-label={tb("search")} maxLength={120} />
        </div>
        <div className="org__filter">
          <Select value={unitF} onChange={setUnitF} options={unitOpts} ariaLabel={tb("filterUnit")} />
        </div>
        <div className="org__filter">
          <Select value={positionF} onChange={setPositionF} options={positionOpts} ariaLabel={tb("filterPosition")} />
        </div>
        <label className="org__toggle">
          <input type="checkbox" checked={showPeople} onChange={(e) => setShowPeople(e.target.checked)} />
          <span>{tb("showPeople")}</span>
        </label>
      </div>
      <div className="org__work">
        <div className="org__main">
          <OrgList trees={shown} showPeople={showPeople} selectedId={selectedId} onSelect={setSelectedId} filtered={Boolean(needle || unitF || positionF)} />
        </div>
        <aside className="org__aside">
          {selected ? (
            <NodeDetail node={selected} board={board} onSelect={setSelectedId} onEditUnit={onEditUnit} onAddUnit={onAddUnit} onAddEmployee={onAddEmployee} onOpenEmployee={onOpenEmployee} />
          ) : (
            <HrmEmpty icon={IconUsers} title={tb("selectTitle")} text={tb("selectText")} />
          )}
        </aside>
      </div>
    </section>
  );
}

// ── List view ──────────────────────────────────────────────────────────────

function OrgList({ trees, showPeople, selectedId, onSelect, filtered }: { trees: Tree[]; showPeople: boolean; selectedId: string; onSelect: (id: string) => void; filtered: boolean }) {
  const t = useTranslations("internal.people");
  const tb = useTranslations("internal.people.board");
  const rows = flatten(trees);
  return (
    <div className="hrm-table-wrap">
      <table className="hrm-table org-list">
        <thead><tr><th>{tb("department")}</th><th>{tb("head")}</th><th className="hrm-num">{tb("people")}</th><th className="hrm-num">{tb("positions")}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <FragmentRows key={r.node.id}>
              <tr className={`is-click${selectedId === r.node.id ? " is-sel" : ""}`} tabIndex={0} onClick={() => onSelect(r.node.id)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(r.node.id); }}>
                <td><span className="org-list__name" style={{ paddingLeft: r.depth * 22 }}><span className="org-card__i"><IconBuilding /></span><span><b>{r.node.label}</b><small>{r.node.subtitle}</small></span></span></td>
                <td>{personName(r.node.raw.head) || <span className="hrm-muted">—</span>}</td>
                <td className="hrm-num">{r.node.peopleCount}</td>
                <td className="hrm-num">{r.node.positionCount}</td>
              </tr>
              {showPeople ? r.people.map((p) => (
                <tr key={p.id} className={`is-click org-list__person${selectedId === p.id ? " is-sel" : ""}`} tabIndex={0} onClick={() => onSelect(p.id)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(p.id); }}>
                  <td colSpan={4}><span style={{ paddingLeft: r.depth * 22 + 40, display: "inline-flex" }}><HrmPerson name={p.label} sub={[p.subtitle, asStr(p.raw.employee_code)].filter(Boolean).join(" · ")} size="sm" /></span></td>
                </tr>
              )) : null}
            </FragmentRows>
          ))}
        </tbody>
      </table>
      {!rows.length ? <p className="hrm-muted" style={{ padding: 16 }}>{filtered ? tb("noMatch") : t("emptyUnits")}</p> : null}
    </div>
  );
}

function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ── Statistics view ────────────────────────────────────────────────────────

function OrgStats({ board, trees }: { board: OrgBoard; trees: Tree[] }) {
  const tb = useTranslations("internal.people.board");
  const dir = useHrmDirectory();
  const s = board.stats;
  const units = flatten(trees);
  const max = Math.max(1, ...units.map((u) => u.node.peopleCount));
  const unassigned = dir.employees.filter((e) => !e.unitId).length;
  return (
    <div className="hrm-grid">
      <div className="hrm-stats">
        <HrmStat icon={IconBuilding} tone="blue" label={tb("statUnits")} value={asNum(s.units, units.length)} />
        <HrmStat icon={IconUsers} tone="ok" label={tb("statEmployees")} value={asNum(s.employees)} hint={unassigned ? tb("unassigned", { n: unassigned }) : undefined} />
        <HrmStat icon={IconBriefcase} tone="violet" label={tb("statAssignments")} value={asNum(s.assignments)} />
        <HrmStat icon={IconList} tone="cyan" label={tb("statLevels")} value={asNum(s.levels)} hint={tb("statRoots", { n: asNum(s.roots) })} />
      </div>
      <div className="hrm-panel">
        <div className="hrm-panel__h"><h3><span className="hrm-panel__i"><IconUsers /></span><span>{tb("headcount")}</span></h3></div>
        <ul className="hrm-list">
          {[...units].sort((a, b) => b.node.peopleCount - a.node.peopleCount).map((u) => (
            <li key={u.node.id}>
              <span className="hrm-list__t"><b>{u.node.label}</b><small>{u.node.subtitle}</small></span>
              <span className="hrm-list__a org-headcount"><HrmBar value={(u.node.peopleCount / max) * 100} tone="blue" /><b className="hrm-num">{u.node.peopleCount}</b></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────

function NodeDetail({ node, board, onSelect, onEditUnit, onAddUnit, onAddEmployee, onOpenEmployee }: { node: OrgBoardNode; board: OrgBoard; onSelect: (id: string) => void; onEditUnit: (id: string) => void; onAddUnit: (parentId: string) => void; onAddEmployee: (unitId: string) => void; onOpenEmployee: (id: string) => void }) {
  const t = useTranslations("internal.people");
  const tb = useTranslations("internal.people.board");
  const tu = useTranslations("internal.ui");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [detail, setDetail] = useState<{ id: string; data: Record<string, unknown>; failed?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const unitId = node.type !== "employee" ? node.entityId : "";

  // Department detail: GET /internal/org/units/{unit_id} (§10). A failed read
  // says so, with a retry — not an endless skeleton.
  useEffect(() => {
    if (!unitId) return;
    const c = new AbortController();
    getOrgUnitDetail(unitId, c.signal)
      .then((d) => setDetail({ id: unitId, data: asDict(d) }))
      .catch(() => {
        if (!c.signal.aborted) setDetail({ id: unitId, data: {}, failed: true });
      });
    return () => c.abort();
  }, [unitId, retry]);

  if (node.type === "employee") {
    const a = asDict(node.raw.assignment);
    const pos = asDict(node.raw.position);
    const emp = dir.employee(node.entityId);
    const unitNode = board.nodes.find((n) => n.id === node.parentId);
    return (
      <div className="org-detail">
        <div className="org-detail__head">
          <HrmAvatar name={node.label} size="lg" />
          <div>
            <small className="hrm-kicker">{tb("employee")}</small>
            <h3>{node.label}</h3>
            <p>{asStr(pos.title) || node.subtitle || "—"}</p>
          </div>
        </div>
        <div className="hrm-chips">
          {asStr(node.raw.employee_code) ? <span className="hrm-code">{asStr(node.raw.employee_code)}</span> : null}
          {emp ? <HrmStatus value={emp.status} /> : null}
        </div>
        <HrmKv
          rows={[
            { label: tb("department"), value: unitNode ? <button type="button" className="org-link" onClick={() => onSelect(unitNode.id)}>{unitNode.label}</button> : "—" },
            { label: t("columns.manager"), value: dir.employeeName(asStr(a.manager_employee_id)) || "—" },
            { label: t("employmentType"), value: asStr(a.employment_type) ? (t.has(`types.${asStr(a.employment_type)}`) ? t(`types.${asStr(a.employment_type)}`) : asStr(a.employment_type)) : "—" },
            { label: t("salary"), value: a.salary_amount !== undefined && a.salary_amount !== null ? f.money(asNum(a.salary_amount)) : "—" },
            { label: t("phone"), value: emp?.phone || asStr(asDict(node.raw.employee).phone) || "—" },
          ]}
        />
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="button" onClick={() => onOpenEmployee(node.entityId)}><IconUser />{tb("open360")}</button>
        </div>
      </div>
    );
  }

  const failedDetail = detail?.id === unitId && detail.failed;
  const d = detail?.id === unitId && !detail.failed ? detail.data : null;
  const people = d ? asArr(d.people).map((p) => ({ employee: normEmployee(asDict(p).employee), assignment: asDict(asDict(p).assignment) })) : [];
  const children = d ? asArr(d.children).map((c) => asDict(c)) : [];
  const stats = d ? asDict(d.stats) : {};
  const head = personName(node.raw.head);
  const headId = asStr(asDict(node.raw.head).id) || asStr(node.raw.head_employee_id);
  const type = asStr(node.raw.unit_type);

  return (
    <div className="org-detail">
      <div className="org-detail__head">
        <span className="org-detail__icon"><IconBuilding /></span>
        <div>
          <small className="hrm-kicker">{type && tu.has(`unitType.${type}`) ? tu(`unitType.${type}`) : tb("department")}</small>
          <h3>{node.label}</h3>
          <p>{node.subtitle}</p>
        </div>
        <button type="button" className="org-detail__edit" onClick={() => onEditUnit(unitId)} aria-label={t("editUnit")} title={t("editUnit")}><IconEdit /></button>
      </div>
      <div className="hrm-minis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
        <div className="hrm-mini"><b>{asNum(stats.people_count, node.peopleCount)}</b><span>{tb("people")}</span></div>
        <div className="hrm-mini"><b>{node.positionCount}</b><span>{tb("positions")}</span></div>
        <div className="hrm-mini"><b>{asNum(stats.children_count, asNum(node.raw.children_count))}</b><span>{tb("subUnits")}</span></div>
      </div>
      {head ? (
        <HrmSection label={tb("head")}>
          {headId && board.nodes.some((n) => n.id === `employee:${headId}`) ? (
            <button type="button" className="org-row" onClick={() => onSelect(`employee:${headId}`)}>
              <HrmPerson name={head} sub={asStr(asDict(node.raw.head).employee_code)} />
            </button>
          ) : (
            <HrmPerson name={head} sub={asStr(asDict(node.raw.head).employee_code)} />
          )}
        </HrmSection>
      ) : null}
      <HrmSection label={tb("peopleIn")} aside={<span className="hrm-count">{people.length}</span>}>
        {failedDetail ? <HrmError text={tb("detailError")} onRetry={() => setRetry((n) => n + 1)} retryLabel={tb("retry")} /> : !d ? <HrmLoading rows={2} /> : people.length ? (
          <ul className="hrm-list">
            {people.map(({ employee, assignment }) => (
              <li key={employee.id}>
                <button type="button" className="org-row" onClick={() => onSelect(`employee:${employee.id}`)}>
                  <HrmPerson name={employee.name || employee.code} sub={dir.positionTitle(asStr(assignment.position_id)) || employee.code} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="hrm-muted">{tb("noPeople")}</p>}
      </HrmSection>
      {children.length ? (
        <HrmSection label={tb("subUnits")} aside={<span className="hrm-count">{children.length}</span>}>
          <ul className="hrm-list">
            {children.map((c) => (
              <li key={asStr(c.id)}>
                <button type="button" className="org-row" onClick={() => onSelect(`unit:${asStr(c.id)}`)}>
                  <span className="hrm-list__t"><b>{asStr(c.name)}</b><small>{asStr(c.code)}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </HrmSection>
      ) : null}
      <div className="hrm-form__foot">
        <button className="btn btn--pri btn--sm" type="button" onClick={() => onAddEmployee(unitId)}><IconPlus />{tb("addEmployee")}</button>
        <button className="btn btn--line btn--sm" type="button" onClick={() => onAddUnit(unitId)}><IconPlus />{tb("addSubUnit")}</button>
      </div>
    </div>
  );
}
