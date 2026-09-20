"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { shortDateTime } from "@/lib/date";
import { markNotificationRead, markAllNotificationsRead, type NotificationDelivery } from "@/lib/services/backend";
import { listNotificationsRich, getNotificationCategoryCounts, type RichNotification, type NotifCategoryCounts } from "@/lib/services/notify";
import { NOTIF_CATEGORIES, templateVars, notifLink, type NotifTab, type NotifCategory } from "@/lib/notifications";
import { useOrderStatusLabel } from "@/lib/orderStatus";
import { humanizeSlug } from "@/lib/lawyers";
import Select from "@/components/Select";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "./DataState";
import { IconBell, IconChat, IconCheckDouble, IconRefresh, IconSearch } from "@/components/icons";

// Fired whenever notifications are read so the header bell can refresh its
// unread count without a full reload.
export const NOTIF_READ_EVENT = "lexgo:notif-read";
function announceRead() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIF_READ_EVENT));
}

// End users only see delivery on external channels they can check. SMS is a
// critical-event fallback that may never be sent, and in-app is what they are
// reading, so neither is shown.
const INBOX_CHANNELS = ["push", "telegram", "email"];
// Channels listed under a folded event ("via Push, Telegram").
const VIA_CHANNELS = ["push", "telegram", "email", "sms", "secure_chat", "meeting_invite"];

type ReadFilter = "all" | "unread" | "read";

// Delivery chips ("Telegram · Waiting for delivery"); queued/not configured
// read as waiting, unknown statuses stay neutral. `channels` limits which
// channels are shown; entries without a status are skipped.
export function DeliveryChips({ items, channels }: { items: NotificationDelivery[]; channels?: string[] }) {
  const t = useTranslations("portal.notifications");
  const shown = items.filter((x) => x.status && (!channels || channels.includes(x.channel)));
  if (!shown.length) return null;
  const chLabel = (c: string) => (t.has(`channel.${c}`) ? t(`channel.${c}`) : humanizeSlug(c));
  const stLabel = (x: NotificationDelivery) =>
    x.tone === "unknown" ? humanizeSlug(x.status) || t("delivery.unknown") : t(`delivery.${x.tone}`);
  return (
    <span className="ntchs" aria-label={t("deliveryLabel")}>
      {shown.map((x) => (
        <span key={x.channel} className={`ntch ntch--${x.tone}`}>
          {chLabel(x.channel)} · {stLabel(x)}
        </span>
      ))}
    </span>
  );
}

// Title/body shown for a row: the client-side template for the event when
// one exists (portal.notifications.events.<event>), else the backend text.
function useNotifText() {
  const t = useTranslations("portal.notifications");
  const statusLabel = useOrderStatusLabel();
  return useCallback(
    (n: RichNotification): { title: string; body: string } => {
      const ev = n.event;
      if (!ev || !(t.has(`events.${ev}.title`) || t.has(`events.${ev}.body`))) return { title: n.title, body: n.body };
      const vars = templateVars(n.data, n.title, n.body);
      vars.status = vars.status ? statusLabel(vars.status) : "—";
      vars.paymentStatus = vars.paymentStatus
        ? t.has(`paymentStatus.${vars.paymentStatus}`) ? t(`paymentStatus.${vars.paymentStatus}`) : humanizeSlug(vars.paymentStatus)
        : "—";
      if (ev === "secure_chat_message" && n.data.is_blocked === true) vars.body = t("events.secure_chat_message.blocked");
      return {
        title: t.has(`events.${ev}.title`) ? t(`events.${ev}.title`, vars) : n.title,
        body: t.has(`events.${ev}.body`) ? t(`events.${ev}.body`, vars) : n.body,
      };
    },
    [t, statusLabel],
  );
}

export default function NotificationsPanel() {
  const t = useTranslations("portal.notifications");
  const locale = useLocale();
  const { session } = useAuth();
  const role = session?.role ?? "";
  const textOf = useNotifText();
  const fmt = (s: string) => shortDateTime(s, locale);
  const [items, setItems] = useState<RichNotification[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<NotifTab>("all");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ReadFilter>("all");
  // Per-category unread counts for the tab badges (GET /notifications/categories,
  // 2026-09-19 backend) — kept separate from `items` since it's a global
  // aggregate, not scoped to the current tab/read filter.
  const [catCounts, setCatCounts] = useState<NotifCategoryCounts | null>(null);
  const loadCounts = useCallback(() => {
    getNotificationCategoryCounts().then(setCatCounts).catch(() => {});
  }, []);

  // Server-side filtering (2026-09-19 backend): category and unread_only are
  // real query params now, so the tab/read-filter switch refetches instead of
  // filtering an already-fetched full list. Back to "loading" as soon as the
  // filter changes (during render, not in the effect below, so there is no
  // extra cascading render — same pattern as lib/useResource.ts).
  const filterKey = `${tab}|${filter}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setStatus("loading");
  }
  useEffect(() => {
    let alive = true;
    listNotificationsRich({ category: tab === "all" ? undefined : tab, unreadOnly: filter === "unread" })
      .then((d) => alive && (setItems(d), setStatus("ready")))
      .catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, [tab, filter]);

  useEffect(loadCounts, [loadCounts]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const d = await listNotificationsRich({ category: tab === "all" ? undefined : tab, unreadOnly: filter === "unread" });
      setItems(d);
      setStatus("ready");
      loadCounts();
    } catch {
      if (!items.length) setStatus("error");
    } finally {
      setRefreshing(false);
    }
  }

  // Rows with their display text, so search and rendering agree.
  const rows = useMemo(() => items.map((n) => ({ n, ...textOf(n) })), [items, textOf]);
  // Tab badges come from the server aggregate, not the currently-fetched
  // (already tab/read-filtered) `items` — it always reflects every category.
  const unreadBy: Record<NotifTab, number> = {
    all: catCounts ? Object.values(catCounts).reduce((a, b) => a + b, 0) : 0,
    orders: catCounts?.orders ?? 0,
    payments: catCounts?.payments ?? 0,
    chat: catCounts?.chat ?? 0,
    documents: catCounts?.documents ?? 0,
    system: catCounts?.system ?? 0,
    marketing: catCounts?.marketing ?? 0,
  };
  const needle = q.trim().toLowerCase();
  // Category and unread_only are already applied server-side; only the free-text
  // search and the "read only" filter (no server param for that) run here.
  const shown = rows.filter(({ n, title, body }) => {
    if (filter === "read" && !n.read) return false;
    if (!needle) return true;
    return [title, body, n.title, n.body, n.event].some((s) => s.toLowerCase().includes(needle));
  });
  const shownUnread = shown.filter(({ n }) => !n.read);
  const narrowed = tab !== "all" || !!needle || filter !== "all";

  // Read actions update the list in place — no refetch, so the page doesn't
  // flash/scroll — and notify the bell to refresh its badge.
  async function readOne(n: RichNotification) {
    if (n.read) return;
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    announceRead();
    try {
      // A folded event marks every per-channel row it stands for.
      await Promise.all((n.ids.length ? n.ids : [n.id]).map((id) => markNotificationRead(id)));
    } catch {
      /* ignore — optimistic */
    } finally {
      loadCounts();
    }
  }
  async function readAll() {
    if (!shownUnread.length) return;
    const ids = new Set(shownUnread.map(({ n }) => n.id));
    setItems((list) => list.map((x) => (ids.has(x.id) ? { ...x, read: true } : x)));
    announceRead();
    try {
      // Only "every notification" maps to the read-all endpoint; a narrowed
      // view marks just the rows it shows.
      if (!narrowed || (tab === "all" && !needle && filter === "unread")) await markAllNotificationsRead();
      else await Promise.all(shownUnread.flatMap(({ n }) => (n.ids.length ? n.ids : [n.id])).map((id) => markNotificationRead(id)));
    } catch {
      /* ignore — optimistic */
    } finally {
      loadCounts();
    }
  }

  const chLabel = (c: string) => (t.has(`channel.${c}`) ? t(`channel.${c}`) : humanizeSlug(c));
  const catLabel = (c: NotifCategory) => t(`tabs.${c}`);
  const filterOpts = (["all", "unread", "read"] as ReadFilter[]).map((v) => ({ value: v, label: t(`filter.${v}`) }));

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconBell /></span>{t("title")}</b>
        <span className="ahdr">
          {unreadBy.all ? <span className="advmuted">{t("unreadN", { n: unreadBy.all })}</span> : null}
          <button className="btn btn--line btn--sm" type="button" onClick={refresh} disabled={refreshing} aria-label={t("refresh")} title={t("refresh")}>
            <IconRefresh />
          </button>
          {shownUnread.length ? (
            <button className="btn btn--soft btn--sm" type="button" onClick={readAll}>
              <IconCheckDouble />
              {narrowed ? t("markShown") : t("markAll")}
            </button>
          ) : null}
        </span>
      </div>

      <div className="segs segs--sm ntabs" role="tablist" aria-label={t("title")}>
        {NOTIF_CATEGORIES.map((c) => (
          <button key={c} type="button" role="tab" className="seg" aria-selected={tab === c} onClick={() => setTab(c)}>
            {t(`tabs.${c}`)}
            {unreadBy[c] ? <span className="ntab__n">{unreadBy[c] > 99 ? "99+" : unreadBy[c]}</span> : null}
          </button>
        ))}
      </div>
      <div className="lfilters ntfilters">
        <div className="lsearch"><IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} /></div>
        <Select value={filter} onChange={(v) => setFilter(v as ReadFilter)} options={filterOpts} ariaLabel={t("filterLabel")} />
      </div>

      {status === "loading" ? (
        <Skeleton rows={4} />
      ) : status === "error" ? (
        <Notice ok={false} msg={t("loadError")} />
      ) : !items.length ? (
        <EmptyState icon={<IconChat />} title={t("empty")} text={t("emptyText")} />
      ) : !shown.length ? (
        <EmptyState icon={<IconSearch />} title={t("noMatch")} text={t("noMatchText")} />
      ) : (
        <div className="ntlist">
          {shown.map(({ n, title, body }) => {
            const link = notifLink(n.event, n.category, n.data, role);
            const via = n.channels.filter((c) => VIA_CHANNELS.includes(c)).map(chLabel);
            return (
              <div key={n.id} className="ntrow">
                <button
                  type="button"
                  className={`ntitem${n.read ? "" : " ntitem--unread"}`}
                  onClick={() => readOne(n)}
                >
                  <span className="ntitem__dot" aria-hidden />
                  <div className="ntitem__m">
                    <div className="ntitem__top">
                      <b>{title}</b>
                      <i className={`atag ntitem__cat ntitem__cat--${n.category}`}>{catLabel(n.category)}</i>
                    </div>
                    {body ? <span>{body}</span> : null}
                    <DeliveryChips items={n.deliveries} channels={INBOX_CHANNELS} />
                    <em>
                      {fmt(n.createdAt)}
                      {via.length ? ` · ${t("viaChannels", { list: via.join(", ") })}` : ""}
                    </em>
                  </div>
                </button>
                {link ? (
                  <Link href={link} className="btn btn--line btn--sm ntitem__go" onClick={() => readOne(n)}>
                    {t("open")}
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
