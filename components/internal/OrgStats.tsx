"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { asDict, asNum, asStr } from "@/lib/http";
import { personName } from "@/lib/services/internalHrm";
import { IconAlert, IconBriefcase, IconBuilding, IconChartBar, IconChevronDown, IconClose, IconDownload, IconLayers, IconSearch, IconSliders, IconTarget, IconUser, IconUsers } from "@/components/icons";
import { HrmAvatar, HrmEmpty, HrmStat } from "@/components/internal/HrmUi";
import { HrmBars, HrmDonut } from "@/components/internal/HrmCharts";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import Select from "@/components/Select";
import { UNIT_TYPES } from "./OrgUnitCreate";
import { flatten, positionIdOf, subtreeOf, type Tree } from "./orgTree";

// MedControl HR's org statistics, from what the board already holds: the
// key numbers, three charts, and the same numbers as tables — structure,
// positions, heads, people and what needs fixing — under one set of filters.

type Tab = "structure" | "positions" | "heads" | "people" | "issues";
type HeadF = "" | "with" | "without";
type UnitRow = { id: string; name: string; code: string; type: string; depth: number; parent: string; headId: string; headName: string; direct: number; total: number; fte: number; kids: number };
type PersonRow = { id: string; name: string; code: string; unitId: string; unit: string; positionId: string; position: string; category: string; grade: string; employment: string; rate: number; head: boolean };
type PositionRow = { id: string; title: string; category: string; grade: string; people: number; units: number; fte: number };
type Issue = "noHead" | "empty" | "noPosition" | "headOutside";
type Sort = { key: string; desc: boolean };

const ISSUES: Issue[] = ["noHead", "empty", "headOutside", "noPosition"];
const rateOf = (raw: Record<string, unknown>) => (asNum(asDict(raw.assignment).rate, 100) || 100) / 100;
const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US").replace(",", " ");

function sorted<T>(rows: T[], sort: Sort | null, get: Record<string, (r: T) => string | number>): T[] {
  const f = sort ? get[sort.key] : null;
  if (!sort || !f) return rows;
  return [...rows].sort((a, b) => {
    const x = f(a);
    const y = f(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return sort.desc ? -c : c;
  });
}

export default function OrgStats({ trees, onOpenEmployee, onEditUnit }: { trees: Tree[]; onOpenEmployee: (id: string) => void; onEditUnit: (id: string) => void }) {
  const t = useTranslations("internal.people.orgStats");
  const tp = useTranslations("internal.people");
  const tu = useTranslations("internal.ui");
  const dir = useHrmDirectory();
  const [tab, setTab] = useState<Tab>("structure");
  const [q, setQ] = useState("");
  const [root, setRoot] = useState("");
  const [more, setMore] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  const [head, setHead] = useState<HeadF>("");
  const [position, setPosition] = useState("");
  const [sort, setSort] = useState<Sort | null>(null);
  // null: the first group that has anything in it.
  const [openIssue, setOpenIssue] = useState<Issue | "" | null>(null);

  const typeName = (x: string) => (tu.has(`unitType.${x}`) ? tu(`unitType.${x}`) : x || "—");
  const catName = (x: string) => (x ? (tp.has(`categories.${x}`) ? tp(`categories.${x}`) : x) : "—");
  const empName = (x: string) => (x ? (tp.has(`types.${x}`) ? tp(`types.${x}`) : x) : "—");

  const all = useMemo(() => flatten(trees), [trees]);
  const depthMax = all.reduce((n, u) => Math.max(n, u.depth), 0);
  const unitOpts = useMemo(() => [{ value: "", label: t("wholeOrg") }, ...all.map((u) => ({ value: u.node.id, label: `${" ".repeat(u.depth * 3)}${u.node.label}` }))], [all, t]);

  const data = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    const scope = flatten(root ? subtreeOf(trees, root) : trees);
    const base = scope.length ? scope[0].depth : 0;
    const totals = new Map<string, { people: number; fte: number; ids: Set<string> }>();
    const count = (x: Tree): { people: number; fte: number; ids: Set<string> } => {
      const ids = new Set(x.people.map((p) => p.entityId));
      let fte = x.people.reduce((n, p) => n + rateOf(p.raw), 0);
      for (const c of x.units) {
        const s = count(c);
        s.ids.forEach((i) => ids.add(i));
        fte += s.fte;
      }
      const out = { people: ids.size, fte, ids };
      totals.set(x.node.id, out);
      return out;
    };
    (root ? subtreeOf(trees, root) : trees).forEach(count);
    const parentName = new Map<string, string>();
    for (const u of all) for (const c of u.units) parentName.set(c.node.id, u.node.label);

    const unitOk = (u: Tree) => {
      const ty = asStr(u.node.raw.unit_type) || "department";
      const hasHead = !!asStr(asDict(u.node.raw.head).id);
      return (!types.length || types.includes(ty)) && (!levels.length || levels.includes(u.depth - base)) && (!head || (head === "with") === hasHead);
    };
    const units: UnitRow[] = scope.filter(unitOk).map((u) => ({
      id: u.node.id,
      name: u.node.label,
      code: u.node.subtitle,
      type: asStr(u.node.raw.unit_type) || "department",
      depth: u.depth - base,
      parent: parentName.get(u.node.id) ?? "",
      headId: asStr(asDict(u.node.raw.head).id),
      headName: personName(u.node.raw.head),
      direct: u.people.length,
      total: totals.get(u.node.id)?.people ?? 0,
      fte: u.people.reduce((n, p) => n + rateOf(p.raw), 0),
      kids: u.units.length,
    }));
    const shownUnits = new Set(units.map((u) => u.id));
    const heads = new Set(units.map((u) => u.headId).filter(Boolean));
    const people: PersonRow[] = scope
      .filter((u) => shownUnits.has(u.node.id))
      .flatMap((u) =>
        u.people.map((p) => {
          const pos = asDict(p.raw.position);
          return {
            id: p.entityId,
            name: p.label,
            code: asStr(p.raw.employee_code),
            unitId: u.node.id,
            unit: u.node.label,
            positionId: positionIdOf(p),
            position: asStr(pos.title) || p.subtitle,
            category: asStr(pos.category),
            grade: asStr(pos.grade),
            employment: asStr(asDict(p.raw.assignment).employment_type),
            rate: rateOf(p.raw),
            head: heads.has(p.entityId),
          };
        }),
      )
      .filter((p) => !position || p.positionId === position);

    const match = (s: string) => !needle || s.toLocaleLowerCase().includes(needle);
    const unitsQ = units.filter((u) => match(`${u.name} ${u.code} ${u.headName}`));
    const peopleQ = people.filter((p) => match(`${p.name} ${p.code} ${p.position} ${p.unit}`));

    const byPos = new Map<string, PositionRow & { unitIds: Set<string> }>();
    for (const p of people) {
      if (!p.positionId) continue;
      const r = byPos.get(p.positionId) ?? { id: p.positionId, title: p.position, category: p.category, grade: p.grade, people: 0, units: 0, fte: 0, unitIds: new Set<string>() };
      r.people += 1;
      r.fte += p.rate;
      r.unitIds.add(p.unitId);
      r.units = r.unitIds.size;
      byPos.set(p.positionId, r);
    }
    const positions = [...byPos.values()].filter((r) => match(`${r.title} ${r.category} ${r.grade}`));

    const issues: Record<Issue, { id: string; name: string; sub: string; person?: boolean }[]> = {
      noHead: units.filter((u) => !u.headId).map((u) => ({ id: u.id, name: u.name, sub: typeName(u.type) })),
      empty: units.filter((u) => !u.total).map((u) => ({ id: u.id, name: u.name, sub: u.parent || typeName(u.type) })),
      headOutside: units.filter((u) => u.headId && !totals.get(u.id)?.ids.has(u.headId)).map((u) => ({ id: u.id, name: u.name, sub: t("headOutsideSub", { name: u.headName }) })),
      noPosition: people.filter((p) => !p.positionId).map((p) => ({ id: p.id, name: p.name, sub: p.unit, person: true })),
    };

    const distinct = new Set(people.map((p) => p.id));
    const fte = people.reduce((n, p) => n + p.rate, 0);
    const headed = units.filter((u) => u.headId).length;
    const byType = UNIT_TYPES.map((ty) => ({ type: ty, units: units.filter((u) => u.type === ty).length, people: people.filter((p) => units.find((u) => u.id === p.unitId)?.type === ty).length })).filter((r) => r.units);
    const byLevel = Array.from({ length: Math.max(0, ...units.map((u) => u.depth + 1)) }, (_, d) => ({ depth: d, units: units.filter((u) => u.depth === d).length, people: people.filter((p) => units.find((u) => u.id === p.unitId)?.depth === d).length })).filter((l) => l.units);
    const biggest = [...units].sort((a, b) => b.direct - a.direct)[0];
    return { units, unitsQ, people, peopleQ, positions, issues, distinct: distinct.size, fte, headed, byType, byLevel, biggest };
    // typeName only reads translations, which do not change under the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trees, all, root, types, levels, head, position, q]);

  const issueTotal = ISSUES.reduce((n, k) => n + data.issues[k].length, 0);
  const levelName = (d: number) => t("level", { n: d + 1 });
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (root) chips.push({ key: "root", label: `${t("f.subtree")}: ${all.find((u) => u.node.id === root)?.node.label ?? ""}`, clear: () => setRoot("") });
  for (const ty of types) chips.push({ key: `t-${ty}`, label: typeName(ty), clear: () => setTypes((c) => c.filter((x) => x !== ty)) });
  for (const l of levels) chips.push({ key: `l-${l}`, label: levelName(l), clear: () => setLevels((c) => c.filter((x) => x !== l)) });
  if (head) chips.push({ key: "head", label: t(`head.${head}`), clear: () => setHead("") });
  if (position) chips.push({ key: "pos", label: `${t("f.position")}: ${data.positions.find((p) => p.id === position)?.title || dir.positionTitle(position)}`, clear: () => setPosition("") });
  const clearAll = () => {
    setRoot("");
    setTypes([]);
    setLevels([]);
    setHead("");
    setPosition("");
    setQ("");
  };
  const toggle = <T,>(set: (fn: (c: T[]) => T[]) => void, v: T) => set((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));
  const pickTab = (v: Tab) => {
    setTab(v);
    setSort(null);
  };

  const th = (key: string, label: ReactNode, num = false) => {
    const on = sort?.key === key;
    return (
      <th className={num ? "hrm-num" : undefined} aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"}>
        <button type="button" className={`ost-sort${on ? " is-on" : ""}${on && sort.desc ? " is-desc" : ""}`} onClick={() => setSort(on ? (sort.desc ? null : { key, desc: true }) : { key, desc: false })}>
          {label}
          <IconChevronDown aria-hidden />
        </button>
      </th>
    );
  };

  const exportCsv = () => {
    const rows: (string | number)[][] =
      tab === "structure" || tab === "heads"
        ? [[t("col.unit"), t("col.code"), t("col.type"), t("col.level"), t("col.parent"), t("col.head"), t("col.direct"), t("col.total"), t("col.fte")], ...data.unitsQ.map((u) => [u.name, u.code, typeName(u.type), u.depth + 1, u.parent, u.headName, u.direct, u.total, one(u.fte)])]
        : tab === "positions"
          ? [[t("col.position"), t("col.category"), t("col.grade"), t("col.people"), t("col.units"), t("col.fte")], ...data.positions.map((p) => [p.title, catName(p.category), p.grade, p.people, p.units, one(p.fte)])]
          : tab === "people"
            ? [[t("col.person"), t("col.code"), t("col.unit"), t("col.position"), t("col.employment"), t("col.rate")], ...data.peopleQ.map((p) => [p.name, p.code, p.unit, p.position, empName(p.employment), `${Math.round(p.rate * 100)}%`])]
            : [[t("col.issue"), t("col.name"), t("col.note")], ...ISSUES.flatMap((k) => data.issues[k].map((i) => [t(`issue.${k}`), i.name, i.sub]))];
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `org-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const unitCell = (u: UnitRow) => (
    <span className="ost-unit" style={{ paddingLeft: Math.min(u.depth, 6) * 14 }}>
      <i style={{ background: `var(--ost-${u.type}, #64748B)` }} aria-hidden />
      <span><b>{u.name}</b><small>{u.code}</small></span>
    </span>
  );
  const typeTag = (ty: string) => <span className="ost-type" style={{ "--c": `var(--ost-${ty}, #64748B)` } as CSSProperties}>{typeName(ty)}</span>;
  const fill = (n: number, of: number) => (
    <span className="ost-fill" title={`${n}/${of}`}>
      <span><i style={{ width: `${of ? (n / of) * 100 : 0}%` }} /></span>
      <small>{of ? Math.round((n / of) * 100) : 0}%</small>
    </span>
  );
  const rowKeys = (open: () => void) => ({ tabIndex: 0, onClick: open, onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter") open(); } });

  const tabs: { id: Tab; icon: typeof IconBuilding; n: number }[] = [
    { id: "structure", icon: IconLayers, n: data.units.length },
    { id: "positions", icon: IconBriefcase, n: data.positions.length },
    { id: "heads", icon: IconUser, n: data.headed },
    { id: "people", icon: IconUsers, n: data.distinct },
    { id: "issues", icon: IconAlert, n: issueTotal },
  ];
  const maxType = Math.max(1, ...data.byType.map((r) => r.units));
  const headRows = data.unitsQ;

  return (
    <div className="ost">
      <div className="ost-bar">
        <div className="uf-search ost-bar__q">
          <IconSearch aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} maxLength={120} />
        </div>
        <div className="ost-bar__sel">
          <Select value={root} onChange={setRoot} options={unitOpts} ariaLabel={t("f.subtree")} />
        </div>
        <button type="button" className={`btn btn--line btn--sm${more ? " is-on" : ""}`} aria-expanded={more} aria-controls="ost-more" onClick={() => setMore((v) => !v)}>
          <IconSliders />
          {t("moreFilters")}
          {types.length + levels.length + (head ? 1 : 0) ? <b className="ost-badge">{types.length + levels.length + (head ? 1 : 0)}</b> : null}
        </button>
        <button type="button" className="btn btn--line btn--sm ost-bar__x" onClick={exportCsv}>
          <IconDownload />
          {t("export")}
        </button>
      </div>

      {more ? (
        <div className="ost-more" id="ost-more">
          <div className="ost-more__g" role="group" aria-label={t("f.types")}>
            <span>{t("f.types")}</span>
            {UNIT_TYPES.map((ty) => (
              <button key={ty} type="button" className={`ost-chipbtn${types.includes(ty) ? " is-on" : ""}`} aria-pressed={types.includes(ty)} style={{ "--c": `var(--ost-${ty})` } as CSSProperties} onClick={() => toggle(setTypes, ty)}>
                <i aria-hidden />
                {typeName(ty)}
              </button>
            ))}
          </div>
          <div className="ost-more__g" role="group" aria-label={t("f.head")}>
            <span>{t("f.head")}</span>
            {(["", "with", "without"] as HeadF[]).map((h) => (
              <button key={h || "all"} type="button" className={`ost-chipbtn${head === h ? " is-on" : ""}`} aria-pressed={head === h} onClick={() => setHead(h)}>
                {t(`head.${h || "all"}`)}
              </button>
            ))}
          </div>
          <div className="ost-more__g" role="group" aria-label={t("f.level")}>
            <span>{t("f.level")}</span>
            {Array.from({ length: depthMax + 1 }, (_, d) => (
              <button key={d} type="button" className={`ost-chipbtn${levels.includes(d) ? " is-on" : ""}`} aria-pressed={levels.includes(d)} onClick={() => toggle(setLevels, d)}>
                {levelName(d)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {chips.length ? (
        <div className="ost-chips" role="group" aria-label={t("activeFilters")}>
          {chips.map((c) => (
            <span key={c.key} className="ost-chip">
              {c.label}
              <button type="button" onClick={c.clear} aria-label={`${t("removeFilter")}: ${c.label}`}><IconClose /></button>
            </span>
          ))}
          <button type="button" className="ost-clear" onClick={clearAll}>{t("clearFilters")}</button>
        </div>
      ) : null}

      <div className="hrm-stats ost-kpis">
        <HrmStat icon={IconBuilding} tone="blue" label={t("kpi.units")} value={data.units.length} hint={t("kpi.unitsHint", { types: data.byType.length, levels: data.byLevel.length })} />
        <HrmStat icon={IconUsers} tone="ok" label={t("kpi.people")} value={data.distinct} hint={t("kpi.peopleHint", { n: data.issues.noPosition.length })} />
        <HrmStat icon={IconChartBar} tone="cyan" label={t("kpi.fte")} value={one(data.fte)} hint={t("kpi.fteHint", { pct: data.people.length ? Math.round((data.fte / data.people.length) * 100) : 0 })} />
        <HrmStat icon={IconUser} tone="violet" label={t("kpi.heads")} value={`${data.headed}/${data.units.length}`} hint={t("kpi.headsHint", { n: data.units.length - data.headed })} onClick={() => pickTab("heads")} active={tab === "heads"} />
        <HrmStat icon={IconBriefcase} tone="blue" label={t("kpi.positions")} value={data.positions.length} hint={t("kpi.positionsHint", { n: dir.positions.length })} onClick={() => pickTab("positions")} active={tab === "positions"} />
        <HrmStat icon={IconTarget} tone="cyan" label={t("kpi.avg")} value={data.units.length ? one(data.distinct / data.units.length) : 0} hint={data.biggest?.direct ? t("kpi.avgHint", { name: data.biggest.name, n: data.biggest.direct }) : undefined} />
        <HrmStat icon={IconLayers} tone="warn" label={t("kpi.empty")} value={data.issues.empty.length} hint={t("kpi.emptyHint")} />
        <HrmStat icon={IconAlert} tone={issueTotal ? "err" : "ok"} label={t("kpi.issues")} value={issueTotal} hint={t("kpi.issuesHint")} onClick={() => pickTab("issues")} active={tab === "issues"} />
      </div>

      {data.units.length ? (
        <div className="ost-charts">
          <figure className="hrm-panel ost-fig">
            <figcaption>{t("chart.heads")}</figcaption>
            <HrmDonut
              center={`${data.units.length ? Math.round((data.headed / data.units.length) * 100) : 0}%`}
              caption={t("chart.heads")}
              slices={[
                { label: t("head.with"), value: data.headed, color: "var(--ok,#16a34a)" },
                { label: t("head.without"), value: data.units.length - data.headed, color: "var(--warn,#E8A317)" },
              ]}
            />
          </figure>
          <figure className="hrm-panel ost-fig">
            <figcaption>{t("chart.byType")}</figcaption>
            <ul className="ost-hbars">
              {data.byType.map((r) => (
                <li key={r.type} title={`${typeName(r.type)}: ${t("chart.typeTip", { units: r.units, people: r.people })}`}>
                  <span className="ost-hbars__l">{typeName(r.type)}</span>
                  <span className="ost-hbars__b"><i style={{ width: `${(r.units / maxType) * 100}%`, background: `var(--ost-${r.type})` }} /></span>
                  <b>{r.units}</b>
                  <small>{t("chart.peopleN", { n: r.people })}</small>
                </li>
              ))}
            </ul>
          </figure>
          <figure className="hrm-panel ost-fig">
            <figcaption>{t("chart.byLevel")}</figcaption>
            <HrmBars data={data.byLevel.map((l) => ({ label: levelName(l.depth), value: l.people }))} />
          </figure>
        </div>
      ) : null}

      <section className="hrm-panel hrm-panel--flush ost-panel">
        <div className="hrm-tabs ost-tabs" role="tablist" aria-label={t("tabs")}>
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? "on" : ""} onClick={() => pickTab(x.id)}>
              <x.icon />
              {t(`tab.${x.id}`)}
              <span className="hrm-count">{x.n}</span>
            </button>
          ))}
        </div>

        {!data.units.length ? (
          <HrmEmpty icon={IconChartBar} title={t("noMatch")} action={chips.length || q ? <button type="button" className="btn btn--line btn--sm" onClick={clearAll}>{t("clearFilters")}</button> : undefined} />
        ) : tab === "structure" ? (
          <>
            <div className="hrm-table-wrap">
              <table className="hrm-table">
                <caption className="sr-only">{t("tab.structure")}</caption>
                <thead><tr>{th("type", t("col.type"))}{th("units", t("col.units"), true)}{th("people", t("col.people"), true)}<th>{t("col.headed")}</th></tr></thead>
                <tbody>
                  {sorted(data.byType, sort, { type: (r) => typeName(r.type), units: (r) => r.units, people: (r) => r.people }).map((r) => {
                    const of = data.units.filter((u) => u.type === r.type);
                    return (
                      <tr key={r.type} className="is-click" {...rowKeys(() => setTypes([r.type]))} title={t("filterByType")}>
                        <td>{typeTag(r.type)}</td>
                        <td className="hrm-num"><b>{r.units}</b></td>
                        <td className="hrm-num">{r.people}</td>
                        <td>{fill(of.filter((u) => u.headId).length, of.length)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h4 className="ost-sub">{t("allUnits")}</h4>
            <div className="hrm-table-wrap">
              <table className="hrm-table">
                <thead><tr>{th("name", t("col.unit"))}{th("type", t("col.type"))}{th("head", t("col.head"))}{th("direct", t("col.direct"), true)}{th("total", t("col.total"), true)}{th("fte", t("col.fte"), true)}</tr></thead>
                <tbody>
                  {sorted(data.unitsQ, sort, { name: (u) => u.name, type: (u) => typeName(u.type), head: (u) => u.headName, direct: (u) => u.direct, total: (u) => u.total, fte: (u) => u.fte }).map((u) => (
                    <tr key={u.id} className="is-click" {...rowKeys(() => onEditUnit(u.id.replace(/^unit:/, "")))}>
                      <td>{unitCell(u)}</td>
                      <td>{typeTag(u.type)}</td>
                      <td>{u.headName || <span className="hrm-muted">—</span>}</td>
                      <td className="hrm-num">{u.direct}</td>
                      <td className="hrm-num"><b>{u.total}</b></td>
                      <td className="hrm-num">{one(u.fte)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : tab === "positions" ? (
          data.positions.length ? (
            <div className="hrm-table-wrap">
              <table className="hrm-table">
                <thead><tr>{th("title", t("col.position"))}{th("category", t("col.category"))}{th("grade", t("col.grade"))}{th("people", t("col.people"), true)}{th("units", t("col.units"), true)}{th("fte", t("col.fte"), true)}</tr></thead>
                <tbody>
                  {sorted(data.positions, sort, { title: (p) => p.title, category: (p) => catName(p.category), grade: (p) => p.grade, people: (p) => p.people, units: (p) => p.units, fte: (p) => p.fte }).map((p) => (
                    <tr key={p.id} className={`is-click${position === p.id ? " is-sel" : ""}`} {...rowKeys(() => { setPosition(p.id); pickTab("people"); })} title={t("filterByPosition")}>
                      <td><b>{p.title}</b></td>
                      <td className="hrm-muted">{catName(p.category)}</td>
                      <td>{p.grade ? <span className="hrm-chip">{p.grade}</span> : "—"}</td>
                      <td className="hrm-num"><b>{p.people}</b></td>
                      <td className="hrm-num">{p.units}</td>
                      <td className="hrm-num">{one(p.fte)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <HrmEmpty icon={IconBriefcase} title={t("noPositions")} />
        ) : tab === "heads" ? (
          <>
            <div className="ost-seg" role="group" aria-label={t("f.head")}>
              {(["", "with", "without"] as HeadF[]).map((h) => (
                <button key={h || "all"} type="button" className={head === h ? "on" : ""} aria-pressed={head === h} onClick={() => setHead(h)}>{t(`head.${h || "all"}`)}</button>
              ))}
            </div>
            <div className="hrm-table-wrap">
              <table className="hrm-table">
                <thead><tr>{th("name", t("col.unit"))}{th("head", t("col.head"))}{th("total", t("col.team"), true)}<th>{t("col.note")}</th></tr></thead>
                <tbody>
                  {sorted(headRows, sort, { name: (u) => u.name, head: (u) => u.headName || "￿", total: (u) => u.total }).map((u) => (
                    <tr key={u.id} className="is-click" {...rowKeys(() => (u.headId ? onOpenEmployee(u.headId) : onEditUnit(u.id.replace(/^unit:/, ""))))}>
                      <td>{unitCell(u)}</td>
                      <td>{u.headId ? <span className="ost-person"><HrmAvatar name={u.headName} size="sm" /><b>{u.headName}</b></span> : <span className="ost-warn">{t("noHead")}</span>}</td>
                      <td className="hrm-num">{u.total}</td>
                      <td className="hrm-muted">{u.headId ? (data.issues.headOutside.some((i) => i.id === u.id) ? t("issue.headOutside") : "") : t("assignHint")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : tab === "people" ? (
          data.peopleQ.length ? (
            <div className="hrm-table-wrap">
              <table className="hrm-table">
                <thead><tr>{th("name", t("col.person"))}{th("unit", t("col.unit"))}{th("position", t("col.position"))}{th("employment", t("col.employment"))}{th("rate", t("col.rate"), true)}</tr></thead>
                <tbody>
                  {sorted(data.peopleQ, sort, { name: (p) => p.name, unit: (p) => p.unit, position: (p) => p.position, employment: (p) => empName(p.employment), rate: (p) => p.rate }).map((p) => (
                    <tr key={`${p.unitId}-${p.id}`} className="is-click" {...rowKeys(() => onOpenEmployee(p.id))}>
                      <td><span className="ost-person"><HrmAvatar name={p.name} size="sm" /><span><b>{p.name}</b><small>{p.code}{p.head ? ` · ${t("isHead")}` : ""}</small></span></span></td>
                      <td>{p.unit}</td>
                      <td>{p.position || <span className="ost-warn">{t("issue.noPosition")}</span>}</td>
                      <td className="hrm-muted">{empName(p.employment)}</td>
                      <td className="hrm-num">{Math.round(p.rate * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <HrmEmpty icon={IconUsers} title={t("noPeople")} />
        ) : issueTotal ? (
          <div className="ost-issues">
            {ISSUES.filter((k) => data.issues[k].length).map((k) => {
              const open = openIssue === null ? k === ISSUES.find((x) => data.issues[x].length) : openIssue === k;
              return (
                <section key={k} className={`ost-issue${open ? " is-open" : ""}`}>
                  <button type="button" className="ost-issue__h" aria-expanded={open} onClick={() => setOpenIssue(open ? "" : k)}>
                    <span className="ost-issue__i" aria-hidden><IconAlert /></span>
                    <span><b>{t(`issue.${k}`)}</b><small>{t(`issueHint.${k}`)}</small></span>
                    <span className="hrm-count">{data.issues[k].length}</span>
                    <IconChevronDown className="ost-issue__c" aria-hidden />
                  </button>
                  {open ? (
                    <ul>
                      {data.issues[k].map((i) => (
                        <li key={i.id}>
                          <button type="button" onClick={() => (i.person ? onOpenEmployee(i.id) : onEditUnit(i.id.replace(/^unit:/, "")))}>
                            {i.person ? <HrmAvatar name={i.name} size="sm" /> : <span className="ost-issue__u" aria-hidden><IconBuilding /></span>}
                            <span><b>{i.name}</b><small>{i.sub}</small></span>
                            <em>{i.person ? t("open360") : t("fix")}</em>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <HrmEmpty icon={IconAlert} title={t("noIssues")} text={t("noIssuesText")} />
        )}
      </section>
    </div>
  );
}
