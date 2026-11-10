import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// «Bildirishnoma yuborish» (send notification) composer, against mocked
// data: a duty operator picks a person by name, an admin broadcasts to a
// whole role, and a send ends in the per-recipient result panel. People are
// named (never ids), and nothing overflows sideways. SHOTS=before|after also
// saves light/dark screenshots at 1440 and 390 px into
// /tmp/lexgo-notif-redesign/shots for the owner's review.

const SHOTS = process.env.SHOTS ?? "";
const DIR = "/tmp/lexgo-notif-redesign/shots";
if (SHOTS) mkdirSync(DIR, { recursive: true });

const DUTY = { id: "u-duty", name: "Duty Yurist", phone: "+998901004001", role: "client" as const, backendRole: "call_center_lawyer", roles: ["call_center_lawyer"], permissions: ["notifications.manage", "callcenter.access"] };
const SARDOR = { id: "u-77", name: "Sardor Misolov", phone: "+998901234567", role: "advokat", lexgo_id: "LGA-77" };
const PEOPLE = [
  SARDOR,
  { id: "u-78", name: "Sardorbek Aliyev", phone: "+998935550011", role: "client", lexgo_id: "LGC-78" },
  { id: "u-79", name: "Sardora Karimova", phone: "+998977001122", role: "yurist", lexgo_id: "LGY-79" },
];
const SENT = { id: "n-1", deliveries: [{ channel: "in_app", status: "delivered" }, { channel: "push", status: "sent" }, { channel: "telegram", status: "queued" }] };
const OPERATOR_ROUTES = {
  "/users/search": { items: PEOPLE },
  "POST /admin/notifications": SENT,
  "/urgent-advokat/requests/assigned": { items: [] },
};
const ADMIN_ROUTES = {
  "/admin/users": { items: PEOPLE },
  "/users/search": { items: PEOPLE },
  "POST /admin/notifications": SENT,
};

async function theme(page: Page, t: "dark" | "light") {
  await page.addInitScript((th) => {
    localStorage.setItem("lexgo_theme", th);
    localStorage.setItem("lexgo_ccx_prefs", JSON.stringify({ theme: th, bg: "night", motion: true, keys: true }));
  }, t);
}

// Back to the top of the page (the hero and step ①), focus released.
async function toTop(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.querySelectorAll(".pbody, .opx-stage").forEach((el) => el.scrollTo({ top: 0 }));
  });
}

async function snap(page: Page, view: string, t: string, w: number) {
  if (!SHOTS) return;
  await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,.ntf,[data-sonner-toaster],nextjs-portal,.cpl-launch,.fab{display:none!important}" }).catch(() => undefined);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${SHOTS}-${view}-${w}-${t}.png` });
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function fill(page: Page) {
  await page.getByRole("textbox", { name: "Nomi", exact: true }).fill("Uchrashuv vaqti o'zgardi");
  await page.getByRole("textbox", { name: "Xabar", exact: true }).fill("Ertangi uchrashuv soat 15:00 ga ko'chirildi. Iltimos, vaqtida qatnashing.");
}

for (const w of [1440, 390]) {
  for (const t of ["dark", "light"] as const) {
    test(`operator picks a person and writes a message — ${w}px ${t}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
      await theme(page, t);
      const routes = await signIn(page, DUTY, OPERATOR_ROUTES);
      const mock = await mockBackend(page, routes);
      await page.goto("/uz/admin/notifications");
      await expect(page.getByText("Bildirishnoma yuborish").first()).toBeVisible();
      await expect(page.getByRole("tab", { name: "Butun rolga" })).toHaveCount(0);
      await page.getByPlaceholder("Ism, telefon yoki LexGo ID bo'yicha qidiring").fill("Sardor");
      await page.getByRole("button", { name: /Sardor Misolov/ }).first().click();
      await expect(page.locator("button.nrcp__row", { hasText: "Sardor Misolov" })).toHaveAttribute("aria-pressed", "true");
      await fill(page);
      // Roles read as words, never backend codes; nobody is shown by id.
      await expect(page.getByText(/\bu-77\b/)).toHaveCount(0);
      await expect(page.getByText(/^advokat$/)).toHaveCount(0);
      await noOverflow(page);
      if (SHOTS !== "before") {
        await expect(page.locator("select, input[type=checkbox]:not([class])")).toHaveCount(0);
        // The live preview carries what was typed.
        await expect(page.locator(".nprev").getByText("Uchrashuv vaqti o'zgardi").first()).toBeAttached();
      }
      await toTop(page);
      await snap(page, "operator", t, w);

      // Send → the designed result panel, one row per person.
      await page.getByRole("button", { name: "Yuborish" }).last().click();
      await expect(page.getByText("Natijalar").first()).toBeVisible();
      expect(mock.count("POST", /^\/admin\/notifications$/)).toBe(1);
      const sent = mock.calls.find((c) => c.method === "POST" && c.path === "/admin/notifications")?.body as Record<string, unknown>;
      expect(sent.user_id).toBe("u-77");
      expect(sent.title).toBe("Uchrashuv vaqti o'zgardi");
      if (SHOTS !== "before") {
        await expect(page.locator(".nres").getByText("Sardor Misolov")).toBeVisible();
        await page.locator(".nres").scrollIntoViewIfNeeded();
      } else {
        await page.getByText("Natijalar").first().scrollIntoViewIfNeeded();
      }
      await noOverflow(page);
      await snap(page, "result", t, w);
    });

    test(`admin broadcasts to a whole role — ${w}px ${t}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
      await theme(page, t);
      const routes = await signIn(page, ADMIN, ADMIN_ROUTES);
      const mock = await mockBackend(page, routes);
      await page.goto("/uz/admin/notifications");
      await page.getByRole("tab", { name: "Butun rolga" }).click();
      if (SHOTS !== "before") await page.getByRole("radio", { name: /Advokatlar/ }).click();
      await fill(page);
      await noOverflow(page);
      await toTop(page);
      await snap(page, "broadcast", t, w);
      if (SHOTS !== "before") {
        await page.getByRole("button", { name: "Yuborish" }).last().click();
        await page.getByRole("button", { name: "Hammasiga yuborish" }).click();
        await expect(page.locator(".nres")).toBeVisible();
        const sent = mock.calls.find((c) => c.method === "POST" && c.path === "/admin/notifications")?.body as Record<string, unknown>;
        expect(sent.audience_role).toBe("advokat");
        expect(sent.user_id).toBeUndefined();
      }
    });
  }
}

test("tablet: one column, preview folds, the send bar stays reachable", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1100 });
  const routes = await signIn(page, ADMIN, ADMIN_ROUTES);
  await mockBackend(page, routes);
  await page.goto("/uz/admin/notifications");
  await expect(page.getByText("Bildirishnoma yuborish").first()).toBeVisible();
  await noOverflow(page);
  const dock = page.locator(".ncmp__dock");
  await expect(dock).toBeVisible();
  await expect(dock.getByRole("button", { name: "Yuborish" })).toBeVisible();
  // The preview opens on demand and shows the example text while empty.
  const tog = page.getByRole("button", { name: "Ko'rinishini ochish" });
  await tog.click();
  await expect(page.locator(".nprev").getByText("Uchrashuv vaqti o'zgardi")).toBeVisible();
  await page.getByRole("textbox", { name: "Nomi", exact: true }).fill("Sud majlisi");
  await expect(page.locator(".nprev").getByText("Sud majlisi")).toBeVisible();
  // Category and channel are drawn choices, not native controls.
  await page.getByRole("radio", { name: /To'lovlar/ }).click();
  await expect(page.getByRole("radio", { name: /To'lovlar/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: /Telegram/ }).click();
  await expect(page.locator(".nprev__chs")).toContainText("Telegram");
  await expect(page.locator("select")).toHaveCount(0);
});
