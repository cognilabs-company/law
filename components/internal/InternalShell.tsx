"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { asDict, asNum } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import { hasInternalAccess, canInternal, getMyMessages, getMyToday, internalRoles } from "@/lib/services/internalHrm";
import { initials } from "@/lib/lawyers";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import FeedbackButton from "@/components/internal/feedback/FeedbackButton";
import CommandPalette from "@/components/internal/CommandPalette";
import { IconChevronDown, IconChevronLeft, IconClose, IconHome, IconLogo, IconLogout, IconMenu, IconMoreHorizontal } from "@/components/icons";
import { NAV_GROUPS, activeNav, navMatches, type NavBadge, type NavItem } from "./nav";

// The HRM workspace chrome. The sidebar is an accordion of groups (the one
// holding the current page opens by itself, the rest remember what the user
// left open), it folds to an icon rail on wide screens, and on a phone the
// four everyday pages sit in a bottom bar with the rest behind "More".

const OPEN_KEY = "lexgo.hrm.nav.open";
const RAIL_KEY = "lexgo.hrm.nav.rail";

// Tiny localStorage-backed stores, read through useSyncExternalStore so the
// server render and the first client render agree (both see the default).
function createStore(key: string) {
  const listeners = new Set<() => void>();
  return {
    read: () => {
      try {
        return localStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    write: (value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* private mode: the choice lasts for this page only */
      }
      listeners.forEach((fn) => fn());
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
const openStore = createStore(OPEN_KEY);
const railStore = createStore(RAIL_KEY);

// Counts for the menu: approvals waiting for me and unread messages. Read on
// open, on every page change and when an internal event arrives.
function useBadges(enabled: boolean, pathname: string): Record<NavBadge, number> {
  const [counts, setCounts] = useState<Record<NavBadge, number>>({ approvals: 0, messages: 0 });
  const load = useCallback(async (signal?: AbortSignal) => {
    const [today, inbox] = await Promise.all([getMyToday(signal).catch(() => null), getMyMessages({ unread: true, limit: 1 }, signal).catch(() => null)]);
    if (signal?.aborted) return;
    setCounts({ approvals: asNum(asDict(today).pending_approvals), messages: inbox?.total ?? 0 });
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    const h = setTimeout(() => void load(c.signal), 0);
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [enabled, pathname, load]);
  useEffect(() => {
    if (!enabled) return;
    return subscribeUserEvents((e) => {
      if (e.event.startsWith("internal.")) void load();
    });
  }, [enabled, load]);
  return counts;
}

export default function InternalShell({ children }: { children: ReactNode }) {
  const t = useTranslations("internal");
  const { session, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawer = drawerPath === pathname;
  const openRaw = useSyncExternalStore(openStore.subscribe, openStore.read, () => "");
  const rail = useSyncExternalStore(railStore.subscribe, railStore.read, () => "") === "1";
  const roles = internalRoles(session);
  const allowed = hasInternalAccess(session);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => !item.permission || canInternal(session, item.permission)) })).filter((g) => g.items.length);
  const visible = groups.flatMap((g) => g.items);
  const active = activeNav(pathname, visible);
  const activeGroup = groups.find((g) => active && g.items.includes(active));
  const role = roles.find((item) => ["superadmin", "admin", "manager", "call_center", "call_center_lawyer"].includes(item)) ?? "staff";
  const badges = useBadges(ready && allowed, pathname);
  // The phone menu closes with Esc, like every other layer of the workspace.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerPath(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!allowed) router.replace(`/portal/${session.role}`);
    else if (!visible.some((item) => navMatches(pathname, item))) router.replace("/internal");
    // Route access is checked again by the backend; this only prevents an
    // unauthorized module from mounting and issuing a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, allowed, pathname, router]);

  if (!ready || !allowed || !active) return <div className="portal portal--redirect" aria-busy="true"><span className="rf__spinner" /></div>;

  // The first visit opens "self"; after that the user's own set is kept. The
  // group of the current page is open regardless.
  const openSet = new Set(openRaw ? openRaw.split(",").filter(Boolean) : ["self"]);
  const isOpen = (key: string) => openSet.has(key) || key === activeGroup?.key;
  const toggle = (key: string) => {
    const next = new Set(openSet);
    if (isOpen(key)) next.delete(key);
    else next.add(key);
    // Closing the active group is remembered as "closed" only once the user
    // leaves it; until then it would reopen at once and feel broken.
    openStore.write([...next].join(",") || "-");
  };
  const count = (item: NavItem) => (item.badge ? badges[item.badge] : 0);
  const groupCount = (items: NavItem[]) => items.reduce((n, item) => n + count(item), 0);
  const tabs = visible.filter((item) => item.mobile).slice(0, 4);

  return (
    <div className={`portal internal-shell hn-shell${rail ? " psb-collapsed is-rail" : ""}`}>
      <div className={`psb__scrim${drawer ? " on" : ""}`} onClick={() => setDrawerPath(null)} />
      <aside className={`psb hn${drawer ? " on" : ""}`}>
        <div className="hn__brand">
          <div className="psb__logo"><span className="logo__m"><IconLogo /></span><span className="hn__word">LexGo</span></div>
          <span className="psb__role hn__role">{t(`roles.${role}`)}</span>
        </div>
        <nav className="hn__nav" aria-label={t("menu")}>
          {groups.map((group) => {
            const open = isOpen(group.key);
            const here = group.key === activeGroup?.key;
            const n = groupCount(group.items);
            return (
              <div className={`hn__group${here ? " is-here" : ""}${open ? " is-open" : ""}`} key={group.key}>
                <button type="button" className="hn__head" aria-expanded={open} onClick={() => toggle(group.key)} title={t(`groups.${group.key}`)}>
                  <group.Icon />
                  <span className="hn__label">{t(`groups.${group.key}`)}</span>
                  {!open && n ? <span className="hn__badge">{n > 99 ? "99+" : n}</span> : null}
                  <IconChevronDown className="hn__chev" />
                </button>
                <div className="hn__body">
                  <div className="hn__items">
                    {group.items.map((item) => {
                      const on = active.href === item.href;
                      const c = count(item);
                      return (
                        <Link key={item.href} href={item.href} className={`hn__link${on ? " on" : ""}`} aria-current={on ? "page" : undefined} title={t(`nav.${item.key}`)} tabIndex={open ? undefined : -1}>
                          <item.Icon />
                          <span className="hn__label">{t(`nav.${item.key}`)}</span>
                          {c ? <span className="hn__badge">{c > 99 ? "99+" : c}</span> : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="hn__foot">
          <Link href={session ? `/portal/${session.role}` : "/portal/client"} className="hn__link" title={t("backToPortal")}><IconHome /><span className="hn__label">{t("backToPortal")}</span></Link>
          <button className="hn__link" type="button" onClick={logout} title={t("logout")}><IconLogout /><span className="hn__label">{t("logout")}</span></button>
          <button className="hn__link hn__fold" type="button" onClick={() => railStore.write(rail ? "0" : "1")} aria-pressed={rail} title={t(rail ? "expandMenu" : "collapseMenu")}>
            <IconChevronLeft className="hn__foldi" />
            <span className="hn__label">{t("collapseMenu")}</span>
          </button>
        </div>
      </aside>
      <div className="pmain">
        <header className="ptop hn-top">
          <button className="ptop__burger" type="button" aria-label={t("menu")} onClick={() => setDrawerPath(drawer ? null : pathname)}>{drawer ? <IconClose /> : <IconMenu />}</button>
          <div className="hn-top__where">
            {activeGroup ? <span className="hn-top__group">{t(`groups.${activeGroup.key}`)}</span> : null}
            <h1>{t(`nav.${active.key}`)}</h1>
          </div>
          <CommandPalette groups={groups} />
          <div className="ptop__sp"><FeedbackButton /><ThemeToggle variant="square" /><LanguageSwitcher />
            <Link className="ptop__user" href={session ? `/portal/${session.role}/profile` : "/login"} title={session?.name || ""}>
              <span className="ptop__av">{initials(session?.name || "I")}</span><span>{session?.name || t("staff")}</span>
            </Link>
          </div>
        </header>
        <div className="pbody"><div className="pbody__in hn-page" key={pathname}>{children}</div></div>
        <nav className="hn-tabs" aria-label={t("menu")}>
          {tabs.map((item) => {
            const on = active.href === item.href;
            const c = count(item);
            return (
              <Link key={item.href} href={item.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
                <span className="hn-tabs__i"><item.Icon />{c ? <i>{c > 9 ? "9+" : c}</i> : null}</span>
                <span>{t(`nav.${item.key}`)}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawerPath(pathname)} className={tabs.some((x) => x.href === active.href) ? "" : "on"}>
            <span className="hn-tabs__i"><IconMoreHorizontal /></span>
            <span>{t("more")}</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
