"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { asArr, asDict, asNum } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import { canInternal, getMyMessages, getMyToday, normAttendance, normTask } from "@/lib/services/internalHrm";
import { getHrmMe, getHrmOverview, useHrmCatalog, type HrmRow } from "@/lib/services/hrm";
import { HrmError, HrmHead, HrmPanel, isOverdue } from "@/components/internal/HrmUi";
import { useHrmText } from "@/components/internal/hrm/text";
import { WAITING, domainHref } from "@/components/internal/hrm/routes";
import { useUnreadNotifications } from "@/components/internal/ShellParts";
import { IconAlert, IconArrowRight, IconBell, IconCalendar, IconChat, IconCheck, IconClock, IconFileText, IconFolder, IconMapPin, IconRefresh, IconShieldCheck, IconSun } from "@/components/icons";
import type { NavIcon } from "./nav";

type Tone = "err" | "warn" | "info";
type Tile = { key: string; label: string; hint: string; count: number; href: string; Icon: NavIcon; tone: Tone };
type Data = { approvals: number; overdue: number; checkedIn: boolean; unread: number; mine: HrmRow[]; domains: { domain: string; waiting: number }[] };

// "Today" after MedControl HR: one counter for each thing waiting on the
// user — and, for a manager, on the team — each a link to where it is
// handled; what has nothing waiting folds into one "all clear" line.
export default function TodayPage() {
  const t = useTranslations("internal.today");
  const { module } = useHrmText();
  const { session } = useAuth();
  const cat = useHrmCatalog();
  const notifications = useUnreadNotifications(true);
  const manager = canInternal(session, "internal_hr.manage") || canInternal(session, "internal_org.manage");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      setError(false);
      try {
        // Each source is optional: one the account may not read counts as zero.
        const [todayRaw, inbox, me, overview] = await Promise.all([
          getMyToday(signal),
          getMyMessages({ unread: true, limit: 1, offset: 0 }, signal).catch(() => null),
          getHrmMe(signal).catch(() => null),
          manager ? getHrmOverview({}, signal).catch(() => null) : Promise.resolve(null),
        ]);
        if (signal?.aborted) return;
        const d = asDict(todayRaw);
        const tasks = asArr(d.tasks).map(normTask);
        const att = d.attendance ? normAttendance(d.attendance) : null;
        setData({
          approvals: asNum(d.pending_approvals),
          overdue: tasks.filter((x) => isOverdue(x.deadline, x.status, Date.now())).length,
          checkedIn: !!att?.firstIn,
          unread: inbox?.total ?? 0,
          mine: me?.pending ?? [],
          domains: (overview?.domains ?? []).map((s) => ({ domain: s.domain, waiting: WAITING.reduce((n, k) => n + (s.byStatus[k] ?? 0), 0) })),
        });
      } catch {
        if (!signal?.aborted) setError(true);
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [manager],
  );

  useEffect(() => {
    const c = new AbortController();
    const h = setTimeout(() => void load(c.signal), 0);
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [load]);
  useEffect(
    () =>
      subscribeUserEvents((e) => {
        if (e.event.startsWith("internal.")) void load();
      }),
    [load],
  );

  const domainTitle = (key: string) => module(cat.data?.modules.find((m) => m.key === key) ?? null, key);
  const tiles: Tile[] = data
    ? [
        { key: "approvals", label: t("approvals"), hint: t("approvalsHint"), count: data.approvals, href: "/internal/me/approvals", Icon: IconShieldCheck, tone: "warn" },
        { key: "overdue", label: t("overdue"), hint: t("overdueHint"), count: data.overdue, href: "/internal/me/tasks", Icon: IconAlert, tone: "err" },
        { key: "checkIn", label: t("checkIn"), hint: t("checkInHint"), count: data.checkedIn ? 0 : 1, href: "/internal/me/attendance", Icon: IconClock, tone: "warn" },
        { key: "mine", label: t("mine"), hint: t("mineHint"), count: data.mine.length, href: "/internal/me/records", Icon: IconFolder, tone: "info" },
        { key: "messages", label: t("messages"), hint: t("messagesHint"), count: data.unread, href: "/internal/me/messages", Icon: IconChat, tone: "info" },
        { key: "notifications", label: t("notifications"), hint: t("notificationsHint"), count: notifications, href: "/internal/me/notifications", Icon: IconBell, tone: "info" },
        ...data.domains.filter((x) => x.waiting > 0).map((x) => ({ key: `d-${x.domain}`, label: domainTitle(x.domain), hint: t("teamHint"), count: x.waiting, href: domainHref(x.domain), Icon: IconFolder, tone: "warn" as Tone })),
      ]
    : [];
  const hot = tiles.filter((x) => x.count > 0);
  const clear = tiles.filter((x) => x.count === 0);
  const quick: { href: string; key: string; Icon: NavIcon }[] = [
    { href: domainHref("leave", "request"), key: "leave", Icon: IconSun },
    { href: domainHref("travel", "request"), key: "travel", Icon: IconMapPin },
    { href: "/internal/me/attendance", key: "attendance", Icon: IconCalendar },
    { href: domainHref("policies", "acknowledgement"), key: "policies", Icon: IconFileText },
  ];

  return (
    <section className="hrm-page">
      <HrmHead
        title={t("title")}
        lead={t("lead")}
        actions={
          <button type="button" className="btn btn--line btn--sm" onClick={() => void load()} disabled={busy}>
            <IconRefresh className={busy ? "stu-spinning" : undefined} />
            {t("refresh")}
          </button>
        }
      />
      {error ? <HrmError text={t("error")} onRetry={() => void load()} retryLabel={t("refresh")} /> : null}
      {!data && !error ? (
        <div className="hrm-att" aria-busy="true">{[0, 1, 2, 3].map((i) => <span key={i} className="hrm-att__tile is-skel" />)}</div>
      ) : data ? (
        <>
          {hot.length ? (
            <div className="hrm-att">
              {hot.map((s) => (
                <Link key={s.key} href={s.href} className={`hrm-att__tile hrm-att__tile--${s.tone}`}>
                  <span className="hrm-att__i"><s.Icon /></span>
                  <b>{s.key === "checkIn" ? "!" : s.count}</b>
                  <span className="hrm-att__l">{s.label}</span>
                  <small>{s.hint}</small>
                  <IconArrowRight className="hrm-att__go" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="hrm-today-clear">
              <span><IconCheck /></span>
              <b>{t("allClearTitle")}</b>
              <p>{t("allClearText")}</p>
            </div>
          )}
          {clear.length && hot.length ? (
            <p className="hrm-att__clear">
              <IconCheck />
              <span>{t("restClear")}: {clear.map((s) => s.label).join(" · ")}</span>
            </p>
          ) : null}
          {data.mine.length ? (
            <HrmPanel title={t("mineTitle")} icon={IconFolder} count={data.mine.length}>
              <ul className="hrm-list">
                {data.mine.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <Link href={domainHref(r.domain, r.type, r.id)} className="hrm-today-row">
                      <b>{r.title || r.code}</b>
                      <small>{domainTitle(r.domain)} · {r.status}</small>
                      <IconArrowRight />
                    </Link>
                  </li>
                ))}
              </ul>
            </HrmPanel>
          ) : null}
        </>
      ) : null}
      <HrmPanel title={t("quickTitle")}>
        <div className="hrm-quick">
          {quick.map((q) => (
            <Link key={q.key} href={q.href} className="hrm-quick__i">
              <span><q.Icon /></span>
              <b>{t(`quick.${q.key}`)}</b>
            </Link>
          ))}
        </div>
      </HrmPanel>
    </section>
  );
}
