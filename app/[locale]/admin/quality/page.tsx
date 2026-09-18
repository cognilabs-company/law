"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { adminListComplaints } from "@/lib/services/backend";
import { getQualityFull, isQualityEmpty, isFiltered, todayIso, type QualityFull } from "@/lib/services/dash";
import { demoQuality, DEMO_COMPLAINT_STATUSES } from "@/lib/demoStats";
import { useResourceOne, useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import StatTile from "@/components/admin/StatTile";
import StatDrillModal, { type Drill } from "@/components/admin/StatDrillModal";
import DashFilterBar, { useDashFilter } from "@/components/admin/DashFilterBar";
import { IconStar, IconClock, IconAlert, IconCheck, IconInfo } from "@/components/icons";

const EMPTY: QualityFull = { fetchedAt: "", avgRating: 0, responseSlaPct: 0, complaintRate: 0, resolvedPct: 0, flagged: [] };

export default function AdminQuality() {
  const t = useTranslations("admin.quality");
  const td = useTranslations("admin.dash");
  const { filter, setFilter, demoForced, setDemoForced } = useDashFilter();
  const fkey = `${filter.region}|${filter.from}|${filter.to}`;
  const res = useResourceOne(() => getQualityFull(filter), [fkey]);
  const comp = useResource(() => adminListComplaints(), []);
  const [drill, setDrill] = useState<Drill | null>(null);
  const loaded = res.status !== "loading";
  const demo = demoForced || (loaded && (!res.data || isQualityEmpty(res.data)));
  const q = useMemo(() => (demo ? demoQuality(todayIso()) : res.data ?? EMPTY), [demo, res.data]);
  const status = (k: string) => (t.has(`status.${k}`) ? t(`status.${k}`) : k);
  const regionHint = filter.region ? td("hint.regionNa") : undefined;
  const dateHint = filter.from || filter.to ? td("hint.dateNa") : undefined;

  // Complaint breakdown by status: real list when there is one, demo counts otherwise.
  const byStatus = useMemo(() => {
    if (!demo && comp.status === "ready" && comp.data.length) {
      const m: Record<string, number> = {};
      for (const c of comp.data) m[c.status || "open"] = (m[c.status || "open"] ?? 0) + 1;
      return Object.entries(m).map(([label, value]) => ({ label, value }));
    }
    return demo ? Object.entries(DEMO_COMPLAINT_STATUSES).map(([label, value]) => ({ label, value })) : [];
  }, [demo, comp]);
  const kv = (): Drill["sections"][number] => ({ kind: "kv", rows: [
    { label: t("avgRating"), value: q.avgRating.toFixed(1) }, { label: t("sla"), value: `${q.responseSlaPct}%` },
    { label: t("complaintCount"), value: String(q.complaintRate), tone: "bad" }, { label: t("resolved"), value: `${q.resolvedPct}%`, tone: "ok" },
  ] });
  const complaintsBars = (): Drill["sections"][number] => ({ kind: "bars", title: t("complaints"), rows: byStatus.map((x) => ({ label: status(x.label), value: String(x.value), n: x.value })), empty: t("noComplaints") });
  const flaggedList = (): Drill["sections"][number] => ({ kind: "list", title: t("flagged"), rows: q.flagged.map((f) => ({ label: f.title, value: t.has(`severity.${f.severity}`) ? t(`severity.${f.severity}`) : f.severity, sub: f.detail, tone: f.severity === "high" ? "bad" : "muted" })), empty: t("noFlagged") });
  const open = (title: string, value: string, note?: string) => setDrill({ title, value, demo, note, sections: [kv(), complaintsBars(), flaggedList()] });

  return (
    <>
      <div className="ppanel">
        <div className="ppanel__h"><b>{t("title")}</b></div>
        <DashFilterBar value={filter} onChange={setFilter} demoForced={demoForced} onDemoForced={setDemoForced} note={isFiltered(filter) ? td("filter.regionNote") : undefined} compact />
        {demo && loaded ? <p className="bhnote" role="status"><IconInfo />{demoForced ? td("demo.forced") : td("demo.banner")}</p> : null}
        {!loaded ? (
          <Skeleton rows={3} />
        ) : (
          <>
            <div className="castat">
              <StatTile icon={<IconStar />} value={q.avgRating.toFixed(1)} label={t("avgRating")} demo={demo} hint={regionHint ?? dateHint} onClick={() => open(t("avgRating"), q.avgRating.toFixed(1), td("drill.constNote"))} />
              <StatTile icon={<IconClock />} tone="ok" value={`${q.responseSlaPct}%`} label={t("sla")} demo={demo} hint={regionHint ?? dateHint} onClick={() => open(t("sla"), `${q.responseSlaPct}%`, td("drill.constNote"))} />
              <StatTile icon={<IconAlert />} tone="bad" value={String(q.complaintRate)} label={t("complaintCount")} demo={demo} hint={regionHint} onClick={() => open(t("complaintCount"), String(q.complaintRate))} />
              <StatTile icon={<IconCheck />} tone="ok" value={`${q.resolvedPct}%`} label={t("resolved")} demo={demo} hint={regionHint} onClick={() => open(t("resolved"), `${q.resolvedPct}%`)} />
            </div>
            <div className="cablock">
              <h3>{t("flagged")}</h3>
              {q.flagged.length ? (
                <div className="alist">
                  {q.flagged.map((f, i) => (
                    <div className="aitem" key={i}>
                      <span className={`tprio tprio--${f.severity === "high" ? "high" : f.severity === "medium" ? "medium" : "low"}`}>{t.has(`severity.${f.severity}`) ? t(`severity.${f.severity}`) : f.severity}</span>
                      <div className="aitem__m"><b>{f.title}</b><span className="aitem__meta">{f.detail}</span></div>
                    </div>
                  ))}
                </div>
              ) : <p className="advmuted">{t("noFlagged")}</p>}
            </div>
          </>
        )}
      </div>

      <div className="ppanel">
        <div className="ppanel__h"><b>{t("complaints")}</b></div>
        {comp.status === "loading" ? (
          <Skeleton rows={2} />
        ) : !comp.data.length ? (
          <EmptyState icon={<IconAlert />} title={t("noComplaints")} text={t("noComplaintsText")} />
        ) : (
          <div className="alist">
            {comp.data.map((c) => (
              <div className="creq" key={c.id}>
                <span className="creq__st" />
                <div className="creq__m"><b>{c.subject || (t.has(`category.${c.category}`) ? t(`category.${c.category}`) : c.category)}</b><span>{c.description}</span></div>
                <span className="creq__badge">{status(c.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
    </>
  );
}
