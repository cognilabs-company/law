import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn, type Who } from "./mock";
import { OPERATOR, crmServer } from "./crmServer";

// «Tafsilotlar» (the urgent record a duty lawyer is assigned to) and
// «Batafsil» (the Hozir focus card's disclosure), against mocked data.
// SHOTS=before|after also saves light/dark screenshots at 1440 and 390 px
// into /tmp/lexgo-detail-design/shots for the owner's review.

const SHOTS = process.env.SHOTS ?? "";
const DIR = "/tmp/lexgo-detail-design/shots";
if (SHOTS) mkdirSync(DIR, { recursive: true });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

const DUTY: Who = { id: "u-duty", name: "Lola Navbatchi", phone: "+998901004001", role: "client", backendRole: "call_center_lawyer", roles: ["call_center_lawyer"], permissions: ["callcenter.access"] };

const URGENT = {
  id: "8f0c2d4e-1b2a-4c3d-9e8f-001122334455",
  work_id: "ADV-GVKAE",
  service_kind: "second_opinion_group",
  title: "Ikkinchi fikr — advokatlar guruhi",
  channel: "video",
  status: "scheduled",
  region: "tashkent_city",
  need: "Ijara shartnomasi bo'yicha sherigim bilan nizo chiqdi. Shartnomani buzganlik uchun jarima to'g'ri hisoblanganmi, bilmoqchiman.",
  directions: ["iqtisodiy", "fuqarolik"],
  requested_lawyer_count: 3,
  price: 450000,
  meeting_minutes: 45,
  scheduled_at: ahead(60 * 26),
  created_at: ago(60 * 30),
  sla_breached: false,
  can_manage: false,
  can_view: true,
  client_phone_visible: false,
  client_phone_hidden_reason: "payment_pending",
  client: { id: "c0ffee00-0000-4000-8000-000000000001", name: "Abdurahmon Karimov" },
  operator: { id: "u-op", name: "Madina Operatorova", phone: "+998901112244" },
  group_lawyers: [
    { id: "u-duty", name: "Lola Navbatchi", phone: "+998901004001" },
    { id: "u-l2", name: "Fuqarolik Yurist", phone: "+998901004002" },
    { id: "u-l3", name: "Iqtisodiy Advokat" },
  ],
  lifecycle: { next_statuses: ["meeting_active", "cancelled"] },
  payload: {
    meeting_note: "Shartnoma nusxasini uchrashuvdan oldin ko'rib chiqing.",
    status_history: [
      { from: "", to: "open_pool", changed_at: ago(60 * 30) },
      { from: "open_pool", to: "claimed", changed_at: ago(60 * 29) },
      { from: "claimed", to: "scheduled", changed_at: ago(60 * 28) },
    ],
  },
};

const QUEUE = [
  {
    id: "69e71328-aaaa-4bbb-8ccc-000000000001",
    type: "order",
    title: "order",
    status: "sent_to_seller",
    region: "tashkent_city",
    client: { id: "u-c1", name: "Dilnoza Karimova", phone: "+998900000005" },
    sla_minutes: 60,
    age_minutes: 3000,
    sla_breached: true,
    created_at: ago(3000),
  },
];

async function theme(page: Page, t: "dark" | "light") {
  await page.addInitScript((th) => {
    localStorage.setItem("lexgo_ccx_prefs", JSON.stringify({ theme: th, bg: "night", motion: true, keys: true }));
  }, t);
}

async function snap(page: Page, view: string, t: string, w: number) {
  if (!SHOTS) return;
  await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,[data-sonner-toaster],nextjs-portal,.cpl-launch,.fab{display:none!important}" }).catch(() => undefined);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${SHOTS}-${view}-${w}-${t}.png` });
}

async function openTafsilotlar(page: Page) {
  const routes = await signIn(page, DUTY, {
    "/call-center/urgent-advokat/requests": { status: 403, json: { detail: "Ruxsat yo'q" } },
    "/call-center/queue": { status: 403, json: { detail: "Ruxsat yo'q" } },
    "/urgent-advokat/requests/assigned": { items: [URGENT] },
    [`/urgent-advokat/requests/${URGENT.id}`]: URGENT,
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/call-center?view=urgent");
  const btn = page.getByRole("button", { name: "Tafsilotlar" }).first();
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
}

async function openBatafsil(page: Page) {
  const routes = await signIn(page, CALL_CENTER, { "/call-center/queue": { items: QUEUE }, "/call-center/calls": { items: [] } });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/call-center");
  const more = page.locator(".opx-focus__more");
  await expect(more).toBeVisible();
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
}

for (const t of ["dark", "light"] as const) {
  for (const w of [1440, 390]) {
    test(`Tafsilotlar ${t} ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
      await theme(page, t);
      await openTafsilotlar(page);
      const box = page.locator(`#uasg-${URGENT.id}`);
      await expect(box).toBeVisible();
      await expect(box.getByText("Abdurahmon Karimov").first()).toBeVisible();
      await box.scrollIntoViewIfNeeded();
      await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "start" }), `uasg-${URGENT.id}`);
      await snap(page, "tafsilotlar", t, w);
      // The withheld phone is a lock state; the others are tap-to-call links.
      await expect(box.locator(".opx-dk-lock")).toContainText("Telefon to'lovdan keyin ochiladi");
      await expect(box.locator('a.opx-dk-tel[href="tel:+998901004002"]')).toBeVisible();
      await expect(box.locator(".opx-dk-people li[data-me]")).toContainText("Siz");
      // Every timeline dot carries an icon.
      const dots = box.locator(".opx-dk-tl__dot");
      await expect(dots).toHaveCount(3);
      await expect(box.locator(".opx-dk-tl__dot svg")).toHaveCount(3);
      await expect(box.locator(".opx-dk-code")).toContainText("ADV-GVKAE");
      // Closing plays out, then the block leaves the page.
      await page.getByRole("button", { name: "Tafsilotlar" }).first().click();
      await expect(box).toHaveCount(0);
      // Never an internal id on screen.
      await expect(page.getByText(URGENT.id)).toHaveCount(0);
      await expect(page.getByText(URGENT.client.id)).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test(`Batafsil ${t} ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
      await theme(page, t);
      await openBatafsil(page);
      await page.locator(".opx-focus__more").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await snap(page, "batafsil", t, w);
      const extra = page.locator("#opx-focus-more");
      await expect(extra.locator('.opx-dk-chip[data-tone="hot"]')).toContainText("Muddat o'tdi");
      await expect(extra.getByText("Kutish vaqti")).toBeVisible();
      await expect(extra.getByText("navbatda", { exact: true })).toHaveCount(0);
      await expect(extra.locator(".opx-dk-code")).toContainText("#69E71328");
      await expect(page.locator(".opx-dk-tl__dot").first().locator("svg")).toHaveCount(1);
      await expect(page.getByText("69e71328-aaaa", { exact: false })).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
}

const OP_URGENT = {
  ...URGENT,
  id: "7a1b2c3d-0000-4000-8000-00000000abcd",
  work_id: "ADV-K7Q2M",
  can_manage: true,
  sla_breached: true,
  client_phone_visible: true,
  client: { id: "c0ffee00-0000-4000-8000-000000000002", name: "Malika Rahimova", phone: "+998901234567" },
  claimed_by: { id: "u-cc", name: "Test Operator" },
  assigned_lawyer: { id: "u-l2", name: "Fuqarolik Yurist", phone: "+998901004002" },
  lifecycle: { next_statuses: ["meeting_active", "completed", "cancelled"] },
};

test("operator detail «Batafsil»: status, people and the icon timeline", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await theme(page, "dark");
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/urgent-advokat/requests": { items: [OP_URGENT] },
    [`/call-center/urgent-advokat/requests/${OP_URGENT.id}`]: OP_URGENT,
    "/call-center/queue": { items: [] },
    "/call-center/calls": { items: [] },
  });
  await mockBackend(page, routes);
  await page.goto(`/uz/admin/call-center?view=urgent&id=${OP_URGENT.id}`);
  const more = page.locator(".opx-ug-morebtn");
  await expect(more).toBeVisible();
  await more.click();
  const box = page.locator(".opx-ug-more");
  await expect(box).toBeVisible();
  await expect(box.locator('.opx-dk-chip[data-tone="hot"]').first()).toBeVisible();
  await expect(box.locator(".opx-dk-people li")).toHaveCount(3);
  await expect(box.locator(".opx-dk-tl__dot svg")).toHaveCount(3);
  await expect(page.getByText(OP_URGENT.id)).toHaveCount(0);
  await page.waitForTimeout(500);
  await box.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await snap(page, "operator-batafsil", "dark", 1440);
});

test("CRM lead «Batafsil»: facts with icons, the operator as a person", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await theme(page, "light");
  const { routes } = crmServer((OPERATOR.permissions ?? []).filter((p) => p !== "callcenter.access"));
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/call-center?view=crm&s=leads&lead=m1");
  const btn = page.locator(".opx-cd-needcard .opx-jr-toggle");
  await expect(btn).toBeVisible();
  await btn.click();
  const box = page.locator(".opx-cd-needmore");
  await expect(box).toBeVisible();
  await expect(box.locator(".opx-dk-facts__ic svg").first()).toBeVisible();
  await expect(box.locator(".opx-dk-people li")).toHaveCount(1);
  await page.waitForTimeout(500);
  await box.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await snap(page, "crm-batafsil", "light", 1440);
});

test("lawyer cabinet «Tafsilotlar»: the same detail outside the call-center", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const lawyer: Who = { id: "u-duty", name: "Lola Navbatchi", phone: "+998901004001", role: "lawyer", backendRole: "yurist" };
  const routes = await signIn(page, lawyer, {
    "/urgent-advokat/requests/assigned": { items: [URGENT] },
    [`/urgent-advokat/requests/${URGENT.id}`]: URGENT,
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/lawyer/urgent");
  const btn = page.getByRole("button", { name: "Tafsilotlar" }).first();
  await expect(btn).toBeVisible();
  await btn.click();
  const box = page.locator(`#uasg-${URGENT.id}`);
  await expect(box.locator(".opx-dk-hero")).toBeVisible();
  await expect(box.locator(".opx-dk-tl__dot svg")).toHaveCount(3);
  await page.waitForTimeout(500);
  await box.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await snap(page, "portal-tafsilotlar", "light", 1440);
});
