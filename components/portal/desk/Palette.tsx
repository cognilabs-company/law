"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconSearch } from "@/components/icons";
import { getCommands, searchDesk, type Command, type DeskItem, type DeskLink, type SearchHit } from "@/lib/services/lawyerDesktop";

export type PaletteApp = { id: string; label: string; icon: ReactNode; folder?: boolean };
type Row = { id: string; label: string; sub: string; icon?: ReactNode; disabled?: boolean; go: () => void; menu?: (e: MouseEvent) => void };

// One box for everything (§11–§13, Ctrl/Cmd+K): the apps and folders that
// match, the backend's commands (disabled ones shown, never run), and once
// two letters are typed a search across orders, chats, files, services and
// documents — the backend filters it to what this account owns. Results
// open only the deep link they come with. Spotlight on the Mac-style desk,
// a search panel on the Windows one.
export default function Palette({
  os,
  apps,
  onApp,
  pinned,
  recent,
  onLink,
  onHit,
  onHitMenu,
  onClose,
}: {
  os: "win" | "mac";
  apps: PaletteApp[];
  onApp: (app: PaletteApp) => void;
  pinned: DeskItem[];
  recent: DeskItem[];
  onLink: (link: DeskLink, title: string) => void;
  onHit: (hit: SearchHit) => void;
  onHitMenu: (e: MouseEvent, hit: SearchHit) => void;
  onClose: () => void;
}) {
  const t = useTranslations("portal.desk.palette");
  const [q, setQ] = useState("");
  const [commands, setCommands] = useState<Command[]>([]);
  const [hits, setHits] = useState<{ q: string; list: SearchHit[] } | null>(null);
  const [at, setAt] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const needle = q.trim();

  // Commands for what is typed (or none typed), and the search once two
  // letters are in; both wait for typing to pause and drop stale answers.
  useEffect(() => {
    const c = new AbortController();
    const h = setTimeout(() => {
      getCommands(needle, c.signal).then((list) => !c.signal.aborted && setCommands(list)).catch(() => undefined);
      if (needle.length >= 2) searchDesk(needle, c.signal).then((list) => !c.signal.aborted && setHits({ q: needle, list })).catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [needle]);

  const low = needle.toLocaleLowerCase();
  const sections: { id: string; title: string; rows: Row[] }[] = [];
  const appRows = apps.filter((a) => !low || a.label.toLocaleLowerCase().includes(low)).slice(0, low ? 6 : 8);
  if (appRows.length) sections.push({ id: "apps", title: t("apps"), rows: appRows.map((a) => ({ id: `a-${a.id}`, label: a.label, sub: a.folder ? t("folder") : t("app"), icon: a.icon, go: () => onApp(a) })) });
  if (!low && pinned.length) sections.push({ id: "pinned", title: t("pinned"), rows: pinned.slice(0, 5).map((p) => ({ id: `p-${p.id}`, label: p.title, sub: p.subtitle || p.badge, go: () => onLink({ appId: p.appId, route: p.route }, p.title) })) });
  if (!low && recent.length) sections.push({ id: "recent", title: t("recent"), rows: recent.slice(0, 5).map((p) => ({ id: `r-${p.id}`, label: p.title, sub: p.subtitle || p.badge, go: () => onLink({ appId: p.appId, route: p.route }, p.title) })) });
  if (commands.length) sections.push({ id: "cmd", title: t("commands"), rows: commands.slice(0, 8).map((c) => ({ id: `c-${c.id}`, label: t.has(`cmd.${c.id}`) ? t(`cmd.${c.id}`) : c.label, sub: c.enabled ? c.group || c.hint : t("disabled"), disabled: !c.enabled, go: () => onLink(c.link, c.label) })) });
  if (needle.length >= 2 && hits?.q === needle)
    sections.push({
      id: "hits",
      title: t("results"),
      rows: hits.list.map((h) => ({ id: `h-${h.type}-${h.id}`, label: h.title, sub: [t.has(`type.${h.type}`) ? t(`type.${h.type}`) : h.type, h.subtitle].filter(Boolean).join(" · "), go: () => onHit(h), menu: (e: MouseEvent) => onHitMenu(e, h) })),
    });
  const flat = sections.flatMap((s) => s.rows);
  const cur = Math.min(at, Math.max(0, flat.length - 1));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = flat.length;
      if (!n) return;
      const next = (cur + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      setAt(next);
      boxRef.current?.querySelector(`[data-row="${flat[next].id}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flat[cur];
      if (r && !r.disabled) {
        onClose();
        r.go();
      }
    }
  };

  return (
    <div className={`wd-pal wd-pal--${os}`} role="dialog" aria-label={t("title")} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wd-pal__box" ref={boxRef} onKeyDown={onKey}>
        <div className="wd-pal__q">
          <IconSearch aria-hidden />
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAt(0);
            }}
            placeholder={t("placeholder")}
            aria-label={t("title")}
            aria-controls="wd-pal-list"
            aria-activedescendant={flat[cur] ? `wd-pal-${flat[cur].id}` : undefined}
            maxLength={120}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="wd-pal__list" id="wd-pal-list" role="listbox" aria-label={t("title")}>
          {sections.map((s) => (
            <div key={s.id} role="group" aria-label={s.title}>
              <p className="wd-pal__h">{s.title}</p>
              {s.rows.map((r) => {
                const on = flat[cur]?.id === r.id;
                return (
                  <button
                    key={r.id}
                    id={`wd-pal-${r.id}`}
                    data-row={r.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    aria-disabled={r.disabled || undefined}
                    className={`wd-pal__row${on ? " is-on" : ""}${r.disabled ? " is-off" : ""}`}
                    tabIndex={-1}
                    onMouseEnter={() => setAt(flat.indexOf(r))}
                    onClick={() => {
                      if (r.disabled) return;
                      onClose();
                      r.go();
                    }}
                    onContextMenu={r.menu}
                  >
                    <span className="wd-pal__ic" aria-hidden>
                      {r.icon ?? <IconSearch />}
                    </span>
                    <span className="wd-pal__l">
                      <b>{r.label}</b>
                      {r.sub ? <small>{r.sub}</small> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {!flat.length ? <p className="wd-pal__none">{needle.length === 1 ? t("minChars") : t("none")}</p> : null}
        </div>
      </div>
    </div>
  );
}
