"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getCorrections, getFeedback, getHrmRecords } from "@/lib/services/internalLive";
import { IconAlert, IconArrowRight, IconChat, IconCheck, IconClock, IconFlag, IconFolder, IconLightbulb, IconShieldCheck } from "@/components/icons";
import type { NavIcon } from "./nav";

type Tone = "err" | "warn" | "info";
type Source = { key: string; count: number; href: string; Icon: NavIcon; tone: Tone };
// HR processes whose pending requests wait on a manager.
const PENDING_DOMAINS = ["leave", "travel", "recruiting", "movements", "onboarding", "offboarding"];

// "What needs me today": each thing that is waiting is a tile with its count
// and a link straight to it; everything with nothing waiting collapses into
// one "all clear" line, so an empty day reads as empty.
export default function AttentionTiles({ overdue, approvals, unread, notCheckedIn, manager, loading }: { overdue: number; approvals: number; unread: number; notCheckedIn: boolean; manager: boolean; loading: boolean }) {
  const t = useTranslations("internal.dashboard.attention");
  const [team, setTeam] = useState<{ corrections: number; hr: number; feedback: number } | null>(null);

  useEffect(() => {
    if (!manager) return;
    const c = new AbortController();
    void (async () => {
      // Each list is optional: one the account may not read counts as zero.
      const [cor, fb, ...hr] = await Promise.all([
        getCorrections({ status: "pending" }, c.signal).then((r) => r.length).catch(() => 0),
        getFeedback({ status: "new" }, c.signal).then((r) => r.length).catch(() => 0),
        ...PENDING_DOMAINS.map((d) => getHrmRecords(d, { status: "pending", limit: 1 }, c.signal).then((r) => r.total).catch(() => 0)),
      ]);
      if (!c.signal.aborted) setTeam({ corrections: cor, feedback: fb, hr: hr.reduce((a, b) => a + b, 0) });
    })();
    return () => c.abort();
  }, [manager]);

  const sources: Source[] = [
    { key: "overdue", count: overdue, href: "/internal/me/tasks", Icon: IconAlert, tone: "err" },
    { key: "approvals", count: approvals, href: "/internal/me/approvals", Icon: IconShieldCheck, tone: "warn" },
    { key: "checkIn", count: notCheckedIn ? 1 : 0, href: "/internal/me/attendance", Icon: IconClock, tone: "warn" },
    { key: "messages", count: unread, href: "/internal/me/messages", Icon: IconChat, tone: "info" },
    ...(manager
      ? [
          { key: "hr", count: team?.hr ?? 0, href: "/internal/hr", Icon: IconFolder, tone: "warn" as Tone },
          { key: "corrections", count: team?.corrections ?? 0, href: "/internal/live-office", Icon: IconFlag, tone: "info" as Tone },
          { key: "feedback", count: team?.feedback ?? 0, href: "/internal/feedback", Icon: IconLightbulb, tone: "info" as Tone },
        ]
      : []),
  ];
  const hot = sources.filter((s) => s.count > 0);
  const clear = sources.filter((s) => s.count === 0);

  if (loading) return <div className="hrm-att" aria-busy="true">{[0, 1, 2].map((i) => <span key={i} className="hrm-att__tile is-skel" />)}</div>;
  return (
    <div className="hrm-attwrap">
      {hot.length ? (
        <div className="hrm-att">
          {hot.map((s) => (
            <Link key={s.key} href={s.href} className={`hrm-att__tile hrm-att__tile--${s.tone}`}>
              <span className="hrm-att__i"><s.Icon /></span>
              <b>{s.key === "checkIn" ? "!" : s.count}</b>
              <span className="hrm-att__l">{t(`${s.key}.title`)}</span>
              <small>{t(`${s.key}.hint`)}</small>
              <IconArrowRight className="hrm-att__go" />
            </Link>
          ))}
        </div>
      ) : null}
      {clear.length ? (
        <p className="hrm-att__clear">
          <IconCheck />
          <span>{hot.length ? t("restClear") : t("allClear")}: {clear.map((s) => t(`${s.key}.title`)).join(" · ")}</span>
        </p>
      ) : null}
    </div>
  );
}
