"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { subscribeUserEvents } from "@/lib/userSocket";
import { ApiError, asDict } from "@/lib/http";
import {
  getMyAttendance,
  getMyKpiSummary,
  getMyMessages,
  getMyProfile,
  getMyTasks,
  normAttendance,
  normEmployee,
  normMessage,
  normTask,
  sendInternalMessage,
  type HrmAttendance,
  type HrmEmployee,
  type HrmKpi,
  type HrmMessage,
  type HrmTask,
  type InternalPage,
} from "@/lib/services/internalHrm";
import { IconBriefcase, IconCalendar, IconChartBar, IconChat, IconCheck, IconClock, IconMail, IconMapPin, IconPhone, IconRefresh, IconSend, IconUser } from "@/components/icons";
import DatePicker from "@/components/DatePicker";
import FilterBar from "@/components/filters/FilterBar";
import InternalPagination from "@/components/internal/InternalPagination";
import InternalField from "@/components/internal/InternalField";
import TaskDrawer, { TASK_STATUSES } from "@/components/internal/TaskDrawer";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import {
  EntitySelect,
  HrmAvatar,
  HrmBar,
  HrmEmpty,
  HrmError,
  HrmHead,
  HrmKv,
  HrmLoading,
  HrmPanel,
  HrmPriority,
  HrmStat,
  HrmStatus,
  isOverdue,
  useHrmFormat,
  useNow,
  useStatusLabel,
} from "@/components/internal/HrmUi";

type Mode = "me" | "tasks" | "attendance" | "messages";
const EMPTY_PAGE = { items: [], total: 0, offset: 0, limit: 25, hasMore: false };

export default function InternalSelfPages({ mode }: { mode: Mode }) {
  if (mode === "me") return <ProfilePage />;
  if (mode === "tasks") return <MyTasksPage />;
  if (mode === "attendance") return <MyAttendancePage />;
  return <MessagesPage />;
}

function useReload(load: () => void) {
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) load(); }), [load]);
}

const aborted = (e: unknown) => e instanceof ApiError && e.detail === "aborted";

// ── Profile ────────────────────────────────────────────────────────────────

function ProfilePage() {
  const t = useTranslations("internal.pages");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [me, setMe] = useState<{ employee: HrmEmployee; role: string } | null>(null);
  const [kpi, setKpi] = useState<{ period: string; score: number | null; items: HrmKpi[] }>({ period: "", score: null, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const [raw, kpis] = await Promise.all([getMyProfile(signal), getMyKpiSummary({}, signal).catch(() => null)]);
      const d = asDict(raw);
      setMe({ employee: normEmployee(d.employee ?? d), role: String(asDict(d.user).role ?? "") });
      setKpi(kpis ?? { period: "", score: null, items: [] });
    } catch (cause) {
      if (!aborted(cause)) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => load(c.signal));
    return () => c.abort();
  }, [load]);
  useReload(load);

  const e = me?.employee;
  const position = e ? dir.positionTitle(e.positionId) : "";
  const unit = e ? dir.unitName(e.unitId) : "";
  const manager = e ? dir.employeeName(e.managerId) : "";
  // The backend's own weighted score when it has one; otherwise the same
  // weighting worked out from the metrics shown below it.
  const weighted = useMemo(() => {
    if (kpi.score) return kpi.score;
    const w = kpi.items.reduce((s, k) => s + (k.weight || 0), 0);
    return w ? kpi.items.reduce((s, k) => s + k.score * (k.weight || 0), 0) / w : kpi.items.length ? kpi.items.reduce((s, k) => s + k.score, 0) / kpi.items.length : 0;
  }, [kpi.items, kpi.score]);

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("titles.me")} lead={t("subtitles.me")} actions={<button className="btn btn--line btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button>} />
      {error ? <HrmError text={t("error")} onRetry={() => void load()} retryLabel={t("refresh")} /> : null}
      {loading && !e ? <HrmPanel><HrmLoading rows={4} /></HrmPanel> : e ? (
        <div className="hrm-grid hrm-grid--side">
          <div className="hrm-grid">
            <HrmPanel className="hrm-profile">
              <div className="hrm-profile__top">
                <HrmAvatar name={e.name} size="lg" />
                <div className="hrm-profile__id">
                  <h3>{e.name || "—"}</h3>
                  <p>{[position, unit].filter(Boolean).join(" · ") || t("noAssignment")}</p>
                  <div className="hrm-chips">
                    {e.code ? <span className="hrm-code">{e.code}</span> : null}
                    <HrmStatus value={e.status} />
                  </div>
                </div>
              </div>
              <div className="hrm-profile__contacts">
                {e.phone ? <a href={`tel:${e.phone.replace(/[^+\d]/g, "")}`}><IconPhone />{e.phone}</a> : null}
                {e.email ? <a href={`mailto:${e.email}`}><IconMail />{e.email}</a> : null}
                {e.region ? <span><IconMapPin />{e.region}</span> : null}
              </div>
            </HrmPanel>
            <HrmPanel title={t("work")} icon={IconBriefcase}>
              <HrmKv
                rows={[
                  { label: t("position"), value: position || "—" },
                  { label: t("department"), value: unit || "—" },
                  { label: t("manager"), value: manager || "—" },
                  { label: t("hireDate"), value: f.date(e.hireDate) },
                  ...(e.salary !== null ? [{ label: t("salary"), value: f.money(e.salary) }] : []),
                ]}
              />
              {e.skills.length ? <div className="hrm-chips" style={{ marginTop: 12 }}>{e.skills.map((s) => <span className="hrm-chip" key={s}>{s}</span>)}</div> : null}
            </HrmPanel>
          </div>
          <HrmPanel title={t("myKpis")} icon={IconChartBar} count={kpi.items.length || undefined}>
            {kpi.items.length ? (
              <div className="hrm-form">
                <div className="hrm-score">
                  <b>{f.num(weighted)}</b>
                  <span>{kpi.period ? `${t("kpiScore")} · ${f.period(kpi.period)}` : t("kpiScore")}</span>
                  <HrmBar value={weighted} />
                </div>
                <ul className="hrm-list">
                  {kpi.items.map((k) => (
                    <li key={k.id || k.code}>
                      <span className="hrm-list__t"><b>{k.title}</b><small>{t("kpiTarget", { actual: f.num(k.actual), target: f.num(k.target) })}{k.unit === "percent" ? " %" : ""}</small></span>
                      <span className="hrm-list__a"><b className="hrm-num">{f.num(k.score)}</b></span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <HrmEmpty icon={IconChartBar} title={t("noKpis")} text={t("noKpisLead")} />}
          </HrmPanel>
        </div>
      ) : <HrmPanel><HrmEmpty icon={IconUser} title={t("noProfile")} /></HrmPanel>}
    </section>
  );
}

// ── My tasks ───────────────────────────────────────────────────────────────

function MyTasksPage() {
  const t = useTranslations("internal.pages");
  const label = useStatusLabel();
  const f = useHrmFormat();
  const now = useNow();
  const dir = useHrmDirectory();
  const [page, setPage] = useState<InternalPage<HrmTask>>(EMPTY_PAGE);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const res = await getMyTasks({ q: q || undefined, status: status || undefined, limit: 25, offset }, signal);
      setPage({ ...res, items: res.items.map(normTask) });
    } catch (cause) {
      if (!aborted(cause)) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [q, status, offset]);
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => load(c.signal));
    return () => c.abort();
  }, [load]);
  const reload = useCallback(() => void load(), [load]);
  useReload(reload);

  const open = page.items.find((x) => x.id === openId) ?? null;

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("titles.tasks")} lead={t("subtitles.tasks")} actions={<button className="btn btn--line btn--sm" type="button" onClick={reload} disabled={loading}><IconRefresh />{t("refresh")}</button>} />
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setOffset(0); }, placeholder: t("searchTasks"), maxLength: 120 }}
        fields={[{ key: "status", label: t("taskStatusLabel"), value: status, onChange: (v) => { setStatus(v); setOffset(0); }, options: [{ value: "", label: t("allStatuses") }, ...TASK_STATUSES.map((s) => ({ value: s, label: label(s) }))], empty: "" }]}
        count={page.total}
        onReset={() => { setQ(""); setStatus(""); setOffset(0); }}
      />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <HrmPanel flush>
        {loading ? <div style={{ padding: 16 }}><HrmLoading /></div> : page.items.length ? (
          <div className="hrm-table-wrap">
            <table className="hrm-table">
              <thead><tr><th>{t("columns.task")}</th><th>{t("columns.priority")}</th><th>{t("columns.status")}</th><th>{t("columns.due")}</th><th>{t("columns.project")}</th></tr></thead>
              <tbody>
                {page.items.map((task) => {
                  const late = isOverdue(task.deadline, task.status, now);
                  return (
                    <tr key={task.id} className="is-click" tabIndex={0} onClick={() => setOpenId(task.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(task.id); }}>
                      <td><b>{task.title || "—"}</b><small>{task.code}</small></td>
                      <td><HrmPriority value={task.priority} /></td>
                      <td><HrmStatus value={task.status} /></td>
                      <td>{task.deadline ? <span className={late ? "hrm-late" : undefined}>{f.dateTime(task.deadline)}</span> : "—"}</td>
                      <td className="hrm-muted">{task.project || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <HrmEmpty icon={IconBriefcase} title={t("empty.tasks")} text={status || q ? t("emptyFiltered") : t("emptyTasksLead")} />}
        <InternalPagination page={page} onChange={setOffset} />
      </HrmPanel>
      <TaskDrawer task={open} onClose={() => setOpenId("")} onChanged={reload} unitName={open ? dir.unitName(open.unitId) : ""} />
    </section>
  );
}

// ── My attendance ──────────────────────────────────────────────────────────

function MyAttendancePage() {
  const t = useTranslations("internal.pages");
  const tu = useTranslations("internal.ui");
  const f = useHrmFormat();
  const [rows, setRows] = useState<InternalPage<HrmAttendance>>(EMPTY_PAGE);
  const [dates, setDates] = useState({ from: "", to: "" });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const res = await getMyAttendance({ date_from: dates.from || undefined, date_to: dates.to || undefined, limit: 31, offset }, signal);
      setRows({ ...res, items: res.items.map(normAttendance) });
    } catch (cause) {
      if (!aborted(cause)) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dates, offset]);
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => load(c.signal));
    return () => c.abort();
  }, [load]);
  const reload = useCallback(() => void load(), [load]);
  useReload(reload);

  const sum = useMemo(() => {
    const items = rows.items;
    return {
      present: items.filter((r) => r.workedMinutes > 0 || r.status === "present").length,
      worked: items.reduce((s, r) => s + r.workedMinutes, 0),
      late: items.filter((r) => r.lateMinutes > 0).length,
      overtime: items.reduce((s, r) => s + r.overtimeMinutes, 0),
    };
  }, [rows.items]);

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("titles.attendance")} lead={t("subtitles.attendance")} actions={<button className="btn btn--line btn--sm" type="button" onClick={reload} disabled={loading}><IconRefresh />{t("refresh")}</button>} />
      <FilterBar
        fields={[
          { key: "from", label: t("from"), icon: IconCalendar, node: <DatePicker value={dates.from} onChange={(v) => { setDates((d) => ({ ...d, from: v })); setOffset(0); }} placeholder={t("from")} ariaLabel={t("from")} max={dates.to || undefined} clearLabel={tu("clear")} />, active: !!dates.from, chip: dates.from ? `${t("from")}: ${f.date(dates.from)}` : null, clear: () => setDates((d) => ({ ...d, from: "" })) },
          { key: "to", label: t("to"), icon: IconCalendar, node: <DatePicker value={dates.to} onChange={(v) => { setDates((d) => ({ ...d, to: v })); setOffset(0); }} placeholder={t("to")} ariaLabel={t("to")} min={dates.from || undefined} clearLabel={tu("clear")} />, active: !!dates.to, chip: dates.to ? `${t("to")}: ${f.date(dates.to)}` : null, clear: () => setDates((d) => ({ ...d, to: "" })) },
        ]}
        count={rows.total}
        onReset={() => { setDates({ from: "", to: "" }); setOffset(0); }}
      />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <div className="hrm-stats">
        <HrmStat icon={IconCheck} tone="ok" label={t("att.present")} value={loading ? "…" : sum.present} />
        <HrmStat icon={IconClock} tone="blue" label={t("att.worked")} value={loading ? "…" : f.minutes(sum.worked)} />
        <HrmStat icon={IconCalendar} tone="warn" label={t("att.late")} value={loading ? "…" : sum.late} />
        <HrmStat icon={IconChartBar} tone="violet" label={t("att.overtime")} value={loading ? "…" : f.minutes(sum.overtime)} />
      </div>
      <HrmPanel flush>
        {loading ? <div style={{ padding: 16 }}><HrmLoading /></div> : rows.items.length ? <AttendanceTable rows={rows.items} /> : <HrmEmpty icon={IconCalendar} title={t("empty.attendance")} text={t("emptyAttendanceLead")} />}
        <InternalPagination page={rows} onChange={setOffset} />
      </HrmPanel>
    </section>
  );
}

export function AttendanceTable({ rows, nameOf }: { rows: HrmAttendance[]; nameOf?: (r: HrmAttendance) => { name: string; sub: string } }) {
  const t = useTranslations("internal.pages");
  const f = useHrmFormat();
  return (
    <div className="hrm-table-wrap">
      <table className="hrm-table">
        <thead>
          <tr>
            <th>{t("columns.date")}</th>
            {nameOf ? <th>{t("columns.employee")}</th> : null}
            <th>{t("columns.status")}</th>
            <th>{t("columns.checkIn")}</th>
            <th>{t("columns.checkOut")}</th>
            <th className="hrm-num">{t("columns.worked")}</th>
            <th className="hrm-num">{t("columns.late")}</th>
            <th className="hrm-num">{t("columns.overtime")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const who = nameOf?.(r);
            return (
              <tr key={r.id || `${r.employeeId}-${r.date}`}>
                <td><b>{f.date(r.date)}</b></td>
                {who ? <td><b>{who.name}</b>{who.sub ? <small>{who.sub}</small> : null}</td> : null}
                <td><HrmStatus value={r.status} /></td>
                <td>{f.time(r.firstIn)}</td>
                <td>{f.time(r.lastOut)}</td>
                <td className="hrm-num">{f.minutes(r.workedMinutes)}</td>
                <td className="hrm-num">{r.lateMinutes ? <span className="hrm-late">{f.minutes(r.lateMinutes)}</span> : "—"}</td>
                <td className="hrm-num">{f.minutes(r.overtimeMinutes)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Messages ───────────────────────────────────────────────────────────────

function MessagesPage() {
  const t = useTranslations("internal.pages");
  const tu = useTranslations("internal.ui");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const [page, setPage] = useState<InternalPage<HrmMessage>>(EMPTY_PAGE);
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState({ to: "", subject: "", body: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const res = await getMyMessages({ limit: 25, offset }, signal);
      setPage({ ...res, items: res.items.map(normMessage) });
    } catch (cause) {
      if (!aborted(cause)) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [offset]);
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => load(c.signal));
    return () => c.abort();
  }, [load]);
  const reload = useCallback(() => void load(), [load]);
  useReload(reload);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.to || !form.body.trim() || saving) return;
    setSaving(true);
    setError(false);
    setSent(false);
    try {
      await sendInternalMessage({ recipient_user_id: form.to, thread_type: "direct", thread_id: null, subject: form.subject.trim(), body: form.body.trim(), attachments: [] });
      setForm({ to: "", subject: "", body: "" });
      setSent(true);
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const unread = page.items.filter((m) => m.unread).length;

  return (
    <section className="hrm-page">
      <HrmHead kicker={t("kicker")} title={t("titles.messages")} lead={t("subtitles.messages")} actions={<button className="btn btn--line btn--sm" type="button" onClick={reload} disabled={loading}><IconRefresh />{t("refresh")}</button>} />
      {error ? <HrmError text={t("error")} onRetry={reload} retryLabel={t("refresh")} /> : null}
      <div className="hrm-grid hrm-grid--side">
        <HrmPanel title={t("inbox")} icon={IconChat} count={unread ? `${unread} / ${page.total}` : page.total}>
          {loading ? <HrmLoading rows={3} /> : page.items.length ? (
            <ul className="hrm-list hrm-msgs">
              {page.items.map((m) => {
                // Messages name their sender by login id only; the directory
                // turns that into the colleague's name.
                const from = m.senderName || dir.userName(m.senderUserId) || t("unknownSender");
                return (
                  <li key={m.id || m.createdAt} className={m.unread ? "is-unread" : undefined}>
                    <HrmAvatar name={from} size="sm" />
                    <span className="hrm-list__t">
                      <b>{m.subject ? `${from} · ${m.subject}` : from}</b>
                      <small>{m.body || t("messageFallback")}</small>
                    </span>
                    <span className="hrm-list__a hrm-muted">{f.dateTime(m.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          ) : <HrmEmpty icon={IconChat} title={t("empty.messages")} text={t("emptyMessagesLead")} />}
          <InternalPagination page={page} onChange={setOffset} />
        </HrmPanel>
        <HrmPanel title={t("newMessage")} icon={IconSend}>
          <form className="hrm-form" onSubmit={submit}>
            <InternalField label={t("recipientUserId")}>
              <EntitySelect value={form.to} onChange={(v) => setForm((c) => ({ ...c, to: v }))} options={dir.userOptions} placeholder={tu("choose.recipient")} ariaLabel={t("recipientUserId")} />
            </InternalField>
            {dir.ready && !dir.userOptions.length ? <p className="hrm-form__note">{t("noRecipients")}</p> : null}
            <InternalField label={t("subject")}>
              <input value={form.subject} onChange={(e) => setForm((c) => ({ ...c, subject: e.target.value }))} placeholder={t("subject")} maxLength={160} />
            </InternalField>
            <InternalField label={t("messageBody")}>
              <textarea value={form.body} onChange={(e) => setForm((c) => ({ ...c, body: e.target.value }))} placeholder={t("messageBody")} maxLength={4000} rows={5} required />
            </InternalField>
            {sent ? <div className="hrm-ok"><IconCheck />{t("sent")}</div> : null}
            <div className="hrm-form__foot">
              <button className="btn btn--pri btn--sm" type="submit" disabled={saving || !form.to || !form.body.trim()}><IconSend />{saving ? t("sending") : t("send")}</button>
            </div>
          </form>
        </HrmPanel>
      </div>
    </section>
  );
}
