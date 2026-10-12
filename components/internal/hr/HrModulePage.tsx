"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { asDict, asStr } from "@/lib/http";
import { humanize } from "@/lib/labels";
import { subscribeUserEvents } from "@/lib/userSocket";
import { getMyProfile } from "@/lib/services/internalHrm";
import { HRM_FLOW, createHrmRecord, getHrmRecords, transitionHrmRecord, updateHrmRecord, type HrmRecord } from "@/lib/services/internalLive";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import InternalField from "@/components/internal/InternalField";
import HrmKanban from "@/components/internal/HrmKanban";
import HrmCalendar, { monthOf, type CalDay } from "@/components/internal/HrmCalendar";
import { IconArrowRight, IconCalendar, IconCheck, IconGrid, IconHistory, IconList, IconPlus, IconRefresh, IconSearch } from "@/components/icons";
import { EntitySelect, HrmBar, HrmCallout, HrmDrawer, HrmEmpty, HrmError, HrmHead, HrmKv, HrmLoading, HrmPanel, HrmPerson, HrmSection, HrmSoon, HrmStat, HrmStatus, useHrmFormat, useNow, useStatusLabel } from "@/components/internal/HrmUi";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { ReasonModal, apiMessage, zonedIso } from "@/components/internal/live/bits";
import type { FieldDef, ModuleDef, TabDef, ViewKind } from "./modules";

type Check = { title: string; done: boolean };
const STATUS_COLUMNS = ["draft", "pending", "approved", "active", "completed"];
const VIEW_ICON = { list: IconList, board: IconGrid, calendar: IconCalendar };
const day = (iso: string) => iso.slice(0, 10);
const checksOf = (r: HrmRecord): Check[] => (Array.isArray(r.payload.checklist) ? (r.payload.checklist as unknown[]).map((x) => ({ title: asStr(asDict(x).title), done: asDict(x).done === true })).filter((c) => c.title) : []);
// Inclusive whole days between two dates.
// The transition log is the backend's audit trail: never sent back on an edit.
const editable = (payload: Record<string, unknown>) => Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "transitions"));
const daysBetween = (from: string, to: string) => (from && to ? Math.max(1, Math.round((Date.parse(day(to)) - Date.parse(day(from))) / 86_400_000) + 1) : 0);

// One HR module, drawn from its definition: tabs of record kinds, each with a
// list, and where it helps a board or a month calendar; a typed form instead
// of free key/value rows; the backend's status flow with a reason on every
// move; checklists; and records that hang under another (candidates under a
// vacancy, acknowledgements under a policy).
export default function HrModulePage({ def }: { def: ModuleDef }) {
  const t = useTranslations("internal.hrm");
  const tt = useTranslations("internal.hr");
  const f = useHrmFormat();
  const label = useStatusLabel();
  const dir = useHrmDirectory();
  const now = useNow();
  const [tabKey, setTabKey] = useState(def.tabs[0].key);
  const tab = def.tabs.find((x) => x.key === tabKey) ?? def.tabs[0];
  const [view, setView] = useState<ViewKind>(tab.views[0]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ tick: number; rows: HrmRecord[]; err: string } | null>(null);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState<{ record: HrmRecord | null; parentId: string } | null>(null);
  const [openId, setOpenId] = useState("");
  const [month, setMonth] = useState("");
  const [move, setMove] = useState<{ record: HrmRecord; to: string } | null>(null);
  const [actionErr, setActionErr] = useState("");

  useEffect(() => {
    const c = new AbortController();
    getHrmRecords(def.domain, { limit: 100 }, c.signal)
      .then((r) => !c.signal.aborted && setState({ tick, rows: r.items, err: "" }))
      .catch((e) => !c.signal.aborted && setState({ tick, rows: [], err: apiMessage(e, t("loadError")) }));
    return () => c.abort();
  }, [def.domain, tick, t]);
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
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => subscribeUserEvents((e) => /hrm|record/.test(e.event) && reload()), [reload]);

  const all = useMemo(() => state?.rows ?? [], [state]);
  const loading = !state;
  const typeName = (x: string) => (tt.has(`types.${x}`) ? tt(`types.${x}`) : humanize(x));
  const fieldName = (k: string) => (t.has(`fields.${k}`) ? t(`fields.${k}`) : humanize(k));
  const optionName = (v: string) => (t.has(`options.${v}`) ? t(`options.${v}`) : humanize(v));
  const who = useCallback((id: string) => dir.employeeName(id) || (me && me.id === id ? me.name : "") || (id ? id.slice(0, 8) : ""), [dir, me]);
  const subjectOf = (r: HrmRecord) => (r.employeeId ? who(r.employeeId) : r.unitId ? dir.unitName(r.unitId) : "");
  const titleOf = (r: HrmRecord) => r.title || [typeName(r.type), subjectOf(r)].filter(Boolean).join(" — ");
  const valueOf = (r: HrmRecord, fd: FieldDef): string => {
    const v = r.payload[fd.key];
    if (v === undefined || v === null || v === "") return "";
    if (fd.kind === "employee") return who(String(v));
    if (fd.kind === "unit") return dir.unitName(String(v)) || String(v).slice(0, 8);
    if (fd.kind === "select") return optionName(String(v));
    if (fd.kind === "money") return f.money(Number(v));
    if (fd.kind === "date") return f.date(String(v));
    return String(v);
  };

  const inTab = useMemo(() => all.filter((r) => tab.types.includes(r.type)), [all, tab]);
  const needle = q.trim().toLowerCase();
  const rows = useMemo(
    () => inTab.filter((r) => (!status || r.status === status) && (!needle || `${r.title} ${r.employeeId ? who(r.employeeId) : ""} ${Object.values(r.payload).filter((v) => typeof v === "string").join(" ")}`.toLowerCase().includes(needle))),
    [inTab, status, needle, who],
  );
  const parentTab = tab.parentTab ? def.tabs.find((x) => x.key === tab.parentTab) : undefined;
  const parents = useMemo(() => (parentTab ? all.filter((r) => parentTab.types.includes(r.type)) : []), [all, parentTab]);
  const parentTitle = (id: string) => parents.find((p) => p.id === id)?.title ?? "";
  const open = all.find((r) => r.id === openId) ?? null;
  const count = (s: string[]) => inTab.filter((r) => s.includes(r.status)).length;
  const listFields = tab.fields.filter((x) => x.list);
  const today = now ? `${monthOf(new Date(now))}-${String(new Date(now).getDate()).padStart(2, "0")}` : "";
  const shownMonth = month || today.slice(0, 7);

  // Month calendar: who is away (or what starts) on each day.
  const calDays = useMemo(() => {
    const out: Record<string, CalDay & { names: string[] }> = {};
    if (!shownMonth) return out;
    for (const r of rows) {
      if (!r.from || ["rejected", "cancelled", "archived"].includes(r.status)) continue;
      const end = r.to || r.from;
      for (let d = new Date(day(r.from)); day(d.toISOString()) <= day(end); d.setDate(d.getDate() + 1)) {
        const key = day(d.toISOString());
        if (!key.startsWith(shownMonth)) continue;
        const cur = out[key] ?? { tone: "info" as const, names: [] };
        cur.names.push(subjectOf(r) || r.title);
        cur.tone = r.status === "pending" || cur.tone === "warn" ? "warn" : ["approved", "active", "completed"].includes(r.status) ? "ok" : cur.tone;
        out[key] = cur;
      }
    }
    for (const k of Object.keys(out)) {
      const c = out[k];
      c.label = c.names.length > 1 ? t("calendar.count", { n: c.names.length }) : c.names[0];
      c.sub = c.names.length > 1 ? c.names.slice(0, 2).join(", ") : undefined;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, shownMonth, dir, me]);

  // Board: by a payload field (recruiting stage) or by status.
  const boardColumns = tab.boardField
    ? (tab.fields.find((x) => x.key === tab.boardField)?.options ?? []).map((o) => ({ key: o, label: optionName(o), tone: o === "hired" || o === "expert" ? ("ok" as const) : o === "rejected" ? ("err" as const) : ("info" as const) }))
    : STATUS_COLUMNS.map((s) => ({ key: s, label: label(s), tone: s === "pending" ? ("warn" as const) : s === "completed" || s === "approved" ? ("ok" as const) : s === "draft" ? ("gray" as const) : ("info" as const) }));
  const onBoardMove = async (r: HrmRecord, to: string) => {
    setActionErr("");
    if (tab.boardField) {
      try {
        await updateHrmRecord(def.domain, r.id, { payload: { ...editable(r.payload), [tab.boardField]: to } });
        reload();
      } catch (e) {
        setActionErr(apiMessage(e, t("saveError")));
      }
    } else if ((HRM_FLOW[r.status] ?? []).includes(to)) setMove({ record: r, to });
    else setActionErr(t("moveNotAllowed", { from: label(r.status), to: label(to) }));
  };

  const switchTab = (k: string) => {
    const next = def.tabs.find((x) => x.key === k) ?? def.tabs[0];
    setTabKey(next.key);
    setView(next.views[0]);
    setStatus("");
    setOpenId("");
  };
  const newLabel = t.has(`new.${def.key}.${tab.key}`) ? t(`new.${def.key}.${tab.key}`) : t("newRecord");

  return (
    <section className="hrm-page">
      <HrmHead
        title={t(`modules.${def.key}.title`)}
        lead={t(`modules.${def.key}.lead`)}
        actions={
          <>
            <button className="btn btn--line btn--sm" type="button" onClick={reload}><IconRefresh />{t("refresh")}</button>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setForm({ record: null, parentId: "" })}><IconPlus />{newLabel}</button>
          </>
        }
      />
      {def.tabs.length > 1 ? (
        <div className="hrm-tabs hrm-viewtabs" role="tablist">
          {def.tabs.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={tab.key === x.key} className={tab.key === x.key ? "on" : ""} onClick={() => switchTab(x.key)}>
              {t(`tabs.${def.key}.${x.key}`)}
              <span className="hrm-count">{all.filter((r) => x.types.includes(r.type)).length}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="hrm-stats">
        <HrmStat icon={IconList} tone="blue" label={t("stat.total")} value={loading ? "…" : inTab.length} onClick={() => setStatus("")} active={!status} />
        <HrmStat icon={IconHistory} tone="warn" label={t("stat.pending")} value={loading ? "…" : count(["pending"])} onClick={() => setStatus(status === "pending" ? "" : "pending")} active={status === "pending"} />
        <HrmStat icon={IconCheck} tone="ok" label={t("stat.approved")} value={loading ? "…" : count(["approved", "active"])} onClick={() => setStatus(status === "approved" ? "" : "approved")} active={status === "approved"} />
        <HrmStat icon={IconCalendar} tone="violet" label={t("stat.draft")} value={loading ? "…" : count(["draft"])} onClick={() => setStatus(status === "draft" ? "" : "draft")} active={status === "draft"} />
      </div>
      <div className="hrm-toolbar">
        <div className="uf-search hrm-toolbar__q">
          <IconSearch aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} maxLength={80} />
        </div>
        <div className="hrm-toolbar__sel">
          <Select value={status} onChange={setStatus} options={[{ value: "", label: t("allStatuses") }, ...Object.keys(HRM_FLOW).map((s) => ({ value: s, label: label(s) }))]} ariaLabel={t("status")} />
        </div>
        {tab.views.length > 1 ? (
          <div className="hrm-tabs" role="tablist" aria-label={t("views.label")}>
            {tab.views.map((v) => {
              const I = VIEW_ICON[v];
              return <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}><I />{t(`views.${v}`)}</button>;
            })}
          </div>
        ) : null}
      </div>
      {state?.err ? <HrmError text={state.err} onRetry={reload} retryLabel={t("refresh")} /> : null}
      {actionErr ? <HrmError text={actionErr} /> : null}

      {loading ? (
        <HrmPanel><HrmLoading rows={5} /></HrmPanel>
      ) : view === "calendar" && shownMonth ? (
        <HrmPanel>
          <HrmCalendar month={shownMonth} onMonth={setMonth} days={calDays} today={today} legend={<><span><i className="hrm-cal__cell--ok" />{label("approved")}</span><span><i className="hrm-cal__cell--warn" />{label("pending")}</span><span><i className="hrm-cal__cell--info" />{label("draft")}</span></>} />
        </HrmPanel>
      ) : view === "board" ? (
        <HrmKanban
          columns={boardColumns}
          items={rows}
          columnOf={(r) => (tab.boardField ? asStr(r.payload[tab.boardField]) || boardColumns[0]?.key || "" : r.status)}
          idOf={(r) => r.id}
          onMove={(r, to) => void onBoardMove(r, to)}
          onOpen={(r) => setOpenId(r.id)}
          emptyText={t("boardEmpty")}
          renderCard={(r) => {
            const checks = checksOf(r);
            return (
              <>
                <b>{titleOf(r)}</b>
                <small>{[tab.parentTab ? parentTitle(r.parentId) : typeName(r.type), ...listFields.filter((x) => x.key !== tab.boardField).slice(0, 1).map((x) => valueOf(r, x))].filter(Boolean).join(" · ")}</small>
                {checks.length ? <span className="hrm-check-mini"><HrmBar value={(checks.filter((c) => c.done).length / checks.length) * 100} /><small>{checks.filter((c) => c.done).length}/{checks.length}</small></span> : null}
                <span className="hrm-kb__meta">{tab.boardField ? <HrmStatus value={r.status} /> : <span>{r.from ? f.date(r.from) : ""}</span>}{r.employeeId ? <span>{who(r.employeeId)}</span> : null}</span>
              </>
            );
          }}
        />
      ) : (
        <HrmPanel flush>
          {rows.length ? (
            <div className="hrm-table-wrap">
              <table className="hrm-table">
                <thead>
                  <tr>
                    <th>{t.has(`titleFor.${def.key}.${tab.key}`) ? t(`titleFor.${def.key}.${tab.key}`) : t("record")}</th>
                    {tab.subject !== "none" ? <th>{tab.subject === "employee" ? t("employee") : t("unit")}</th> : null}
                    {tab.parentTab ? <th>{t(`tabs.${def.key}.${tab.parentTab}`)}</th> : null}
                    {listFields.map((x) => <th key={x.key}>{fieldName(x.key)}</th>)}
                    {tab.period && tab.period !== "none" ? <th>{t("period")}</th> : null}
                    {tab.checklist ? <th>{t("checklist")}</th> : null}
                    <th>{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const checks = checksOf(r);
                    return (
                      <tr key={r.id} className="is-click" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(r.id)}>
                        <td><b>{titleOf(r)}</b><small>{typeName(r.type)}</small></td>
                        {tab.subject !== "none" ? <td>{r.employeeId ? <HrmPerson name={who(r.employeeId)} sub={dir.employee(r.employeeId)?.code} size="sm" /> : subjectOf(r) || "—"}</td> : null}
                        {tab.parentTab ? <td className="hrm-muted">{parentTitle(r.parentId) || "—"}</td> : null}
                        {listFields.map((x) => <td key={x.key} className={x.kind === "number" || x.kind === "money" ? "hrm-num" : undefined}>{valueOf(r, x) || "—"}</td>)}
                        {tab.period && tab.period !== "none" ? <td className="hrm-muted">{r.from ? `${f.date(r.from)}${r.to ? ` — ${f.date(r.to)}` : ""}` : "—"}</td> : null}
                        {tab.checklist ? <td>{checks.length ? <span className="hrm-check-mini"><HrmBar value={(checks.filter((c) => c.done).length / checks.length) * 100} /><small>{checks.filter((c) => c.done).length}/{checks.length}</small></span> : "—"}</td> : null}
                        <td><HrmStatus value={r.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <HrmEmpty icon={IconList} title={inTab.length ? t("noMatch") : t(`empty.${def.key}`)} text={inTab.length ? undefined : t("emptyText")} action={<button className="btn btn--pri btn--sm" type="button" onClick={() => setForm({ record: null, parentId: "" })}><IconPlus />{newLabel}</button>} />
          )}
        </HrmPanel>
      )}

      {def.soon.length ? (
        <HrmCallout tone="soon" title={t("soonTitle")}>
          <span className="hrm-soonrow">{def.soon.map((k) => <HrmSoon key={k}>{t(`soon.${k}`)}</HrmSoon>)}</span>
        </HrmCallout>
      ) : null}

      {form ? (
        <RecordForm
          key={form.record?.id ?? `new-${tab.key}-${form.parentId}`}
          def={def}
          tab={tab}
          record={form.record}
          parentId={form.parentId}
          parents={parents}
          me={me}
          typeName={typeName}
          fieldName={fieldName}
          optionName={optionName}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            reload();
            if (id) setOpenId(id);
          }}
        />
      ) : null}
      {open && !form && !move ? (
        <RecordDrawer
          def={def}
          record={open}
          all={all}
          me={me}
          titleOf={titleOf}
          typeName={typeName}
          fieldName={fieldName}
          valueOf={valueOf}
          who={who}
          onClose={() => setOpenId("")}
          onEdit={() => setForm({ record: open, parentId: open.parentId })}
          onAddChild={(childTab) => {
            setTabKey(childTab);
            setView((def.tabs.find((x) => x.key === childTab) ?? tab).views[0]);
            setForm({ record: null, parentId: open.id });
          }}
          onOpen={setOpenId}
          onMove={(to) => setMove({ record: open, to })}
          onChanged={reload}
        />
      ) : null}
      <ReasonModal
        open={!!move}
        title={tt("moveTitle", { status: move ? label(move.to) : "" })}
        lead={tt("moveLead")}
        label={tt("reason")}
        placeholder={tt("reasonPh")}
        submitLabel={move && tt.has(`move.${move.to}`) ? tt(`move.${move.to}`) : label(move?.to ?? "")}
        onClose={() => setMove(null)}
        onSubmit={async (reason) => {
          if (!move) return;
          await transitionHrmRecord(def.domain, move.record.id, move.to, reason);
          reload();
        }}
      />
    </section>
  );
}

// ── Form ────────────────────────────────────────────────────────────────────

function RecordForm({
  def,
  tab,
  record,
  parentId,
  parents,
  me,
  typeName,
  fieldName,
  optionName,
  onClose,
  onSaved,
}: {
  def: ModuleDef;
  tab: TabDef;
  record: HrmRecord | null;
  parentId: string;
  parents: HrmRecord[];
  me: { id: string; name: string } | null;
  typeName: (x: string) => string;
  fieldName: (k: string) => string;
  optionName: (v: string) => string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const t = useTranslations("internal.hrm");
  const dir = useHrmDirectory();
  const init = () => {
    const values: Record<string, string> = {};
    for (const fd of tab.fields) {
      const v = record?.payload[fd.key];
      values[fd.key] = v === undefined || v === null ? (fd.kind === "select" && fd.required ? (fd.options?.[0] ?? "") : "") : String(v);
    }
    return values;
  };
  const [type, setType] = useState(record?.type ?? tab.types[0]);
  const [title, setTitle] = useState(record?.title ?? "");
  const [employee, setEmployee] = useState(record?.employeeId ?? (tab.subject === "employee" ? (me?.id ?? "") : ""));
  const [unit, setUnit] = useState(record?.unitId ?? "");
  const [parent, setParent] = useState(record?.parentId ?? parentId);
  const [from, setFrom] = useState(record?.from ? day(record.from) : "");
  const [to, setTo] = useState(record?.to ? day(record.to) : "");
  const [values, setValues] = useState(init);
  const [submit, setSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const employeeOptions = dir.employeeOptions.length ? dir.employeeOptions : me ? [{ value: me.id, label: me.name || me.id.slice(0, 8) }] : [];
  const set = (k: string) => (v: string) => setValues((c) => ({ ...c, [k]: v }));
  const titleNeeded = tab.subject !== "employee";
  // A leave or a trip counts its own days from the dates.
  const autoDays = tab.fields.some((x) => x.key === "days") && tab.period === "range" ? daysBetween(from, to) : 0;
  const missing = tab.fields.some((fd) => fd.required && !values[fd.key]?.trim()) || (titleNeeded && !title.trim()) || (tab.subject === "employee" && !employee) || (tab.period === "range" && (!from || !to)) || (!!tab.parentTab && !parent);
  const badRange = !!from && !!to && to < from;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || missing || badRange) return;
    setBusy(true);
    setErr("");
    const payload: Record<string, unknown> = editable(record?.payload ?? {});
    for (const fd of tab.fields) {
      const raw = (values[fd.key] ?? "").trim();
      if (!raw) delete payload[fd.key];
      else payload[fd.key] = fd.kind === "number" || fd.kind === "money" ? Number(raw.replace(/\s/g, "")) || 0 : raw;
    }
    if (autoDays) payload.days = autoDays;
    if (!record && tab.checklist) payload.checklist = tab.checklist.map((k) => ({ title: t(`checklists.${k}`), done: false }));
    const body = {
      record_type: type,
      employee_id: tab.subject === "employee" ? employee || null : null,
      org_unit_id: tab.subject === "unit" ? unit || null : null,
      parent_id: parent || null,
      title: title.trim() || [typeName(type), tab.subject === "employee" ? employeeOptions.find((o) => o.value === employee)?.label : ""].filter(Boolean).join(" — "),
      effective_from: from ? zonedIso(from, "00:00") : null,
      effective_to: to ? zonedIso(to, "23:59") : null,
      payload,
    };
    try {
      if (record) {
        await updateHrmRecord(def.domain, record.id, body);
        onSaved(record.id);
      } else {
        const created = asDict(await createHrmRecord(def.domain, { ...body, status: "draft" }));
        const id = asStr(created.id);
        if (submit && id) await transitionHrmRecord(def.domain, id, "pending", t("autoSubmit"));
        onSaved(id);
      }
    } catch (cause) {
      setErr(apiMessage(cause, t("saveError")));
    } finally {
      setBusy(false);
    }
  }

  const control = (fd: FieldDef) => {
    const v = values[fd.key] ?? "";
    const name = fieldName(fd.key);
    if (fd.kind === "select") return <Select value={v} onChange={set(fd.key)} options={[...(fd.required ? [] : [{ value: "", label: "—" }]), ...(fd.options ?? []).map((o) => ({ value: o, label: optionName(o) }))]} ariaLabel={name} />;
    if (fd.kind === "employee") return <EntitySelect value={v} onChange={set(fd.key)} options={employeeOptions} placeholder={t("pickEmployee")} ariaLabel={name} />;
    if (fd.kind === "unit") return <EntitySelect value={v} onChange={set(fd.key)} options={dir.unitOptions} placeholder={t("pickUnit")} ariaLabel={name} />;
    if (fd.kind === "date") return <DatePicker value={v} onChange={set(fd.key)} placeholder={name} ariaLabel={name} clearLabel={t("clear")} />;
    if (fd.kind === "textarea") return <textarea value={v} onChange={(e) => set(fd.key)(e.target.value)} rows={3} maxLength={4000} required={fd.required} />;
    if (fd.kind === "number" || fd.kind === "money") return <input value={fd.key === "days" && autoDays ? String(autoDays) : v} onChange={(e) => set(fd.key)(e.target.value.replace(/[^\d\s.]/g, ""))} inputMode="numeric" maxLength={16} placeholder="0" readOnly={fd.key === "days" && !!autoDays} />;
    return <input value={v} onChange={(e) => set(fd.key)(e.target.value)} maxLength={300} required={fd.required} type={fd.kind === "url" ? "url" : fd.kind === "phone" ? "tel" : "text"} placeholder={fd.kind === "url" ? "https://" : fd.kind === "phone" ? "+998" : undefined} />;
  };

  const titleLabel = t.has(`titleFor.${def.key}.${tab.key}`) ? t(`titleFor.${def.key}.${tab.key}`) : t("titleLabel");
  return (
    <HrmDrawer open onClose={onClose} title={record ? t("edit") : t.has(`new.${def.key}.${tab.key}`) ? t(`new.${def.key}.${tab.key}`) : t("newRecord")} sub={t(`modules.${def.key}.title`)}>
      <form className="hrm-form" onSubmit={save}>
        {err ? <HrmError text={err} /> : null}
        <div className="hrm-form__grid">
          {tab.types.length > 1 ? (
            <InternalField label={t("type")}>
              <Select value={type} onChange={setType} options={tab.types.map((x) => ({ value: x, label: typeName(x) }))} ariaLabel={t("type")} />
            </InternalField>
          ) : null}
          {tab.parentTab ? (
            <InternalField label={t(`tabs.${def.key}.${tab.parentTab}`)}>
              <EntitySelect value={parent} onChange={setParent} options={parents.map((p) => ({ value: p.id, label: p.title || typeName(p.type) }))} placeholder={t("pickParent")} ariaLabel={t(`tabs.${def.key}.${tab.parentTab}`)} />
            </InternalField>
          ) : null}
          {tab.subject === "employee" ? (
            <InternalField label={t("employee")}>
              <EntitySelect value={employee} onChange={setEmployee} options={employeeOptions} placeholder={t("pickEmployee")} ariaLabel={t("employee")} />
            </InternalField>
          ) : null}
          {tab.subject === "unit" ? (
            <InternalField label={t("unit")}>
              <EntitySelect value={unit} onChange={setUnit} options={dir.unitOptions} placeholder={t("pickUnit")} ariaLabel={t("unit")} />
            </InternalField>
          ) : null}
          <InternalField label={titleLabel} hint={titleNeeded ? undefined : t("titleAuto")}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required={titleNeeded} />
          </InternalField>
          {tab.period && tab.period !== "none" ? (
            <InternalField label={tab.period === "range" ? t("from") : t("date")}>
              <DatePicker value={from} onChange={setFrom} placeholder={t("from")} ariaLabel={t("from")} max={to || undefined} clearLabel={t("clear")} />
            </InternalField>
          ) : null}
          {tab.period === "range" ? (
            <InternalField label={t("to")}>
              <DatePicker value={to} onChange={setTo} placeholder={t("to")} ariaLabel={t("to")} min={from || undefined} clearLabel={t("clear")} />
            </InternalField>
          ) : null}
          {tab.fields.map((fd) => (
            <div key={fd.key} className={fd.wide ? "is-wide" : undefined}>
              <InternalField label={`${fieldName(fd.key)}${fd.required ? " *" : ""}`} hint={fd.key === "days" && autoDays ? t("daysAuto") : undefined}>{control(fd)}</InternalField>
            </div>
          ))}
        </div>
        {badRange ? <HrmError text={t("badRange")} /> : null}
        {!record ? (
          <label className="stu-check lv-check">
            <input type="checkbox" checked={submit} onChange={(e) => setSubmit(e.target.checked)} />
            <span>{t("submitNow")}</span>
          </label>
        ) : null}
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || missing || badRange}><IconCheck />{busy ? t("saving") : record ? t("save") : t("create")}</button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>{t("cancel")}</button>
        </div>
      </form>
    </HrmDrawer>
  );
}

// ── Detail ──────────────────────────────────────────────────────────────────

function RecordDrawer({
  def,
  record: r,
  all,
  me,
  titleOf,
  typeName,
  fieldName,
  valueOf,
  who,
  onClose,
  onEdit,
  onAddChild,
  onOpen,
  onMove,
  onChanged,
}: {
  def: ModuleDef;
  record: HrmRecord;
  all: HrmRecord[];
  me: { id: string; name: string } | null;
  titleOf: (r: HrmRecord) => string;
  typeName: (x: string) => string;
  fieldName: (k: string) => string;
  valueOf: (r: HrmRecord, fd: FieldDef) => string;
  who: (id: string) => string;
  onClose: () => void;
  onEdit: () => void;
  onAddChild: (tab: string) => void;
  onOpen: (id: string) => void;
  onMove: (to: string) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("internal.hrm");
  const tt = useTranslations("internal.hr");
  const f = useHrmFormat();
  const label = useStatusLabel();
  const dir = useHrmDirectory();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tab = def.tabs.find((x) => x.types.includes(r.type)) ?? def.tabs[0];
  const childTab = def.tabs.find((x) => x.parentTab === tab.key);
  const children = all.filter((x) => x.parentId === r.id);
  const checks = checksOf(r);
  const moves = HRM_FLOW[r.status] ?? [];
  const acks = tab.selfChild ? children.filter((x) => x.type === tab.selfChild!.type) : [];
  const acked = !!me && acks.some((x) => x.employeeId === me.id);

  const patch = async (payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await updateHrmRecord(def.domain, r.id, { payload });
      onChanged();
    } catch (e) {
      setErr(apiMessage(e, t("saveError")));
    } finally {
      setBusy(false);
    }
  };
  const acknowledge = async () => {
    if (busy || !me || !tab.selfChild) return;
    setBusy(true);
    setErr("");
    try {
      await createHrmRecord(def.domain, { record_type: tab.selfChild.type, employee_id: me.id, org_unit_id: null, parent_id: r.id, title: `${r.title} — ${me.name}`, status: "draft", effective_from: new Date().toISOString(), effective_to: null, payload: { acknowledged: true } });
      onChanged();
    } catch (e) {
      setErr(apiMessage(e, t("saveError")));
    } finally {
      setBusy(false);
    }
  };

  const facts = tab.fields.filter((fd) => fd.kind !== "textarea").map((fd) => ({ label: fieldName(fd.key), value: valueOf(r, fd) })).filter((x) => x.value);
  const texts = tab.fields.filter((fd) => fd.kind === "textarea").map((fd) => ({ label: fieldName(fd.key), value: asStr(r.payload[fd.key]) })).filter((x) => x.value);
  return (
    <HrmDrawer open onClose={onClose} title={titleOf(r)} sub={`${typeName(r.type)} · ${label(r.status)}`} footer={<button type="button" className="btn btn--line btn--sm" onClick={onEdit}>{t("edit")}</button>}>
      {err ? <HrmError text={err} /> : null}
      <div className="hrm-chips"><HrmStatus value={r.status} /></div>
      <HrmKv
        rows={[
          ...(r.employeeId ? [{ label: t("employee"), value: who(r.employeeId) }] : []),
          ...(r.unitId ? [{ label: t("unit"), value: dir.unitName(r.unitId) || "—" }] : []),
          ...(r.parentId ? [{ label: t("belongsTo"), value: <button type="button" className="org-link" onClick={() => onOpen(r.parentId)}>{all.find((x) => x.id === r.parentId)?.title || "—"}</button> }] : []),
          ...(r.from ? [{ label: t("period"), value: `${f.date(r.from)}${r.to ? ` — ${f.date(r.to)}` : ""}` }] : []),
          ...facts,
          { label: t("created"), value: `${f.dateTime(r.createdAt)}${r.author ? ` · ${r.author}` : ""}` },
        ]}
      />
      {texts.map((x) => (
        <HrmSection key={x.label} label={x.label}>
          <p className="fb-text">{x.value}</p>
        </HrmSection>
      ))}
      {checks.length ? (
        <HrmSection label={t("checklist")} aside={<span className="hrm-count">{checks.filter((c) => c.done).length}/{checks.length}</span>}>
          <ul className="hrm-checks">
            {checks.map((c, i) => (
              <li key={`${c.title}-${i}`}>
                <label className={c.done ? "is-done" : ""}>
                  <input type="checkbox" checked={c.done} disabled={busy} onChange={() => void patch({ ...editable(r.payload), checklist: checks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
                  <span>{c.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </HrmSection>
      ) : null}
      {tab.selfChild ? (
        <HrmSection label={t("acks")} aside={<span className="hrm-count">{acks.length}</span>}>
          {acked ? <HrmCallout tone="ok">{t("acked")}</HrmCallout> : <button type="button" className="btn btn--pri btn--sm" disabled={busy || !me} onClick={() => void acknowledge()}><IconCheck />{t(tab.selfChild.labelKey)}</button>}
          {acks.length ? <ul className="hrm-list">{acks.map((a) => <li key={a.id}><span className="hrm-list__t"><b>{who(a.employeeId) || "—"}</b><small>{f.dateTime(a.createdAt)}</small></span></li>)}</ul> : null}
        </HrmSection>
      ) : null}
      {childTab ? (
        <HrmSection label={t(`tabs.${def.key}.${childTab.key}`)} aside={<span className="hrm-count">{children.filter((x) => childTab.types.includes(x.type)).length}</span>}>
          <ul className="hrm-list">
            {children.filter((x) => childTab.types.includes(x.type)).map((c) => (
              <li key={c.id}>
                <button type="button" className="org-row" onClick={() => onOpen(c.id)}>
                  <span className="hrm-list__t"><b>{titleOf(c)}</b><small>{childTab.boardField ? valueOf(c, childTab.fields.find((x) => x.key === childTab.boardField)!) : label(c.status)}</small></span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--line btn--sm" onClick={() => onAddChild(childTab.key)}><IconPlus />{t.has(`new.${def.key}.${childTab.key}`) ? t(`new.${def.key}.${childTab.key}`) : t("newRecord")}</button>
        </HrmSection>
      ) : null}
      {moves.length ? (
        <HrmSection label={tt("moves")}>
          <div className="hr-moves">
            {moves.map((m) => (
              <button key={m} type="button" className={`btn btn--sm ${["rejected", "returned", "cancelled", "archived", "draft"].includes(m) ? "btn--line" : "btn--pri"}`} onClick={() => onMove(m)}>
                <IconArrowRight />
                {tt.has(`move.${m}`) ? tt(`move.${m}`) : label(m)}
              </button>
            ))}
          </div>
        </HrmSection>
      ) : null}
      <HrmSection label={tt("history")} aside={<span className="hrm-count">{r.transitions.length}</span>}>
        {r.transitions.length ? (
          <ol className="lv-tl hr-hist">
            {[...r.transitions].reverse().map((x, i) => (
              <li key={i}>
                <time>{x.at ? f.dateTime(x.at) : "—"}</time>
                <span className="lv-tl__b"><b>{x.from ? `${label(x.from)} → ` : ""}{label(x.to)}</b><small>{[x.reason, x.by].filter(Boolean).join(" · ")}</small></span>
              </li>
            ))}
          </ol>
        ) : <p className="hrm-muted">{tt("noHistory")}</p>}
      </HrmSection>
    </HrmDrawer>
  );
}
