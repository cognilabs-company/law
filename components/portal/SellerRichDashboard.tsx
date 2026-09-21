"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
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
  const { session } = useAuth();
  const cabinet = useSellerCabinet();
  const completeness = session?.completeness ?? 0;
  const [taskTab, setTaskTab] = useState<"today" | "upcoming" | "done">("today");
  const base = `/portal/${role}`;
  const QUICK = [
    { key: "quickClient", Icon: IconUserPlus, href: `${base}/clients` },
    { key: "quickCase", Icon: IconFolderPlus, href: `${base}/cases` },
    { key: "quickDoc", Icon: IconUpload, href: `${base}/files` },
    { key: "quickMeeting", Icon: IconCalendar, href: `${base}/calendar` },
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
      <div className="dhero">
        <div className="dhero__main">
          <span className="dhero__k">{t("kicker")}</span>
          <h2 className="psec-h" style={{ color: "#fff" }}>{t("heroTitle")}</h2>
          <p>{t("heroSub")}</p>
        </div>
        <div className="dhero__quote">
          <div className="dhero__quoteImg">
            <Image src="/law-banner.png" alt="" fill sizes="(max-width: 980px) 60vw, 280px" style={{ objectFit: "contain" }} />
          </div>
        </div>
        <div className="dhero__greet">
          <span className="dhero__date">{new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span>
          <b>{t("hi", { name: session?.name ?? "" })}</b>
          <p>{t("greetSub", { meetings: num(workload, "courts_today"), tasks: taskGroups.today.length })}</p>
        </div>
      </div>

      {cabinet.status === "loading" ? null : (
        <div className="amet">
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
        <div className="ppanel pcompl">
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

        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("quickActions")}</b>
          </div>
          <div className="qact">
            {QUICK.map((q) => (
              <Link key={q.key} href={q.href} className="qact__i">
                <span className="qact__ico"><q.Icon /></span>
                {t(q.key)}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="dgrid3">
        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("myTasks")}</b>
          </div>
          <div className="dtabs" role="tablist">
            {(["today", "upcoming", "done"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={taskTab === k} onClick={() => setTaskTab(k)}>
                {t(`tab_${k}`, { n: taskGroups[k].length })}
              </button>
            ))}
          </div>
          {!shownTasks.length ? (
            <p className="advmuted" style={{ marginTop: 14 }}>{t("tasksEmpty")}</p>
          ) : (
            <div style={{ marginTop: 6 }}>
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
                      {new Date(c.deadlineAt).toLocaleDateString()}
                    </span>
                  ) : null}
                  {c.stage ? <span className="dtask__badge st st--active">{c.stage}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("calendar")}</b>
          </div>
          <MiniCalendar events={calEvents} />
        </div>

        <div className="dgrid3__col">
          <div className="ppanel">
            <div className="ppanel__h">
              <b>{t("recentActivity")}</b>
            </div>
            {!notifications.length ? (
              <p className="advmuted">{t("activityEmpty")}</p>
            ) : (
              <div className="dactivity">
                {notifications.slice(0, 5).map((n) => (
                  <div className="dactivity__row" key={n.id}>
                    <span className="dactivity__ico"><IconBell /></span>
                    <div className="dactivity__m">
                      <b>{n.title || n.body}</b>
                    </div>
                    <span className="dactivity__ago">{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="aicard">
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
        <div className="ppanel">
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
