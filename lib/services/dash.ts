// Dashboard wrappers (admin overview, CEO, call analytics, retention, quality,
// seller cabinet) used by the drill-down stat tiles. They call the same
// backend routes as lib/services/backend.ts but (a) keep the breakdown lists
// the base wrappers drop (charts, lists, active cases, secure chats,
// notifications), (b) forward the dashboard filter as query params — the
// backend ignores region/date_from/date_to today, so the pages also apply the
// filter client-side — and (c) read the real retention shape (`reasons[]`,
// `last_paid_at`). backend.ts stays untouched.
import { http, asDict, asStr, asNum, asArr, type Dict } from "@/lib/http";
import { uzs, uzsOpt, fmtUzs } from "@/lib/money";
import type {
  AdminDashboard,
  DashboardChart,
  DashboardStat,
  BackendLawyer,
  BackendOrder,
  CallAnalytics,
  CeoDashboard,
  GiftKpis,
  QualityOverview,
  SellerCabinet,
  SellerStats,
} from "@/lib/services/backend";

// ── Filter ────────────────────────────────────────────────────────
export type DashFilter = {
  region: string; // "" = all regions (REGION_KEYS value otherwise)
  from: string; // "YYYY-MM-DD" or ""
  to: string; // "YYYY-MM-DD" or ""
  preset: "" | "d7" | "d30" | "d90";
};
export const EMPTY_FILTER: DashFilter = { region: "", from: "", to: "", preset: "" };
export const isFiltered = (f: DashFilter) => Boolean(f.region || f.from || f.to);

// `?region=…&date_from=…&date_to=…` — omitted when the filter is empty.
export function dashQuery(f?: DashFilter): string {
  if (!f) return "";
  const qs = new URLSearchParams();
  if (f.region) qs.set("region", f.region);
  if (f.from) qs.set("date_from", f.from);
  if (f.to) qs.set("date_to", f.to);
  const q = qs.toString();
  return q ? `?${q}` : "";
}

// ISO date (YYYY-MM-DD) of a series label / timestamp, "" when unreadable.
export const isoDay = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v || "") ? v.slice(0, 10) : "");
// True when a day is inside the filter's date range (open ends allowed).
export function inRange(day: string, f: DashFilter): boolean {
  const d = isoDay(day);
  if (!d) return !f.from && !f.to;
  return (!f.from || d >= f.from) && (!f.to || d <= f.to);
}
export const trimSeries = <T extends { label: string }>(points: T[], f: DashFilter): T[] =>
  f.from || f.to ? points.filter((p) => inRange(p.label, f)) : points;
// Today as YYYY-MM-DD in the browser's zone (called at fetch time, never in render).
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ── Admin dashboard (GET /admin/dashboard) ────────────────────────
export type DashListItem = { id: string; title: string; status: string; meta: string; amount?: number; date: string };
export type AdminDashboardFull = AdminDashboard & {
  fetchedAt: string;
  // The grouped maps the totals were flattened from.
  groups: { totals: Dict; payments: Dict; orders: Dict; leads: Dict; sellers: Dict };
  lists: { tasks: DashListItem[]; b2bClients: DashListItem[]; reviews: DashListItem[]; gifts: DashListItem[] };
};
function toStats(obj: unknown): DashboardStat[] {
  const d = asDict(obj);
  return Object.entries(d)
    .filter(([label, v]) => !label.endsWith("_tiyin") && (typeof v === "number" || typeof v === "string"))
    .map(([label, v]) => ({ label, value: asNum(v) }));
}
function numMap(obj: unknown): Dict {
  const out: Dict = {};
  for (const [k, v] of Object.entries(asDict(obj))) if (!k.endsWith("_tiyin") && (typeof v === "number" || typeof v === "string")) out[k] = asNum(v);
  return out;
}
function listItem(v: unknown): DashListItem {
  const d = asDict(v);
  const p = asDict(d.payload);
  const amount = uzsOpt(d, "value", "amount", "price");
  return {
    id: asStr(d.id),
    title: asStr(d.title ?? d.name ?? d.subject),
    status: asStr(d.status ?? d.stage),
    meta: asStr(d.industry ?? d.contact ?? p.industry ?? d.gift_code ?? d.rating ?? d.assignee_name ?? ""),
    amount: amount == null ? undefined : amount,
    date: asStr(d.updated_at ?? d.created_at),
  };
}
export async function getAdminDashboardFull(f?: DashFilter): Promise<AdminDashboardFull> {
  const d = asDict(await http(`/admin/dashboard${dashQuery(f)}`));
  const totals = [...toStats(d.totals), ...toStats(d.payments), ...toStats(d.orders), ...toStats(d.leads), ...toStats(d.sellers)];
  const charts: DashboardChart[] = Object.entries(asDict(d.charts)).map(([key, val]) => ({
    key,
    points: asArr(val).map((p) => {
      const x = asDict(p);
      return { label: asStr(x.label ?? x.date ?? x.day ?? x.name ?? x.key), value: asNum(x.value ?? x.count ?? x.total ?? x.amount) };
    }),
  }));
  const lists = asDict(d.lists);
  return {
    totals,
    charts,
    fetchedAt: todayIso(),
    groups: { totals: numMap(d.totals), payments: numMap(d.payments), orders: numMap(d.orders), leads: numMap(d.leads), sellers: numMap(d.sellers) },
    lists: {
      tasks: asArr(lists.tasks).map(listItem),
      b2bClients: asArr(lists.b2b_clients).map(listItem),
      reviews: asArr(lists.reviews).map(listItem),
      gifts: asArr(lists.gifts).map(listItem),
    },
  };
}
// True when the platform has no activity yet (every counter zero, every chart empty).
export function isAdminDashboardEmpty(d: AdminDashboardFull): boolean {
  return d.totals.every((s) => !s.value) && d.charts.every((c) => c.points.every((p) => !p.value));
}

// ── CEO (GET /analytics/ceo) ──────────────────────────────────────
export type CeoDashboardFull = CeoDashboard & { fetchedAt: string };
function normGiftKpis(v: unknown): GiftKpis {
  const g = asDict(v);
  return {
    giftPurchases: asNum(g.gift_purchases),
    giftActivationRate: asNum(g.gift_activation_rate),
    recipientConversion: asNum(g.recipient_conversion),
    giftToPaidConversion: asNum(g.gift_to_paid_conversion),
    averageGiftValue: uzs(g, "average_gift_value"),
    referralRate: asNum(g.referral_rate),
    giftCac: uzs(g, "gift_cac"),
    giftLtv: uzs(g, "gift_ltv"),
  };
}
// Mirrors backend.ts getCeoDashboard (kept in sync by hand) plus the filter query.
export async function getCeoDashboardFull(f?: DashFilter): Promise<CeoDashboardFull> {
  const d = asDict(await http(`/analytics/ceo${dashQuery(f)}`));
  const pair = (x: unknown) => { const r = asDict(x); return { label: asStr(r.stage ?? r.label ?? r.name ?? r.date), value: asNum(r.value ?? r.count) }; };
  const moneyPair = (x: unknown) => { const r = asDict(x); return { label: asStr(r.date ?? r.label ?? r.name), value: uzs(r, "revenue", "value", "count") }; };
  const cacRaw = d.cac;
  const cacObj = typeof cacRaw === "object" && cacRaw ? asDict(cacRaw) : {};
  const cac = typeof cacRaw === "object" && cacRaw ? uzs(cacObj, "total") : uzs(d, "cac");
  return {
    fetchedAt: todayIso(),
    revenue: uzs(d, "revenue"), revenueDeltaPct: asNum(d.revenue_delta_pct), mrr: uzs(d, "mrr"),
    users: asNum(d.users ?? d.total_users), activeUsers: asNum(d.active_users), conversionPct: asNum(d.conversion_pct),
    funnel: asArr(d.funnel).map(pair),
    channels: asArr(d.channels ?? d.attribution).map((x) => {
      const r = asDict(x);
      return { name: asStr(r.source ?? r.name ?? r.channel), leads: asNum(r.leads ?? r.count), pct: asNum(r.conversion_pct ?? r.pct ?? r.share), payments: asNum(r.payments), revenue: uzs(r, "revenue") };
    }),
    cacClient: uzs(cacObj, "client"), cacAdvocate: uzs(cacObj, "advocate"), paidPayments: asNum(d.paid_payments),
    revenueTrend: asArr(d.revenue_trend ?? d.trend).map(moneyPair),
    mau: asNum(d.mau), dau: asNum(d.dau), gmv: uzs(d, "gmv"), arr: uzs(d, "arr"), arpu: uzs(d, "arpu"), takeRate: asNum(d.take_rate),
    cac, ltv: uzs(d, "ltv"), ltvCac: asNum(d.ltv_cac), paybackMonths: asNum(d.payback_months),
    npsClient: asNum(d.nps_client), npsAdvocate: asNum(d.nps_advocate),
    newClients: asNum(d.new_clients), newAdvocates: asNum(d.new_advocates), newLawyers: asNum(d.new_lawyers),
    giftKpis: normGiftKpis(d.gift_kpis),
  };
}
export function isCeoEmpty(d: CeoDashboard): boolean {
  return !d.revenue && !d.users && !d.mau && d.funnel.every((x) => !x.value) && !d.channels.length && d.revenueTrend.every((p) => !p.value);
}

// ── Call analytics (GET /calls/analytics) ─────────────────────────
export type CallAnalyticsFull = CallAnalytics & { fetchedAt: string };
export async function getCallAnalyticsFull(f?: DashFilter): Promise<CallAnalyticsFull> {
  const d = asDict(await http(`/calls/analytics${dashQuery(f)}`));
  return {
    fetchedAt: todayIso(),
    total: asNum(d.total ?? d.total_calls),
    answered: asNum(d.answered ?? d.answered_calls),
    missed: asNum(d.missed ?? d.missed_calls),
    avgDurationSec: asNum(d.avg_duration_sec ?? d.avg_duration),
    byDay: asArr(d.by_day ?? d.daily).map((x) => { const r = asDict(x); return { label: asStr(r.label ?? r.date), value: asNum(r.value ?? r.count) }; }),
    topAgents: asArr(d.top_agents ?? d.agents).map((x) => { const r = asDict(x); return { name: asStr(r.name), calls: asNum(r.calls ?? r.count) }; }),
  };
}
export const isCallsEmpty = (d: CallAnalytics) => !d.total && !d.answered && !d.missed && d.byDay.every((p) => !p.value) && !d.topAgents.length;

// ── Quality (GET /quality/overview) ───────────────────────────────
export type QualityFull = QualityOverview & { fetchedAt: string };
export async function getQualityFull(f?: DashFilter): Promise<QualityFull> {
  const d = asDict(await http(`/quality/overview${dashQuery(f)}`));
  return {
    fetchedAt: todayIso(),
    avgRating: asNum(d.avg_rating, 0), responseSlaPct: asNum(d.response_sla_pct), complaintRate: asNum(d.complaint_rate), resolvedPct: asNum(d.resolved_pct),
    flagged: asArr(d.flagged).map((x) => { const r = asDict(x); return { title: asStr(r.title), detail: asStr(r.detail ?? r.description), severity: asStr(r.severity, "low") }; }),
  };
}
// avg_rating / response_sla_pct are backend constants today, so "empty" means
// no complaint activity and nothing flagged.
export const isQualityEmpty = (d: QualityOverview) => !d.complaintRate && !d.flagged.length;

// ── Retention (GET /retention/overview) ───────────────────────────
// Real shape (marketplace_routes.retention_metrics): at_risk_clients carry
// `reasons: string[]` and `last_paid_at` (ISO or null); the overview adds
// period counters and at_risk_leads. Upsell rows are MarketplaceRecord dicts.
export type AtRiskClient = { id: string; name: string; phone: string; reasons: string[]; lastPaidAt: string };
export type RetentionData = {
  fetchedAt: string;
  atRisk: number; atRiskLeads: number; churnedThisMonth: number; retainedPct: number;
  periodDays: number; previousPeriodActive: number; currentPeriodActive: number; retainedClients: number;
  atRiskClients: AtRiskClient[];
  upsell: { id: string; name: string; suggestion: string; price: number; status: string }[];
};
export async function getRetentionData(f?: DashFilter): Promise<RetentionData> {
  const d = asDict(await http(`/retention/overview${dashQuery(f)}`));
  return {
    fetchedAt: todayIso(),
    atRisk: asNum(d.at_risk), atRiskLeads: asNum(d.at_risk_leads), churnedThisMonth: asNum(d.churned_this_month), retainedPct: asNum(d.retained_pct),
    periodDays: asNum(d.period_days, 30), previousPeriodActive: asNum(d.previous_period_active), currentPeriodActive: asNum(d.current_period_active), retainedClients: asNum(d.retained_clients),
    atRiskClients: asArr(d.at_risk_clients).map((x) => {
      const r = asDict(x);
      // Older shape had a single `reason` string; keep reading it.
      const reasons = asArr(r.reasons).map((s) => asStr(s)).filter(Boolean);
      if (!reasons.length && asStr(r.reason)) reasons.push(asStr(r.reason));
      return { id: asStr(r.id ?? r.client_user_id ?? r.user_id), name: asStr(r.name), phone: asStr(r.phone), reasons, lastPaidAt: asStr(r.last_paid_at ?? r.last_active) };
    }),
    upsell: asArr(d.upsell).map((x) => {
      const r = asDict(x);
      const p = asDict(r.payload);
      return { id: asStr(r.id), name: asStr(r.name ?? r.title), suggestion: asStr(r.suggestion ?? p.reason ?? r.record_type), price: uzs(r, "price"), status: asStr(r.status) };
    }),
  };
}
export const isRetentionEmpty = (d: RetentionData) =>
  !d.atRisk && !d.churnedThisMonth && !d.retainedPct && !d.previousPeriodActive && !d.currentPeriodActive && !d.atRiskClients.length && !d.upsell.length;

// ── Seller cabinet (GET /lawyers/me/cabinet) with breakdown lists ─
export type CabinetCase = { id: string; caseNumber: string; title: string; stage: string; status: string; nextAction: string; deadlineAt: string };
export type CabinetRoom = { id: string; status: string; orderId: string; caseId: string; clientUserId: string; createdAt: string; updatedAt: string };
export type CabinetNotification = { id: string; title: string; body: string; kind: string; read: boolean; createdAt: string };
export type SellerCabinetFull = SellerCabinet & {
  fetchedAt: string;
  limitedReason: string;
  activeCases: CabinetCase[];
  secureChats: CabinetRoom[];
  notifications: CabinetNotification[];
};
// Mirror of backend.ts normLawyer / normOrder (private there); the same fields.
function normLawyer(v: unknown): BackendLawyer {
  const d = asDict(v);
  const user = asDict(d.user);
  return {
    id: asStr(d.id ?? d.user_id ?? user.id),
    userId: asStr(d.user_id ?? user.id ?? d.id),
    name: asStr(d.lawyer_name ?? d.name ?? user.name ?? d.full_name),
    phone: asStr(d.phone ?? user.phone),
    region: asStr(d.region),
    district: asStr(d.district) || undefined,
    specializations: asArr(d.specializations).map((s) => asStr(s)),
    languages: asArr(d.languages).map((l) => asStr(l)),
    experienceYears: asNum(d.experience_years),
    rating: asNum(d.rating, 5),
    reviews: asNum(d.reviews_count ?? d.reviews),
    basePrice: uzs(d, "base_hourly_price"),
    bio: asStr(d.bio) || undefined,
    verified: Boolean(d.verified ?? d.is_verified),
    verificationStatus: asStr(d.verification_status),
    sellerType: asStr(d.seller_type),
    createdAt: asStr(d.created_at),
    totalCases: asNum(d.total_cases),
    winsCount: asNum(d.wins_count),
    partialWins: asNum(d.partial_wins_count),
    successRate: asNum(d.success_rate),
    publicId: asStr(d.public_id) || undefined,
    education: asStr(d.education) || undefined,
    licenseNumber: asStr(d.license_number) || undefined,
    barAssociation: asStr(d.bar_association) || undefined,
    organizationName: asStr(d.organization_name) || undefined,
  };
}
function normOrder(v: unknown): BackendOrder {
  const d = asDict(v);
  const details = asDict(d.details);
  const service = asDict(d.service);
  const amount = uzsOpt(d, "price", "amount");
  return {
    id: asStr(d.id),
    title: asStr(details.question ?? d.title ?? details.title ?? service.name),
    serviceName: asStr(service.name ?? service.title ?? d.service_name ?? d.service_title ?? details.service_title ?? details.service_name),
    status: asStr(d.status),
    paymentStatus: asStr(d.payment_status),
    contactUnlocked: Boolean(d.contact_unlocked),
    areaKey: asStr(d.area ?? service.category ?? details.area),
    region: asStr(d.region ?? details.region),
    budget: amount != null ? fmtUzs(amount) : asStr(details.budget),
    createdAt: asStr(d.created_at ?? d.createdAt),
    lawyerName: asStr(d.lawyer_name ?? asDict(d.lawyer).name) || undefined,
    confirmationDeadlineAt: asStr(d.confirmation_deadline_at ?? details.confirmation_deadline_at) || undefined,
  };
}
function normStats(v: unknown): SellerStats {
  const d = asDict(v);
  return { workload: asDict(d.workload), finance: asDict(d.finance), performance: asDict(d.performance) };
}
function normCabinetCase(v: unknown): CabinetCase {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    caseNumber: asStr(d.case_number),
    title: asStr(d.title ?? d.case_type),
    stage: asStr(d.stage),
    status: asStr(d.status),
    nextAction: asStr(d.next_action),
    deadlineAt: asStr(d.deadline_at),
  };
}
function normCabinetRoom(v: unknown): CabinetRoom {
  const d = asDict(v);
  return {
    id: asStr(d.id), status: asStr(d.status), orderId: asStr(d.order_id), caseId: asStr(d.case_id), clientUserId: asStr(d.client_user_id),
    createdAt: asStr(d.created_at), updatedAt: asStr(d.updated_at ?? d.created_at),
  };
}
function normCabinetNotification(v: unknown): CabinetNotification {
  const d = asDict(v);
  return { id: asStr(d.id), title: asStr(d.title), body: asStr(d.body), kind: asStr(d.kind, "system"), read: Boolean(d.read), createdAt: asStr(d.created_at) };
}
function listOf(v: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(v)) return v;
  const d = asDict(v);
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as unknown[];
  return [];
}
// One request; the base SellerCabinet fields match backend.ts getSellerCabinet.
export async function getSellerCabinetFull(): Promise<SellerCabinetFull> {
  const d = asDict(await http("/lawyers/me/cabinet"));
  const limitedAccess = Boolean(d.limited_access);
  const a = asDict(d.available_actions);
  const allowed = (k: string) => (a[k] == null ? !limitedAccess : Boolean(a[k]));
  const profile = asDict(d.profile);
  const v = asDict(d.verification);
  return {
    fetchedAt: todayIso(),
    accountStatus: asStr(d.account_status),
    role: asStr(d.role),
    sellerType: asStr(d.seller_type ?? profile.seller_type),
    limitedAccess,
    limitedReason: asStr(d.limited_reason),
    actions: { acceptOrders: allowed("accept_orders"), secureChat: allowed("secure_chat"), calls: allowed("calls") },
    profile: normLawyer(profile),
    verification: {
      status: typeof d.verification === "string" ? d.verification : asStr(v.status ?? v.verification_status ?? profile.verification_status),
      verified: Boolean(v.is_verified ?? v.verified ?? profile.is_verified),
    },
    stats: normStats(d.stats),
    newOrders: listOf(d.new_orders, "orders", "items", "data").map(normOrder),
    activeCases: listOf(d.active_cases, "items", "data").map(normCabinetCase),
    secureChats: listOf(d.secure_chats, "rooms", "items", "data").map(normCabinetRoom),
    notifications: listOf(d.notifications, "items", "data").map(normCabinetNotification),
  };
}
// No activity yet: every workload/finance counter is zero and the lists are
// empty. (performance carries backend floor values, so it is not consulted.)
export function isCabinetEmpty(c: SellerCabinetFull): boolean {
  const zero = (o: Dict) => Object.entries(o).every(([k, x]) => k === "currency" || k === "earnings_via_lexgo_period" || !asNum(x));
  return zero(c.stats.workload) && zero(c.stats.finance) && !c.newOrders.length && !c.activeCases.length && !c.secureChats.length;
}
