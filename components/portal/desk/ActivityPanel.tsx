"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtDateTime } from "@/lib/date";
import { IconBell, IconCalendar, IconClose, IconMoon, IconRefresh, IconTag } from "@/components/icons";
import type { Activity, DeskLink } from "@/lib/services/lawyerDesktop";

// The activity center (§10): work that needs attention, unread
// notifications and calendar activity in one list, each opening its own app
// at its own route. Focus mode keeps only what is urgent — calls, payments,
// deadlines, assigned work (priority high) — and is a switch here too.
// Slides in from the right: under the menu bar on the Mac-style desk, above
// the taskbar on the Windows one.
export default function ActivityPanel({
  os,
  items,
  focus,
  onFocus,
  onRefresh,
  onOpen,
  onClose,
}: {
  os: "win" | "mac";
  items: Activity[];
  focus: boolean;
  onFocus: (on: boolean) => void;
  onRefresh: () => void;
  onOpen: (link: DeskLink, title: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("portal.desk.activity");
  const locale = useLocale();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  // A click anywhere else puts it away (the bell toggles it by itself).
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el || ref.current?.contains(el) || el.closest(".wd-bell")) return;
      onClose();
    };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [onClose]);
  const shown = focus ? items.filter((a) => a.priority === "high") : items;
  const hidden = items.length - shown.length;
  const iconOf = (kind: string) => (/calendar|meeting|event/.test(kind) ? <IconCalendar /> : /order|work|request/.test(kind) ? <IconTag /> : <IconBell />);

  return (
    <aside ref={ref} className={`wd-act wd-act--${os}`} aria-label={t("title")} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <header className="wd-act__head">
        <b>{t("title")}</b>
        <button type="button" onClick={onRefresh} aria-label={t("refresh")} title={t("refresh")}>
          <IconRefresh />
        </button>
        <button type="button" onClick={onClose} aria-label={t("close")} title={t("close")}>
          <IconClose />
        </button>
      </header>
      <button type="button" className={`wd-act__focus${focus ? " is-on" : ""}`} aria-pressed={focus} onClick={() => onFocus(!focus)}>
        <IconMoon aria-hidden />
        <span>
          <b>{t("focus")}</b>
          <small>{focus ? t("focusOn") : t("focusOff")}</small>
        </span>
        <i aria-hidden />
      </button>
      {shown.length ? (
        <ul className="wd-act__list">
          {shown.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={`wd-act__item${a.priority === "high" ? " is-high" : ""}${a.unread ? " is-unread" : ""}`}
                onClick={() => {
                  onClose();
                  onOpen(a.link, a.title);
                }}
              >
                <span className="wd-act__ic" aria-hidden>
                  {iconOf(a.kind)}
                </span>
                <span className="wd-act__t">
                  <b>{a.title}</b>
                  {a.subtitle ? <small>{a.subtitle}</small> : null}
                  {a.at ? <time>{fmtDateTime(a.at, locale)}</time> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wd-act__empty">{t("empty")}</p>
      )}
      {focus && hidden > 0 ? <p className="wd-act__muted">{t("muted", { n: hidden })}</p> : null}
    </aside>
  );
}
