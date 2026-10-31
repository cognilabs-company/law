import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn, type Mock, type Who } from "./mock";
import { ORDER_ID, order } from "./fixtures";

// Owner, 2026-10-30: while the advocate works the checklist, the 30% items
// and the 40% items are two separate stages; when the 30% items are done,
// the seller sees at once that the money is being credited — from the real
// payout row (financials), never claimed "paid" before the backend says so.
// The client's checklist has no stages and no money in it.
// Screenshots: ADDON_SHOTS=<dir> (1440x900 and 390x844, light and dark).

type Row = { id: string; stage: string; status: string; gross_percent: number; payable_amount: number; paid_at?: string };
type State = { items: Record<string, unknown>[]; payouts: Row[] };

const ITEMS = () => [
  { id: "a1", executor_title: "Hujjatlarni tekshirish", client_title: "Hujjatlaringiz tekshirildi", status: "done", required: true, payout_stage: "first_checklist", updated_at: "2026-10-30T10:58:00Z" },
  { id: "a2", executor_title: "Da'vo loyihasini tayyorlash", client_title: "Da'vo loyihasi tayyorlandi", status: "pending", required: true, payout_stage: "first_checklist" },
  { id: "f1", executor_title: "Sudga topshirish", client_title: "Ariza sudga topshirildi", status: "pending", required: true, payout_stage: "final_completion" },
  { id: "f2", executor_title: "Mijozga yakuniy hisobot", client_title: "Yakuniy hisobot", status: "pending", required: true, payout_stage: "final_completion" },
];
const ACCEPT: Row = { id: "po-a", stage: "acceptance", status: "paid", gross_percent: 30, payable_amount: 33000, paid_at: "2026-10-30T09:00:00Z" };
const FIRST = (status: string): Row => ({ id: "po-b", stage: "first_checklist", status, gross_percent: 30, payable_amount: 33000 });

async function openOrder(page: Page, who: Who, state: State): Promise<Mock> {
  const mock = await mockBackend(
    page,
    await signIn(page, who, {
      [`/marketplace/me/orders/${ORDER_ID}`]: () => order({ status: "in_progress", payment_status: "paid", started_at: "2026-10-30T09:00:00Z" }),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => ({ order_id: ORDER_ID, payouts: who.role === "client" ? [] : state.payouts, settlement: null }),
      [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
      [`/marketplace/orders/${ORDER_ID}/checklist`]: () => ({ order_id: ORDER_ID, items: state.items }),
      // Marking an item done: the backend records the 30% payout once the
      // last 30% item is done; its transfer is under way.
      [`PATCH /marketplace/orders/${ORDER_ID}/checklist/([a-z0-9]+)`]: (body: unknown, url: URL) => {
        const id = url.pathname.split("/").pop() as string;
        const b = body as { status: string; comment?: string };
        state.items = state.items.map((i) => (i.id === id ? { ...i, status: b.status, comment: b.comment ?? "", updated_at: "2026-10-30T11:05:00Z" } : i));
        const firstDone = state.items.filter((i) => i.payout_stage === "first_checklist").every((i) => i.status !== "pending");
        if (firstDone && !state.payouts.some((p) => p.stage === "first_checklist")) state.payouts = [...state.payouts, FIRST("provider_pending")];
        return { item: { id, status: b.status, comment: b.comment ?? "" } };
      },
      "/marketplace/me/orders": { items: [], total: 0 },
    }),
  );
  await page.goto(`/uz/portal/${who.role === "client" ? "client" : "advocate"}/marketplace-orders/${ORDER_ID}`);
  return mock;
}

async function markDone(page: Page, title: string) {
  await page.getByRole("button", { name: `«${title}» bandini o'zgartirish` }).click();
  await page.locator(".mck-editor").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.locator(".mck-editor")).toHaveCount(0);
}

test("seller: the 30% and the 40% items are two stages with their own progress; the last 30% item credits the stage", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state: State = { items: ITEMS(), payouts: [ACCEPT] };
  const mock = await openOrder(page, ADVOCATE, state);
  const first = page.locator('.cps[data-stage="first_checklist"]');
  const final = page.locator('.cps[data-stage="final_completion"]');
  await expect(first).toBeVisible({ timeout: 20_000 });
  // Each stage: its own items, its own progress, what it pays and when.
  await expect(first.locator(".cps__t b")).toHaveText("30% bosqichi");
  await expect(first.locator(".mck-item")).toHaveCount(2);
  await expect(first.locator(".cps__count")).toHaveText("1 / 2 bajarildi");
  await expect(first.locator(".cps__track")).toHaveAttribute("aria-valuenow", "1");
  await expect(first.locator(".cps__hint")).toHaveText("Yana 1 ta bandni bajaring — 30% darhol hisobingizga o'tkaziladi.");
  await expect(first.locator(".cps__badge")).toHaveText("Bajarilmoqda");
  await expect(final.locator(".cps__t b")).toHaveText("Yakuniy 40% bosqichi");
  await expect(final.locator(".mck-item")).toHaveCount(2);
  await expect(final.locator(".cps__count")).toHaveText("0 / 2 bajarildi");
  await expect(final).toContainText("15 daqiqalik baholash va shikoyat oynasi yopilgach");
  await expect(final.locator(".cps__badge")).toHaveText("Yakunlangach");
  // The 30% group comes first, the final one after it.
  const order = await page.locator(".cps").evaluateAll((els) => els.map((e) => e.getAttribute("data-stage")));
  expect(order).toEqual(["first_checklist", "final_completion"]);
  await expect(first.locator(".cps__cheer")).toHaveCount(0);

  // The last 30% item: the stage is done and its payout is on its way.
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  await markDone(page, "Da'vo loyihasini tayyorlash");
  await expect(first.locator(".cps__count")).toHaveText("2 / 2 bajarildi");
  // The saved item keeps its client wording.
  await expect(first.locator("#mck-a2")).toContainText("Mijoz ko'radi: «Da'vo loyihasi tayyorlandi»");
  const cheer = first.locator(".cps__cheer");
  await expect(cheer).toHaveAttribute("data-celebrate", "");
  await expect(cheer).toContainText(/30% \(33[\s  ]?000 so'm\) hisobingizga yuborilmoqda/);
  await expect(cheer).not.toContainText("o'tkazildi");
  await expect(first.locator(".cps__badge")).toHaveText("O'tkazilmoqda");
  await expect(first.locator(".cps__amt")).toContainText(/33[\s  ]?000 so'm/);
  await expect(first.locator(".cps__hint")).toHaveCount(0);
  // The 40% stage is untouched.
  await expect(final.locator(".cps__badge")).toHaveText("Yakunlangach");
  // The payout card beside the order moved with it: the three planned
  // stages, the first-checklist one now backed by its created row.
  await expect(page.locator(".pst__step")).toHaveCount(3);
  await expect(page.locator('.pst__step[data-stage="checklist"]')).not.toHaveAttribute("data-planned", "");
  await expect(page.locator('.pst__step[data-stage="completion"]')).toHaveAttribute("data-planned", "");

  // The transfer lands: the backend says paid, and only then does it say so.
  state.payouts = [ACCEPT, { ...FIRST("paid"), paid_at: "2026-10-30T11:06:00Z" }];
  await mock.push({ event: "marketplace.payout_paid", order_id: ORDER_ID });
  await expect(cheer).toContainText(/30% \(33[\s  ]?000 so'm\) hisobingizga o'tkazildi/);
  await expect(first.locator(".cps__badge")).toHaveText("Hisobingizda");
});

test("seller: an already-done 30% stage whose transfer failed says so, without a celebration", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const items = ITEMS().map((i) => (i.payout_stage === "first_checklist" ? { ...i, status: "done" } : i));
  await openOrder(page, ADVOCATE, { items, payouts: [ACCEPT, FIRST("provider_failed")] });
  const first = page.locator('.cps[data-stage="first_checklist"]');
  await expect(first.locator(".cps__badge")).toHaveText("Kechikmoqda", { timeout: 20_000 });
  await expect(first.locator(".cps__cheer")).toContainText("LexGo operatori uni hal qilmoqda");
  await expect(first.locator(".cps__cheer")).not.toHaveAttribute("data-celebrate", "");
  await expect(first).not.toContainText("o'tkazildi");
});

// Backend answers 2026-10-31 §1.10: planned stages and created payout rows
// are separate; the 30% stage is reached when every first_checklist item is
// done or skipped_with_reason (the reason stays shown); with no
// first_checklist items that stage is not triggered automatically; the
// payout events re-read GET …/financials.
test("seller: planned stages beside the created rows; a skipped item counts and keeps its reason", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const items = ITEMS().map((i) => (i.id === "a2" ? { ...i, status: "skipped_with_reason", comment: "Mijoz loyihani o'zi tayyorlab keldi" } : i));
  const state: State = { items, payouts: [ACCEPT] };
  const mock = await openOrder(page, ADVOCATE, state);
  const first = page.locator('.cps[data-stage="first_checklist"]');
  await expect(first.locator(".cps__count")).toContainText("2 / 2 bajarildi", { timeout: 20_000 });
  await expect(first.locator(".cps__skip")).toHaveText("1 tasi sabab bilan o'tkazib yuborildi");
  await expect(first.locator("#mck-a2")).toContainText("Mijoz loyihani o'zi tayyorlab keldi");
  await expect(first.locator(".cps__hint")).toHaveCount(0);
  // The stage is reached, but no payout row exists yet: never "sent".
  await expect(first.locator(".cps__badge")).toHaveText("Bosqich bajarildi");
  const card = page.locator(".pst");
  await expect(card.locator(".pst__step")).toHaveCount(3);
  const step = (s: string) => card.locator(`.pst__step[data-stage="${s}"]`);
  await expect(step("accept")).toContainText("To'landi");
  await expect(step("accept")).toContainText(/33[\s  ]?000 so'm/);
  await expect(step("checklist")).toHaveAttribute("data-planned", "");
  await expect(step("checklist")).toContainText("30%");
  await expect(step("checklist")).toContainText("Rejalashtirilgan");
  await expect(step("checklist")).toContainText("Shart bajarilishini kutmoqda");
  await expect(step("checklist")).not.toContainText("so'm");
  await expect(step("completion")).toContainText("40%");
  await expect(step("completion")).toContainText("ushlab turishsiz yopilgach");

  // The backend creates the row and says so: the financials are re-read.
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  const reads = mock.count("GET", /\/financials$/);
  state.payouts = [ACCEPT, FIRST("operator_required")];
  await mock.push({ event: "marketplace.payout_created", order_id: ORDER_ID });
  await expect.poll(() => mock.count("GET", /\/financials$/)).toBeGreaterThan(reads);
  await expect(step("checklist")).not.toHaveAttribute("data-planned", "");
  await expect(step("checklist")).toContainText("To'lanadi");
  await expect(first.locator(".cps__badge")).toHaveText("O'tkazilmoqda");
  const again = mock.count("GET", /\/financials$/);
  await mock.push({ event: "marketplace.payout_required", order_id: ORDER_ID });
  await expect.poll(() => mock.count("GET", /\/financials$/)).toBeGreaterThan(again);
});

test("seller: with no first-checklist items the 30% stage says it is not triggered automatically", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const items = ITEMS().filter((i) => i.payout_stage !== "first_checklist");
  await openOrder(page, ADVOCATE, { items, payouts: [ACCEPT] });
  await expect(page.locator('.cps[data-stage="final_completion"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.cps[data-stage="first_checklist"]')).toHaveCount(0);
  const card = page.locator(".pst");
  const step = card.locator('.pst__step[data-stage="checklist"]');
  await expect(step).toHaveAttribute("data-status", "manual");
  await expect(step).toContainText("Avtomatik ishga tushmaydi");
  await expect(card).toContainText("birinchi checklist bosqichi avtomatik ishga tushmaydi");
});

test("client: one plain checklist — no stages, no percent, no money", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOrder(page, CLIENT, { items: ITEMS(), payouts: [ACCEPT] });
  const list = page.locator("#mod-checklist");
  await expect(list.locator(".mck-item")).toHaveCount(4, { timeout: 20_000 });
  await expect(list).toContainText("Da'vo loyihasi tayyorlandi");
  await expect(list).not.toContainText("Da'vo loyihasini tayyorlash");
  await expect(page.locator(".cps")).toHaveCount(0);
  const text = await list.innerText();
  expect(text).not.toMatch(/\d\s?%/);
  expect(text).not.toMatch(/so'm|bosqich/i);
  await expect(page.locator(".pst")).toHaveCount(0);
});

// ── screenshots ────────────────────────────────────────────────────────────
const SHOTS = process.env.ADDON_SHOTS;
async function shotPage(browser: Browser, width: number, height: number, scheme: "light" | "dark") {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
  return { ctx, page: await ctx.newPage() };
}

// Defined only with ADDON_SHOTS=<dir>, so a normal run neither skips nor
// takes it (like the layout tour's TOUR_SHOTS).
if (SHOTS)
test("screenshots: before and after the 30% stage is done", async ({ browser }) => {
  test.setTimeout(300_000);
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      const { ctx, page } = await shotPage(browser, w, h, scheme);
      const state: State = { items: ITEMS(), payouts: [ACCEPT] };
      await openOrder(page, ADVOCATE, state);
      const first = page.locator('.cps[data-stage="first_checklist"]');
      await expect(first).toBeVisible({ timeout: 30_000 });
      // No sideways scroll on the page.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await first.scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, -90);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/task-a-before-30-done-${w}-${scheme}.png` });
      await markDone(page, "Da'vo loyihasini tayyorlash");
      await expect(first.locator(".cps__cheer")).toContainText("yuborilmoqda");
      await page.waitForTimeout(900);
      await first.locator(w > 600 ? ".cps__h" : ".cps__count").evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
      await page.mouse.wheel(0, -110);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/task-a-after-30-done-${w}-${scheme}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await ctx.close();
    }
  }
});
