"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { initials } from "@/lib/lawyers";
import { fmtDate, localDay } from "@/lib/date";
import type { Role } from "@/lib/auth";
import {
  IconArrowRight,
  IconBell,
  IconChevronLeft,
  IconClose,
  IconExternal,
  IconFolder,
  IconGrid,
  IconInfo,
  IconLanguage,
  IconList,
  IconLock,
  IconLogo,
  IconLogout,
  IconMoon,
  IconPower,
  IconRefresh,
  IconSearch,
  IconShield,
  IconSparkle,
  IconSun,
  IconTag,
} from "@/components/icons";
import MarketWatcher from "@/components/marketplace/MarketWatcher";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import DeskWindow, { MIN_H, MIN_W, type Area, type Snap, type Win } from "./DeskWindow";
import Wallpaper, { WALLPAPERS, type WallpaperId } from "./Wallpaper";
import { AppTile, FolderTile } from "./AppIcon";
import { FOLDERS, RELATED, folderOf, type DeskApp, type FolderId } from "./apps";
import { DESK_FRAME, setDeskMode } from "./deskMode";

const AiSystemAssistant = dynamic(() => import("../AiSystemAssistant"), { ssr: false });

type IconSize = "lg" | "md" | "sm";
type Sort = "default" | "name" | "type";
type Saved = { wallpaper: WallpaperId; icons: IconSize; sort: Sort; pinned: string[]; wins: Omit<Win, "id" | "z" | "tick">[] };
type Item = { kind: "app"; id: string; app: DeskApp } | { kind: "folder"; id: FolderId; apps: DeskApp[] };
type Menu = { at: { x: number; y: number }; items: MenuItem[]; label: string };
type Note = { title: string; rows: [string, string][]; icon: ReactNode };

const STORE = "lexgo_desk_state";
const DEFAULT_PINNED = ["dashboard", "cases", "calendar", "chat", "files"];
const FIRST = ["dashboard", "cases", "tasks", "calendar", "clients", "chat", "ai", "assistant"];
const PHONE = 760;
let seq = 0;
const newId = () => `w${Date.now().toString(36)}${(seq++).toString(36)}`;

// The lawyer's cabinet as a computer desktop: the sections are apps and
// folders on a wallpaper, opened (double-click, Enter, or from the taskbar
// and the Start menu) as windows that hold the real pages — several at once,
// each movable, resizable, snapped to a half of the screen or filling it,
// minimised to the taskbar. Right-click everywhere: the desktop (icon size,
// sorting, wallpaper, show the desktop), an icon (open, the apps used with
// it, pin, properties), a window's title bar and a taskbar button.
export default function DesktopShell({ role, apps, name, isAdmin, onLogout }: { role: Role; apps: DeskApp[]; name: string; isAdmin: boolean; onLogout: () => void }) {
  const t = useTranslations("portal.desk");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const theme = useThemePref();
  const deskRef = useRef<HTMLDivElement>(null);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const [area, setArea] = useState<Area>({ w: 1200, h: 700 });
  const [wins, setWins] = useState<Win[]>([]);
  const [active, setActive] = useState("");
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [wallpaper, setWallpaper] = useState<WallpaperId>("bloom");
  const [icons, setIcons] = useState<IconSize>("md");
  const [sort, setSort] = useState<Sort>("default");
  const [pinned, setPinned] = useState<string[]>(DEFAULT_PINNED);
  const [restored, setRestored] = useState(false);
  const [selected, setSelected] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [start, setStart] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<Snap>("");
  const [note, setNote] = useState<Note | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [now, setNow] = useState(0);
  const phone = area.w < PHONE;

  const byKey = useMemo(() => new Map(apps.map((a) => [a.key, a])), [apps]);
  const folderApps = useCallback((id: FolderId) => (FOLDERS.find((f) => f.id === id)?.keys ?? []).map((k) => byKey.get(k)).filter((a): a is DeskApp => !!a), [byKey]);
  const folderName = (id: string) => t(`folder.${id}`);
  // The app a path inside a window belongs to: the longest href it starts with.
  const appAt = useCallback((path: string) => [...apps].sort((a, b) => b.href.length - a.href.length).find((a) => path === a.href || path.startsWith(`${a.href}/`)), [apps]);

  // ── the clock, the desk's size ────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const h = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(h);
    };
  }, []);
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setArea({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── what this browser remembers ───────────────────────────────────────────
  useEffect(() => {
    const h = setTimeout(() => {
      let saved: Partial<Saved> = {};
      try {
        saved = JSON.parse(localStorage.getItem(STORE) || "{}") as Partial<Saved>;
      } catch {
        /* nothing kept, or storage blocked */
      }
      if (saved.wallpaper && (WALLPAPERS as readonly string[]).includes(saved.wallpaper)) setWallpaper(saved.wallpaper);
      if (saved.icons === "lg" || saved.icons === "md" || saved.icons === "sm") setIcons(saved.icons);
      if (saved.sort === "name" || saved.sort === "type" || saved.sort === "default") setSort(saved.sort);
      if (Array.isArray(saved.pinned)) setPinned(saved.pinned.filter((k) => typeof k === "string"));
      const keep = (Array.isArray(saved.wins) ? saved.wins : []).filter((w) => w && (w.kind === "folder" ? FOLDERS.some((f) => f.id === w.key) : byKey.has(w.key)));
      let opened = keep.map((w, i) => ({ ...w, id: newId(), z: i + 1, tick: 0, href: w.kind === "app" ? w.path || w.href : w.href }) as Win);
      // A page asked for by its address opens in its own window.
      const here = appAt(pathname);
      if (here && here.key !== "dashboard" && !opened.some((w) => w.key === here.key)) {
        opened = [...opened, { id: newId(), kind: "app", key: here.key, href: pathname, path: pathname, x: 80, y: 30, w: 1000, h: 680, z: opened.length + 1, min: false, snap: "max", tick: 0 }];
      }
      setWins(opened);
      const top = opened.filter((w) => !w.min).at(-1);
      if (top) setActive(top.id);
      setRestored(true);
    }, 0);
    return () => clearTimeout(h);
    // Read once, when the desktop first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored) return;
    const data: Saved = { wallpaper, icons, sort, pinned, wins: wins.map(({ kind, key, href, path, x, y, w, h, min, snap }) => ({ kind, key, href, path, x, y, w, h, min, snap })) };
    try {
      localStorage.setItem(STORE, JSON.stringify(data));
    } catch {
      /* storage blocked: the desk lasts for this visit */
    }
  }, [restored, wallpaper, icons, sort, pinned, wins]);

  // A page inside a window tells where it has gone, so the title follows.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; path?: string } | null;
      if (!d || d.type !== "lexgo-desk:path" || typeof d.path !== "string") return;
      for (const [id, frame] of frames.current) {
        if (frame.contentWindow === e.source) setWins((ws) => ws.map((w) => (w.id === id ? { ...w, path: d.path! } : w)));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // ── windows ───────────────────────────────────────────────────────────────
  const topZ = () => wins.reduce((m, w) => Math.max(m, w.z), 0) + 1;
  const focus = (id: string) => {
    setActive(id);
    setWins((ws) => {
      const z = ws.reduce((m, w) => Math.max(m, w.z), 0) + 1;
      return ws.map((w) => (w.id === id ? { ...w, z: w.z === z - 1 ? w.z : z, min: false } : w));
    });
  };
  const patch = (id: string, p: Partial<Win>) => {
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w)));
    if (p.min) setActive((a) => (a === id ? "" : a));
  };
  const close = (id: string) => {
    frames.current.delete(id);
    setWins((ws) => ws.filter((w) => w.id !== id));
    setActive((a) => (a === id ? "" : a));
  };
  const place = (n: number) => {
    const w = Math.max(MIN_W, Math.min(1120, area.w - 120));
    const h = Math.max(MIN_H, Math.min(760, area.h - 60));
    const off = (n % 6) * 28;
    // Beside the desktop's icons when there is room for both.
    const left = area.w - w > 420 ? 220 : Math.round((area.w - w) / 2);
    return { x: Math.max(0, Math.min(area.w - w, left + off)), y: 16 + off, w, h };
  };
  const locked = (app: DeskApp) =>
    setNote({ title: app.label, icon: <AppTile app={app} size="sm" />, rows: [[t("props.status"), t("props.locked")]] });
  const openApp = (key: string, fresh = false) => {
    const app = byKey.get(key);
    if (!app) return;
    if (app.locked) return locked(app);
    const have = wins.find((w) => w.kind === "app" && w.key === key);
    if (have && !fresh) return focus(have.id);
    const id = newId();
    setWins((ws) => [...ws, { id, kind: "app", key, href: app.href, path: app.href, ...place(ws.length), z: topZ(), min: false, snap: phone ? "max" : "", tick: 0 }]);
    setActive(id);
    setStart(false);
  };
  const openFolder = (id: FolderId, inWin?: string) => {
    if (inWin) return patch(inWin, { key: id });
    const have = wins.find((w) => w.kind === "folder" && w.key === id);
    if (have) return focus(have.id);
    const wid = newId();
    const p = place(wins.length);
    setWins((ws) => [...ws, { id: wid, kind: "folder", key: id, href: "", path: "", ...p, w: Math.min(p.w, 860), h: Math.min(p.h, 540), z: topZ(), min: false, snap: phone ? "max" : "", tick: 0 }]);
    setActive(wid);
    setStart(false);
  };
  const openItem = (it: Item) => (it.kind === "app" ? openApp(it.app.key) : openFolder(it.id));
  const showDesktop = () => {
    setWins((ws) => ws.map((w) => ({ ...w, min: true })));
    setActive("");
  };
  const reload = (w: Win) => patch(w.id, { href: w.path || w.href, tick: w.tick + 1 });
  const newTab = (path: string) => window.open(`/${locale}${path}`, "_blank", "noopener");
  const togglePin = (key: string) => setPinned((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  // ── the desktop's items ───────────────────────────────────────────────────
  const items = useMemo<Item[]>(() => {
    const loose = apps.filter((a) => !folderOf(a.key)).sort((a, b) => (FIRST.indexOf(a.key) + 99) % 99 - (FIRST.indexOf(b.key) + 99) % 99);
    const list: Item[] = [...loose.map((app) => ({ kind: "app" as const, id: app.key, app })), ...FOLDERS.map((f) => ({ kind: "folder" as const, id: f.id, apps: folderApps(f.id) })).filter((f) => f.apps.length)];
    const label = (it: Item) => (it.kind === "app" ? it.app.label : t(`folder.${it.id}`));
    if (sort === "name") return [...list].sort((a, b) => label(a).localeCompare(label(b)));
    if (sort === "type") return [...list].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1));
    return list;
  }, [apps, folderApps, sort, t]);

  // ── menus ─────────────────────────────────────────────────────────────────
  const openMenu = (e: MouseEvent | { clientX: number; clientY: number }, label: string, list: MenuItem[]) => {
    if ("preventDefault" in e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setStart(false);
    setMenu({ at: { x: e.clientX, y: e.clientY }, items: list, label });
  };
  const relatedItems = (key: string): MenuItem[] => {
    const rel = (RELATED[key] ?? []).map((k) => byKey.get(k)).filter((a): a is DeskApp => !!a);
    if (!rel.length) return [];
    return [
      { sep: true, id: "s-rel" },
      { heading: t("menu.related"), id: "h-rel" },
      ...rel.map((a) => ({ id: `rel-${a.key}`, label: a.label, icon: <AppTile app={a} size="sm" />, disabled: a.locked, onSelect: () => openApp(a.key) })),
    ];
  };
  const appProps = (app: DeskApp) =>
    setNote({
      title: app.label,
      icon: <AppTile app={app} size="sm" />,
      rows: [
        [t("props.type"), t("props.app")],
        [t("props.where"), folderOf(app.key) ? `${t("desktop")} › ${folderName(folderOf(app.key)!)}` : t("desktop")],
        [t("props.address"), `lexgo.uz/${locale}${app.href}`],
        [t("props.related"), (RELATED[app.key] ?? []).map((k) => byKey.get(k)?.label).filter(Boolean).join(", ") || "—"],
        [t("props.status"), app.locked ? t("props.locked") : t("props.ready")],
      ],
    });
  const appMenu = (app: DeskApp): MenuItem[] => [
    { id: "open", label: t("menu.open"), icon: <IconArrowRight />, hint: "Enter", disabled: app.locked, onSelect: () => openApp(app.key) },
    { id: "new", label: t("menu.newWindow"), icon: <IconGrid />, disabled: app.locked, onSelect: () => openApp(app.key, true) },
    { id: "tab", label: t("menu.newTab"), icon: <IconExternal />, disabled: app.locked, onSelect: () => newTab(app.href) },
    ...relatedItems(app.key),
    { sep: true, id: "s-pin" },
    { id: "pin", label: pinned.includes(app.key) ? t("menu.unpin") : t("menu.pin"), icon: <IconTag />, onSelect: () => togglePin(app.key) },
    { id: "props", label: t("menu.properties"), icon: <IconInfo />, onSelect: () => appProps(app) },
  ];
  const folderMenu = (id: FolderId): MenuItem[] => [
    { id: "open", label: t("menu.open"), icon: <IconFolder />, hint: "Enter", onSelect: () => openFolder(id) },
    { sep: true, id: "s1" },
    { heading: t("menu.inside"), id: "h1" },
    ...folderApps(id).map((a) => ({ id: `in-${a.key}`, label: a.label, icon: <AppTile app={a} size="sm" />, disabled: a.locked, onSelect: () => openApp(a.key) })),
    { sep: true, id: "s2" },
    {
      id: "props",
      label: t("menu.properties"),
      icon: <IconInfo />,
      onSelect: () =>
        setNote({
          title: folderName(id),
          icon: <FolderTile apps={folderApps(id)} size="sm" />,
          rows: [
            [t("props.type"), t("props.folder")],
            [t("props.where"), t("desktop")],
            [t("props.contains"), t("props.items", { n: folderApps(id).length })],
          ],
        }),
    },
  ];
  const itemMenu = (it: Item) => (it.kind === "app" ? appMenu(it.app) : folderMenu(it.id));
  const deskMenu = (): MenuItem[] => [
    { heading: t("menu.view"), id: "h-view" },
    ...(["lg", "md", "sm"] as IconSize[]).map((s) => ({ id: `i-${s}`, label: t(`menu.icons.${s}`), checked: icons === s, onSelect: () => setIcons(s) })),
    { sep: true, id: "s1" },
    { heading: t("menu.sortBy"), id: "h-sort" },
    ...(["default", "name", "type"] as Sort[]).map((s) => ({ id: `o-${s}`, label: t(`menu.sort.${s}`), checked: sort === s, onSelect: () => setSort(s) })),
    { sep: true, id: "s2" },
    { heading: t("menu.wallpaper"), id: "h-wall" },
    ...WALLPAPERS.map((w) => ({ id: `w-${w}`, label: t(`wallpaper.${w}`), checked: wallpaper === w, onSelect: () => setWallpaper(w) })),
    { sep: true, id: "s3" },
    { id: "show", label: t("menu.showDesktop"), icon: <IconGrid />, disabled: !wins.some((w) => !w.min), onSelect: showDesktop },
    { id: "closeAll", label: t("menu.closeAll"), icon: <IconClose />, disabled: !wins.length, onSelect: () => setWins([]) },
    { sep: true, id: "s4" },
    { id: "classic", label: t("switchClassic"), icon: <IconList />, onSelect: () => setDeskMode("classic") },
  ];
  const winMenu = (w: Win): MenuItem[] => [
    { id: "max", label: w.snap === "max" ? t("win.restore") : t("win.maximize"), icon: <i className={w.snap === "max" ? "wd-glyph-restore" : "wd-glyph-max"} />, disabled: phone, onSelect: () => patch(w.id, { snap: w.snap === "max" ? "" : "max" }) },
    { id: "l", label: t("win.snapLeft"), icon: <IconChevronLeft />, disabled: phone, onSelect: () => patch(w.id, { snap: "l" }) },
    { id: "r", label: t("win.snapRight"), icon: <IconArrowRight />, disabled: phone, onSelect: () => patch(w.id, { snap: "r" }) },
    { id: "min", label: t("win.minimize"), icon: <i className="wd-glyph-min" />, onSelect: () => patch(w.id, { min: true }) },
    ...(w.kind === "app"
      ? ([
          { sep: true, id: "s1" },
          { id: "reload", label: t("win.reload"), icon: <IconRefresh />, onSelect: () => reload(w) },
          { id: "tab", label: t("menu.newTab"), icon: <IconExternal />, onSelect: () => newTab(w.path || w.href) },
        ] as MenuItem[])
      : []),
    { sep: true, id: "s2" },
    { id: "close", label: t("win.close"), icon: <IconClose />, danger: true, onSelect: () => close(w.id) },
  ];

  const langItems = (): MenuItem[] => routing.locales.map((l) => ({ id: `l-${l}`, label: t(`lang.${l}`), checked: l === locale, onSelect: () => l !== locale && router.replace(pathname, { locale: l }) }));
  const themeItems = (): MenuItem[] => (["light", "dark", "system"] as ThemePref[]).map((p) => ({ id: `t-${p}`, label: t(`theme.${p}`), checked: theme === p, onSelect: () => setThemePref(p) }));

  // ── taskbar ───────────────────────────────────────────────────────────────
  type Slot = { key: string; kind: "app" | "folder"; wins: Win[] };
  const slots: Slot[] = [
    ...pinned.filter((k) => byKey.has(k)).map((k) => ({ key: k, kind: "app" as const, wins: wins.filter((w) => w.kind === "app" && w.key === k) })),
    ...[...new Set(wins.filter((w) => !(w.kind === "app" && pinned.includes(w.key))).map((w) => `${w.kind}:${w.key}`))].map((s) => {
      const [kind, key] = s.split(":") as ["app" | "folder", string];
      return { key, kind, wins: wins.filter((w) => w.kind === kind && w.key === key) };
    }),
  ];
  const slotLabel = (s: Slot) => (s.kind === "folder" ? folderName(s.key) : (byKey.get(s.key)?.label ?? s.key));
  const pressSlot = (s: Slot) => {
    if (!s.wins.length) return s.kind === "app" ? openApp(s.key) : openFolder(s.key as FolderId);
    const top = [...s.wins].sort((a, b) => b.z - a.z)[0];
    if (top.id === active && !top.min) patch(top.id, { min: true });
    else focus(top.id);
  };
  const slotMenu = (s: Slot): MenuItem[] => {
    const app = s.kind === "app" ? byKey.get(s.key) : undefined;
    return [
      { heading: slotLabel(s), id: "h" },
      ...(app ? ([{ id: "new", label: t("menu.newWindow"), icon: <IconGrid />, disabled: app.locked, onSelect: () => openApp(app.key, true) }, ...relatedItems(app.key)] as MenuItem[]) : []),
      { sep: true, id: "s1" },
      ...(app ? ([{ id: "pin", label: pinned.includes(app.key) ? t("menu.unpin") : t("menu.pin"), icon: <IconTag />, onSelect: () => togglePin(app.key) }] as MenuItem[]) : []),
      ...(s.wins.length ? ([{ id: "close", label: s.wins.length > 1 ? t("menu.closeN", { n: s.wins.length }) : t("win.close"), icon: <IconClose />, danger: true, onSelect: () => s.wins.forEach((w) => close(w.id)) }] as MenuItem[]) : []),
    ];
  };

  // ── start menu ────────────────────────────────────────────────────────────
  const needle = query.trim().toLocaleLowerCase();
  const found = needle ? apps.filter((a) => a.label.toLocaleLowerCase().includes(needle)) : apps;
  const foundFolders = needle ? FOLDERS.filter((f) => folderName(f.id).toLocaleLowerCase().includes(needle)) : [];

  // ── keyboard on the desktop icons ─────────────────────────────────────────
  const onIconsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = items.findIndex((i) => i.id === selected);
    const it = items[at];
    if ((e.key === "Enter" || e.key === " ") && it) {
      e.preventDefault();
      openItem(it);
      return;
    }
    if ((e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) && it) {
      e.preventDefault();
      const r = (document.activeElement as HTMLElement | null)?.getBoundingClientRect();
      openMenu({ clientX: (r?.left ?? 0) + 40, clientY: (r?.top ?? 0) + 40 }, it.kind === "app" ? it.app.label : folderName(it.id), itemMenu(it));
      return;
    }
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = items[(Math.max(0, at) + step + items.length) % items.length];
    setSelected(next.id);
    (e.currentTarget.querySelector(`[data-item="${next.id}"]`) as HTMLElement | null)?.focus();
  };

  const clock = now ? new Date(now) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = clock ? `${pad(clock.getHours())}:${pad(clock.getMinutes())}` : "";
  const date = clock ? `${pad(clock.getDate())}.${pad(clock.getMonth() + 1)}.${clock.getFullYear()}` : "";
  const longDate = clock ? fmtDate(localDay(clock), locale) : "";
  const hour = clock?.getHours() ?? 12;
  const greet = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 18 ? "day" : "evening";
  const labels = { minimize: t("win.minimize"), maximize: t("win.maximize"), restore: t("win.restore"), close: t("win.close") };
  const appIcon = (w: Win) => {
    if (w.kind === "folder") return <FolderTile apps={folderApps(w.key as FolderId)} size="sm" />;
    const app = appAt(w.path) ?? byKey.get(w.key);
    return app ? <AppTile app={app} size="sm" /> : null;
  };
  const winTitle = (w: Win) => (w.kind === "folder" ? folderName(w.key) : (appAt(w.path)?.label ?? byKey.get(w.key)?.label ?? ""));

  return (
    <div className={`wd wd--${wallpaper}${busy ? " is-busy" : ""}`} onContextMenu={(e) => e.preventDefault()}>
      <MarketWatcher role={role} />
      <AiSystemAssistant open={aiOpen} onOpen={() => setAiOpen(true)} onClose={() => setAiOpen(false)} role={role} launcher="none" />
      <Wallpaper id={wallpaper} />

      <div
        ref={deskRef}
        className="wd-desk"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelected("");
        }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest(".wd-icons") === e.target) openMenu(e, t("desktop"), deskMenu());
        }}
      >
        <div className={`wd-icons wd-icons--${icons}`} role="listbox" aria-label={t("desktop")} aria-orientation="vertical" onKeyDown={onIconsKey} onContextMenu={(e) => e.target === e.currentTarget && openMenu(e, t("desktop"), deskMenu())}>
          {items.map((it, i) => {
            const label = it.kind === "app" ? it.app.label : folderName(it.id);
            const on = selected === it.id;
            return (
              <button
                key={`${it.kind}-${it.id}`}
                type="button"
                role="option"
                aria-selected={on}
                data-item={it.id}
                tabIndex={on || (!selected && i === 0) ? 0 : -1}
                className={`wd-icon${on ? " is-on" : ""}${it.kind === "app" && it.app.locked ? " is-locked" : ""}`}
                style={{ animationDelay: `${i * 22}ms` }}
                title={it.kind === "app" && it.app.locked ? t("props.locked") : label}
                onPointerDown={(e) => {
                  setSelected(it.id);
                  // A finger has no double-click: one tap opens.
                  if (e.pointerType === "touch") openItem(it);
                }}
                onFocus={() => setSelected(it.id)}
                onDoubleClick={() => openItem(it)}
                onContextMenu={(e) => {
                  setSelected(it.id);
                  openMenu(e, label, itemMenu(it));
                }}
              >
                {it.kind === "app" ? <AppTile app={it.app} size={icons} /> : <FolderTile apps={it.apps} size={icons} />}
                <span className="wd-icon__l">{label}</span>
              </button>
            );
          })}
        </div>

        {clock && !phone ? (
          <div className="wd-widget" aria-hidden>
            <b>{time}</b>
            <span>{longDate}</span>
            <small>{t(`greet.${greet}`, { name: name.split(/\s+/)[0] || name })}</small>
          </div>
        ) : null}

        {hint && !phone ? <div className={`wd-snap wd-snap--${hint}`} aria-hidden /> : null}

        {wins.map((w) => {
          const app = w.kind === "app" ? byKey.get(w.key) : undefined;
          const frameKey = `${w.id}-${w.tick}`;
          return (
            <DeskWindow
              key={w.id}
              win={w}
              area={area}
              active={active === w.id}
              title={winTitle(w)}
              icon={appIcon(w)}
              labels={labels}
              phone={phone}
              onFocus={() => active !== w.id && focus(w.id)}
              onChange={(p) => patch(w.id, p)}
              onClose={() => close(w.id)}
              onMenu={(e) => openMenu(e, winTitle(w), winMenu(w))}
              onBusy={setBusy}
              onSnapHint={setHint}
              tools={
                w.kind === "app" ? (
                  <>
                    <button type="button" onClick={() => frames.current.get(w.id)?.contentWindow?.history.back()} aria-label={t("win.back")} title={t("win.back")}>
                      <IconChevronLeft />
                    </button>
                    <button type="button" onClick={() => reload(w)} aria-label={t("win.reload")} title={t("win.reload")}>
                      <IconRefresh />
                    </button>
                    <button type="button" onClick={() => newTab(w.path || w.href)} aria-label={t("menu.newTab")} title={t("menu.newTab")}>
                      <IconExternal />
                    </button>
                  </>
                ) : null
              }
            >
              {w.kind === "app" && app ? (
                <>
                  <iframe
                    key={frameKey}
                    ref={(el) => {
                      if (el) frames.current.set(w.id, el);
                    }}
                    name={`${DESK_FRAME}${w.id}`}
                    title={winTitle(w)}
                    src={`/${locale}${w.href}`}
                    onLoad={() => setLoaded((l) => ({ ...l, [frameKey]: true }))}
                  />
                  {loaded[frameKey] ? null : (
                    <div className="wd-win__load" aria-hidden>
                      <AppTile app={app} size="lg" />
                      <i />
                    </div>
                  )}
                </>
              ) : w.kind === "folder" ? (
                <Explorer
                  folder={w.key as FolderId}
                  apps={folderApps(w.key as FolderId)}
                  folders={FOLDERS.map((f) => ({ id: f.id, name: folderName(f.id), apps: folderApps(f.id) })).filter((f) => f.apps.length)}
                  t={t}
                  onFolder={(id) => openFolder(id, w.id)}
                  onOpen={(a) => openApp(a.key)}
                  onMenu={(e, a) => openMenu(e, a.label, appMenu(a))}
                />
              ) : null}
            </DeskWindow>
          );
        })}
      </div>

      {start ? (
        <div className="wd-start" role="dialog" aria-label={t("start")} onKeyDown={(e) => e.key === "Escape" && setStart(false)}>
          <div className="uf-search wd-start__q">
            <IconSearch aria-hidden />
            <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
          </div>
          <h3>{needle ? t("results") : t("allApps")}</h3>
          <div className="wd-start__grid">
            {foundFolders.map((f) => (
              <button key={f.id} type="button" onClick={() => openFolder(f.id)}>
                <FolderTile apps={folderApps(f.id)} size="sm" />
                <span>{folderName(f.id)}</span>
              </button>
            ))}
            {found.map((a) => (
              <button key={a.key} type="button" onClick={() => openApp(a.key)} onContextMenu={(e) => openMenu(e, a.label, appMenu(a))} title={a.locked ? t("props.locked") : a.label}>
                <AppTile app={a} size="sm" />
                <span>{a.label}</span>
              </button>
            ))}
            {!found.length && !foundFolders.length ? <p className="wd-start__none">{t("noResults")}</p> : null}
          </div>
          <footer className="wd-start__foot">
            <button type="button" className="wd-start__me" onClick={() => openApp("profile")}>
              <span>{initials(name || "U")}</span>
              <b>{name}</b>
            </button>
            <span className="wd-start__acts">
              {isAdmin ? (
                <button type="button" onClick={() => router.push("/admin")} title={t("admin")} aria-label={t("admin")}>
                  <IconShield />
                </button>
              ) : null}
              <button type="button" onClick={() => setDeskMode("classic")} title={t("switchClassic")} aria-label={t("switchClassic")}>
                <IconList />
              </button>
              <button
                type="button"
                onClick={(e) =>
                  openMenu(e, t("power"), [
                    // On a phone the tray has no room for these; they live here.
                    ...(phone
                      ? ([
                          { heading: t("tray.language"), id: "h-lang" },
                          ...langItems(),
                          { heading: t("tray.theme"), id: "h-theme" },
                          ...themeItems(),
                          { sep: true, id: "s-p" },
                        ] as MenuItem[])
                      : []),
                    { id: "classic", label: t("switchClassic"), icon: <IconList />, onSelect: () => setDeskMode("classic") },
                    { id: "out", label: t("logout"), icon: <IconLogout />, danger: true, onSelect: onLogout },
                  ])
                }
                title={t("power")}
                aria-label={t("power")}
              >
                <IconPower />
              </button>
            </span>
          </footer>
        </div>
      ) : null}

      <nav
        className="wd-bar"
        aria-label={t("taskbar")}
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("wd-bar__mid")) return;
          openMenu(e, t("taskbar"), [
            { id: "show", label: t("menu.showDesktop"), icon: <IconGrid />, onSelect: showDesktop },
            { id: "classic", label: t("switchClassic"), icon: <IconList />, onSelect: () => setDeskMode("classic") },
          ]);
        }}
      >
        <div className="wd-bar__mid">
          <button type="button" className={`wd-bar__start${start ? " is-on" : ""}`} onClick={() => setStart((s) => !s)} aria-label={t("start")} aria-expanded={start} title={t("start")}>
            <IconLogo />
          </button>
          <button
            type="button"
            className="wd-bar__search"
            onClick={() => {
              setQuery("");
              setStart(true);
            }}
          >
            <IconSearch aria-hidden />
            <span>{t("search")}</span>
          </button>
          {slots.map((s) => {
            const open = s.wins.length > 0;
            const on = s.wins.some((w) => w.id === active && !w.min);
            const app = s.kind === "app" ? byKey.get(s.key) : undefined;
            return (
              <button
                key={`${s.kind}-${s.key}`}
                type="button"
                className={`wd-bar__app${open ? " is-open" : ""}${on ? " is-on" : ""}`}
                onClick={() => pressSlot(s)}
                onContextMenu={(e) => openMenu(e, slotLabel(s), slotMenu(s))}
                aria-label={slotLabel(s)}
                aria-pressed={on}
                title={slotLabel(s)}
              >
                {app ? <AppTile app={app} size="sm" /> : <FolderTile apps={folderApps(s.key as FolderId)} size="sm" />}
                {s.wins.length > 1 ? <em>{s.wins.length}</em> : null}
              </button>
            );
          })}
        </div>
        <div className="wd-tray">
          <button type="button" onClick={() => setAiOpen(true)} aria-label={t("tray.ai")} title={t("tray.ai")}>
            <IconSparkle />
          </button>
          <button type="button" onClick={() => openApp("notifications")} aria-label={t("tray.notifications")} title={t("tray.notifications")}>
            <IconBell />
          </button>
          <button
            type="button"
            className="wd-tray__wide"
            onClick={(e) => openMenu(e, t("tray.language"), langItems())}
            aria-label={t("tray.language")}
            title={t("tray.language")}
          >
            <IconLanguage />
            <span className="wd-tray__lang">{locale.toUpperCase()}</span>
          </button>
          <button
            type="button"
            className="wd-tray__wide"
            onClick={(e) => openMenu(e, t("tray.theme"), themeItems())}
            aria-label={t("tray.theme")}
            title={t("tray.theme")}
          >
            {theme === "dark" ? <IconMoon /> : <IconSun />}
          </button>
          <button type="button" className="wd-tray__view wd-tray__wide" onClick={() => setDeskMode("classic")} title={t("switchClassic")}>
            <IconList />
            <span>{t("classic")}</span>
          </button>
          <button type="button" className="wd-tray__clock" onClick={() => openApp("calendar")} title={date}>
            <b>{time}</b>
            <small>{date}</small>
          </button>
          <button type="button" className="wd-tray__peek" onClick={showDesktop} aria-label={t("menu.showDesktop")} title={t("menu.showDesktop")} />
        </div>
      </nav>

      {menu ? <ContextMenu at={menu.at} items={menu.items} label={menu.label} onClose={() => setMenu(null)} /> : null}

      {note ? (
        <div className="wd-props" role="dialog" aria-modal="true" aria-label={note.title} onKeyDown={(e) => e.key === "Escape" && setNote(null)}>
          <div className="wd-props__card">
            <header>
              {note.icon}
              <b>{note.title}</b>
              <button type="button" autoFocus onClick={() => setNote(null)} aria-label={t("win.close")}>
                <IconClose />
              </button>
            </header>
            <dl>
              {note.rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v === t("props.locked") ? <span className="wd-props__lock"><IconLock />{v}</span> : v}</dd>
                </div>
              ))}
            </dl>
            <footer>
              <button type="button" className="btn btn--pri btn--sm" onClick={() => setNote(null)}>
                {t("ok")}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// A folder's window: the folders down the side, the path along the top and
// the folder's apps as big icons.
function Explorer({
  folder,
  apps,
  folders,
  t,
  onFolder,
  onOpen,
  onMenu,
}: {
  folder: FolderId;
  apps: DeskApp[];
  folders: { id: FolderId; name: string; apps: DeskApp[] }[];
  t: ReturnType<typeof useTranslations>;
  onFolder: (id: FolderId) => void;
  onOpen: (a: DeskApp) => void;
  onMenu: (e: MouseEvent, a: DeskApp) => void;
}) {
  const [sel, setSel] = useState("");
  const name = folders.find((f) => f.id === folder)?.name ?? "";
  return (
    <div className="wd-ex">
      <aside className="wd-ex__side" aria-label={t("folders")}>
        {folders.map((f) => (
          <button key={f.id} type="button" className={f.id === folder ? "is-on" : ""} aria-current={f.id === folder || undefined} onClick={() => onFolder(f.id)}>
            <FolderTile apps={f.apps} size="sm" />
            <span>{f.name}</span>
          </button>
        ))}
      </aside>
      <div className="wd-ex__main">
        <p className="wd-ex__path">
          <IconFolder aria-hidden />
          <span>LexGo</span>
          <span>{t("desktop")}</span>
          <b>{name}</b>
        </p>
        <div className="wd-ex__grid" role="listbox" aria-label={name}>
          {apps.map((a) => (
            <button
              key={a.key}
              type="button"
              role="option"
              aria-selected={sel === a.key}
              className={`wd-icon wd-icon--dark${sel === a.key ? " is-on" : ""}`}
              onClick={() => setSel(a.key)}
              onDoubleClick={() => onOpen(a)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(a)}
              onContextMenu={(e) => {
                setSel(a.key);
                onMenu(e, a);
              }}
              title={a.locked ? t("props.locked") : a.label}
            >
              <AppTile app={a} size="lg" />
              <span className="wd-icon__l">{a.label}</span>
            </button>
          ))}
        </div>
        <p className="wd-ex__status">{t("props.items", { n: apps.length })}</p>
      </div>
    </div>
  );
}
