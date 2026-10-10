"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { asArr, asDict, asNum, asStr } from "@/lib/http";
import { getOrgUnitDetail, normEmployee, personName, type OrgBoard, type OrgBoardNode } from "@/lib/services/internalHrm";
import { IconBriefcase, IconBuilding, IconChevronDown, IconEdit, IconExpand, IconList, IconMinus, IconPlus, IconSearch, IconUser, IconUsers } from "@/components/icons";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { HrmAvatar, HrmBar, HrmEmpty, HrmKv, HrmLoading, HrmPerson, HrmSection, HrmStat, HrmStatus, useHrmFormat } from "@/components/internal/HrmUi";

// HRM org chart (10-09 guide §10). The board answers flat nodes + edges; this
// turns them back into the tree they describe — units branching sideways,
// each unit's people stacked under its card — and draws it as an org chart
// with real connector lines. A node opens its detail in the side panel, never
// a different page.

type View = "board" | "list" | "stats";
type Tree = { node: OrgBoardNode; units: Tree[]; people: OrgBoardNode[]; depth: number };

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;

function buildTree(board: OrgBoard): Tree[] {
  const units = board.nodes.filter((n) => n.type !== "employee");
  const people = board.nodes.filter((n) => n.type === "employee");
  const byId = new Map(units.map((n) => [n.id, n]));
  // Edges are the authority when present; a node's own parent_id otherwise.
  const parentOf = new Map<string, string>();
  for (const n of board.nodes) if (n.parentId) parentOf.set(n.id, n.parentId);
  for (const e of board.edges) parentOf.set(e.target, e.source);
  const kids = new Map<string, OrgBoardNode[]>();
  const staff = new Map<string, OrgBoardNode[]>();
  for (const u of units) {
    const p = parentOf.get(u.id);
    if (p && byId.has(p)) kids.set(p, [...(kids.get(p) ?? []), u]);
  }
  for (const person of people) {
    const p = parentOf.get(person.id);
    if (p) staff.set(p, [...(staff.get(p) ?? []), person]);
  }
  const order = (a: OrgBoardNode, b: OrgBoardNode) => asNum(a.raw.order) - asNum(b.raw.order) || a.label.localeCompare(b.label);
  const make = (n: OrgBoardNode, depth: number, seen: Set<string>): Tree => {
    seen.add(n.id);
    return {
      node: n,
      depth,
      units: (kids.get(n.id) ?? []).filter((c) => !seen.has(c.id)).sort(order).map((c) => make(c, depth + 1, seen)),
      people: (staff.get(n.id) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
    };
  };
  const seen = new Set<string>();
  return units.filter((u) => !parentOf.get(u.id) || !byId.has(parentOf.get(u.id)!)).sort(order).map((r) => make(r, 0, seen));
}

// Keep a unit when it, one of its people or anything below it matches.
function filterTree(trees: Tree[], needle: string): Tree[] {
  if (!needle) return trees;
  const hit = (n: OrgBoardNode) => `${n.label} ${n.subtitle} ${asStr(n.raw.employee_code)}`.toLocaleLowerCase().includes(needle);
  const out: Tree[] = [];
  for (const t of trees) {
    const units = filterTree(t.units, needle);
    const people = t.people.filter(hit);
    if (hit(t.node) || units.length || people.length) out.push({ ...t, units, people: hit(t.node) ? t.people : people });
  }
  return out;
}

const flatten = (trees: Tree[]): Tree[] => trees.flatMap((t) => [t, ...flatten(t.units)]);

export default function InternalOrgBoard({
  board,
  loading,
  onEditUnit,
  onAddUnit,
  onAddEmployee,
  onOpenEmployee,
}: {
  board: OrgBoard;
  loading: boolean;
  onEditUnit: (unitId: string) => void;
  onAddUnit: (parentId: string) => void;
  onAddEmployee: (unitId: string) => void;
  onOpenEmployee: (employeeId: string) => void;
}) {
  const t = useTranslations("internal.people");
  const tb = useTranslations("internal.people.board");
  const [query, setQuery] = useState("");
  const [showPeople, setShowPeople] = useState(true);
  const [view, setView] = useState<View>("board");
  const [selectedId, setSelectedId] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const trees = useMemo(() => buildTree(board), [board]);
  const needle = query.trim().toLocaleLowerCase();
  const shown = useMemo(() => filterTree(trees, needle), [trees, needle]);
  const selected = board.nodes.find((n) => n.id === selectedId) ?? null;
  const toggle = useCallback((id: string) => setCollapsed((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);

  return (
    <section className="org">
      <div className="org__bar">
        <div className="uf-search org__search">
          <IconSearch aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tb("search")} aria-label={tb("search")} maxLength={120} />
        </div>
        <label className="org__toggle">
          <input type="checkbox" checked={showPeople} onChange={(e) => setShowPeople(e.target.checked)} />
          <span>{tb("showPeople")}</span>
        </label>
        <div className="hrm-tabs" role="tablist" aria-label={tb("views")}>
          {(["board", "list", "stats"] as View[]).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
              {v === "board" ? <IconBuilding /> : v === "list" ? <IconList /> : <IconUsers />}
              {v === "board" ? tb("viewBoard") : v === "list" ? tb("viewList") : tb("viewStats")}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="hrm-panel"><HrmLoading rows={5} /></div> : !trees.length ? (
        <div className="hrm-panel"><HrmEmpty icon={IconBuilding} title={t("emptyUnits")} text={tb("emptyLead")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => onAddUnit("")}><IconPlus />{t("newUnit")}</button>} /></div>
      ) : view === "stats" ? (
        <OrgStats board={board} trees={trees} />
      ) : (
        <div className="org__work">
          <div className="org__main">
            {view === "board" ? (
              <BoardCanvas trees={shown} showPeople={showPeople} selectedId={selectedId} onSelect={setSelectedId} collapsed={collapsed} onToggle={toggle} needle={needle} />
            ) : (
              <OrgList trees={shown} showPeople={showPeople} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </div>
          <aside className="org__aside">
            {selected ? (
              <NodeDetail node={selected} board={board} onSelect={setSelectedId} onEditUnit={onEditUnit} onAddUnit={onAddUnit} onAddEmployee={onAddEmployee} onOpenEmployee={onOpenEmployee} />
            ) : (
              <HrmEmpty icon={IconUsers} title={tb("selectTitle")} text={tb("selectText")} />
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────

function UnitCard({ node, selected, onSelect, collapsible, collapsed, onToggle, dim }: { node: OrgBoardNode; selected: boolean; onSelect: () => void; collapsible: boolean; collapsed: boolean; onToggle: () => void; dim?: boolean }) {
  const tu = useTranslations("internal.ui");
  const tb = useTranslations("internal.people.board");
  const head = personName(node.raw.head);
  const type = asStr(node.raw.unit_type);
  const color = asStr(asDict(node.raw.meta).board_color);
  return (
    <div className={`org-card org-card--unit${selected ? " is-on" : ""}${dim ? " is-dim" : ""}`} style={color ? ({ "--org-c": color } as CSSProperties) : undefined}>
      <button type="button" className="org-card__hit" onClick={onSelect} aria-pressed={selected}>
        <span className="org-card__top">
          <span className="org-card__i"><IconBuilding /></span>
          <span className="org-card__t">
            <b>{node.label}</b>
            <small>{[node.subtitle, type && tu.has(`unitType.${type}`) ? tu(`unitType.${type}`) : ""].filter(Boolean).join(" · ")}</small>
          </span>
        </span>
        {head ? <span className="org-card__head"><HrmAvatar name={head} size="sm" /><span><small>{tb("head")}</small><b>{head}</b></span></span> : null}
        <span className="org-card__nums">
          <span title={tb("people")}><IconUsers />{node.peopleCount}</span>
          <span title={tb("positions")}><IconBriefcase />{node.positionCount}</span>
          {asNum(node.raw.children_count) ? <span title={tb("subUnits")}><IconBuilding />{asNum(node.raw.children_count)}</span> : null}
        </span>
      </button>
      {collapsible ? (
        <button type="button" className={`org-card__fold${collapsed ? " is-closed" : ""}`} onClick={onToggle} aria-label={collapsed ? tb("expand") : tb("collapse")} title={collapsed ? tb("expand") : tb("collapse")}>
          <IconChevronDown />
        </button>
      ) : null}
    </div>
  );
}

function PersonCard({ node, selected, onSelect, dim }: { node: OrgBoardNode; selected: boolean; onSelect: () => void; dim?: boolean }) {
  const code = asStr(node.raw.employee_code);
  return (
    <button type="button" className={`org-card org-card--person${selected ? " is-on" : ""}${dim ? " is-dim" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <HrmAvatar name={node.label} size="sm" />
      <span className="org-card__t">
        <b>{node.label}</b>
        <small>{node.subtitle || "—"}</small>
        {code ? <em>{code}</em> : null}
      </span>
    </button>
  );
}

function TreeView({ trees, showPeople, selectedId, onSelect, collapsed, onToggle, needle, mini }: { trees: Tree[]; showPeople: boolean; selectedId: string; onSelect: (id: string) => void; collapsed: Set<string>; onToggle: (id: string) => void; needle: string; mini?: boolean }) {
  const match = (n: OrgBoardNode) => !needle || `${n.label} ${n.subtitle} ${asStr(n.raw.employee_code)}`.toLocaleLowerCase().includes(needle);
  const render = (tree: Tree): ReactNode => {
    const closed = collapsed.has(tree.node.id);
    const people = showPeople && !closed ? tree.people : [];
    const units = closed ? [] : tree.units;
    return (
      <li key={tree.node.id}>
        {mini ? <span className="org-mini org-mini--unit" /> : (
          <UnitCard node={tree.node} selected={selectedId === tree.node.id} onSelect={() => onSelect(tree.node.id)} collapsible={tree.units.length + tree.people.length > 0} collapsed={closed} onToggle={() => onToggle(tree.node.id)} dim={!!needle && !match(tree.node)} />
        )}
        {people.length ? (
          <div className="org-people">
            {people.map((p) => mini ? <span key={p.id} className="org-mini org-mini--person" /> : <PersonCard key={p.id} node={p} selected={selectedId === p.id} onSelect={() => onSelect(p.id)} dim={!!needle && !match(p)} />)}
          </div>
        ) : null}
        {units.length ? <ul>{units.map(render)}</ul> : null}
      </li>
    );
  };
  return <ul className={`org-tree${mini ? " org-tree--mini" : ""}`}>{trees.map(render)}</ul>;
}

// ── Board canvas: zoom, pan, minimap ───────────────────────────────────────

function BoardCanvas(props: { trees: Tree[]; showPeople: boolean; selectedId: string; onSelect: (id: string) => void; collapsed: Set<string>; onToggle: (id: string) => void; needle: string }) {
  const tb = useTranslations("internal.people.board");
  const canvas = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ w: 0, h: 0, x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [fitted, setFitted] = useState(false);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  useLayoutEffect(() => {
    const el = inner.current;
    const box = canvas.current;
    if (!el || !box) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.offsetWidth, h: el.offsetHeight });
      setView((v) => ({ ...v, w: box.clientWidth, h: box.clientHeight }));
    });
    ro.observe(el);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // The first time the chart has a size, scale it to fit the canvas width —
  // a wide company should open whole, not cropped to its left corner.
  useEffect(() => {
    if (fitted || !size.w || !view.w) return;
    const h = setTimeout(() => {
      // …but never so small the cards can't be read: past that, scroll —
      // starting from the middle, where the top of the company sits.
      const z = Math.max(0.75, Math.min(1, (view.w - 32) / size.w));
      setZoom(z);
      setFitted(true);
      requestAnimationFrame(() => {
        const box = canvas.current;
        if (box) box.scrollLeft = Math.max(0, (size.w * z - box.clientWidth) / 2);
      });
    }, 0);
    return () => clearTimeout(h);
  }, [fitted, size.w, view.w]);

  const onScroll = () => {
    const box = canvas.current;
    if (box) setView({ w: box.clientWidth, h: box.clientHeight, x: box.scrollLeft, y: box.scrollTop });
  };

  // Drag the empty canvas to pan, like any board; cards keep their clicks.
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button") || e.button !== 0) return;
    const box = canvas.current;
    if (!box) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: box.scrollLeft, st: box.scrollTop };
    box.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const box = canvas.current;
    if (!d || !box) return;
    box.scrollLeft = d.sl - (e.clientX - d.x);
    box.scrollTop = d.st - (e.clientY - d.y);
  };
  const onUp = () => { drag.current = null; };

  const fit = () => setZoom(Math.max(ZOOM_MIN, Math.min(1, (view.w - 32) / Math.max(1, size.w), (view.h - 32) / Math.max(1, size.h))));
  const step = (d: number) => setZoom((z) => Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + d)) * 100) / 100);

  // Minimap: the same tree, drawn as blocks, scaled into a fixed box, with the
  // visible part of the canvas outlined. Click or drag in it to move there.
  const MM_W = 200;
  const MM_H = 120;
  const sw = size.w * zoom;
  const sh = size.h * zoom;
  const k = size.w && size.h ? Math.min(MM_W / size.w, MM_H / size.h) : 0;
  const rect = sw && sh ? {
    left: (view.x / sw) * size.w * k,
    top: (view.y / sh) * size.h * k,
    width: Math.min(1, view.w / sw) * size.w * k,
    height: Math.min(1, view.h / sh) * size.h * k,
  } : null;
  const jump = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = canvas.current;
    if (!box || !k) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / (size.w * k);
    const fy = (e.clientY - r.top) / (size.h * k);
    box.scrollLeft = fx * sw - view.w / 2;
    box.scrollTop = fy * sh - view.h / 2;
  };

  return (
    <div className="org-board">
      <div className="org-zoom" role="group" aria-label={tb("zoom")}>
        <button type="button" onClick={() => step(-0.1)} disabled={zoom <= ZOOM_MIN} aria-label={tb("zoomOut")} title={tb("zoomOut")}><IconMinus /></button>
        <output>{Math.round(zoom * 100)}%</output>
        <button type="button" onClick={() => step(0.1)} disabled={zoom >= ZOOM_MAX} aria-label={tb("zoomIn")} title={tb("zoomIn")}><IconPlus /></button>
        <button type="button" onClick={fit} aria-label={tb("fit")} title={tb("fit")}><IconExpand /></button>
      </div>
      <div className="org-canvas" ref={canvas} onScroll={onScroll} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="org-canvas__frame" style={{ width: sw || undefined, height: sh || undefined }}>
          <div className="org-canvas__inner" ref={inner} style={{ transform: `scale(${zoom})` }}>
            {props.trees.length ? <TreeView {...props} /> : <p className="hrm-muted">{tb("noMatch")}</p>}
          </div>
        </div>
      </div>
      {k ? (
        <div className="org-minimap" aria-label={tb("minimap")} role="img" onPointerDown={jump} style={{ width: size.w * k + 12, height: size.h * k + 12 }}>
          <div className="org-minimap__in" style={{ width: size.w, transform: `scale(${k})` }} aria-hidden>
            <TreeView {...props} mini />
          </div>
          {rect ? <span className="org-minimap__view" style={{ left: rect.left + 6, top: rect.top + 6, width: rect.width, height: rect.height }} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// ── List view ──────────────────────────────────────────────────────────────

function OrgList({ trees, showPeople, selectedId, onSelect }: { trees: Tree[]; showPeople: boolean; selectedId: string; onSelect: (id: string) => void }) {
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
      {!rows.length ? <p className="hrm-muted" style={{ padding: 16 }}>{t("emptyUnits")}</p> : null}
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
  const [detail, setDetail] = useState<{ id: string; data: Record<string, unknown> } | null>(null);
  const unitId = node.type !== "employee" ? node.entityId : "";

  // Department detail: GET /internal/org/units/{unit_id} (§10).
  useEffect(() => {
    if (!unitId) return;
    const c = new AbortController();
    getOrgUnitDetail(unitId, c.signal).then((d) => setDetail({ id: unitId, data: asDict(d) })).catch(() => {});
    return () => c.abort();
  }, [unitId]);

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
            { label: t("employmentType"), value: asStr(a.employment_type) ? t(`types.${asStr(a.employment_type)}`) : "—" },
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

  const d = detail?.id === unitId ? detail.data : null;
  const people = d ? asArr(d.people).map((p) => ({ employee: normEmployee(asDict(p).employee), assignment: asDict(asDict(p).assignment) })) : [];
  const children = d ? asArr(d.children).map((c) => asDict(c)) : [];
  const stats = d ? asDict(d.stats) : {};
  const head = personName(node.raw.head);
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
      {head ? <HrmSection label={tb("head")}><HrmPerson name={head} sub={asStr(asDict(node.raw.head).employee_code)} /></HrmSection> : null}
      <HrmSection label={tb("peopleIn")} aside={<span className="hrm-count">{people.length}</span>}>
        {!d ? <HrmLoading rows={2} /> : people.length ? (
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
