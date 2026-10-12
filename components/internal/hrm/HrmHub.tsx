"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { getHrmMe, getHrmOverview, moduleOf, useHrmCatalog, type HrmCatalog, type HrmRow, type HrmSummary } from "@/lib/services/hrm";
import DatePicker from "@/components/DatePicker";
import { HrmBars } from "@/components/internal/HrmCharts";
import { IconArrowRight, IconFolder, IconHistory, IconLayers, IconList, IconRefresh, IconUser } from "@/components/icons";
import { EntitySelect, HrmEmpty, HrmError, HrmHead, HrmLoading, HrmPanel, HrmStat, HrmStatus, useHrmFormat, useStatusLabel } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { apiMessage } from "@/components/internal/live/bits";
import { HRM_GROUPS, hrmRoute, useHrmText } from "./text";

// Every HRM module of the catalog in one place (spec §11, §15): the whole
// organisation's numbers, the module cards grouped as HR thinks of them,
// and the viewer's own records.
// Bar captions are narrow: a long module name is cut, the full one is in the cards.
const short = (s: string) => (s.length > 13 ? `${s.slice(0, 12)}…` : s);

export default function HrmHub() {
  const cat = useHrmCatalog();
  const { t, module } = useHrmText();
  const dir = useHrmDirectory();
  const [range, setRange] = useState({ unitId: "", dateFrom: "", dateTo: "" });
  const [tick, setTick] = useState(0);
  const [ov, setOv] = useState<{ key: string; total: number; pending: number; domains: HrmSummary[]; err: string } | null>(null);
  const key = JSON.stringify({ range, tick });
  useEffect(() => {
    const c = new AbortController();
    getHrmOverview({ unitId: range.unitId || undefined, dateFrom: range.dateFrom || undefined, dateTo: range.dateTo || undefined }, c.signal)
      .then((o) => !c.signal.aborted && setOv({ key, ...o, err: "" }))
      .catch((e) => !c.signal.aborted && setOv({ key, total: 0, pending: 0, domains: [], err: apiMessage(e, t("loadError")) }));
    return () => c.abort();
  }, [key, range, t]);
  const data = cat.data;
  const typeCount = data?.modules.reduce((n, m) => n + m.types.length, 0) ?? 0;
  const of = (domain: string) => ov?.domains.find((d) => d.domain === domain) ?? null;

  return (
    <section className="hrm-page hrmc">
      <HrmHead
        title={t("hub.title")}
        lead={t("hub.lead")}
        actions={
          <button className="btn btn--line btn--sm" type="button" onClick={() => setTick((n) => n + 1)}>
            <IconRefresh />
            {t("refresh")}
          </button>
        }
      />
      <div className="hrm-toolbar hrmc-filters">
        {dir.unitOptions.length ? (
          <div className="hrm-toolbar__sel">
            <EntitySelect value={range.unitId} onChange={(v) => setRange((r) => ({ ...r, unitId: v }))} options={dir.unitOptions} placeholder={t("allUnits")} ariaLabel={t("unit")} />
          </div>
        ) : null}
        <div className="hrmc-filters__dates">
          <DatePicker value={range.dateFrom} onChange={(v) => setRange((r) => ({ ...r, dateFrom: v }))} placeholder={t("dateFrom")} ariaLabel={t("dateFrom")} max={range.dateTo || undefined} clearLabel={t("form.clear")} />
          <DatePicker value={range.dateTo} onChange={(v) => setRange((r) => ({ ...r, dateTo: v }))} placeholder={t("dateTo")} ariaLabel={t("dateTo")} min={range.dateFrom || undefined} clearLabel={t("form.clear")} />
        </div>
      </div>
      <div className="hrm-stats">
        <HrmStat icon={IconLayers} tone="blue" label={t("hub.modules")} value={data ? data.modules.length : "…"} />
        <HrmStat icon={IconFolder} tone="violet" label={t("hub.types")} value={data ? typeCount : "…"} />
        <HrmStat icon={IconList} tone="ok" label={t("hub.records")} value={ov ? ov.total : "…"} />
        <HrmStat icon={IconHistory} tone="warn" label={t("hub.pending")} value={ov ? ov.pending : "…"} />
      </div>
      {cat.state === "error" && !data ? <HrmError text={t("catalogError")} onRetry={() => void cat.reload()} retryLabel={t("retry")} /> : null}
      {ov?.err ? <HrmError text={ov.err} onRetry={() => setTick((n) => n + 1)} retryLabel={t("retry")} /> : null}

      <div className="hrm-grid hrm-grid--side">
        <HrmPanel title={t("hub.byModule")} icon={IconList}>
          {ov && data ? (
            <HrmBars data={[...ov.domains].sort((a, b) => b.total - a.total).slice(0, 10).map((d) => ({ label: short(module(moduleOf(data, d.domain), d.domain)), value: d.total }))} />
          ) : (
            <HrmLoading rows={3} />
          )}
        </HrmPanel>
        <MyRecords cat={data} />
      </div>

      {data ? (
        HRM_GROUPS.map((g) => (
          <section key={g.key} className="hrmc-group">
            <h3>{t(`groups.${g.key}`)}</h3>
            <div className="hrmc-cards">
              {g.domains.map((d) => {
                const m = moduleOf(data, d);
                if (!m) return null;
                const s = of(d);
                return <ModuleCard key={d} domain={d} types={m.types.length} summary={s} />;
              })}
            </div>
          </section>
        ))
      ) : (
        <HrmPanel>
          <HrmLoading rows={6} />
        </HrmPanel>
      )}
    </section>
  );
}

function ModuleCard({ domain, types, summary }: { domain: string; types: number; summary: HrmSummary | null }) {
  const cat = useHrmCatalog();
  const { t, module, moduleLead } = useHrmText();
  const ts = useStatusLabel();
  const m = moduleOf(cat.data, domain);
  const statuses = Object.entries(summary?.byStatus ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <Link href={hrmRoute(domain)} className="hrmc-card" data-domain={domain}>
      <span className="hrmc-card__h">
        <b>{module(m, domain)}</b>
        <span className="hrmc-card__n">{summary ? summary.total : "·"}</span>
      </span>
      <small>{moduleLead(domain)}</small>
      <span className="hrmc-card__f">
        <span className="hrmc-card__types">{t("hub.typesOf", { n: types })}</span>
        {statuses.map(([s, n]) => (
          <span key={s} className="hrmc-card__st">{ts(s)} · {n}</span>
        ))}
        <IconArrowRight className="hrmc-card__go" />
      </span>
    </Link>
  );
}

// The viewer's own HR records (GET /internal/hrm/me/overview).
export function MyRecords({ cat }: { cat: HrmCatalog | null }) {
  const { t, type: typeName, module } = useHrmText();
  const f = useHrmFormat();
  const [me, setMe] = useState<{ active: HrmRow[]; pending: HrmRow[]; recent: HrmRow[]; err: string } | null>(null);
  const [tab, setTab] = useState<"active" | "pending" | "recent">("active");
  useEffect(() => {
    const c = new AbortController();
    getHrmMe(c.signal)
      .then((d) => !c.signal.aborted && setMe({ ...d, err: "" }))
      .catch((e) => !c.signal.aborted && setMe({ active: [], pending: [], recent: [], err: apiMessage(e, t("loadError")) }));
    return () => c.abort();
  }, [t]);
  const rows = me ? me[tab] : [];
  return (
    <HrmPanel title={t("me.title")} icon={IconUser} actions={
      <div className="hrm-tabs" role="tablist">
        {(["active", "pending", "recent"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {t(`me.${k}`)}
            <span className="hrm-count">{me ? me[k].length : "·"}</span>
          </button>
        ))}
      </div>
    }>
      {!me ? (
        <HrmLoading rows={3} />
      ) : me.err ? (
        <HrmError text={me.err} />
      ) : rows.length ? (
        <ul className="hrm-list">
          {rows.slice(0, 8).map((r) => {
            const m = moduleOf(cat, r.domain);
            const ty = m?.types.find((x) => x.key === r.type) ?? null;
            return (
              <li key={r.id}>
                <Link className="org-row" href={`${hrmRoute(r.domain)}?open=${encodeURIComponent(r.id)}${r.type ? `&type=${encodeURIComponent(r.type)}` : ""}`}>
                  <span className="hrm-list__t">
                    <b>{r.title || typeName(ty, r.domain, r.type)}</b>
                    <small>{[r.code, module(m, r.domain), typeName(ty, r.domain, r.type), f.date(r.updatedAt || r.createdAt)].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="hrm-list__a"><HrmStatus value={r.status} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <HrmEmpty icon={IconUser} title={t(`me.none.${tab}`)} />
      )}
    </HrmPanel>
  );
}
