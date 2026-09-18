// Notification categories and client-side classification of inbox rows.
//
// The backend inbox (GET /notifications, NotificationInboxOut) stores one row
// per delivery channel: `kind` is the channel (in_app, push, telegram, email,
// sms, secure_chat, meeting_invite) and the event name lives only in
// data.event / meta.event (notification_service.notify puts `event` into the
// meta payload). Rows created by POST /admin/notifications carry no meta at
// all, so the title is the only hint for those — hence the title heuristics.
import { asNum, asStr, type Dict } from "@/lib/http";
import { fmtUzs } from "@/lib/money";

export const NOTIF_CATEGORIES = ["all", "orders", "payments", "chat", "documents", "system", "marketing"] as const;
export type NotifTab = (typeof NOTIF_CATEGORIES)[number];
export type NotifCategory = Exclude<NotifTab, "all">;
// Categories a row can belong to (the "all" tab is a view, not a category).
export const NOTIF_ROW_CATEGORIES = NOTIF_CATEGORIES.filter((c): c is NotifCategory => c !== "all");

// Channel tokens the backend uses as `kind` on inbox rows.
export const NOTIF_CHANNELS = ["in_app", "push", "telegram", "email", "sms", "secure_chat", "meeting_invite"] as const;
const CHANNEL_SET = new Set<string>(NOTIF_CHANNELS);
export const isNotifChannel = (v: string): boolean => CHANNEL_SET.has(v);

// Exact event → category (marketplace_routes.py notify_user calls).
const EVENT_CATEGORY: Record<string, NotifCategory> = {
  order_created: "orders",
  order_assigned: "orders",
  order_accepted: "orders",
  order_declined: "orders",
  order_status_changed: "orders",
  sos_request: "orders",
  payment_paid: "payments",
  order_payment_updated: "payments",
  milestone_paid: "payments",
  milestone_released: "payments",
  document_payment_created: "payments",
  document_request_created: "documents",
  document_request_file_ready: "documents",
  contract_signature_otp: "documents",
  secure_chat_message: "chat",
  meeting_invite: "chat",
  upsell_redeemed: "marketing",
  seller_register_approved: "system",
  seller_register_rejected: "system",
};

// Prefix / fragment rules for events that are not listed above (future
// backend events such as subscription_*, identity_*, register_request_*).
const EVENT_RULES: [RegExp, NotifCategory][] = [
  [/^(order|sos|milestone_(created|updated|approved|rejected))/, "orders"],
  [/^(payment|payout|invoice|refund|subscription|milestone|upsell_paid|gift_paid)/, "payments"],
  [/^(secure_chat|chat|message|call|meeting|video|voice)/, "chat"],
  [/^(document|contract|signature|workspace_file|file_)/, "documents"],
  [/^(upsell|promo|campaign|offer|gift|referral|bonus|discount|marketing|academy)/, "marketing"],
  [/^(register|seller_register|identity|security|account|password|2fa|two_factor|login|session|consent|system)/, "system"],
];

// Title fallback for rows without an event (admin-sent rows, legacy rows).
// Uzbek (Latin, both apostrophes), Russian and English words.
const TITLE_RULES: [RegExp, NotifCategory][] = [
  [/buyurtma|заказ|order|sos|bosqich|milestone/i, "orders"],
  [/to['‘’ʼ]?lov|оплат|платеж|платёж|payment|obuna|подписк|subscription|chek|чек|receipt|invoice|hisob/i, "payments"],
  [/xabar|сообщени|message|chat|чат|qo['‘’ʼ]?ng['‘’ʼ]?iroq|звонок|звонк|\bcall\b|uchrashuv|встреч|meeting|video|видео/i, "chat"],
  [/hujjat|документ|document|shartnoma|договор|contract|imzo|подпис|sign/i, "documents"],
  [/taklif|предложен|offer|aksiya|акци|promo|chegirma|скидк|discount|sovg['‘’ʼ]?a|подар|gift|referal|referral|реферал|bonus|бонус/i, "marketing"],
];

// Category of a row: the event name wins, then the delivery channel (secure
// chat / meeting invite rows are chat), then the title text; "system" otherwise.
// `data` refines calendar events: a call/meeting entry belongs to chat & calls.
export function categoryOf(event: string, channel: string | string[], title: string, data?: Dict): NotifCategory {
  const ev = (event || "").trim().toLowerCase();
  // An explicit category in the payload of an event-less row (admin sends put
  // data.category there; the backend does not store it yet, but honour it once
  // it does). Event rows keep their own `category` field (sos_request: the SOS type).
  const explicit = ev ? "" : asStr(data?.category).trim().toLowerCase();
  if (NOTIF_ROW_CATEGORIES.includes(explicit as NotifCategory)) return explicit as NotifCategory;
  if (ev) {
    const exact = EVENT_CATEGORY[ev];
    if (exact) return exact;
    if (ev.startsWith("calendar_event")) {
      return /call|meeting|video|uchrashuv|qo.?ng.?iroq|встреч|звон/i.test(asStr(data?.type)) ? "chat" : "system";
    }
    for (const [re, cat] of EVENT_RULES) if (re.test(ev)) return cat;
  }
  const channels = (Array.isArray(channel) ? channel : [channel]).map((c) => (c || "").trim().toLowerCase());
  if (channels.some((c) => c === "secure_chat" || c === "meeting_invite")) return "chat";
  const tt = (title || "").trim();
  if (tt) for (const [re, cat] of TITLE_RULES) if (re.test(tt)) return cat;
  return "system";
}

// Short, readable id for templates ("#a1b2c3d4"): UUIDs are cut to 8 chars,
// short ids stay as they are.
export function shortId(id: unknown): string {
  const s = asStr(id).trim();
  if (!s) return "";
  return s.length > 12 ? s.slice(0, 8) : s;
}

// Values for the client-side event templates (portal.notifications.events.*).
// Every value is a string; the component translates `status`/`paymentStatus`
// before rendering. `body` is the backend body so a template can quote it.
export type NotifTemplateVars = {
  body: string;
  title: string;
  order: string;
  status: string;
  paymentStatus: string;
  amount: string;
  doc: string;
  milestone: string;
  caller: string;
  service: string;
  category: string;
  region: string;
  offer: string;
  reason: string;
  eventTitle: string;
  sos: string; // "category, region" of an SOS request
};
export function templateVars(data: Dict, title: string, body: string): NotifTemplateVars {
  // Backend `payment_paid` body is "<amount> <currency>"; document_payment_created carries data.amount.
  let amount = "";
  if (typeof data.amount === "number" || (typeof data.amount === "string" && data.amount.trim() !== "")) amount = fmtUzs(asNum(data.amount));
  else {
    const m = body.trim().match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-z]{3})?$/);
    amount = m ? fmtUzs(asNum(m[1].replace(",", "."))) : body;
  }
  return {
    body,
    title,
    order: shortId(data.order_id),
    status: asStr(data.status).trim(),
    paymentStatus: asStr(data.payment_status).trim(),
    amount,
    doc: body,
    milestone: body,
    caller: asStr(data.caller_name).trim() || body,
    service: body,
    category: asStr(data.category).trim() || body,
    region: asStr(data.region).trim(),
    offer: body,
    reason: body,
    eventTitle: asStr(data.title).trim() || body,
    sos: [asStr(data.category).trim() || body, asStr(data.region).trim()].filter(Boolean).join(", "),
  };
}

// Portal route a notification can open, or "" when there is no fitting page.
// `role` is the UI role (client | lawyer | advocate) that prefixes portal URLs.
export function notifLink(event: string, category: NotifCategory, data: Dict, role: string): string {
  const roomId = asStr(data.room_id).trim();
  if (roomId && (event === "secure_chat_message" || event === "meeting_invite" || category === "chat")) {
    const callId = asStr(data.call_id).trim();
    return `/portal/chat/${roomId}${event === "meeting_invite" && callId ? `?join=${encodeURIComponent(callId)}` : ""}`;
  }
  if (!role) return "";
  if (event.startsWith("calendar_event") && role !== "client") return `/portal/${role}/calendar`;
  if (category === "orders") return `/portal/${role}/cases`;
  if (category === "payments") return role === "client" ? "/portal/client/payments" : `/portal/${role}/cases`;
  if (category === "documents") return role === "client" ? "/portal/client/documents" : `/portal/${role}/workspace`;
  if (category === "chat") return role === "client" ? "/portal/client/messages" : role === "lawyer" ? "/portal/lawyer/chat" : "/portal/advocate/messages";
  if (event === "upsell_redeemed" && role !== "client") return `/portal/${role}/promotion`;
  return "";
}
