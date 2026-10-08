"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { hasInternalAccess, canInternal, internalRoles, type InternalPermission } from "@/lib/services/internalHrm";
import { initials } from "@/lib/lawyers";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import IncomingCallWatcher from "@/components/portal/IncomingCallWatcher";
import {
  IconLogo,
  IconHome,
  IconUser,
  IconUsers,
  IconBuilding,
  IconBriefcase,
  IconClock,
  IconChartBar,
  IconCard,
  IconChat,
  IconCalendar,
  IconShieldCheck,
  IconMenu,
  IconClose,
  IconLogout,
} from "@/components/icons";

type Icon = ComponentType<{ className?: string }>;
type Item = { href: string; key: string; Icon: Icon; permission?: InternalPermission };
type Group = { key: string; items: Item[] };

const GROUPS: Group[] = [
  { key: "workspace", items: [
    { href: "/internal", key: "dashboard", Icon: IconHome },
    { href: "/internal/me", key: "me", Icon: IconUser },
    { href: "/internal/me/tasks", key: "tasks", Icon: IconBriefcase },
    { href: "/internal/me/attendance", key: "attendance", Icon: IconCalendar },
    { href: "/internal/me/approvals", key: "approvals", Icon: IconShieldCheck },
    { href: "/internal/me/messages", key: "messages", Icon: IconChat },
  ] },
  { key: "people", items: [
    { href: "/internal/employees", key: "employees", Icon: IconUsers, permission: "internal_hr.manage" },
    { href: "/internal/org", key: "org", Icon: IconBuilding, permission: "internal_org.manage" },
  ] },
  { key: "operations", items: [
    { href: "/internal/execution", key: "execution", Icon: IconBriefcase, permission: "internal_execution.manage" },
    { href: "/internal/time", key: "time", Icon: IconClock, permission: "internal_time.manage" },
    { href: "/internal/schedules", key: "schedules", Icon: IconCalendar, permission: "internal_time.manage" },
    { href: "/internal/kpi", key: "kpi", Icon: IconChartBar, permission: "internal_kpi.manage" },
    { href: "/internal/payroll", key: "payroll", Icon: IconCard, permission: "internal_payroll.manage" },
    { href: "/internal/analytics", key: "analytics", Icon: IconChartBar, permission: "internal_analytics.view" },
  ] },
];

const matches = (pathname: string, item: Item) => item.href === "/internal" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

export default function InternalShell({ children }: { children: ReactNode }) {
  const t = useTranslations("internal");
  const { session, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const roles = internalRoles(session);
  const allowed = hasInternalAccess(session);
  const visible = GROUPS.flatMap((group) => group.items).filter((item) => !item.permission || canInternal(session, item.permission));
  const active = [...visible].sort((a, b) => b.href.length - a.href.length).find((item) => matches(pathname, item));
  const role = roles.find((item) => ["superadmin", "admin", "manager", "call_center", "call_center_lawyer"].includes(item)) ?? "staff";

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!allowed) router.replace(`/portal/${session.role}`);
    else if (!visible.some((item) => matches(pathname, item))) router.replace("/internal");
    // Route access is checked again by the backend; this only prevents an
    // unauthorized module from mounting and issuing a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, allowed, pathname, router]);

  if (!ready || !allowed || !active) return <div className="portal portal--redirect" aria-busy="true"><span className="rf__spinner" /></div>;

  return (
    <div className="portal internal-shell">
      <IncomingCallWatcher />
      <div className={`psb__scrim${open ? " on" : ""}`} onClick={() => setOpenPath(null)} />
      <aside className={`psb${open ? " on" : ""}`}>
        <div className="psb__brand">
          <div className="psb__logo"><span className="logo__m"><IconLogo /></span>LexGo</div>
          <span className="psb__role">{t(`roles.${role}`)}</span>
        </div>
        <nav className="psb__nav">
          {GROUPS.map((group) => {
            const items = group.items.filter((item) => visible.includes(item));
            if (!items.length) return null;
            return <div className="internal-nav-group" key={group.key}>
              <span className="internal-nav-group__label">{t(`groups.${group.key}`)}</span>
              {items.map(({ href, key, Icon }) => <Link key={href} href={href} className={`psb__link${matches(pathname, { href, key, Icon }) ? " on" : ""}`}>
                <Icon />{t(`nav.${key}`)}
              </Link>)}
            </div>;
          })}
        </nav>
        <div className="psb__foot">
          <Link href={session ? `/portal/${session.role}` : "/portal/client"} className="psb__link"><IconHome />{t("backToPortal")}</Link>
          <button className="psb__link" type="button" onClick={logout}><IconLogout />{t("logout")}</button>
        </div>
      </aside>
      <div className="pmain">
        <header className="ptop">
          <button className="ptop__burger" type="button" aria-label={t("menu")} onClick={() => setOpenPath(open ? null : pathname)}>{open ? <IconClose /> : <IconMenu />}</button>
          <h1>{t(`nav.${active.key}`)}</h1>
          <div className="ptop__sp"><ThemeToggle variant="square" /><LanguageSwitcher />
            <Link className="ptop__user" href={session ? `/portal/${session.role}/profile` : "/login"} title={session?.name || ""}>
              <span className="ptop__av">{initials(session?.name || "I")}</span><span>{session?.name || t("staff")}</span>
            </Link>
          </div>
        </header>
        <div className="pbody"><div className="pbody__in">{children}</div></div>
      </div>
    </div>
  );
}
