import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

// Call-center «Navbat», «Shoshilinch» and «Mijozlar» views, against mocked
// data: each page renders, names people (never ids) and never overflows
// sideways. SHOTS=before|after also saves light/dark screenshots at 1440
// and 390 px into /tmp/lexgo-ccx-pages/a/shots for the owner's review.

const SHOTS = process.env.SHOTS ?? "";
const DIR = "/tmp/lexgo-ccx-pages/a/shots";
if (SHOTS) mkdirSync(DIR, { recursive: true });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

const QUEUE = [
  { id: "5b2e8c11-1aaa-4bbb-8ccc-000000000001", type: "lead", title: "Oilaviy nizo", status: "new", score: "hot", urgency: "urgent", details: { name: "Zarina Usmonova", phone: "+998901112233" }, sla_minutes: 60, age_minutes: 900, sla_breached: true, created_at: ago(900) },
  { id: "69e71328-aaaa-4bbb-8ccc-000000000002", type: "order", title: "order", status: "sent_to_seller", client: { id: "u-c1", name: "Dilnoza Karimova", phone: "+998900000005" }, sla_minutes: 60, age_minutes: 3000, sla_breached: true, created_at: ago(3000) },
  { id: "a4c0e917-aaaa-4bbb-8ccc-000000000003", type: "order", title: "order", status: "new", client: { id: "u-c2", name: "Jasur Tursunov", phone: "+998900000006" }, sla_minutes: 600, age_minutes: 420, sla_breached: false, created_at: ago(420) },
  { id: "d81f3a52-aaaa-4bbb-8ccc-000000000004", type: "order", title: "order", status: "new", client: { id: "u-c3", name: "Malika Rahimova", phone: "+998900000007" }, sla_minutes: 1440, age_minutes: 30, sla_breached: false, created_at: ago(30) },
  { id: "3c9d7e60-aaaa-4bbb-8ccc-000000000005", type: "urgent_advokat", title: "Shoshilinch advokat", status: "open_pool", client: { id: "u-c4", name: "Sardor Aliyev", phone: "+998900000008" }, sla_minutes: 15, age_minutes: 25, sla_breached: true, created_at: ago(25) },
];

const QC = {
  id: "e5a1b2c3-aaaa-4bbb-8ccc-000000000006",
  work_id: "LGO-QC417",
  status: "new",
  title: "Kechikkan javob",
  complaint: "Advokat ikki kundan beri javob bermayapti, hujjatlarim kutib turibdi.",
  rating: 2,
  client: { name: "Dilnoza Karimova" },
  lawyer: { name: "Fuqarolik Yurist" },
  created_at: ago(60 * 7),
};

const CALLS = Array.from({ length: 8 }, (_, i) => ({
  id: `cl${i}`,
  record_type: i < 3 ? "incoming" : "outgoing",
  title: `+99890111002${i}`,
  status: i === 6 ? "missed" : "completed",
  created_at: ago(30 + i * 47),
  owner_user_id: "u-cc",
  payload: { phone: `+99890111002${i}`, client_user_id: i % 2 ? "u-c1" : "", topic: "Buyurtma holati", result: i % 3 ? "Gaplashildi" : "", next_action: i === 3 ? "Ertaga qayta qo'ng'iroq" : "", duration_sec: 60 + i * 35 },
}));

const UR = (n: number, over: Record<string, unknown>) => ({
  id: `7a1b2c3d-0000-4000-8000-00000000000${n}`,
  work_id: `ADV-K7Q2${n}`,
  service_kind: "urgent_advokat",
  title: "Shoshilinch advokat",
  channel: "phone",
  status: "open_pool",
  region: "tashkent_city",
  need: "Militsiya bo'limiga olib ketishdi, tezda advokat kerak.",
  directions: ["jinoyat"],
  price: 350000,
  created_at: ago(20 + n * 15),
  sla_breached: n === 1,
  can_manage: true,
  can_view: true,
  client_phone_visible: true,
  client: { id: `c0ffee00-0000-4000-8000-00000000000${n}`, name: ["Malika Rahimova", "Bekzod Ergashev", "Nodira Yusupova"][n - 1], phone: `+99890123456${n}` },
  lifecycle: { next_statuses: ["claimed", "cancelled"] },
  payload: { status_history: [{ from: "", to: "open_pool", changed_at: ago(20 + n * 15) }] },
  ...over,
});
const URGENT = [
  UR(1, {}),
  UR(2, { status: "scheduled", scheduled_at: ahead(90), claimed_by: { id: "u-cc", name: "Test Operator" }, assigned_lawyer: { id: "u-l2", name: "Fuqarolik Yurist", phone: "+998901004002" }, lifecycle: { next_statuses: ["meeting_active", "cancelled"] } }),
  UR(3, { status: "completed", channel: "video" }),
];

const CLIENTS = [
  { id: "u-c1", lexgo_id: "LG-10001", name: "Dilnoza Karimova", phone: "+998900000005", account_status: "active" },
  { id: "u-c9", lexgo_id: "LG-10009", name: "Dilnoza Abdullayeva", phone: "+998900000019", account_status: "active" },
];
const CARD = {
  client: { ...CLIENTS[0], referral_code: "DIL5", created_at: ago(60 * 24 * 120) },
  summary: { orders_count: 3, cases_count: 1, payments_count: 4, total_spent: 1250000, leads_count: 2, rooms_count: 1, complaints_count: 1, reviews_count: 2 },
  orders: [{ id: "o-1", title: "Shartnoma tahlili", status: "completed", price: 450000, created_at: ago(60 * 24 * 20) }],
  payments: [{ id: "p-1", amount: 450000, status: "paid", created_at: ago(60 * 24 * 20) }],
  leads: [],
  activities: [{ id: "a-1", action: "order_created", detail: "Shartnoma tahlili", created_at: ago(60 * 24 * 20) }],
  complaints: [{ id: "q-1", title: "Kechikkan javob", status: "resolved", created_at: ago(60 * 24 * 10) }],
  subscriptions: [],
  family_members: [],
};

async function theme(page: Page, t: "dark" | "light") {
  await page.addInitScript((th) => {
    localStorage.setItem("lexgo_ccx_prefs", JSON.stringify({ theme: th, bg: "night", motion: true, keys: true }));
  }, t);
}

async function routesFor(page: Page) {
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/queue": { items: QUEUE },
    "/call-center/calls": { items: CALLS },
    "/call-center/quality-complaints": { items: [QC] },
    [`/call-center/quality-complaints/${QC.id}`]: QC,
    "/call-center/marketplace/[a-z-]+": { items: [], total: 0 },
    "/call-center/urgent-advokat/requests": { items: URGENT },
    [`/call-center/urgent-advokat/requests/${URGENT[0].id}`]: URGENT[0],
    [`/call-center/urgent-advokat/requests/${URGENT[1].id}`]: URGENT[1],
    "/call-center/urgent-advokat/candidates": { items: [{ id: "u-l2", name: "Fuqarolik Yurist", phone: "+998901004002", rating: 4.8 }] },
    "/call-center/clients/search": { items: CLIENTS },
    "/call-center/clients/u-c1": CARD,
  });
  await mockBackend(page, routes);
}

async function snap(page: Page, view: string, t: string, w: number) {
  if (!SHOTS) return;
  await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,[data-sonner-toaster],nextjs-portal,.cpl-launch,.fab{display:none!important}" }).catch(() => undefined);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${SHOTS}-${view}-${w}-${t}.png` });
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function settle(page: Page) {
  await expect(page.locator(".opx-intro")).toHaveCount(0, { timeout: 20_000 });
}

const CASES: { t: "dark" | "light"; w: number }[] = [
  { t: "dark", w: 1440 },
  { t: "light", w: 1440 },
  { t: "dark", w: 390 },
];

for (const { t, w } of CASES) {
  test(`Navbat ${t} ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await theme(page, t);
    await routesFor(page);
    await page.goto("/uz/admin/call-center?view=queues");
    await expect(page.getByRole("button", { name: "Eng eski ishni ochish" })).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await snap(page, "queues", t, w);
    await page.getByRole("button", { name: /^Oila/ }).click();
    await expect(page.getByText("Dilnoza Karimova").first()).toBeVisible();
    await noOverflow(page);
    await snap(page, "queues-family", t, w);
    if (t === "dark" && w === 1440) {
      await page.getByRole("button", { name: /^Nizolar/ }).click();
      await page.getByRole("button", { name: /^Sifat shikoyatlari/ }).click();
      await page.locator(".opx-qcard", { hasText: "Kechikkan javob" }).first().locator("button.opx-qbtn").click();
      await expect(page.locator(".opx-sheet")).toBeVisible();
      await snap(page, "queues-job", t, w);
    }
    await expect(page.getByText("69e71328-aaaa-4bbb-8ccc-000000000002")).toHaveCount(0);
  });

  test(`Shoshilinch ${t} ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await theme(page, t);
    await routesFor(page);
    await page.goto("/uz/admin/call-center?view=urgent");
    await expect(page.getByText("Malika Rahimova").first()).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await snap(page, "urgent", t, w);
    if (t === "dark" && w === 1440) {
      await page.goto(`/uz/admin/call-center?view=urgent&id=${URGENT[1].id}`);
      await expect(page.getByText("Bekzod Ergashev").first()).toBeVisible();
      await settle(page);
      await snap(page, "urgent-detail", t, w);
    }
    await expect(page.getByText(URGENT[0].id)).toHaveCount(0);
  });

  test(`Mijozlar ${t} ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await theme(page, t);
    await routesFor(page);
    await page.goto("/uz/admin/call-center?view=clients&q=Dilnoza");
    await expect(page.getByRole("heading", { name: "Dilnoza Karimova" }).first()).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await snap(page, "clients", t, w);
    if (t === "dark" && w === 1440) {
      await page.locator("#opx-cl-tab-calls").click();
      await expect(page.locator(".opx-cl-log__row").first()).toBeVisible();
      await snap(page, "clients-calls", t, w);
    }
    await expect(page.getByText("u-c1", { exact: true })).toHaveCount(0);
  });
}
