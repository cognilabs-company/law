import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADMIN, CALL_CENTER, mockBackend, signIn, type Who } from "./mock";

// The CRM and the operator AI copilot (contract 2026-10-26, /crm/*) against
// a mocked backend shaped like production: meta-driven UI, the queue claim
// and its 409 race, lock versions and their 409, AI apply of the ticked
// paths only, no revenue for operators, merge behind its permission, export
// as a background job — and no missing translation on any screen.

const look = { colorScheme: process.env.CRM_DARK ? ("dark" as const) : ("light" as const), ...(process.env.CRM_NARROW ? { viewport: { width: 420, height: 900 } } : { viewport: { width: 1440, height: 960 } }) };
test.use(look);
test.describe.configure({ timeout: 120_000 });
const shot = async (page: Page, name: string) => {
  if (!process.env.CRM_SHOTS) return;
  await page.waitForTimeout(600);
  // On a phone nothing in the CRM may stick out past the screen.
  if (process.env.CRM_NARROW) {
    const wide = await page.evaluate(() => {
      const root = document.querySelector(".crm")?.getBoundingClientRect();
      return root ? [...document.querySelectorAll(".crm > *")].filter((el) => el.getBoundingClientRect().right > root.right + 1).map((el) => el.className) : [];
    });
    expect(wide).toEqual([]);
  }
  const suffix = `${process.env.CRM_DARK ? "dark" : "light"}${process.env.CRM_NARROW ? "-phone" : ""}`;
  await page.screenshot({ path: `${process.env.CRM_SHOTS}/crm-${name}-${suffix}.png`, fullPage: false });
};
// On a phone the workspace is three tabs; on desktop all columns show.
const wsTab = async (page: Page, name: RegExp) => {
  if (process.env.CRM_NARROW) await page.locator(".crm-ws__tabs").getByRole("tab", { name }).click();
};
// next-intl reports a missing key as a console error; none may appear.
const watchIntl = (page: Page) => {
  const missing: string[] = [];
  page.on("console", (m) => {
    if (/MISSING_MESSAGE|INVALID_KEY|FORMATTING_ERROR/.test(m.text())) missing.push(m.text().slice(0, 200));
  });
  return missing;
};

const OPERATOR: Who = { ...CALL_CENTER, permissions: ["callcenter.access", "crm.leads.view", "crm.leads.claim", "crm.leads.manage", "crm.customers.view", "crm.ai.use", "crm.analytics.self", "crm.exports.create"] };
const STATUSES = ["new", "contacted", "qualified", "proposal", "payment_pending", "won", "closed"];
const TRANSITIONS: Record<string, string[]> = { new: ["closed", "contacted"], contacted: ["closed", "proposal", "qualified"], qualified: ["closed", "payment_pending", "proposal", "won"], proposal: ["closed", "payment_pending", "qualified", "won"], payment_pending: ["closed", "proposal", "won"], won: ["closed"], closed: ["new"] };
const meta = (perms: string[], revenue = false) => ({
  statuses: STATUSES.map((key) => ({ key, transitions: TRANSITIONS[key] })),
  scores: ["cold", "warm", "hot"],
  languages: ["uz_latn", "uz_cyrl", "ru"],
  contact_types: ["phone", "telegram", "email"],
  sources: ["manual", "web", "telegram", "phone"],
  permissions: perms,
  scope: perms.includes("crm.analytics.global") ? "all" : "own_and_queue",
  revenue_visible: revenue,
  telephony: { provider: "disabled", enabled: false, recording_consent_required: true, live_transcription: "provider_pending" },
});
const CUSTOMER = { id: "c1", public_id: "CRM-3CD76084", user_id: null, name: "Dilnoza Karimova", preferred_language: "uz_latn", region: "Toshkent", primary_phone: "+998901234567", primary_telegram: "@dilnoza", primary_email: "" };
const soon = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const lead = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  work_id: `LEAD-${id.toUpperCase()}`,
  customer_id: "c1",
  customer: CUSTOMER,
  client_user_id: null,
  source: "phone",
  title: "Ijara shartnomasi tekshiruvi",
  problem: "Ijara shartnomasini imzolashdan oldin tekshirib bermoqchiman.",
  category: "contracts",
  region: "Toshkent",
  urgency: "normal",
  score: "warm",
  status: "new",
  preferred_language: "uz_latn",
  assigned_operator_user_id: null,
  assigned_operator: null,
  next_action_at: null,
  claimed_at: null,
  duplicate_status: "clear",
  duplicate_of_lead_id: null,
  converted_service_id: null,
  converted_order_id: null,
  lost_reason: "",
  details: {},
  watchers: [],
  allowed_actions: ["view_timeline", "add_activity", "run_ai", "claim", "edit", "change_status", "set_next_action"],
  lock_version: 1,
  created_at: "2026-10-26T08:00:00Z",
  updated_at: "2026-10-26T08:00:00Z",
  closed_at: null,
  ...extra,
});
const ME = { id: OPERATOR.id, name: OPERATOR.name, lexgo_id: "LGCC-1", role: "call_center" };

function crmServer(perms: string[], revenue = false) {
  const st = {
    queue: [lead("q1", { urgency: "urgent", score: "hot" }), lead("q2", { title: "Aliment undirish", score: "cold" }), lead("q3", { title: "Mehnat nizosi" })],
    mine: [
      lead("m1", { status: "contacted", assigned_operator_user_id: ME.id, assigned_operator: ME, next_action_at: soon(-180), allowed_actions: ["view_timeline", "add_activity", "run_ai", "edit", "change_status", "set_next_action", "manage_watchers", "transfer", "prepare_conversion"], lock_version: 4, duplicate_status: "needs_review" }),
      lead("m2", { status: "qualified", title: "Meros ulushi", assigned_operator_user_id: ME.id, assigned_operator: ME, next_action_at: soon(25) }),
    ],
    claims: [] as string[],
    writes: [] as { path: string; body: Record<string, unknown> }[],
    activities: [
      { id: "a2", activity_type: "call_note", title: "Qo'ng'iroq", body: "Mijoz ertaga hujjatlarni yuboradi.", actor: ME, actor_user_id: ME.id, payload: { duration_sec: 240 }, created_at: "2026-10-26T09:30:00Z", visibility: "staff" },
      { id: "a1", activity_type: "system", title: "Lid yaratildi", body: "", actor: null, actor_user_id: null, payload: { source: "phone" }, created_at: "2026-10-26T08:00:00Z", visibility: "staff" },
    ] as Record<string, unknown>[],
    run: null as null | Record<string, unknown>,
    polls: 0,
    applied: null as null | Record<string, unknown>,
    conflictOnce: true,
    exportPolls: 0,
    boardCalls: 0,
  };
  const page = (all: Record<string, unknown>[], url: URL) => {
    const want = url.searchParams.get("status");
    if (want && url.searchParams.get("limit") === "30") st.boardCalls++;
    const items = want ? all.filter((l) => l.status === want) : all;
    return { items, total: items.length, limit: Number(url.searchParams.get("limit") ?? 50), offset: 0, counts: { new: 3, contacted: 5, qualified: 3, proposal: 2, payment_pending: 1, won: 2, closed: 1 } };
  };
  const routes: Record<string, unknown> = {
    "/crm/meta": meta(perms, revenue),
    "/crm/leads": (_: unknown, url: URL) => (url.searchParams.get("queue_only") ? page(st.queue, url) : url.searchParams.get("mine_only") ? page(st.mine, url) : page([...st.mine, ...st.queue], url)),
    "/crm/leads/m1": () => st.mine[0],
    "/crm/leads/q1": () => st.queue.find((l) => l.id === "q1") ?? st.mine.find((l) => l.id === "q1"),
    "POST /crm/leads/q[0-9]/claim": (_: unknown, url: URL) => {
      const id = url.pathname.split("/").at(-2) ?? "";
      st.claims.push(id);
      if (id === "q2") return { status: 409, json: { detail: { code: "crm_lead_already_claimed", message: "already claimed" } } };
      const l = st.queue.find((x) => x.id === id);
      st.queue = st.queue.filter((x) => x.id !== id);
      const owned = { ...l, assigned_operator_user_id: ME.id, assigned_operator: ME, claimed_at: new Date().toISOString(), allowed_actions: ["view_timeline", "add_activity", "run_ai", "edit", "change_status"] };
      st.mine = [owned, ...st.mine];
      return owned;
    },
    "POST /crm/leads/m1/status": (b: Record<string, unknown>) => {
      st.writes.push({ path: "status", body: b });
      if (st.conflictOnce) {
        st.conflictOnce = false;
        st.mine[0] = { ...st.mine[0], lock_version: 5, updated_at: new Date().toISOString() };
        return { status: 409, json: { detail: { code: "crm_lead_version_conflict", message: "changed" } } };
      }
      // A stale lock is refused, as the backend does.
      if (b.expected_lock_version !== st.mine[0].lock_version) return { status: 409, json: { detail: { code: "crm_lead_version_conflict", message: "changed" } } };
      st.mine[0] = { ...st.mine[0], status: String(b.status), lock_version: Number(b.expected_lock_version) + 1 };
      return st.mine[0];
    },
    "POST /crm/leads/m1/transfer": (b: Record<string, unknown>) => (st.writes.push({ path: "transfer", body: b }), st.mine[0]),
    "/crm/leads/m1/timeline": () => st.activities,
    "POST /crm/leads/m1/activities": (b: Record<string, unknown>) => {
      const a = { id: `a${st.activities.length + 1}`, activity_type: b.activity_type, title: b.title, body: b.body, actor: ME, actor_user_id: ME.id, payload: {}, created_at: new Date().toISOString(), visibility: "staff" };
      st.activities = [a, ...st.activities];
      return a;
    },
    "/crm/leads/m1/ai/runs": () => (st.run ? [st.run] : []),
    "POST /crm/leads/m1/ai/runs": (b: Record<string, unknown>) => {
      st.run = { id: "run-1", lead_id: "m1", operator_user_id: ME.id, run_type: b.run_type, language: b.language, instruction: b.instruction, status: "queued", model: "gpt", output: {}, tools: [], error: "", started_at: null, completed_at: null, created_at: new Date().toISOString() };
      return { status: 202, json: st.run };
    },
    "/crm/ai/runs/run-1": () => {
      st.polls += 1;
      if (st.run && st.polls >= 2)
        st.run = {
          ...st.run,
          status: "completed",
          completed_at: new Date().toISOString(),
          output: {
            summary: "Mijoz ijara shartnomasini imzolashdan oldin tekshiruv so'ramoqda; muddat — ertaga.",
            category: "contracts",
            urgency: "high",
            confidence: 0.82,
            risk_flags: ["Muddat qisqa", "Kafil shartlari noaniq"],
            missing_information: ["Shartnoma nusxasi", "Ijara muddati"],
            questions: ["Shartnoma kim tomonidan tuzilgan?"],
            service_candidates: [{ title: "Shartnoma ekspertizasi", reason: "Katalogdagi aniq xizmat", score: 0.9 }],
            reply_drafts: ["Assalomu alaykum! Shartnoma nusxasini yuboring, bugun ko'rib chiqamiz."],
            next_action: { at: soon(24 * 60), note: "Shartnoma kelgach qo'ng'iroq" },
            operator_warnings: ["Narxni mijozga kafolat sifatida aytmang."],
            operator_confirmation_required: true,
            auto_executed: false,
          },
        };
      return st.run;
    },
    "POST /crm/ai/runs/run-1/apply": (b: Record<string, unknown>) => ((st.applied = b), { ok: true }),
    "/crm/me/metrics": { operator: ME, total: 12, active: 7, won: 3, closed: 2, conversion_percent: 25, average_first_response_minutes: 14, overdue_next_actions: 1, status_counts: { new: 0, contacted: 4 }, revenue_visible: false },
    "/crm/analytics": { total_leads: 17, status_counts: { new: 3, contacted: 5, qualified: 3, proposal: 2, payment_pending: 1, won: 2, closed: 1 }, source_counts: { phone: 9, web: 5, telegram: 3 }, operators: [{ operator_user_id: ME.id, operator: ME, total: 12, won: 3, conversion_percent: 25 }], paid_revenue: 25039162, currency: "UZS", revenue_visible: true },
    "/crm/customers": { items: [{ ...CUSTOMER, status: "active", source: "phone", lead_count: 4, active_lead_count: 2, created_at: "2026-10-20T08:00:00Z", updated_at: "2026-10-26T08:00:00Z" }, { ...CUSTOMER, id: "c2", public_id: "CRM-AA11", name: "Dilnoza K.", primary_phone: "+998901234560", lead_count: 1, active_lead_count: 1, status: "active", source: "web", created_at: "2026-10-25T08:00:00Z", updated_at: "2026-10-25T08:00:00Z" }], total: 2, limit: 48, offset: 0 },
    "/crm/customers/c1": () => ({
      ...CUSTOMER,
      status: "active",
      source: "phone",
      lead_count: 4,
      active_lead_count: 2,
      created_at: "2026-10-20T08:00:00Z",
      updated_at: "2026-10-26T08:00:00Z",
      notes: "Ertalab qo'ng'iroq qilish qulay.",
      contacts: [
        { id: "k1", customer_id: "c1", contact_type: "phone", value: "+998901234567", label: "Asosiy", is_primary: true, is_verified: true, status: "active", source: "operator", created_at: "", updated_at: "" },
        { id: "k2", customer_id: "c1", contact_type: "telegram", value: "@dilnoza", label: "", is_primary: false, is_verified: false, status: "active", source: "operator", created_at: "", updated_at: "" },
      ],
      leads: [st.mine[0], st.mine[1], lead("old1", { status: "won", title: "Nikoh shartnomasi", closed_at: "2026-09-01T08:00:00Z" }), lead("old2", { status: "closed", title: "Eski murojaat", closed_at: "2026-08-01T08:00:00Z" })],
      orders: [],
      activity_count: 9,
    }),
    "/crm/customers/c2": { ...CUSTOMER, id: "c2", public_id: "CRM-AA11", name: "Dilnoza K.", status: "active", source: "web", lead_count: 1, active_lead_count: 1, created_at: "", updated_at: "", notes: "", contacts: [{ id: "k9", customer_id: "c2", contact_type: "phone", value: "+998901234560", label: "", is_primary: true, is_verified: false, status: "active", source: "web", created_at: "", updated_at: "" }], leads: [lead("x1", { customer_id: "c2" })], orders: [], activity_count: 1 },
    "/crm/customers/c1/timeline": [{ id: "t1", customer_id: "c1", lead_id: null, actor: null, actor_user_id: null, activity_type: "customer_created", title: "Mijoz yaratildi", body: "Dilnoza Karimova", payload: { source: "phone" }, visibility: "staff", created_at: "2026-10-20T08:00:00Z" }],
    "/crm/operators": { items: [ME, { id: "op-2", name: "Akmal Operator", lexgo_id: "LGCC-2", role: "call_center", active_leads: 3 }], total: 2 },
    "/crm/operator-templates": { items: [{ id: "tp1", title: "Hujjat so'rash", template_type: "chat", language: "uz_latn", content: "Iltimos, shartnoma nusxasini yuboring.", tags: [], status: "active" }], total: 1 },
    "POST /crm/exports": (b: Record<string, unknown>) => ({ status: 202, json: { id: "ex1", scope: b.scope, status: "queued", status_url: "/crm/exports/ex1" } }),
    "/crm/exports/ex1": () => ((st.exportPolls += 1), { id: "ex1", scope: "leads", status: st.exportPolls >= 2 ? "ready" : "processing", download_url: "/crm/exports/ex1/download" }),
  };
  return { st, routes };
}

test("operator mission control: queue, mine, overdue, my metrics, no revenue, honest telephony", async ({ page }) => {
  const missing = watchIntl(page);
  const { routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm");
  const hero = page.locator(".crm-hero");
  await expect(hero.locator(".crm-counter").nth(0)).toContainText("3");
  await expect(hero.locator(".crm-counter").nth(1)).toContainText("7");
  await expect(hero.locator(".crm-counter").nth(2)).toContainText("1");
  await expect(page.locator(".crm-agenda li").first()).toContainText("kechikdi");
  await expect(page.locator(".crm-ribbon button")).toHaveCount(7);
  await expect(page.getByText("IP-telefoniya hali ulanmagan")).toBeVisible();
  // Operators: no analytics section, no revenue anywhere.
  await expect(page.locator(".crm-nav").getByText("Tahlil")).toHaveCount(0);
  await expect(page.locator(".crm")).not.toContainText("25 039 162");
  await expect(page.getByText("To'langan tushum")).toHaveCount(0);
  await shot(page, "overview");
  expect(missing).toEqual([]);
});

test("queue claim: mine on success; a 409 race shakes the row out and never shows it as mine", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads?tab=queue");
  const rows = page.locator(".crm-table tbody tr");
  await expect(rows).toHaveCount(3);
  await shot(page, "leads");
  // Keyboard: j moves down, c claims the active row (q2: someone was faster).
  await page.locator("body").press("j");
  await expect(rows.nth(1)).toHaveAttribute("data-active", "true");
  await page.locator("body").press("c");
  await expect(page.getByText("Kimdir tezroq bo'ldi").first()).toBeVisible();
  await expect.poll(() => st.claims).toEqual(["q2"]);
  // q2 is never shown as owned by this operator.
  await page.getByRole("tab", { name: /Meniki/ }).click();
  await expect(page.locator(".crm-table")).not.toContainText("Aliment undirish");
  await page.getByRole("tab", { name: /Navbat/ }).click();
  await rows.first().getByRole("button", { name: "Olish" }).click();
  await expect(page.getByText(/endi sizniki/).first()).toBeVisible();
  await expect.poll(() => st.claims).toEqual(["q2", "q1"]);
  await expect(page.locator(".crm-table")).not.toContainText("Ijara shartnomasi tekshiruvi", { timeout: 8000 });
  expect(missing).toEqual([]);
});

test("lead workspace: status moves follow meta, carry the lock, recover from a version conflict; transfer needs a reason", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer([...(OPERATOR.permissions ?? []), "crm.leads.assign"]);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1");
  const head = page.locator(".crm-lhead");
  await expect(head).toContainText("Ijara shartnomasi tekshiruvi");
  // contacted → closed, proposal, qualified only (the meta map).
  await expect(head.locator(".crm-move")).toHaveCount(3);
  await wsTab(page, /Ma'lumot/);
  await expect(page.getByText("Ehtimoliy dublikat").first()).toBeVisible();
  await wsTab(page, /Tarix/);
  // Timeline: oldest first, immutable (no edit/delete controls).
  const tl = page.locator(".crm-tl__ev");
  await expect(tl.first()).toContainText("Lid yaratildi");
  await expect(page.locator(".crm-tl").getByRole("button", { name: /tahrir|o'chir/i })).toHaveCount(0);
  await shot(page, "lead");

  await head.getByRole("button", { name: /Saralangan/ }).click();
  const sheet = page.getByRole("dialog", { name: /Saralangan/ });
  await sheet.getByRole("textbox", { name: /Sabab/ }).fill("Mijoz bilan gaplashildi");
  await sheet.getByRole("button", { name: "O'tkazish" }).click();
  // 409: the lead reloads, the banner explains, the typed reason stays.
  await expect(page.getByText("Siz ishlayotganda lid o'zgardi.").first()).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: /Sabab/ })).toHaveValue("Mijoz bilan gaplashildi");
  await sheet.getByRole("button", { name: "O'tkazish" }).click();
  await expect(sheet).toBeHidden();
  expect(st.writes.map((w) => w.body.expected_lock_version)).toEqual([4, 5]);
  expect(st.writes[1].body).toMatchObject({ status: "qualified", reason: "Mijoz bilan gaplashildi" });

  // Transfer without a reason never reaches the backend.
  await wsTab(page, /Ma'lumot/);
  await page.getByRole("button", { name: "O'tkazish", exact: true }).first().click();
  const tr = page.getByRole("dialog", { name: "Lidni o'tkazish" });
  await tr.getByRole("radio", { name: /Akmal Operator/ }).click();
  await tr.getByRole("button", { name: "O'tkazish" }).click();
  await expect(tr.getByText("O'tkazish uchun sabab kerak.")).toBeVisible();
  expect(st.writes.filter((w) => w.path === "transfer")).toHaveLength(0);
  await tr.getByRole("textbox").last().fill("Smena almashinuvi");
  await tr.getByRole("button", { name: "O'tkazish" }).click();
  await expect.poll(() => st.writes.filter((w) => w.path === "transfer").length).toBe(1);
  expect(st.writes.find((w) => w.path === "transfer")?.body).toMatchObject({ operator_user_id: "op-2", reason: "Smena almashinuvi" });
  expect(missing).toEqual([]);
});

test("AI copilot: 202 → poll → cards; only the ticked paths, with edits and the lock, are applied", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads/m1");
  await wsTab(page, /Kopilot/);
  const ai = page.locator(".crm-ai");
  await expect(ai).toContainText("AI faqat taklif qiladi");
  await ai.getByRole("button", { name: "Kopilotdan so'rash" }).click();
  await expect(ai.locator(".crm-think")).toBeVisible();
  await expect(ai.getByText("Mijoz ijara shartnomasini")).toBeVisible({ timeout: 15000 });
  await expect(ai.locator(".crm-warnbox")).toContainText("Narxni mijozga kafolat sifatida aytmang.");
  await expect(ai.locator(".crm-flag")).toHaveCount(2);
  // Nothing was applied by itself.
  expect(st.applied).toBeNull();
  // Ticked the way an operator does: on the card's label.
  for (const name of [/^Qisqacha/, /^Shoshilinchlik/]) {
    await ai.locator("label.cbx__row").filter({ hasText: name }).click();
    await expect(ai.getByRole("checkbox", { name })).toBeChecked();
  }
  await ai.getByRole("textbox", { name: "Qisqacha" }).fill("Operator tuzatgan qisqacha matn");
  // A draft can be edited and copied, never applied.
  await expect(ai.getByRole("checkbox", { name: /Javob qoralamalari/ })).toBeDisabled();
  await shot(page, "lead-copilot");
  await ai.getByRole("button", { name: "Tanlanganlarni qo'llash (2)" }).click();
  const prev = page.getByRole("dialog", { name: "Shu o'zgarishlar qo'llansinmi?" });
  await expect(prev).toContainText("Operator tuzatgan qisqacha matn");
  await prev.getByRole("button", { name: "Tanlanganlarni qo'llash (2)" }).click();
  await expect.poll(() => st.applied).not.toBeNull();
  expect(st.applied).toEqual({ selected_paths: ["summary", "urgency"], overrides: { summary: "Operator tuzatgan qisqacha matn" }, expected_lock_version: 4 });
  expect(missing).toEqual([]);
});

test("customer profile: current and past leads, contacts, and merge only with its permission", async ({ page }) => {
  const missing = watchIntl(page);
  const { routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/customers/c1");
  await expect(page.locator(".crm-lhead")).toContainText("Dilnoza Karimova");
  await expect(page.getByText("Joriy lidlar")).toBeVisible();
  await expect(page.getByText("O'tgan lidlar")).toBeVisible();
  await expect(page.locator(".crm-leadcard")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /Birlashtirish/ })).toHaveCount(0);
  await shot(page, "customer");
  expect(missing).toEqual([]);
});

test("superadmin: global analytics with revenue; merge asks for a typed confirmation; export runs in the background", async ({ page }) => {
  const missing = watchIntl(page);
  const ALL = ["crm.customers.view", "crm.customers.manage", "crm.customers.merge", "crm.leads.view", "crm.leads.manage", "crm.leads.claim", "crm.leads.assign", "crm.analytics.self", "crm.analytics.global", "crm.revenue.view", "crm.ai.use", "crm.exports.create", "crm.templates.manage"];
  const { routes } = crmServer(ALL, true);
  const mock = await mockBackend(page, await signIn(page, ADMIN, routes as never));
  await page.goto("/uz/admin/crm/analytics");
  await expect(page.locator(".crm-revenue")).toContainText("25 039 162");
  await expect(page.locator(".crm-board li")).toHaveCount(1);
  await shot(page, "analytics");

  await page.goto("/uz/admin/crm/customers/c1");
  await page.getByRole("button", { name: /Birlashtirish/ }).click();
  const dlg = page.getByRole("dialog", { name: "Mijozlarni birlashtirish" });
  await dlg.getByRole("textbox").fill("Dilnoza");
  await dlg.getByRole("button", { name: /Dilnoza K\./ }).click();
  await expect(dlg.locator(".crm-compare__side")).toHaveCount(2);
  await dlg.getByRole("textbox").first().fill("Bir xil odam, tasdiqlandi");
  const go = dlg.getByRole("button", { name: "Butunlay birlashtirish" });
  await expect(go).toBeDisabled();
  await dlg.getByRole("textbox", { name: /BIRLASHTIRISH/ }).fill("BIRLASHTIRISH");
  await expect(go).toBeEnabled();
  await dlg.getByRole("button", { name: "Bekor qilish" }).click();
  expect(mock.calls.filter((c) => c.path === "/crm/customers/merge")).toHaveLength(0);

  await page.goto("/uz/admin/crm/leads");
  await page.getByRole("button", { name: "Excelga eksport" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Eksportni boshlash" }).click();
  await expect(page.locator(".crm-job")).toBeVisible();
  await expect(page.locator(".crm-job").getByRole("button", { name: "Yuklab olish" })).toBeVisible({ timeout: 15000 });
  expect(mock.calls.find((c) => c.method === "POST" && c.path === "/crm/exports")?.body).toMatchObject({ scope: "leads" });
  expect(missing).toEqual([]);
});

// A real HTML5 drag: press, nudge (so the browser starts a drag), glide over
// the column, release.
async function dragCard(page: Page, from: Locator, to: Locator) {
  await from.hover(); // waits until the card has stopped animating in
  await to.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 140, { steps: 12 });
  await page.mouse.up();
}

test("kanban: moves follow the map, carry the lock, survive a conflict and land at once", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads?tab=mine&view=board");
  const cols = page.locator(".crm-col");
  await expect(cols).toHaveCount(7);
  const col = (name: string) => cols.filter({ has: page.locator(".crm-col__h b", { hasText: new RegExp(`^${name}$`) }) });
  const card = page.locator(".crm-kcard").filter({ hasText: "Ijara shartnomasi tekshiruvi" });
  await expect(col("Bog'lanildi").locator(".crm-kcard")).toHaveCount(1);
  await shot(page, "board");
  // One column = one request; nothing more while idle.
  await page.waitForTimeout(800);
  expect(st.boardCalls).toBe(7);

  // The menu offers only the map's next statuses and closes on Escape.
  const menu = card.getByRole("group", { name: "Ko'chirish…" });
  await card.getByRole("button", { name: "Ko'chirish…" }).click();
  await expect(menu.getByRole("button")).toHaveText(["Yopilgan", "Taklif", "Saralangan"]);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  if (!process.env.CRM_NARROW) {
    // contacted → new is not on the map: refused, nothing sent.
    await dragCard(page, card, col("Yangi"));
    await expect(page.getByText(/dan “Yangi” ga o'tkazib bo'lmaydi/).first()).toBeVisible();
    expect(st.writes).toHaveLength(0);
    await dragCard(page, card, col("Saralangan"));
  } else {
    await card.getByRole("button", { name: "Ko'chirish…" }).click();
    await menu.getByRole("button", { name: "Saralangan" }).click();
  }
  // contacted → qualified. The lead changed meanwhile (409): the sheet stays
  // open with the typed reason, the retry carries the new lock.
  const sheet = page.getByRole("dialog", { name: /Saralangan/ });
  await sheet.getByRole("textbox", { name: /Sabab/ }).fill("Hujjatlar keldi");
  await sheet.getByRole("button", { name: "O'tkazish" }).click();
  await expect(page.getByText(/lid o'zgardi|o'zgargan/i).first()).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: /Sabab/ })).toHaveValue("Hujjatlar keldi");
  await sheet.getByRole("button", { name: "O'tkazish" }).click();
  await expect(sheet).toHaveCount(0);
  // Lands in its new column at once, before any reload.
  await expect(col("Saralangan").locator(".crm-kcard").filter({ hasText: "Ijara shartnomasi" })).toBeVisible({ timeout: 300 });
  await expect(col("Bog'lanildi").locator(".crm-kcard")).toHaveCount(0);
  await expect(col("Saralangan").locator(".crm-col__h em")).toHaveText("2");

  // Straight on to the next move: it must carry the new lock (6), not 5.
  await card.getByRole("button", { name: "Ko'chirish…" }).click();
  await expect(menu.getByRole("button")).toHaveText(["Yopilgan", "To'lov kutilmoqda", "Taklif", "Yutildi"]);
  await menu.getByRole("button", { name: "Taklif" }).click();
  await page.getByRole("dialog", { name: /Taklif/ }).getByRole("textbox", { name: /Sabab/ }).fill("Narx yuborildi");
  await page.getByRole("dialog", { name: /Taklif/ }).getByRole("button", { name: "O'tkazish" }).click();
  await expect(col("Taklif").locator(".crm-kcard").filter({ hasText: "Ijara shartnomasi" })).toBeVisible({ timeout: 300 });
  expect(st.writes.map((w) => [w.body.status, w.body.expected_lock_version])).toEqual([
    ["qualified", 4],
    ["qualified", 5],
    ["proposal", 6],
  ]);
  // Back-to-back moves cost one debounced reload, not one per event.
  await page.waitForTimeout(900);
  expect(st.boardCalls).toBeLessThanOrEqual(7 * 3);
  await expect(col("Taklif").locator(".crm-kcard").filter({ hasText: "Ijara shartnomasi" })).toBeVisible();
  expect(missing).toEqual([]);
});

test("kanban: a claim from the queue board refreshes the board; a lost race says so", async ({ page }) => {
  const { st, routes } = crmServer(OPERATOR.permissions ?? []);
  await mockBackend(page, await signIn(page, OPERATOR, routes as never));
  await page.goto("/uz/admin/crm/leads?tab=queue&view=board");
  const fresh = page.locator(".crm-col").first();
  await expect(fresh.locator(".crm-kcard")).toHaveCount(3);
  await fresh.locator(".crm-kcard").filter({ hasText: "Ijara shartnomasi" }).getByRole("button", { name: "Olish" }).click();
  await expect.poll(() => st.claims).toEqual(["q1"]);
  // Out of the queue board once it is mine.
  await expect(fresh.locator(".crm-kcard")).toHaveCount(2);
  await fresh.locator(".crm-kcard").filter({ hasText: "Aliment undirish" }).getByRole("button", { name: "Olish" }).click();
  await expect(page.getByText(/Kimdir tezroq bo'ldi/).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /Meniki/ })).toContainText("3");
});


test("no page refetches by itself: once loaded, every CRM screen stays quiet", async ({ page }) => {
  const ALL = ["crm.customers.view", "crm.customers.manage", "crm.customers.merge", "crm.leads.view", "crm.leads.manage", "crm.leads.claim", "crm.leads.assign", "crm.analytics.self", "crm.analytics.global", "crm.revenue.view", "crm.ai.use", "crm.exports.create", "crm.templates.manage"];
  const { routes } = crmServer(ALL, true);
  const mock = await mockBackend(page, await signIn(page, ADMIN, routes as never));
  const crmCalls = () => mock.calls.filter((c) => c.path.startsWith("/crm")).length;
  for (const url of ["/uz/admin/crm", "/uz/admin/crm/leads?tab=all", "/uz/admin/crm/leads?tab=all&view=board", "/uz/admin/crm/leads/m1", "/uz/admin/crm/customers", "/uz/admin/crm/customers/c1", "/uz/admin/crm/templates", "/uz/admin/crm/analytics"]) {
    await page.goto(url);
    await expect(page.locator(".crm-top")).toBeVisible();
    await page.waitForTimeout(1500);
    const before = crmCalls();
    await page.waitForTimeout(2000);
    expect(crmCalls() - before, `${url} kept fetching`).toBe(0);
  }
});
