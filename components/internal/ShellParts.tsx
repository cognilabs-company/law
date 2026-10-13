"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { hasAdminAccess, isCallCenterUser, useAuth } from "@/lib/auth";
import { notifLink } from "@/lib/notifications";
import { listNotificationsRich, type RichNotification } from "@/lib/services/notify";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/services/backend";
import { refreshUnread, subscribeUnread, unreadCount } from "@/lib/unread";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { shortDateTime } from "@/lib/date";
import { initials } from "@/lib/lawyers";
import { NOTIF_READ_EVENT } from "@/components/portal/NotificationsPanel";
import {
  IconAlert,
  IconBell,
  IconCheck,
  IconExternal,
  IconGrid,
  IconHelpCircle,
  IconLogout,
  IconMonitor,
  IconMoon,
  IconShieldCheck,
  IconSun,
  IconUser,
  IconUsers,
} from "@/components/icons";

// The HRM top bar's pieces, after MedControl HR's (web/src/app/layout):
// the app switcher, the notifications bell, the user menu with the theme,
// the keyboard shortcuts dialog, the page-change progress line and the
// offline notice.

// True while the focus is in something the user types into.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return !["button", "checkbox", "radio", "submit", "reset", "range", "file", "color"].includes((target as HTMLInputElement).type);
}

// A layer anchored to its trigger: closes on a press outside, on Esc (focus
// back to the trigger) and when the page changes.
function Pop({ label, trigger, children, width = 300, align = "end" }: { label: string; trigger: (p: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog" | "menu"; "aria-controls": string }) => ReactNode; children: (close: () => void) => ReactNode; width?: number; align?: "start" | "end" }) {
  const [openAt, setOpenAt] = useState<string | null>(null);
  const pathname = usePathname();
  const open = openAt === pathname;
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  // Closing hands the focus back to the trigger once the layer is gone.
  const [refocus, setRefocus] = useState(0);
  const close = useCallback(() => {
    setOpenAt(null);
    setRefocus((n) => n + 1);
  }, []);
  useEffect(() => {
    if (refocus) (box.current?.querySelector("button,a") as HTMLElement | null)?.focus();
  }, [refocus]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpenAt(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    requestAnimationFrame(() => (box.current?.querySelector(`#${CSS.escape(id)} [data-autofocus], #${CSS.escape(id)} button, #${CSS.escape(id)} a`) as HTMLElement | null)?.focus());
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [open, close, id]);
  return (
    <div className="hn-pop" ref={box}>
      {trigger({ onClick: () => setOpenAt(open ? null : pathname), "aria-expanded": open, "aria-haspopup": "dialog", "aria-controls": id })}
      {open ? (
        <div id={id} className={`hn-pop__layer hn-pop__layer--${align}`} style={{ width }} role="dialog" aria-label={label} data-overlay>
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

export function AppSwitcher() {
  const t = useTranslations("internal.shell");
  const { session } = useAuth();
  const role = session?.role ?? "client";
  const admin = hasAdminAccess(session);
  return (
    <Pop
      label={t("apps.title")}
      align="start"
      width={300}
      trigger={(p) => (
        <button type="button" className="hn-ib" aria-label={t("apps.title")} title={t("apps.title")} {...p}>
          <IconGrid />
        </button>
      )}
    >
      {() => (
        <div className="hn-apps">
          <b className="hn-apps__h">{t("apps.title")}</b>
          <Link href={`/portal/${role}`} className="hn-app">
            <span className="hn-app__i hn-app__i--portal"><IconUser /></span>
            <span className="hn-app__t"><b>{t("apps.portal")}</b><small>{t("apps.portalHint")}</small></span>
            <IconExternal className="hn-app__go" />
          </Link>
          {admin ? (
            <Link href="/admin" className="hn-app">
              <span className="hn-app__i hn-app__i--admin"><IconShieldCheck /></span>
              <span className="hn-app__t"><b>{t("apps.admin")}</b><small>{t("apps.adminHint")}</small></span>
              <IconExternal className="hn-app__go" />
            </Link>
          ) : null}
          <span className="hn-app" aria-current="true">
            <span className="hn-app__i hn-app__i--hr"><IconUsers /></span>
            <span className="hn-app__t"><b>{t("apps.hr")}</b><small>{t("apps.hrHint")}</small></span>
            <span className="hn-app__now">{t("apps.current")}</span>
          </span>
        </div>
      )}
    </Pop>
  );
}

function useUnread(): number {
  return useSyncExternalStore(
    (fn) => {
      const off = subscribeUnread(() => fn());
      window.addEventListener(NOTIF_READ_EVENT, fn);
      return () => {
        off();
        window.removeEventListener(NOTIF_READ_EVENT, fn);
      };
    },
    unreadCount,
    () => 0,
  );
}

export function useUnreadNotifications(enabled: boolean): number {
  const n = useUnread();
  useEffect(() => {
    if (enabled) refreshUnread();
  }, [enabled]);
  return n;
}

export function NotificationsBell() {
  const t = useTranslations("internal.shell");
  const count = useUnread();
  return (
    <Pop
      label={t("notif.title")}
      width={380}
      trigger={(p) => (
        <button type="button" className="hn-ib hn-bell" aria-label={count ? t("notif.titleN", { n: count }) : t("notif.title")} title={t("notif.title")} {...p}>
          <IconBell />
          {count ? <span className="hn-ib__badge">{count > 99 ? "99+" : count}</span> : null}
        </button>
      )}
    >
      {(close) => <NotificationsPanel close={close} />}
    </Pop>
  );
}

function NotificationsPanel({ close }: { close: () => void }) {
  const t = useTranslations("internal.shell");
  const locale = useLocale();
  const router = useRouter();
  const { session } = useAuth();
  const [items, setItems] = useState<RichNotification[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    listNotificationsRich({ limit: 8 })
      .then((list) => alive && setItems(list.slice(0, 8)))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);
  const role = session?.role ?? "";
  const open = (n: RichNotification) => {
    if (!n.read) {
      void Promise.all(n.ids.map((id) => markNotificationRead(id).catch(() => undefined))).then(() => window.dispatchEvent(new Event(NOTIF_READ_EVENT)));
      setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? cur);
    }
    const to = notifLink(n.event, n.category, n.data, role, hasAdminAccess(session), isCallCenterUser(session));
    close();
    if (to) router.push(to);
  };
  const readAll = () => {
    void markAllNotificationsRead().then(() => window.dispatchEvent(new Event(NOTIF_READ_EVENT))).catch(() => undefined);
    setItems((cur) => cur?.map((x) => ({ ...x, read: true })) ?? cur);
  };
  return (
    <div className="hn-notif">
      <div className="hn-notif__h">
        <b>{t("notif.title")}</b>
        <button type="button" className="btn btn--ghost btn--sm" onClick={readAll} disabled={!items?.some((x) => !x.read)}>
          <IconCheck />
          {t("notif.markAll")}
        </button>
      </div>
      {err ? (
        <p className="hn-notif__none"><IconAlert /> {t("notif.error")}</p>
      ) : !items ? (
        <div className="hn-notif__sk" aria-hidden><span /><span /><span /></div>
      ) : !items.length ? (
        <p className="hn-notif__none">{t("notif.empty")}</p>
      ) : (
        <ul className="hn-notif__list">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" className={`hn-notif__i${n.read ? " is-read" : ""}`} onClick={() => open(n)}>
                <span className="hn-notif__dot" aria-hidden />
                <span className="hn-notif__t">
                  <b>{n.title}</b>
                  {n.body ? <span>{n.body}</span> : null}
                  <small>{shortDateTime(n.createdAt, locale)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="hn-notif__f">
        <Link href="/internal/me/notifications" className="btn btn--line btn--sm" onClick={close}>
          {t("notif.viewAll")}
        </Link>
      </div>
    </div>
  );
}

export function UserMenu({ onHelp }: { onHelp: () => void }) {
  const t = useTranslations("internal.shell");
  const { session, logout } = useAuth();
  const theme = useThemePref();
  const name = session?.name || t("user.staff");
  const themes: [ThemePref, typeof IconSun][] = [
    ["light", IconSun],
    ["dark", IconMoon],
    ["system", IconMonitor],
  ];
  return (
    <Pop
      label={t("user.menu")}
      width={250}
      trigger={(p) => (
        <button type="button" className="hn-user" aria-label={t("user.menuOf", { name })} {...p} aria-haspopup="menu">
          <span className="hn-user__av">{initials(name || "I")}</span>
          <span className="hn-user__n">{name}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="hn-menu" role="menu" aria-label={t("user.menu")}>
          <div className="hn-menu__h">
            <span className="hn-user__av">{initials(name || "I")}</span>
            <span><b>{name}</b>{session?.phone ? <small>{session.phone}</small> : null}</span>
          </div>
          <Link href="/internal/me" role="menuitem" className="hn-menu__i" onClick={close}>
            <IconUser />
            {t("user.profile")}
          </Link>
          <button type="button" role="menuitem" className="hn-menu__i" onClick={() => { close(); onHelp(); }}>
            <IconHelpCircle />
            {t("shortcuts.title")}
            <kbd>?</kbd>
          </button>
          <span className="hn-menu__sep" role="separator" />
          <span className="hn-menu__cap">{t("theme.label")}</span>
          {themes.map(([k, I]) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={theme === k} className="hn-menu__i" onClick={() => setThemePref(k)}>
              <I />
              {t(`theme.${k}`)}
              {theme === k ? <IconCheck className="hn-menu__ck" /> : null}
            </button>
          ))}
          <span className="hn-menu__sep" role="separator" />
          <button type="button" role="menuitem" className="hn-menu__i is-danger" onClick={() => { close(); logout(); }}>
            <IconLogout />
            {t("user.logout")}
          </button>
        </div>
      )}
    </Pop>
  );
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("internal.shell");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const mod = isMac() ? "⌘" : "Ctrl";
  const rows: [string[], string][] = [
    [[mod, "K"], "search"],
    [["/"], "searchSlash"],
    [["↑", "↓"], "pick"],
    [["Enter"], "open"],
    [["Esc"], "close"],
    [["?"], "help"],
  ];
  return createPortal(
    <div className="hn-dlg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="hn-dlg__box" role="dialog" aria-modal="true" aria-label={t("shortcuts.title")} tabIndex={-1} ref={ref} data-overlay>
        <header>
          <b>{t("shortcuts.title")}</b>
          <button type="button" className="hn-ib" onClick={onClose} aria-label={t("close")}>×</button>
        </header>
        <dl className="hn-keys">
          {rows.map(([keys, label]) => (
            <div key={label}>
              <dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
              <dd>{t(`shortcuts.${label}`)}</dd>
            </div>
          ))}
        </dl>
        <p className="hn-keys__note">{t("shortcuts.boardNote")}</p>
      </div>
    </div>,
    document.body,
  );
}

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

export function OfflineBanner() {
  const t = useTranslations("internal.shell");
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div className="hn-offline" role="status">
      <IconAlert />
      {t("offline")}
    </div>
  );
}

// A thin line while a page of the workspace is on its way: shown from the
// press on an internal link until the new path is on screen.
export function NavProgress() {
  const t = useTranslations("internal.shell");
  const pathname = usePathname();
  const [from, setFrom] = useState<string | null>(null);
  const [seen, setSeen] = useState(pathname);
  const here = useRef(pathname);
  useEffect(() => {
    here.current = pathname;
  }, [pathname]);
  // The new page is on screen: the line goes.
  if (seen !== pathname) {
    setSeen(pathname);
    setFrom(null);
  }
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setFrom(here.current);
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
  useEffect(() => {
    if (from === null) return;
    const h = setTimeout(() => setFrom(null), 15000);
    return () => clearTimeout(h);
  }, [from]);
  return from !== null && from === pathname ? <div className="hn-progress" role="progressbar" aria-label={t("loading")} /> : null;
}

export function SkipLink() {
  const t = useTranslations("internal.shell");
  return (
    <a href="#hn-content" className="hn-skip">
      {t("skip")}
    </a>
  );
}
