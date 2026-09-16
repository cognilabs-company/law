"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth, hasAdminAccess, sessionRoles, type AdminPermission } from "@/lib/auth";
import { initials } from "@/lib/lawyers";
import { useDemoTools } from "@/lib/demoTools";
import LanguageSwitcher from "../LanguageSwitcher";
import ThemeToggle from "../ThemeToggle";
import IncomingCallWatcher from "../portal/IncomingCallWatcher";
import {
  IconLogo,
  IconGrid,
  IconBriefcase,
  IconStar,
  IconDocLines,
  IconShield,
  IconShieldCheck,
  IconClipboardCheck,
  IconChat,
  IconUsers,
  IconUserPlus,
  IconRocket,
  IconBolt,
  IconAward,
  IconScale,
  IconTrendingUp,
  IconTarget,
  IconBuilding,
  IconCard,
  IconPhone,
  IconVideo,
  IconLogout,
  IconMenu,
  IconClose,
} from "../icons";

type SvgC = ComponentType<{ className?: string }>;
// b2b.manage is checked for the nav item only; it doesn't grant admin access on its own.
// perm: one code, or a list where any one code is enough. Codes outside
// ADMIN_PERMISSIONS (b2b.manage, meetings.manage) only gate the item; they
// don't grant admin access on their own.
type NavPerm = AdminPermission | "b2b.manage" | "meetings.manage";
type NavItem = { href: string; key: string; Icon: SvgC; perm?: NavPerm | NavPerm[] };
// CRM modules grouped per the platform plan. `perm` = the backend permission a
// page needs; items without a perm (overview, ceo, bootstrap…) are full-admin
// only. Superadmin/admin see everything.
const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "command",
    items: [
      { href: "/admin", key: "overview", Icon: IconGrid },
      { href: "/admin/ceo", key: "ceo", Icon: IconTarget },
    ],
  },
  {
    group: "sales",
    items: [
      { href: "/admin/pipeline", key: "pipeline", Icon: IconTrendingUp, perm: "leads.manage" },
      { href: "/admin/call-center", key: "callCenter", Icon: IconPhone, perm: ["leads.manage", "callcenter.access"] },
      { href: "/admin/meetings", key: "meetings", Icon: IconVideo, perm: ["leads.manage", "callcenter.access"] },
      { href: "/admin/call-analytics", key: "callAnalytics", Icon: IconChat, perm: "leads.manage" },
      { href: "/admin/retention", key: "retention", Icon: IconUsers, perm: "leads.manage" },
      { href: "/admin/b2b", key: "b2b", Icon: IconBuilding, perm: "b2b.manage" },
    ],
  },
  {
    group: "catalog",
    items: [
      { href: "/admin/services", key: "services", Icon: IconBriefcase, perm: "services.manage" },
      { href: "/admin/plans", key: "plans", Icon: IconStar, perm: "subscriptions.manage" },
      { href: "/admin/templates", key: "templates", Icon: IconDocLines, perm: "templates.manage" },
      { href: "/admin/ads", key: "ads", Icon: IconRocket, perm: "ads.manage" },
    ],
  },
  {
    group: "sellers",
    items: [
      { href: "/admin/register-requests", key: "registerRequests", Icon: IconUserPlus, perm: "users.manage" },
      { href: "/admin/verifications", key: "verifications", Icon: IconAward, perm: "lawyers.verify" },
      { href: "/admin/quality", key: "quality", Icon: IconShieldCheck, perm: "approvals.manage" },
      { href: "/admin/reviews", key: "reviews", Icon: IconStar, perm: "lawyers.verify" },
    ],
  },
  {
    group: "finance",
    items: [
      { href: "/admin/payouts", key: "payouts", Icon: IconCard, perm: "payments.manage" },
      { href: "/admin/approvals", key: "approvals", Icon: IconShieldCheck, perm: "approvals.manage" },
    ],
  },
  {
    group: "support",
    items: [
      { href: "/admin/legal-aid", key: "legalAid", Icon: IconScale, perm: "legal_aid.manage" },
      { href: "/admin/notifications", key: "notifications", Icon: IconChat, perm: "notifications.manage" },
    ],
  },
  {
    group: "system",
    items: [
      { href: "/admin/workflow", key: "workflow", Icon: IconRocket },
      { href: "/admin/integrations", key: "integrations", Icon: IconBolt },
      { href: "/admin/test-otps", key: "testOtps", Icon: IconShieldCheck },
      { href: "/admin/e2e", key: "e2e", Icon: IconClipboardCheck, perm: "users.manage" },
      { href: "/admin/roles", key: "roles", Icon: IconShield, perm: "roles.manage" },
      { href: "/admin/audit-trail", key: "audit", Icon: IconShieldCheck, perm: "users.manage" },
      { href: "/admin/bootstrap", key: "bootstrap", Icon: IconBolt },
    ],
  },
];
const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
// The overview (/admin) matches only itself; other items also cover their
// sub-pages. A prefix match on /admin would let any page through by URL.
const onItem = (pathname: string, n: NavItem) =>
  n.href === "/admin" ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/");
// Most senior role first; the badge shows the first one the account has.
const BADGE_ORDER = ["superadmin", "admin", "ceo_viewer", "manager", "finance", "quality_control", "moderator", "call_center_lawyer", "call_center", "sales_head", "sales_operator", "sales", "b2b_manager", "marketing", "content_manager"];

export default function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const { session, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // The mobile sidebar is open only on the path it was opened on, so navigating closes it.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;

  const isBootstrap = pathname === "/admin/bootstrap";
  const allowed = hasAdminAccess(session) || isBootstrap;

  // Superadmin sees everything. Admin sees the overview/bootstrap plus every
  // page it actually has the permission for (e.g. it lacks roles.manage, so no
  // Roles page). Other staff see only pages their permissions grant.
  // Assigned roles plus the primary role (a primary "admin" needs no role row).
  const roles = sessionRoles(session);
  const isSuper = roles.includes("superadmin");
  const isFullAdmin = isSuper || roles.includes("admin");
  const perms = session?.permissions ?? [];
  // Test OTP is a staging tool: hidden where the backend's demo routes are off (T0-01).
  const demoTools = useDemoTools(isFullAdmin);
  const canSee = (n: NavItem) =>
    n.key === "testOtps" && demoTools !== true
      ? false
      : n.perm
        ? isSuper || (Array.isArray(n.perm) ? n.perm : [n.perm]).some((p) => perms.includes(p))
        : isFullAdmin;
  const visibleNav = NAV.filter(canSee);
  // The bootstrap page (needs the bootstrap key) serves first-time setup:
  // signed-out users, non-staff and full admins. Limited staff (sales,
  // call-center…) must not open it by URL.
  const bootstrapOk = isBootstrap && (!session || !hasAdminAccess(session) || isFullAdmin);

  useEffect(() => {
    if (!ready) return;
    if (!session && !isBootstrap) {
      router.replace("/login");
      return;
    }
    if (!session) return;
    if (!hasAdminAccess(session) && !isBootstrap) {
      router.replace(`/portal/${session.role}`);
      return;
    }
    // Anyone but superadmin on a page their permissions don't cover → send to
    // their first allowed page.
    if (!isSuper && !bootstrapOk) {
      const onAllowed = visibleNav.some(
        (n) => onItem(pathname, n),
      );
      if (!onAllowed) router.replace(visibleNav[0]?.href ?? `/portal/${session.role}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, router, isBootstrap, bootstrapOk, pathname]);

  if (!ready) return null;
  if (!allowed) return null;
  // A page this account's permissions don't cover must not mount (its data
  // calls would only answer 403) while the effect above redirects away.
  if (session && !isSuper && !bootstrapOk && !visibleNav.some((n) => onItem(pathname, n))) return null;

  const active = NAV.slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => onItem(pathname, n));
  const title = active ? t(`nav.${active.key}`) : t("title");
  // Clicking your own name goes to your own profile. Lawyers have no profile
  // route yet, so they land on their portal instead.
  const role = session?.role ?? "client";
  // Staff see their own role on the badge, not "Admin" for everyone.
  const badgeKey = BADGE_ORDER.find((r) => roles.includes(r));
  const roleBadge = badgeKey && t.has(`roleBadges.${badgeKey}`) ? t(`roleBadges.${badgeKey}`) : t("badge");
  const profileHref = role === "lawyer" ? "/portal/lawyer" : `/portal/${role}/profile`;

  return (
    <div className="portal">
      {/* Meeting invites reach staff on admin pages too (T4-01). */}
      <IncomingCallWatcher />
      <div className={`psb__scrim${open ? " on" : ""}`} onClick={() => setOpenPath(null)} />
      <aside className={`psb${open ? " on" : ""}`}>
        <div className="psb__logo">
          <span className="logo__m">
            <IconLogo />
          </span>
          LexGo
          <span className="psb__role">{roleBadge}</span>
        </div>
        <nav className="psb__nav">
          {NAV_GROUPS.map((g) => {
            const items = g.items.filter(canSee);
            if (!items.length) return null;
            return (
              <div className="psb__group" key={g.group}>
                <span className="psb__glabel">{t(`groups.${g.group}`)}</span>
                {items.map(({ href, key, Icon }) => {
                  const on = active?.href === href;
                  return (
                    <Link key={href} href={href} className={`psb__link${on ? " on" : ""}`}>
                      <Icon />
                      {t(`nav.${key}`)}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="psb__foot">
          <Link href={session ? `/portal/${session.role}` : "/portal/client"} className="psb__link">
            <IconGrid />
            {t("backToPortal")}
          </Link>
          <button className="psb__link" type="button" onClick={logout}>
            <IconLogout />
            {t("logout")}
          </button>
        </div>
      </aside>

      <div className="pmain">
        <header className="ptop">
          <button className="ptop__burger" type="button" aria-label={t("menu")} onClick={() => setOpenPath(open ? null : pathname)}>
            {open ? <IconClose /> : <IconMenu />}
          </button>
          <h1>{title}</h1>
          <div className="ptop__sp">
            <ThemeToggle variant="square" />
            <LanguageSwitcher />
            <Link className="ptop__user" href={profileHref} title={session?.name || t("badge")}>
              <span className="ptop__av">{initials(session?.name || "A")}</span>
              <span>{session?.name || t("badge")}</span>
            </Link>
          </div>
        </header>
        <div className="pbody">
          <div className="pbody__in">{children}</div>
        </div>
      </div>
    </div>
  );
}
