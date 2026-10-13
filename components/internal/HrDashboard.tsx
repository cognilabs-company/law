"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getHrmOverview, useHrmCatalog, type HrmSummary } from "@/lib/services/hrm";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { HrmBars, HrmDonut } from "@/components/internal/HrmCharts";
import { HrmBar, HrmEmpty, HrmPanel, HrmStat, useNow, useStatusLabel } from "@/components/internal/HrmUi";
import { useHrmText } from "@/components/internal/hrm/text";
import { domainHref } from "@/components/internal/hrm/routes";
import { IconBriefcase, IconBuilding, IconCalendar, IconChartBar, IconFolder, IconTrendingUp, IconUserPlus, IconUsers } from "@/components/icons";

// MedControl HR's HR dashboard, from what the workspace already holds: the
// people (headcount by unit, status and kind of employment, hires by month,
// tenure), the positions nobody holds, and the HR records of every module.
const TONES = ["#2563eb", "#17c7d6", "#f97316", "#8b5cf6", "#16a34a", "#e11d48", "#64748b"];
const MONTH_MS = 30.44 * 86_400_000;

export default function HrDashboard() {
  const t = useTranslations("internal.hrdash");
  const label = useStatusLabel();
  const tp = useTranslations("internal.people");
  const dir = useHrmDirectory();
  const locale = useLocale();
  const now = useNow();
  const cat = useHrmCatalog();
  const { module } = useHrmText();
  const [overview, setOverview] = useState<HrmSummary[] | null>(null);
  useEffect(() => {
    const c = new AbortController();
    getHrmOverview({}, c.signal)
      .then((o) => !c.signal.aborted && setOverview(o.domains))
      .catch(() => !c.signal.aborted && setOverview([]));
    return () => c.abort();
  }, []);

  const data = useMemo(() => {
    const people = dir.employees;
    const active = people.filter((e) => e.status === "active");
    const count = <K extends string>(key: (e: (typeof people)[number]) => K) => {
      const m = new Map<K, number>();
      for (const e of people) m.set(key(e), (m.get(key(e)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const byUnit = count((e) => e.unitId || "-");
    const byStatus = count((e) => e.status || "-");
    const byType = count((e) => e.employmentType || "-");
    const months: { key: string; label: string; value: number }[] = [];
    if (now) {
      const d = new Date(now);
      for (let i = 11; i >= 0; i--) {
        const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
        months.push({ key, label: new Intl.DateTimeFormat(locale, { month: "short" }).format(m), value: 0 });
      }
      for (const e of people) {
        const k = e.hireDate.slice(0, 7);
        const row = months.find((x) => x.key === k);
        if (row) row.value += 1;
      }
    }
    const tenure = [0, 0, 0, 0];
    if (now)
      for (const e of active) {
        const m = e.hireDate ? (now - Date.parse(e.hireDate)) / MONTH_MS : NaN;
        if (!Number.isFinite(m)) continue;
        tenure[m < 3 ? 0 : m < 12 ? 1 : m < 36 ? 2 : 3] += 1;
      }
    const held = new Set(people.filter((e) => e.status !== "terminated").map((e) => e.positionId).filter(Boolean));
    const vacant = dir.positions.filter((p) => p.status !== "inactive" && !held.has(p.id));
    return { people, active, byUnit, byStatus, byType, months, tenure, vacant, newHires: months.slice(-3).reduce((n, x) => n + x.value, 0) };
  }, [dir.employees, dir.positions, now, locale]);

  if (!dir.employees.length && !overview) return <HrmPanel><HrmEmpty icon={IconChartBar} title={t("loading")} /></HrmPanel>;
  const maxUnit = Math.max(1, ...data.byUnit.map(([, n]) => n));
  const modules = (overview ?? []).filter((d) => d.total > 0).sort((a, b) => b.total - a.total);
  return (
    <div className="hrm-dash">
      <div className="hrm-stats">
        <HrmStat icon={IconUsers} tone="blue" label={t("headcount")} value={data.people.length} hint={t("activeN", { n: data.active.length })} />
        <HrmStat icon={IconUserPlus} tone="ok" label={t("newHires")} value={data.newHires} hint={t("last3")} />
        <HrmStat icon={IconBuilding} tone="cyan" label={t("units")} value={dir.units.length} />
        <HrmStat icon={IconBriefcase} tone="warn" label={t("vacant")} value={data.vacant.length} hint={t("ofPositions", { n: dir.positions.length })} />
      </div>
      <div className="hrm-grid hrm-grid--2">
        <HrmPanel title={t("byUnit")} icon={IconBuilding}>
          <ul className="hrm-hbars">
            {data.byUnit.slice(0, 10).map(([id, n]) => (
              <li key={id}>
                <span>{id === "-" ? t("noUnit") : dir.unitName(id) || id}</span>
                <HrmBar value={(n / maxUnit) * 100} />
                <b>{n}</b>
              </li>
            ))}
          </ul>
        </HrmPanel>
        <HrmPanel title={t("byStatus")} icon={IconUsers}>
          <HrmDonut center={String(data.people.length)} slices={data.byStatus.map(([k, n], i) => ({ label: k === "-" ? "—" : label(k), value: n, color: TONES[i % TONES.length] }))} />
          <div className="hrm-dash__sub">
            <small>{t("byType")}</small>
            <HrmDonut center={String(data.people.length)} slices={data.byType.map(([k, n], i) => ({ label: k === "-" ? "—" : tp.has(`types.${k}`) ? tp(`types.${k}`) : k, value: n, color: TONES[(i + 2) % TONES.length] }))} />
          </div>
        </HrmPanel>
        <HrmPanel title={t("hires")} icon={IconTrendingUp}>
          {data.months.length ? <HrmBars data={data.months} /> : null}
        </HrmPanel>
        <HrmPanel title={t("tenure")} icon={IconCalendar}>
          <HrmBars data={["lt3", "lt12", "lt36", "gte36"].map((k, i) => ({ label: t(`tenureB.${k}`), value: data.tenure[i] }))} color="var(--b400)" />
        </HrmPanel>
      </div>
      <div className="hrm-grid hrm-grid--2">
        <HrmPanel title={t("vacantTitle")} icon={IconBriefcase} count={data.vacant.length}>
          {data.vacant.length ? (
            <ul className="hrm-list">
              {data.vacant.slice(0, 8).map((p) => (
                <li key={p.id}><span className="hrm-list__t"><b>{p.title}</b><small>{[p.code, p.grade].filter(Boolean).join(" · ")}</small></span></li>
              ))}
            </ul>
          ) : <p className="hrm-muted">{t("noVacant")}</p>}
          <Link href="/internal/recruiting?type=vacancy" className="btn btn--line btn--sm">{t("toRecruiting")}</Link>
        </HrmPanel>
        <HrmPanel title={t("records")} icon={IconFolder}>
          {modules.length ? (
            <ul className="hrm-list">
              {modules.map((d) => (
                <li key={d.domain}>
                  <Link className="hrm-today-row" href={domainHref(d.domain)}>
                    <b>{module(cat.data?.modules.find((m) => m.key === d.domain) ?? null, d.domain)}</b>
                    <small>{Object.entries(d.byStatus).map(([k, n]) => `${label(k)}: ${n}`).join(" · ")}</small>
                    <span className="hrm-num">{d.total}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="hrm-muted">{overview ? t("noRecords") : t("loading")}</p>}
        </HrmPanel>
      </div>
    </div>
  );
}
