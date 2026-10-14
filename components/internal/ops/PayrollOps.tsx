"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/toast";
import { hrmErrorOf } from "@/lib/services/hrm";
import { createPayrollRun, getMyPayslips, listPayrollRuns, payrollRunAction, RUN_ACTIONS, RUN_NEXT, type PayrollRun, type RunAction } from "@/lib/services/hrmOps";
import DatePicker from "@/components/DatePicker";
import MonthPicker from "@/components/MonthPicker";
import SearchSelect from "@/components/SearchSelect";
import InternalField from "@/components/internal/InternalField";
import { monthRange } from "@/components/internal/HrmCalendar";
import { EntitySelect, HrmDrawer, HrmEmpty, HrmError, HrmHead, HrmLoading, HrmPanel, HrmStatus, useHrmFormat, useStatusLabel } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { ReasonModal } from "@/components/internal/live/bits";
import { IconArrowRight, IconCard, IconCoins, IconFileText, IconHistory, IconPlus, IconRefresh } from "@/components/icons";
import { opsError, useOps } from "./useOps";
import FieldErr from "./FieldErr";

const thisMonth = () => new Date().toISOString().slice(0, 7);
// Totals the backend sends that are counts, not money.
const COUNT_KEYS = /count|employees|entries|lines|people/;

// Payroll runs (§11): a period, the people in it, and the backend's own
// moves — calculate, recalculate, submit, approve, pay, close, cancel.
// Totals and status history are shown as the backend returns them; nothing
// is added up in the browser.
export function PayrollRunsPanel() {
  const t = useTranslations("internal.ops.runs");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [period, setPeriod] = useState("");
  const [openId, setOpenId] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useOps((s) => listPayrollRuns({ period: period || undefined }, s), [period], ["payroll"]);
  const open = data?.items.find((r) => r.id === openId) ?? null;
  return (
    <HrmPanel
      title={t("title")}
      icon={IconCoins}
      className="ops-panel"
      count={data?.total}
      actions={
        <>
          <button type="button" className="btn btn--line btn--sm" onClick={reload}><IconRefresh />{t("refresh")}</button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => setCreating(true)}><IconPlus />{t("new")}</button>
        </>
      }
    >
      <div className="ops-bar">
        <div className="ops-bar__m"><MonthPicker value={period} onChange={setPeriod} placeholder={t("anyPeriod")} ariaLabel={t("period")} clearLabel={t("clear")} /></div>
      </div>
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} /> : !data ? <HrmLoading rows={3} /> : !data.items.length ? (
        <HrmEmpty icon={IconCoins} title={t("empty")} text={t("emptyText")} action={<button type="button" className="btn btn--pri btn--sm" onClick={() => setCreating(true)}><IconPlus />{t("new")}</button>} />
      ) : (
        <div className="hrm-table-wrap">
          <table className="hrm-table">
            <thead><tr><th>{t("col.run")}</th><th>{t("col.period")}</th><th>{t("col.scope")}</th><th className="hrm-num">{t("col.net")}</th><th>{t("col.status")}</th></tr></thead>
            <tbody>
              {data.items.map((r) => {
                const net = r.totals.net ?? r.totals.net_amount ?? r.totals.total_net ?? r.totals.payable ?? r.totals.total;
                return (
                  <tr key={r.id} className="is-click" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(r.id)}>
                    <td><b>{r.title || r.code || t("run")}</b>{r.code && r.title ? <small>{r.code}</small> : null}</td>
                    <td className="hrm-muted">{r.period ? f.period(r.period) : [f.date(r.start), f.date(r.end)].join(" — ")}</td>
                    <td className="hrm-muted">{[dir.unitName(r.unitId) || t("allUnits"), r.employeeIds.length ? t("people", { n: r.employeeIds.length }) : ""].filter(Boolean).join(" · ")}</td>
                    <td className="hrm-num">{net !== undefined ? f.money(net) : "—"}</td>
                    <td><HrmStatus value={r.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open ? <RunDrawer run={open} onClose={() => setOpenId("")} onChanged={reload} /> : null}
      {creating ? <RunCreate onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); reload(); if (r.id) setOpenId(r.id); }} /> : null}
    </HrmPanel>
  );
}

function RunDrawer({ run: seed, onClose, onChanged }: { run: PayrollRun; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("internal.ops.runs");
  const f = useHrmFormat();
  const label = useStatusLabel();
  const dir = useHrmDirectory();
  const [run, setRun] = useState(seed);
  const [busy, setBusy] = useState<RunAction | "">("");
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState<RunAction | "">("");
  const allowed = (run.allowed.length ? run.allowed.filter((a): a is RunAction => (RUN_ACTIONS as readonly string[]).includes(a)) : RUN_NEXT[run.status] ?? []);
  async function act(a: RunAction, reason = "") {
    setBusy(a);
    setErr("");
    try {
      const next = await payrollRunAction(run.id, a, reason);
      setRun(next.id ? next : run);
      notify.success(t(`done.${a}`));
      onChanged();
    } catch (cause) {
      setErr(hrmErrorOf(cause).message || opsError(cause) || t("actionError"));
      // The run may have moved on elsewhere: read it again.
      onChanged();
      throw cause;
    } finally {
      setBusy("");
    }
  }
  const totals = Object.entries(run.totals);
  return (
    <HrmDrawer open onClose={onClose} title={run.title || run.code || t("run")} sub={[run.code, run.period ? f.period(run.period) : `${f.date(run.start)} — ${f.date(run.end)}`].filter(Boolean).join(" · ")}>
      <div className="hrm-chips"><HrmStatus value={run.status} />{run.unitId ? <span className="hrm-muted">{dir.unitName(run.unitId)}</span> : null}</div>
      {err ? <HrmError text={err} /> : null}
      {allowed.length ? (
        <div className="hr-moves ops-moves">
          {allowed.map((a) => (
            <button key={a} type="button" className={`btn btn--sm ${a === "cancel" ? "btn--line ops-danger" : a === "recalculate" ? "btn--line" : "btn--pri"}`} disabled={Boolean(busy)} onClick={() => (a === "cancel" ? setAsking(a) : void act(a).catch(() => undefined))}>
              {busy === a ? <span className="stu-spin" aria-hidden /> : <IconArrowRight />}
              {t(`action.${a}`)}
            </button>
          ))}
        </div>
      ) : <p className="hrm-muted">{t("noActions")}</p>}
      <div className="ldrw__sec">
        <span className="ldrw__lbl">{t("totals")}</span>
        {totals.length ? (
          <ul className="hrm-calc__rows">
            {totals.map(([k, v]) => (
              <li key={k} className={/net|payable/.test(k) ? "is-total" : /deduct|penalt|advance|tax/.test(k) ? "is-minus" : undefined}>
                <span>{t.has(`total.${k}`) ? t(`total.${k}`) : k.replace(/_/g, " ")}</span>
                <b>{COUNT_KEYS.test(k) ? f.num(v) : f.money(v)}</b>
              </li>
            ))}
          </ul>
        ) : <p className="hrm-muted">{t("noTotals")}</p>}
      </div>
      <div className="ldrw__sec">
        <span className="ldrw__lbl"><IconHistory aria-hidden /> {t("history")}</span>
        {run.history.length ? (
          <ol className="ops-hist">
            {run.history.map((h, i) => (
              <li key={i}>
                <HrmStatus value={h.status} />
                <small>{[h.at ? f.dateTime(h.at) : "", h.by && !/^[0-9a-f-]{36}$/i.test(h.by) ? h.by : dir.userName(h.by) || ""].filter(Boolean).join(" · ")}</small>
                {h.reason ? <q>{h.reason}</q> : null}
              </li>
            ))}
          </ol>
        ) : <p className="hrm-muted">{t("noHistory", { status: label(run.status) })}</p>}
      </div>
      {run.employeeIds.length ? (
        <div className="ldrw__sec">
          <span className="ldrw__lbl">{t("people", { n: run.employeeIds.length })}</span>
          <p className="hrm-muted">{run.employeeIds.map((id) => dir.employeeName(id) || "—").join(", ")}</p>
        </div>
      ) : null}
      <ReasonModal
        open={asking === "cancel"}
        title={t("cancelTitle")}
        lead={t("cancelLead")}
        label={t("reason")}
        placeholder={t("reasonPh")}
        submitLabel={t("action.cancel")}
        onClose={() => setAsking("")}
        onSubmit={(reason) => act("cancel", reason)}
      />
    </HrmDrawer>
  );
}

function RunCreate({ onClose, onDone }: { onClose: () => void; onDone: (r: PayrollRun) => void }) {
  const t = useTranslations("internal.ops.runs");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const first = monthRange(thisMonth());
  const [period, setPeriod] = useState(thisMonth());
  const [start, setStart] = useState(first.from);
  const [end, setEnd] = useState(first.to);
  const [unit, setUnit] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const pickPeriod = (v: string) => {
    setPeriod(v);
    if (v) {
      const r = monthRange(v);
      setStart(r.from);
      setEnd(r.to);
    }
  };
  // The people offered are the chosen unit's; none picked means all of them.
  const options = unit ? dir.employeeOptions.filter((o) => dir.employee(o.value)?.unitId === unit) : dir.employeeOptions;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !start || !end || end < start) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await createPayrollRun({ title: title.trim() || [t("run"), period ? f.period(period) : `${start} — ${end}`, dir.unitName(unit)].filter(Boolean).join(" · "), period_start: start, period_end: end, ...(period ? { period } : {}), org_unit_id: unit || null, employee_ids: people });
      notify.success(t("created"));
      onDone(r);
    } catch (cause) {
      const x = hrmErrorOf(cause);
      setErr({ message: x.message || opsError(cause) || t("createError"), fields: x.fields });
    } finally {
      setBusy(false);
    }
  }
  return (
    <HrmDrawer open onClose={onClose} title={t("new")} sub={t("newLead")}>
      <form className="hrm-form" onSubmit={submit} noValidate>
        {err ? <HrmError text={err.message} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("period")}><MonthPicker value={period} onChange={pickPeriod} placeholder={t("anyPeriod")} ariaLabel={t("period")} /></InternalField>
          <InternalField label={t("unit")}><EntitySelect value={unit} onChange={(v) => { setUnit(v); setPeople([]); }} options={dir.unitOptions} placeholder={t("allUnits")} ariaLabel={t("unit")} /></InternalField>
          <div>
            <InternalField label={t("start")}><DatePicker value={start} onChange={setStart} placeholder={t("start")} ariaLabel={t("start")} max={end || undefined} /></InternalField>
            <FieldErr text={err?.fields.period_start} />
          </div>
          <div>
            <InternalField label={t("end")}><DatePicker value={end} onChange={setEnd} placeholder={t("end")} ariaLabel={t("end")} min={start || undefined} /></InternalField>
            <FieldErr text={err?.fields.period_end ?? (end && start && end < start ? t("badRange") : undefined)} />
          </div>
        </div>
        <div>
          <InternalField label={t("employees")} hint={t("employeesHint")}>
            <SearchSelect value={people} onChange={setPeople} options={options} placeholder={t("everyone")} searchPlaceholder={t("search")} emptyText="—" ariaLabel={t("employees")} />
          </InternalField>
          <FieldErr text={err?.fields.employee_ids} />
        </div>
        <InternalField label={t("name")}><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></InternalField>
        <p className="hrm-form__note">{t("newNote")}</p>
        <div className="hrm-form__foot">
          <button type="submit" className="btn btn--pri btn--sm" disabled={busy || !start || !end || end < start}>{busy ? <span className="stu-spin" aria-hidden /> : <IconPlus />}{t("create")}</button>
          <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// GET /internal/me/payslips: one's own approved and paid entries, month by
// month, with the total the backend counted.
export function PayslipsPage() {
  const t = useTranslations("internal.ops.slips");
  const to = useTranslations("internal.operations");
  const f = useHrmFormat();
  const { data, error, reload } = useOps((s) => getMyPayslips(s), [], ["payroll"]);
  const typeLabel = (k: string) => (to.has(`entryTypes.${k}`) ? to(`entryTypes.${k}`) : k.replace(/_/g, " "));
  return (
    <section className="hrm-page">
      <HrmHead title={t("title")} lead={t("lead")} actions={<button type="button" className="btn btn--line btn--sm" onClick={reload}><IconRefresh />{t("refresh")}</button>} />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("retry")} /> : !data ? <HrmPanel><HrmLoading rows={4} /></HrmPanel> : !data.length ? (
        <HrmPanel><HrmEmpty icon={IconFileText} title={t("empty")} text={t("emptyText")} /></HrmPanel>
      ) : (
        <div className="ops-slips">
          {data.map((p) => (
            <HrmPanel key={p.period} title={f.period(p.period)} icon={IconCard}>
              <ul className="hrm-calc__rows">
                {p.entries.map((e) => {
                  const minus = /penalt|deduct|advance/.test(e.type);
                  return (
                    <li key={e.id || e.title} className={minus ? "is-minus" : undefined}>
                      <span>{e.title || typeLabel(e.type)}<small className="hrm-muted"> · {typeLabel(e.type)}</small></span>
                      <b>{minus ? "−" : ""}{f.money(e.amount)} <HrmStatus value={e.status} /></b>
                    </li>
                  );
                })}
                <li className="is-total"><span>{t("total")}</span><b>{f.money(p.total)}{p.currency && p.currency !== "UZS" ? ` ${p.currency}` : ""}</b></li>
              </ul>
            </HrmPanel>
          ))}
        </div>
      )}
    </section>
  );
}
