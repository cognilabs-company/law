"use client";

import "./profile1920.css";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listMyActivity, listSecurityEvents, listSessions, revokeSession, type ActivityEntry } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useAuth } from "@/lib/auth";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import FilterBar from "@/components/filters/FilterBar";
import {
  IconCard,
  IconClipboardCheck,
  IconClock,
  IconFileText,
  IconLock,
  IconMonitor,
  IconSearch,
  IconShieldCheck,
  IconSmartphone,
  IconTablet,
  IconTag,
  IconUser,
} from "@/components/icons";
import { dateTimeFull } from "@/lib/date";

function fmt(s: string, locale: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateTimeFull(s, locale);
}
// Rough grouping of activity actions for the filter. "file" must not match
// inside "profile" (profile_updated was filed under documents).
const GROUPS: Record<string, RegExp> = {
  auth: /login|logout|session|2fa|two_factor|password|otp|telegram/i,
  orders: /order|milestone|payment|refund|contract|case/i,
  documents: /document|(^|[^o])file|template|download|upload/i,
  profile: /profile|lawyer|consent|verification|settings|notification/i,
};
// Each group's small icon in the row's tile (the dashboard's chip rows).
const GROUP_ICON: Record<string, typeof IconLock> = {
  auth: IconLock,
  orders: IconCard,
  documents: IconFileText,
  profile: IconUser,
  other: IconClock,
};
/** The device a session runs on, by its label ("Tezkor Himoya iOS · iPhone 15"). */
export function DeviceIcon({ label }: { label: string }) {
  if (/ipad|tablet/i.test(label)) return <IconTablet />;
  if (/iphone|android|ios|mobile|phone/i.test(label)) return <IconSmartphone />;
  return <IconMonitor />;
}
function groupOf(a: string): string {
  for (const [k, re] of Object.entries(GROUPS)) if (re.test(a)) return k;
  return "other";
}
const GROUP_KEYS = ["all", "auth", "orders", "documents", "profile", "other"];

// Account audit (T0-11 / T3-10, user side): active sessions, the user's own
// activity log with a type filter and search, and security events (new
// device / IP). Shared by the client and seller profiles.
export default function AccountAudit({ withSessions = true }: { withSessions?: boolean }) {
  const t = useTranslations("portal.accountAudit");
  const tl = useTranslations("portal.client.profile.log");
  const tx = useTranslations("lxProfile.auditTypes");
  const locale = useLocale();
  const { logout } = useAuth();
  const [key, setKey] = useState(0);
  const activity = useResource(() => listMyActivity(), [key]);
  const security = useResource(() => listSecurityEvents().catch(() => [] as ActivityEntry[]), [key]);
  const sessions = useResource(() => (withSessions ? listSessions() : Promise.resolve([])), [key, withSessions]);
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activity.data.filter((a) => !needle || `${a.action} ${tl.has(a.action) ? tl(a.action) : ""} ${a.detail} ${a.titleUz ?? ""} ${a.descriptionUz ?? ""} ${a.ip ?? ""}`.toLowerCase().includes(needle));
  }, [activity.data, q, tl]);
  const rows = useMemo(() => (group === "all" ? found : found.filter((a) => groupOf(a.action) === group)), [found, group]);
  const opts = GROUP_KEYS.map((g) => ({ value: g, label: `${t(`groups.${g}`)} (${g === "all" ? found.length : found.filter((a) => groupOf(a.action) === g).length})` }));
  const label = (a: string) => (tl.has(a) ? tl(a) : tx.has(a) ? tx(a) : a.replace(/[_.]/g, " ") || "—");
  const eventLabel = (a: string) => (t.has(`types.${a}`) ? t(`types.${a}`) : label(a));

  async function revoke(id: string) {
    const cur = sessions.data.find((x) => x.id === id)?.current;
    try {
      await revokeSession(id);
      if (cur) { logout(); return; }
      setKey((k) => k + 1);
    } catch { /* ignore */ }
  }

  return (
    <>
      {withSessions ? (
        <div className="ppanel" data-ai-target="profile:sessions">
          <div className="ppanel__h">
            <b className="ppanel__t">
              <span className="pico"><IconMonitor /></span>
              {t("sessions")}
              {sessions.status === "ready" && sessions.data.length ? <span className="cx-count">{sessions.data.length}</span> : null}
            </b>
          </div>
          {sessions.status === "loading" ? <Skeleton rows={2} /> : !sessions.data.length ? (
            <EmptyState size="sm" icon={<IconMonitor />} title={t("noSessions")} />
          ) : (
            <div className="alist pf-list">
              {sessions.data.map((s) => (
                <div className={`creq pf-row${s.current ? " is-current" : ""}`} key={s.id}>
                  <span className="pf-row__ic" aria-hidden="true"><DeviceIcon label={s.deviceLabel || ""} /></span>
                  <div className="creq__m">
                    <b>
                      {s.deviceLabel || s.ip || t("device")}
                      {s.current ? <em className="csess__now">{t("thisDevice")}</em> : null}
                    </b>
                    <span>{[s.ip, fmt(s.lastUsedAt, locale)].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="pf-row__end">
                    <button className="btn btn--line btn--sm" type="button" onClick={() => revoke(s.id)}>{t("revoke")}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="ppanel" data-ai-target="profile:security-events">
        <div className="ppanel__h">
          <b className="ppanel__t">
            <span className="pico"><IconShieldCheck /></span>
            {t("security")}
            {security.status === "ready" && security.data.length ? <span className="cx-count">{security.data.length}</span> : null}
          </b>
        </div>
        <p className="ppanel__note">{t("securityLead")}</p>
        {security.status === "loading" ? <Skeleton rows={2} /> : !security.data.length ? (
          <EmptyState size="sm" icon={<IconShieldCheck />} title={t("noSecurity")} />
        ) : (
          <div className="alist pf-list">
            {security.data.slice(0, 20).map((e) => (
              <div className="creq pf-row" key={e.id}>
                <span className="pf-row__ic" aria-hidden="true"><IconShieldCheck /></span>
                <div className="creq__m">
                  <b>{eventLabel(e.action)}</b>
                  <span>{[e.detail, e.ip, fmt(e.createdAt, locale)].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ppanel" data-ai-target="profile:account-audit">
        <div className="ppanel__h">
          <b className="ppanel__t">
            <span className="pico"><IconClipboardCheck /></span>
            {t("activity")}
            {activity.status === "ready" && activity.data.length ? (
              <span className="cx-count" title={t("rows", { n: rows.length })}>{rows.length}</span>
            ) : null}
          </b>
        </div>
        {activity.data.length ? (
          <FilterBar
            className="ppfilters"
            fields={[{ key: "group", label: t("filter"), icon: IconTag, value: group, onChange: setGroup, options: opts, empty: "all" }]}
            search={{ value: q, onChange: setQ, placeholder: t("searchPh") }}
            count={rows.length}
          />
        ) : null}
        {activity.status === "loading" ? <Skeleton rows={3} /> : !rows.length && activity.data.length ? (
          <EmptyState icon={<IconSearch />} title={t("noMatch")} text={t("noMatchText")} />
        ) : !rows.length ? (
          <EmptyState icon={<IconClock />} title={t("noActivity")} text={t("noActivityText")} />
        ) : (
          <div className="alist pf-list">
            {rows.slice(0, 100).map((a) => {
              const g = groupOf(a.action);
              const GIcon = GROUP_ICON[g] ?? IconClock;
              return (
                <div className="creq pf-row" key={a.id}>
                  <span className="pf-row__ic" aria-hidden="true"><GIcon /></span>
                  <div className="creq__m">
                    <b>{(locale === "uz" && a.titleUz) || label(a.action)}</b>
                    <span>{[(locale === "uz" && a.descriptionUz) || a.detail, a.ip, fmt(a.createdAt, locale)].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="pf-row__end">
                    <em className="atag atag--muted pf-tag">{t(`groups.${g}`)}</em>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
