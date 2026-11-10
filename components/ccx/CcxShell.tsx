"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { IconLogo } from "@/components/icons";
import FeedbackButton from "@/components/internal/feedback/FeedbackButton";
import { initials } from "@/lib/lawyers";
import { applyTheme, readThemePref } from "@/lib/theme";
import { useCcxPrefs, setCcxPrefs } from "@/lib/ccx/prefs";
import { useCcShift } from "@/lib/callcenter/ccOperator";
import { useCan } from "@/lib/useCan";
import { VIEW_NAV_KEY } from "@/lib/ccx/routes";
import { useSearchParams } from "next/navigation";
import CcxBackground from "./CcxBackground";
import CcxIntro, { introSeen } from "./CcxIntro";
import CcxAppearance from "./CcxAppearance";
import CcxSearch, { type CcxSearchHandle } from "./CcxSearch";
import CcxStatus from "./CcxStatus";
import { ccxMono, ccxSans } from "./fonts";
import { IcAppearance, IcBuilding, IcCheck, IcChevron, IcLogout, IcMoon, IcSearch, IcSun, IcUser, navIcon } from "./icons";
import "./ccx.css";

export type CcxNavItem = { href: string; key: string };

const CALM = "(prefers-reduced-motion: reduce)";
const subscribeCalm = (cb: () => void) => {
  const mq = window.matchMedia(CALM);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const readCalm = () => window.matchMedia(CALM).matches;
const serverCalm = () => false;
const ORDER = ["callCenter", "crm", "supportTickets", "meetings", "teamTasks", "callAnalytics"];
const rank = (key: string) => {
  const i = ORDER.indexOf(key);
  return i < 0 ? ORDER.length : i;
};

type Props = {
  nav: CcxNavItem[];
  activeHref: string;
  title: string;
  openCount: number | null;
  userId: string;
  name: string;
  roleBadge: string;
  profileHref: string;
  hrm: boolean;
  onLogout: () => void;
  extra?: ReactNode;
  children: ReactNode;
};

// How many shells are mounted right now: during a language switch the old
// and the new one overlap for a moment.
let shellsMounted = 0;

export default function CcxShell({ nav: navIn, activeHref, title, openCount, userId, name, roleBadge, profileHref, hrm, onLogout, extra, children }: Props) {
  const t = useTranslations("admin");
  const tx = useTranslations("admin.ccx");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = pathname === "/admin/call-center" ? (params.get("view") ?? "") : "";
  const viewKey = VIEW_NAV_KEY[view];
  // The profile is opened from the avatar menu, not a tab: no tab is lit
  // there (the «Hozir» tab used to look selected on the profile).
  const onProfile = view === "profile";
  const isOn = (n: CcxNavItem) => !onProfile && (viewKey ? n.key === viewKey : n.href === activeHref);
  const prefs = useCcxPrefs();
  const shift = useCcShift();
  const nav = [...navIn].sort((a, b) => rank(a.key) - rank(b.key));
  const [intro, setIntro] = useState(() => !introSeen(userId));
  const [entered, setEntered] = useState(false);
  const [look, setLook] = useState(false);
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Client lookup (GET /call-center/clients/search): call-center operators
  // (the call_center role or callcenter.access) or users.manage. The duty
  // lawyer has neither, so no search box, button or Ctrl+K for them.
  const canDo = useCan();
  const canSearch = canDo(["callcenter.access", "users.manage"], { roles: ["call_center"] });
  const calm = useSyncExternalStore(subscribeCalm, readCalm, serverCalm);
  const search = useRef<CcxSearchHandle>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  const tabsBox = useRef<HTMLElement>(null);
  const ink = useRef<HTMLSpanElement>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const want = prefs.theme;
    const apply = () => {
      if (root.getAttribute("data-theme") !== want) {
        root.setAttribute("data-theme", want);
        root.style.colorScheme = want;
      }
    };
    root.setAttribute("data-opx", "1");
    root.setAttribute("data-opx-theme", prefs.theme);
    root.setAttribute("data-opx-bg", prefs.bg);
    root.setAttribute("data-opx-motion", prefs.motion ? "on" : "off");
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, [prefs.theme, prefs.bg, prefs.motion]);

  // A layout effect, like the one above that sets <html data-opx>: on a
  // language switch the old shell is torn down in the same commit the new one
  // mounts. As a passive effect this cleanup ran after the new shell had set
  // its attributes and stripped them (every colour variable) and the fonts
  // from the shell left on screen.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const fonts = [ccxSans.variable, ccxMono.variable];
    body.classList.add(...fonts);
    shellsMounted += 1;
    return () => {
      shellsMounted -= 1;
      if (shellsMounted > 0) return;
      body.classList.remove(...fonts);
      ["data-opx", "data-opx-theme", "data-opx-bg", "data-opx-motion"].forEach((a) => root.removeAttribute(a));
      applyTheme(readThemePref());
    };
  }, []);

  useLayoutEffect(() => {
    const box = tabsBox.current;
    const bar = ink.current;
    if (!box || !bar) return;
    const place = () => {
      const on = box.querySelector<HTMLElement>(".opx-tab.is-on");
      if (!on) {
        bar.style.opacity = "0";
        return;
      }
      bar.style.opacity = "1";
      bar.style.width = `${on.offsetWidth}px`;
      bar.style.transform = `translateX(${on.offsetLeft}px)`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => ro.disconnect();
  }, [activeHref, viewKey, onProfile, nav.length, locale]);

  useEffect(() => {
    if (intro) return;
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [intro]);

  useEffect(() => {
    if (!canSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        window.requestAnimationFrame(() => search.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSearch]);

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (!menuBox.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  useEffect(() => {
    if (!stage) return;
    const at = document.activeElement;
    if (at && at !== document.body && at !== document.documentElement && !at.closest(".opx-top, .opx-mtabs")) return;
    stage.focus({ preventScroll: true });
  }, [pathname, stage]);

  const introDone = useCallback(() => setIntro(false), []);
  const closeLook = useCallback(() => setLook(false), []);
  const label = (key: string) => (tx.has(`nav.${key}`) ? tx(`nav.${key}`) : t(`nav.${key}`));
  const motion = prefs.motion && !calm;
  const badge = (key: string) => (key === "callCenter" && openCount ? <b className="opx-tab__n opx-num">{openCount > 99 ? "99+" : openCount}</b> : null);

  return (
    <div className={`opx ${ccxSans.variable} ${ccxMono.variable}${intro ? " is-waiting" : ""}${entered ? " is-entered" : ""}${motion ? "" : " is-calm"}`}>
      <CcxBackground theme={prefs.theme} bg={prefs.bg} />

      <header className="opx-top">
        <Link href="/admin/call-center" className="opx-top__brand" aria-label={tx("home")}>
          <span className="opx-top__logo">
            <IconLogo />
          </span>
          <b>LexGo</b>
        </Link>

        <nav className="opx-tabs" aria-label={t("menu")} ref={tabsBox}>
          <span className="opx-tabs__ink" ref={ink} aria-hidden="true" />
          {nav.map((n) => {
            const Icon = navIcon(n.key);
            const on = isOn(n);
            return (
              <Link key={n.href} href={n.href} className={`opx-tab${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined} aria-label={label(n.key)} title={label(n.key)} data-ai-target={`nav:${n.key}`}>
                <Icon size={18} />
                <span>{label(n.key)}</span>
                {badge(n.key)}
              </Link>
            );
          })}
        </nav>

        <div className={`opx-top__search${searchOpen ? " is-open" : ""}`}>
          {canSearch ? <CcxSearch ref={search} enabled /> : null}
        </div>

        <div className="opx-top__tools">
          {canSearch ? (
            <button
              type="button"
              className="opx-ibtn opx-top__find"
              onClick={() => {
                setSearchOpen((v) => !v);
                window.requestAnimationFrame(() => search.current?.focus());
              }}
              aria-label={tx("search.placeholder")}
            >
              <IcSearch size={19} />
            </button>
          ) : null}
          <CcxStatus />
          <div className="opx-me" ref={menuBox}>
            <button type="button" className="opx-me__btn" data-on={onProfile || undefined} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((v) => !v)} aria-label={tx("account")}>
              <span className="opx-me__av">
                {initials(name || "A")}
                <i className="opx-me__live" data-st={shift.status} aria-hidden="true" />
              </span>
              <IcChevron size={16} className="opx-me__chev" />
            </button>
            {menu ? (
              <div className="opx-me__menu" role="menu">
                <div className="opx-me__who">
                  <span className="opx-me__big">{initials(name || "A")}</span>
                  <span>
                    <b>{name || roleBadge}</b>
                    <small>{roleBadge}</small>
                  </span>
                </div>
                <Link href={profileHref} role="menuitem" className="opx-me__item" onClick={() => setMenu(false)}>
                  <IcUser size={18} />
                  {tx("profile")}
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="opx-me__item"
                  onClick={() => {
                    setMenu(false);
                    setLook(true);
                  }}
                >
                  <IcAppearance size={18} />
                  {tx("look.open")}
                </button>
                <button type="button" role="menuitem" className="opx-me__item" onClick={() => setCcxPrefs({ theme: prefs.theme === "dark" ? "light" : "dark" })}>
                  {prefs.theme === "dark" ? <IcSun size={18} /> : <IcMoon size={18} />}
                  {prefs.theme === "dark" ? tx("look.toLight") : tx("look.toDark")}
                </button>
                <div className="opx-me__langs" role="group" aria-label={tx("language")}>
                  {routing.locales.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={`opx-me__lang${code === locale ? " is-on" : ""}`}
                      aria-pressed={code === locale}
                      onClick={() => {
                        setMenu(false);
                        if (code === locale) return;
                        // Keep ?tab= / ?view= so the operator stays on the same queue.
                        const qs = params.toString();
                        router.replace(qs ? `${pathname}?${qs}` : pathname, { locale: code });
                      }}
                    >
                      {code === locale ? <IcCheck size={14} /> : null}
                      {code.toUpperCase()}
                    </button>
                  ))}
                </div>
                {hrm ? (
                  <Link href="/internal" role="menuitem" className="opx-me__item" onClick={() => setMenu(false)}>
                    <IcBuilding size={18} />
                    HRM
                  </Link>
                ) : null}
                <div className="opx-me__fb">
                  <FeedbackButton />
                </div>
                <button type="button" role="menuitem" className="opx-me__item opx-me__item--out" onClick={onLogout}>
                  <IcLogout size={18} />
                  {t("logout")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="opx-stage pbody" ref={setStage} tabIndex={-1}>
        <h1 className="opx-sr" data-ai-target="ai-help:current-page">
          {title}
        </h1>
        <div className="opx-stage__in pbody__in">{children}</div>
      </div>

      <nav className="opx-mtabs" aria-label={t("menu")}>
        {nav.map((n) => {
          const Icon = navIcon(n.key);
          const on = isOn(n);
          return (
            <Link key={n.href} href={n.href} className={`opx-mtab${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined}>
              <span className="opx-mtab__ic">
                <Icon size={20} />
                {badge(n.key)}
              </span>
              <span className="opx-mtab__l">{label(n.key)}</span>
            </Link>
          );
        })}
      </nav>

      {extra}
      {look ? <CcxAppearance prefs={prefs} onClose={closeLook} /> : null}
      {intro ? <CcxIntro userId={userId} name={name} calm={!motion} onDone={introDone} /> : null}
    </div>
  );
}
