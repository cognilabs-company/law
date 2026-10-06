"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { dateOnly } from "@/lib/date";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { useAiField, useAiSelection } from "@/lib/ai/registry";
import Select from "@/components/Select";
import SellerDashboard from "./SellerDashboard";
import { useSellerCabinet } from "./SellerCabinet";
import MiniCalendar, { type MiniCalEvent } from "./MiniCalendar";
import TwoFactorCard from "./TwoFactorCard";
import TelegramLinkCard from "./TelegramLinkCard";
import NotificationPrefsCard from "./NotificationPrefsCard";
import {
  IconBolt,
  IconArrowRight,
  IconUsers,
  IconBriefcase,
  IconCalendar,
  IconFileText,
  IconCheck,
  IconUserPlus,
  IconFolderPlus,
  IconUpload,
  IconClock,
  IconSparkle,
  IconBell,
} from "../icons";

const num = (o: Record<string, unknown> | undefined, k: string): number => {
  const x = o?.[k];
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};

type TaskTab = "today" | "upcoming" | "done";
const TASK_TABS: TaskTab[] = ["today", "upcoming", "done"];
const isTaskTab = (v: string): v is TaskTab => (TASK_TABS as string[]).includes(v);

const CHECKLIST = [
  { key: "checkBasics", at: 1 },
  { key: "checkId", at: 25 },
  { key: "checkDocs", at: 50 },
  { key: "checkServices", at: 75 },
  { key: "checkPricing", at: 100 },
];

// Advocate and lawyer dashboards share the same layout, data shape
// (useSellerCabinet) and translated copy — only the route prefix and the
// bottom panel (advocate: boost/upgrade; lawyer: account-security cards,
// since the lawyer nav has no dedicated place for those) differ.
export default function SellerRichDashboard({ role }: { role: "advocate" | "lawyer" }) {
  const t = useTranslations("portal.advocate.dashboard");
  const tt = useTranslations("portal.tasks");
  const locale = useLocale();
  const { session } = useAuth();
  const cabinet = useSellerCabinet();
  const completeness = session?.completeness ?? 0;
  const [taskTab, setTaskTab] = useState<TaskTab>("today");
  useAiSelection("dashboard_tasks_tab", taskTab);
  useAiField("advocate.dashboard.tasks.filters.period", {
    get: () => taskTab,
    set: (v) => {
      if (isTaskTab(v)) setTaskTab(v);
    },
  });
  const base = `/portal/${role}`;
  const QUICK = [
    { key: "quickClient", ai: "clients", Icon: IconUserPlus, href: `${base}/clients` },
    { key: "quickCase", ai: "cases", Icon: IconFolderPlus, href: `${base}/cases` },
    { key: "quickDoc", ai: "files", Icon: IconUpload, href: `${base}/files` },
    { key: "quickMeeting", ai: "calendar", Icon: IconCalendar, href: `${base}/calendar` },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const cases = useMemo(() => cabinet.data?.activeCases ?? [], [cabinet.data]);
  const notifications = cabinet.data?.notifications ?? [];
  const workload = cabinet.data?.stats.workload;

  const tasks = useMemo(
    () =>
      cases.map((c) => ({
        ...c,
        isToday: !!c.deadlineAt && c.deadlineAt.slice(0, 10) === today,
        isDone: c.status === "completed" || c.status === "archived",
      })),
    [cases, today],
  );
  const taskGroups = {
    today: tasks.filter((x) => x.isToday && !x.isDone),
    upcoming: tasks.filter((x) => !x.isToday && !x.isDone),
    done: tasks.filter((x) => x.isDone),
  };
  const shownTasks = taskGroups[taskTab];

  const calEvents = useMemo<MiniCalEvent[]>(
    () =>
      cases
        .filter((c) => c.deadlineAt)
        .map((c) => ({ id: c.id, date: c.deadlineAt, label: c.nextAction || c.title, sub: c.stage })),
    [cases],
  );

  const clientsCount = useMemo(() => {
    const ids = new Set((cabinet.data?.secureChats ?? []).map((r) => r.clientUserId).filter(Boolean));
    return ids.size;
  }, [cabinet.data]);

  if (cabinet.data?.limitedAccess) {
    return <SellerDashboard role={role as Role} />;
  }

  return (
    <>
      <div className="dhero" data-ai-id="advocate.dashboard" data-ai-type="section" data-ai-label={t("kicker")}>
        <div className="dhero__main">
          <span className="dhero__k">{t("kicker")}</span>
          <h2 className="psec-h" style={{ color: "#fff" }}>{t("heroTitle")}</h2>
          <p>{t("heroSub")}</p>
        </div>
        <div className="dhero__quote">
          <div className="dhero__quoteImg">
            <Image src="/img/law-banner.png" alt="" fill sizes="(max-width: 980px) 60vw, 280px" style={{ objectFit: "contain" }} />
          </div>
        </div>
        <div className="dhero__greet" data-ai-private>
          <span className="dhero__date">{new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}</span>
          <b>{t("hi", { name: session?.name ?? "" })}</b>
          <p>{t("greetSub", { meetings: num(workload, "courts_today"), tasks: taskGroups.today.length })}</p>
        </div>
      </div>

      {cabinet.status === "loading" ? null : (
        <div className="amet" data-ai-target="seller-dashboard:stats" data-ai-id="advocate.dashboard.stats">
          <Link href={`${base}/clients`} className="amet__c stile stile--btn">
            <span className="amet__i"><IconUsers /></span>
            <b>{clientsCount}</b>
            <span className="amet__l">{t("statClients")}</span>
          </Link>
          <Link href={`${base}/cases`} className="amet__c stile stile--btn">
            <span className="amet__i"><IconBriefcase /></span>
            <b>{cases.length}</b>
            <span className="amet__l">{t("statCases")}</span>
          </Link>
          <Link href={`${base}/calendar`} className="amet__c stile stile--btn">
            <span className="amet__i"><IconCalendar /></span>
            <b>{num(workload, "courts_today")}</b>
            <span className="amet__l">{t("statMeetings")}</span>
          </Link>
          <Link href={`${base}/files`} className="amet__c stile stile--btn">
            <span className="amet__i"><IconFileText /></span>
            <b>{num(workload, "documents_to_review")}</b>
            <span className="amet__l">{t("statDocs")}</span>
          </Link>
        </div>
      )}

      <div className="dgrid2">
        <div className="ppanel pcompl" data-ai-target="seller-dashboard:completeness" data-ai-label={t("completeness")} data-ai-id="advocate.dashboard.completeness">
          <div className="ring" style={{ "--v": `${completeness}%` } as CSSProperties}>
            <b>{completeness}%</b>
          </div>
          <div className="pcompl__mid">
            <b>{t("completeness")}</b>
            <p>{t("completenessHint")}</p>
            <Link href={`${base}/profile`} className="btn btn--pri btn--sm">
              {t("completeCta")}
              <IconArrowRight />
            </Link>
          </div>
          <div className="pcompl__list">
            {CHECKLIST.map((c) => (
              <span key={c.key} className={completeness >= c.at ? "on" : undefined}>
                <IconCheck />
                {t(c.key)}
              </span>
            ))}
          </div>
        </div>

        <div className="ppanel" data-ai-target="seller-dashboard:quick-actions" data-ai-id="advocate.dashboard.quick-actions">
          <div className="ppanel__h">
            <b>{t("quickActions")}</b>
          </div>
          <div className="qact">
            {QUICK.map((q) => (
              <Link key={q.key} href={q.href} className="qact__i" data-ai-id={`advocate.dashboard.quick-actions.${q.ai}`}>
                <span className="qact__ico"><q.Icon /></span>
                {t(q.key)}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="dgrid3">
        <div className="ppanel" data-ai-target="seller-dashboard:tasks" data-ai-id="advocate.dashboard.tasks" data-ai-label={t("myTasks")}>
          <div className="ppanel__h">
            <b>{t("myTasks")}</b>
            <div className="wsel" data-ai-id="advocate.dashboard.tasks.filters.period" data-ai-type="select" data-ai-label={tt("due")}>
              <Select
                value={taskTab}
                onChange={(v) => {
                  if (isTaskTab(v)) setTaskTab(v);
                }}
                ariaLabel={tt("due")}
                options={TASK_TABS.map((k) => ({ value: k, label: t(`tab_${k}`, { n: taskGroups[k].length }) }))}
              />
            </div>
          </div>
          {!shownTasks.length ? (
            <p className="advmuted">{t("tasksEmpty")}</p>
          ) : (
            <div data-ai-private>
              {shownTasks.map((c) => (
                <div className="dtask" key={c.id}>
                  <span className={`dtask__dot${c.isDone ? " dtask__dot--done" : ""}`} />
                  <div className="dtask__m">
                    <b>{c.nextAction || c.title}</b>
                    {c.caseNumber ? <span>{c.caseNumber}</span> : null}
                  </div>
                  {c.deadlineAt ? (
                    <span className="dtask__t">
                      <IconClock />
                      {dateOnly(c.deadlineAt, locale)}
                    </span>
                  ) : null}
                  {c.stage ? <span className="dtask__badge st st--active">{c.stage}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ppanel" data-ai-target="seller-dashboard:calendar" data-ai-id="advocate.dashboard.calendar" data-ai-label={t("calendar")}>
          <div className="ppanel__h">
            <b>{t("calendar")}</b>
          </div>
          <MiniCalendar events={calEvents} />
        </div>

        <div className="dgrid3__col">
          <div className="ppanel" data-ai-target="seller-dashboard:activity" data-ai-id="advocate.dashboard.activity" data-ai-label={t("recentActivity")}>
            <div className="ppanel__h">
              <b>{t("recentActivity")}</b>
            </div>
            {!notifications.length ? (
              <p className="advmuted">{t("activityEmpty")}</p>
            ) : (
              <div className="dactivity" data-ai-private>
                {notifications.slice(0, 5).map((n) => (
                  <div className="dactivity__row" key={n.id}>
                    <span className="dactivity__ico"><IconBell /></span>
                    <div className="dactivity__m">
                      <b>{n.title || n.body}</b>
                    </div>
                    <span className="dactivity__ago">{n.createdAt ? dateOnly(n.createdAt, locale) : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="aicard" data-ai-target="seller-dashboard:ai" data-ai-label={t("aiTitle")} data-ai-id="advocate.dashboard.ai-assistant">
            <div className="aicard__h">
              <IconSparkle />
              {t("aiTitle")}
              <span className="chip">{t("aiBeta")}</span>
            </div>
            <p>{t("aiSub")}</p>
            <Link href={`${base}/${role === "advocate" ? "assistant" : "ai"}`} className="btn btn--glass btn--sm">
              {t("aiCta")}
              <IconArrowRight />
            </Link>
          </div>
        </div>
      </div>

      {role === "advocate" ? (
        <div className="ppanel" data-ai-target="seller-dashboard:promotion" data-ai-id="advocate.dashboard.promotion" data-ai-label={t("boostTitle")}>
          <div className="ppanel__h">
            <b>{t("boostTitle")}</b>
          </div>
          <p className="advmuted">{t("boostSub")}</p>
          <Link href={`${base}/promotion`} className="btn btn--grad btn--full" style={{ marginTop: 14 }}>
            <IconBolt />
            {t("boostCta")}
          </Link>
          <Link href={`${base}/subscription`} className="btn btn--line btn--full" style={{ marginTop: 10 }}>
            {t("upgradeCta")}
            <IconArrowRight />
          </Link>
        </div>
      ) : (
        <>
          <TwoFactorCard />
          <TelegramLinkCard />
          <NotificationPrefsCard />
        </>
      )}

      <SellerDashboard role={role as Role} compact />
    </>
  );
}
