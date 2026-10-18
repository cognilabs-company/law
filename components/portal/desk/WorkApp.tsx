"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtDateTime } from "@/lib/date";
import { getWork, type DeskLink, type WorkFeed, type WorkItem } from "@/lib/services/lawyerDesktop";
import { IconArrowRight, IconChat, IconClock, IconPlus, IconRefresh, IconSparkle } from "@/components/icons";

const GROUPS = ["requests", "active", "completed", "cancelled"] as const;
type Group = (typeof GROUPS)[number];

// The work feed (§9, "work"): requests, active, completed and cancelled, as
// the backend groups them. Each piece of work shows its status, payment,
// price, deadline and checklist progress, and opens by its own deep link;
// from here the chat about it and the copilot focused on it are one click.
// A read-only view: every change happens in the work's own page.
// What a row carries when it is dragged onto the desk: a shortcut to it.
export const SHORTCUT_DRAG = "application/x-lexgo-shortcut";
export function workShortcut(w: WorkItem) {
  return { shortcut_key: `work-${w.id}`, app_id: w.link.appId || "marketplace-work", label: w.title || w.code, entity_type: w.entityType, entity_id: w.id, route: w.link.route };
}

export default function WorkApp({ onOpen, onChat, onCopilot, onShortcut }: { onOpen: (link: DeskLink, title: string) => void; onChat: () => void; onCopilot: (w: WorkItem) => void; onShortcut?: (w: WorkItem) => void }) {
  const t = useTranslations("portal.desk.work");
  const tc = useTranslations("portal.desk.copilot");
  const locale = useLocale();
  const [group, setGroup] = useState<Group>("active");
  const [feed, setFeed] = useState<WorkFeed | null>(null);
  const [more, setMore] = useState<WorkItem[]>([]);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const h = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(h);
  }, [tick]);

  useEffect(() => {
    const c = new AbortController();
    getWork({}, c.signal)
      .then((f) => {
        if (c.signal.aborted) return;
        setFeed(f);
        setMore([]);
        setErr(false);
      })
      .catch(() => !c.signal.aborted && setErr(true));
    return () => c.abort();
  }, [tick]);

  const all = [...(feed?.items ?? []), ...more];
  const groupOf = (status: string): Group => (GROUPS.find((g) => feed?.groups[g]?.includes(status)) ?? "active");
  const shown = all.filter((w) => groupOf(w.status) === group);
  const count = (g: Group) => all.filter((w) => groupOf(w.status) === g).length;
  const money = (n: number, cur: string) => `${n.toLocaleString("ru-RU").replace(/ /g, " ")} ${cur === "UZS" ? t("som") : cur}`;
  const loadMore = () => {
    getWork({ offset: all.length })
      .then((f) => {
        setMore((m) => [...m, ...f.items]);
        setFeed((cur) => (cur ? { ...cur, hasMore: f.hasMore } : cur));
      })
      .catch(() => setErr(true));
  };
  const late = (iso: string) => !!iso && !!now && Date.parse(iso) < now;

  return (
    <div className="wd-work">
      <header className="wd-work__top">
        <div className="wd-work__tabs" role="tablist" aria-label={t("title")}>
          {GROUPS.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={group === g} className={group === g ? "is-on" : ""} onClick={() => setGroup(g)}>
              {t(`group.${g}`)}
              <em>{count(g)}</em>
            </button>
          ))}
        </div>
        <button type="button" className="wd-work__reload" onClick={() => setTick((n) => n + 1)} aria-label={t("refresh")} title={t("refresh")}>
          <IconRefresh />
        </button>
      </header>
      {err ? <p className="wd-work__err" role="alert">{t("error")}</p> : null}
      {feed === null && !err ? <p className="wd-work__none">{t("loading")}</p> : null}
      {feed && !shown.length ? <p className="wd-work__none">{t(`empty.${group}`)}</p> : null}
      <ul className="wd-work__list">
        {shown.map((w) => {
          const pct = w.total ? Math.round((w.done / w.total) * 100) : 0;
          return (
            <li
              key={w.id}
              className="wd-work__item"
              draggable={!!onShortcut && !!w.link.route}
              onDragStart={(e) => {
                e.dataTransfer.setData(SHORTCUT_DRAG, JSON.stringify(workShortcut(w)));
                e.dataTransfer.effectAllowed = "link";
              }}
            >
              <button type="button" className="wd-work__main" onClick={() => onOpen(w.link, w.title)}>
                <span className="wd-work__head">
                  <b>{w.title || w.code}</b>
                  <em className={`wd-work__st wd-work__st--${groupOf(w.status)}`}>{tc.has(`status.${w.status}`) ? tc(`status.${w.status}`) : w.status}</em>
                </span>
                <span className="wd-work__meta">
                  {w.code ? <code>{w.code}</code> : null}
                  {w.client ? <span>{w.client}</span> : null}
                  {w.price ? <span>{money(w.price, w.currency)}</span> : null}
                  {w.payment ? <span>{t.has(`pay.${w.payment}`) ? t(`pay.${w.payment}`) : w.payment}</span> : null}
                </span>
                {w.deadline ? (
                  <span className={`wd-work__due${late(w.deadline) && group === "active" ? " is-late" : ""}`}>
                    <IconClock aria-hidden />
                    {t("due", { at: fmtDateTime(w.deadline, locale) })}
                  </span>
                ) : null}
                {w.total ? (
                  <span className="wd-work__prog" aria-label={t("checklist", { done: w.done, total: w.total })}>
                    <i>
                      <i style={{ width: `${pct}%` }} />
                    </i>
                    <small>{t("checklist", { done: w.done, total: w.total })}</small>
                  </span>
                ) : null}
              </button>
              <span className="wd-work__acts">
                <button type="button" onClick={() => onCopilot(w)} title={t("askCopilot")}>
                  <IconSparkle aria-hidden />
                  {t("askCopilot")}
                </button>
                {w.chatRoomId ? (
                  <button type="button" onClick={onChat} title={t("chat")}>
                    <IconChat aria-hidden />
                    {t("chat")}
                  </button>
                ) : null}
                {onShortcut && w.link.route ? (
                  <button type="button" onClick={() => onShortcut(w)} title={t("toDesktopHint")}>
                    <IconPlus aria-hidden />
                    {t("toDesktop")}
                  </button>
                ) : null}
                <button type="button" onClick={() => onOpen(w.link, w.title)} title={t("open")}>
                  <IconArrowRight aria-hidden />
                  {t("open")}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {feed?.hasMore ? (
        <button type="button" className="wd-work__more" onClick={loadMore}>
          {t("more")}
        </button>
      ) : null}
    </div>
  );
}
