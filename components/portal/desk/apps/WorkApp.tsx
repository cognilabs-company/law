"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtDateTime } from "@/lib/date";
import { getWork, type DeskLink, type WorkFeed, type WorkItem } from "@/lib/services/lawyerDesktop";
import { IconAlert, IconArrowRight, IconBriefcase, IconChat, IconCheckDouble, IconClock, IconClose, IconInbox, IconPlus, IconRefresh, IconSparkle } from "@/components/icons";
import { App, Btn, Empty, Loading, Progress, Sidebar, Tag, Tool, Toolbar, useHost, useOs, type NavSection, type Tone } from "../kit/kit";
import "./work.css";

const GROUPS = ["requests", "active", "completed", "cancelled"] as const;
type Group = (typeof GROUPS)[number];
const ICON: Record<Group, React.ReactNode> = { requests: <IconInbox />, active: <IconBriefcase />, completed: <IconCheckDouble />, cancelled: <IconClose /> };
const TONE: Record<Group, Tone> = { requests: "info", active: "accent", completed: "ok", cancelled: "neutral" };

// What a row carries when it is dragged onto the desk: a shortcut to it.
export const SHORTCUT_DRAG = "application/x-lexgo-shortcut";
export function workShortcut(w: WorkItem) {
  return { shortcut_key: `work-${w.id}`, app_id: w.link.appId || "marketplace-work", label: w.title || w.code, entity_type: w.entityType, entity_id: w.id, route: w.link.route };
}

// The work feed (§9, "work") as a desktop program — a Finder-like list on
// the Mac, Explorer's details view on Windows: requests, active, completed
// and cancelled on the side as the backend groups them; each piece of work
// with its client, price, payment, deadline and checklist; the chosen one
// in an info pane with the way to it, its chat and the copilot focused on
// it. A row dragged onto the desk becomes a shortcut. A read-only view:
// every change happens in the work's own page.
export default function WorkApp({ onOpen, onChat, onCopilot, onShortcut }: { onOpen: (link: DeskLink, title: string) => void; onChat: (roomId: string) => void; onCopilot: (w: WorkItem) => void; onShortcut?: (w: WorkItem) => void }) {
  const t = useTranslations("portal.desk.work");
  const tc = useTranslations("portal.desk.copilot");
  const locale = useLocale();
  const os = useOs();
  const { menu } = useHost();
  const [group, setGroup] = useState<Group>("active");
  const [feed, setFeed] = useState<WorkFeed | null>(null);
  const [more, setMore] = useState<WorkItem[]>([]);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(0);
  const [sel, setSel] = useState("");
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
  const groupOf = (status: string): Group => GROUPS.find((g) => feed?.groups[g]?.includes(status)) ?? "active";
  const shown = all.filter((w) => groupOf(w.status) === group);
  const count = (g: Group) => all.filter((w) => groupOf(w.status) === g).length;
  const cur = shown.find((w) => w.id === sel) ?? null;
  const money = (n: number, c: string) => `${n.toLocaleString("ru-RU").replace(/ /g, " ")} ${c === "UZS" ? t("som") : c}`;
  const late = (iso: string) => !!iso && !!now && Date.parse(iso) < now;
  const status = (s: string) => (tc.has(`status.${s}`) ? tc(`status.${s}`) : s);
  const pay = (p: string) => (t.has(`pay.${p}`) ? t(`pay.${p}`) : p);
  const loadMore = () =>
    getWork({ offset: all.length })
      .then((f) => {
        setMore((m) => [...m, ...f.items]);
        setFeed((c) => (c ? { ...c, hasMore: f.hasMore } : c));
      })
      .catch(() => setErr(true));
  const rowMenu = (e: MouseEvent, w: WorkItem) => {
    e.preventDefault();
    setSel(w.id);
    menu?.(e, w.title || w.code, [
      { id: "open", label: t("open"), icon: <IconArrowRight />, onSelect: () => onOpen(w.link, w.title) },
      { id: "cop", label: t("askCopilot"), icon: <IconSparkle />, onSelect: () => onCopilot(w) },
      ...(w.chatRoomId ? [{ id: "chat", label: t("chat"), icon: <IconChat />, onSelect: () => onChat(w.chatRoomId) }] : []),
      ...(onShortcut && w.link.route ? [{ id: "desk", label: t("toDesktop"), icon: <IconPlus />, onSelect: () => onShortcut(w) }] : []),
    ]);
  };
  const sections: NavSection[] = [{ id: "g", title: os === "mac" ? t("title") : undefined, items: GROUPS.map((g) => ({ id: g, label: t(`group.${g}`), icon: ICON[g], count: count(g) || undefined })) }];

  return (
    <App
      name="work"
      sidebar={<Sidebar label={t("title")} sections={sections} value={group} onChange={(g) => (setGroup(g as Group), setSel(""))} />}
      inspector={
        cur ? (
          <aside className="dxw-insp" aria-label={cur.title || cur.code}>
            <header>
              <Tag tone={TONE[groupOf(cur.status)]}>{status(cur.status)}</Tag>
              <h2>{cur.title || cur.code}</h2>
              {cur.code ? <code>{cur.code}</code> : null}
            </header>
            <dl>
              {cur.client ? (
                <>
                  <dt>{t("client")}</dt>
                  <dd>{cur.client}</dd>
                </>
              ) : null}
              {cur.price ? (
                <>
                  <dt>{t("price")}</dt>
                  <dd>{money(cur.price, cur.currency)}</dd>
                </>
              ) : null}
              {cur.payment ? (
                <>
                  <dt>{t("payment")}</dt>
                  <dd>{pay(cur.payment)}</dd>
                </>
              ) : null}
              {cur.deadline ? (
                <>
                  <dt>{t("deadline")}</dt>
                  <dd className={late(cur.deadline) && group === "active" ? "is-late" : ""}>{fmtDateTime(cur.deadline, locale)}</dd>
                </>
              ) : null}
            </dl>
            {cur.total ? <Progress value={(cur.done / cur.total) * 100} label={t("checklist", { done: cur.done, total: cur.total })} /> : null}
            <div className="dxw-insp__acts">
              <Btn kind="primary" icon={<IconArrowRight />} onClick={() => onOpen(cur.link, cur.title)}>
                {t("open")}
              </Btn>
              <Btn icon={<IconSparkle />} onClick={() => onCopilot(cur)}>
                {t("askCopilot")}
              </Btn>
              {cur.chatRoomId ? (
                <Btn icon={<IconChat />} onClick={() => onChat(cur.chatRoomId)}>
                  {t("chat")}
                </Btn>
              ) : null}
              {onShortcut && cur.link.route ? (
                <Btn icon={<IconPlus />} onClick={() => onShortcut(cur)} title={t("toDesktopHint")}>
                  {t("toDesktop")}
                </Btn>
              ) : null}
            </div>
          </aside>
        ) : undefined
      }
    >
      <Toolbar title={t(`group.${group}`)} subtitle={t("count", { n: shown.length })}>
        <Tool icon={<IconRefresh />} label={t("refresh")} onClick={() => setTick((n) => n + 1)} />
        {cur ? <Tool icon={<IconArrowRight />} label={t("open")} onClick={() => onOpen(cur.link, cur.title)} /> : null}
      </Toolbar>
      <div className="dxw-body">
        {feed === null ? (
          err ? (
            <Empty icon={<IconAlert />} title={t("error")} action={<Btn onClick={() => setTick((n) => n + 1)}>{t("refresh")}</Btn>} />
          ) : (
            <Loading label={t("loading")} />
          )
        ) : !shown.length ? (
          <Empty icon={ICON[group]} title={t(`empty.${group}`)} />
        ) : (
          <div className="dxw-list" role="listbox" aria-label={t(`group.${group}`)}>
            <div className="dxw-head" aria-hidden>
              <span>{t("name")}</span>
              <span>{t("client")}</span>
              <span className="dxw-c-due">{t("deadline")}</span>
              <span className="dxw-c-prog">{t("progress")}</span>
              <span className="dxw-c-price">{t("price")}</span>
            </div>
            {shown.map((w) => (
              <div
                key={w.id}
                role="option"
                tabIndex={0}
                aria-selected={sel === w.id}
                className={`dxw-row${sel === w.id ? " is-on" : ""}`}
                draggable={!!onShortcut && !!w.link.route}
                onDragStart={(e) => {
                  e.dataTransfer.setData(SHORTCUT_DRAG, JSON.stringify(workShortcut(w)));
                  e.dataTransfer.effectAllowed = "link";
                }}
                onClick={() => setSel(w.id)}
                onDoubleClick={() => onOpen(w.link, w.title)}
                onKeyDown={(e) => e.key === "Enter" && onOpen(w.link, w.title)}
                onContextMenu={(e) => rowMenu(e, w)}
              >
                <span className="dxw-name">
                  <span className={`dxw-ic dxw-ic--${groupOf(w.status)}`} aria-hidden>
                    {ICON[groupOf(w.status)]}
                  </span>
                  <span>
                    <b>{w.title || w.code}</b>
                    <small>
                      {w.code ? <code>{w.code}</code> : null}
                      {status(w.status)}
                    </small>
                  </span>
                </span>
                <span className="dxw-cell">{w.client || "—"}</span>
                <span className={`dxw-cell dxw-c-due${late(w.deadline) && group === "active" ? " is-late" : ""}`}>
                  {w.deadline ? (
                    <>
                      <IconClock aria-hidden />
                      {fmtDateTime(w.deadline, locale)}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="dxw-cell dxw-prog dxw-c-prog">
                  {w.total ? (
                    <>
                      <i>
                        <i style={{ width: `${Math.round((w.done / w.total) * 100)}%` }} />
                      </i>
                      <small>
                        {w.done}/{w.total}
                      </small>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="dxw-cell dxw-price dxw-c-price">
                  {w.price ? money(w.price, w.currency) : "—"}
                  {w.payment ? <small>{pay(w.payment)}</small> : null}
                </span>
              </div>
            ))}
            {feed.hasMore ? (
              <div className="dxw-more">
                <Btn small onClick={() => void loadMore()}>
                  {t("more")}
                </Btn>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </App>
  );
}
