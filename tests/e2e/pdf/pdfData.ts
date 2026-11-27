import type { Routes } from "../mock";

// Realistic data for the PDF before/after shots (owner's PDF, 2026-11-27).
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const inDays = (d: number, h = 10) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(h, 0, 0, 0);
  return t.toISOString();
};

const CLIENTS = ["Malika Namunova", "Sardor Karimov", "Akhmad Ziyovuddinov", "Kamron Karimov", "Dilshod Rahimov"];

const ORDERS = [
  ["MP-10431", "in_progress", "paid", "ID-karta yoki pasport olishda muammo", 500000, 40, "chat"],
  ["MP-10429", "in_progress", "paid", "Mehnat nizosi bo'yicha konsultatsiya", 350000, 180, "audio"],
  ["MP-10427", "pending", "pending", "Ijara shartnomasini tekshirish", 250000, 25, "chat"],
  ["MP-10418", "accepted", "paid", "Da'vo arizasi tayyorlash", 450000, 60 * 26, "video"],
  ["MP-10411", "completed", "paid", "Avtoavariya bo'yicha konsultatsiya", 300000, 60 * 50, "chat"],
  ["MP-10398", "completed", "paid", "Meros bo'yicha maslahat", 400000, 60 * 80, "chat"],
  ["MP-10390", "cancelled", "refunded", "Click test xizmati", 1000, 60 * 100, "chat"],
  ["MP-10388", "cancelled", "cancelled", "Click test xizmati", 1000, 60 * 120, "chat"],
] as const;

export function advocateOrders() {
  return ORDERS.map(([w, status, pay, title, price, ago, ch], i) => ({
    id: `o-${w}`,
    work_id: w,
    status,
    payment_status: pay,
    service_title: title,
    price,
    currency: "UZS",
    created_at: iso(ago),
    communication_type: ch,
    client: { id: `c${i}`, name: CLIENTS[i % CLIENTS.length], phone: "+99890933867" + (i % 10) },
  }));
}

const TASKS = [
  { id: "t1", title: "Sudga da'vo arizasini topshirish", status: "todo", priority: "high", due_date: inDays(1, 16), case_title: "MP-10418" },
  { id: "t2", title: "Mijoz bilan soat 19:00 da gaplashish", status: "todo", priority: "medium", due_date: inDays(0, 19), case_title: "MP-10429" },
  { id: "t3", title: "Ijara shartnomasiga izoh yozish", status: "in_progress", priority: "medium", due_date: inDays(2, 12), case_title: "MP-10427", checklist: [{ text: "Shartnomani o'qish", done: true }, { text: "Izoh yozish", done: false }] },
  { id: "t4", title: "Apellyatsiya muddatini tekshirish", status: "review", priority: "high", due_date: inDays(3, 9) },
  { id: "t5", title: "Meros hujjatlarini arxivlash", status: "done", priority: "low", due_date: inDays(-2, 11), case_title: "MP-10398" },
  { id: "t6", title: "Notarius bilan kelishish", status: "done", priority: "medium", due_date: inDays(-1, 15) },
];

const feats = (n: number, base: string[]) => base.slice(0, n);
const F = ["AI bilan cheksiz suhbat", "Hujjat shablonlarini yuklab olish", "Hujjat konstruktori", "Ovozli xabarni matnga o‘girish", "Ish bo‘yicha xulosa va xronologiya", "Muddatlar kalkulyatori", "Mijozlar bazasi", "Kalendar va eslatmalar", "Fayllar 20 GB", "Ustuvor qo‘llab-quvvatlash", "Hisobotlarni eksport qilish"];
const PLANS = [
  { id: "p-free", slug: "lexgo-ai-free", name: "Free", monthly_price: 0, currency: "UZS", is_active: true, features: feats(4, F), sort_order: 1 },
  { id: "p-lite", slug: "lexgo-ai-lite", name: "Lite", monthly_price: 99000, currency: "UZS", is_active: true, features: feats(8, F), sort_order: 2 },
  { id: "p-pro", slug: "lexgo-ai-pro", name: "Pro", monthly_price: 199000, currency: "UZS", is_active: true, features: feats(11, F), sort_order: 3 },
];

export function advocateExtra(): Routes {
  return {
    "/subscription-plans": { items: PLANS },
    "/marketplace/me/orders": { items: advocateOrders(), count: ORDERS.length },
    "/tasks/me": { items: TASKS },
    "/calls/invited": { items: [
      { room_id: "r1", call_id: "c1", call_type: "video", title: "MP-10429 · konsultatsiya", caller_name: "Sardor Misolov", status: "ended", started_at: iso(60 * 3), ended_at: iso(60 * 3 - 25) },
      { room_id: "r2", call_id: "c2", call_type: "audio", title: "MP-10431", caller_name: "Akhmad Ziyovuddinov", status: "ended", started_at: iso(60 * 27), ended_at: iso(60 * 27 - 12) },
      { room_id: "r1", call_id: "c3", call_type: "video", title: "MP-10418 · hujjatlarni kelishish", caller_name: "Sardor Misolov", status: "scheduled", started_at: inDays(0, 18) },
    ] },
    "/secure-chats/r1": { id: "r1", status: "active", order_id: "o-MP-10431", client_user_id: "c0", seller_user_id: "u-adv", participants: [{ user_id: "u-adv", name: "Sardor Misolov", role: "advokat" }, { user_id: "c0", name: "Akhmad Ziyovuddinov", role: "client" }], unread_count: 0 },
    "/secure-chats/r1/messages": { messages: [
      { id: "m1", sender_user_id: "c0", message_type: "text", filtered_content: "Assalomu alaykum, pasport bo'yicha savolim bor edi", created_at: iso(70) },
      { id: "m2", sender_user_id: "u-adv", message_type: "text", filtered_content: "Va alaykum assalom. Albatta, batafsil yozing.", created_at: iso(66) },
      { id: "m3", sender_user_id: "c0", message_type: "text", filtered_content: "ID-kartani olishda MIBdan rad javobi keldi, nima qilsam bo'ladi?", created_at: iso(60) },
    ] },
    "/secure-chats/r1/calls": { items: [] },
    "/secure-chats": { rooms: [
      { id: "r1", status: "active", order_id: "o-MP-10431", title: "Akhmad Ziyovuddinov", unread_count: 0, last_message: { filtered_content: "ID-kartani olishda MIBdan rad javobi keldi…", created_at: iso(60) }, participants: [{ user_id: "u-adv", name: "Sardor Misolov", role: "advokat" }, { user_id: "c0", name: "Akhmad Ziyovuddinov", role: "client" }] },
      { id: "r2", status: "active", order_id: "o-MP-10429", title: "Sardor Karimov", unread_count: 2, last_message: { filtered_content: "Rahmat, kutaman", created_at: iso(200) }, participants: [{ user_id: "u-adv", name: "Sardor Misolov", role: "advokat" }, { user_id: "c1", name: "Sardor Karimov", role: "client" }] },
    ] },
    "/marketplace/me/orders/o-MP-10431": { order: advocateOrders()[0] },
  };
}
