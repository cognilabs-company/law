"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
  type NotificationDelivery,
} from "@/lib/services/backend";
import { humanizeSlug } from "@/lib/lawyers";
import { Skeleton, EmptyState } from "./DataState";
import { IconChat, IconCheckDouble } from "@/components/icons";

// Fired whenever notifications are read so the header bell can refresh its
// unread count without a full reload.
export const NOTIF_READ_EVENT = "lexgo:notif-read";
function announceRead() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIF_READ_EVENT));
}

function fmt(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// The cascade may store one row per channel (in-app, push, Telegram, email,
// SMS) for one event; fold them so the inbox shows the event once. Rows that
// carry an explicit event/correlation id are grouped by it. Otherwise rows with
// a channel fold by kind + title + body within 60s (never two rows on the same
// channel). Rows with neither stay as they are.
export function groupByEvent(list: Notification[]): Notification[] {
  const out: Notification[] = [];
  const byId = new Map<string, Notification>();
  const rowChannels = new Map<Notification, Set<string>>();
  const merge = (g: Notification, n: Notification) => {
    g.ids = [...g.ids, ...n.ids.filter((id) => !g.ids.includes(id))];
    const del = new Map(g.deliveries.map((x) => [x.channel, x] as const));
    for (const x of n.deliveries) if (x.status || !del.has(x.channel)) del.set(x.channel, x);
    g.deliveries = [...del.values()];
    g.read = g.read && n.read;
    const gt = Date.parse(g.createdAt);
    const nt = Date.parse(n.createdAt);
    if (Number.isFinite(nt) && (!Number.isFinite(gt) || nt < gt)) g.createdAt = n.createdAt;
    if (n.channel) rowChannels.get(g)?.add(n.channel);
  };
  for (const n of list) {
    if (n.groupId) {
      const g = byId.get(n.groupId);
      if (g) {
        merge(g, n);
        continue;
      }
    } else if (n.channel) {
      const nt = Date.parse(n.createdAt);
      const g = out.find((x) => {
        if (x.groupId || x.kind !== n.kind || x.title !== n.title || x.body !== n.body) return false;
        const seen = rowChannels.get(x);
        if (seen?.has(n.channel)) return false;
        const xt = Date.parse(x.createdAt);
        return Number.isFinite(nt) && Number.isFinite(xt) && Math.abs(nt - xt) <= 60_000;
      });
      if (g) {
        merge(g, n);
        continue;
      }
    }
    const copy: Notification = { ...n, ids: [...n.ids], deliveries: [...n.deliveries] };
    out.push(copy);
    rowChannels.set(copy, new Set(n.channel ? [n.channel] : []));
    if (n.groupId) byId.set(n.groupId, copy);
  }
  return out;
}

// End users only see delivery on external channels they can check. SMS is a
// critical-event fallback that may never be sent, and in-app is what they are
// reading, so neither is shown.
const INBOX_CHANNELS = ["push", "telegram", "email"];

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

export default function NotificationsPanel() {
  const t = useTranslations("portal.notifications");
  const [items, setItems] = useState<Notification[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    listNotifications()
      .then((d) => alive && (setItems(groupByEvent(d)), setStatus("ready")))
      .catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, []);

  const hasUnread = items.some((n) => !n.read);

  // Read actions update the list in place — no refetch, so the page doesn't
  // flash/scroll — and notify the bell to refresh its badge.
  async function readOne(n: Notification) {
    if (n.read) return;
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    announceRead();
    try {
      // A folded event marks every per-channel row it stands for.
      await Promise.all((n.ids.length ? n.ids : [n.id]).map((id) => markNotificationRead(id)));
    } catch {
      /* ignore — optimistic */
    }
  }
  async function readAll() {
    if (!hasUnread) return;
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    announceRead();
    try {
      await markAllNotificationsRead();
    } catch {
      /* ignore — optimistic */
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        {hasUnread ? (
          <button className="btn btn--soft btn--sm" type="button" onClick={readAll}>
            <IconCheckDouble />
            {t("markAll")}
          </button>
        ) : null}
      </div>

      {status === "loading" ? (
        <Skeleton rows={4} />
      ) : !items.length ? (
        <EmptyState icon={<IconChat />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="ntlist">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`ntitem${n.read ? "" : " ntitem--unread"}`}
              onClick={() => readOne(n)}
            >
              <span className="ntitem__dot" aria-hidden />
              <div className="ntitem__m">
                <b>{n.title}</b>
                {n.body ? <span>{n.body}</span> : null}
                <DeliveryChips items={n.deliveries} channels={INBOX_CHANNELS} />
                <em>{fmt(n.createdAt)}</em>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
