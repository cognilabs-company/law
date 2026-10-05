import { http, asDict, asStr, asNum, asArr, ApiError, isRouteMissing, type Dict } from "@/lib/http";
import { uzs } from "@/lib/money";
import { cleanDocTitle } from "@/lib/docTitle";
import { matchesSearch } from "@/lib/searchText";
import { getSubscriptionPlan, getSubscriptionPlans, planForRole, type BackendPlan } from "@/lib/services/backend";
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
] as const;

const PERIOD_MONTHS: Record<AssistBillingPeriod, number> = { monthly: 1, six_month: 6, yearly: 12, prepaid_yearly: 12 };
const WORK_ID = /^[A-Z]{2,7}-[0-9A-Z]{5,8}$/;
const ASSIST_SOURCE = "callcenter_assist";

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
  supportCall: boolean;
  operatorTransfer: boolean;
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

export type AssistContext = {
  ticket: AssistTicket | null;
  client: AssistClient | null;
  capabilities: AssistCapabilities;
  activeSubscriptions: AssistSubscription[];
  pendingRequests: AssistPendingRequest[];
  recentDocuments: AssistDocument[];
  recentOrders: AssistOrder[];
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
  assignmentMode: string;
  poolUrl: string;
  editorSource: string;
  language: string;
  requestedType: string;
};

export type AssistMarketResult = {
  workId: string;
  orderId: string;
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

export function isAssistPeriod(v: string): v is AssistBillingPeriod {
  return (ASSIST_BILLING_PERIODS as readonly string[]).includes(v);
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
  const on = (x: unknown) => x !== false;
  return {
    subscriptionCheckout: on(d.subscription_checkout),
    documentLawyerRequest: on(d.document_lawyer_request),
    marketplacePurchaseRequest: on(d.marketplace_purchase_request),
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
