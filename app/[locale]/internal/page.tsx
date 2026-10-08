"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, asDict, asNum, asStr } from "@/lib/http";
import { getMyMessages, getMyTasks, getMyToday, type InternalRecord, type InternalTask } from "@/lib/services/internalHrm";
import { IconBriefcase, IconCalendar, IconChat, IconRefresh } from "@/components/icons";

type Dashboard = { today: InternalRecord; tasks: InternalTask[]; messages: InternalRecord[] };

function text(value: unknown, fallback: unknown = "—") {
  return asStr(value, asStr(fallback)).trim() || asStr(fallback);
}

export default function InternalDashboard() {
  const t = useTranslations("internal.dashboard");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError(false);
    try {
      const [todayRaw, tasks, messages] = await Promise.all([
        getMyToday(signal),
        getMyTasks({ limit: 5, offset: 0 }, signal),
        getMyMessages({ unread: true, limit: 5, offset: 0 }, signal),
      ]);
      setData({ today: asDict(todayRaw), tasks: tasks.items, messages: messages.items });
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.detail === "aborted")) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, []);

  const today = data?.today ?? {};
  const stats = [
    { key: "tasks", value: asNum(today.tasks_count ?? today.open_tasks ?? data?.tasks.length), Icon: IconBriefcase },
    { key: "attendance", value: text(today.attendance_status ?? today.today_status), Icon: IconCalendar },
    { key: "messages", value: asNum(today.unread_messages ?? data?.messages.length), Icon: IconChat },
  ];

  return <section className="internal-page">
    <div className="internal-hero">
      <div><span className="internal-kicker">{t("kicker")}</span><h2>{text(today.greeting, t("title"))}</h2><p>{text(today.subtitle, t("lead"))}</p></div>
      <button className="btn btn--glass btn--sm" type="button" onClick={() => void load()} disabled={loading}><IconRefresh />{t("refresh")}</button>
    </div>
    {error && <div className="internal-notice internal-notice--error" role="alert">{t("error")}</div>}
    <div className="internal-stats">
      {stats.map(({ key, value, Icon }) => <div className="internal-stat" key={key}><span className="internal-stat__icon"><Icon /></span><span><b>{loading ? "…" : value}</b><small>{t(`stats.${key}`)}</small></span></div>)}
    </div>
    <div className="internal-columns">
      <div className="internal-panel"><div className="internal-panel__head"><h3>{t("tasksTitle")}</h3><span className="pill pill--gray">{data?.tasks.length ?? 0}</span></div>
        {loading ? <div className="internal-loading" aria-busy="true" /> : data?.tasks.length ? <div className="internal-list">{data.tasks.map((task) => <div className="internal-row" key={text(task.id, `${task.title}-${task.due_at}`)}><div><b>{text(task.title, t("untitled"))}</b><small>{text(task.assignee_name ?? task.due_at, t("noDueDate"))}</small></div><span className="pill">{text(task.status)}</span></div>)}</div> : <p className="internal-empty">{t("noTasks")}</p>}
      </div>
      <div className="internal-panel"><div className="internal-panel__head"><h3>{t("messagesTitle")}</h3><span className="pill pill--gray">{data?.messages.length ?? 0}</span></div>
        {loading ? <div className="internal-loading" aria-busy="true" /> : data?.messages.length ? <div className="internal-list">{data.messages.map((message) => <div className="internal-row" key={text(message.id, message.created_at)}><div><b>{text(message.subject ?? message.title, t("messageFallback"))}</b><small>{text(message.created_at)}</small></div></div>)}</div> : <p className="internal-empty">{t("noMessages")}</p>}
      </div>
    </div>
  </section>;
}
