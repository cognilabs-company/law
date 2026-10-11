"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { asDict, asStr } from "@/lib/http";
import { getMyProfile } from "@/lib/services/internalHrm";
import { HRM_DOMAINS, HRM_FLOW, createHrmRecord, getHrmRecord, getHrmRecords, transitionHrmRecord, type HrmRecord } from "@/lib/services/internalLive";
import { humanize } from "@/lib/labels";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import InternalField from "@/components/internal/InternalField";
import { IconArrowRight, IconCheck, IconClose, IconFolder, IconHistory, IconPlus, IconRefresh } from "@/components/icons";
import { EntitySelect, HrmDrawer, HrmEmpty, HrmError, HrmHead, HrmKv, HrmLoading, HrmPanel, HrmPerson, HrmSection, HrmStatus, useHrmFormat, useStatusLabel } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { ReasonModal, apiMessage, zonedIso } from "@/components/internal/live/bits";

// The domains grouped the way HR people think of them.
const GROUPS: { key: string; domains: string[] }[] = [
  { key: "people", domains: ["people", "employment", "documents", "skills"] },
  { key: "time", domains: ["scheduling", "attendance", "timesheet", "leave", "travel"] },
  { key: "work", domains: ["tasks", "workflow", "payroll"] },
  { key: "lifecycle", domains: ["recruiting", "onboarding", "offboarding", "movements"] },
  { key: "company", domains: ["policies", "lms", "notifications", "analytics"] },
];
// Record types offered per domain; any other type can still be typed.
const TYPES: Record<string, string[]> = {
  people: ["profile_update", "emergency_contact"],
  employment: ["contract", "contract_change", "probation"],
  documents: ["personal_document", "certificate", "agreement"],
  skills: ["skill", "assessment"],
  scheduling: ["shift_plan", "shift_swap"],
  attendance: ["manual_correction", "remote_day"],
  timesheet: ["monthly_timesheet", "overtime"],
  leave: ["annual_leave", "sick_leave", "unpaid_leave", "maternity_leave"],
  travel: ["business_trip"],
  tasks: ["hr_task"],
  workflow: ["approval_flow"],
  payroll: ["bonus_request", "advance_request", "deduction"],
  recruiting: ["vacancy", "candidate", "interview", "offer"],
  onboarding: ["onboarding_plan"],
  offboarding: ["resignation", "exit_checklist"],
  movements: ["transfer", "promotion", "demotion"],
  policies: ["policy", "policy_ack"],
  lms: ["course", "course_assignment"],
  notifications: ["hr_announcement"],
  analytics: ["hr_report"],
};
const NEGATIVE = new Set(["rejected", "returned", "cancelled", "archived", "draft"]);

// "HR jarayonlari" (guide §19): every HR process through one universal record
// API — leave, travel, recruiting, onboarding, offboarding, movements,
// policies, LMS and the rest — with the status flow the backend enforces and
// the transition history it keeps.
export default function HrProcessesPage() {
  const t = useTranslations("internal.hr");
  const f = useHrmFormat();
  const label = useStatusLabel();
  const dir = useHrmDirectory();
  const [domain, setDomain] = useState<string>("leave");
  const [status, setStatus] = useState("");
  const [employee, setEmployee] = useState("");
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ key: string; rows: HrmRecord[]; total: number; err: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState("");
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const key = `${domain}|${status}|${employee}|${tick}`;

  // One's own record is the default subject of a new request (a leave, a
  // trip) — staff without HR rights have no list to pick from.
  useEffect(() => {
    const c = new AbortController();
    getMyProfile(c.signal)
      .then((p) => {
        const e = asDict(asDict(p).employee);
        if (!c.signal.aborted && asStr(e.id)) setMe({ id: asStr(e.id), name: asStr(e.display_name) });
      })
      .catch(() => undefined);
    return () => c.abort();
  }, []);

  useEffect(() => {
    const c = new AbortController();
    getHrmRecords(domain, { status: status || undefined, employeeId: employee || undefined, limit: 100 }, c.signal)
      .then((r) => !c.signal.aborted && setState({ key, rows: r.items, total: r.total, err: "" }))
      .catch((e) => !c.signal.aborted && setState({ key, rows: [], total: 0, err: apiMessage(e, t("loadError")) }));
    return () => c.abort();
  }, [key, domain, status, employee, t]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => subscribeUserEvents((e) => /hrm|record/.test(e.event) && reload()), [reload]);

  const rows = state?.key === key ? state.rows : null;
  const err = state?.key === key ? state.err : "";
  const domainName = (d: string) => (t.has(`domains.${d}`) ? t(`domains.${d}`) : humanize(d));
  const typeName = (x: string) => (t.has(`types.${x}`) ? t(`types.${x}`) : humanize(x));
  const who = (id: string) => {
    const e = dir.employee(id);
    return { name: e?.name || e?.code || (id ? id.slice(0, 8) : "—"), sub: e?.code ?? "" };
  };

  return (
    <section className="hrm-page">
      <HrmHead
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        actions={
          <>
            <button className="btn btn--line btn--sm" type="button" onClick={reload}>
              <IconRefresh />
              {t("refresh")}
            </button>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}>
              <IconPlus />
              {t("new")}
            </button>
          </>
        }
      />
      <div className="hr-domains">
        {GROUPS.map((g) => (
          <div key={g.key} className="hr-domains__g">
            <span className="hr-domains__l">{t(`groups.${g.key}`)}</span>
            <div className="hr-domains__row">
              {g.domains.filter((d) => (HRM_DOMAINS as readonly string[]).includes(d)).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={domain === d ? "on" : ""}
                  aria-pressed={domain === d}
                  onClick={() => {
                    setDomain(d);
                    setOpenId("");
                  }}
                >
                  {domainName(d)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="fb-bar">
        <div className="fb-bar__sel">
          <Select value={status} onChange={setStatus} options={[{ value: "", label: t("allStatuses") }, ...Object.keys(HRM_FLOW).map((s) => ({ value: s, label: label(s) }))]} ariaLabel={t("status")} />
        </div>
        {dir.employeeOptions.length ? (
          <div className="fb-bar__sel fb-bar__sel--wide">
            <EntitySelect value={employee} onChange={setEmployee} options={dir.employeeOptions} placeholder={t("allEmployees")} ariaLabel={t("employee")} />
          </div>
        ) : null}
      </div>
      {err ? <HrmError text={err} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <HrmPanel title={domainName(domain)} icon={IconFolder} count={rows?.length} flush>
        {!rows ? (
          <div style={{ padding: 16 }}>
            <HrmLoading rows={4} />
          </div>
        ) : rows.length ? (
          <div className="hrm-table-wrap">
            <table className="hrm-table">
              <thead>
                <tr>
                  <th>{t("record")}</th>
                  <th>{t("employee")}</th>
                  <th>{t("period")}</th>
                  <th>{t("status")}</th>
                  <th>{t("updated")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="is-click" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(r.id)}>
                    <td>
                      <b>{r.title || typeName(r.type)}</b>
                      <small>{typeName(r.type)}</small>
                    </td>
                    <td>{r.employeeId ? <HrmPerson name={who(r.employeeId).name} sub={who(r.employeeId).sub} size="sm" /> : r.unitId ? dir.unitName(r.unitId) || "—" : "—"}</td>
                    <td className="hrm-muted">{r.from ? `${f.date(r.from)}${r.to ? ` — ${f.date(r.to)}` : ""}` : "—"}</td>
                    <td>
                      <HrmStatus value={r.status} />
                    </td>
                    <td className="hrm-muted">{f.dateTime(r.updatedAt || r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <HrmEmpty
            icon={IconFolder}
            title={t("empty", { domain: domainName(domain) })}
            text={t("emptyText")}
            action={
              <button className="btn btn--pri btn--sm" type="button" onClick={() => setCreating(true)}>
                <IconPlus />
                {t("new")}
              </button>
            }
          />
        )}
      </HrmPanel>
      {creating ? (
        <CreateDrawer
          me={me}
          domain={domain}
          domainName={domainName(domain)}
          typeName={typeName}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            reload();
            if (id) setOpenId(id);
          }}
        />
      ) : null}
      {openId ? <RecordDrawer domain={domain} id={openId} seed={rows?.find((r) => r.id === openId) ?? null} typeName={typeName} onClose={() => setOpenId("")} onChanged={reload} /> : null}
    </section>
  );
}

function CreateDrawer({ me, domain, domainName, typeName, onClose, onCreated }: { me: { id: string; name: string } | null; domain: string; domainName: string; typeName: (x: string) => string; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("internal.hr");
  const dir = useHrmDirectory();
  const types = TYPES[domain] ?? [];
  const [form, setForm] = useState({ type: types[0] ?? "", custom: "", title: "", employee: me?.id ?? "", unit: "", from: "", to: "", submit: false });
  const employeeOptions = dir.employeeOptions.length ? dir.employeeOptions : me ? [{ value: me.id, label: me.name || me.id.slice(0, 8) }] : [];
  const [fields, setFields] = useState<{ k: string; v: string }[]>(domain === "leave" ? [{ k: "days", v: "" }, { k: "reason", v: "" }] : [{ k: "", v: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const recordType = form.type === "__custom" ? form.custom.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_") : form.type;
  const ok = recordType && form.title.trim() && (!form.from || !form.to || form.to >= form.from);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !ok) return;
    setBusy(true);
    setErr("");
    const payload: Record<string, unknown> = {};
    for (const { k, v } of fields) {
      const key = k.trim();
      if (!key || !v.trim()) continue;
      const n = Number(v.replace(/\s/g, ""));
      payload[key] = /^-?\d+(\.\d+)?$/.test(v.trim()) && Number.isFinite(n) ? n : v.trim();
    }
    try {
      const created = await createHrmRecord(domain, {
        record_type: recordType,
        employee_id: form.employee || null,
        org_unit_id: form.unit || null,
        parent_id: null,
        title: form.title.trim(),
        status: "draft",
        effective_from: form.from ? zonedIso(form.from, "00:00") : null,
        effective_to: form.to ? zonedIso(form.to, "23:59").replace(":00+", ":59+") : null,
        payload,
      });
      const id = String((created as { id?: unknown })?.id ?? "");
      // "Send for approval" right away: draft → pending.
      if (form.submit && id) await transitionHrmRecord(domain, id, "pending", t("autoSubmit"));
      onCreated(id);
    } catch (cause) {
      setErr(apiMessage(cause, t("saveError")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <HrmDrawer open onClose={onClose} title={t("newIn", { domain: domainName })} sub={t("newLead")}>
      <form className="hrm-form" onSubmit={submit}>
        {err ? <HrmError text={err} /> : null}
        <div className="hrm-form__grid">
          <InternalField label={t("recordType")}>
            <Select value={form.type} onChange={(v) => setForm((c) => ({ ...c, type: v }))} options={[...types.map((x) => ({ value: x, label: typeName(x) })), { value: "__custom", label: t("otherType") }]} ariaLabel={t("recordType")} />
          </InternalField>
          {form.type === "__custom" ? (
            <InternalField label={t("customType")}>
              <input value={form.custom} onChange={(e) => setForm((c) => ({ ...c, custom: e.target.value }))} maxLength={60} placeholder="annual_leave" required />
            </InternalField>
          ) : null}
          <InternalField label={t("titleLabel")}>
            <input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} maxLength={200} required placeholder={t("titlePh")} />
          </InternalField>
          <InternalField label={t("employee")}>
            <EntitySelect value={form.employee} onChange={(v) => setForm((c) => ({ ...c, employee: v }))} options={employeeOptions} placeholder={t("pickEmployee")} ariaLabel={t("employee")} />
          </InternalField>
          <InternalField label={t("unit")}>
            <EntitySelect value={form.unit} onChange={(v) => setForm((c) => ({ ...c, unit: v }))} options={dir.unitOptions} placeholder={t("pickUnit")} ariaLabel={t("unit")} />
          </InternalField>
          <InternalField label={t("from")}>
            <DatePicker value={form.from} onChange={(v) => setForm((c) => ({ ...c, from: v }))} placeholder={t("from")} ariaLabel={t("from")} max={form.to || undefined} clearLabel={t("clear")} />
          </InternalField>
          <InternalField label={t("to")}>
            <DatePicker value={form.to} onChange={(v) => setForm((c) => ({ ...c, to: v }))} placeholder={t("to")} ariaLabel={t("to")} min={form.from || undefined} clearLabel={t("clear")} />
          </InternalField>
        </div>
        <div className="hr-kv">
          <span className="internal-field__label">{t("details")}</span>
          {fields.map((row, i) => (
            <div key={i} className="hr-kv__row">
              <input value={row.k} onChange={(e) => setFields((cur) => cur.map((x, j) => (j === i ? { ...x, k: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_") } : x)))} placeholder={t("key")} aria-label={t("key")} maxLength={40} />
              <input value={row.v} onChange={(e) => setFields((cur) => cur.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} placeholder={t("value")} aria-label={t("value")} maxLength={500} />
              <button type="button" className="fb-x" onClick={() => setFields((cur) => (cur.length > 1 ? cur.filter((_, j) => j !== i) : [{ k: "", v: "" }]))} aria-label={t("remove")}>
                <IconClose />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--line btn--sm" onClick={() => setFields((cur) => [...cur, { k: "", v: "" }])}>
            <IconPlus />
            {t("addField")}
          </button>
        </div>
        <label className="stu-check lv-check">
          <input type="checkbox" checked={form.submit} onChange={(e) => setForm((c) => ({ ...c, submit: e.target.checked }))} />
          <span>{t("submitNow")}</span>
        </label>
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !ok}>
            <IconCheck />
            {busy ? t("saving") : t("create")}
          </button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </HrmDrawer>
  );
}

function RecordDrawer({ domain, id, seed, typeName, onClose, onChanged }: { domain: string; id: string; seed: HrmRecord | null; typeName: (x: string) => string; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("internal.hr");
  const f = useHrmFormat();
  const label = useStatusLabel();
  const dir = useHrmDirectory();
  const [rec, setRec] = useState<{ id: string; r: HrmRecord } | null>(null);
  const [tick, setTick] = useState(0);
  const [move, setMove] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    const c = new AbortController();
    getHrmRecord(domain, id, c.signal)
      .then((r) => !c.signal.aborted && (setRec({ id, r }), setErr("")))
      .catch((e) => !c.signal.aborted && setErr(apiMessage(e, t("loadError"))));
    return () => c.abort();
  }, [domain, id, tick, t]);
  const r = rec?.id === id ? rec.r : seed;
  const moves = useMemo(() => (r ? HRM_FLOW[r.status] ?? [] : []), [r]);
  if (!r) return null;
  const payload = Object.entries(r.payload).filter(([k, v]) => k !== "transitions" && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"));
  return (
    <HrmDrawer open onClose={onClose} title={r.title || typeName(r.type)} sub={`${typeName(r.type)} · ${label(r.status)}`}>
      {err ? <HrmError text={err} /> : null}
      <div className="hrm-chips">
        <HrmStatus value={r.status} />
      </div>
      <HrmKv
        rows={[
          { label: t("employee"), value: r.employeeId ? dir.employeeName(r.employeeId) || r.employeeId.slice(0, 8) : "—" },
          { label: t("unit"), value: r.unitId ? dir.unitName(r.unitId) || "—" : "—" },
          { label: t("period"), value: r.from ? `${f.date(r.from)}${r.to ? ` — ${f.date(r.to)}` : ""}` : "—" },
          { label: t("created"), value: `${f.dateTime(r.createdAt)}${r.author ? ` · ${r.author}` : ""}` },
        ]}
      />
      {payload.length ? (
        <HrmSection label={t("details")}>
          <HrmKv rows={payload.map(([k, v]) => ({ label: t.has(`fields.${k}`) ? t(`fields.${k}`) : humanize(k), value: String(v) }))} />
        </HrmSection>
      ) : null}
      {moves.length ? (
        <HrmSection label={t("moves")}>
          <div className="hr-moves">
            {moves.map((m) => (
              <button key={m} type="button" className={`btn btn--sm ${NEGATIVE.has(m) ? "btn--line" : "btn--pri"}`} onClick={() => setMove(m)}>
                <IconArrowRight />
                {t.has(`move.${m}`) ? t(`move.${m}`) : label(m)}
              </button>
            ))}
          </div>
        </HrmSection>
      ) : null}
      <HrmSection label={t("history")} aside={<span className="hrm-count">{r.transitions.length}</span>}>
        {r.transitions.length ? (
          <ol className="lv-tl hr-hist">
            {[...r.transitions].reverse().map((x, i) => (
              <li key={i}>
                <time>{x.at ? f.dateTime(x.at) : "—"}</time>
                <span className="lv-tl__b">
                  <b>
                    {x.from ? `${label(x.from)} → ` : ""}
                    {label(x.to)}
                  </b>
                  <small>{[x.reason, x.by].filter(Boolean).join(" · ")}</small>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <HrmEmpty icon={IconHistory} title={t("noHistory")} />
        )}
      </HrmSection>
      <ReasonModal
        open={!!move}
        title={t("moveTitle", { status: move ? label(move) : "" })}
        lead={t("moveLead")}
        label={t("reason")}
        placeholder={t("reasonPh")}
        submitLabel={move && t.has(`move.${move}`) ? t(`move.${move}`) : label(move)}
        onClose={() => setMove("")}
        onSubmit={async (reason) => {
          await transitionHrmRecord(domain, r.id, move, reason);
          setTick((n) => n + 1);
          onChanged();
        }}
      />
    </HrmDrawer>
  );
}
