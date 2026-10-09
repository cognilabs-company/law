"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { asStr } from "@/lib/http";
import { getOrgUnitDetail, normOrgBoard, type InternalRecord, type OrgBoardNode } from "@/lib/services/internalHrm";
import { IconBuilding, IconList, IconMinus, IconPlus, IconRefresh, IconSearch, IconUsers } from "@/components/icons";

type View = "board" | "list" | "stats";

export default function InternalOrgBoard({ raw, loading, onEditUnit }: { raw: InternalRecord | null; loading: boolean; onEditUnit: (node: InternalRecord) => void }) {
  const t = useTranslations("internal.people");
  const board = useMemo(() => normOrgBoard(raw ?? {}), [raw]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [view, setView] = useState<View>("board");
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<InternalRecord | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return board.nodes.filter((node) => (!type || node.type === type) && (!needle || `${node.label} ${node.subtitle}`.toLocaleLowerCase().includes(needle)));
  }, [board.nodes, query, type]);
  const selected = board.nodes.find((node) => node.id === selectedId) ?? null;
  const columns = useMemo(() => {
    const groups = new Map<number, OrgBoardNode[]>();
    for (const node of visible) groups.set(node.level, [...(groups.get(node.level) ?? []), node]);
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

  useEffect(() => {
    if (!selected || selected.type !== "department" || !selected.entityId) return;
    const controller = new AbortController();
    getOrgUnitDetail(selected.entityId, controller.signal).then((value) => setDetail(value)).catch(() => setDetail(null));
    return () => controller.abort();
  }, [selected]);

  function choose(node: OrgBoardNode) {
    setSelectedId(node.id);
    if (node.type !== "department") setDetail(node.raw);
  }

  return (
    <section className="internal-org">
      <div className="internal-panel internal-org__toolbar">
        <div className="internal-search"><IconSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("board.search")} maxLength={120} /></div>
        <select value={type} onChange={(event) => setType(event.target.value)} aria-label={t("board.type")}><option value="">{t("board.allTypes")}</option><option value="department">{t("board.department")}</option><option value="employee">{t("board.employee")}</option></select>
        <div className="internal-org__tabs" role="tablist" aria-label={t("board.views")}>
          {(["board", "list", "stats"] as View[]).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} className={view === item ? "is-on" : ""} onClick={() => setView(item)}>{item === "board" ? t("board.viewBoard") : item === "list" ? t("board.viewList") : t("board.viewStats")}</button>)}
        </div>
        {view === "board" ? <div className="internal-org__zoom"><button type="button" onClick={() => setZoom((value) => Math.max(.72, value - .1))} aria-label={t("board.zoomOut")}><IconMinus /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(1.35, value + .1))} aria-label={t("board.zoomIn")}><IconPlus /></button><button type="button" onClick={() => setZoom(1)} aria-label={t("board.zoomReset")}><IconRefresh /></button></div> : null}
      </div>
      {loading ? <div className="internal-panel internal-loading" aria-busy="true" /> : view === "stats" ? <Stats board={board.stats} count={board.nodes.length} t={t} /> : (
        <div className="internal-org__workspace">
          <div className="internal-panel internal-org__main">
            <div className="internal-panel__head"><div><h3>{t("organizationBoard")}</h3><small>{t("board.nodesCount", { n: visible.length })}</small></div><IconBuilding /></div>
            {view === "list" ? <div className="internal-org__list">{visible.map((node) => <NodeCard key={node.id} node={node} active={selectedId === node.id} onClick={() => choose(node)} t={t} />)}</div> : <div className="internal-org__canvas" style={{ "--org-zoom": zoom } as React.CSSProperties}>{columns.length ? columns.map(([level, nodes]) => <div className="internal-org__column" key={level}>{nodes.map((node) => <NodeCard key={node.id} node={node} active={selectedId === node.id} onClick={() => choose(node)} t={t} />)}</div>) : <p className="internal-empty">{t("emptyUnits")}</p>}</div>}
            {view === "board" ? <div className="internal-org__minimap" aria-label={t("board.minimap")}><span style={{ width: `${Math.min(100, Math.max(18, columns.length * 22))}%` }} /></div> : null}
          </div>
          <aside className="internal-panel internal-org__detail">
            {selected ? <><div className="internal-panel__head"><div><small>{selected.type === "employee" ? t("board.employee") : t("board.department")}</small><h3>{selected.label}</h3></div>{selected.type === "department" ? <button className="internal-link-button" type="button" onClick={() => onEditUnit(selected.raw)} aria-label={t("editUnit")}><IconBuilding /></button> : null}</div><div className="internal-org__facts"><div><span>{t("board.code")}</span><b>{selected.subtitle || "—"}</b></div><div><span>{t("peopleInBoard")}</span><b>{selected.peopleCount}</b></div><div><span>{t("positions")}</span><b>{selected.positionCount}</b></div></div>{detail ? <div className="internal-org__detailtext"><span>{t("board.detailLoaded")}</span><b>{asStr(detail.name ?? detail.title ?? detail.unit_name ?? selected.label)}</b><small>{asStr(detail.description ?? detail.status) || t("board.noDetail")}</small></div> : <p className="internal-empty">{t("board.detailLoading")}</p>}</> : <div className="internal-org__select"><IconUsers /><b>{t("board.selectTitle")}</b><p>{t("board.selectText")}</p></div>}
          </aside>
        </div>
      )}
    </section>
  );
}

function NodeCard({ node, active, onClick, t }: { node: OrgBoardNode; active: boolean; onClick: () => void; t: (key: string, values?: Record<string, string | number>) => string }) {
  return <button type="button" className={`internal-org-node${active ? " is-on" : ""}${node.type === "employee" ? " is-person" : ""}`} onClick={onClick}><span className="internal-org-node__icon">{node.type === "employee" ? <IconUsers /> : <IconBuilding />}</span><span><b>{node.label}</b><small>{node.subtitle || (node.type === "employee" ? t("board.employee") : t("board.department"))}</small></span><em>{node.peopleCount || node.positionCount || 0}</em></button>;
}

function Stats({ board, count, t }: { board: InternalRecord; count: number; t: (key: string) => string }) {
  return <div className="internal-org__stats"><div className="internal-panel"><IconBuilding /><b>{asStr(board.departments ?? board.units, String(count))}</b><span>{t("unitsInBoard")}</span></div><div className="internal-panel"><IconUsers /><b>{asStr(board.people ?? board.employees, "0")}</b><span>{t("peopleInBoard")}</span></div><div className="internal-panel"><IconList /><b>{asStr(board.positions, "0")}</b><span>{t("positions")}</span></div></div>;
}
