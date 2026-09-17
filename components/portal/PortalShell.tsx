"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
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
  { href: "/portal/lawyer/services", key: "services", Icon: IconBriefcase },
  { href: "/portal/lawyer/documents", key: "documents", Icon: IconDocLines },
  { href: "/portal/lawyer/workspace", key: "workspace", Icon: IconFolder },
  { href: "/portal/lawyer/chat", key: "chat", Icon: IconChat },
  { href: "/portal/lawyer/notifications", key: "notifications", Icon: IconBell },
  { href: "/portal/lawyer/ai", key: "ai", Icon: IconSparkle },
  { href: "/portal/lawyer/assistant", key: "assistant", Icon: IconClipboardCheck },
  { href: "/portal/lawyer/profile", key: "profile", Icon: IconUser },
  { href: "/portal/lawyer/promotion", key: "promotion", Icon: IconBolt },
  { href: "/portal/lawyer/subscription", key: "subscription", Icon: IconStar },
];

const ADVOCATE_NAV: NavItem[] = [
  { href: "/portal/advocate", key: "dashboard", Icon: IconGrid },
  { href: "/portal/advocate/opportunities", key: "opportunities", Icon: IconBriefcase },
  { href: "/portal/advocate/cases", key: "cases", Icon: IconFileText },
  { href: "/portal/advocate/calendar", key: "calendar", Icon: IconCalendar },
  { href: "/portal/advocate/clients", key: "clients", Icon: IconUsers },
  { href: "/portal/advocate/tasks", key: "tasks", Icon: IconClipboardCheck },
  { href: "/portal/advocate/messages", key: "messages", Icon: IconChat },
  { href: "/portal/advocate/notifications", key: "notifications", Icon: IconBell },
  { href: "/portal/advocate/organization", key: "organization", Icon: IconBuilding },
  { href: "/portal/advocate/workspace", key: "workspace", Icon: IconFolder },
  { href: "/portal/advocate/assistant", key: "assistant", Icon: IconSparkle },
  { href: "/portal/advocate/profile", key: "profile", Icon: IconUser },
  { href: "/portal/advocate/promotion", key: "promotion", Icon: IconBolt },
  { href: "/portal/advocate/subscription", key: "subscription", Icon: IconStar },
];

const CLIENT_NAV: NavItem[] = [
  { href: "/portal/client", key: "dashboard", Icon: IconGrid },
  { href: "/portal/client/sos", key: "sos", Icon: IconAlert },
  { href: "/portal/client/services", key: "services", Icon: IconBriefcase },
  { href: "/portal/client/packages", key: "packages", Icon: IconGift },
  { href: "/portal/client/documents", key: "documents", Icon: IconDocLines },
  { href: "/portal/client/cases", key: "cases", Icon: IconFileText },
  { href: "/portal/client/messages", key: "messages", Icon: IconChat },
  { href: "/portal/client/notifications", key: "notifications", Icon: IconBell },
  { href: "/portal/client/ai", key: "ai", Icon: IconSparkle },
  { href: "/portal/client/intake", key: "intake", Icon: IconSparkle },
  { href: "/portal/client/doc-analysis", key: "docAnalysis", Icon: IconFileText },
  { href: "/portal/client/academy", key: "academy", Icon: IconGraduation },
  { href: "/portal/client/lawyers", key: "lawyers", Icon: IconUser },
  { href: "/portal/client/matches", key: "matches", Icon: IconTarget },
  { href: "/portal/client/subscription", key: "subscription", Icon: IconShield },
  { href: "/portal/client/payments", key: "payments", Icon: IconCard },
  { href: "/portal/client/gifts", key: "gifts", Icon: IconGift },
  { href: "/portal/client/referrals", key: "referrals", Icon: IconUsers },
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

  // Lawyer/advocate cabinet bootstrap (reloaded on navigation). Until it loads,
  // the session's account status decides whether access is limited.
  const cabinet = useCabinetLoader(role !== "client" && ready && session?.role === role, pathname);
  const limited =
    role !== "client" && (cabinet.data ? cabinet.data.limitedAccess : session?.accountStatus === "pending");
  const actions = cabinet.data?.actions ?? null;

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
    if (role !== "client") {
      const navList = role === "advocate" ? ADVOCATE_NAV : LAWYER_NAV;
      const cur = navList
        .slice()
        .sort((a, b) => b.href.length - a.href.length)
        .find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
      if (cur && isLocked(role, cur.key, limited, actions)) {
        router.replace(`/portal/${role}`);
      }
    }
  }, [ready, session, role, router, pathname, limited, actions]);

  // While the session loads or the guard redirects, keep the portal chrome
  // (the public navbar/footer are hidden by body:has(.portal)).
  if (!ready || !session || session.role !== role) return <div className="portal portal--redirect" aria-busy="true"><span className="rf__spinner" /></div>;

  const nav =
    role === "advocate" ? ADVOCATE_NAV : role === "lawyer" ? LAWYER_NAV : CLIENT_NAV;
  const active = nav
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  const title = active ? t(`sidebar.${role}.${active.key}`) : t("metaTitle");
  // The name in the header is where people click to reach their own profile.
  const profileHref = nav.find((n) => n.key === "profile")?.href ?? `/portal/${role}`;

  return (
    <div className="portal">
      <IncomingCallWatcher />
      <div
        className={`psb__scrim${open ? " on" : ""}`}
        onClick={() => setOpenPath(null)}
      />
      <aside className={`psb${open ? " on" : ""}`}>
        <div className="psb__logo">
          <span className="logo__m">
            <IconLogo />
          </span>
          LexGo
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
            if (locked) {
              return (
                <span
                  key={href}
                  className="psb__link psb__link--locked"
                  aria-disabled="true"
                  title={t("pending.locked")}
                >
                  <Icon />
                  {t(`sidebar.${role}.${key}`)}
                  <IconLock />
                </span>
              );
            }
            return (
              <Link key={href} href={href} className={`psb__link${on ? " on" : ""}`}>
                <Icon />
                {t(`sidebar.${role}.${key}`)}
              </Link>
            );
          })}
        </nav>
        <div className="psb__foot">
          {hasAdminAccess(session) ? (
            <Link href="/admin" className="psb__link">
              <IconShield />
              {t("common.admin")}
            </Link>
          ) : null}
          <button className="psb__link" type="button" onClick={logout}>
            <IconLogout />
            {t("common.logout")}
          </button>
        </div>
      </aside>

      <div className="pmain">
        <header className="ptop">
          <button
            className="ptop__burger"
            type="button"
            aria-label="Menu"
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
        <div className="pbody">
          <div className="pbody__in">
            {limited ? (
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
            <CabinetProvider value={cabinet}>{children}</CabinetProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
