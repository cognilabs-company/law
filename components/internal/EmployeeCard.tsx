"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { listHrm, useHrmCatalog, type HrmPage } from "@/lib/services/hrm";
import { useHrmDirectory, refreshHrmDirectory } from "@/components/internal/useHrmDirectory";
import { EmployeeEdit, EmployeeOverview, useEmployee360 } from "@/components/internal/EmployeeDrawers";
import { HrmAvatar, HrmEmpty, HrmError, HrmLoading, HrmPanel, HrmStatus, useHrmFormat, useStatusLabel } from "@/components/internal/HrmUi";
import { useHrmText } from "@/components/internal/hrm/text";
import { domainHref } from "@/components/internal/hrm/routes";
import { IconArrowRight, IconChevronLeft, IconFolder, IconMail, IconMonitor, IconPhone } from "@/components/icons";
import { LifecycleButtons, ModuleCounts, ReadinessPanel } from "@/components/internal/ops/EmployeeOps";

// The employee card after MedControl HR's (/people/employees/:id/:tab): a
// header with who the person is and where they stand, then one tab per side
// of their HR life. The overview and the edit form are the 360's; every
// other tab is the catalog's records for this person, read on the server
// with employee_id, each opening in its module.
type RecordTab = { key: string; domain: string; types?: string[] };
const RECORD_TABS: RecordTab[] = [
  { key: "personal", domain: "people", types: ["employee_profile", "change_request"] },
  { key: "assignments", domain: "people", types: ["assignment", "additional_duty"] },
  { key: "documents", domain: "people", types: ["document", "credential", "education"] },
  { key: "equipment", domain: "people", types: ["equipment"] },
  { key: "employment", domain: "employment" },
  { key: "skills", domain: "skills", types: ["employee_skill"] },
  { key: "leave", domain: "leave" },
  { key: "attendance", domain: "attendance" },
  { key: "schedule", domain: "scheduling", types: ["roster"] },
  { key: "pay", domain: "payroll" },
  { key: "orders", domain: "movements" },
  { key: "training", domain: "lms" },
  { key: "onboarding", domain: "onboarding" },
  { key: "offboarding", domain: "offboarding" },
];

export default function EmployeeCard({ id }: { id: string }) {
  // A lifecycle step changes the person's status and records: the card is
  // read again from the top.
  const [rev, setRev] = useState(0);
  return (
    <Suspense fallback={<HrmPanel><HrmLoading rows={6} /></HrmPanel>}>
      <Card key={rev} id={id} onChanged={() => { refreshHrmDirectory(); setRev((n) => n + 1); }} />
    </Suspense>
  );
}

function Card({ id, onChanged }: { id: string; onChanged: () => void }) {
  const t = useTranslations("internal.card");
  const tp = useTranslations("internal.people");
  const dir = useHrmDirectory();
  const router = useRouter();
  const sp = useSearchParams();
  const tab = sp.get("tab") || "overview";
  const { detail, loading, error, employee: fromApi } = useEmployee360(id);
  const e = fromApi ?? dir.employee(id) ?? null;
  const go = (k: string) => router.replace(`/internal/employees/${encodeURIComponent(id)}${k === "overview" ? "" : `?tab=${k}`}`, { scroll: false });
  const tabs = ["overview", ...RECORD_TABS.map((x) => x.key), "edit"];

  if (!e) {
    if (error) return <HrmError text={tp("error")} />;
    return <HrmPanel><HrmLoading rows={6} /></HrmPanel>;
  }
  return (
    <section className="hrm-page hrm-card">
      <Link href="/internal/employees" className="hrm-back"><IconChevronLeft />{t("back")}</Link>
      <header className="hrm-card__head">
        <HrmAvatar name={e.name || e.code} size="lg" />
        <div className="hrm-card__who">
          <div className="hrm-card__row">
            <h2>{e.name || e.code}</h2>
            <HrmStatus value={e.status} />
          </div>
          <p>{[e.code, dir.positionTitle(e.positionId), dir.unitName(e.unitId)].filter(Boolean).join(" · ")}</p>
          <div className="hrm-card__contacts">
            {e.phone ? <a href={`tel:${e.phone.replace(/[^+\d]/g, "")}`}><IconPhone />{e.phone}</a> : null}
            {e.email ? <a href={`mailto:${e.email}`}><IconMail />{e.email}</a> : null}
          </div>
        </div>
        <div className="hrm-card__acts">
          <Link className="btn btn--line btn--sm" href={`/internal/live-office?employee=${encodeURIComponent(e.id)}`}><IconMonitor />{tp("liveOfficeLink")}</Link>
          <LifecycleButtons id={e.id} name={e.name || e.code} status={e.status} onDone={onChanged} />
          <button type="button" className="btn btn--pri btn--sm" onClick={() => go("edit")}>{tp("tabEdit")}</button>
        </div>
      </header>
      <div className="hrm-tabs hrm-card__tabs" role="tablist" aria-label={t("tabs")}>
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => go(k)}>
            {t(`tab.${k}`)}
          </button>
        ))}
      </div>
      {error ? <HrmError text={tp("error")} /> : null}
      {tab === "overview" ? (
        <div className="ops-card-grid">
          <HrmPanel><EmployeeOverview employee={e} detail={detail} loading={loading} /></HrmPanel>
          <div className="ops-card-side">
            <ReadinessPanel id={e.id} />
            <ModuleCounts id={e.id} />
          </div>
        </div>
      ) : tab === "edit" ? (
        <HrmPanel><EmployeeEdit employee={e} onSaved={refreshHrmDirectory} /></HrmPanel>
      ) : (
        <Records key={tab} employeeId={e.id} spec={RECORD_TABS.find((x) => x.key === tab) ?? RECORD_TABS[0]} />
      )}
    </section>
  );
}

function Records({ employeeId, spec }: { employeeId: string; spec: RecordTab }) {
  const t = useTranslations("internal.card");
  const { type: typeName, module } = useHrmText();
  const cat = useHrmCatalog();
  const f = useHrmFormat();
  const status = useStatusLabel();
  const [res, setRes] = useState<{ pages: HrmPage[]; err: boolean } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    const types = spec.types ?? [undefined];
    void Promise.all(types.map((type) => listHrm(spec.domain, { employeeId, type, limit: 100, offset: 0 }, c.signal)))
      .then((pages) => !c.signal.aborted && setRes({ pages, err: false }))
      .catch(() => !c.signal.aborted && setRes({ pages: [], err: true }));
    return () => c.abort();
  }, [employeeId, spec]);
  const mod = cat.data?.modules.find((m) => m.key === spec.domain) ?? null;
  const rows = res?.pages.flatMap((p) => p.items) ?? [];
  const typeOf = (k: string) => typeName(mod?.types.find((x) => x.key === k) ?? null, spec.domain, k);
  return (
    <HrmPanel
      title={module(mod, spec.domain)}
      icon={IconFolder}
      count={res ? rows.length : undefined}
      actions={<Link className="btn btn--line btn--sm" href={domainHref(spec.domain, spec.types?.[0] ?? "")}>{t("openModule")}<IconArrowRight /></Link>}
      flush
    >
      {!res ? (
        <div style={{ padding: 16 }}><HrmLoading rows={4} /></div>
      ) : res.err ? (
        <div style={{ padding: 16 }}><HrmError text={t("recordsError")} /></div>
      ) : !rows.length ? (
        <HrmEmpty icon={IconFolder} title={t("noRecords")} text={t("noRecordsText")} />
      ) : (
        <div className="hrm-table-wrap">
          <table className="hrm-table">
            <thead>
              <tr><th>{t("col.title")}</th><th>{t("col.type")}</th><th>{t("col.period")}</th><th>{t("col.status")}</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.title || r.code}</b>{r.code && r.title ? <small className="hrm-muted"> · {r.code}</small> : null}</td>
                  <td className="hrm-muted">{typeOf(r.type)}</td>
                  <td className="hrm-muted">{[r.from ? f.date(r.from) : "", r.to ? f.date(r.to) : ""].filter(Boolean).join(" — ") || "—"}</td>
                  <td><span title={status(r.status)}><HrmStatus value={r.status} /></span></td>
                  <td><Link className="btn btn--soft btn--sm" href={domainHref(r.domain || spec.domain, r.type, r.id)}>{t("open")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HrmPanel>
  );
}
