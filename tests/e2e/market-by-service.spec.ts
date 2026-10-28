import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// Browsing the marketplace by service: every service as a card with how
// many specialists offer it; picking one shows exactly those specialists.
const svc = (id: string, title: string, cat: string, price: number) => ({ service_id: id, title, category_id: cat, category_title: cat, base_price: price, selected_price: price, effective_price: price, currency: "UZS" });
const seller = (id: string, name: string, rating: number, services: unknown[]) => ({ user_id: id, name, seller_type: "advokat", region: "tashkent", rating, reviews_count: 5, is_verified: true, services });
// The catalog's own prices: the cards show these, not a seller's.
const META = {
  services: [
    { id: "v1", title: "Ajrashish bo'yicha maslahat", category_id: "c-family", base_price: 280000, currency: "UZS" },
    { id: "v2", title: "Aliment undirish", category_id: "c-family", base_price: 450000, currency: "UZS" },
    { id: "v3", title: "Meros rasmiylashtirish", category_id: "c-inherit", base_price: 500000, currency: "UZS" },
  ],
};
const SELLERS = [
  seller("s1", "Dilnoza Karimova", 4.9, [svc("v1", "Ajrashish bo'yicha maslahat", "c-family", 300000), svc("v2", "Aliment undirish", "c-family", 450000)]),
  seller("s2", "Akmal Yusupov", 4.6, [svc("v1", "Ajrashish bo'yicha maslahat", "c-family", 250000)]),
  seller("s3", "Nodira Rashidova", 4.8, [svc("v3", "Meros rasmiylashtirish", "c-inherit", 500000)]),
];

test("by service: the full purchase form goes to the backend's matcher, without a seller or region", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let sent: Record<string, unknown> | null = null;
  const routes = await signIn(page, CLIENT, {
    "/marketplace/lawyers": { items: SELLERS, count: 3, total: 3, meta: META },
    "/marketplace/services/v1/price-options": { items: [] },
    "POST /marketplace/services/v1/quote": { base_price: 250000, total_price: 250000, currency: "UZS", breakdown: [] },
    "/marketplace/me/orders": { items: [] },
    "POST /orders": (b: unknown) => (
      (sent = b as Record<string, unknown>),
      // Contract 2026-10-27 §4: the full payment first, no seller yet.
      {
        id: "ord-9",
        work_id: "ADV-9",
        status: "pending_payment",
        payment_status: "pending",
        price: 250000,
        payment: { id: "pay-9", status: "pending", amount: 250000, currency: "UZS", provider: "telegram_manual", payment_url: "" },
        details: { assignment_status: "payment_pending" },
      }
    ),
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/client/lawyers");
  await page.getByRole("button", { name: "Xizmatlar bo'yicha" }).click();
  const card = page.getByRole("button", { name: /Ajrashish bo'yicha maslahat: 2 ta mutaxassis/ });
  await expect(card).toContainText(/280\s000 so'm/);
  await expect(card).not.toContainText("250");
  await card.click();
  const dialog = page.getByRole("dialog", { name: "Xizmatni sotib olish" });
  await expect(dialog.getByText("LexGo eng mos mutaxassisni tanlaydi")).toBeVisible();
  await expect(dialog.getByText("Hudud")).toHaveCount(0);
  const note = dialog.getByRole("textbox").first();
  // A contact typed into the note is taken out at once.
  await note.fill("Ajrashish kerak, +998 90 123 45 67 ga qo'ng'iroq qiling");
  await expect(note).not.toHaveValue(/123 45 67/);
  await note.fill("Ajrashish bo'yicha maslahat kerak, bolalar masalasi bor");
  await dialog.getByText("1 soat ichida").click();
  await page.screenshot({ path: "/tmp/claude-1000/-home-abdurahmon-Desktop-law/1b23aff7-656c-46a8-a16f-81213b23ff98/scratchpad/shots/by-service-form.png" });
  await dialog.getByRole("button", { name: "LexGo mutaxassis tanlasin" }).click();
  await expect(dialog.getByText("To'lov kutilmoqda")).toBeVisible();
  await expect(dialog).not.toContainText("10%");
  expect(sent).toMatchObject({ service_id: "v1", source: "marketplace", payment_provider: "telegram_manual", currency: "UZS", details: { problem: "Ajrashish bo'yicha maslahat kerak, bolalar masalasi bor", note: "Ajrashish bo'yicha maslahat kerak, bolalar masalasi bor", contact_speed: "within_1_hour", preferred_channel: "chat", selected_option_ids: [] } });
  expect(sent).not.toHaveProperty("lawyer_user_id");
  expect((sent as unknown as { details: Record<string, unknown> }).details).not.toHaveProperty("region");
});

test("by service: 'I'll choose myself' shows that service's specialists", async ({ page }) => {
  const routes = await signIn(page, CLIENT, { "/marketplace/lawyers": { items: SELLERS, count: 3, total: 3, meta: META }, "/marketplace/services/v1/price-options": { items: [] }, "POST /marketplace/services/v1/quote": { base_price: 250000, total_price: 250000, currency: "UZS", breakdown: [] } });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/portal/client/lawyers?mode=services");
  await page.getByRole("button", { name: /Ajrashish bo'yicha maslahat: 2 ta mutaxassis/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mutaxassisni o'zim tanlayman" }).click();
  await expect(page.getByRole("button", { name: "Mutaxassislar bo'yicha" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Dilnoza Karimova").first()).toBeVisible();
  await expect(page.getByText("Akmal Yusupov").first()).toBeVisible();
  await expect(page.locator(".mk-grid")).not.toContainText("Nodira Rashidova");
  expect(mock.calls.some((c) => c.method === "POST" && c.path === "/orders")).toBe(false);
});
