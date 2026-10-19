"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { hasAdminAccess, isCallCenterUser, useAuth } from "@/lib/auth";
import { shortDateTime } from "@/lib/date";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/services/backend";
import { getNotificationCategoryCounts, listNotificationsRich, NOTIF_PAGE, richNotificationOf, type NotifCategoryCounts, type RichNotification } from "@/lib/services/notify";
import { subscribeUserEvents } from "@/lib/userSocket";
import { setUnreadCount } from "@/lib/unread";
import { NOTIF_CATEGORIES, notifLink, type NotifTab } from "@/lib/notifications";
import { humanizeSlug } from "@/lib/lawyers";
import { useNotifText, NOTIF_READ_EVENT } from "@/components/portal/NotificationsPanel";
import { IconAlert, IconArrowRight, IconBell, IconCard, IconChat, IconCheckDouble, IconFileText, IconInbox, IconMegaphone, IconRefresh, IconSliders, IconTag } from "@/components/icons";
import { App, Btn, Empty, Loading, Search, Seg, Sidebar, Tag, Tool, Toolbar, useHost, useOs, type NavSection } from "../kit/kit";
import type { NativeProps } from "../native";
import "./notifications.css";

// Notifications as a desktop program, the way mail is read: the sections
// on the side with what is unread in each, the messages in a list, the one
// chosen in a reading pane with where it was delivered and the way to what
// it is about. Read when opened; "mark all read" for what is in view; new
// ones arrive by themselves.

type ReadFilter = "all" | "unread";
const ICONS: Record<NotifTab, ReactNode> = { all: <IconInbox />, orders: <IconTag />, payments: <IconCard />, chat: <IconChat />, documents: <IconFileText />, system: <IconSliders />, marketing: <IconMegaphone /> };
const announceRead = () => window.dispatchEvent(new Event(NOTIF_READ_EVENT));

export default function NotificationsApp({ openLink }: NativeProps) {
  const t = useTranslations("portal.notifications");
  const d = useTranslations("portal.desk.notes");
  const locale = useLocale();
  const os = useOs();
  const { menu } = useHost();
  const { session } = useAuth();
  const textOf = useNotifText();
  const [items, setItems] = useState<RichNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<NotifTab>("all");
  const [filter, setFilter] = useState<ReadFilter>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [more, setMore] = useState(false);
  const [counts, setCounts] = useState<NotifCategoryCounts | null>(null);
  const [tick, setTick] = useState(0);
  const loadCounts = useCallback(() => void getNotificationCategoryCounts().then(setCounts).catch(() => undefined), []);

  useEffect(() => {
    let alive = true;
    listNotificationsRich({ category: tab === "all" ? undefined : tab, unreadOnly: filter === "unread", limit: NOTIF_PAGE, offset: 0 })
      .then((l) => {
        if (!alive) return;
        setItems(l);
        setMore(l.length >= NOTIF_PAGE);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [tab, filter, tick]);
  useEffect(loadCounts, [loadCounts, tick]);
  useEffect(
    () =>
      subscribeUserEvents((e) => {
        const x = e as Record<string, unknown>;
        if (e.event === "notification.created") {
          const n = Number(x.unread_count);
          if (Number.isFinite(n)) setUnreadCount(n);
          const row = richNotificationOf(x.notification ?? x);
          if (row && (tab === "all" || row.category === tab)) setItems((cur) => (cur && !cur.some((y) => y.id === row.id) ? [row, ...cur] : cur));
          loadCounts();
        } else if (e.event === "notification.read") {
          const id = String(x.notification_id ?? "");
          setItems((cur) => (cur ?? []).map((y) => (y.id === id || y.ids.includes(id) ? { ...y, read: true } : y)));
          loadCounts();
        } else if (e.event === "notifications.read_all") {
          setItems((cur) => (cur ?? []).map((y) => ({ ...y, read: true })));
          loadCounts();
        }
      }),
    [tab, loadCounts],
  );

  const rows = useMemo(() => (items ?? []).map((n) => ({ n, ...textOf(n) })), [items, textOf]);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(({ n, title, body }) => !needle || [title, body, n.event].some((s) => s.toLowerCase().includes(needle)));
  const current = shown.find((r) => r.n.id === sel) ?? null;
  const unreadOf = (c: NotifTab) => (!counts ? 0 : c === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[c as keyof NotifCategoryCounts] ?? 0));
  const linkOf = (n: RichNotification) => notifLink(n.event, n.category, n.data, session?.role ?? "", hasAdminAccess(session), isCallCenterUser(session));

  async function read(n: RichNotification) {
    if (n.read) return;
    setItems((l) => (l ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    announceRead();
    await Promise.all((n.ids.length ? n.ids : [n.id]).map((id) => markNotificationRead(id).catch(() => undefined)));
    loadCounts();
  }
  async function unread(n: RichNotification) {
    // The backend keeps no "unread again"; the row only looks unread here.
    setItems((l) => (l ?? []).map((x) => (x.id === n.id ? { ...x, read: false } : x)));
  }
  async function readAll() {
    const ids = shown.filter((r) => !r.n.read).map((r) => r.n);
    if (!ids.length) return;
    setItems((l) => (l ?? []).map((x) => (ids.some((y) => y.id === x.id) ? { ...x, read: true } : x)));
    announceRead();
    if (tab === "all" && !needle) await markAllNotificationsRead().catch(() => undefined);
    else await Promise.all(ids.flatMap((n) => (n.ids.length ? n.ids : [n.id])).map((id) => markNotificationRead(id).catch(() => undefined)));
    loadCounts();
  }
  async function loadMore() {
    const next = await listNotificationsRich({ category: tab === "all" ? undefined : tab, unreadOnly: filter === "unread", limit: NOTIF_PAGE, offset: (items ?? []).length }).catch(() => []);
    setItems((cur) => {
      const seen = new Set((cur ?? []).map((x) => x.id));
      return [...(cur ?? []), ...next.filter((x) => !seen.has(x.id))];
    });
    setMore(next.length >= NOTIF_PAGE);
  }
  const open = (n: RichNotification) => {
    void read(n);
    const link = linkOf(n);
    if (link) openLink({ appId: "", route: link });
  };
  const rowMenu = (e: MouseEvent, n: RichNotification, title: string) =>
    menu?.(e, title, [
      ...(linkOf(n) ? [{ id: "open", label: t("open"), icon: <IconArrowRight />, onSelect: () => open(n) }] : []),
      n.read ? { id: "u", label: d("markUnread"), icon: <IconBell />, onSelect: () => void unread(n) } : { id: "r", label: d("markRead"), icon: <IconCheckDouble />, onSelect: () => void read(n) },
    ]);

  const sections: NavSection[] = [{ id: "c", title: os === "mac" ? d("mailboxes") : undefined, items: NOTIF_CATEGORIES.map((c) => ({ id: c, label: t(`tabs.${c}`), icon: ICONS[c], count: unreadOf(c) || undefined })) }];
  const chLabel = (c: string) => (t.has(`channel.${c}`) ? t(`channel.${c}`) : humanizeSlug(c));

  return (
    <App name="notes" sidebar={<Sidebar label={t("title")} sections={sections} value={tab} onChange={(id) => (setTab(id as NotifTab), setSel(""))} header={os === "win" ? <Search value={q} onChange={setQ} placeholder={t("searchPh")} wide /> : undefined} />}>
      <Toolbar title={t(`tabs.${tab}`)} subtitle={unreadOf(tab) ? t("unreadN", { n: unreadOf(tab) }) : d("allRead")} end={os === "mac" ? <Search value={q} onChange={setQ} placeholder={t("searchPh")} /> : undefined}>
        <Tool icon={<IconCheckDouble />} label={t("markAll")} onClick={() => void readAll()} disabled={!shown.some((r) => !r.n.read)} />
        <Tool icon={<IconRefresh />} label={t("refresh")} onClick={() => setTick((n) => n + 1)} />
        {os === "win" ? <span className="dx-sep" aria-hidden /> : null}
        <Seg
          label={t("filterLabel")}
          small
          value={filter}
          onChange={setFilter}
          items={[
            { id: "all", label: t("filter.all") },
            { id: "unread", label: t("filter.unread") },
          ]}
        />
      </Toolbar>
      <div className="dxn-body">
        <section className="dxn-list" aria-label={t("aria")}>
          {items === null ? (
            failed ? (
              <Empty icon={<IconAlert />} title={t("loadError")} action={<Btn onClick={() => setTick((n) => n + 1)}>{t("refresh")}</Btn>} />
            ) : (
              <Loading label={d("loading")} />
            )
          ) : !shown.length ? (
            <Empty icon={<IconBell />} title={needle || tab !== "all" || filter !== "all" ? t("noMatch") : t("empty")} text={needle || tab !== "all" ? t("noMatchText") : t("emptyText")} />
          ) : (
            <div className="dxn-scroll" role="listbox" aria-label={t("aria")}>
              {shown.map(({ n, title, body }) => (
                <div
                  key={n.id}
                  role="option"
                  tabIndex={sel === n.id ? 0 : -1}
                  aria-selected={sel === n.id}
                  className={`dxn-row${sel === n.id ? " is-on" : ""}${n.read ? "" : " is-new"}`}
                  onClick={() => {
                    setSel(n.id);
                    void read(n);
                  }}
                  onDoubleClick={() => open(n)}
                  onContextMenu={(e) => (e.preventDefault(), setSel(n.id), rowMenu(e, n, title))}
                >
                  <i className="dxn-dot" aria-hidden />
                  <span className={`dxn-ic dxn-ic--${n.category}`} aria-hidden>
                    {ICONS[n.category]}
                  </span>
                  <span className="dxn-t">
                    <span className="dxn-top">
                      <b>{title || "—"}</b>
                      <time>{shortDateTime(n.createdAt, locale)}</time>
                    </span>
                    <small>{body}</small>
                  </span>
                </div>
              ))}
              {more ? (
                <div className="dxn-more">
                  <Btn small onClick={() => void loadMore()}>
                    {t("loadMore")}
                  </Btn>
                </div>
              ) : null}
            </div>
          )}
        </section>
        <article className="dxn-read" aria-label={current?.title ?? t("title")}>
          {current ? (
            <>
              <header>
                <span className={`dxn-ic dxn-ic--${current.n.category} is-big`} aria-hidden>
                  {ICONS[current.n.category]}
                </span>
                <div>
                  <h2>{current.title || "—"}</h2>
                  <p>
                    {t(`tabs.${current.n.category}`)} · {shortDateTime(current.n.createdAt, locale)}
                  </p>
                </div>
              </header>
              <p className="dxn-body__text">{current.body}</p>
              {current.n.deliveries.length ? (
                <div className="dxn-via">
                  <b>{t("deliveryLabel")}</b>
                  <span>
                    {current.n.deliveries
                      .filter((x) => x.status)
                      .map((x) => (
                        <Tag key={x.channel} tone={x.tone === "delivered" ? "ok" : x.tone === "failed" ? "err" : x.tone === "pending" ? "warn" : "neutral"}>
                          {chLabel(x.channel)} · {x.tone === "unknown" ? humanizeSlug(x.status) : t(`delivery.${x.tone}`)}
                        </Tag>
                      ))}
                  </span>
                </div>
              ) : null}
              <footer>
                {linkOf(current.n) ? (
                  <Btn kind="primary" icon={<IconArrowRight />} onClick={() => open(current.n)}>
                    {t("open")}
                  </Btn>
                ) : null}
                <Btn onClick={() => void (current.n.read ? unread(current.n) : read(current.n))}>{current.n.read ? d("markUnread") : d("markRead")}</Btn>
              </footer>
            </>
          ) : (
            <Empty icon={<IconBell />} title={d("pick")} text={unreadOf("all") ? t("unreadN", { n: unreadOf("all") }) : undefined} />
          )}
        </article>
      </div>
    </App>
  );
}
