"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getHeadcount, getOrgTree, type OrgTreeNode } from "@/lib/services/hrmOps";
import DatePicker from "@/components/DatePicker";
import { HrmError, HrmLoading, HrmPanel, HrmStat, useHrmFormat } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { IconBuilding, IconChevronRight, IconLayers, IconUser, IconUsers } from "@/components/icons";
import { todayIso, useOps } from "./useOps";

// The organization as a tree on a chosen day (GET /internal/org/tree):
// units in their order with the people filling them, and the headcount —
// planned, occupied and vacant FTE — of the whole company or of the unit
// picked. The board stays the place to edit; this view is for reading and
// for looking back.
export function OrgTreePanel() {
  const t = useTranslations("internal.ops.tree");
  const f = useHrmFormat();
  const [asOf, setAsOf] = useState(todayIso());
  const [unit, setUnit] = useState<{ id: string; name: string } | null>(null);
  const tree = useOps((s) => getOrgTree(asOf, s), [asOf], ["org", "unit", "assignment", "employee"]);
  const head = useOps((s) => getHeadcount({ unitId: unit?.id, asOf }, s), [asOf, unit?.id], ["org", "unit", "assignment"]);
  const h = head.data;
  return (
    <div className="ops-tree-page">
      <div className="ops-bar">
        <span className="ops-bar__l">{t("asOf")}</span>
        <div className="ops-bar__m"><DatePicker value={asOf} onChange={(v) => setAsOf(v || todayIso())} placeholder={t("asOf")} ariaLabel={t("asOf")} max={todayIso()} /></div>
        {unit ? <button type="button" className="btn btn--line btn--sm" onClick={() => setUnit(null)}>{t("wholeCompany")}</button> : null}
      </div>
      <div className="hrm-stats">
        <HrmStat icon={IconLayers} tone="blue" label={t("planned")} value={h ? f.num(h.planned) : "…"} hint={unit ? unit.name : t("wholeCompany")} />
        <HrmStat icon={IconUsers} tone="ok" label={t("occupied")} value={h ? f.num(h.occupied) : "…"} />
        <HrmStat icon={IconBuilding} tone="warn" label={t("vacant")} value={h ? f.num(h.vacant) : "…"} />
        <HrmStat icon={IconUser} tone="violet" label={t("people")} value={h ? h.employees : "…"} />
      </div>
      <HrmPanel title={t("title")} icon={IconBuilding} count={tree.data ? t("summary", { units: tree.data.units, people: tree.data.employees }) : undefined}>
        {tree.error ? <HrmError text={t("error")} onRetry={tree.reload} retryLabel={t("retry")} /> : !tree.data ? <HrmLoading rows={5} /> : !tree.data.items.length ? <p className="hrm-muted">{t("empty")}</p> : (
          <ul className="ops-tree" role="tree" aria-label={t("title")}>
            {tree.data.items.map((n) => <TreeNode key={n.id} node={n} depth={0} picked={unit?.id ?? ""} onPick={setUnit} />)}
          </ul>
        )}
      </HrmPanel>
    </div>
  );
}

function TreeNode({ node, depth, picked, onPick }: { node: OrgTreeNode; depth: number; picked: string; onPick: (u: { id: string; name: string }) => void }) {
  const t = useTranslations("internal.ops.tree");
  const tu = useTranslations("internal.ui");
  const dir = useHrmDirectory();
  const [open, setOpen] = useState(depth < 2);
  // A branch once opened stays rendered, so closing it can animate.
  const [seen, setSeen] = useState(open);
  const total = (n: OrgTreeNode): number => n.occupied + n.children.reduce((s, c) => s + total(c), 0);
  const head = dir.employeeName(node.headId);
  return (
    <li role="treeitem" aria-expanded={node.children.length ? open : undefined} aria-selected={picked === node.id}>
      <div className={`ops-tree__row${picked === node.id ? " on" : ""}`} style={{ paddingLeft: depth * 18 }}>
        {node.children.length ? (
          <button type="button" className={`ops-tree__tg${open ? " is-open" : ""}`} onClick={() => {
              setSeen(true);
              setOpen((o) => !o);
            }} aria-label={open ? t("collapse") : t("expand")}><IconChevronRight /></button>
        ) : <span className="ops-tree__tg" aria-hidden />}
        <button type="button" className="ops-tree__name" onClick={() => onPick({ id: node.id, name: node.name })}>
          <b>{node.name}</b>
          <small>{[node.code, tu.has(`unitType.${node.type}`) ? tu(`unitType.${node.type}`) : node.type, head ? t("head", { name: head }) : ""].filter(Boolean).join(" · ")}</small>
        </button>
        <span className="ops-tree__n" title={t("occupiedHint")}>
          <b>{node.occupied}</b>
          {node.children.length ? <small>/ {total(node)}</small> : null}
        </span>
      </div>
      {node.children.length && seen ? (
        <div className={`ops-tree__kids${open ? " is-open" : ""}`} inert={!open}>
          <ul role="group">
            {node.children.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} picked={picked} onPick={onPick} />)}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
