"use client";

// Demo dashboard fixtures. Production has no showcase seed, so a dashboard
// whose payload is entirely empty renders these realistic values instead —
// always labelled "Demo ma'lumot" — until real activity exists. Admins can
// also force them with the "Demo ko'rsatish" toggle (localStorage
// lexgo_demo_stats). Nothing here is random: series are derived from fixed
// shape tables so every render (and SSR) agrees.
import { useSyncExternalStore } from "react";
import { REGION_KEYS } from "@/lib/lawyers";
import type { AdminDashboardFull, CallAnalyticsFull, CeoDashboardFull, QualityFull, RetentionData, SellerCabinetFull, CabinetCase, CabinetRoom, CabinetNotification } from "@/lib/services/dash";
import type { BackendOrder, SellerStats } from "@/lib/services/backend";

// ── "Demo ko'rsatish" toggle (shared across tiles via an external store) ──
export const DEMO_KEY = "lexgo_demo_stats";
const listeners = new Set<() => void>();
function readForced(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}
export function setDemoForced(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEMO_KEY, "1");
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === DEMO_KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
// [forced, setForced] — false during SSR/hydration, then the stored flag.
export function useDemoForced(): [boolean, (on: boolean) => void] {
  const forced = useSyncExternalStore(subscribe, readForced, () => false);
  return [forced, setDemoForced];
}

// ── Helpers ───────────────────────────────────────────────────────
// ISO day `n` days before `today` (YYYY-MM-DD, local calendar arithmetic).
export function dayBefore(today: string, n: number): string {
  const [y, m, d] = today.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y || 2026, (m || 1) - 1, (d || 1) - n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
// Fixed weekly rhythm (Mon..Sun-ish) so trends look like traffic, not noise.
const SHAPE = [0.72, 0.88, 1.0, 1.12, 0.96, 1.24, 0.81, 0.93, 1.08, 1.31, 0.77, 0.9, 1.15, 1.02];
function series(today: string, days: number, base: number, growth = 0.012): { label: string; value: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const idx = days - 1 - i;
    const v = base * SHAPE[i % SHAPE.length] * (1 + growth * i);
    return { label: dayBefore(today, idx), value: Math.round(v) };
  });
}
const REGION_WEIGHTS = [38, 14, 11, 9, 8, 7, 5, 4, 2, 2]; // % share across REGION_KEYS order

// ── Admin dashboard ───────────────────────────────────────────────
export const DEMO_ADMIN_TOTALS = {
  users: 1284, clients: 1102, yurists: 96, advokats: 74, organizations: 12, services: 48, orders: 417, cases: 163,
  leads: 958, payments: 389, tasks: 57, b2b_clients: 9, reviews: 212,
  gift_purchases: 41, gift_claimed: 29, gift_activation_rate: 71, gift_recipient_paid_conversion: 34, gift_average_value: 420000,
};
export const DEMO_ADMIN_PAYMENTS = { paid_amount: 186_450_000, pending_amount: 23_900_000, paid_count: 352, pending_count: 37 };
export const DEMO_ORDERS_BY_STATUS = { new: 38, waiting_payment: 21, paid: 44, in_progress: 96, delivered: 27, completed: 168, cancelled: 23 };
export const DEMO_LEADS_BY_SCORE = { hot: 214, warm: 421, cold: 323 };
export const DEMO_SELLERS_BY_ROLE = { yurist: 96, advokat: 74, advokat_tashkiloti: 6 };
export const DEMO_LEADS_BY_REGION = (total: number) => REGION_KEYS.map((r, i) => ({ label: r, value: Math.round((total * REGION_WEIGHTS[i]) / 100) }));
const entries = (o: Record<string, number>) => Object.entries(o).map(([label, value]) => ({ label, value }));

export function demoAdminDashboard(today: string): AdminDashboardFull {
  const totals = DEMO_ADMIN_TOTALS as Record<string, number>;
  const pay = DEMO_ADMIN_PAYMENTS as Record<string, number>;
  return {
    fetchedAt: today,
    totals: [...entries(totals), ...entries(pay), ...entries(DEMO_ORDERS_BY_STATUS), ...entries(DEMO_LEADS_BY_SCORE), ...entries(DEMO_SELLERS_BY_ROLE)],
    charts: [
      { key: "orders_by_status", points: entries(DEMO_ORDERS_BY_STATUS) },
      { key: "leads_by_score", points: entries(DEMO_LEADS_BY_SCORE) },
      { key: "sellers_by_role", points: entries(DEMO_SELLERS_BY_ROLE) },
      { key: "payments", points: [{ label: "paid", value: pay.paid_amount }, { label: "pending", value: pay.pending_amount }] },
      { key: "leads_by_region", points: DEMO_LEADS_BY_REGION(totals.leads) },
      { key: "revenue_trend", points: series(today, 30, 5_200_000) },
    ],
    groups: { totals, payments: pay, orders: DEMO_ORDERS_BY_STATUS, leads: DEMO_LEADS_BY_SCORE, sellers: DEMO_SELLERS_BY_ROLE },
    lists: {
      tasks: [
        { id: "demo-t1", title: "Shartnoma loyihasini tekshirish", status: "in_progress", meta: "", date: dayBefore(today, 1) },
        { id: "demo-t2", title: "Mijoz bilan qayta aloqa", status: "new", meta: "", date: today },
      ],
      b2bClients: [
        { id: "demo-b1", title: "Toshkent Logistics MChJ", status: "proposal", meta: "Logistika", amount: 18_000_000, date: dayBefore(today, 3) },
        { id: "demo-b2", title: "Samarqand Textile", status: "active", meta: "Ishlab chiqarish", amount: 32_000_000, date: dayBefore(today, 9) },
      ],
      reviews: [{ id: "demo-r1", title: "Tez va aniq javob", status: "published", meta: "5", date: dayBefore(today, 2) }],
      gifts: [{ id: "demo-g1", title: "Yuridik maslahat sovg'asi", status: "claimed", meta: "", amount: 450_000, date: dayBefore(today, 4) }],
    },
  };
}

// ── CEO ───────────────────────────────────────────────────────────
export function demoCeo(today: string): CeoDashboardFull {
  const trend = series(today, 30, 5_200_000);
  const revenue = trend.reduce((s, p) => s + p.value, 0);
  return {
    fetchedAt: today,
    revenue, revenueDeltaPct: 12, mrr: Math.round(revenue * 0.31),
    users: 1284, activeUsers: 612, conversionPct: 43.5,
    funnel: [{ label: "leads", value: 958 }, { label: "orders", value: 417 }, { label: "paid", value: 352 }],
    channels: [
      { name: "web", leads: 412, pct: 38.1, payments: 157, revenue: Math.round(revenue * 0.42) },
      { name: "telegram", leads: 296, pct: 41.2, payments: 122, revenue: Math.round(revenue * 0.3) },
      { name: "referral", leads: 131, pct: 29.8, payments: 39, revenue: Math.round(revenue * 0.12) },
      { name: "ads", leads: 84, pct: 21.4, payments: 18, revenue: Math.round(revenue * 0.09) },
      { name: "organic", leads: 35, pct: 45.7, payments: 16, revenue: Math.round(revenue * 0.07) },
    ],
    cacClient: 38_000, cacAdvocate: 92_000, paidPayments: 352,
    revenueTrend: trend,
    mau: 612, dau: 147, gmv: Math.round(revenue * 1.6), arr: Math.round(revenue * 0.31 * 12), arpu: 145_000, takeRate: 18.5,
    cac: 46_000, ltv: 1_740_000, ltvCac: 37.8, paybackMonths: 0.3,
    npsClient: 62, npsAdvocate: 48,
    newClients: 138, newAdvocates: 9, newLawyers: 14,
    giftKpis: { giftPurchases: 41, giftActivationRate: 71, recipientConversion: 34, giftToPaidConversion: 27, averageGiftValue: 420_000, referralRate: 19, giftCac: 31_000, giftLtv: 980_000 },
  };
}

// ── Call analytics ────────────────────────────────────────────────
export function demoCalls(today: string): CallAnalyticsFull {
  const byDay = series(today, 7, 46, 0.02);
  const total = byDay.reduce((s, p) => s + p.value, 0);
  const answered = Math.round(total * 0.87);
  return {
    fetchedAt: today,
    total, answered, missed: total - answered, avgDurationSec: 412, byDay,
    topAgents: [{ name: "Dilnoza R.", calls: 71 }, { name: "Jasur T.", calls: 64 }, { name: "Malika S.", calls: 52 }, { name: "Bobur A.", calls: 47 }],
  };
}

// ── Retention ─────────────────────────────────────────────────────
export function demoRetention(today: string): RetentionData {
  return {
    fetchedAt: today,
    atRisk: 23, atRiskLeads: 8, churnedThisMonth: 6, retainedPct: 78.4,
    periodDays: 30, previousPeriodActive: 97, currentPeriodActive: 118, retainedClients: 76,
    atRiskClients: [
      { id: "demo-c1", name: "Aziza Karimova", phone: "+998 90 *** 12 34", reasons: ["subscription_expiring"], lastPaidAt: dayBefore(today, 26) },
      { id: "demo-c2", name: "Sardor Yusupov", phone: "+998 91 *** 45 67", reasons: ["no_paid_activity_30_days"], lastPaidAt: dayBefore(today, 44) },
      { id: "demo-c3", name: "Nilufar Tosheva", phone: "+998 93 *** 89 01", reasons: ["no_paid_history"], lastPaidAt: "" },
      { id: "demo-c4", name: "Otabek Rahimov", phone: "+998 97 *** 23 45", reasons: ["subscription_expiring", "no_paid_activity_30_days"], lastPaidAt: dayBefore(today, 38) },
      { id: "demo-c5", name: "Madina Alimova", phone: "+998 94 *** 67 89", reasons: ["no_paid_history"], lastPaidAt: "" },
    ],
    upsell: [
      { id: "demo-u1", name: "Aziza Karimova", suggestion: "Biznes tarifiga o'tish", price: 490_000, status: "active" },
      { id: "demo-u2", name: "Toshkent Logistics MChJ", suggestion: "Yillik hujjat paketi", price: 2_400_000, status: "active" },
    ],
  };
}

// ── Quality ───────────────────────────────────────────────────────
export function demoQuality(today: string): QualityFull {
  return {
    fetchedAt: today,
    avgRating: 4.7, responseSlaPct: 94, complaintRate: 14, resolvedPct: 86,
    flagged: [
      { title: "Javob muddati buzilgan", detail: "3 ta buyurtmada 15 daqiqalik javob oynasi o'tkazib yuborilgan", severity: "high" },
      { title: "Past reyting", detail: "Bir advokat oxirgi 5 baholashda 3.2 o'rtacha oldi", severity: "medium" },
      { title: "Hujjat kechikishi", detail: "Ikki hujjat so'rovi muddatidan 1 kun kech topshirildi", severity: "low" },
    ],
  };
}
export const DEMO_COMPLAINT_STATUSES = { open: 3, in_progress: 4, resolved: 12, closed: 6 };

// ── Seller cabinet ────────────────────────────────────────────────
export const DEMO_SELLER_STATS: SellerStats = {
  workload: { active_cases: 7, open_orders: 3, unread_messages: 4, deadlines_today: 2, courts_today: 1, documents_to_review: 3 },
  finance: { earnings_today: 850_000, earnings_month: 12_400_000, earnings_via_lexgo: 48_900_000, earnings_via_lexgo_period: "all_time", pending_payout: 3_200_000, payable: 1_150_000, currency: "UZS" },
  performance: { profile_views: 1_240, search_appearances: 3_860, profile_clicks: 412, contact_requests: 37, rating: 4.8, response_rate: 0.96, avg_response_minutes: 12, acceptance_rate: 0.82 },
};
export function demoSellerCases(today: string): CabinetCase[] {
  return [
    { id: "demo-k1", caseNumber: "LG-2409", title: "Mehnat nizosi — ishdan noqonuniy bo'shatish", stage: "court", status: "in_progress", nextAction: "Sud majlisi", deadlineAt: today },
    { id: "demo-k2", caseNumber: "LG-2415", title: "Ijara shartnomasini bekor qilish", stage: "negotiation", status: "active", nextAction: "Da'vo arizasi", deadlineAt: today },
    { id: "demo-k3", caseNumber: "LG-2421", title: "Aliment undirish", stage: "documents", status: "active", nextAction: "Hujjat to'plash", deadlineAt: dayBefore(today, -3) },
    { id: "demo-k4", caseNumber: "LG-2388", title: "Meros taqsimoti", stage: "investigation", status: "in_progress", nextAction: "Ekspertiza", deadlineAt: dayBefore(today, -9) },
    { id: "demo-k5", caseNumber: "LG-2402", title: "Qarz undirish (yuridik shaxs)", stage: "court", status: "active", nextAction: "Apellyatsiya", deadlineAt: dayBefore(today, -14) },
    { id: "demo-k6", caseNumber: "LG-2431", title: "Ko'chmas mulk oldi-sotdi nizosi", stage: "negotiation", status: "active", nextAction: "Kelishuv matni", deadlineAt: "" },
    { id: "demo-k7", caseNumber: "LG-2436", title: "Tadbirkorlik ro'yxatdan o'tkazish", stage: "documents", status: "active", nextAction: "Ustav tayyorlash", deadlineAt: "" },
  ];
}
export function demoSellerOrders(today: string): BackendOrder[] {
  return [
    { id: "demo-o1", title: "Ish beruvchi 2 oylik maoshni to'lamayapti, nima qilish kerak?", serviceName: "Mehnat huquqi bo'yicha maslahat", status: "new", paymentStatus: "pending", contactUnlocked: false, areaKey: "labor", region: "tashkent", budget: "350 000", createdAt: `${today}T09:40:00Z` },
    { id: "demo-o2", title: "Ijaraga beruvchi depozitni qaytarmayapti", serviceName: "Ijara nizosi", status: "new", paymentStatus: "pending", contactUnlocked: false, areaKey: "realEstate", region: "samarkand", budget: "500 000", createdAt: `${dayBefore(today, 1)}T16:15:00Z` },
    { id: "demo-o3", title: "Nikoh shartnomasini tuzish", serviceName: "Oilaviy huquq", status: "new", paymentStatus: "pending", contactUnlocked: false, areaKey: "family", region: "fergana", budget: "600 000", createdAt: `${dayBefore(today, 2)}T11:05:00Z` },
  ];
}
export function demoSellerRooms(today: string): CabinetRoom[] {
  return [
    { id: "demo-r1", status: "active", orderId: "demo-o1", caseId: "demo-k1", clientUserId: "", createdAt: dayBefore(today, 5), updatedAt: today },
    { id: "demo-r2", status: "active", orderId: "", caseId: "demo-k2", clientUserId: "", createdAt: dayBefore(today, 12), updatedAt: dayBefore(today, 1) },
    { id: "demo-r3", status: "active", orderId: "", caseId: "demo-k4", clientUserId: "", createdAt: dayBefore(today, 20), updatedAt: dayBefore(today, 2) },
  ];
}
export function demoSellerNotifications(today: string): CabinetNotification[] {
  return [
    { id: "demo-n1", title: "Yangi xabar", body: "Mijoz LG-2409 ish bo'yicha hujjat yubordi", kind: "secure_chat", read: false, createdAt: `${today}T08:12:00Z` },
    { id: "demo-n2", title: "Muddat yaqin", body: "LG-2415 — da'vo arizasi bugun topshirilishi kerak", kind: "deadline", read: false, createdAt: `${today}T07:00:00Z` },
    { id: "demo-n3", title: "To'lov kelib tushdi", body: "850 000 so'm hisobingizga o'tkazildi", kind: "payment", read: true, createdAt: `${dayBefore(today, 1)}T18:30:00Z` },
  ];
}
// A demo cabinet keeps the real profile/verification and swaps in demo stats + lists.
export function demoCabinet(real: SellerCabinetFull): SellerCabinetFull {
  const today = real.fetchedAt;
  return {
    ...real,
    stats: DEMO_SELLER_STATS,
    newOrders: demoSellerOrders(today),
    activeCases: demoSellerCases(today),
    secureChats: demoSellerRooms(today),
    notifications: demoSellerNotifications(today),
  };
}
