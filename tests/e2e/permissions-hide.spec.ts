import { expect, test, type Page } from "@playwright/test";
import { ADMIN, ADVOCATE, mockBackend, signIn, type Routes, type Who } from "./mock";
import { ROP, crmServer } from "./crmServer";
import studio from "./fixtures/studio-k31.json";

// Owner law 2026-11-08: an action the account has no permission for is not
// on the screen at all (not disabled, not locked). Each pair below opens the
// same screen twice — without the permission the action is not rendered,
// with it the action is there — across CRM, the call-center console, HRM,
// admin services, Studio and the seller portal. The last test is the 403
// safety net (lib/http.ts + lib/auth.tsx): a refused request re-reads
// /auth/me, the action whose permission went away leaves, and one notice says so.

const ACCESS_CHANGED = "Ruxsatlaringiz o‘zgardi — endi foydalana olmaydigan amallar yashirildi.";

// A staff account that is neither call-center nor admin: the console shows
// it only the tabs its permissions open (leads.manage admits the page).
const STAFF = (permissions: string[]): Who => ({ id: "u-staff", name: "Nodira Xodimova", phone: "+998900000021", role: "client", backendRole: "moderator", roles: ["moderator"], permissions });

test.describe("permission-gated actions are hidden, not disabled", () => {
  // ── CRM: "New customer" inside the new-lead sheet (crm.customers.manage) ──
  const CRM_BASE = ["crm.customers.view", "crm.leads.view", "crm.leads.manage", "crm.leads.claim"];
  async function openLeadPicker(page: Page, perms: string[]) {
    const { routes } = crmServer(perms);
    Object.assign(routes, {
      "/crm/customers/select": { items: [{ id: "s1", public_id: "CRM-1001", name: "Mijoz Bir", region: "Toshkent", primary_phone: "+998900000101", is_lexgo_user: false, lead_count: 1 }], total: 1, limit: 30, offset: 0, has_more: false },
    });
    await mockBackend(page, await signIn(page, { ...ROP, permissions: perms }, routes as never));
    await page.goto("/uz/admin/crm/leads");
    await page.getByRole("button", { name: "Yangi lid" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Yangi lid" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /Mijoz/ }).first().click();
    await expect(page.getByRole("listbox", { name: "Mijozni qidirish" }).getByRole("option")).toHaveCount(1);
    return sheet;
  }

  test("CRM new lead: no 'new customer' row without crm.customers.manage", async ({ page }) => {
    const sheet = await openLeadPicker(page, CRM_BASE);
    await expect(page.getByRole("button", { name: "Yangi mijoz qo'shish" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(sheet.getByText("Bu lid qaysi mijozga tegishli ekanini qidirib toping.")).toBeVisible();
  });

  test("CRM new lead: 'new customer' row with crm.customers.manage", async ({ page }) => {
    await openLeadPicker(page, [...CRM_BASE, "crm.customers.manage"]);
    await expect(page.getByRole("button", { name: "Yangi mijoz qo'shish" })).toBeVisible();
  });

  // ── Call-center console: Leads tab (crm.leads.view), empty-console state ──
  async function openConsole(page: Page, perms: string[]) {
    const { routes } = crmServer(["crm.leads.view", "crm.customers.view"]);
    await mockBackend(page, await signIn(page, STAFF(perms), routes as never));
    await page.goto("/uz/admin/call-center");
  }

  test("console: an account with no console section sees one calm message, no tabs", async ({ page }) => {
    await openConsole(page, ["leads.manage"]);
    await expect(page.getByText("Bu yerda siz uchun bo‘lim yo‘q")).toBeVisible();
    await expect(page.locator(".ccon").getByRole("tab")).toHaveCount(0);
    await expect(page.locator(".ccon__search")).toHaveCount(0);
  });

  test("console: Leads tab only with crm.leads.view", async ({ page }) => {
    await openConsole(page, ["leads.manage", "users.manage"]);
    const tabs = page.locator(".ccon").getByRole("tab");
    await expect(tabs.filter({ hasText: "Mijozlar va qo'ng'iroqlar" })).toBeVisible();
    await expect(tabs.filter({ hasText: "Lidlar" })).toHaveCount(0);
  });

  test("console: Leads tab shown with crm.leads.view", async ({ page }) => {
    await openConsole(page, ["leads.manage", "crm.leads.view"]);
    const tabs = page.locator(".ccon").getByRole("tab");
    await expect(tabs.filter({ hasText: "Lidlar" })).toBeVisible();
    // No lookup right: no Clients tab and no console search that opens it.
    await expect(tabs.filter({ hasText: "Mijozlar va qo'ng'iroqlar" })).toHaveCount(0);
    await expect(page.locator(".ccon__search")).toHaveCount(0);
    await expect(page.getByText("Bu yerda siz uchun bo‘lim yo‘q")).toHaveCount(0);
  });

  // ── HRM: "Add employee" on the org page (internal_hr.manage) ──
  const ORG_BOARD = {
    roots: [
      {
        id: "unit:u1",
        entity_id: "u1",
        type: "department",
        name: "Yuridik bo'lim",
        code: "YUR",
        people: [{ id: "employee:e1", entity_id: "e1", type: "employee", name: "Aziz Rahimov", position_name: "Yurist" }],
        children: [{ id: "unit:u2", entity_id: "u2", type: "department", name: "Shartnomalar guruhi", code: "SHG", people: [], children: [] }],
      },
    ],
  };
  async function openOrgList(page: Page, perms: string[]) {
    const who: Who = { id: "u-emp", name: "Laylo HR", phone: "+998900000031", role: "client", backendRole: "employee", roles: ["employee"], permissions: perms };
    await mockBackend(page, await signIn(page, who, { "/internal/org/board": ORG_BOARD, "/internal/org/positions": { items: [], total: 0 } }));
    await page.goto("/uz/internal/org");
    await page.getByRole("tab", { name: "Ro'yxat" }).click();
    await page.locator(".org-list tr", { hasText: "Yuridik bo'lim" }).click();
    await expect(page.locator(".org__aside").getByRole("button", { name: "Ichki bo'lim" })).toBeVisible();
  }

  test("HRM org: no 'add employee' without internal_hr.manage", async ({ page }) => {
    await openOrgList(page, ["internal_org.manage"]);
    await expect(page.locator(".org__aside").getByRole("button", { name: "Xodim qo'shish" })).toHaveCount(0);
  });

  test("HRM org: 'add employee' with internal_hr.manage", async ({ page }) => {
    await openOrgList(page, ["internal_org.manage", "internal_hr.manage"]);
    await expect(page.locator(".org__aside").getByRole("button", { name: "Xodim qo'shish" })).toBeVisible();
  });

  // ── Admin services: manage actions (services.manage) ──
  const SERVICES = [
    { id: "s1", title: "Mehnat nizosi bo'yicha maslahat", slug: "mehnat-nizosi", category_title: "Mehnat", base_price: 200000, is_active: true },
    { id: "s2", title: "Ijara shartnomasi tekshiruvi", slug: "ijara", category_title: "Shartnomalar", base_price: 150000, is_active: true },
  ];
  test("admin services: manage actions with services.manage; gone once a write is refused (403)", async ({ page }) => {
    const who: Who = { id: "u-svc", name: "Kamola Katalog", phone: "+998900000041", role: "client", backendRole: "moderator", roles: ["moderator"], permissions: ["services.manage"] };
    await mockBackend(page, await signIn(page, who, { "/admin/services": SERVICES, "DELETE /admin/services/s1": { status: 403, json: { detail: "Forbidden" } } }));
    await page.goto("/uz/admin/services");
    const list = page.locator(".svcadm");
    await expect(list.getByText("Mehnat nizosi bo'yicha maslahat")).toBeVisible();
    await expect(page.locator('[data-ai-target="button:new-service"]')).toBeVisible();
    await expect(list.locator(".aitem__act")).not.toHaveCount(0);
    await list.getByRole("button", { name: "O'chirish" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "O'chirish" }).click();
    await expect(page.locator('[data-ai-target="button:new-service"]')).toHaveCount(0);
    await expect(list.locator(".aitem__act")).toHaveCount(0);
    await expect(list.getByText("Mehnat nizosi bo'yicha maslahat")).toBeVisible();
  });

  // ── Studio: Excel export (studio admin only; 403 takes it away) ──
  const studioRoutes = (userRoles: string[], extra: Routes = {}): Routes => ({
    "/studio/constructors": { ...studio.constructors, user_roles: userRoles },
    "/studio/objects/summary": { by_status: { published: 3 }, by_constructor: { K02: 3 }, by_constructor_detail: [], entity_cards: [] },
    "/studio/journeys": { items: [] },
    ...extra,
  });

  test("Studio home: an editor gets no Excel export", async ({ page }) => {
    const editor: Who = { id: "u-ed", name: "Bekzod Muharrir", phone: "+998900000051", role: "client", backendRole: "studio_editor", roles: ["studio_editor"], permissions: [] };
    await mockBackend(page, await signIn(page, editor, studioRoutes(["studio_editor"])));
    await page.goto("/ru/admin/studio");
    // The editor's own head action is there, so the head did render.
    await expect(page.locator('a[href$="/admin/studio/create"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Скачать данные Studio в Excel" })).toHaveCount(0);
  });

  test("Studio home: the admin has Excel export; a 403 takes it off the screen", async ({ page }) => {
    await mockBackend(page, await signIn(page, ADMIN, studioRoutes(["superadmin"], { "/admin/studio/export.xlsx": { status: 403, json: { detail: "Forbidden" } } })));
    await page.goto("/ru/admin/studio");
    const excel = page.getByRole("button", { name: "Скачать данные Studio в Excel" });
    await expect(excel).toBeVisible();
    await excel.click();
    await expect(excel).toHaveCount(0);
  });

  // ── Seller portal: "New orders" (cabinet available_actions.accept_orders) ──
  const cabinet = (acceptOrders: boolean) => ({
    account_status: "active",
    role: "advokat",
    seller_type: "advokat",
    limited_access: false,
    available_actions: { accept_orders: acceptOrders, secure_chat: true, calls: true },
    verification: { status: "verified", is_verified: true },
    profile: { user_id: ADVOCATE.id, name: ADVOCATE.name, seller_type: "advokat", is_verified: true },
    stats: {},
    new_orders: [],
  });
  const ordersLink = (page: Page) => page.locator(".psb__nav").locator('a[href$="/portal/advocate/opportunities"]');

  test("advocate portal: no 'New orders' row while the cabinet can't accept orders", async ({ page }) => {
    await mockBackend(page, await signIn(page, ADVOCATE, { "/lawyers/me/cabinet": cabinet(false) }));
    await page.goto("/uz/portal/advocate");
    await expect(page.locator(".psb__nav").locator('a[href$="/portal/advocate/profile"]')).toBeVisible();
    await expect(ordersLink(page)).toHaveCount(0);
  });

  test("advocate portal: 'New orders' row when the cabinet accepts orders", async ({ page }) => {
    await mockBackend(page, await signIn(page, ADVOCATE, { "/lawyers/me/cabinet": cabinet(true) }));
    await page.goto("/uz/portal/advocate");
    await expect(ordersLink(page)).toBeVisible();
  });

  // ── The 403 safety net ──
  test("403 safety net: a refused request re-reads /auth/me, the revoked action leaves, one notice", async ({ page }) => {
    const full = ["leads.manage", "crm.leads.view", "users.manage"];
    const reduced = ["leads.manage", "users.manage"];
    let revoked = false;
    const { routes } = crmServer(["crm.leads.view", "crm.customers.view"]);
    const who = STAFF(full);
    const all = await signIn(page, who, {
      ...(routes as Routes),
      "/call-center/clients/search": () => {
        revoked = true;
        return { status: 403, json: { detail: "Forbidden" } };
      },
    });
    all["/auth/me"] = () => ({ id: who.id, name: who.name, phone: who.phone, role: who.backendRole, roles: who.roles, permissions: revoked ? reduced : full, is_primary_superadmin: false, can_set_superadvokat: false });
    const mock = await mockBackend(page, all);
    await page.goto("/uz/admin/call-center");
    const tabs = page.locator(".ccon").getByRole("tab");
    await expect(tabs.filter({ hasText: "Lidlar" })).toBeVisible();
    const before = mock.count("GET", /^\/auth\/me$/);

    // The console search runs the client lookup; the backend now refuses it.
    const search = page.locator(".ccon__search input");
    await search.fill("Dilnoza");
    await search.press("Enter");
    await expect.poll(() => mock.count("GET", /^\/auth\/me$/)).toBeGreaterThan(before);
    await expect(tabs.filter({ hasText: "Lidlar" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: ACCESS_CHANGED })).toHaveCount(1);
    // The Clients tab stays: users.manage was not taken away.
    await expect(tabs.filter({ hasText: "Mijozlar va qo'ng'iroqlar" })).toBeVisible();

    // Another refusal right after does not repeat the notice.
    await search.fill("Aziz");
    await search.press("Enter");
    await page.waitForTimeout(800);
    await expect(page.getByRole("group", { name: ACCESS_CHANGED })).toHaveCount(1);
  });
});
