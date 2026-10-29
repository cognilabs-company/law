"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { IconAlert, IconCheck, IconDownload, IconInbox, IconRefresh } from "@/components/icons";
import { saveBlob } from "@/lib/download";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { EXPORT_SCOPES, createCrmExport, crmCan, downloadCrmExport, listCrmOperators, type CrmExport, type CrmMeta, type CrmOperator } from "@/lib/services/crm";
import { dismissCrmExport, refreshCrmExport, trackCrmExport, useCrmEvents, useCrmExports } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Empty, useCrmError, useStatusLabel } from "./bits";
import { CrmDate, CrmSelect } from "./fields";

// Background Excel export (contract 13cb257 §19): the scope and its
// filters go to POST /crm/exports (202); the job is followed by polling
// and crm.export.ready through queued → running → ready (or failed /
// expired), and the file is downloaded with the operator's token.
export default function CrmExports(): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame section="exports" title={t("export.page")} noTray>
      {(api) => (
        <div className="crm-grid">
          <section className="crm-card" aria-labelledby="crm-exf-t">
            <h3 className="crm-card__h" id="crm-exf-t">
              <IconDownload aria-hidden="true" />
              {t("export.title")}
            </h3>
            <ExportForm meta={api.meta} />
          </section>
          <section className="crm-card" aria-labelledby="crm-exj-t">
            <h3 className="crm-card__h" id="crm-exj-t">
              <IconRefresh aria-hidden="true" />
              {t("export.jobs")}
            </h3>
            <ExportJobs />
          </section>
        </div>
      )}
    </CrmFrame>
  );
}

// The export's scope and filters; the backend applies them and the
// viewer's own scope. Used on the Exports page and in the quick sheet.
export function ExportForm({ meta, onCreated }: { meta: CrmMeta; onCreated?: (j: CrmExport) => void }): ReactElement {
  const t = useTranslations("crm.export");
  const tsrc = useTranslations("crm.source");
  const label = useStatusLabel();
  const crmErr = useCrmError();
  const [scope, setScope] = useState<string>("leads");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [operator, setOperator] = useState("");
  const [q, setQ] = useState("");
  const [ops, setOps] = useState<CrmOperator[]>([]);
  const [busy, setBusy] = useState(false);
  const allLeads = crmCan(meta, "crm.leads.view_all") || crmCan(meta, "crm.leads.assign");
  useEffect(() => {
    if (!allLeads) return;
    const ctl = new AbortController();
    listCrmOperators("", ctl.signal).then(setOps, (e) => !isAborted(e) && logApiError("crm.operators", e));
    return () => ctl.abort();
  }, [allLeads]);
  const leads = scope === "leads";
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const job = await createCrmExport({
        scope,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : "",
        to: to ? new Date(`${to}T23:59:59`).toISOString() : "",
        status: leads ? status : "",
        source: leads ? source : "",
        operator: leads ? operator : "",
        q,
      });
      trackCrmExport(job);
      toast(t("started"), { tone: "info" });
      onCreated?.(job);
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="crm-pop">
      <div className="crm-seg" role="group" aria-label={t("scopeLabel")}>
        {EXPORT_SCOPES.map((s) => (
          <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)}>
            {t(`scope.${s}`)}
          </button>
        ))}
      </div>
      <div className="crm-row2">
        <div className="crm-field">
          <span>{t("from")}</span>
          <CrmDate value={from} onChange={setFrom} label={t("from")} max={to || undefined} />
        </div>
        <div className="crm-field">
          <span>{t("to")}</span>
          <CrmDate value={to} onChange={setTo} label={t("to")} min={from || undefined} />
        </div>
      </div>
      {leads ? (
        <div className="crm-row2">
          <div className="crm-field">
            <span>{t("status")}</span>
            <CrmSelect value={status} onChange={setStatus} label={t("status")} options={[{ value: "", label: t("anyStatus") }, ...meta.statuses.map((s) => ({ value: s, label: label(s) }))]} />
          </div>
          <div className="crm-field">
            <span>{t("source")}</span>
            <CrmSelect value={source} onChange={setSource} label={t("source")} options={[{ value: "", label: t("anySource") }, ...meta.sources.map((s) => ({ value: s, label: tsrc.has(s) ? tsrc(s) : tsrc("other") }))]} />
          </div>
        </div>
      ) : null}
      {leads && allLeads ? (
        <div className="crm-field">
          <span>{t("operator")}</span>
          <CrmSelect value={operator} onChange={setOperator} label={t("operator")} options={[{ value: "", label: t("anyOperator") }, ...ops.map((o) => ({ value: o.id, label: o.name }))]} search />
        </div>
      ) : null}
      <label className="crm-field">
        <span>{t("q")}</span>
        <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("qPh")} maxLength={200} />
      </label>
      <p className="crm-sub">{t("note")}</p>
      <button type="button" className="crm-btn crm-btn--pri" onClick={() => void submit()} disabled={busy} aria-busy={busy || undefined} style={{ justifySelf: "start" }}>
        <IconDownload aria-hidden="true" />
        {t("create")}
      </button>
    </div>
  );
}

// This session's export jobs with their live state.
export function ExportJobs(): ReactElement {
  const t = useTranslations("crm.export");
  const jobs = useCrmExports();
  const crmErr = useCrmError();
  const [saving, setSaving] = useState("");
  useCrmEvents((ev) => {
    if (ev.exportId && ev.invalidate.includes("export")) refreshCrmExport(ev.exportId);
  });
  const save = async (j: CrmExport) => {
    if (saving) return;
    setSaving(j.id);
    try {
      const { blob, name } = await downloadCrmExport(j.id);
      saveBlob(blob, name || `lexgo-crm-${j.scope}.xlsx`);
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
      refreshCrmExport(j.id);
    } finally {
      setSaving("");
    }
  };
  if (!jobs.length) return <Empty icon={<IconInbox />} title={t("noJobs")} text={t("noJobsText")} />;
  return (
    <ul className="crm-jobs">
      {jobs.map((j) => {
        const st = j.status === "processing" ? "running" : j.status;
        const working = st === "queued" || st === "running";
        return (
          <li key={j.id} className="crm-job" data-s={st}>
            <i aria-hidden="true">{st === "ready" ? <IconCheck /> : st === "failed" || st === "expired" ? <IconAlert /> : <IconRefresh />}</i>
            <span>
              <b>{t("job", { scope: t.has(`scope.${j.scope}`) ? t(`scope.${j.scope}`) : t("scope.leads") })}</b>
              <small>{t.has(`state.${st}`) ? t(`state.${st}`) : t("state.queued")}</small>
              {working ? <span className="crm-jobbar" role="progressbar" aria-label={t(`state.${st}`)} /> : null}
              {st === "failed" && j.error ? <small className="crm-bad">{j.error}</small> : null}
            </span>
            {st === "ready" ? (
              <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={() => void save(j)} disabled={!!saving} aria-busy={saving === j.id || undefined}>
                <IconDownload aria-hidden="true" />
                {t("download")}
              </button>
            ) : null}
            {!working ? (
              <button type="button" className="crm-icobtn" onClick={() => dismissCrmExport(j.id)} aria-label={t("dismiss")} title={t("dismiss")}>
                ×
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
