"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError, asArr, asDict, asNum } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  canInternal,
  createAttendanceEvent,
  getMyMessages,
  getMyToday,
  normAttendance,
  normMessage,
  normTask,
  personName,
  type HrmAttendance,
  type HrmMessage,
  type HrmTask,
  type InternalPermission,
} from "@/lib/services/internalHrm";
import { HrmEmpty, HrmError, HrmLoading, HrmPanel, HrmPriority, HrmStat, HrmStatus, isOverdue, useHrmFormat, useNow } from "@/components/internal/HrmUi";
import { IconBriefcase, IconBuilding, IconCalendar, IconChartBar, IconChat, IconCheck, IconClock, IconRefresh, IconShieldCheck, IconUsers } from "@/components/icons";

type Today = { name: string; code: string; date: string; attendance: HrmAttendance | null; tasks: HrmTask[]; approvals: number; messages: HrmMessage[] };

const SHORTCUTS: { href: string; key: string; Icon: typeof IconUsers; permission: InternalPermission }[] = [
  { href: "/internal/employees", key: "employees", Icon: IconUsers, permission: "internal_hr.manage" },
  { href: "/internal/org", key: "org", Icon: IconBuilding, permission: "internal_org.manage" },
  { href: "/internal/execution", key: "execution", Icon: IconBriefcase, permission: "internal_execution.manage" },
  { href: "/internal/analytics", key: "analytics", Icon: IconChartBar, permission: "internal_analytics.view" },
];

export default function InternalDashboard() {
  const t = useTranslations("internal.dashboard");
  const tn = useTranslations("internal.nav");
  const to = useTranslations("internal.operations");
  const f = useHrmFormat();
  const { session } = useAuth();
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockNote, setClockNote] = useState<"" | "ok" | "err">("");
  const sessionName = session?.name ?? "";
  const now = useNow();

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      // The inbox is its own request: an account that may not read it still
      // gets its day.
      const [todayRaw, messages] = await Promise.all([
        getMyToday(signal),
        getMyMessages({ unread: true, limit: 5, offset: 0 }, signal).catch(() => null),
      ]);
      const d = asDict(todayRaw);
      const employee = asDict(d.employee);
      setData({
        name: personName(employee) || sessionName,
        code: String(employee.employee_code ?? ""),
        date: String(d.date ?? ""),
        attendance: d.attendance ? normAttendance(d.attendance) : null,
        tasks: asArr(d.tasks).map(normTask),
        approvals: asNum(d.pending_approvals),
        messages: (messages?.items ?? []).map(normMessage),
      });
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [sessionName]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);
  useEffect(() => subscribeUserEvents((event) => { if (event.event.startsWith("internal.")) void load(); }), [load]);

  async function clock(eventType: "check_in" | "check_out") {
    if (clockBusy) return;
    setClockBusy(true);
    setClockNote("");
    try {
      await createAttendanceEvent({ event_type: eventType, source: "manual", event_at: null, note: "", meta: {} });
      setClockNote("ok");
      await load();
    } catch {
      setClockNote("err");
    } finally {
      setClockBusy(false);
    }
  }

  const att = data?.attendance ?? null;
  const checkedIn = !!att?.firstIn;
  const checkedOut = !!att?.lastOut;
  const openTasks = (data?.tasks ?? []).filter((task) => !["done", "cancelled"].includes(task.status));
  const shortcuts = SHORTCUTS.filter((s) => canInternal(session, s.permission));

  return (
    <section className="hrm-page">
      <div className="hrm-hero">
        <div>
          <span className="hrm-kicker">{t("kicker")}</span>
          <h2>{data?.name ? t("greeting", { name: data.name.split(" ")[0] }) : t("title")}</h2>
          <p>{t("lead")}</p>
          <div className="hrm-hero__meta">
            {data?.date ? <span className="pill pill--glass"><IconCalendar />{f.date(data.date)}</span> : null}
            {data?.code ? <span className="pill pill--glass">{data.code}</span> : null}
          </div>
        </div>
        <button className="btn btn--glass btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button>
      </div>

      {error ? <HrmError text={t("error")} onRetry={() => void load()} retryLabel={t("refresh")} /> : null}

      <div className="hrm-stats">
        <HrmStat icon={IconBriefcase} tone="blue" label={t("stats.tasks")} value={loading ? "…" : openTasks.length} />
        <HrmStat
          icon={IconClock}
          tone={checkedIn ? "ok" : "warn"}
          label={t("stats.attendance")}
          value={loading ? "…" : checkedIn ? f.time(att!.firstIn) : t("notCheckedIn")}
          hint={att?.workedMinutes ? t("workedToday", { time: f.minutes(att.workedMinutes) }) : undefined}
        />
        <HrmStat icon={IconShieldCheck} tone="violet" label={t("stats.approvals")} value={loading ? "…" : data?.approvals ?? 0} />
        <HrmStat icon={IconChat} tone="cyan" label={t("stats.messages")} value={loading ? "…" : data?.messages.length ?? 0} />
      </div>

      <div className="hrm-grid hrm-grid--side">
        <HrmPanel title={t("tasksTitle")} icon={IconBriefcase} count={openTasks.length} actions={<Link className="btn btn--line btn--sm" href="/internal/me/tasks">{t("openAll")}</Link>}>
          {loading ? <HrmLoading rows={3} /> : openTasks.length ? (
            <ul className="hrm-list">
              {openTasks.slice(0, 6).map((task) => {
                const overdue = isOverdue(task.deadline, task.status, now);
                return (
                  <li key={task.id || task.title}>
                    <span className="hrm-list__t">
                      <b>{task.title || t("untitled")}</b>
                      <small>
                        {task.code ? `${task.code} · ` : ""}
                        {task.deadline ? <span className={overdue ? "hrm-late" : undefined}>{f.dateTime(task.deadline)}</span> : t("noDueDate")}
                      </small>
                    </span>
                    <span className="hrm-list__a"><HrmPriority value={task.priority} /><HrmStatus value={task.status} /></span>
                  </li>
                );
              })}
            </ul>
          ) : <HrmEmpty icon={IconCheck} title={t("noTasks")} text={t("noTasksLead")} />}
        </HrmPanel>

        <div className="hrm-grid">
          <HrmPanel title={t("attendanceTitle")} icon={IconClock}>
            {loading ? <HrmLoading rows={2} /> : (
              <div className="hrm-form">
                <div className="hrm-minis" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
                  <div className="hrm-mini"><b>{checkedIn ? f.time(att!.firstIn) : "—"}</b><span>{t("arrived")}</span></div>
                  <div className="hrm-mini"><b>{checkedOut ? f.time(att!.lastOut) : "—"}</b><span>{t("left")}</span></div>
                </div>
                <div className="hrm-form__foot">
                  <button className="btn btn--pri btn--sm" type="button" onClick={() => void clock("check_in")} disabled={clockBusy || checkedIn}><IconClock />{to("checkIn")}</button>
                  <button className="btn btn--line btn--sm" type="button" onClick={() => void clock("check_out")} disabled={clockBusy || !checkedIn || checkedOut}><IconClock />{to("checkOut")}</button>
                </div>
                {clockNote === "ok" ? <div className="hrm-ok"><IconCheck />{t("clockSaved")}</div> : clockNote === "err" ? <HrmError text={t("clockError")} /> : null}
              </div>
            )}
          </HrmPanel>

          <HrmPanel title={t("messagesTitle")} icon={IconChat} count={data?.messages.length ?? 0} actions={<Link className="btn btn--line btn--sm" href="/internal/me/messages">{t("openAll")}</Link>}>
            {loading ? <HrmLoading rows={2} /> : data?.messages.length ? (
              <ul className="hrm-list">
                {data.messages.map((m) => (
                  <li key={m.id || m.createdAt}>
                    <span className="hrm-list__t"><b>{m.subject || m.body || t("messageFallback")}</b><small>{[m.senderName, f.dateTime(m.createdAt)].filter(Boolean).join(" · ")}</small></span>
                  </li>
                ))}
              </ul>
            ) : <HrmEmpty icon={IconChat} title={t("noMessages")} />}
          </HrmPanel>

          {shortcuts.length ? (
            <HrmPanel title={t("quickTitle")}>
              <div className="hrm-shortcuts">
                {shortcuts.map(({ href, key, Icon }) => (
                  <Link key={href} href={href} className="hrm-shortcut"><span><Icon /></span>{tn(key)}</Link>
                ))}
              </div>
            </HrmPanel>
          ) : null}
        </div>
      </div>
    </section>
  );
}
