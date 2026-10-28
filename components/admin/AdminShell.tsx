"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth, hasAdminAccess, sessionRoles, canMakeCalls, isCallCenterUser, type AdminPermission } from "@/lib/auth";
import { initials } from "@/lib/lawyers";
import { useDemoTools } from "@/lib/demoTools";
import LanguageSwitcher from "../LanguageSwitcher";
import ThemeToggle from "../ThemeToggle";
import FeedbackButton from "@/components/internal/feedback/FeedbackButton";
import { useAiReveal } from "@/lib/guide/targets";
import { fuzzyContains } from "@/lib/searchMatch";
import { hasStudioAccess, useStudioRegistry } from "@/lib/services/studio";
import { hasInternalAccess } from "@/lib/services/internalHrm";
import dynamic from "next/dynamic";
import {
  NavOverview,
  NavCeo,
  NavLiveOffice,
  NavPipeline,
  NavCallCenter,
  NavMeetings,
  NavCallAnalytics,
  NavRetention,
  NavB2b,
  NavMarketplace,
  NavServices,
  // NavPlans, — with the /admin/plans nav item below
  NavTemplates,
  NavAds,
  NavStudio,
  NavRegisterRequests,
  NavReviews,
  NavPayouts,
  NavApprovals,
  NavSupport,
  NavLegalAid,
  NavNotifications,
  NavInternal,
  NavIntegrations,
  NavTestOtps,
  NavRoles,
  NavAudit,
  NavLegal,
  NavPolicies,
  NavAiReglaments,
  NavChevron,
} from "./navIcons";
import { IconLogo, IconGrid, IconLogout, IconMenu, IconClose, IconSearch } from "../icons";

const AiSystemAssistant = dynamic(() => import("../portal/AiSystemAssistant"), { ssr: false });

type SvgC = ComponentType<{ className?: string }>;
// b2b.manage is checked for the nav item only; it doesn't grant admin access on its own.
// perm: one code, or a list where any one code is enough. Codes outside
// ADMIN_PERMISSIONS (b2b.manage, meetings.manage) only gate the item; they
// don't grant admin access on their own.
type NavPerm = AdminPermission | "b2b.manage" | "meetings.manage" | "orders.manage" | "tasks.view" | "remote_assist.supervise" | "remote_assist.view_audit" | "crm.customers.view";
type NavItem = { href: string; key: string; Icon: SvgC; perm?: NavPerm | NavPerm[]; hidden?: boolean };
// CRM modules grouped per the platform plan. `perm` = the backend permission a
// page needs; items without a perm (overview, ceo, bootstrap…) are full-admin
// only. Superadmin/admin see everything.
const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "command",
    items: [
      { href: "/admin", key: "overview", Icon: NavOverview },
      { href: "/admin/profile", key: "profile", Icon: NavOverview, hidden: true },
      { href: "/admin/ceo", key: "ceo", Icon: NavCeo },
      { href: "/admin/live-office", key: "liveOffice", Icon: NavLiveOffice, perm: "users.manage" },
      { href: "/admin/team-tasks", key: "teamTasks", Icon: NavApprovals, perm: "tasks.view" },
    ],
  },
  {
    group: "sales",
    items: [
      // The CRM (contract 2026-10-26, /crm/*): customers and leads apart,
      // the operator queue and the AI copilot. Each page then follows
      // GET /crm/meta and every lead's allowed_actions.
      { href: "/admin/crm", key: "crm", Icon: NavPipeline, perm: ["crm.leads.view", "crm.customers.view"] },
      // Hidden for now: the same board as the CRM kanban since 2026-10-28;
      // /admin/pipeline redirects there.
      // { href: "/admin/pipeline", key: "pipeline", Icon: NavPipeline, perm: "leads.manage" },
      { href: "/admin/call-center", key: "callCenter", Icon: NavCallCenter, perm: ["leads.manage", "callcenter.access"] },
      // Platform-wide meeting history (GET /admin/calls — who created it,
      // participants, duration) is a tab inside this same page now, not a
      // separate nav entry — MeetingLauncher shows it to superadmin/
      // leads.manage on top of the personal "my meetings" launcher.
      { href: "/admin/meetings", key: "meetings", Icon: NavMeetings, perm: ["leads.manage", "callcenter.access"] },
      { href: "/admin/call-analytics", key: "callAnalytics", Icon: NavCallAnalytics, perm: "leads.manage" },
      // The backend answers retention_removed: the page stays reachable by
      // URL and keeps its permission, but has no menu entry.
      { href: "/admin/retention", key: "retention", Icon: NavRetention, perm: "leads.manage", hidden: true },
      { href: "/admin/b2b", key: "b2b", Icon: NavB2b, perm: "b2b.manage" },
    ],
  },
  {
    group: "catalog",
    items: [
      { href: "/admin/marketplace", key: "marketplace", Icon: NavMarketplace, perm: "orders.manage" },
      { href: "/admin/services", key: "services", Icon: NavServices, perm: "services.manage" },
      // Hidden for now: plans are managed in Studio K17, which publishes into
      // the same runtime model (backend 2026-10-28 §10). The page still exists.
      // { href: "/admin/plans", key: "plans", Icon: NavPlans, perm: "subscriptions.manage" },
      { href: "/admin/templates", key: "templates", Icon: NavTemplates, perm: "templates.manage" },
      { href: "/admin/document-settings", key: "documentSettings", Icon: NavTemplates, perm: "templates.manage" },
      { href: "/admin/document-templates", key: "templateEditor", Icon: NavTemplates, perm: "templates.manage", hidden: true },
      { href: "/admin/ads", key: "ads", Icon: NavAds, perm: "ads.manage" },
      // Discounts on ads and plans (Studio MP09), listed with a way in.
      { href: "/admin/promotions", key: "promotions", Icon: NavAds, perm: ["ads.manage", "subscriptions.manage"] },
      { href: "/admin/studio", key: "studio", Icon: NavStudio },
    ],
  },
  {
    group: "sellersFinance",
    items: [
      // 2026-09-19 backend: GET /admin/seller-requests unifies register
      // requests and advocate/lawyer approval into one page (role tabs +
      // date filter + stats) — no separate "verifications" nav entry.
      { href: "/admin/register-requests", key: "registerRequests", Icon: NavRegisterRequests, perm: "users.manage" },
      { href: "/admin/reviews", key: "reviews", Icon: NavReviews, perm: "lawyers.verify" },
      // TSK-664399: Click / Payme readiness and provider reconciliation.
      { href: "/admin/payments", key: "payments", Icon: NavPayouts, perm: "payments.manage" },
      { href: "/admin/payouts", key: "payouts", Icon: NavPayouts, perm: "payments.manage" },
      { href: "/admin/approvals", key: "approvals", Icon: NavApprovals, perm: "approvals.manage" },
    ],
  },
  {
    group: "support",
    items: [
      // The support queue backend checks callcenter.access specifically.
      // leads.manage alone must not expose a link that will return 403.
      { href: "/admin/call-center/support", key: "supportTickets", Icon: NavSupport, perm: "callcenter.access" },
      // Supervisors (admin/manager) monitor and emergency-revoke sessions.
      { href: "/admin/remote-assistance", key: "remoteAssist", Icon: NavCallAnalytics, perm: ["remote_assist.supervise", "remote_assist.view_audit"] },
      { href: "/admin/legal-aid", key: "legalAid", Icon: NavLegalAid, perm: "legal_aid.manage" },
      { href: "/admin/notifications", key: "notifications", Icon: NavNotifications, perm: "notifications.manage" },
    ],
  },
  {
    group: "system",
    items: [
      { href: "/admin/integrations", key: "integrations", Icon: NavIntegrations },
      { href: "/admin/monitoring", key: "monitoring", Icon: NavCallAnalytics, perm: "users.manage" },
      { href: "/admin/test-otps", key: "testOtps", Icon: NavTestOtps },
      { href: "/admin/roles", key: "roles", Icon: NavRoles, perm: "roles.manage" },
      { href: "/admin/audit-trail", key: "audit", Icon: NavAudit, perm: "users.manage" },
      { href: "/admin/legal", key: "legal", Icon: NavLegal, perm: "users.manage" },
      { href: "/admin/policies", key: "policies", Icon: NavPolicies },
      { href: "/admin/ai-reglaments", key: "aiReglaments", Icon: NavAiReglaments },
      // Not in the visible nav on purpose: one-time first-superadmin setup
      // (bootstrap_key), not a page anyone uses day to day. Still reachable
      // by URL — isBootstrap/bootstrapOk below gate it independently of NAV,
      // which is exactly what lets it work before any admin session exists.
    ],
  },
];
const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
const groupOfKey = (key: string) => NAV_GROUPS.find((g) => g.items.some((n) => n.key === key))?.group ?? "";

// Which nav groups the user opened or closed by hand ("sales:1,system:0"),
// kept per browser. A group without an entry is open only while it holds
// the current page.
const NAV_KEY = "lexgo_admin_nav";
const navListeners = new Set<() => void>();
function subscribeNav(cb: () => void) {
  navListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    navListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readNav(): string {
  try {
    return localStorage.getItem(NAV_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeNav(state: Record<string, boolean>) {
  try {
    localStorage.setItem(NAV_KEY, Object.entries(state).map(([k, v]) => `${k}:${v ? 1 : 0}`).join(","));
  } catch {}
  navListeners.forEach((f) => f());
}
const parseNav = (v: string): Record<string, boolean> => Object.fromEntries(v.split(",").filter(Boolean).map((x) => { const [k, b] = x.split(":"); return [k, b === "1"]; }));
const MOBILE = "(max-width: 900px)";
function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia(MOBILE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
// The overview (/admin) matches only itself; other items also cover their
// sub-pages. A prefix match on /admin would let any page through by URL.
const EXACT_NAV = new Set(["/admin/call-center"]);
const onItem = (pathname: string, n: NavItem) =>
  n.href === "/admin" || EXACT_NAV.has(n.href) ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/");
// Most senior role first; the badge shows the first one the account has.
const BADGE_ORDER = ["superadmin", "admin", "ceo_viewer", "manager", "finance", "quality_control", "moderator", "call_center_lawyer", "call_center", "sales_head", "sales_operator", "sales", "b2b_manager", "marketing", "content_manager"];

export default function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const { session, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // The mobile sidebar is open only on the path it was opened on, so navigating closes it.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [revealed, setRevealed] = useState("");
  useAiReveal(/^nav:/, (id) => {
    setRevealed(groupOfKey(String(id).replace(/^nav:/, "")));
    if (window.matchMedia(MOBILE).matches) setOpenPath(pathname);
  });
  const open = openPath === pathname;
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const navRaw = useSyncExternalStore(subscribeNav, readNav, () => "");
  const navState = useMemo(() => parseNav(navRaw), [navRaw]);
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE).matches, () => false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!bodyEl) return;
    const at = document.activeElement;
    if (at && at !== document.body && at !== document.documentElement && !at.closest(".psb")) return;
    bodyEl.focus({ preventScroll: true });
  }, [pathname, bodyEl]);
  const current = NAV.slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => onItem(pathname, n));
  const currentGroup = current ? groupOfKey(current.key) : "";

  const isBootstrap = pathname === "/admin/bootstrap";
  const isStudioPath = pathname === "/admin/studio" || pathname.startsWith("/admin/studio/");

  // Superadmin sees everything. Admin sees the overview/bootstrap plus every
  // page it actually has the permission for (e.g. it lacks roles.manage, so no
  // Roles page). Other staff see only pages their permissions grant.
  // Assigned roles plus the primary role (a primary "admin" needs no role row).
  const roles = sessionRoles(session);
  const isSuper = roles.includes("superadmin");
  const isFullAdmin = isSuper || roles.includes("admin");
  const perms = session?.permissions ?? [];
  const studioReg = useStudioRegistry(Boolean(session) && !isFullAdmin);
  const studioUser = isFullAdmin || hasStudioAccess(studioReg.userRoles, roles);
  const studioPending = Boolean(session) && !studioUser && studioReg.avail === "checking";
  const adminAccess = hasAdminAccess(session);
  const allowed = adminAccess || isBootstrap || studioUser || (isStudioPath && studioPending);
  // Test OTP is a staging tool: hidden where the backend's demo routes are off (T0-01).
  const demoTools = useDemoTools(isFullAdmin);
  // Meetings: anyone who may start calls (meetings.manage, or a call-center
  // role on a session stored before permissions were saved) — call-center
  // operators run video meetings from here.
  const canSee = (n: NavItem) =>
    n.key === "profile"
      ? true
      : n.key === "supportTickets"
        ? isCallCenterUser(session)
      : n.key === "testOtps" && demoTools !== true
        ? false
      : n.key === "studio"
        ? studioUser
        : n.key === "meetings" && canMakeCalls(session)
        ? true
        : n.perm
          ? isSuper || (Array.isArray(n.perm) ? n.perm : [n.perm]).some((p) => perms.includes(p))
          : isFullAdmin;
  const visibleNav = NAV.filter(canSee);
  const q = query.trim();
  const matches = (n: NavItem) => !q || fuzzyContains(q, t(`nav.${n.key}`));
  const firstMatch = q ? visibleNav.find((n) => !n.hidden && matches(n)) : undefined;
  // The bootstrap page (needs the bootstrap key) serves first-time setup:
  // signed-out users, non-staff and full admins. Limited staff (sales,
  // call-center…) must not open it by URL.
  const bootstrapOk = isBootstrap && (!session || !adminAccess || isFullAdmin);

  useEffect(() => {
    if (!ready) return;
    if (!session && !isBootstrap) {
      router.replace("/login");
      return;
    }
    if (!session) return;
    if (isStudioPath && studioPending) return;
    if (!adminAccess && !studioUser && !isBootstrap) {
      router.replace(`/portal/${session.role}`);
      return;
    }
    // Anyone but superadmin on a page their permissions don't cover → send to
    // their first allowed page.
    if (!isSuper && !bootstrapOk) {
      const onAllowed = visibleNav.some(
        (n) => onItem(pathname, n),
      );
      if (!onAllowed) router.replace(visibleNav.find((n) => !n.hidden)?.href ?? `/portal/${session.role}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, router, isBootstrap, bootstrapOk, pathname, studioUser, studioPending, isStudioPath]);

  const placeholder = <div className="portal portal--redirect" aria-busy="true"><span className="rf__spinner" /></div>;
  if (!ready) return placeholder;
  if (!allowed) return placeholder;
  // A page this account's permissions don't cover must not mount (its data
  // calls would only answer 403) while the effect above redirects away.
  if (session && !isSuper && !bootstrapOk && !visibleNav.some((n) => onItem(pathname, n))) return placeholder;

  const active = current;
  const title = active ? t(`nav.${active.key}`) : t("title");
  // Clicking your own name goes to your own profile.
  const role = session?.role ?? "client";
  // Backend staff roles map to the UI's client role for shared auth storage,
  // but they must never be sent to client-only pages from this shell.
  const staffSession = Boolean(session && role === "client" && adminAccess);
  // Staff see their own role on the badge, not "Admin" for everyone.
  const badgeKey = BADGE_ORDER.find((r) => roles.includes(r));
  const roleBadge = badgeKey && t.has(`roleBadges.${badgeKey}`) ? t(`roleBadges.${badgeKey}`) : t("badge");
  const profileHref = staffSession ? "/admin/profile" : `/portal/${role}/profile`;

  return (
    <div className="portal portal--admin">
      <div className={`psb__scrim${open ? " on" : ""}`} onClick={() => setOpenPath(null)} />
      <aside className={`psb psb--admin${open ? " on" : ""}`} inert={mobile && !open}>
        <div className="psb__brand">
          <div className="psb__logo">
            <span className="logo__m">
              <IconLogo />
            </span>
            LexGo
          </div>
          <span className="psb__role">{roleBadge}</span>
        </div>
        <div className="psb__search">
          <IconSearch aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={t("navSearch")}
            aria-label={t("navSearch")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && firstMatch) {
                setQuery("");
                router.push(firstMatch.href);
              }
            }}
            data-ai-id="admin.nav.search"
          />
          <kbd aria-hidden="true">Ctrl K</kbd>
        </div>
        <nav className="psb__nav" aria-label={t("menu")}>
          {NAV_GROUPS.map((g) => {
            const items = g.items.filter((n) => !n.hidden && canSee(n) && matches(n));
            if (!items.length) return null;
            const holdsCurrent = g.group === currentGroup;
            const expanded = Boolean(q) || g.group === revealed || (navState[g.group] ?? (holdsCurrent || g.group === "command"));
            const id = `psb-g-${g.group}`;
            return (
              <div className={`psb__group${expanded ? " is-open" : ""}${holdsCurrent ? " has-current" : ""}`} key={g.group}>
                <button
                  type="button"
                  className="psb__gbtn"
                  aria-expanded={expanded}
                  aria-controls={id}
                  disabled={Boolean(q)}
                  onClick={() => {
                    if (g.group === revealed) setRevealed("");
                    writeNav({ ...navState, [g.group]: !expanded });
                  }}
                >
                  <span className="psb__glabel2" title={t(`groups.${g.group}`)}>{t(`groups.${g.group}`)}</span>
                  {holdsCurrent ? <i className="psb__gdot" aria-hidden="true" /> : null}
                  <span className="psb__gpeek" aria-hidden="true">
                    {items.slice(0, 3).map(({ key, Icon }) => (
                      <Icon key={key} />
                    ))}
                  </span>
                  <NavChevron className="psb__gchev" />
                </button>
                <div className="psb__gitems" id={id} inert={!expanded}>
                  <div className="psb__gwrap">
                    <div className="psb__glist">
                      {items.map(({ href, key, Icon }, i) => {
                        const on = active?.href === href;
                        return (
                          <Link key={href} href={href} style={{ "--i": i } as CSSProperties} className={`psb__link${on ? " on" : ""}${firstMatch?.href === href ? " is-first" : ""}`} aria-current={on ? "page" : undefined} data-ai-target={`nav:${key}`} onClick={() => setQuery("")}>
                            <span className="psb__ic"><Icon /></span>
                            <span className="psb__lt" title={t(`nav.${key}`)}>{t(`nav.${key}`)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {q && !firstMatch ? <p className="psb__none">{t("navEmpty")}</p> : null}
        </nav>
        <div className="psb__foot">
          {staffSession ? null : (
            <Link href={session ? `/portal/${session.role}` : "/portal/client"} className="psb__link">
              <IconGrid />
              {t("backToPortal")}
            </Link>
          )}
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
          <h1 data-ai-target="ai-help:current-page">{title}</h1>
          <div className="ptop__sp">
            {/* HRM is a workspace of its own, so its door sits up here
                rather than among the admin pages in the sidebar. */}
            {hasInternalAccess(session) ? (
              <Link className="ptop__hrm" href="/internal" title={t("nav.internal")}>
                <NavInternal />
                <span>HRM</span>
              </Link>
            ) : null}
            <FeedbackButton />
            <ThemeToggle variant="square" />
            <LanguageSwitcher />
            <Link className="ptop__user" href={profileHref} title={session?.name || t("badge")} data-ai-target="header:profile">
              <span className="ptop__av">{initials(session?.name || "A")}</span>
              <span>{session?.name || t("badge")}</span>
            </Link>
          </div>
        </header>
        <div className="pbody" ref={setBodyEl} tabIndex={-1}>
          <div className="pbody__in">{children}</div>
        </div>
      </div>
      <AiSystemAssistant open={aiOpen} onOpen={() => setAiOpen(true)} onClose={() => setAiOpen(false)} role="client" guideRole="staff" launcher="always" />
    </div>
  );
}
