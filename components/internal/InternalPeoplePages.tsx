"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError } from "@/lib/http";
import { getEmployees, normEmployee, type HrmEmployee, type InternalPage } from "@/lib/services/internalHrm";
import { IconBriefcase, IconBuilding, IconCheck, IconPlus, IconRefresh, IconUsers } from "@/components/icons";
import FilterBar from "@/components/filters/FilterBar";
import InternalPagination from "@/components/internal/InternalPagination";
import InternalOrgPage from "@/components/internal/InternalOrgPage";
import { Employee360, EmployeeCreate, EMPLOYMENT_STATUSES } from "@/components/internal/EmployeeDrawers";
import { refreshHrmDirectory, useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { HrmEmpty, HrmError, HrmHead, HrmLoading, HrmPanel, HrmPerson, HrmStat, HrmStatus, useStatusLabel } from "@/components/internal/HrmUi";

type Mode = "employees" | "org";
const EMPTY_PAGE = { items: [], total: 0, offset: 0, limit: 25, hasMore: false };

export default function InternalPeoplePages({ mode }: { mode: Mode }) {
  return mode === "org" ? <InternalOrgPage /> : <EmployeesPage />;
}

function EmployeesPage() {
  const t = useTranslations("internal.people");
  const tu = useTranslations("internal.ui");
  const label = useStatusLabel();
  const dir = useHrmDirectory();
  const [page, setPage] = useState<InternalPage<HrmEmployee>>(EMPTY_PAGE);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [unitId, setUnitId] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const res = await getEmployees({ q: q || undefined, status: status || undefined, org_unit_id: unitId || undefined, limit: 50, offset }, signal);
      setPage({ ...res, items: res.items.map(normEmployee) });
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [q, status, unitId, offset]);
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

  const stats = useMemo(() => {
    const all = dir.employees.length ? dir.employees : page.items;
    return {
      total: all.length,
      active: all.filter((e) => e.status === "active").length,
      assigned: all.filter((e) => e.unitId || e.positionId).length,
      units: dir.units.length,
    };
  }, [dir.employees, dir.units.length, page.items]);

  const open = page.items.find((e) => e.id === openId) ?? dir.employee(openId) ?? null;

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
        <HrmStat icon={IconUsers} tone="blue" label={t("stat.total")} value={stats.total} />
        <HrmStat icon={IconCheck} tone="ok" label={t("stat.active")} value={stats.active} />
        <HrmStat icon={IconBriefcase} tone="violet" label={t("stat.assigned")} value={stats.assigned} />
        <HrmStat icon={IconBuilding} tone="cyan" label={t("stat.units")} value={stats.units} />
      </div>
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setOffset(0); }, placeholder: t("searchEmployees"), maxLength: 120 }}
        fields={[
          { key: "status", label: t("statusFilter"), value: status, onChange: (v) => { setStatus(v); setOffset(0); }, options: [{ value: "", label: t("allStatuses") }, ...EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))], empty: "" },
          { key: "unit", label: t("unitId"), value: unitId, onChange: (v) => { setUnitId(v); setOffset(0); }, options: [{ value: "", label: tu("all") }, ...dir.units.map((u) => ({ value: u.id, label: u.name }))], empty: "", hidden: !dir.units.length },
        ]}
        count={page.total}
        onReset={() => { setQ(""); setStatus(""); setUnitId(""); setOffset(0); }}
      />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <HrmPanel flush>
        {loading ? <div style={{ padding: 16 }}><HrmLoading rows={6} /></div> : page.items.length ? (
          <div className="hrm-table-wrap">
            <table className="hrm-table">
              <thead><tr><th>{t("columns.employee")}</th><th>{t("columns.position")}</th><th>{t("columns.unit")}</th><th>{t("columns.manager")}</th><th>{t("columns.region")}</th><th>{t("columns.status")}</th></tr></thead>
              <tbody>
                {page.items.map((e) => (
                  <tr key={e.id} className="is-click" tabIndex={0} onClick={() => setOpenId(e.id)} onKeyDown={(ev) => { if (ev.key === "Enter") setOpenId(e.id); }}>
                    <td><HrmPerson name={e.name || e.code} sub={[e.code, e.phone].filter(Boolean).join(" · ")} /></td>
                    <td>{dir.positionTitle(e.positionId) || <span className="hrm-muted">—</span>}</td>
                    <td>{dir.unitName(e.unitId) || <span className="hrm-muted">—</span>}</td>
                    <td className="hrm-muted">{dir.employeeName(e.managerId) || "—"}</td>
                    <td className="hrm-muted">{e.region || "—"}</td>
                    <td><HrmStatus value={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <HrmEmpty icon={IconUsers} title={t("emptyEmployees")} text={q || status || unitId ? t("emptyFiltered") : t("emptyEmployeesLead")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}><IconPlus />{t("newEmployee")}</button>} />}
        <InternalPagination page={page} onChange={setOffset} />
      </HrmPanel>

      <Employee360 employee={open} onClose={() => setOpenId("")} onSaved={reload} />
      <EmployeeCreate open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); reload(); setOpenId(id); }} />
    </section>
  );
}
