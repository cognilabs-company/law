import { expect, test } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const CALLS = Array.from({ length: 10 }, (_, i) => ({
  id: `cl${i}`,
  record_type: i < 2 ? "incoming" : "outgoing",
  title: `+99890111002${i}`,
  status: i === 9 ? "missed" : "completed",
  created_at: ago(30 + i),
  owner_user_id: "u-cc",
  payload: { phone: `+99890111002${i}`, client_user_id: i % 2 ? "u-c1" : "", topic: "Buyurtma holati", result: i % 3 ? "Gaplashildi" : "", next_action: i === 3 ? "Ertaga qayta qo'ng'iroq" : "", duration_sec: 60 },
}));

test("call log lists every counted call", async ({ page }) => {
  const routes = await signIn(page, CALL_CENTER, { "/call-center/calls": { items: CALLS }, "/call-center/queue": { items: [] } });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/call-center?view=clients");
  await page.locator("#opx-cl-tab-calls").click();
  await expect(page.locator(".opx-cl-log__row")).toHaveCount(10);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/ccfix/calllog.png" });
  await expect(page.locator(".opx-cl-log__row").first()).toBeVisible();
});

const QUEUE = [
  { id: "lq-1", type: "lead", title: "Lead", status: "new", score: "hot", urgency: "urgent", details: { name: "Zarina Usmonova", phone: "+998901112233" }, sla_minutes: 60, age_minutes: 900, sla_breached: true, created_at: ago(900) },
  { id: "oq-1", type: "order", title: "order", status: "sent_to_seller", client: { id: "u-c1", name: "Dilnoza Karimova", phone: "+998900000005" }, sla_minutes: 60, age_minutes: 3000, sla_breached: true, created_at: ago(3000) },
];

test("queue cards name the client and translate the row kind", async ({ page }) => {
  const routes = await signIn(page, CALL_CENTER, { "/call-center/queue": { items: QUEUE }, "/call-center/calls": { items: [] } });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/call-center?view=queues");
  await page.getByRole("button", { name: /^Oila/ }).click();
  await expect(page.getByText("Zarina Usmonova").first()).toBeVisible();
  await expect(page.getByText("Dilnoza Karimova").first()).toBeVisible();
  await expect(page.locator(".opx-qcard__why", { hasText: /^Lead$/ })).toHaveCount(0);
  await expect(page.getByText("Ism ko'rsatilmagan")).toHaveCount(0);
});

test("opening the oldest job opens that job, not an empty panel", async ({ page }) => {
  const routes = await signIn(page, CALL_CENTER, { "/call-center/queue": { items: QUEUE }, "/call-center/calls": { items: [] } });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/call-center?view=queues");
  await page.getByRole("button", { name: "Eng eski ishni ochish" }).click();
  await expect(page).toHaveURL(/pick=q%3Aorder%3Aoq-1/);
  await expect(page.getByRole("heading", { name: "Dilnoza Karimova" }).first()).toBeVisible();
});

test("duty lawyer picks notification recipients by name, never by id, and cannot broadcast", async ({ page }) => {
  const duty = { id: "u-duty", name: "Duty Yurist", phone: "+998901004001", role: "client" as const, backendRole: "call_center_lawyer", roles: ["call_center_lawyer"], permissions: ["notifications.manage", "callcenter.access"] };
  const routes = await signIn(page, duty, {
    "/users/search": { items: [{ id: "u-77", name: "Sardor Misolov", phone: "+998901234567", role: "advokat", lexgo_id: "LGA-77" }] },
    "/admin/notifications": { ok: true, deliveries: [] },
    "/urgent-advokat/requests/assigned": { items: [] },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/notifications");
  await expect(page.getByText("Bildirishnoma yuborish").first()).toBeVisible();
  await expect(page.getByPlaceholder(/UUID/)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Butun rolga" })).toHaveCount(0);
  await page.getByPlaceholder("Ism, telefon yoki LexGo ID bo'yicha qidiring").fill("Sardor");
  await page.getByRole("button", { name: /Sardor Misolov/ }).click();
  await expect(page.locator("button.nrcp__row", { hasText: "Sardor Misolov" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Sardor Misolovni ro'yxatdan olib tashlash" })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/ccfix/notifs-picker.png" });
});
