import type { Routes } from "../mock";

// Backend answers for the design screenshots: records shaped like the live
// API (captured 2026-11-04), so the dashboards render their filled state.
// Every value is made up for the tests.

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();
const ahead = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();

export const URGENT_CATALOG = {
  module: "urgent_advokat",
  title: "Tezkor Advokat xizmati online",
  meeting_default_minutes: 30,
  free_extension_once_minutes: 3,
  paid_extension_price_per_minute: 2000,
  services: [
    { key: "video_consultation", title: "Advokat bilan videokonsultatsiya", delivery: "callcenter_pool", meeting_minutes: 30, price: 200000, variant: "ordinary" },
    { key: "express_video_consultation", title: "Express videokonsultatsiya", delivery: "on_duty_lawyer_pool", meeting_minutes: 30, price: 150000, variant: "express", immediate_call: true },
    { key: "traffic_accident_consultation", title: "YTX bo'yicha huquqiy konsultatsiya", delivery: "on_duty_lawyer_pool", meeting_minutes: 30, price: 250000, variant: "traffic_accident", immediate_call: true },
    { key: "chat_consultation", title: "Chat orqali konsultatsiya", delivery: "callcenter_pool", meeting_minutes: 0, price: 100000 },
  ],
  groups: [],
};

const seller = (id: string, name: string, type: string, specs: string[], cats: [string, string][], bio: string, langs: string[], services: [string, number][]) => ({
  id: `p-${id}`,
  user_id: id,
  public_id: `LGP-${id}`,
  name,
  display_name: name,
  lawyer_name: name,
  seller_type: type,
  region: "tashkent",
  district: "",
  specializations: specs,
  languages: langs,
  bio,
  experience_years: 8,
  total_cases: 64,
  rating: 4.8,
  reviews_count: 36,
  success_rate: 92,
  is_verified: true,
  categories: cats.map(([slug, title]) => ({ id: `c-${slug}`, slug, title })),
  services: services.map(([title, price], i) => ({ id: `${id}-s${i}`, category_id: `c-${cats[0][0]}`, category_title: cats[0][1], title, base_price: price, standard_price: price, selected_price: price, currency: "UZS", is_active: true })),
  online_now: true,
});

export const SELLERS = [
  seller("u-adv", "Sardor Misolov", "advokat", ["labor-disputes", "civil-cases"], [["mehnat-huquqi", "Mehnat huquqi"], ["fuqarolik-ishlari", "Fuqarolik ishlari"]], "Mehnat nizolari va fuqarolik ishlari bo'yicha sudda vakillik qiladi. Konsultatsiyalarni o'zbek va rus tillarida olib boradi.", ["uz-latn", "ru"], [["Onlayn konsultatsiya", 350000], ["Sudda vakillik", 1500000], ["Da'vo arizasi", 400000]]),
  seller("u-law", "Dilnoza Misolova", "yurist", ["realestate-lease-contract", "family-divorce"], [["kochmas-mulk", "Ko'chmas mulk"], ["shartnomalar", "Shartnomalar"], ["oila-huquqi", "Oila huquqi"]], "Ijara, oldi-sotdi va oilaviy masalalar bo'yicha hujjatlarni tayyorlaydi va tekshiradi.", ["uz-latn", "ru", "en"], [["Shartnoma tekshiruvi", 250000], ["Hujjat tayyorlash", 300000], ["Onlayn konsultatsiya", 200000]]),
];

const clientOrder = (id: string, work: string, title: string, status: string, minsAgo: number, lawyer: string, extra: Record<string, unknown> = {}) => ({
  id,
  work_id: work,
  status,
  payment_status: status === "waiting_payment" ? "pending" : "paid",
  service_title: title,
  price: 350000,
  currency: "UZS",
  created_at: iso(minsAgo),
  lawyer_user_id: "u-adv",
  lawyer_name: lawyer,
  lawyer: { id: "u-adv", name: lawyer },
  client_user_id: "u-client",
  client: { id: "u-client", name: "Malika Namunova" },
  secure_chat_room_id: `room-${id}`,
  can_start_chat: true,
  ...extra,
});

export const CLIENT_ORDERS = [
  clientOrder("o-1", "MP-10427", "Mehnat nizosi bo'yicha maslahat", "in_progress", 90, "Sardor Misolov"),
  clientOrder("o-2", "MP-10419", "Ijara shartnomasini tekshirish", "waiting_payment", 60 * 27, "Dilnoza Misolova"),
];

// Seller side: open orders waiting for an answer.
const openOrder = (id: string, work: string, title: string, region: string, note: string, price: number, deadlineMins: number) => ({
  id,
  work_id: work,
  source: "marketplace",
  status: "sent_to_seller",
  payment_status: "paid",
  service_title: title,
  price,
  currency: "UZS",
  created_at: iso(30 - deadlineMins),
  note,
  region,
  service_name: title,
  details: { question: note, region, acceptance_deadline_at: ahead(deadlineMins), service_title: title },
  acceptance_deadline_at: ahead(deadlineMins),
  assignment: { status: "pending", deadline_at: ahead(deadlineMins), response_minutes: 30 },
  client: { id: "u-client", name: "Malika Namunova" },
  client_user_id: "u-client",
});

export const OPEN_ORDERS = [
  openOrder("so-1", "MP-10427", "Mehnat nizosi bo'yicha konsultatsiya", "tashkent", "Ish beruvchi meni ogohlantirmasdan ishdan bo'shatdi va oxirgi ikki oylik maoshimni to'lamayapti. Mehnat inspeksiyasiga murojaat qilishim kerakmi yoki to'g'ridan-to'g'ri sudgami? Qanday hujjatlar tayyorlashim lozim?", 350000, 4),
  openOrder("so-2", "MP-10431", "Ijara shartnomasini tekshirish", "samarkand", "Kvartirani bir yilga ijaraga olmoqchiman. Shartnomada garov puli qaytarilmasligi haqida band bor. Bu qonuniymi va qanday o'zgartirish so'rashim mumkin?", 250000, 18),
  openOrder("so-3", "MP-10433", "Avtoavariya bo'yicha konsultatsiya", "tashkent", "Chorrahada orqadan urib ketishdi, aybdor haydovchi sug'urta polisini ko'rsatmadi. Zararni qanday undirish mumkin va qayerga murojaat qilish kerak?", 300000, 42),
];

const TICKETS = () => ({
        items: [
          { id: "t-1", work_id: "FB-2017", source: "feedback_bug", category: "technical", subject: "To'lov sahifasi yuklanmadi", status: "claimed", created_at: iso(60 * 24 * 6) },
          { id: "t-2", work_id: "FB-1984", source: "feedback_suggestion", category: "general", subject: "Hujjatlarni papkalarga ajratish", status: "resolved", created_at: iso(60 * 24 * 13) },
        ],
        count: 2,
      });

export function mocksFor(role: string): Routes {
  if (role === "client") {
    return {
      "/marketplace/me/orders": { items: CLIENT_ORDERS, count: CLIENT_ORDERS.length },
      "/urgent-advokat/catalog": URGENT_CATALOG,
      "/marketplace/lawyers": { items: SELLERS, total: SELLERS.length, count: SELLERS.length },
      "/referrals/me": { code: "MALIKA", link: "https://lexgo.uz/r/MALIKA", invited_count: 5, joined_count: 3 },
      "/support/tickets/me": TICKETS(),
    };
  }
  const today = new Date();
  const at = (h: number, m: number, dayShift = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayShift, h, m).toISOString();
  const ledger = [
    ["MP-10390", 350000, "paid", 2], ["MP-10372", 500000, "paid", 4], ["MP-10368", 200000, "pending", 5], ["MP-10355", 450000, "paid", 8], ["MP-10349", 300000, "paid", 10],
    ["MP-10341", 250000, "paid", 12], ["MP-10333", 400000, "paid", 14], ["MP-10325", 150000, "paid", 15], ["MP-10318", 350000, "paid", 17], ["MP-10306", 200000, "paid", 19], ["MP-10299", 300000, "paid", 21], ["MP-10287", 250000, "paid", 23],
  ].map(([w, price, pay, days]) => ({ id: `led-${w}`, work_id: w, status: "completed", payment_status: pay, service_title: "Konsultatsiya", price, currency: "UZS", created_at: iso(Number(days) * 1440), client: { id: "u-client", name: "Malika Namunova" } }));
  return {
    "/lawyers/me/cabinet": {
      account_status: "active",
      role: role === "advocate" ? "advokat" : "yurist",
      seller_type: role === "advocate" ? "advokat" : "yurist",
      limited_access: false,
      available_actions: { accept_orders: true, secure_chat: true, calls: true },
      verification: { status: "verified", is_verified: true },
      profile: { user_id: role === "advocate" ? "u-adv" : "u-law", name: role === "advocate" ? "Sardor Misolov" : "Dilnoza Misolova", seller_type: role === "advocate" ? "advokat" : "yurist", is_verified: true, total_cases: 48, rating: 4.8, reviews_count: 36 },
      stats: {
        workload: { active_cases: role === "advocate" ? 5 : 4, deadlines_today: 2, courts_today: 1, unread_messages: 3, completed_cases: 48 },
        finance: { earnings_month: 4200000, pending_payout: 1050000, payable: 2350000, currency: "UZS" },
        performance: { avg_response_minutes: 12, response_rate: 98 },
      },
      new_orders: [],
      notifications: [],
    },
    "/calendar-events": { items: [
      { id: "e1", type: "deadline", title: "Da'vo arizasini sudga topshirish", starts_at: at(16, 0), status: "scheduled", location: "MP-10398" },
      { id: "e2", type: "meeting", title: "Onlayn uchrashuv: hujjatlarni kelishish", starts_at: at(18, 30), status: "scheduled", location: "MP-10411" },
      { id: "e3", type: "court", title: "Sud majlisi", starts_at: at(10, 0, -1), status: "done", location: "" },
      { id: "e4", type: "meeting", title: "Mijoz bilan uchrashuv", starts_at: at(11, 0, 1), status: "scheduled", location: "" },
      { id: "e5", type: "deadline", title: "Apellyatsiya muddati", starts_at: at(9, 0, 1), status: "scheduled", location: "" },
      { id: "e6", type: "task", title: "Shartnoma loyihasi", starts_at: at(15, 0, 2), status: "scheduled", location: "" },
      { id: "e7", type: "meeting", title: "Konsultatsiya", starts_at: at(12, 0, 3), status: "scheduled", location: "" },
    ] },
    "/notifications": { items: [
      { id: "n1", title: "Yangi buyurtma · MP-10427", kind: "order_created", read: false, created_at: iso(30) },
      { id: "n2", title: "Mijoz yangi xabar yubordi · MP-10398", kind: "chat_message", read: false, created_at: iso(70) },
      { id: "n3", title: "Yangi qoidalar e'lon qilindi", kind: "rules_published", read: false, created_at: iso(330) },
      { id: "n4", title: "To'lov o'tkazildi: 350 000 so'm", kind: "payout", read: true, created_at: iso(1250) },
      { id: "n5", title: "Uchrashuv vaqti o'zgartirildi", kind: "meeting_updated", read: true, created_at: iso(1650) },
    ] },
    "/tasks/me": { items: [] },
    "/marketplace/me/rating": { rating_status: "rated", public_rating: 4.8, reviews_count: 36, metrics: { completed_orders: 48, average_response_seconds: 720 } },
    [`/marketplace/lawyers/${role === "advocate" ? "u-adv" : "u-law"}`]: { ...SELLERS[role === "advocate" ? 0 : 1], reviews: [...Array(29).fill(5), ...Array(5).fill(4), 3, 2].map((r, i) => ({ id: `rv${i}`, rating: r, comment: "", created_at: iso(i * 1440) })) },
    "/orders": { orders: OPEN_ORDERS },
    "/support/tickets/me": TICKETS(),
    "/marketplace/me/orders": { items: ledger, count: ledger.length },
    ...Object.fromEntries(OPEN_ORDERS.map((o) => [`/marketplace/me/orders/${o.id}`, { order: o }])),
    "/secure-chats": { rooms: [{ id: "r1", unread_count: 2 }, { id: "r2", unread_count: 1 }] },
  };
}
