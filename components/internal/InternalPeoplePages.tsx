"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError } from "@/lib/http";
import { getEmployees, normEmployee, type HrmEmployee } from "@/lib/services/internalHrm";
import { IconBriefcase, IconBuilding, IconCheck, IconChevronLeft, IconChevronRight, IconPlus, IconRefresh, IconUsers } from "@/components/icons";
import FilterBar from "@/components/filters/FilterBar";
import InternalOrgPage from "@/components/internal/InternalOrgPage";
import { EmployeeCreate, EMPLOYMENT_STATUSES } from "@/components/internal/EmployeeDrawers";
import { refreshHrmDirectory, useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { HrmEmpty, HrmError, HrmHead, HrmLoading, HrmPanel, HrmPerson, HrmStat, HrmStatus, useHrmFormat, useStatusLabel } from "@/components/internal/HrmUi";

type Mode = "employees" | "org";

export default function InternalPeoplePages({ mode }: { mode: Mode }) {
  return mode === "org" ? <InternalOrgPage /> : <EmployeesPage />;
}

type SortKey = "name" | "position" | "unit" | "manager" | "hire" | "status";
const SIZES = [25, 50, 100];
const SAVED_KEY = "lexgo.hrm.employees.saved";
type Saved = { name: string; q: string; status: string; unit: string };

function readSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(v) ? (v as Saved[]).filter((x) => x && typeof x.name === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function EmployeesPage() {
  return (
    <Suspense fallback={<HrmPanel><HrmLoading rows={6} /></HrmPanel>}>
      <Employees />
    </Suspense>
  );
}

// The employee list after MedControl HR's: filters, sort, page and page
// size live in the address bar, so a view can be shared and comes back on
// Back; a row opens the person's card; filters can be saved by name (in
// this browser).
function Employees() {
  const t = useTranslations("internal.people");
  const tc = useTranslations("internal.card");
  const tu = useTranslations("internal.ui");
  const label = useStatusLabel();
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const unitId = sp.get("unit") ?? "";
  const sort = (sp.get("sort") ?? "name") as SortKey;
  const desc = sp.get("dir") === "desc";
  const size = SIZES.includes(Number(sp.get("size"))) ? Number(sp.get("size")) : 25;
  const pageNo = Math.max(1, Number(sp.get("page")) || 1);
  const [search, setSearch] = useState(q);
  const [rows, setRows] = useState<{ key: string; items: HrmEmployee[]; total: number } | null>(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [tick, setTick] = useState(0);

  const set = useCallback(
    (patch: Record<string, string | number | null>, keepPage = false) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || v === undefined) next.delete(k);
        else next.set(k, String(v));
      }
      if (!keepPage) next.delete("page");
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [sp, router, pathname],
  );

  // Typing settles before the address bar (and the server) is asked.
  useEffect(() => {
    if (search.trim() === q) return;
    const h = setTimeout(() => set({ q: search.trim() }), 350);
    return () => clearTimeout(h);
  }, [search, q, set]);
  useEffect(() => {
    const h = setTimeout(() => setSaved(readSaved()), 0);
    return () => clearTimeout(h);
  }, []);

  const key = JSON.stringify({ q, status, unitId, tick });
  useEffect(() => {
    const c = new AbortController();
    getEmployees({ q: q || undefined, status: status || undefined, org_unit_id: unitId || undefined, limit: 500, offset: 0 }, c.signal)
      .then((res) => {
        if (c.signal.aborted) return;
        setError(false);
        setRows({ key, items: res.items.map(normEmployee), total: res.total });
      })
      .catch((cause) => {
        if (!(cause instanceof ApiError && cause.detail === "aborted") && !c.signal.aborted) setError(true);
      });
    return () => c.abort();
  }, [key, q, status, unitId]);
  const reload = () => {
    refreshHrmDirectory();
    setTick((n) => n + 1);
  };
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) setTick((n) => n + 1); }), []);

  const stats = useMemo(() => {
    const all = dir.employees.length ? dir.employees : rows?.items ?? [];
    return {
      total: all.length,
      active: all.filter((e) => e.status === "active").length,
      assigned: all.filter((e) => e.unitId || e.positionId).length,
      units: dir.units.length,
    };
  }, [dir.employees, dir.units.length, rows]);

  const sorted = useMemo(() => {
    const val = (e: HrmEmployee): string => {
      switch (sort) {
        case "position": return dir.positionTitle(e.positionId);
        case "unit": return dir.unitName(e.unitId);
        case "manager": return dir.employeeName(e.managerId);
        case "hire": return e.hireDate || "";
        case "status": return e.status;
        default: return e.name || e.code;
      }
    };
    const list = [...(rows?.items ?? [])].sort((a, b) => val(a).localeCompare(val(b), undefined, { numeric: true, sensitivity: "base" }));
    return desc ? list.reverse() : list;
  }, [rows, sort, desc, dir]);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(pageNo, pages);
  const shown = sorted.slice((cur - 1) * size, cur * size);
  const loading = !rows || rows.key !== key;
  const filtered = Boolean(q || status || unitId);

  const head = (k: SortKey, text: string) => (
    <th aria-sort={sort === k ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" className={`hrm-sort${sort === k ? " is-on" : ""}`} onClick={() => set({ sort: k === "name" ? null : k, dir: sort === k && !desc ? "desc" : null }, true)}>
        {text}
        <span aria-hidden>{sort === k ? (desc ? "↓" : "↑") : "↕"}</span>
      </button>
    </th>
  );
  const open = (id: string) => router.push(`/internal/employees/${encodeURIComponent(id)}`);
  const saveView = () => {
    const name = window.prompt(tc("saveViewName"), [q, status && label(status), unitId && dir.unitName(unitId)].filter(Boolean).join(" · ") || tc("myView"));
    if (!name?.trim()) return;
    const next = [{ name: name.trim().slice(0, 40), q, status, unit: unitId }, ...saved.filter((x) => x.name !== name.trim())].slice(0, 12);
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* this tab only */ }
  };
  const dropView = (name: string) => {
    const next = saved.filter((x) => x.name !== name);
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* this tab only */ }
  };

  return (
    <section className="hrm-page">
      <HrmHead
        kicker={t("kicker")}
        title={t("titles.employees")}
        lead={t("subtitles.employees")}
        actions={
          <>
            <button className="btn btn--line btn--sm" type="button" onClick={reload} disabled={loading}><IconRefresh />{t("refresh")}</button>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("newEmployee")}</button>
          </>
        }
      />
      <div className="hrm-stats">
        <HrmStat icon={IconUsers} tone="blue" label={t("stat.total")} value={stats.total} onClick={() => set({ status: null })} active={!status} />
        <HrmStat icon={IconCheck} tone="ok" label={t("stat.active")} value={stats.active} onClick={() => set({ status: "active" })} active={status === "active"} />
        <HrmStat icon={IconBriefcase} tone="violet" label={t("stat.assigned")} value={stats.assigned} />
        <HrmStat icon={IconBuilding} tone="cyan" label={t("stat.units")} value={stats.units} />
      </div>
      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: t("searchEmployees"), maxLength: 120 }}
        fields={[
          { key: "status", label: t("statusFilter"), value: status, onChange: (v) => set({ status: v }), options: [{ value: "", label: t("allStatuses") }, ...EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))], empty: "" },
          { key: "unit", label: t("unitId"), value: unitId, onChange: (v) => set({ unit: v }), options: [{ value: "", label: tu("all") }, ...dir.units.map((u) => ({ value: u.id, label: u.name }))], empty: "", hidden: !dir.units.length },
        ]}
        count={loading ? undefined : total}
        onReset={() => { setSearch(""); set({ q: null, status: null, unit: null }); }}
      />
      {saved.length || filtered ? (
        <div className="hrm-views" role="group" aria-label={tc("savedViews")}>
          <span className="hrm-views__l">{tc("savedViews")}</span>
          {saved.map((v) => {
            const on = v.q === q && v.status === status && v.unit === unitId;
            return (
              <span key={v.name} className={`hrm-view${on ? " is-on" : ""}`}>
                <button type="button" onClick={() => { setSearch(v.q); set({ q: v.q, status: v.status, unit: v.unit }); }}>{v.name}</button>
                <button type="button" className="hrm-view__x" aria-label={tc("dropView", { name: v.name })} onClick={() => dropView(v.name)}>×</button>
              </span>
            );
          })}
          {filtered ? <button type="button" className="btn btn--ghost btn--sm" onClick={saveView}>{tc("saveView")}</button> : null}
        </div>
      ) : null}
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <HrmPanel flush>
        {loading && !rows ? <div style={{ padding: 16 }}><HrmLoading rows={6} /></div> : shown.length ? (
          <div className={`hrm-table-wrap${loading ? " is-loading" : ""}`}>
            <table className="hrm-table">
              <thead>
                <tr>
                  {head("name", t("columns.employee"))}
                  {head("position", t("columns.position"))}
                  {head("unit", t("columns.unit"))}
                  {head("manager", t("columns.manager"))}
                  {head("hire", t("hireDate"))}
                  {head("status", t("columns.status"))}
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className="is-click" tabIndex={0} onClick={() => open(e.id)} onKeyDown={(ev) => { if (ev.key === "Enter") open(e.id); }}>
                    <td><HrmPerson name={e.name || e.code} sub={[e.code, e.phone].filter(Boolean).join(" · ")} /></td>
                    <td>{dir.positionTitle(e.positionId) || <span className="hrm-muted">—</span>}</td>
                    <td>{dir.unitName(e.unitId) || <span className="hrm-muted">—</span>}</td>
                    <td className="hrm-muted">{dir.employeeName(e.managerId) || "—"}</td>
                    <td className="hrm-muted hrm-num">{e.hireDate ? f.date(e.hireDate) : "—"}</td>
                    <td><HrmStatus value={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <HrmEmpty icon={IconUsers} title={t("emptyEmployees")} text={filtered ? t("emptyFiltered") : t("emptyEmployeesLead")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("newEmployee")}</button>} />}
        {total ? (
          <div className="hrm-pager">
            <span>{tc("range", { from: (cur - 1) * size + 1, to: Math.min(cur * size, total), total })}</span>
            <label>
              {tc("perPage")}
              <select value={size} onChange={(ev) => set({ size: Number(ev.target.value) === 25 ? null : ev.target.value })}>
                {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className="btn btn--line btn--sm" type="button" onClick={() => set({ page: cur - 1 > 1 ? cur - 1 : null }, true)} disabled={cur <= 1}><IconChevronLeft />{tc("prev")}</button>
            <span>{tc("pageOf", { n: cur, of: pages })}</span>
            <button className="btn btn--line btn--sm" type="button" onClick={() => set({ page: cur + 1 }, true)} disabled={cur >= pages}>{tc("next")}<IconChevronRight /></button>
          </div>
        ) : null}
      </HrmPanel>

      <EmployeeCreate open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); reload(); open(id); }} />
    </section>
  );
}
