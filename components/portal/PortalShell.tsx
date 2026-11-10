"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight, ChevronUp, CircleAlert, CircleCheck, LogOut, PanelLeftClose, Scale } from "lucide-react";
import "./shell/shell1920.css";
// The dashboard's own pieces (.cx-empty, .cx-pill, .cx-iconbtn, .cx-h3,
// .cx-link, .cx-tag, .cx-svc …) on every cabinet page, so a page can be drawn
// in the dashboard's vocabulary without importing the dashboard.
import "./dash/dash1920.css";
import "./shell/layers1920.css";
import "./shell/cabinet1920.css";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth, hasAdminAccess, type Role } from "@/lib/auth";
import { useAiReveal } from "@/lib/guide/targets";
import { initials } from "@/lib/lawyers";
import NotificationBell from "./NotificationBell";
import SupportMenu from "./SupportMenu";
import MarketWatcher from "../marketplace/MarketWatcher";
import SellerHeaderSlot from "./SellerHeaderSlot";
import { listenToDesk, tellDesk } from "@/lib/deskBridge";
import { canUseDesk, setDeskMode, useDeskEmbedOs, useDeskEmbedded, useDeskMode, useDeskOs, useDesktopDevice } from "./desk/deskMode";
import DeskApp from "./desk/DeskApp";
import OsPicker from "./desk/OsPicker";

// The cabinet's desktop view is its own bundle, loaded only by those who
// switch to it.
const DesktopShell = dynamic(() => import("./desk/DesktopShell"), { ssr: false });

// three.js/R3F must never run during SSR; isolated behind ssr:false rather
// than disabling SSR for the shell itself.
const LexGoRobot = dynamic(() => import("@/components/lexgo/robot/LexGoRobot"), { ssr: false });
// The system assistant is a floating overlay on every portal page; loading it
// with the shell would pull the AI client into the first paint of a cabinet
// that may never open it.
const AiSystemAssistant = dynamic(() => import("./AiSystemAssistant"), { ssr: false });
import { CabinetProvider, useCabinetLoader } from "./SellerCabinet";
import { ADVOCATE_NAV, CLIENT_NAV, LAWYER_NAV, TITLE_ONLY, groupsFor, type NavItem } from "./portalNav";
import { AccountMenu, HeaderSearch, LangSelect } from "./shell/LxHeaderTools";
import { LxHeaderProvider, type LxHeader } from "./shell/lxHeader";
import { useNavBadges } from "./shell/useNavBadges";
import { useScrollEdges } from "@/lib/useScrollEdges";
import { weekdayDate } from "@/lib/date";
import { useRoleNav } from "../RoleNavHost";
import type { SellerActions } from "@/lib/services/backend";
import {
  IconLogo,
  IconLogoText,
  IconMenu,
  IconClose,
  IconClipboardCheck,
  IconClock,
} from "../icons";
import { can } from "@/lib/permissions";


// While a seller (lawyer/advocate) is `pending` admin approval they can only
// reach onboarding/account screens; operational marketplace actions are gated
// (the backend also returns 403 on those endpoints until approval).
const PENDING_ALLOWED: Record<Role, Set<string>> = {
  client: new Set(),
  lawyer: new Set(["dashboard", "profile", "services", "subscription", "notifications", "support", "feedback", "teamTasks"]),
  advocate: new Set(["dashboard", "profile", "subscription", "notifications", "support", "feedback", "teamTasks"]),
};

// Nav items that also need a specific cabinet action (available_actions).
const ACTION_GATED: Record<string, keyof SellerActions> = {
  newOrders: "acceptOrders",
  messages: "secureChat",
};

function isLocked(role: Role, key: string, limited: boolean, actions: SellerActions | null): boolean {
  if (limited && !PENDING_ALLOWED[role].has(key)) return true;
  const action = ACTION_GATED[key];
  return !!actions && !!action && !actions[action];
}

export default function PortalShell({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const t = useTranslations("portal");
  const tx = useTranslations("lxShell");
  const locale = useLocale();
  const { session, ready, logout } = useAuth();
  // Pages the account's role profile lost (GET /me/navigation) have no row
  // in the sidebar, the mobile drawer or the desktop; RoleRouteGuard blocks
  // their URLs.
  const { hides } = useRoleNav();
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
  // The cabinet as a desktop, and a page running inside one of its
  // windows (which tells the desktop where it has gone).
  const deskMode = useDeskMode();
  const embedded = useDeskEmbedded();
  const embedOs = useDeskEmbedOs();
  const deskOs = useDeskOs();
  // The desktop only on a computer (never on a phone or by touch).
  const desktopDevice = useDesktopDevice();
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (embedded) tellDesk({ type: "lexgo-desk:path", path: pathname });
  }, [embedded, pathname]);
  // …and hears back how it is shown (picture-in-picture during a call).
  useEffect(() => (embedded ? listenToDesk() : undefined), [embedded]);

  // Desktop collapse (icon-only rail) — a per-device convenience, remembered
  // across visits but never blocking the page if storage is unavailable.
  // Starts expanded (matches the server-rendered shell) and reads the saved
  // value right after mount, so there is no hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  // The system assistant's panel. Owned here rather than by the component so
  // the robot in the corner can open it.
  const [aiOpen, setAiOpen] = useState(false);
  useAiReveal(/^nav:/, () => {
    if (window.matchMedia("(max-width: 900px)").matches) setOpenPath(pathname);
  });
  useEffect(() => {
    const h = setTimeout(() => {
      try { if (localStorage.getItem("lexgo_sidebar_collapsed") === "1") setCollapsed(true); } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(h);
  }, []);
  // Collapsible sidebar groups the user folded, remembered per device.
  const [folded, setFolded] = useState<Set<string>>(new Set());
  useEffect(() => {
    const h = setTimeout(() => {
      try {
        const raw = localStorage.getItem("lexgo_sidebar_folded");
        if (raw) setFolded(new Set(JSON.parse(raw) as string[]));
      } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(h);
  }, []);
  function toggleGroup(key: string) {
    setFolded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("lexgo_sidebar_folded", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }
  // What a page tells the header (the dashboards greet by name).
  const [header, setHeader] = useState<LxHeader>({});
  const headerTitle = header.path === pathname ? header.title : undefined;
  const headerNote = header.path === pathname ? header.note : undefined;
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
  const badges = useNavBadges(role, ready && session?.role === role && !limited, pathname, actions);
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
  // On a short window (a 13" MacBook) the sidebar list scrolls with its
  // scrollbar hidden; data-more lets the CSS fade the edge that has more.
  const navRef = useRef<HTMLElement>(null);
  useScrollEdges(navRef, { silent: true });
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
  const gated = hideBody ? <div className="portal--gated" aria-busy="true"><span className="rf__spinner" /></div> : children;

  const baseNav = role === "advocate" ? ADVOCATE_NAV : role === "lawyer" ? LAWYER_NAV : CLIENT_NAV;
  const teamTasks: NavItem = { href: `/portal/${role}/team-tasks`, key: "teamTasks", Icon: IconClipboardCheck };
  const canTeam = can(session, "tasks.view");
  const nav = (canTeam ? [...baseNav, teamTasks] : baseNav).filter((n) => !hides(n.href));
  const titleOnly = TITLE_ONLY[role].filter((n) => !hides(n.href));
  const navLabel = (key: string) => tx(`nav.${role}.${key}`);
  // Title lookup spans the title-only routes too, so a page that is not in
  // the sidebar is still named correctly and does not light a wrong row.
  const active = nav
    .concat(titleOnly)
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  const title = active ? navLabel(active.key) : t("metaTitle");
  // The name in the header is where people click to reach their own profile.
  const profileHref = nav.find((n) => n.key === "profile")?.href ?? `/portal/${role}`;

  // The desktop view, for the accounts it is open to (see canUseDesk).
  // Clients have a desktop of their own (/client-desktop), the same shell
  // with the apps their role is given. The client's pages without a sidebar
  // row (document analysis, requests) are programs of their own there, so
  // a link to one opens its window rather than the dashboard's.
  const deskAllowed = canUseDesk(session) && (embedded || desktopDevice);
  // Inside a desktop window: the page alone, no sidebar, header or assistant.
  // A cabinet page is dressed as the program it is (see DeskApp).
  if (embedded) {
    return (
      <div className="portal portal--embed">
        <CabinetProvider value={cabinet}>
          {deskAllowed && active ? (
            <DeskApp os={embedOs} nav={nav} current={active.key} label={navLabel} locked={(k) => isLocked(role, k, limited, actions)} name={session.name}>
              {gated}
            </DeskApp>
          ) : (
            <div className="pbody">
              <div className="pbody__in">{gated}</div>
            </div>
          )}
        </CabinetProvider>
      </div>
    );
  }
  if (deskAllowed && deskMode === "desktop") {
    return (
      <>
        {role !== "client" && !limited ? <SellerHeaderSlot role={role} quiet desk /> : null}
        <DesktopShell
          key={deskOs}
          os={deskOs}
          role={role}
          apps={nav.concat(titleOnly).filter((n) => !isLocked(role, n.key, limited, actions)).map((n) => ({ ...n, label: navLabel(n.key), locked: false }))}
          name={session.name}
          isAdmin={hasAdminAccess(session)}
          onLogout={logout}
        />
      </>
    );
  }

  const groups = groupsFor(role)
    // A page the account may not open yet (pending approval, or a cabinet
    // action it lacks) has no row at all — owner law: no locked entries.
    .map((g) => ({ ...g, items: [...g.items, ...(canTeam && g.key === (role === "client" ? "myWork" : "workspace") ? [teamTasks] : [])].filter((n) => nav.includes(n) && !isLocked(role, n.key, limited, actions)) }))
    .filter((g) => g.items.length);
  const roleName = tx(`role.${role}`);
  const dashHref = `/portal/${role}`;
  const onDash = pathname === dashHref;
  const today = weekdayDate(new Date(), locale);
  const verified = cabinet.data ? cabinet.data.verification.verified === true : null;

  return (
    <div className={`portal lx${collapsed ? " psb-collapsed" : ""}${fullscreen ? " portal--full" : ""}`}>
      <MarketWatcher role={role} />
      {fullscreen && role !== "client" && !limited ? <SellerHeaderSlot role={role} quiet /> : null}
      {picking ? (
        <OsPicker
          current={deskOs}
          onClose={() => setPicking(false)}
          onPick={() => {
            setPicking(false);
            setDeskMode("desktop");
          }}
        />
      ) : null}
      {/* The robot in the bottom-right corner opens the system assistant;
          below 900px the assistant shows its own launcher instead. */}
      {fullscreen ? null : <LexGoRobot onRobotClick={() => setAiOpen(true)} />}
      <AiSystemAssistant open={aiOpen} onOpen={() => setAiOpen(true)} onClose={() => setAiOpen(false)} role={role} launcher={fullscreen ? "none" : "auto"} />
      <div className={`psb__scrim${open ? " on" : ""}`} onClick={() => setOpenPath(null)} />
      {fullscreen ? <div className="psb__hotzone" onMouseEnter={() => setPeek(true)} /> : null}
      <aside
        className={`psb lx-sb${open ? " on" : ""}${collapsed ? " collapsed" : ""}${fullscreen && peek ? " peek" : ""}`}
        onMouseLeave={() => fullscreen && setPeek(false)}
        aria-label={tx("breadcrumb")}
      >
        <div className="psb__brand lx-sb__brand">
          <Link href={dashHref} className="lx-sb__logo" aria-label="Tezkor Himoya">
            <span className="lx-sb__mark">
              <IconLogo />
            </span>
            <span className="psb__label lx-sb__word">
              <IconLogoText stacked />
            </span>
          </Link>
          <button
            className="lx-sb__fold lx-sb__fold--top psb__collapse"
            type="button"
            onClick={toggleCollapsed}
            title={tx(collapsed ? "expand" : "collapse")}
            aria-label={tx(collapsed ? "expand" : "collapse")}
          >
            <PanelLeftClose />
          </button>
          <button className="lx-sb__x" type="button" aria-label={tx("closeMenu")} onClick={() => setOpenPath(null)}>
            <IconClose />
          </button>
        </div>
        <nav className="psb__nav lx-sb__nav" ref={navRef}>
          {groups.map((g) => {
            const shut = g.collapsible && folded.has(g.key) && !g.items.some((n) => n.href === active?.href);
            return (
              <div className={`lx-sb__grp${shut ? " is-shut" : ""}`} key={g.key || "top"}>
                {g.key ? (
                  g.collapsible ? (
                    <button
                      type="button"
                      className="lx-sb__glabel lx-sb__glabel--btn"
                      aria-expanded={!shut}
                      aria-label={tx("toggleGroup", { group: tx(`groups.${g.key}`) })}
                      onClick={() => toggleGroup(g.key)}
                    >
                      <span className="psb__label">{tx(`groups.${g.key}`)}</span>
                      <ChevronUp aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="lx-sb__glabel">
                      <span className="psb__label">{tx(`groups.${g.key}`)}</span>
                    </span>
                  )
                ) : null}
                {shut
                  ? null
                  : g.items.map(({ href, key, Icon, tone, badge }) => {
                      const on = active?.href === href;
                      const label = navLabel(key);
                      const n = badge ? badges[badge] : 0;
                      const cls = `psb__link lx-sb__link${tone === "danger" ? " is-danger" : ""}`;
                      return (
                        <Link key={href} href={href} className={`${cls}${on ? " on" : ""}`} aria-current={on ? "page" : undefined} title={collapsed ? label : undefined} data-ai-target={`nav:${key}`}>
                          <Icon />
                          <span className="psb__label">{label}</span>
                          {n > 0 ? <b className="lx-sb__badge">{n > 99 ? "99+" : n}</b> : null}
                        </Link>
                      );
                    })}
              </div>
            );
          })}
        </nav>
        <div className="psb__foot lx-sb__foot">
          <Link href={profileHref} className="lx-sb__me" title={session.name} data-ai-target="sidebar:profile">
            <span className="lx-sb__av">{initials(session.name || "U")}</span>
            <span className="lx-sb__who psb__label">
              <b>{session.name}</b>
            </span>
          </Link>
          <button className="lx-sb__fold lx-sb__out" type="button" onClick={logout} title={tx("menu.logout")} aria-label={tx("menu.logout")}>
            <LogOut />
          </button>
        </div>
      </aside>

      <div className="pmain">
        {fullscreen ? (
          // Fullscreen drops the header, and with it the only way into the
          // sidebar on a phone; this button stands in (hidden above 900px).
          <button className="pfull__menu" type="button" aria-label={t("menu")} aria-expanded={open} onClick={() => setOpenPath(open ? null : pathname)}>
            {open ? <IconClose /> : <IconMenu />}
          </button>
        ) : null}
        <div className="pbody">
          {fullscreen ? null : (
            <header className="ptop lx-top">
              <button className="ptop__burger lx-top__burger" type="button" aria-label={tx(open ? "closeMenu" : "openMenu")} onClick={() => setOpenPath(open ? null : pathname)}>
                {open ? <IconClose /> : <IconMenu />}
              </button>
              <div className="lx-top__head">
                {role === "client" && !onDash ? (
                  <nav className="lx-top__crumbs" aria-label={tx("breadcrumb")}>
                    <Link href={dashHref}>{tx("crumbHome")}</Link>
                    <ChevronRight aria-hidden="true" />
                    <span aria-current="page">{title}</span>
                  </nav>
                ) : (
                  <p className="lx-top__meta">
                    <span>{today}</span>
                    <span className="lx-top__where"> · {tx("crumbHome")}</span>
                    {headerNote ? <span> · {headerNote}</span> : null}
                  </p>
                )}
                <h1 data-ai-target="ai-help:current-page">{headerTitle ?? title}</h1>
                {role !== "client" && !limited ? (
                  <div className="lx-chips">
                    <span className="lx-chip lx-chip--role">
                      <span className="lx-chip__ic">
                        <Scale />
                      </span>
                      {roleName}
                    </span>
                    {verified !== null ? (
                      <span className={`lx-chip ${verified ? "lx-chip--ok" : "lx-chip--warn"}`}>
                        {verified ? <CircleCheck /> : <CircleAlert />}
                        {tx(verified ? "verified" : "unverified")}
                      </span>
                    ) : null}
                    <SellerHeaderSlot role={role} />
                  </div>
                ) : null}
              </div>
              <div className="ptop__sp lx-top__tools">
                <HeaderSearch role={role} pages={nav.concat(titleOnly).filter((n) => !isLocked(role, n.key, limited, actions))} label={navLabel} />
                <SupportMenu role={role} text={tx("help")} />
                <NotificationBell role={role} />
                <LangSelect />
                <AccountMenu
                  name={session.name}
                  profileHref={profileHref}
                  isAdmin={hasAdminAccess(session)}
                  onDesktop={deskAllowed ? () => setPicking(true) : undefined}
                  onLogout={logout}
                />
              </div>
            </header>
          )}
          <div className="pbody__in">
            {fullscreen ? null : limited ? (
              <div className="pend-banner" role="status">
                <span className="pend-banner__ic"><IconClock /></span>
                <div>
                  <b>{t("pending.title")}</b>
                  <p>{t("pending.text")}</p>
                </div>
              </div>
            ) : null}
            <CabinetProvider value={cabinet}>
              <LxHeaderProvider value={setHeader}>{gated}</LxHeaderProvider>
            </CabinetProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
