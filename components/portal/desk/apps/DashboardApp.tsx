"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { getSellerCabinetFull, type SellerCabinetFull } from "@/lib/services/dash";
import { listCalendarEvents, listMyTasks, type CalendarEvent, type WorkTask } from "@/lib/services/backend";
import { dateOnly, fmtDate } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { IconAlert, IconArrowRight, IconBell, IconBriefcase, IconCalendar, IconChat, IconCheck, IconClipboardCheck, IconFileText, IconFolder, IconGavel, IconRefresh, IconSparkle, IconTag, IconUser, IconUsers } from "@/components/icons";
import { App, Avatar, Btn, Empty, Loading, Progress, Tag, Tool, Toolbar, useOs } from "../kit/kit";
import type { NativeProps } from "../native";
import "./dashboard.css";

// The cabinet's home as a desktop program: the day at a glance. On Windows
// a page of cards in the Windows 11 manner (the Settings home); on the Mac
// a board of widget panels. The numbers that matter, today's hearings,
// meetings and due tasks, the active cases with their next step, new
// orders, the latest notifications, how complete the profile is, and the
// apps used most — each opens its own app.

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const num = (o: Record<string, unknown> | undefined, k: string) => {
  const x = o?.[k];
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function DashboardApp({ base, openApp }: NativeProps) {
  const d = useTranslations("portal.desk.home");
  const td = useTranslations("portal.advocate.dashboard");
  const tc = useTranslations("portal.common");
  const tk = useTranslations("portal.tasks");
  const locale = useLocale();
  const os = useOs();
  const { session } = useAuth();
  const [cab, setCab] = useState<SellerCabinetFull | null>(null);
  const [failed, setFailed] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [today, setToday] = useState("");
  const [hour, setHour] = useState(12);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      const n = new Date();
      setToday(keyOf(n));
      setHour(n.getHours());
    }, 0);
    getSellerCabinetFull()
      .then((c) => alive && setCab(c))
      .catch(() => alive && setFailed(true));
    listCalendarEvents()
      .then((l) => alive && setEvents(l))
      .catch(() => undefined);
    listMyTasks()
      .then((l) => alive && setTasks(l))
      .catch(() => undefined);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [tick]);

  const name = (cab?.profile.name || session?.name || "").split(/\s+/)[0] ?? "";
  const greet = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 18 ? "day" : "evening";
  const todayEvents = useMemo(() => events.filter((e) => e.startsAt && keyOf(new Date(e.startsAt)) === today).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [events, today]);
  const openTasks = useMemo(() => tasks.filter((x) => !/^(done|completed|closed)$/.test(x.status)), [tasks]);
  const dueTasks = useMemo(() => openTasks.filter((x) => x.dueDate && x.dueDate.slice(0, 10) <= today).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")), [openTasks, today]);
  const cases = useMemo(() => cab?.activeCases ?? [], [cab]);
  const weekAhead = useMemo(() => {
    if (!today) return 0;
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    const endKey = keyOf(end);
    return cases.filter((c) => c.deadlineAt && c.deadlineAt.slice(0, 10) >= today && c.deadlineAt.slice(0, 10) <= endKey).length;
  }, [cases, today]);
  const clients = new Set((cab?.secureChats ?? []).map((r) => r.clientUserId).filter(Boolean)).size;
  const unread = (cab?.notifications ?? []).filter((n) => !n.read);
  const completeness = session?.completeness ?? 0;
  const workload = cab?.stats.workload;

  if (!cab && !failed) return <App name="home"><Toolbar title={td("kicker")} /><Loading label={d("loading")} /></App>;

  const stat = (key: string, value: number | string, label: string, icon: ReactNode, app: string, tone: string) => (
    <button key={key} type="button" className={`dxh-stat dxh-stat--${tone}`} onClick={() => openApp(app)}>
      <i>{icon}</i>
      <b>{value}</b>
      <span>{label}</span>
    </button>
  );
  const panel = (key: string, title: string, icon: ReactNode, app: string, children: ReactNode, wide = false) => (
    <section key={key} className={`dxh-panel${wide ? " dxh-panel--wide" : ""}`} aria-label={title}>
      <header>
        <span className="dxh-panel__ic">{icon}</span>
        <h2>{title}</h2>
        <button type="button" onClick={() => openApp(app)} aria-label={d("openApp", { name: title })} title={d("openApp", { name: title })}>
          {os === "win" ? d("seeAll") : null}
          <IconArrowRight aria-hidden />
        </button>
      </header>
      <div className="dxh-panel__b">{children}</div>
    </section>
  );
  const LAUNCH: [string, ReactNode, string][] = [
    ["tasks", <IconClipboardCheck key="t" />, d("apps.tasks")],
    ["calendar", <IconCalendar key="c" />, d("apps.calendar")],
    ["clients", <IconUsers key="u" />, d("apps.clients")],
    ["files", <IconFolder key="f" />, d("apps.files")],
    ["messages", <IconChat key="m" />, d("apps.messages")],
    ["copilot", <IconSparkle key="a" />, d("apps.copilot")],
  ];

  return (
    <App name="home">
      <Toolbar title={td("kicker")} subtitle={today ? fmtDate(today, locale) : undefined}>
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxh dx-scroll">
        <header className="dxh-hero">
          <Avatar name={cab?.profile.name || session?.name || "?"} size={os === "mac" ? 56 : 64} />
          <div>
            <h2>{d(`greet.${greet}`, { name })}</h2>
            <p>{d("summary", { events: todayEvents.length, tasks: dueTasks.length })}</p>
          </div>
          {completeness < 100 ? (
            <button type="button" className="dxh-complete" onClick={() => openApp("profile")}>
              <span>
                <b>{td("completeness")}</b>
                <small>{td("completenessHint")}</small>
              </span>
              <em>{completeness}%</em>
              <Progress value={completeness} label={td("completeness")} />
            </button>
          ) : null}
        </header>

        {failed ? (
          <Empty icon={<IconAlert />} title={d("loadError")} action={<Btn onClick={() => setTick((n) => n + 1)}>{d("retry")}</Btn>} />
        ) : (
          <>
            <div className="dxh-stats">
              {stat("cases", cases.length, td("statCases"), <IconBriefcase />, "cases", "blue")}
              {stat("today", todayEvents.length || num(workload, "courts_today"), d("statToday"), <IconCalendar />, "calendar", "red")}
              {stat("tasks", dueTasks.length, d("statTasks"), <IconClipboardCheck />, "tasks", "green")}
              {stat("week", weekAhead, d("statWeek"), <IconGavel />, "cases", "orange")}
              {stat("clients", clients, td("statClients"), <IconUsers />, "clients", "purple")}
              {stat("docs", num(workload, "documents_to_review"), td("statDocs"), <IconFileText />, "documentRequests", "teal")}
            </div>

            <div className="dxh-grid">
              {panel(
                "agenda",
                d("today"),
                <IconCalendar />,
                "calendar",
                todayEvents.length || dueTasks.length ? (
                  <ul className="dxh-agenda">
                    {todayEvents.map((e) => (
                      <li key={e.id}>
                        <time>{hhmm(e.startsAt)}</time>
                        <i className={`dxh-dot dxh-dot--${e.type}`} aria-hidden />
                        <span>
                          <b>{e.title}</b>
                          <small>{e.location}</small>
                        </span>
                      </li>
                    ))}
                    {dueTasks.slice(0, 6).map((x) => (
                      <li key={x.id} className="is-task">
                        <time>
                          <IconCheck aria-hidden />
                        </time>
                        <i className="dxh-dot dxh-dot--task" aria-hidden />
                        <span>
                          <b>{x.title}</b>
                          <small>{x.dueDate && x.dueDate.slice(0, 10) < today ? d("overdue", { date: dateOnly(x.dueDate, locale) }) : tk("due")}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dxh-empty">{d("freeDay")}</p>
                ),
              )}
              {panel(
                "cases",
                td("statCases"),
                <IconBriefcase />,
                "cases",
                cases.length ? (
                  <ul className="dxh-cases">
                    {cases.slice(0, 6).map((c) => {
                      const late = !!c.deadlineAt && c.deadlineAt.slice(0, 10) < today;
                      return (
                        <li key={c.id}>
                          <span>
                            <b>{c.title || c.caseNumber}</b>
                            <small>{[c.caseNumber, c.nextAction].filter(Boolean).join(" · ")}</small>
                          </span>
                          {c.deadlineAt ? <Tag tone={late ? "err" : "neutral"}>{dateOnly(c.deadlineAt, locale)}</Tag> : c.stage ? <Tag>{statusLabel(tc, c.stage)}</Tag> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="dxh-empty">{d("noCases")}</p>
                ),
              )}
              {panel(
                "orders",
                d("newOrders"),
                <IconTag />,
                "marketplaceOrders",
                cab?.newOrders.length ? (
                  <ul className="dxh-cases">
                    {cab.newOrders.slice(0, 5).map((o) => (
                      <li key={o.id}>
                        <span>
                          <b>{o.title || o.serviceName}</b>
                          <small>{[statusLabel(tc, o.status), o.createdAt ? dateOnly(o.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                        </span>
                        <Btn small onClick={() => openApp("marketplaceOrders", `${base}/marketplace-orders/${o.id}`)}>
                          {d("open")}
                        </Btn>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dxh-empty">{d("noOrders")}</p>
                ),
              )}
              {panel(
                "notes",
                d("notifications"),
                <IconBell />,
                "notifications",
                (cab?.notifications ?? []).length ? (
                  <ul className="dxh-notes">
                    {(cab?.notifications ?? []).slice(0, 5).map((n) => (
                      <li key={n.id} className={n.read ? "" : "is-new"}>
                        <i aria-hidden />
                        <span>
                          <b>{n.title}</b>
                          <small>{n.body}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dxh-empty">{td("activityEmpty")}</p>
                ),
              )}
              <section className="dxh-panel dxh-panel--launch" aria-label={d("launch")}>
                <header>
                  <span className="dxh-panel__ic">
                    <IconUser />
                  </span>
                  <h2>{d("launch")}</h2>
                </header>
                <div className="dxh-launch">
                  {LAUNCH.map(([key, ic, label]) => (
                    <button key={key} type="button" className={`dxh-app dxh-app--${key}`} onClick={() => openApp(key)}>
                      <i>{ic}</i>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                {unread.length ? <p className="dxh-unread">{d("unread", { n: unread.length })}</p> : null}
              </section>
            </div>
          </>
        )}
      </div>
    </App>
  );
}
