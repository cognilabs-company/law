"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { saveBlob } from "@/lib/download";
import { notify } from "@/lib/toast";
import { hrmErrorOf } from "@/lib/services/hrm";
import { employeeLifecycle, exportEmployees, getEmployeeDetail, getReadiness, LIFECYCLE_STATUSES, type Lifecycle } from "@/lib/services/hrmOps";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import InternalField from "@/components/internal/InternalField";
import { HrmDrawer, HrmError, HrmLoading, HrmPanel, useStatusLabel } from "@/components/internal/HrmUi";
import { useHrmText } from "@/components/internal/hrm/text";
import { domainHref } from "@/components/internal/hrm/routes";
import { useHrmCatalog } from "@/lib/services/hrm";
import { IconAlert, IconCheck, IconClipboardCheck, IconDownload, IconFolder, IconLogout, IconRefresh, IconUserPlus } from "@/components/icons";
import { dayToIso, opsError, todayIso, useOps } from "./useOps";
import FieldErr from "./FieldErr";

// Readiness (GET /internal/employees/{id}/readiness): what this person
// still needs before they can work — profile, assignment, documents,
// contract, training — each check as the backend judged it.
export function ReadinessPanel({ id }: { id: string }) {
  const t = useTranslations("internal.ops.ready");
  const { data, error, reload } = useOps((s) => getReadiness(id, s), [id], ["people", "employment", "documents", "lms", "onboarding"]);
  const done = data?.checks.filter((c) => c.status === "ok").length ?? 0;
  return (
    <HrmPanel title={t("title")} icon={IconClipboardCheck} count={data ? `${done}/${data.checks.length}` : undefined}>
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} /> : !data ? <HrmLoading rows={3} /> : (
        <>
          <p className={`ops-ready__sum${data.ready ? " is-ok" : ""}`}>{data.ready ? <IconCheck aria-hidden /> : <IconAlert aria-hidden />}{data.ready ? t("ready") : t("notReady")}</p>
          <ul className="ops-ready">
            {data.checks.map((c) => (
              <li key={c.key} className={`is-${c.status === "ok" ? "ok" : c.status === "warning" || c.status === "pending" ? "warn" : "miss"}`}>
                <span className="ops-ready__dot" aria-hidden>{c.status === "ok" ? <IconCheck /> : null}</span>
                <b>{c.label || (t.has(`check.${c.key}`) ? t(`check.${c.key}`) : c.key)}</b>
                <small>{t.has(`state.${c.status}`) ? t(`state.${c.status}`) : c.status}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </HrmPanel>
  );
}

// How many HRM records the person has in each module (record_counts of
// GET /internal/employees/{id}), each opening its module filtered to them.
export function ModuleCounts({ id }: { id: string }) {
  const t = useTranslations("internal.ops.ready");
  const { module } = useHrmText();
  const cat = useHrmCatalog();
  const { data } = useOps((s) => getEmployeeDetail(id, s), [id], ["hrm"]);
  const list = Object.entries(data?.counts ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!data || !list.length) return null;
  return (
    <HrmPanel title={t("records")} icon={IconFolder} count={list.reduce((s, [, n]) => s + n, 0)}>
      <ul className="ops-counts">
        {list.map(([d, n]) => (
          <li key={d}>
            <Link href={`${domainHref(d, "")}${domainHref(d, "").includes("?") ? "&" : "?"}employee=${encodeURIComponent(id)}`}>
              <span>{module(cat.data?.modules.find((m) => m.key === d) ?? null, d)}</span>
              <b>{n}</b>
            </Link>
          </li>
        ))}
      </ul>
    </HrmPanel>
  );
}

// Which lifecycle steps fit the person's status: a dismissed person can only
// be reinstated, someone not yet hired only hired.
export function lifecycleFor(status: string): Lifecycle[] {
  const s = status.toLowerCase();
  if (/terminat|dismiss|fired|offboard/.test(s)) return ["reinstate"];
  if (!s || /candidate|draft|new|pending|pre_?hire|hired_pending/.test(s)) return ["hire"];
  return ["status", "dismiss"];
}

export function LifecycleButtons({ id, name, status, onDone }: { id: string; name: string; status: string; onDone: () => void }) {
  const t = useTranslations("internal.ops.life");
  const [open, setOpen] = useState<Lifecycle | "">("");
  const Icon = { hire: IconUserPlus, status: IconRefresh, dismiss: IconLogout, reinstate: IconUserPlus } as const;
  return (
    <>
      {lifecycleFor(status).map((a) => {
        const I = Icon[a];
        return (
          <button key={a} type="button" className={`btn btn--sm ${a === "dismiss" ? "btn--line ops-danger" : "btn--line"}`} onClick={() => setOpen(a)}>
            <I />
            {t(`action.${a}`)}
          </button>
        );
      })}
      {open ? <LifecycleDrawer id={id} name={name} action={open} current={status} onClose={() => setOpen("")} onDone={() => { setOpen(""); onDone(); }} /> : null}
    </>
  );
}

function LifecycleDrawer({ id, name, action, current, onClose, onDone }: { id: string; name: string; action: Lifecycle; current: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("internal.ops.life");
  const label = useStatusLabel();
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState<string>(LIFECYCLE_STATUSES.find((s) => s !== current) ?? "suspended");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const needsReason = action !== "hire";
  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (busy || !date || (needsReason && !reason.trim())) return;
    setBusy(true);
    setErr(null);
    try {
      await employeeLifecycle(id, action, { ...(action === "status" ? { status } : {}), date: dayToIso(date, "09:00"), reason: reason.trim() });
      notify.success(t(`done.${action}`, { name }));
      onDone();
    } catch (cause) {
      const x = hrmErrorOf(cause);
      setErr({ message: x.message || opsError(cause) || t("error"), fields: x.fields });
    } finally {
      setBusy(false);
    }
  }
  return (
    <HrmDrawer open onClose={onClose} title={t(`action.${action}`)} sub={name}>
      <form className="hrm-form" onSubmit={submit} noValidate>
        <p className="hrm-form__note">{t(`lead.${action}`)}</p>
        {err ? <HrmError text={err.message} /> : null}
        {action === "status" ? (
          <InternalField label={t("status")}>
            <Select value={status} onChange={setStatus} options={LIFECYCLE_STATUSES.filter((s) => s !== current).map((s) => ({ value: s, label: label(s) }))} ariaLabel={t("status")} />
          </InternalField>
        ) : null}
        <div>
          <InternalField label={t("date")}>
            <DatePicker value={date} onChange={setDate} placeholder={t("date")} ariaLabel={t("date")} />
          </InternalField>
          <FieldErr text={err?.fields.date} />
        </div>
        <div>
          <InternalField label={needsReason ? `${t("reason")} *` : t("reason")}>
            <textarea rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPh")} aria-invalid={tried && needsReason && !reason.trim()} />
          </InternalField>
          <FieldErr text={err?.fields.reason ?? (tried && needsReason && !reason.trim() ? t("reasonNeeded") : undefined)} />
        </div>
        <div className="hrm-form__foot">
          <button type="submit" className={`btn btn--sm ${action === "dismiss" ? "btn--danger" : "btn--pri"}`} disabled={busy}>
            {busy ? <span className="stu-spin" aria-hidden /> : <IconCheck />}
            {t(`confirm.${action}`)}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// GET /internal/employees/export.xlsx — the file keeps the server's name.
export function ExportEmployeesButton() {
  const t = useTranslations("internal.ops.life");
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--line btn--sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { blob, name } = await exportEmployees();
          saveBlob(blob, name || "lexgo-employees.xlsx");
        } catch (e) {
          notify.error(t("exportError"), { error: e });
        } finally {
          setBusy(false);
        }
      }}
    >
      <IconDownload />
      {busy ? t("exporting") : t("export")}
    </button>
  );
}
