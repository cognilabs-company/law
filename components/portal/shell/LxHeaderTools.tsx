"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Globe, LayoutGrid, LogOut, Monitor, Moon, Search, Shield, Sun, User } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { setThemePref, useThemePref } from "@/lib/theme";
import { initials } from "@/lib/lawyers";
import { matchesSearch } from "@/lib/searchText";
import Menu, { menuSeparator, type MenuEntry } from "@/components/ui/Menu";
import type { NavItem } from "../portalNav";

// The cabinet header's right-hand tools (LexGo 1920 design): search pill,
// language select and the avatar menu. The help menu and bell are the
// existing SupportMenu and NotificationBell, dressed by shell1920.css.

export function HeaderSearch({ role, pages, label }: { role: string; pages: NavItem[]; label: (key: string) => string }) {
  const t = useTranslations("lxShell.search");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const box = useRef<HTMLFormElement>(null);
  const listId = useId();
  const seller = role !== "client";
  const term = q.trim();

  const hits = useMemo(() => (term ? pages.filter((p) => matchesSearch(label(p.key), term)).slice(0, 6) : pages.slice(0, 6)), [pages, term, label]);
  // The last row searches the role's main list with the typed text.
  const findHref = seller ? `/portal/${role}/cases?q=${encodeURIComponent(term)}` : `/portal/client/lawyers?q=${encodeURIComponent(term)}`;
  const rows = term ? hits.length + 1 : hits.length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (at < hits.length && open && hits[at]) return go(hits[at].href);
    if (term) go(findHref);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return setOpen(false);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    setOpen(true);
    setAt((v) => (rows ? (v + (e.key === "ArrowDown" ? 1 : rows - 1)) % rows : 0));
  };

  return (
    <form className="lx-search" ref={box} role="search" onSubmit={submit} data-ai-target="header:search">
      <Search aria-hidden="true" />
      <input
        type="search"
        value={q}
        placeholder={t(seller ? "seller" : "client")}
        aria-label={t("label")}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setAt(0);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />
      {open ? (
        <div className="lx-search__pop" id={listId} role="listbox" aria-label={t("pages")}>
          <span className="lx-search__h">{t("pages")}</span>
          {hits.length ? (
            hits.map((p, i) => (
              <button key={p.href} type="button" role="option" aria-selected={i === at} className={`lx-search__it${i === at ? " on" : ""}`} onMouseEnter={() => setAt(i)} onClick={() => go(p.href)}>
                <p.Icon />
                <span>{label(p.key)}</span>
              </button>
            ))
          ) : (
            <span className="lx-search__none">{t("noPages")}</span>
          )}
          {term ? (
            <button type="button" role="option" aria-selected={at === hits.length} className={`lx-search__it lx-search__find${at === hits.length ? " on" : ""}`} onMouseEnter={() => setAt(hits.length)} onClick={() => go(findHref)}>
              <Search />
              <span>{t(seller ? "findSeller" : "findClient", { q: term })}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function LangSelect() {
  const t = useTranslations("lxShell.lang");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const items: MenuEntry[] = routing.locales.map((code) => ({
    key: code,
    label: t(code),
    checked: code === locale,
    onSelect: () => {
      if (code !== locale) router.replace(pathname, { locale: code });
    },
  }));
  return (
    <Menu
      items={items}
      label={t("label")}
      triggerLabel={`${t("label")}: ${t(locale)}`}
      triggerClassName="lx-pill lx-lang"
      text={
        <>
          <Globe aria-hidden="true" className="lx-lang__g" />
          <span className="lx-lang__t">{t(locale)}</span>
        </>
      }
      align="end"
      aiId="header.language"
    />
  );
}

export function AccountMenu({
  name,
  profileHref,
  isAdmin,
  onDesktop,
  onLogout,
}: {
  name: string;
  profileHref: string;
  isAdmin: boolean;
  onDesktop?: () => void;
  onLogout: () => void;
}) {
  const t = useTranslations("lxShell.menu");
  const pref = useThemePref();
  const items: MenuEntry[] = [
    { key: "who", label: name, disabled: true, icon: <User /> },
    menuSeparator("s0"),
    { key: "profile", label: t("profile"), href: profileHref, icon: <User />, aiId: "header.menu.profile" },
    {
      key: "theme",
      label: t("theme"),
      icon: pref === "dark" ? <Moon /> : pref === "light" ? <Sun /> : <Monitor />,
      items: [
        { key: "light", label: t("light"), icon: <Sun />, checked: pref === "light", onSelect: () => setThemePref("light") },
        { key: "dark", label: t("dark"), icon: <Moon />, checked: pref === "dark", onSelect: () => setThemePref("dark") },
        { key: "system", label: t("system"), icon: <Monitor />, checked: pref === "system", onSelect: () => setThemePref("system") },
      ],
    },
    ...(onDesktop ? [{ key: "desk", label: t("desktop"), icon: <LayoutGrid />, onSelect: onDesktop } satisfies MenuEntry] : []),
    ...(isAdmin ? [{ key: "admin", label: t("admin"), icon: <Shield />, href: "/admin" } satisfies MenuEntry] : []),
    menuSeparator("s1"),
    { key: "logout", label: t("logout"), icon: <LogOut />, danger: true, onSelect: onLogout, aiId: "header.menu.logout" },
  ];
  return (
    <Menu
      items={items}
      label={t("label")}
      triggerLabel={`${initials(name || "U")} · ${t("label")}`}
      triggerClassName="lx-pill lx-avatar"
      caret={false}
      text={
        <>
          <span className="lx-avatar__av" aria-hidden="true">{initials(name || "U")}</span>
          <ChevronDown aria-hidden="true" className="lx-avatar__cv" />
        </>
      }
      align="end"
      aiId="header.account-menu"
    />
  );
}

// A link back to the cabinet's dashboard, used by the breadcrumb.
export function Crumb({ href, children }: { href: string; children: string }) {
  return <Link href={href}>{children}</Link>;
}
