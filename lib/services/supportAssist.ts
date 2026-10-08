import { http, asDict, asStr, asNum, asArr, ApiError, isRouteMissing, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";
import { cleanDocTitle } from "@/lib/docTitle";
import { matchesSearch } from "@/lib/searchText";
import { getSubscriptionPlan, getSubscriptionPlans, getUrgentCatalog, planForRole, type BackendPlan, type UrgentService } from "@/lib/services/backend";
import { listMarketplace, normMarketSeller, type MarketSeller } from "@/lib/services/marketplace";

export const ASSIST_BILLING_PERIODS = ["monthly", "six_month", "yearly", "prepaid_yearly"] as const;
export type AssistBillingPeriod = (typeof ASSIST_BILLING_PERIODS)[number];

export const ASSIST_DOC_LANGUAGES = ["uz", "ru", "en"] as const;
export type AssistDocLanguage = (typeof ASSIST_DOC_LANGUAGES)[number];

export const ASSIST_CHANNELS = ["chat", "audio", "video", "meeting"] as const;
export type AssistChannel = (typeof ASSIST_CHANNELS)[number];

export const ASSIST_EVENT_PREFIX = "support.assist_";
export const ASSIST_EVENTS = [
  "support.assist_subscription_preview_created",
  "support.assist_subscription_checkout_created",
  "support.assist_document_request_created",
  "support.assist_marketplace_purchase_requested",
  "support.assist_urgent_advokat_request_created",
] as const;

export const ASSIST_URGENT_KINDS = [
  "video_consultation",
  "express_video_consultation",
  "traffic_accident_consultation",
  "chat_consultation",
  "second_opinion_single",
  "second_opinion_group",
] as const;
export type AssistUrgentKind = (typeof ASSIST_URGENT_KINDS)[number];
export const ASSIST_URGENT_GROUP: AssistUrgentKind = "second_opinion_group";
export const ASSIST_URGENT_NEED_MIN = 10;
export const ASSIST_URGENT_DIRECTIONS: readonly { slug: string; area: string }[] = [
  { slug: "jinoiy", area: "criminal" },
  { slug: "fuqarolik", area: "civil" },
  { slug: "oila", area: "family" },
  { slug: "mehnat", area: "labor" },
  { slug: "mamuriy", area: "administrative" },
  { slug: "iqtisodiy", area: "economic" },
  { slug: "soliq", area: "tax" },
];

const PERIOD_MONTHS: Record<AssistBillingPeriod, number> = { monthly: 1, six_month: 6, yearly: 12, prepaid_yearly: 12 };
const WORK_ID = /^[A-Z]{2,7}-[0-9A-Z]{5,8}$/;
const ASSIST_SOURCE = "callcenter_assist";
const FEATURE_TTL_MS = 10 * 60 * 1000;

export type AssistClient = {
  id: string;
  lexgoId: string;
  role: string;
  name: string;
  phone: string;
  accountStatus: string;
  createdAt: string;
};

export type AssistTicket = {
  id: string;
  workId: string;
  subject: string;
  status: string;
  category: string;
  priority: string;
  createdAt: string;
  lastMessageAt: string;
  operatorUserId: string;
  operatorName: string;
};

export type AssistCapabilities = {
  subscriptionCheckout: boolean;
  documentLawyerRequest: boolean;
  marketplacePurchaseRequest: boolean;
  urgentAdvokatRequest: boolean | null;
  supportCall: boolean;
  operatorTransfer: boolean;
};

export type AssistPayPhase = "" | "pending" | "paid" | "rejected";

export type AssistPayGate = {
  phase: AssistPayPhase;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  telegramSent: boolean | null;
};

export type AssistSubscription = {
  id: string;
  planId: string;
  status: string;
  billingPeriod: string;
  startsAt: string;
  endsAt: string;
};

export type AssistPendingRequest = {
  id: string;
  workId: string;
  status: string;
  planId: string;
  planSlug: string;
  planTitle: string;
  billingPeriod: string;
  months: number;
  amount: number;
  currency: string;
  viaOperator: boolean;
  createdAt: string;
};

export type AssistDocument = {
  id: string;
  workId: string;
  title: string;
  status: string;
  requestedType: string;
  price: number;
  currency: string;
  paid: boolean;
  paymentRequired: boolean;
  gate: AssistPayGate | null;
  viaOperator: boolean;
  createdAt: string;
};

export type AssistOrder = {
  id: string;
  workId: string;
  title: string;
  lawyerName: string;
  status: string;
  paymentStatus: string;
  price: number;
  currency: string;
  viaOperator: boolean;
  createdAt: string;
};

export type AssistAiTurn = { q: string; a: string; at: string };
export type AssistAiHistory = { turns: AssistAiTurn[]; sessionId: string };

export type AssistContext = {
  ticket: AssistTicket | null;
  client: AssistClient | null;
  capabilities: AssistCapabilities;
  activeSubscriptions: AssistSubscription[];
  pendingRequests: AssistPendingRequest[];
  recentDocuments: AssistDocument[];
  recentOrders: AssistOrder[];
  aiHistory: AssistAiHistory;
};

export type AssistPreview = {
  planId: string;
  planSlug: string;
  planTitle: string;
  billingPeriod: string;
  months: number;
  amount: number;
  currency: string;
  baseAmount: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
};

export type AssistCheckout = {
  id: string;
  workId: string;
  status: string;
  paymentId: string;
  planId: string;
  planSlug: string;
  amount: number;
  currency: string;
  telegramSent: boolean;
};

export type AssistDocResult = {
  requestId: string;
  recordId: string;
  workId: string;
  status: string;
  poolStatus: string;
  title: string;
  price: number;
  currency: string;
  paid: boolean;
  paymentRequired: boolean;
  telegramSent: boolean;
  gate: AssistPayGate | null;
  assignmentMode: string;
  poolUrl: string;
  editorSource: string;
  language: string;
  requestedType: string;
};

export type AssistMarketResult = {
  workId: string;
  orderId: string;
  paymentId: string;
  requestId: string;
  status: string;
  orderStatus: string;
  paymentStatus: string;
  nextStatus: string;
  amount: number;
  currency: string;
  telegramSent: boolean;
  sellerAfterPayment: boolean;
  serviceTitle: string;
  lawyerName: string;
  gate: AssistPayGate | null;
};

export type AssistUrgentResult = {
  id: string;
  workId: string;
  status: string;
  serviceKind: string;
  channel: string;
  title: string;
  amount: number;
  currency: string;
  immediateCall: boolean;
  lawyerName: string;
  clientNotified: boolean | null;
  paymentRequired: boolean;
  gate: AssistPayGate | null;
};

export type AssistUrgentInput = { serviceKind: AssistUrgentKind; channel: string; need: string; directions: string[]; lawyerCount?: number };
export type AssistUrgentField = "kind" | "channel" | "count" | "directions" | "need";
export type AssistUrgentCatalog = { services: UrgentService[]; priced: boolean };
export type AssistUrgentRoute = "unknown" | "checking" | "open" | "missing";

export type AssistLive = {
  name: string;
  ids: string[];
  clientIds: string[];
  status: string;
  phase: AssistPayPhase;
  telegramSent: boolean | null;
};

export type AssistBlock = "closed" | "notClient" | "notAssigned" | "missing" | "unavailable";
export type AssistErrorKind = "planMissing" | "planRole" | "period" | "needRequired" | "notApproved";
export type AssistDuplicate = { workId: string; status: string };
export type AssistEvent = { event: string; ticketId: string; clientUserId: string; operatorUserId: string; createdAt: string };

const currencyOf = (...values: unknown[]) => values.map((v) => asStr(v).trim()).find(Boolean) || "UZS";
const titleOf = (v: unknown) => {
  const raw = asStr(v).trim();
  return cleanDocTitle(raw) || raw;
};
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const firstText = (...values: unknown[]): string => values.map(text).find(Boolean) ?? "";
const flag = (v: unknown): boolean | null => (v === true || v === 1 || v === "true" ? true : v === false || v === 0 || v === "false" ? false : null);
const filled = (d: Dict) => Object.keys(d).length > 0;

function dictOf(v: unknown): Dict {
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try {
      return dictOf(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {};
}

function listOf(v: unknown): unknown[] {
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      return asArr(JSON.parse(v));
    } catch {
      return [];
    }
  }
  return asArr(v);
}

export function isAssistPeriod(v: string): v is AssistBillingPeriod {
  return (ASSIST_BILLING_PERIODS as readonly string[]).includes(v);
}

export function isAssistUrgentKind(v: string): v is AssistUrgentKind {
  return (ASSIST_URGENT_KINDS as readonly string[]).includes(v);
}

const PAY_PAID = new Set(["paid", "approved", "confirmed", "succeeded", "success", "captured", "pool_created", "activated"]);
const PAY_WAIT = new Set([
  "pending",
  "pending_payment",
  "payment_pending",
  "payment_required",
  "waiting_payment",
  "awaiting_payment",
  "awaiting_approval",
  "pending_approval",
  "telegram_pending",
  "admin_telegram_confirm_required",
]);
const PAY_STOP = new Set(["rejected", "declined", "cancelled", "canceled", "payment_cancelled", "payment_canceled", "payment_rejected", "failed", "expired", "refunded", "invalid"]);
const DOC_PAY_WAIT = new Set(["payment_required", "pending_payment", "payment_pending", "awaiting_payment", "waiting_payment"]);
const DOC_PAY_STOP = new Set(["payment_cancelled", "payment_canceled", "payment_rejected"]);
const ORDER_PAID = new Set(["paid", "accepted", "started", "in_progress", "completed", "done", "delivered", "closed"]);
const ORDER_WAIT = new Set(["pending_payment", "waiting_payment", "payment_pending", "awaiting_payment"]);
const ORDER_STOP = new Set(["cancelled", "canceled", "rejected", "refunded"]);

export function payPhaseOf(...statuses: unknown[]): AssistPayPhase {
  for (const s of statuses) {
    const v = text(s).toLowerCase();
    if (!v) continue;
    if (PAY_STOP.has(v)) return "rejected";
    if (PAY_PAID.has(v)) return "paid";
    if (PAY_WAIT.has(v)) return "pending";
  }
  return "";
}

const isFinalPhase = (p: AssistPayPhase) => p === "paid" || p === "rejected";

export function pickPayPhase(...phases: AssistPayPhase[]): AssistPayPhase {
  return phases.find(isFinalPhase) ?? (phases.includes("pending") ? "pending" : "");
}

function normPayGate(...sources: Dict[]): AssistPayGate | null {
  for (const src of sources) {
    const g = dictOf(src.payment_gate);
    if (!filled(g)) continue;
    const status = text(g.status);
    return {
      phase: payPhaseOf(status) || (flag(g.required) === true ? "pending" : ""),
      status,
      amount: uzs(g, "amount"),
      currency: currencyOf(g.currency),
      provider: text(g.provider),
      telegramSent: flag(g.telegram_sent),
    };
  }
  return null;
}

const payRequired = (...sources: Dict[]) => sources.some((s) => flag(s.payment_required) === true);

export function docPayPhase(x: { status: string; poolStatus?: string; paid: boolean; paymentRequired: boolean; gate: AssistPayGate | null }): AssistPayPhase {
  const g = x.gate?.phase ?? "";
  if (isFinalPhase(g)) return g;
  const st = [x.status, x.poolStatus ?? ""].map((v) => v.toLowerCase());
  if (st.some((v) => DOC_PAY_STOP.has(v))) return "rejected";
  if (!x.gate && !x.paymentRequired && !st.some((v) => DOC_PAY_WAIT.has(v))) return "";
  return x.paid ? "paid" : "pending";
}

export function orderPayPhase(status: string, paymentStatus: string): AssistPayPhase {
  const p = payPhaseOf(paymentStatus);
  if (p) return p;
  const s = status.toLowerCase();
  if (ORDER_STOP.has(s)) return "rejected";
  if (ORDER_PAID.has(s)) return "paid";
  return ORDER_WAIT.has(s) ? "pending" : "";
}

export function urgentPayPhase(r: { gate: AssistPayGate | null; paymentRequired: boolean }): AssistPayPhase {
  return r.gate?.phase || (r.paymentRequired ? "pending" : "");
}

export function planCtxState(ctx: AssistContext, sent: { id: string; workId: string; planId: string; subsBefore: string[] }): { activated: boolean; pending: boolean } {
  return {
    activated: Boolean(sent.planId) && ctx.activeSubscriptions.some((s) => s.planId === sent.planId && !sent.subsBefore.includes(s.id)),
    pending: ctx.pendingRequests.some((p) => (sent.id && p.id === sent.id) || (sent.workId && p.workId === sent.workId)),
  };
}

export function normAssistClient(v: unknown): AssistClient | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  const parts = [d.first_name, d.last_name].map((x) => asStr(x).trim()).filter(Boolean);
  return {
    id,
    lexgoId: asStr(d.lexgo_id).trim(),
    role: asStr(d.role).trim(),
    name: asStr(d.name).trim() || parts.join(" "),
    phone: asStr(d.phone).trim(),
    accountStatus: asStr(d.account_status).trim(),
    createdAt: asStr(d.created_at),
  };
}

export function normAssistTicket(v: unknown): AssistTicket | null {
  const d = asDict(v);
  const p = asDict(d.payload);
  const id = asStr(d.id ?? d.ticket_id);
  if (!id) return null;
  return {
    id,
    workId: asStr(d.work_id),
    subject: asStr(d.subject ?? d.title).trim(),
    status: asStr(d.status),
    category: asStr(d.category ?? p.category),
    priority: asStr(d.priority ?? p.priority),
    createdAt: asStr(d.created_at),
    lastMessageAt: asStr(d.last_message_at ?? p.last_message_at),
    operatorUserId: asStr(d.assigned_operator_user_id ?? p.assigned_operator_user_id),
    operatorName: asStr(d.assigned_operator_name ?? p.assigned_operator_name).trim(),
  };
}

function normCapabilities(v: unknown): AssistCapabilities {
  const d = asDict(v);
  const on = (x: unknown) => flag(x) === true;
  return {
    subscriptionCheckout: on(d.subscription_checkout),
    documentLawyerRequest: on(d.document_lawyer_request),
    marketplacePurchaseRequest: on(d.marketplace_purchase_request),
    urgentAdvokatRequest: flag(d.urgent_advokat_request),
    supportCall: on(d.support_call),
    operatorTransfer: on(d.operator_transfer),
  };
}

function normSubscription(v: unknown): AssistSubscription {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    planId: asStr(d.plan_id),
    status: asStr(d.status),
    billingPeriod: asStr(d.billing_period),
    startsAt: asStr(d.starts_at),
    endsAt: asStr(d.ends_at),
  };
}

function normPending(v: unknown): AssistPendingRequest {
  const d = asDict(v);
  const p = asDict(d.payload);
  const own = asStr(p.work_id).trim().toUpperCase();
  return {
    id: asStr(d.id),
    workId: WORK_ID.test(own) ? own : asStr(d.work_id),
    status: asStr(d.status),
    planId: asStr(p.plan_id),
    planSlug: asStr(p.plan_slug),
    planTitle: asStr(p.plan_title).trim(),
    billingPeriod: asStr(p.billing_period),
    months: asNum(p.months),
    amount: uzs(p, "amount") || uzs(d, "price"),
    currency: currencyOf(p.currency, d.currency),
    viaOperator: asStr(p.source) === ASSIST_SOURCE,
    createdAt: asStr(d.created_at),
  };
}

function normDocument(v: unknown): AssistDocument {
  const d = asDict(v);
  const a = asDict(d.answers);
  return {
    id: asStr(d.id),
    workId: asStr(d.work_id),
    title: titleOf(d.title),
    status: asStr(d.status),
    requestedType: asStr(d.requested_document_type ?? a.requested_document_type).trim(),
    price: uzs(d, "price"),
    currency: currencyOf(d.currency),
    paid: d.paid === true,
    paymentRequired: payRequired(d, a),
    gate: normPayGate(d, a),
    viaOperator: asStr(a.mode) === "support_assist_lawyer_pool" || Boolean(asStr(a.support_ticket_id)),
    createdAt: asStr(d.created_at),
  };
}

function normOrder(v: unknown): AssistOrder {
  const d = asDict(v);
  const det = asDict(d.details);
  const own = asStr(det.work_id).trim().toUpperCase();
  return {
    id: asStr(d.id),
    workId: WORK_ID.test(own) ? own : asStr(d.work_id),
    title: titleOf(d.service_title ?? det.service_title),
    lawyerName: asStr(d.lawyer_name ?? det.lawyer_name).trim(),
    status: asStr(d.status),
    paymentStatus: asStr(d.payment_status),
    price: uzs(d, "price"),
    currency: currencyOf(d.currency),
    viaOperator: asStr(det.source) === ASSIST_SOURCE,
    createdAt: asStr(d.created_at),
  };
}

const AI_TEXT_MAX = 600;
const AI_TURNS_MAX = 10;
const AI_USER = new Set(["user", "client", "human", "customer", "mijoz"]);
const AI_BOT = new Set(["assistant", "ai", "bot", "model", "ai_instructor", "instructor"]);
const aiClip = (s: string) => (s.length > AI_TEXT_MAX ? `${s.slice(0, AI_TEXT_MAX - 1).trimEnd()}…` : s);

function aiTurnsOf(list: unknown[]): AssistAiTurn[] {
  const out: AssistAiTurn[] = [];
  for (const raw of list) {
    const x = dictOf(raw);
    if (!filled(x)) continue;
    const at = firstText(x.at, x.created_at, x.timestamp, x.time);
    const q = firstText(x.q, x.question, x.prompt);
    const a = firstText(x.a, x.answer, x.response, x.reply);
    if (q || a) {
      out.push({ q: aiClip(q), a: aiClip(a), at });
      continue;
    }
    const role = firstText(x.role, x.sender, x.author, x.from).toLowerCase();
    const body = aiClip(firstText(x.content, x.text, x.message, x.body));
    if (!body) continue;
    const last = out[out.length - 1];
    if (AI_BOT.has(role)) {
      if (last && !last.a) out[out.length - 1] = { ...last, a: body, at: last.at || at };
      else out.push({ q: "", a: body, at });
    } else if (!role || AI_USER.has(role)) {
      out.push({ q: body, a: "", at });
    }
  }
  return out.slice(-AI_TURNS_MAX);
}

function aiHistoryOf(d: Dict): AssistAiHistory {
  const tk = dictOf(d.ticket);
  const tp = dictOf(tk.payload);
  const scopes = [dictOf(tk.context), dictOf(tp.context), dictOf(tk.ai_context), dictOf(tp.ai_context), dictOf(d.context), dictOf(d.ai_context)].filter(filled);
  const holders = [...scopes, tp, tk, d];
  let turns: AssistAiTurn[] = [];
  for (const h of holders) {
    const scoped = scopes.includes(h);
    const lists = [h.ai_history, h.ai_messages, scoped ? h.history : undefined, scoped ? h.messages : undefined];
    for (const list of lists) {
      const items = listOf(list);
      if (!items.length) continue;
      turns = aiTurnsOf(items);
      if (turns.length) break;
    }
    if (turns.length) break;
  }
  return { turns, sessionId: firstText(...holders.map((h) => h.ai_session_id), ...scopes.map((s) => s.session_id)) };
}

export function normAssistContext(v: unknown): AssistContext {
  const d = asDict(v);
  return {
    ticket: normAssistTicket(d.ticket),
    client: normAssistClient(d.client),
    capabilities: normCapabilities(d.assist_capabilities),
    activeSubscriptions: asArr(d.active_subscriptions).map(normSubscription).filter((x) => x.id || x.planId),
    pendingRequests: asArr(d.pending_subscription_requests).map(normPending).filter((x) => x.id),
    recentDocuments: asArr(d.recent_documents).map(normDocument).filter((x) => x.id),
    recentOrders: asArr(d.recent_orders).map(normOrder).filter((x) => x.id),
    aiHistory: aiHistoryOf(d),
  };
}

export function normAssistPreview(v: unknown): AssistPreview {
  const d = asDict(v);
  const plan = asDict(d.plan);
  const q = asDict(d.price_quote);
  return {
    planId: asStr(plan.id),
    planSlug: asStr(plan.slug),
    planTitle: asStr(plan.title).trim(),
    billingPeriod: asStr(d.billing_period),
    months: asNum(d.months),
    amount: uzs(d, "amount") || uzs(q, "total_amount"),
    currency: currencyOf(d.currency, q.currency),
    baseAmount: uzs(q, "base_amount"),
    subtotal: uzs(q, "subtotal"),
    discountPercent: asNum(q.discount_percent),
    discountAmount: uzs(q, "discount_amount"),
  };
}

export function normAssistCheckout(v: unknown): AssistCheckout {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    workId: asStr(d.work_id),
    status: asStr(d.status, "pending") || "pending",
    paymentId: asStr(d.payment_id),
    planId: asStr(d.plan_id),
    planSlug: asStr(d.plan_slug),
    amount: uzs(d, "amount"),
    currency: currencyOf(d.currency),
    telegramSent: d.telegram_sent === true,
  };
}

export function normAssistDocResult(v: unknown): AssistDocResult {
  const d = asDict(v);
  const r = asDict(d.request);
  const lr = asDict(d.lawyer_request);
  const lrp = asDict(lr.payload);
  return {
    requestId: asStr(r.id ?? lr.document_request_id),
    recordId: asStr(lr.id),
    workId: asStr(r.work_id),
    status: asStr(r.status ?? lr.status),
    poolStatus: asStr(lr.pool_status ?? lr.status),
    title: titleOf(r.title ?? lr.title),
    price: uzs(r, "price"),
    currency: currencyOf(r.currency),
    paid: r.paid === true,
    paymentRequired: payRequired(d, r, lr, lrp),
    telegramSent: d.telegram_sent === true || normPayGate(d, r, lr, lrp)?.telegramSent === true,
    gate: normPayGate(d, r, lr, lrp),
    assignmentMode: asStr(d.assignment_mode),
    poolUrl: asStr(d.pool_url),
    editorSource: asStr(d.editor_source),
    language: asStr(lr.language),
    requestedType: asStr(lr.requested_document_type ?? r.requested_document_type).trim(),
  };
}

export function normAssistMarketResult(v: unknown): AssistMarketResult {
  const d = asDict(v);
  const o = asDict(d.order);
  const det = asDict(o.details);
  const pay = asDict(d.payment);
  const pr = asDict(d.purchase_request);
  const prp = asDict(pr.payload);
  return {
    workId: asStr(d.work_id) || asStr(prp.work_id) || asStr(det.work_id) || asStr(pr.work_id),
    orderId: asStr(o.id ?? prp.order_id),
    paymentId: asStr(pay.id ?? prp.payment_id),
    requestId: asStr(pr.id),
    status: asStr(d.status, "pending") || "pending",
    orderStatus: asStr(o.status),
    paymentStatus: asStr(o.payment_status ?? pay.status),
    nextStatus: asStr(d.next_status),
    amount: uzs(pay, "amount") || uzs(o, "price") || uzs(prp, "amount"),
    currency: currencyOf(pay.currency, o.currency, prp.currency),
    telegramSent: d.telegram_sent === true,
    sellerAfterPayment: d.seller_will_receive_after_payment !== false,
    serviceTitle: titleOf(o.service_title ?? prp.service_title ?? det.service_title),
    lawyerName: asStr(prp.lawyer_name ?? o.lawyer_name ?? det.lawyer_name).trim(),
    gate: normPayGate(d, o, pr),
  };
}

export function normAssistUrgentResult(v: unknown): AssistUrgentResult {
  const d = asDict(v);
  const nested = dictOf(d.urgent_request ?? d.urgent_advokat_request ?? d.request ?? d.record);
  const r = filled(nested) ? nested : d;
  const p = dictOf(r.payload);
  const lawyer = dictOf(d.assigned_lawyer ?? r.assigned_lawyer);
  return {
    id: firstText(r.id, d.record_id, d.request_id, d.urgent_request_id, d.id),
    workId: firstText(d.work_id, r.work_id, p.work_id),
    status: firstText(r.status, d.status),
    serviceKind: firstText(r.service_kind, p.service_kind, d.service_kind, r.record_type),
    channel: firstText(p.channel, r.channel, d.channel),
    title: titleOf(firstText(r.title, d.title)),
    amount: uzs(r, "price") || uzs(p, "price") || uzs(d, "amount", "price"),
    currency: currencyOf(r.currency, p.currency, d.currency),
    immediateCall: flag(d.immediate_call) === true || flag(p.immediate_call) === true,
    lawyerName: firstText(lawyer.name, p.assigned_lawyer_name),
    clientNotified: flag(d.client_notified ?? d.notified_client ?? d.client_notification_sent),
    paymentRequired: payRequired(d, r, p),
    gate: normPayGate(d, r, p),
  };
}

const assistPath = (ticketId: string, tail: string) => `/call-center/support/tickets/${encodeURIComponent(ticketId)}/assist/${tail}`;

export async function getAssistContext(ticketId: string, signal?: AbortSignal): Promise<AssistContext> {
  return normAssistContext(await http(assistPath(ticketId, "context"), { signal }));
}

export async function previewAssistSubscription(ticketId: string, input: { planId: string; billingPeriod: AssistBillingPeriod }): Promise<AssistPreview> {
  return normAssistPreview(
    await http(assistPath(ticketId, "subscription-preview"), {
      method: "POST",
      body: JSON.stringify({ plan_id: input.planId, billing_period: input.billingPeriod, currency: "UZS" }),
    }),
  );
}

export async function createAssistSubscriptionCheckout(ticketId: string, input: { planId: string; billingPeriod: AssistBillingPeriod }): Promise<AssistCheckout> {
  return normAssistCheckout(
    await http(assistPath(ticketId, "subscription-checkout"), {
      method: "POST",
      body: JSON.stringify({ plan_id: input.planId, billing_period: input.billingPeriod, currency: "UZS" }),
    }),
  );
}

export async function createAssistDocumentRequest(
  ticketId: string,
  input: { serviceId?: string; templateId?: string; title: string; need: string; language: AssistDocLanguage; requestedDocumentType: string },
): Promise<AssistDocResult> {
  const body: Dict = {
    title: input.title.trim(),
    need: input.need.trim(),
    language: input.language,
    requested_document_type: input.requestedDocumentType.trim(),
    answers: {},
  };
  if (input.serviceId) body.service_id = input.serviceId;
  if (input.templateId) body.template_id = input.templateId;
  return normAssistDocResult(await http(assistPath(ticketId, "document-lawyer-request"), { method: "POST", body: JSON.stringify(body) }));
}

export async function createAssistMarketplaceRequest(
  ticketId: string,
  input: { lawyerUserId: string; serviceId: string; note: string; preferredChannel: AssistChannel; preferredTime: string },
): Promise<AssistMarketResult> {
  return normAssistMarketResult(
    await http(assistPath(ticketId, "marketplace-purchase-request"), {
      method: "POST",
      body: JSON.stringify({
        lawyer_user_id: input.lawyerUserId,
        service_id: input.serviceId,
        note: input.note.trim(),
        preferred_channel: input.preferredChannel,
        preferred_time: input.preferredTime.trim(),
      }),
    }),
  );
}

let urgentRoute: AssistUrgentRoute = "unknown";
let urgentTimer: ReturnType<typeof setTimeout> | undefined;
const urgentSubs = new Set<() => void>();

function setUrgentRoute(next: AssistUrgentRoute): void {
  if (urgentRoute === next) return;
  urgentRoute = next;
  urgentSubs.forEach((fn) => fn());
}

export const assistUrgentRoute = (): AssistUrgentRoute => urgentRoute;

export function subscribeAssistUrgentRoute(fn: () => void): () => void {
  urgentSubs.add(fn);
  return () => {
    urgentSubs.delete(fn);
  };
}

function markUrgentMissing(): void {
  clearTimeout(urgentTimer);
  setUrgentRoute("missing");
  urgentTimer = setTimeout(() => setUrgentRoute("unknown"), FEATURE_TTL_MS);
}

function markUrgentOpen(): void {
  clearTimeout(urgentTimer);
  setUrgentRoute("open");
}

const routeAbsent = (e: unknown) => e instanceof ApiError && (e.status === 501 || (e.status === 404 && (!e.detail || e.detail === "Not Found")));

export function probeAssistUrgentRoute(ticketId: string): void {
  if (urgentRoute !== "unknown" || !ticketId) return;
  setUrgentRoute("checking");
  http(assistPath(ticketId, "urgent-advokat-request"))
    .then(markUrgentOpen)
    .catch((e: unknown) => {
      if (routeAbsent(e)) markUrgentMissing();
      else markUrgentOpen();
    });
}

export async function createAssistUrgentRequest(ticketId: string, input: AssistUrgentInput): Promise<AssistUrgentResult> {
  const body: Dict = {
    service_kind: input.serviceKind,
    channel: input.channel,
    need: input.need.trim(),
    directions: input.directions,
    files: [],
    voice_messages: [],
  };
  if (input.serviceKind === ASSIST_URGENT_GROUP && input.lawyerCount) body.lawyer_count = input.lawyerCount;
  try {
    const r = normAssistUrgentResult(await http(assistPath(ticketId, "urgent-advokat-request"), { method: "POST", body: JSON.stringify(body) }));
    markUrgentOpen();
    return r;
  } catch (e) {
    if (isRouteMissing(e)) markUrgentMissing();
    throw e;
  }
}

function fallbackUrgent(key: AssistUrgentKind): UrgentService {
  const base: UrgentService = {
    key,
    title: "",
    delivery: "",
    price: 0,
    meetingMinutes: 30,
    supportsChat: true,
    supportsFiles: true,
    supportsVoice: true,
    variants: [],
    requiresPriorPurchase: false,
    lawyerCountMin: 2,
    lawyerCountMax: 7,
    variant: "",
    immediateCall: false,
  };
  if (key === "chat_consultation") return { ...base, meetingMinutes: 0 };
  if (key === "express_video_consultation" || key === "traffic_accident_consultation") return { ...base, immediateCall: true };
  if (key === "second_opinion_single" || key === "second_opinion_group") {
    return {
      ...base,
      variants: [
        { channel: "video", price: 0, pricePerLawyer: 0, meetingMinutes: 30 },
        { channel: "chat", price: 0, pricePerLawyer: 0, meetingMinutes: 0 },
      ],
      requiresPriorPurchase: key === ASSIST_URGENT_GROUP,
    };
  }
  return base;
}

export const assistUrgentFallback = (): AssistUrgentCatalog => ({ services: ASSIST_URGENT_KINDS.map(fallbackUrgent), priced: false });

let urgentCatalog: { at: number; data: AssistUrgentCatalog } | null = null;

export async function loadAssistUrgentCatalog(): Promise<AssistUrgentCatalog> {
  const now = Date.now();
  if (urgentCatalog && now - urgentCatalog.at < FEATURE_TTL_MS) return urgentCatalog.data;
  try {
    const cat = await getUrgentCatalog();
    const byKey = new Map(cat.services.map((s) => [s.key, s]));
    const data: AssistUrgentCatalog = { services: ASSIST_URGENT_KINDS.map((k) => byKey.get(k) ?? fallbackUrgent(k)), priced: byKey.size > 0 };
    urgentCatalog = { at: now, data };
    return data;
  } catch {
    return assistUrgentFallback();
  }
}

const isGiftPlan = (p: BackendPlan) => p.isGiftable || p.billingType === "gift";
const forClient = (p: BackendPlan) => (p.targetRoles.length ? p.targetRoles.includes("client") : planForRole(p, "client"));

export function assistPlanPeriods(plan: BackendPlan): AssistBillingPeriod[] {
  const allowed = plan.allowedBillingPeriods.filter(isAssistPeriod);
  return ASSIST_BILLING_PERIODS.filter((p) => !allowed.length || allowed.includes(p));
}

export function assistPlanPrice(plan: BackendPlan, period: AssistBillingPeriod): number {
  const listed =
    period === "monthly" ? plan.monthlyPrice : period === "six_month" ? plan.sixMonthPrice : period === "yearly" ? plan.yearlyPrice : plan.prepaidYearlyPrice;
  return listed > 0 ? listed : plan.monthlyPrice * PERIOD_MONTHS[period];
}

export function clientAssistPlans(plans: BackendPlan[]): BackendPlan[] {
  const rank = (p: BackendPlan) => (forClient(p) ? 0 : 1);
  return plans
    .filter((p) => p.isActive && p.id && !isGiftPlan(p))
    .filter((p) => !p.targetRoles.length || p.targetRoles.includes("client"))
    .filter((p) => assistPlanPeriods(p).some((x) => assistPlanPrice(p, x) > 0))
    .sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder || a.monthlyPrice - b.monthlyPrice);
}

export async function loadAssistPlans(locale: string): Promise<{ all: BackendPlan[]; sellable: BackendPlan[] }> {
  const all = await getSubscriptionPlans(locale);
  return { all, sellable: clientAssistPlans(all) };
}

const planNameCache = new Map<string, string>();

export async function resolveAssistPlanNames(ids: string[], locale: string): Promise<Record<string, string>> {
  const wanted = Array.from(new Set(ids.filter(Boolean)));
  const out: Record<string, string> = {};
  await Promise.all(
    wanted.map(async (id) => {
      const key = `${locale}:${id}`;
      const hit = planNameCache.get(key);
      if (hit !== undefined) {
        if (hit) out[id] = hit;
        return;
      }
      try {
        const plan = await getSubscriptionPlan(id, locale);
        const name = (plan.name || plan.title).trim();
        planNameCache.set(key, name);
        if (name) out[id] = name;
      } catch {
        planNameCache.set(key, "");
      }
    }),
  );
  return out;
}

export async function loadAssistSellers(): Promise<{ items: MarketSeller[]; total: number }> {
  const r = await listMarketplace();
  return { items: r.items, total: r.total };
}

export async function searchAssistSellers(q: string, signal?: AbortSignal): Promise<MarketSeller[]> {
  const qs = new URLSearchParams({ q: q.trim().slice(0, 120), limit: "50" });
  const d = asDict(await http(`/marketplace/lawyers?${qs.toString()}`, { signal }));
  return asArr(d.items).map(normMarketSeller).filter((s) => s.userId);
}

export function sellerMatches(s: MarketSeller, q: string): boolean {
  const hay = [s.name, s.sellerType, s.region, s.district, s.organizationName, ...s.specializations, ...s.serviceTitles, ...s.categories.map((c) => c.title), ...s.services.map((x) => x.title)].join(" ");
  return matchesSearch(hay, q);
}

const detailDict = (e: ApiError) => asDict(e.data.detail);

export function assistBlockOf(e: unknown): AssistBlock | null {
  if (!(e instanceof ApiError)) return null;
  const d = (e.detail || "").toLowerCase();
  if (e.status === 409 && (e.code === "ticket_closed" || asStr(detailDict(e).code) === "ticket_closed" || /yopilgan ticket/.test(d))) return "closed";
  if (e.status === 404 && /accountiga ulanmagan/.test(d)) return "notClient";
  if (e.status === 404 && /support ticket topilmadi/.test(d)) return "missing";
  if (e.status === 403 && /biriktirilgan operator|operator ruxsati/.test(d)) return "notAssigned";
  if (isRouteMissing(e)) return "unavailable";
  return null;
}

export function assistErrorKind(e: unknown): AssistErrorKind | null {
  if (!(e instanceof ApiError)) return null;
  const d = (e.detail || "").toLowerCase();
  if (e.status === 422 && Array.isArray(detailDict(e).allowed_billing_periods)) return "period";
  if (e.status === 404 && /paket topilmadi/.test(d)) return "planMissing";
  if (e.status === 403 && /paket/.test(d) && /ochilmagan/.test(d)) return "planRole";
  if (e.status === 422 && /ehtiyoji kerak/.test(d)) return "needRequired";
  if (e.status === 409 && /tasdiqlanmagan/.test(d)) return "notApproved";
  return null;
}

export function assistDocDuplicateOf(e: unknown): AssistDuplicate | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const dd = detailDict(e);
  if (e.code !== "document_lawyer_request_already_open" && asStr(dd.code) !== "document_lawyer_request_already_open") return null;
  const req = asDict(dd.request);
  return { workId: asStr(req.work_id), status: asStr(req.status) };
}

export function assistMarketDuplicateOf(e: unknown): AssistDuplicate | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const dd = detailDict(e);
  if (e.code !== "marketplace_order_already_active" && asStr(dd.code) !== "marketplace_order_already_active") return null;
  return { workId: asStr(dd.work_id), status: asStr(dd.status) };
}

export function assistUrgentDuplicateOf(e: unknown): AssistDuplicate | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const dd = detailDict(e);
  const code = firstText(e.code, dd.code, e.data.code);
  if (code === "ticket_closed") return null;
  const req = dictOf(dd.request ?? dd.urgent_request ?? dd.record);
  const workId = firstText(dd.work_id, req.work_id, dictOf(req.payload).work_id);
  if (!workId && !/already|duplicate|active|open/i.test(code)) return null;
  return { workId, status: firstText(dd.status, req.status) };
}

const URGENT_FIELD_KEYS: Record<string, AssistUrgentField> = {
  service_kind: "kind",
  kind: "kind",
  channel: "channel",
  lawyer_count: "count",
  directions: "directions",
  specializations: "directions",
  need: "need",
  description: "need",
};

export function assistUrgentFieldErrors(e: unknown): Partial<Record<AssistUrgentField, string>> {
  if (!(e instanceof ApiError) || e.status !== 422) return {};
  const out: Partial<Record<AssistUrgentField, string>> = {};
  for (const [k, msg] of Object.entries(e.fieldErrors)) {
    const f = URGENT_FIELD_KEYS[k];
    if (f && msg && !out[f]) out[f] = msg;
  }
  const detail = (e.detail || "").trim();
  if (Object.keys(out).length || !detail) return out;
  const d = detail.toLowerCase();
  if (/channel|aloqa/.test(d)) out.channel = detail;
  else if (/xizmat turi|service_kind/.test(d)) out.kind = detail;
  else if (/lawyer_count|advokatlar soni/.test(d)) out.count = detail;
  else if (/yo.?nalish|direction/.test(d)) out.directions = detail;
  else if (/need|muammo|tavsif|ehtiyoj/.test(d)) out.need = detail;
  return out;
}

const LIVE_PREFIXES = ["support.assist_", "document_request.", "marketplace.", "urgent_advokat.", "subscription.", "payment."];
const LIVE_PHASE: Record<string, AssistPayPhase> = {
  "document_request.payment_required": "pending",
  "document_request.pool_created": "paid",
  "document_request.payment_rejected": "rejected",
  "document_request.payment_cancelled": "rejected",
  "marketplace.purchase_request_created": "pending",
  "marketplace.order_paid": "paid",
  "marketplace.purchase_rejected": "rejected",
  "subscription.purchase_request_created": "pending",
  "subscription.purchase_approved": "paid",
  "subscription.activated": "paid",
  "subscription.purchase_rejected": "rejected",
};
const LIVE_ID_KEYS = [
  "id",
  "record_id",
  "request_id",
  "document_request_id",
  "lawyer_request_id",
  "order_id",
  "payment_id",
  "purchase_request_id",
  "urgent_request_id",
  "urgent_advokat_request_id",
  "work_id",
];
const LIVE_NEST_KEYS = [
  "action",
  "payload",
  "request",
  "lawyer_request",
  "document_request",
  "order",
  "payment",
  "purchase_request",
  "urgent_request",
  "urgent_advokat_request",
  "record",
  "payment_gate",
  "details",
];

function walkLive(root: Dict, depth: number, visit: (d: Dict) => void): void {
  visit(root);
  if (depth <= 0) return;
  for (const k of LIVE_NEST_KEYS) {
    const v = dictOf(root[k]);
    if (filled(v)) walkLive(v, depth - 1, visit);
  }
}

function livePhaseOf(name: string, base: Dict, action: Dict): AssistPayPhase {
  const named = LIVE_PHASE[name];
  if (named) return named;
  if (name === "support.assist_document_request_created") return docPayPhase(normAssistDocResult(action));
  if (name === "support.assist_subscription_checkout_created") return payPhaseOf(normAssistCheckout(action).status);
  if (name === "support.assist_marketplace_purchase_requested") {
    const m = normAssistMarketResult(action);
    return m.gate?.phase || orderPayPhase(m.orderStatus, m.paymentStatus) || payPhaseOf(m.status);
  }
  if (name === "support.assist_urgent_advokat_request_created") return urgentPayPhase(normAssistUrgentResult(action));
  let phase: AssistPayPhase = "";
  walkLive(base, 3, (d) => {
    if (phase) return;
    phase = normPayGate(d)?.phase || (flag(d.payment_required) === true ? "pending" : "") || payPhaseOf(d.payment_status);
  });
  return phase;
}

export function assistLiveOf(raw: Dict): AssistLive | null {
  let name = text(raw.event);
  let src: Dict = raw;
  if (name === "notification.created") {
    const n = asDict(raw.notification);
    src = dictOf(n.data ?? n.meta);
    name = text(src.event);
  }
  if (!name || !LIVE_PREFIXES.some((p) => name.startsWith(p))) return null;
  const inner = dictOf(src.message);
  const base = text(inner.event) === name ? inner : src;
  const action = dictOf(base.action);
  const ids = new Set<string>();
  const clientIds = new Set<string>();
  walkLive(base, 3, (d) => {
    for (const k of LIVE_ID_KEYS) {
      const id = text(d[k]);
      if (id) ids.add(id);
    }
    const client = text(d.client_user_id) || text(dictOf(d.client).id);
    if (client) clientIds.add(client);
  });
  const urgent = dictOf(base.urgent_request ?? action.urgent_request);
  return {
    name,
    ids: [...ids],
    clientIds: [...clientIds],
    status: firstText(base.status, urgent.status, dictOf(base.document_request).status, dictOf(action.request).status, action.status),
    phase: livePhaseOf(name, base, action),
    telegramSent: flag(base.telegram_sent ?? action.telegram_sent),
  };
}

export function mergeAssistLive(cur: AssistLive | null, next: AssistLive): AssistLive {
  if (!cur) return next;
  const phase = isFinalPhase(next.phase) || !isFinalPhase(cur.phase) ? next.phase || cur.phase : cur.phase;
  return { ...next, phase, status: next.status || cur.status, telegramSent: next.telegramSent ?? cur.telegramSent };
}

export function assistEventOf(raw: Dict): AssistEvent | null {
  const name = asStr(raw.event);
  if (!name.startsWith(ASSIST_EVENT_PREFIX)) return null;
  const inner = asDict(raw.message);
  const src = asStr(inner.event) === name ? inner : raw;
  const ticketId = asStr(src.ticket_id) || asStr(raw.ticket_id) || asStr(asDict(raw.ticket).id);
  if (!ticketId) return null;
  return {
    event: name,
    ticketId,
    clientUserId: asStr(src.client_user_id),
    operatorUserId: asStr(src.operator_user_id),
    createdAt: asStr(src.created_at ?? raw.created_at),
  };
}
