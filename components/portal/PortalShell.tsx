"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth, hasAdminAccess, type Role } from "@/lib/auth";
import { initials } from "@/lib/lawyers";
import LanguageSwitcher from "../LanguageSwitcher";
import ThemeToggle from "../ThemeToggle";
import NotificationBell from "./NotificationBell";
import IncomingCallWatcher from "./IncomingCallWatcher";
import GrowthBanner from "./GrowthBanner";
import GiftNudge from "./GiftNudge";

// three.js/R3F must never run during SSR; isolated behind ssr:false rather
// than disabling SSR for the shell itself.
const LexGoRobot = dynamic(() => import("@/components/lexgo/robot/LexGoRobot"), { ssr: false });
import { CabinetProvider, useCabinetLoader } from "./SellerCabinet";
import type { SellerActions } from "@/lib/services/backend";
import {
  IconLogo,
  IconGrid,
  IconBriefcase,
  IconFileText,
  IconDocLines,
  IconCalendar,
  IconUsers,
  IconChat,
  IconSparkle,
  IconUser,
  IconCard,
  IconShield,
  IconGift,
  IconLogout,
  IconMenu,
  IconClose,
  IconBolt,
  IconStar,
  IconBuilding,
  IconBell,
  IconFolder,
  IconAlert,
  IconGraduation,
  IconClipboardCheck,
  IconShieldCheck,
  IconTarget,
  IconLock,
  IconClock,
  IconVideo,
  IconChevronLeft,
  IconEye,
  IconSearch,
  IconAward,
  IconUserPlus,
  IconFolderPlus,
} from "../icons";

type SvgC = ComponentType<{ className?: string }>;
type NavItem = { href: string; key: string; Icon: SvgC };

// While a seller (lawyer/advocate) is `pending` admin approval they can only
// reach onboarding/account screens; operational marketplace actions are gated
// (the backend also returns 403 on those endpoints until approval).
const PENDING_ALLOWED: Record<Role, Set<string>> = {
  client: new Set(),
  lawyer: new Set(["dashboard", "profile", "services", "subscription", "notifications"]),
  advocate: new Set(["dashboard", "profile", "subscription", "notifications"]),
};

// Nav items that also need a specific cabinet action (available_actions).
const ACTION_GATED: Record<string, keyof SellerActions> = {
  marketplace: "acceptOrders",
  opportunities: "acceptOrders",
  chat: "secureChat",
  messages: "secureChat",
};

function isLocked(role: Role, key: string, limited: boolean, actions: SellerActions | null): boolean {
  if (limited && !PENDING_ALLOWED[role].has(key)) return true;
  const action = ACTION_GATED[key];
  return !!actions && !!action && !actions[action];
}

const LAWYER_NAV: NavItem[] = [
  { href: "/portal/lawyer", key: "dashboard", Icon: IconGrid },
  { href: "/portal/lawyer/marketplace", key: "marketplace", Icon: IconBriefcase },
  { href: "/portal/lawyer/cases", key: "cases", Icon: IconFileText },
  { href: "/portal/lawyer/tasks", key: "tasks", Icon: IconClipboardCheck },
  { href: "/portal/lawyer/calendar", key: "calendar", Icon: IconCalendar },
  { href: "/portal/lawyer/clients", key: "clients", Icon: IconUsers },
  { href: "/portal/lawyer/services", key: "services", Icon: IconTarget },
  { href: "/portal/lawyer/documents", key: "documents", Icon: IconDocLines },
  { href: "/portal/lawyer/document-requests", key: "documentRequests", Icon: IconDocLines },
  { href: "/portal/lawyer/files", key: "files", Icon: IconFolderPlus },
  { href: "/portal/lawyer/chat", key: "chat", Icon: IconChat },
  { href: "/portal/lawyer/meetings", key: "meetings", Icon: IconVideo },
  { href: "/portal/lawyer/notifications", key: "notifications", Icon: IconBell },
  { href: "/portal/lawyer/ai", key: "ai", Icon: IconSparkle },
  { href: "/portal/lawyer/assistant", key: "assistant", Icon: IconEye },
  { href: "/portal/lawyer/profile", key: "profile", Icon: IconUser },
  { href: "/portal/lawyer/referrals", key: "referrals", Icon: IconGift },
  { href: "/portal/lawyer/promotion", key: "promotion", Icon: IconBolt },
  { href: "/portal/lawyer/subscription", key: "subscription", Icon: IconStar },
];

const ADVOCATE_NAV: NavItem[] = [
  { href: "/portal/advocate", key: "dashboard", Icon: IconGrid },
  { href: "/portal/advocate/opportunities", key: "opportunities", Icon: IconBriefcase },
  { href: "/portal/advocate/cases", key: "cases", Icon: IconFileText },
  { href: "/portal/advocate/document-requests", key: "documentRequests", Icon: IconDocLines },
  { href: "/portal/advocate/calendar", key: "calendar", Icon: IconCalendar },
  { href: "/portal/advocate/clients", key: "clients", Icon: IconUsers },
  { href: "/portal/advocate/tasks", key: "tasks", Icon: IconClipboardCheck },
  { href: "/portal/advocate/messages", key: "messages", Icon: IconChat },
  { href: "/portal/advocate/meetings", key: "meetings", Icon: IconVideo },
  { href: "/portal/advocate/notifications", key: "notifications", Icon: IconBell },
  { href: "/portal/advocate/organization", key: "organization", Icon: IconBuilding },
  { href: "/portal/advocate/files", key: "files", Icon: IconFolderPlus },
  { href: "/portal/advocate/assistant", key: "assistant", Icon: IconSparkle },
  { href: "/portal/advocate/profile", key: "profile", Icon: IconUser },
  { href: "/portal/advocate/referrals", key: "referrals", Icon: IconGift },
  { href: "/portal/advocate/promotion", key: "promotion", Icon: IconBolt },
  { href: "/portal/advocate/subscription", key: "subscription", Icon: IconStar },
];

// Reachable pages that deliberately have no sidebar row of their own.
// They are consulted for the header title only, never rendered in the nav.
const CLIENT_TITLE_ONLY: NavItem[] = [
  { href: "/portal/client/doc-analysis", key: "docAnalysis", Icon: IconEye },
];

const CLIENT_NAV: NavItem[] = [
  { href: "/portal/client", key: "dashboard", Icon: IconGrid },
  { href: "/portal/client/sos", key: "sos", Icon: IconAlert },
  { href: "/portal/client/services", key: "services", Icon: IconBriefcase },
  { href: "/portal/client/documents", key: "documentRequests", Icon: IconDocLines },
  { href: "/portal/client/packages", key: "packages", Icon: IconFolder },
  { href: "/portal/client/cases", key: "cases", Icon: IconFileText },
  { href: "/portal/client/messages", key: "messages", Icon: IconChat },
  { href: "/portal/client/notifications", key: "notifications", Icon: IconBell },
  { href: "/portal/client/ai", key: "ai", Icon: IconSparkle },
  { href: "/portal/client/intake", key: "intake", Icon: IconSearch },
  // /portal/client/doc-analysis is deliberately NOT in this list any more:
  // it and the services page were both called "Hujjat tahlili", so they are
  // merged into one entry. The route stays live — the services page and the
  // finished-document upsell both link into it — it just has no sidebar row
  // of its own. PortalShell's longest-href match then titles that page from
  // the services entry, which is the shared name both now carry.
  { href: "/portal/client/academy", key: "academy", Icon: IconGraduation },
  { href: "/portal/client/lawyers", key: "lawyers", Icon: IconUsers },
  { href: "/portal/client/matches", key: "matches", Icon: IconTarget },
  { href: "/portal/client/subscription", key: "subscription", Icon: IconAward },
  { href: "/portal/client/payments", key: "payments", Icon: IconCard },
  { href: "/portal/client/gifts", key: "gifts", Icon: IconGift },
  { href: "/portal/client/referrals", key: "referrals", Icon: IconUserPlus },
  { href: "/portal/client/reviews", key: "reviews", Icon: IconStar },
  { href: "/portal/client/warranty", key: "warranty", Icon: IconShieldCheck },
  { href: "/portal/client/complaints", key: "complaints", Icon: IconClipboardCheck },
  { href: "/portal/client/profile", key: "profile", Icon: IconUser },
];

export default function PortalShell({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const t = useTranslations("portal");
  const { session, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // The mobile sidebar is open only on the path it was opened on, so navigating closes it.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  // The document builder (fill-in wizard + live preview) wants the full
  // viewport: no sidebar or header competing with it for space. The sidebar
  // stays reachable as a hover-triggered overlay (a thin hot zone on the far
  // left) instead of disappearing outright.
  //
  // LEXGO_FRONTEND_WORD_EDITOR_DESIGN_GUIDE.md asks the same of the advocate's
  // Word-editor workspace — "Page full-screen bo'lishi kerak", "Editor sahifa
  // card ichida kichik iframe bo'lmasin". Without this the page renders inside
  // the padded, max-width content column and, worse, `.deditor{height:100%}`
  // resolves against an auto-height box, so the OnlyOffice iframe collapses to
  // nothing. `.portal--full .pbody__in{height:100%}` is what gives it a real
  // viewport-height chain to fill.
  const fullscreen = /\/services\/document\//.test(pathname) || /\/document-requests\/[^/]+\/editor$/.test(pathname);
  const [peek, setPeek] = useState(false);

  // Desktop collapse (icon-only rail) — a per-device convenience, remembered
  // across visits but never blocking the page if storage is unavailable.
  // Starts expanded (matches the server-rendered shell) and reads the saved
  // value right after mount, so there is no hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => {
      try { if (localStorage.getItem("lexgo_sidebar_collapsed") === "1") setCollapsed(true); } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(h);
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("lexgo_sidebar_collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  // Lawyer/advocate cabinet bootstrap (reloaded on navigation). Until it loads,
  // the session's account status decides whether access is limited.
  const cabinet = useCabinetLoader(role !== "client" && ready && session?.role === role, pathname);
  const limited =
    role !== "client" && (cabinet.data ? cabinet.data.limitedAccess : session?.accountStatus === "pending");
  const actions = cabinet.data?.actions ?? null;
  // The nav entry for the current route (sellers only) and whether it is gated.
  // Until the cabinet answers, a route outside the always-allowed set is
  // treated as "unknown" and nothing is rendered — so a typed URL of a locked
  // page never flashes its content before the redirect.
  const navList = role === "advocate" ? ADVOCATE_NAV : role === "lawyer" ? LAWYER_NAV : null;
  const curNav = navList
    ? navList.slice().sort((a, b) => b.href.length - a.href.length).find((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    : undefined;
  const routeLocked = !!curNav && isLocked(role, curNav.key, limited, actions);
  const routeUnknown = !!curNav && role !== "client" && cabinet.status === "loading" && !cabinet.data && !PENDING_ALLOWED[role].has(curNav.key);
  // Last page this user was allowed to see — a locked route bounces back there.
  const lastOkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !session || session.role !== role) return;
    if (!routeLocked && !routeUnknown) lastOkRef.current = pathname;
  }, [ready, session, role, pathname, routeLocked, routeUnknown]);

  // Guard: require a session; keep role and route in sync. Limited sellers are
  // bounced off gated (operational) routes back to their dashboard.
  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.role !== role) {
      router.replace(`/portal/${session.role}`);
      return;
    }
    if (routeLocked) {
      const back = lastOkRef.current && lastOkRef.current !== pathname ? lastOkRef.current : `/portal/${role}`;
      router.replace(back);
    }
  }, [ready, session, role, router, pathname, routeLocked]);

  // While the session loads or the guard redirects, keep the portal chrome
  // (the public navbar/footer are hidden by body:has(.portal)).
  if (!ready || !session || session.role !== role) return <div className="portal portal--redirect" aria-busy="true"><span className="rf__spinner" /></div>;
  // Locked (or not yet known) seller route: chrome only, never the page itself.
  const hideBody = routeLocked || routeUnknown;

  const nav =
    role === "advocate" ? ADVOCATE_NAV : role === "lawyer" ? LAWYER_NAV : CLIENT_NAV;
  // Title lookup spans the title-only routes too, so a page that is not in
  // the sidebar is still named correctly and does not light a wrong row.
  const active = nav
    .concat(role === "client" ? CLIENT_TITLE_ONLY : [])
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  const title = active ? t(`sidebar.${role}.${active.key}`) : t("metaTitle");
  // The name in the header is where people click to reach their own profile.
  const profileHref = nav.find((n) => n.key === "profile")?.href ?? `/portal/${role}`;

  return (
    <div className={`portal${collapsed ? " psb-collapsed" : ""}${fullscreen ? " portal--full" : ""}`}>
      <IncomingCallWatcher />
      {fullscreen ? null : (
        <LexGoRobot onRobotClick={() => router.push(role === "advocate" ? "/portal/advocate/assistant" : `/portal/${role}/ai`)} />
      )}
      <div
        className={`psb__scrim${open ? " on" : ""}`}
        onClick={() => setOpenPath(null)}
      />
      {fullscreen ? <div className="psb__hotzone" onMouseEnter={() => setPeek(true)} /> : null}
      <aside
        className={`psb${open ? " on" : ""}${collapsed ? " collapsed" : ""}${fullscreen && peek ? " peek" : ""}`}
        onMouseLeave={() => fullscreen && setPeek(false)}
      >
        <div className="psb__brand">
          <div className="psb__logo">
            <span className="logo__m">
              <IconLogo />
            </span>
            <span className="psb__label">LexGo</span>
          </div>
          <span className="psb__role">
            {t(
              `common.role${role === "advocate" ? "Advocate" : role === "lawyer" ? "Lawyer" : "Client"}`,
            )}
          </span>
        </div>
        <nav className="psb__nav">
          {nav.map(({ href, key, Icon }) => {
            const on = active?.href === href;
            const locked = isLocked(role, key, limited, actions);
            const label = t(`sidebar.${role}.${key}`);
            if (locked) {
              return (
                <span
                  key={href}
                  className="psb__link psb__link--locked"
                  aria-disabled="true"
                  title={t("pending.locked")}
                >
                  <Icon />
                  <span className="psb__label">{label}</span>
                  <IconLock />
                </span>
              );
            }
            return (
              <Link key={href} href={href} className={`psb__link${on ? " on" : ""}`} title={collapsed ? label : undefined}>
                <Icon />
                <span className="psb__label">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="psb__foot">
          {hasAdminAccess(session) ? (
            <Link href="/admin" className="psb__link" title={collapsed ? t("common.admin") : undefined}>
              <IconShield />
              <span className="psb__label">{t("common.admin")}</span>
            </Link>
          ) : null}
          <button className="psb__link" type="button" onClick={logout} title={collapsed ? t("common.logout") : undefined}>
            <IconLogout />
            <span className="psb__label">{t("common.logout")}</span>
          </button>
          <button
            className="psb__link psb__collapse"
            type="button"
            onClick={toggleCollapsed}
            title={t(collapsed ? "expand" : "collapse")}
          >
            <IconChevronLeft />
            <span className="psb__label">{t("collapse")}</span>
          </button>
        </div>
      </aside>

      <div className="pmain">
        {fullscreen ? (
          // Fullscreen drops the header, and with it the only way into the
          // sidebar. On a desktop the hover hot-zone above takes over, but a
          // phone has no hover — without this button the cabinet is
          // unreachable from the document builder. Hidden above 900px.
          <button
            className="pfull__menu"
            type="button"
            aria-label={t("menu")}
            aria-expanded={open}
            onClick={() => setOpenPath(open ? null : pathname)}
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        ) : (
          <header className="ptop">
            <button
              className="ptop__burger"
              type="button"
              aria-label={t("menu")}
              onClick={() => setOpenPath(open ? null : pathname)}
            >
              {open ? <IconClose /> : <IconMenu />}
            </button>
            <h1>{title}</h1>
            <div className="ptop__sp">
              <NotificationBell role={role} />
              <ThemeToggle variant="square" />
              <LanguageSwitcher />
              <Link className="ptop__user" href={profileHref} title={session.name}>
                <span className="ptop__av">{initials(session.name || "U")}</span>
                <span>{session.name}</span>
              </Link>
            </div>
          </header>
        )}
        <div className="pbody">
          <div className="pbody__in">
            {fullscreen ? null : limited ? (
              <div className="pend-banner" role="status">
                <span className="pend-banner__ic"><IconClock /></span>
                <div>
                  <b>{t("pending.title")}</b>
                  <p>{t("pending.text")}</p>
                </div>
              </div>
            ) : role !== "client" ? (
              <GrowthBanner role={role} completeness={session.completeness} />
            ) : (
              <GiftNudge />
            )}
            <CabinetProvider value={cabinet}>{hideBody ? <div className="portal--gated" aria-busy="true"><span className="rf__spinner" /></div> : children}</CabinetProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
