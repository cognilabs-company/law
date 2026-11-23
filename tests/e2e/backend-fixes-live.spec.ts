import { expect, test, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn, type Routes } from "./mock";
import { ADVOCATE_S } from "./design1920/shots";
import { mocksFor, URGENT_CATALOG } from "./design1920/data";

// BACKEND_FIXES_LIVE_2026-11-23 (backend b4646ab), against a mocked backend:
// the client's open SOS and its cancel, the seller's "taking new orders"
// switch, the two-step password reset, the client's own urgent cancel route,
// the unanswered express call, and the onboarding review state.
test.use({ locale: "uz-UZ", colorScheme: "light", viewport: { width: 1366, height: 900 } });

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const ahead = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

async function quiet(page: Page) {
  await page.addInitScript(() => {
    for (const id of ["u-client", "u-adv"]) localStorage.setItem(`lexgo_onboarding_v1:${id}`, "1");
  });
}

test("SOS: an open request is shown and the client can cancel it", async ({ page }) => {
  await quiet(page);
  let status = "assigned";
  const sos = () => ({ id: "sos-1", status, category: "police", operator: { name: "Aziza Karimova" }, chat_room_id: null, created_at: ago(6) });
  const patches: unknown[] = [];
  const mock = await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/sos/me": () => ({ items: [sos(), { id: "sos-0", status: "resolved", category: "court", created_at: ago(3000) }], total: 2, limit: 5, offset: 0, has_more: false }),
      "/sos/sos-1": () => sos(),
      "PATCH /sos/sos-1": (b: unknown) => {
        patches.push(b);
        status = "cancelled";
        return sos();
      },
    }),
  );
  await page.goto("/uz/portal/client/sos");
  const card = page.locator(".sosi-open");
  await expect(card).toContainText("Sizda ochiq SOS so'rovi bor");
  await expect(card).toContainText("Mutaxassis biriktirildi");
  await expect(card).toContainText("Politsiya chaqirdi");
  await expect(card).toContainText("Aziza Karimova");
  // The form is not offered while one is open.
  await expect(page.locator(".sosi-form")).toHaveCount(0);

  await card.getByRole("button", { name: "So'rovni bekor qilish" }).click();
  await card.getByRole("button", { name: "Ha, bekor qilinsin" }).click();
  await expect.poll(() => patches).toEqual([{ status: "cancelled" }]);
  await expect(page.locator(".sosi-form")).toBeVisible();
  expect(mock.refused).toEqual([]);
});

test("SOS: a finished request does not block the form", async ({ page }) => {
  await quiet(page);
  await mockBackend(page, await signIn(page, CLIENT, { "/sos/me": { items: [{ id: "sos-0", status: "resolved", category: "court", created_at: ago(3000) }], total: 1 } }));
  await page.goto("/uz/portal/client/sos");
  await expect(page.locator(".sosi-form")).toBeVisible();
  await expect(page.locator(".sosi-open")).toHaveCount(0);
});

test("advocate dashboard: pausing new orders saves and re-reads the cabinet", async ({ page }) => {
  await quiet(page);
  let accepting = true;
  const base = mocksFor("advocate");
  const cab = base["/lawyers/me/cabinet"] as Record<string, unknown>;
  const puts: unknown[] = [];
  const mock = await mockBackend(
    page,
    await signIn(page, ADVOCATE_S, {
      ...base,
      "/lawyers/me/cabinet": () => ({ ...cab, accepting_orders: accepting, available_actions: { accept_orders: accepting, secure_chat: true, calls: true } }),
      "PUT /lawyers/me/accepting-orders": (b: unknown) => {
        puts.push(b);
        accepting = (b as { enabled: boolean }).enabled;
        return { enabled: accepting };
      },
    }),
  );
  await page.goto("/uz/portal/advocate");
  const bar = page.locator(".lxs-accept");
  const sw = bar.getByRole("switch", { name: "Buyurtma qabul qilish" });
  await expect(bar).toContainText("Yangi buyurtmalarni qabul qilyapsiz");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  const before = mock.count("GET", /^\/lawyers\/me\/cabinet$/);

  await sw.click();
  await expect.poll(() => puts).toEqual([{ enabled: false }]);
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(bar).toContainText("Yangi buyurtmalar to'xtatilgan");
  await expect.poll(() => mock.count("GET", /^\/lawyers\/me\/cabinet$/)).toBeGreaterThan(before);
  // accept_orders is false now: the new-orders figure is no longer a link.
  await expect(page.locator(".lxs-kpis a.lxs-kpi--pri")).toHaveCount(0);
});

test("advocate dashboard: no switch when the cabinet does not report it", async ({ page }) => {
  await quiet(page);
  await mockBackend(page, await signIn(page, ADVOCATE_S, mocksFor("advocate")));
  await page.goto("/uz/portal/advocate");
  await expect(page.locator(".lxs-kpis")).toBeVisible();
  await expect(page.locator(".lxs-accept")).toHaveCount(0);
});

test("password reset: the code is checked first, then the password is set with the token", async ({ page }) => {
  let tries = 0;
  const resets: unknown[] = [];
  await mockBackend(page, {
    "POST /auth/password/forgot": { verification_id: "ver-1", expires_at: ahead(5) },
    "POST /auth/password/verify": (b: unknown) => {
      tries++;
      return (b as { code: string }).code === "123456" ? { valid: true, reset_token: "rt-1", expires_at: ahead(10) } : { status: 400, json: { detail: { code: "otp_invalid", message: "Kod noto'g'ri" } } };
    },
    "POST /auth/password/reset": (b: unknown) => {
      resets.push(b);
      return { ok: true };
    },
  });
  await page.goto("/uz/reset-password");
  await page.waitForTimeout(1500);
  await page.locator("#r-phone").pressSequentially("901234567");
  await page.getByRole("button", { name: "Kod olish" }).click();
  await expect(page.locator("#r-code")).toBeVisible();
  // No password field until the code is confirmed.
  await expect(page.locator("#r-pw")).toHaveCount(0);

  await page.locator("#r-code").fill("111111");
  await page.getByRole("button", { name: "Kodni tasdiqlash" }).click();
  await expect.poll(() => tries).toBe(1);
  await expect(page.locator("#r-pw")).toHaveCount(0);

  await page.locator("#r-code").fill("123456");
  await page.getByRole("button", { name: "Kodni tasdiqlash" }).click();
  await expect(page.locator("#r-pw")).toBeVisible();
  await page.locator("#r-pw").fill("yangiParol1");
  await page.getByRole("button", { name: "Parolni yangilash" }).click();
  await expect(page.getByRole("heading", { name: "Parol yangilandi" })).toBeVisible();
  expect(resets).toEqual([{ verification_id: "ver-1", reset_token: "rt-1", password: "yangiParol1" }]);
});

const urgentReq = (status = "open_pool") => ({
  id: "ur-1",
  work_id: "TA-1001",
  service_kind: "video_consultation",
  service_title: "Advokat bilan videokonsultatsiya",
  channel: "video",
  status,
  need: "Ijara shartnomasi bo'yicha maslahat",
  lifecycle: { next_statuses: ["claimed", "cancelled"] },
  created_at: ago(20),
  updated_at: ago(5),
});

function urgentRoutes(extra: Routes = {}): Routes {
  return { "/urgent-advokat/catalog": URGENT_CATALOG, "/urgent-advokat/requests/me": { items: [urgentReq()] }, ...extra };
}

test("Tezkor Advokat: the client cancels on the client route, never the call-center one", async ({ page }) => {
  await quiet(page);
  const bodies: unknown[] = [];
  const mock = await mockBackend(
    page,
    await signIn(page, CLIENT, urgentRoutes({
      "POST /urgent-advokat/requests/ur-1/cancel": (b: unknown) => {
        bodies.push(b);
        return { ...urgentReq("cancelled") };
      },
    })),
  );
  await page.goto("/uz/portal/client/urgent");
  await page.locator(".ua__row").first().click();
  await page.locator('[data-ai-id$="cancel"]').first().click();
  await page.locator('[data-ai-id$="cancel-confirm"]').click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(mock.count("POST", /^\/call-center\//)).toBe(0);
});

test("Tezkor Advokat: a request that can no longer be cancelled says why", async ({ page }) => {
  await quiet(page);
  await mockBackend(
    page,
    await signIn(page, CLIENT, urgentRoutes({
      "POST /urgent-advokat/requests/ur-1/cancel": { status: 409, json: { detail: { code: "urgent_request_not_cancellable", status: "completed" } } },
    })),
  );
  await page.goto("/uz/portal/client/urgent");
  await page.locator(".ua__row").first().click();
  await page.locator('[data-ai-id$="cancel"]').first().click();
  await page.locator('[data-ai-id$="cancel-confirm"]').click();
  await expect(page.getByText(/Bu so'rovni endi bekor qilib bo'lmaydi/).first()).toBeVisible();
});

test("Tezkor Advokat: an unanswered express call tells the client the request is back in the queue", async ({ page }) => {
  await quiet(page);
  const mock = await mockBackend(page, await signIn(page, CLIENT, urgentRoutes()));
  await page.goto("/uz/portal/client/urgent");
  await expect(page.locator(".ua__row").first()).toBeVisible();
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  await mock.push({
    event: "notification.created",
    notification: { id: "n-1", kind: "urgent_advokat.express_call_unanswered", title: "Advokat javob bermadi", data: { record_id: "ur-1" }, created_at: new Date().toISOString() },
  });
  await expect(page.getByText("So'rovingiz umumiy navbatga qaytdi", { exact: false }).first()).toBeVisible();
});

test("onboarding: an application already with the moderator is not offered for sending again", async ({ page }) => {
  await quiet(page);
  const base = mocksFor("advocate");
  const cab = base["/lawyers/me/cabinet"] as Record<string, unknown>;
  const steps = ["profile", "identity", "documents", "services", "pricing"].map((key) => ({ key, title: key, required: true, completed: true }));
  await mockBackend(
    page,
    await signIn(page, ADVOCATE_S, {
      ...base,
      "/lawyers/me/cabinet": { ...cab, limited_access: true, account_status: "pending", available_actions: { accept_orders: false, secure_chat: false, calls: false }, verification: { status: "pending", is_verified: false } },
      "/seller-onboarding/progress": { status: "submitted", completed_count: 5, total_count: 5, steps, review_status: "submitted", review_submission_id: "rs-1", verification_status: "pending" },
    }),
  );
  await page.goto("/uz/portal/advocate");
  await expect(page.locator(".onbp__review")).toContainText("Ariza tekshiruvda");
  await expect(page.locator(".onbp").getByRole("button", { name: "Tekshiruvga yuborish" })).toHaveCount(0);
});
