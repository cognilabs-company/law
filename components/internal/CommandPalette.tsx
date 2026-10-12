"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { IconSearch, IconUser } from "@/components/icons";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import type { NavGroup, NavIcon } from "./nav";

type Hit = { id: string; label: string; sub: string; href: string; Icon: NavIcon; group: "pages" | "people" };

// Ctrl/⌘+K (or "/"): jump to any page of the workspace or to a person,
// without the mouse. Matching ignores case and diacritics (o' = o).
const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ'ʻʼ‘’`]/g, "");

export default function CommandPalette({ groups }: { groups: NavGroup[] }) {
  const t = useTranslations("internal");
  const router = useRouter();
  const dir = useHrmDirectory();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    const h = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(h);
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const needle = fold(q.trim());
    const pages: Hit[] = groups.flatMap((g) => g.items.map((i) => ({ id: i.href, label: t(`nav.${i.key}`), sub: t(`groups.${g.key}`), href: i.href, Icon: i.Icon, group: "pages" as const })));
    const people: Hit[] = needle.length < 2 ? [] : dir.employees.map((e) => ({ id: `e-${e.id}`, label: e.name || e.code, sub: [e.code, dir.positionTitle(e.positionId)].filter(Boolean).join(" · "), href: `/internal/live-office?employee=${encodeURIComponent(e.id)}`, Icon: IconUser, group: "people" as const }));
    const match = (h: Hit) => !needle || fold(`${h.label} ${h.sub}`).includes(needle);
    return [...pages.filter(match), ...people.filter(match).slice(0, 6)];
  }, [q, groups, dir, t]);

  if (!open) {
    return (
      <button type="button" className="hn-search" onClick={() => setOpen(true)} aria-label={t("palette.open")}>
        <IconSearch />
        <span>{t("palette.placeholder")}</span>
        <kbd>Ctrl K</kbd>
      </button>
    );
  }
  const close = () => {
    setOpen(false);
    setQ("");
    setAt(0);
  };
  const go = (h: Hit | undefined) => {
    if (!h) return;
    close();
    router.push(h.href);
  };
  const cur = Math.min(at, Math.max(0, hits.length - 1));
  return (
    <>
      <button type="button" className="hn-search" aria-label={t("palette.open")}>
        <IconSearch />
        <span>{t("palette.placeholder")}</span>
        <kbd>Ctrl K</kbd>
      </button>
      {createPortal(
        <div className="hn-pal" role="dialog" aria-modal="true" aria-label={t("palette.open")} onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="hn-pal__box">
            <label className="hn-pal__in">
              <IconSearch />
              <input
                ref={input}
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setAt(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                  else if (e.key === "ArrowDown") { e.preventDefault(); setAt((n) => Math.min(hits.length - 1, n + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setAt((n) => Math.max(0, n - 1)); }
                  else if (e.key === "Enter") go(hits[cur]);
                }}
                placeholder={t("palette.placeholder")}
                role="combobox"
                aria-expanded="true"
                aria-controls="hn-pal-list"
                aria-activedescendant={hits[cur] ? `hn-pal-${cur}` : undefined}
              />
              <kbd>Esc</kbd>
            </label>
            <ul className="hn-pal__list" id="hn-pal-list" role="listbox">
              {hits.length ? hits.map((h, i) => (
                <li key={h.id} role="presentation">
                  {i === 0 || hits[i - 1].group !== h.group ? <span className="hn-pal__g">{t(`palette.${h.group}`)}</span> : null}
                  <button type="button" id={`hn-pal-${i}`} role="option" aria-selected={i === cur} className={i === cur ? "on" : ""} onMouseEnter={() => setAt(i)} onClick={() => go(h)}>
                    <h.Icon />
                    <b>{h.label}</b>
                    <small>{h.sub}</small>
                  </button>
                </li>
              )) : <li className="hn-pal__none">{t("palette.none")}</li>}
            </ul>
            <div className="hn-pal__foot"><span><kbd>↑</kbd><kbd>↓</kbd> {t("palette.move")}</span><span><kbd>Enter</kbd> {t("palette.go")}</span></div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
