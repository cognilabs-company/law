"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { listMyActivity, listSecurityEvents, listSessions, revokeSession, type ActivityEntry } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useAuth } from "@/lib/auth";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Select from "@/components/Select";
import { IconClock, IconShieldCheck, IconSearch } from "@/components/icons";

function fmt(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("ru-RU");
}
// Rough grouping of activity actions for the filter.
const GROUPS: Record<string, RegExp> = {
  auth: /login|logout|session|2fa|two_factor|password|otp|telegram/i,
  orders: /order|milestone|payment|refund|contract|case/i,
  documents: /document|file|template|download|upload/i,
  profile: /profile|lawyer|consent|verification|settings|notification/i,
};
function groupOf(a: string): string {
  for (const [k, re] of Object.entries(GROUPS)) if (re.test(a)) return k;
  return "other";
}

// Account audit (T0-11 / T3-10, user side): active sessions, the user's own
// activity log with a type filter and search, and security events (new
// device / IP). Shared by the client and seller profiles.
export default function AccountAudit({ withSessions = true }: { withSessions?: boolean }) {
  const t = useTranslations("portal.accountAudit");
  const tl = useTranslations("portal.client.profile.log");
  const { logout } = useAuth();
  const [key, setKey] = useState(0);
  const activity = useResource(() => listMyActivity(), [key]);
  const security = useResource(() => listSecurityEvents().catch(() => [] as ActivityEntry[]), [key]);
  const sessions = useResource(() => (withSessions ? listSessions() : Promise.resolve([])), [key, withSessions]);
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");
  const opts = ["all", "auth", "orders", "documents", "profile", "other"].map((g) => ({ value: g, label: t(`groups.${g}`) }));
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activity.data.filter((a) => (group === "all" || groupOf(a.action) === group) && (!needle || `${a.action} ${a.detail} ${a.ip ?? ""}`.toLowerCase().includes(needle)));
  }, [activity.data, group, q]);
  const label = (a: string) => (tl.has(a) ? tl(a) : a.replace(/[_.]/g, " ") || "—");

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
        <div className="ppanel">
          <div className="ppanel__h"><b>{t("sessions")}</b><span className="advmuted">{sessions.status === "ready" ? sessions.data.length : ""}</span></div>
          {sessions.status === "loading" ? <Skeleton rows={2} /> : !sessions.data.length ? (
            <p className="advmuted">{t("noSessions")}</p>
          ) : (
            <div className="alist">
              {sessions.data.map((s) => (
                <div className="creq" key={s.id}>
                  <span className="creq__st" />
                  <div className="creq__m"><b>{s.deviceLabel || s.ip || t("device")}{s.current ? ` · ${t("thisDevice")}` : ""}</b><span>{[s.ip, fmt(s.lastUsedAt)].filter(Boolean).join(" · ")}</span></div>
                  <button className="btn btn--line btn--sm" type="button" onClick={() => revoke(s.id)}>{t("revoke")}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="ppanel">
        <div className="ppanel__h"><b>{t("security")}</b><span className="advmuted">{security.status === "ready" ? security.data.length : ""}</span></div>
        <p className="ppanel__note">{t("securityLead")}</p>
        {security.status === "loading" ? <Skeleton rows={2} /> : !security.data.length ? (
          <p className="advmuted">{t("noSecurity")}</p>
        ) : (
          <div className="alist">
            {security.data.slice(0, 20).map((e) => (
              <div className="creq" key={e.id}>
                <span className="creq__st" />
                <div className="creq__m"><b><IconShieldCheck style={{ width: 14, height: 14 }} /> {t.has(`types.${e.action}`) ? t(`types.${e.action}`) : label(e.action)}</b><span>{[e.detail, e.ip, fmt(e.createdAt)].filter(Boolean).join(" · ")}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ppanel">
        <div className="ppanel__h"><b>{t("activity")}</b><span className="advmuted">{activity.status === "ready" ? t("rows", { n: rows.length }) : ""}</span></div>
        <div className="audit__filters" style={{ gridTemplateColumns: "minmax(140px, 200px) 1fr" }}>
          <Select value={group} onChange={setGroup} options={opts} ariaLabel={t("filter")} />
          <div className="lsearch"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} /></div>
        </div>
        {activity.status === "loading" ? <Skeleton rows={3} /> : !rows.length ? (
          <EmptyState icon={<IconClock />} title={t("noActivity")} text={t("noActivityText")} />
        ) : (
          <div className="alist">
            {rows.slice(0, 100).map((a) => (
              <div className="creq" key={a.id}>
                <span className="creq__st" />
                <div className="creq__m">
                  <b>{label(a.action)}</b>
                  <span>{[a.detail, a.ip, fmt(a.createdAt)].filter(Boolean).join(" · ")}</span>
                </div>
                <em className="atag atag--muted">{t(`groups.${groupOf(a.action)}`)}</em>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
