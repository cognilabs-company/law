"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { initials } from "@/lib/lawyers";
import { fmtDate, localDay } from "@/lib/date";
import { IconFolder, IconLock } from "@/components/icons";
import { AppTile } from "./AppIcon";
import { KINDS, kindOf, tileOf, type DeskApp as App, type DeskNav } from "./apps";
import type { DeskOs } from "./deskMode";

// A page inside a desktop window, dressed as the program a computer has for
// its job: File Explorer or Finder for cases and documents, a calendar app,
// a messenger, a to-do list, contacts, a store, settings, an assistant.
// The side menu lists the sections of the same kind (real links, opened in
// the same window); the header is the one that program has — a path, a
// big date, a greeting or a title. The page itself is left as it is, and
// the stylesheet gives its panels, buttons and fields the system's look.
export default function DeskApp({ os, nav, current, label, locked, name, children }: { os: DeskOs; nav: DeskNav[]; current: string; label: (key: string) => string; locked: (key: string) => boolean; name: string; children: ReactNode }) {
  const t = useTranslations("portal.desk.app");
  const locale = useLocale();
  const kind = kindOf(current);
  const keys = KINDS.find((k) => k.kind === kind)?.keys ?? [current];
  const siblings: App[] = keys.map((k) => nav.find((n) => n.key === k)).filter((n): n is DeskNav => !!n).map((n) => ({ ...n, label: label(n.key), locked: locked(n.key) }));
  const here = siblings.find((s) => s.key === current) ?? { ...(nav.find((n) => n.key === current) ?? nav[0]), label: label(current), locked: false };
  const [a, b] = tileOf(current);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const h = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(h);
  }, []);
  const day = now ? new Date(now) : null;
  const side = siblings.length > 1 || kind === "settings";

  let head: ReactNode;
  if (kind === "files") {
    head = (
      <p className="dapp__path">
        <IconFolder aria-hidden />
        <span>LexGo</span>
        <span>{t(`kind.${kind}`)}</span>
        <b>{here.label}</b>
      </p>
    );
  } else if (kind === "calendar" && day) {
    head = (
      <div className="dapp__date">
        <b>{day.getDate()}</b>
        <span>
          <strong>{t(`weekday.${day.getDay()}`)}</strong>
          <small>{fmtDate(localDay(day), locale)}</small>
        </span>
        <em>{here.label}</em>
      </div>
    );
  } else {
    head = (
      <div className="dapp__title">
        <h1>{kind === "home" ? t("hello", { name: name.split(/\s+/)[0] || name }) : here.label}</h1>
        <small>{t(`tagline.${kind}`)}</small>
      </div>
    );
  }

  return (
    <div className={`dapp dapp--${os} dapp--${kind}${side ? " has-side" : ""}`} style={{ "--app0": a, "--app1": b } as CSSProperties}>
      {side ? (
        <aside className="dapp__side">
          {kind === "settings" ? (
            <div className="dapp__me">
              <span aria-hidden>{initials(name || "U")}</span>
              <b>{name}</b>
              <small>{t("account")}</small>
            </div>
          ) : (
            <div className="dapp__brand">
              <AppTile app={here} size="sm" />
              <b>{t(`kind.${kind}`)}</b>
            </div>
          )}
          {os === "mac" ? <span className="dapp__sec">{t(`section.${kind}`)}</span> : null}
          <nav aria-label={t(`kind.${kind}`)}>
            {siblings.map((s) => {
              const Icon = s.Icon;
              const on = s.key === current;
              return s.locked ? (
                <span key={s.key} className="dapp__link is-locked" aria-disabled="true" title={t("locked")}>
                  <Icon />
                  <span>{s.label}</span>
                  <IconLock />
                </span>
              ) : (
                <Link key={s.key} href={s.href} className={`dapp__link${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined} style={{ "--app0": tileOf(s.key)[0], "--app1": tileOf(s.key)[1] } as CSSProperties}>
                  <i aria-hidden>
                    <Icon />
                  </i>
                  <span>{s.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      ) : null}
      <div className="dapp__main">
        <header className="dapp__head">{head}</header>
        <div className="pbody">
          <div className="pbody__in">{children}</div>
        </div>
      </div>
    </div>
  );
}
