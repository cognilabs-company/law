"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Ban, CheckCircle2, ChevronRight, CircleDashed, CircleX, ListChecks, Loader, RotateCcw } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtDateTime } from "@/lib/date";
import { ApiError, isAborted, logApiError } from "@/lib/http";
import { notify, toast } from "@/lib/toast";
import { getCrmLead, type CrmLead } from "@/lib/services/crm";
import {
  cancelAutomationRun,
  getAutomationRun,
  listAutomationRulesX,
  listAutomationRunsX,
  retryAutomationRun,
  type AutomationRule,
  type AutomationRunX,
} from "@/lib/services/crmAutomation";
import { useCrmEvents } from "@/lib/crm/useCrm";
import Modal from "@/components/admin/Modal";
import CrmFrame from "../CrmFrame";
import { CrmSelect } from "../fields";
import { useCrmError } from "../bits";
import { LeadPicker, Readable, actionLabel, statusTone, useCatalog, useRunStatus } from "./shared";

// Robot runs (ROP contract §18): filter by status, robot and lead; open a
// run to read every step (input, output, attempts, errors); retry from a
// step or cancel — only when the run allows it. A refusal
// (not_retryable / not_cancellable) is a business message, not a crash.

const STATUSES = ["scheduled", "running", "completed", "failed", "partially_failed", "cancelled", "waiting_approval"];
const LIMIT = 50;

export default function RobotRuns(): ReactElement {
  const t = useTranslations("rop");
  return (
    <CrmFrame section="runs" title={t("nav.runs")} noTray>
      {() => <Runs />}
    </CrmFrame>
  );
}

function Runs(): ReactElement {
  const t = useTranslations("rop.runs");
  const locale = useLocale();
  const crmErr = useCrmError();
  const params = useSearchParams();
  const st = useRunStatus();
  const { data: catalog } = useCatalog();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [ruleId, setRuleId] = useState(params.get("rule") ?? "");
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [rows, setRows] = useState<AutomationRunX[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string>(params.get("run") ?? "");
  const [tick, setTick] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  // ?lead= from a lead page: the lead is read so its name shows, not its id.
  useEffect(() => {
    const id = params.get("lead");
    if (!id) return;
    const ctl = new AbortController();
    getCrmLead(id, ctl.signal).then(setLead, (e) => !isAborted(e) && logApiError("crm.runs.lead", e));
    return () => ctl.abort();
  }, [params]);
  useEffect(() => {
    const ctl = new AbortController();
    listAutomationRulesX({}, ctl.signal).then((r) => setRules(r.items), (e) => !isAborted(e) && logApiError("crm.runs.rules", e));
    return () => ctl.abort();
  }, []);
  useEffect(() => {
    const ctl = new AbortController();
    listAutomationRunsX({ status, ruleId, leadId: lead?.id, limit: LIMIT, offset }, ctl.signal).then(
      (r) => {
        setRows(r.items);
        setTotal(r.total);
        setErr("");
      },
      (e) => {
        if (isAborted(e)) return;
        logApiError("crm.runs", e);
        setErr(crmErr(e));
        setRows((cur) => cur ?? []);
      },
    );
    return () => ctl.abort();
  }, [status, ruleId, lead?.id, offset, tick, crmErr]);
  useCrmEvents((ev) => {
    if (!ev.invalidate.some((x) => x === "all" || x === "automation")) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTick((n) => n + 1), 900);
  });

  return (
    <div className="rop-page" data-rop-runs="">
      <section className="rop-card" aria-label={t("filters")}>
        <div className="rb-filters">
          <CrmSelect value={status} onChange={(v) => { setStatus(v); setOffset(0); }} label={t("status.label")} options={[{ value: "", label: t("anyStatus") }, ...STATUSES.map((s) => ({ value: s, label: st(s) }))]} />
          <CrmSelect value={ruleId} onChange={(v) => { setRuleId(v); setOffset(0); }} label={t("rule")} search options={[{ value: "", label: t("anyRule") }, ...rules.map((r) => ({ value: r.id, label: r.name }))]} />
          <div className="rb-filters__lead"><LeadPicker value={lead} onChange={(l) => { setLead(l); setOffset(0); }} /></div>
        </div>
      </section>
      <section className="rop-card" aria-label={t("list")}>
        <div className="rop-card__h">
          <h2 className="rop-h2"><ListChecks aria-hidden="true" />{t("list")}</h2>
          <span className="rop-pill">{t("totalN", { n: total })}</span>
        </div>
        {err ? <p className="rop-pill rop-pill--bad">{err}</p> : null}
        {!rows ? (
          <div className="rop-list" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span key={i} className="rop-sk" />)}</div>
        ) : !rows.length ? (
          <div className="rop-empty"><span className="rop-empty__ic"><ListChecks /></span><b>{t("empty")}</b></div>
        ) : (
          <ul className="rop-list">
            {rows.map((r) => {
              const tone = statusTone(r.status);
              return (
                <li key={r.id}>
                  <button type="button" className="rop-row" onClick={() => setOpen(r.id)} data-run={r.id}>
                    <span className="rop-ic" data-tone={tone || undefined}><RunIcon status={r.status} /></span>
                    <span className="rop-row__b">
                      <b>{r.ruleName || t("robot")}</b>
                      <small>{[r.leadWorkId || r.leadTitle, r.startedAt || r.scheduledAt ? fmtDateTime(r.startedAt || r.scheduledAt, locale) : "", r.attempts > 1 ? t("attemptsN", { n: r.attempts }) : ""].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className={`rop-pill${tone ? ` rop-pill--${tone}` : ""}`}>{st(r.status)}</span>
                    <ChevronRight aria-hidden="true" style={{ width: 18, height: 18, color: "var(--lx-gray)" }} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {rows && total > LIMIT ? (
          <div className="rop-toolbar">
            <button type="button" className="crm-btn" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>{t("prev")}</button>
            <span className="rop-muted">{t("page", { from: offset + 1, to: Math.min(total, offset + LIMIT), total })}</span>
            <button type="button" className="crm-btn" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>{t("next")}</button>
          </div>
        ) : null}
      </section>
      {open ? <RunDetail id={open} catalogLabel={(k) => actionLabel(catalog, k)} onClose={() => setOpen("")} onChanged={() => setTick((n) => n + 1)} /> : null}
    </div>
  );
}

function RunIcon({ status }: { status: string }): ReactElement {
  const tone = statusTone(status);
  if (tone === "ok") return <CheckCircle2 style={{ color: "var(--lx-ok)" }} />;
  if (tone === "bad") return <CircleX style={{ color: "var(--lx-err)" }} />;
  if (status === "running" || status === "retrying") return <Loader className="rb-spin" />;
  if (status === "cancelled" || status === "canceled") return <Ban />;
  return <CircleDashed />;
}

function RunDetail({ id, catalogLabel, onClose, onChanged }: { id: string; catalogLabel: (k: string) => string; onClose: () => void; onChanged: () => void }): ReactElement {
  const t = useTranslations("rop.runs");
  const locale = useLocale();
  const crmErr = useCrmError();
  const st = useRunStatus();
  const [run, setRun] = useState<AutomationRunX | null>(null);
  const [err, setErr] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState<"" | "retry" | "cancel">("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    getAutomationRun(id, ctl.signal).then(
      (r) => {
        setRun(r);
        setErr("");
      },
      (e) => {
        if (isAborted(e)) return;
        setErr(crmErr(e));
      },
    );
    return () => ctl.abort();
  }, [id, tick, crmErr]);
  useCrmEvents((ev) => {
    if (ev.runId === id || ev.invalidate.includes("all")) setTick((n) => n + 1);
  });
  const act = async (kind: "retry" | "cancel") => {
    if (!run || busy) return;
    setBusy(kind);
    try {
      const next = kind === "retry" ? await retryAutomationRun(run.id, from === "" ? null : Number(from)) : await cancelAutomationRun(run.id);
      setRun(next.id ? next : run);
      notify.success(t(kind === "retry" ? "retried" : "cancelled"));
      onChanged();
      setTick((n) => n + 1);
    } catch (e) {
      // §18: a run that may no longer be retried/cancelled is a business
      // conflict — say so and read the run again.
      const code = e instanceof ApiError ? e.code : "";
      toast(code === "crm_automation_run_not_retryable" || code === "crm_automation_run_not_cancellable" ? crmErr(e) : crmErr(e), { tone: code ? "info" : "err" });
      setTick((n) => n + 1);
    } finally {
      setBusy("");
    }
  };
  return (
    <Modal open onClose={onClose} title={run?.ruleName || t("robot")} wide>
      {err ? (
        <p className="rop-pill rop-pill--bad">{err}</p>
      ) : !run ? (
        <span className="rop-sk" style={{ height: 200 }} aria-busy="true" />
      ) : (
        <div className="rb-run" data-rb-run={run.status}>
          <div className="rop-toolbar">
            <span className={`rop-pill rop-pill--${statusTone(run.status) || "blue"}`}>{st(run.status)}</span>
            {run.leadId ? <Link href={`/admin/crm/leads/${encodeURIComponent(run.leadId)}`} className="crm-btn">{run.leadWorkId || run.leadTitle || t("lead")}</Link> : null}
          </div>
          <dl className="rop-kv">
            {run.scheduledAt ? (<><dt>{t("scheduled")}</dt><dd>{fmtDateTime(run.scheduledAt, locale)}</dd></>) : null}
            {run.startedAt ? (<><dt>{t("started")}</dt><dd>{fmtDateTime(run.startedAt, locale)}</dd></>) : null}
            {run.completedAt ? (<><dt>{t("finished")}</dt><dd>{fmtDateTime(run.completedAt, locale)}</dd></>) : null}
            <dt>{t("attempts")}</dt>
            <dd>{run.attempts}</dd>
          </dl>
          {run.error ? <p className="rb-err" role="alert">{run.error}</p> : null}
          <h3 className="rop-h2" style={{ fontSize: "1rem" }}>{t("steps")}</h3>
          {run.steps.length ? (
            <ol className="rb-runsteps">
              {run.steps.map((s) => (
                <li key={s.index} data-status={s.status}>
                  <span className="rb-runsteps__dot" data-tone={statusTone(s.status) || undefined}><RunIcon status={s.status} /></span>
                  <div className="rb-runsteps__b">
                    <div className="rop-toolbar">
                      <b>{t("stepN", { n: s.index + 1 })} · {catalogLabel(s.type)}</b>
                      <span className={`rop-pill${statusTone(s.status) ? ` rop-pill--${statusTone(s.status)}` : ""}`}>{st(s.status)}</span>
                      {s.attempts ? <span className="rop-pill">{t("attemptsN", { n: s.attempts })}</span> : null}
                    </div>
                    {s.error ? <p className="rb-err">{s.error}</p> : null}
                    <details>
                      <summary>{t("input")}</summary>
                      <Readable data={s.input} />
                    </details>
                    <details>
                      <summary>{t("output")}</summary>
                      <Readable data={s.output} />
                    </details>
                    {s.startedAt || s.completedAt ? <small className="rop-muted">{[s.startedAt ? fmtDateTime(s.startedAt, locale) : "", s.completedAt ? fmtDateTime(s.completedAt, locale) : ""].filter(Boolean).join(" → ")}</small> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rop-muted">{t("noSteps")}</p>
          )}
          {run.canRetry || run.canCancel ? (
            <div className="rb-run__act">
              {run.canRetry ? (
                <>
                  {run.steps.length > 1 ? (
                    <CrmSelect value={from} onChange={setFrom} label={t("retryFrom")} options={[{ value: "", label: t("retryFailed") }, ...run.steps.map((s) => ({ value: String(s.index), label: t("fromStep", { n: s.index + 1, name: catalogLabel(s.type) }) }))]} />
                  ) : null}
                  <button type="button" className="crm-btn crm-btn--pri" onClick={() => void act("retry")} disabled={!!busy} aria-busy={busy === "retry" || undefined} data-rb-retry="">
                    <RotateCcw aria-hidden="true" />
                    {t("retry")}
                  </button>
                </>
              ) : null}
              {run.canCancel ? (
                <button type="button" className="crm-btn" onClick={() => void act("cancel")} disabled={!!busy} aria-busy={busy === "cancel" || undefined} data-rb-cancel="">
                  <Ban aria-hidden="true" />
                  {t("cancel")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
