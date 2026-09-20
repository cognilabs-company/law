// Notification inbox with the event/channel/data the backend row carries
// (lib/services/backend.listNotifications drops them), plus the admin send.
//
// GET /notifications → NotificationInboxOut[]: {id, title, body, kind, read,
// data, meta, created_at}. `kind` is the delivery channel (the cascade writes
// one row per channel), `data`/`meta` are the same payload with `event` and
// the ids the event is about (order_id, payment_id, room_id …).
import { http, asDict, asStr, asNum, asArr, type Dict } from "@/lib/http";
import { normChannel, normDeliveries, type NotificationDelivery } from "@/lib/services/backend";
import { categoryOf, isNotifChannel, type NotifCategory } from "@/lib/notifications";

export type RichNotification = {
  id: string; // the in_app row when the event was folded, else the first row
  ids: string[]; // every backend row folded into this item (per-channel rows)
  title: string;
  body: string;
  event: string; // "" when the row carries no event (admin-sent, legacy)
  kind: string; // raw backend kind (a channel today)
  channel: string; // normalized channel of the representative row
  channels: string[]; // every channel the event was delivered on
  category: NotifCategory;
  data: Dict;
  read: boolean; // every folded row read
  createdAt: string; // earliest row of the fold
  deliveries: NotificationDelivery[];
};

function parseJsonDict(v: unknown): Dict {
  if (typeof v !== "string") return asDict(v);
  try {
    return asDict(JSON.parse(v));
  } catch {
    return {};
  }
}

function normRow(v: unknown): RichNotification {
  const d = asDict(v);
  const meta = parseJsonDict(d.meta ?? d.metadata);
  const data = { ...meta, ...parseJsonDict(d.data) };
  const kind = asStr(d.kind ?? d.type).trim();
  // `kind` is the channel today; a future backend may put a real kind there.
  const rawChannel = asStr(d.channel ?? d.channel_type ?? meta.channel).trim() || (isNotifChannel(normChannel(kind)) ? kind : "");
  const channel = normChannel(rawChannel);
  const event = asStr(data.event ?? d.event ?? d.event_type ?? (kind && !isNotifChannel(normChannel(kind)) ? kind : "")).trim();
  const id = asStr(d.id);
  const title = asStr(d.title);
  const status = asStr(d.status).trim().toLowerCase();
  return {
    id,
    ids: id ? [id] : [],
    title,
    body: asStr(d.body ?? d.message),
    event,
    kind,
    channel,
    channels: channel ? [channel] : [],
    category: categoryOf(event, channel, title, data),
    data,
    read: typeof d.read === "boolean" ? d.read : typeof d.is_read === "boolean" ? d.is_read : status === "read",
    createdAt: asStr(d.created_at ?? d.createdAt),
    deliveries: normDeliveries(d),
  };
}

// Stable key of what an event is about: the payload minus the event name.
function dataKey(data: Dict): string {
  const keys = Object.keys(data).filter((k) => k !== "event").sort();
  return JSON.stringify(keys.map((k) => [k, data[k]]));
}

// The cascade stores one row per channel for one event, all with the same
// title/body/payload and (nearly) the same created_at. Fold those into one
// item: rows with the same event + payload (or, without an event, the same
// title + body) within one minute of the fold's first row, never two rows on
// the same channel (that is a second occurrence of the same event). The in_app
// row becomes the representative (its id, title, body); channels are counted.
const FOLD_WINDOW_MS = 60_000;
export function foldNotifications(rows: RichNotification[]): RichNotification[] {
  type Fold = { rep: RichNotification; members: RichNotification[]; anchor: number; seen: Set<string> };
  const folds: Fold[] = [];
  const byKey = new Map<string, Fold[]>();
  for (const n of rows) {
    const key = n.event ? `e:${n.event}|${dataKey(n.data)}` : `t:${n.title}|${n.body}`;
    const t = Date.parse(n.createdAt);
    let target: Fold | undefined;
    if (Number.isFinite(t)) {
      let best = Infinity;
      for (const f of byKey.get(key) ?? []) {
        if (n.channel && f.seen.has(n.channel)) continue;
        const gap = Math.abs(t - f.anchor);
        if (gap <= FOLD_WINDOW_MS && gap < best) {
          best = gap;
          target = f;
        }
      }
    }
    if (target) {
      target.members.push(n);
      if (n.channel) target.seen.add(n.channel);
      continue;
    }
    const f: Fold = { rep: n, members: [n], anchor: Number.isFinite(t) ? t : 0, seen: new Set(n.channel ? [n.channel] : []) };
    folds.push(f);
    byKey.set(key, [...(byKey.get(key) ?? []), f]);
  }
  return folds.map(({ members }) => {
    const rep = members.find((m) => m.channel === "in_app") ?? members[0];
    const channels: string[] = [];
    for (const m of members) for (const c of m.channels) if (c && !channels.includes(c)) channels.push(c);
    const byChannel = new Map<string, NotificationDelivery>();
    for (const m of members) for (const x of m.deliveries) byChannel.set(x.channel, x);
    let createdAt = rep.createdAt;
    let earliest = Date.parse(createdAt);
    for (const m of members) {
      const mt = Date.parse(m.createdAt);
      if (Number.isFinite(mt) && (!Number.isFinite(earliest) || mt < earliest)) {
        earliest = mt;
        createdAt = m.createdAt;
      }
    }
    const data = members.reduce<Dict>((acc, m) => ({ ...acc, ...m.data }), {});
    return {
      ...rep,
      ids: members.flatMap((m) => m.ids),
      channels,
      data,
      category: categoryOf(rep.event, channels, rep.title, data),
      read: members.every((m) => m.read),
      createdAt,
      deliveries: [...byChannel.values()],
    };
  });
}

// `?category=&role=&unread_only=` — omitted when not set (2026-09-19 backend:
// GET /notifications now filters server-side on these).
export type NotifListFilter = { category?: NotifCategory; role?: string; unreadOnly?: boolean };
function notifQuery(f?: NotifListFilter): string {
  if (!f) return "";
  const qs = new URLSearchParams();
  if (f.category) qs.set("category", f.category);
  if (f.role) qs.set("role", f.role);
  if (f.unreadOnly) qs.set("unread_only", "true");
  const q = qs.toString();
  return q ? `?${q}` : "";
}

// Inbox with events kept and per-channel copies folded. Newest first (the
// backend orders by created_at desc; folds keep the first row's position).
export async function listNotificationsRich(filter?: NotifListFilter): Promise<RichNotification[]> {
  const raw = await http(`/notifications${notifQuery(filter)}`);
  const list = Array.isArray(raw) ? raw : asArr(asDict(raw).items ?? asDict(raw).data ?? asDict(raw).notifications);
  return foldNotifications(list.map(normRow));
}

// GET /notifications/categories → per-category counts for the inbox tabs
// (2026-09-19 backend). Shape isn't nailed down 1:1 by the doc, so this reads
// either a flat {category: count} dict or a {category, count}[] list.
export type NotifCategoryCounts = Record<NotifCategory, number>;
export async function getNotificationCategoryCounts(): Promise<NotifCategoryCounts> {
  const raw = await http("/notifications/categories");
  const out = { orders: 0, payments: 0, chat: 0, documents: 0, system: 0, marketing: 0 } as NotifCategoryCounts;
  const rows = Array.isArray(raw) ? raw : asArr(asDict(raw).items ?? asDict(raw).categories ?? asDict(raw).data);
  if (rows.length) {
    for (const row of rows) {
      const d = asDict(row);
      const cat = asStr(d.category ?? d.name ?? d.key).trim().toLowerCase() as NotifCategory;
      if (cat in out) out[cat] = asNum(d.count ?? d.unread ?? d.unread_count ?? d.value);
    }
  } else {
    const d = asDict(raw);
    for (const cat of Object.keys(out) as NotifCategory[]) if (cat in d) out[cat] = asNum(d[cat]);
  }
  return out;
}

// ── Admin send ────────────────────────────────────────────────────
// POST /admin/notifications (NotificationCreate: user_id | audience_role,
// channel, title, body, category — `category` and `audience_role` are real,
// stored top-level fields as of the 2026-09-19 backend deploy, confirmed live
// in production). Exactly one of `userId` / `audienceRole` is sent: a role
// broadcast fans out server-side, so the frontend makes a single call.
export type AdminSendInput = {
  userId?: string;
  audienceRole?: string;
  channel: string;
  title: string;
  body: string;
  category?: NotifCategory;
};
export type AdminSendResult = { id: string; deliveries: NotificationDelivery[] };
export async function sendAdminNotification(input: AdminSendInput): Promise<AdminSendResult> {
  const body: Dict = {
    channel: input.channel,
    title: input.title,
    body: input.body,
    ...(input.audienceRole ? { audience_role: input.audienceRole } : { user_id: input.userId }),
    ...(input.category ? { category: input.category } : {}),
  };
  const raw = await http("/admin/notifications", { method: "POST", body: JSON.stringify(body) });
  const d = asDict(raw);
  const top = normDeliveries(raw);
  return {
    id: asStr(d.id ?? asDict(d.notification).id),
    deliveries: top.length ? top : normDeliveries(d.notification ?? d, input.channel),
  };
}
