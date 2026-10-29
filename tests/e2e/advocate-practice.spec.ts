import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, mockBackend, signIn } from "./mock";

// Contract 2026-10-29 §4–5: the advocate's verified practice (tenure shown
// as the backend counts it, the certificate flow with software suggestions),
// pre-advocate employment kept apart from category experience, and the
// operator's certificate queue with suspension periods.
// Screenshots: XP_SHOTS=<dir>.
const shot = async (page: Page, name: string) => {
  if (process.env.XP_SHOTS) await page.screenshot({ path: `${process.env.XP_SHOTS}/prc-${name}.png`, fullPage: false });
};
const ME = { lawyer_name: "Test Advokat", region: "tashkent", bio: "", languages: ["uz"], specializations: [], experience_years: 8, lawyer_experience_years: 3, advocate_status_started_at: "2020-05-12", advocate_status_verification_status: "approved", advocate_status_verified_at: "2026-10-20T09:00:00Z", advocate_active_experience_days: 2300, advocate_active_experience_years: 6.3 };
const PRACTICE = {
  status_started_at: "2020-05-12",
  verification_status: "none",
  verified_at: null,
  active_experience_days: 2300,
  active_experience_years: 6.3,
  suspended_days: 31,
  suspensions: [{ id: "s1", started_at: "2025-01-01", ended_at: "2025-01-31", reason: "Maqom vaqtincha to'xtatilgan" }],
  certificate_number: "",
  issuing_authority: "",
  legal_basis: "O'zbekiston Respublikasining «Advokatura to'g'risida»gi Qonuni",
};

test("the advocate's tenure is the backend's; the certificate's suggested values are checked and sent", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  let saved: Record<string, unknown> | null = null;
  let polls = 0;
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/lawyers/me": ME,
      "PUT /lawyers/me": (b: unknown) => ((saved = b as Record<string, unknown>), ME),
      "/service-categories": [],
      "/marketplace/me/experience": { items: [] },
      "/marketplace/me/achievements": { items: [], total: 0 },
      "/marketplace/me/advocate-practice": PRACTICE,
      "POST /marketplace/me/advocate-license/evidence": { status: 201, json: { id: "v1", file_name: "guvohnoma.pdf", status: "processing" } },
      "/marketplace/me/advocate-license/evidence/v1": () => (++polls, { id: "v1", file_name: "guvohnoma.pdf", status: "analyzed", extracted: { holder_name: "Aliyev Vali", certificate_number: "ADV-12345", issuing_authority: "Adliya vazirligi", advocate_status_started_at: "2020-05-12" } }),
      "POST /marketplace/me/advocate-license/submit": (b: unknown) => ((sent = b as Record<string, unknown>), { status: 201, json: { id: "lv1", status: "pending_review" } }),
    }),
  );
  await page.goto("/ru/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
  const card = page.locator(".prc");
  await expect(card.locator(".prc__tenure")).toContainText("6,3");
  await expect(card.locator(".prc__tenure")).toContainText("2 300");
  await expect(card.locator(".prc__tenure")).toContainText("31");
  await expect(card).toContainText("Advokatura to'g'risida");
  await expect(card.locator(".prc__susp")).toContainText("Maqom vaqtincha to'xtatilgan");
  await shot(page, "card");

  // The general profile shows the tenure read-only and never sends it.
  const prof = page.locator('[data-ai-target="profile:professional"]').first();
  await prof.getByRole("button", { name: "Изменить" }).click();
  await expect(prof.getByLabel("Опыт как адвокат (лет)")).toHaveCount(0);
  await expect(prof.locator(".spe__ro")).toContainText(/6[,.]3/);
  await prof.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect(saved).not.toHaveProperty("experience_years");
  expect(saved).not.toHaveProperty("license_number");
  expect(saved).toHaveProperty("lawyer_experience_years", 3);

  await card.getByRole("button", { name: "Загрузить удостоверение" }).click();
  const form = page.getByRole("dialog", { name: "Удостоверение адвоката" });
  await form.locator('input[type="file"]').setInputFiles({ name: "guvohnoma.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  // Read by software, then the values arrive as suggestions to check.
  await expect.poll(() => polls, { timeout: 15000 }).toBeGreaterThan(0);
  await expect(form.getByLabel(/ФИО владельца/)).toHaveValue("Aliyev Vali");
  await expect(form.locator(".prc__ai").first()).toContainText("Предложение ИИ — проверьте");
  await expect(form.locator(".prc__ai")).toHaveCount(4);
  await form.getByLabel(/Номер удостоверения/).fill("ADV-12346");
  await expect(form.locator(".prc__ai")).toHaveCount(3);
  await shot(page, "flow");
  await page.locator(".amodal__f").getByRole("button", { name: "Отправить на проверку" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toEqual({ evidence_id: "v1", holder_name: "Aliyev Vali", certificate_number: "ADV-12346", issuing_authority: "Adliya vazirligi", advocate_status_started_at: "2020-05-12" });
});

test("pre-advocate employment is its own section: no category, never mixed in", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  const pos = [{ title: "Tergovchi", started_at: "2014-09-01T00:00:00Z", ended_at: "2019-12-31T00:00:00Z", is_current: false }];
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/lawyers/me": ME,
      "/service-categories": [{ id: "c1", name: "Оила ва никоҳ", slug: "oila-va-nikoh" }],
      "/marketplace/me/achievements": { items: [], total: 0 },
      "/marketplace/me/advocate-practice": PRACTICE,
      "/marketplace/me/experience": {
        items: [
          { id: "e1", root_id: "e1", status: "approved", version: 1, category_id: "c1", workplace: "Oila byurosi", positions: [{ title: "Advokat", started_at: "2020-06-01T00:00:00Z", is_current: true }], years: 6 },
          { id: "p1", root_id: "p1", status: "approved", version: 1, experience_kind: "pre_advocate_employment", workplace: "Ichki ishlar vazirligi", positions: pos, years: 5 },
        ],
      },
      "POST /marketplace/me/experience/evidence": { id: "ev1", file_name: "buyruq.pdf", mime_type: "application/pdf", size: 10 },
      "POST /marketplace/me/experience": (b: unknown) => ((sent = b as Record<string, unknown>), { id: "p2", status: "pending_review" }),
    }),
  );
  await page.goto("/ru/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
  const cat = page.locator(".exp:not(.ach):not(.exp--pre):not(.prc)");
  const pre = page.locator(".exp--pre");
  await expect(pre).toContainText("Работа до получения статуса адвоката");
  await expect(pre).toContainText("Ichki ishlar vazirligi");
  await expect(cat).toContainText("Oila byurosi");
  // Never in each other's lists, never years or price in the pre-advocate one.
  await expect(cat).not.toContainText("Ichki ishlar vazirligi");
  await expect(pre).not.toContainText("Oila byurosi");
  await expect(pre).not.toContainText("5 лет");

  await pre.getByRole("button", { name: "Добавить организацию" }).first().click();
  const form = page.getByRole("dialog", { name: "Место работы до адвокатуры" });
  await expect(form.getByRole("button", { name: /Категория/ })).toHaveCount(0);
  await expect(form).not.toContainText(/цена|цены|ценообраз|стоимост/i);
  await form.getByLabel("Название организации").fill("Toshkent shahar prokuraturasi");
  await form.getByLabel("Должность", { exact: true }).first().fill("Prokuror yordamchisi");
  await form.getByRole("radio", { name: "Работа завершена" }).first().click();
  await form.getByRole("combobox", { name: "Должность 1: Дата начала" }).fill("10.01.2016");
  await form.getByRole("combobox", { name: "Должность 1: Дата начала" }).press("Tab");
  await form.getByRole("combobox", { name: "Должность 1: Дата окончания" }).fill("20.04.2018");
  await form.getByRole("combobox", { name: "Должность 1: Дата окончания" }).press("Tab");
  await form.getByRole("button", { name: "Добавить должность" }).click();
  await form.getByLabel("Должность", { exact: true }).nth(1).fill("Katta prokuror yordamchisi");
  await form.getByRole("radio", { name: "Работа завершена" }).nth(1).click();
  await form.getByRole("combobox", { name: "Должность 2: Дата начала" }).fill("21.04.2018");
  await form.getByRole("combobox", { name: "Должность 2: Дата начала" }).press("Tab");
  await form.getByRole("combobox", { name: "Должность 2: Дата окончания" }).fill("01.05.2020");
  await form.getByRole("combobox", { name: "Должность 2: Дата окончания" }).press("Tab");
  await form.getByLabel("Описание опыта").fill("Jinoyat ishlari bo'yicha prokuratura nazorati, 2016–2020");
  await shot(page, "pre-form");
  await page.locator(".amodal__f").getByRole("button", { name: "Отправить на проверку" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toMatchObject({
    experience_kind: "pre_advocate_employment",
    workplace: "Toshkent shahar prokuraturasi",
    positions: [
      { title: "Prokuror yordamchisi", started_at: "2016-01-10T00:00:00Z", ended_at: "2018-04-20T00:00:00Z", is_current: false },
      { title: "Katta prokuror yordamchisi", started_at: "2018-04-21T00:00:00Z", ended_at: "2020-05-01T00:00:00Z", is_current: false },
    ],
  });
  expect(sent).not.toHaveProperty("category_id");
  expect(sent).not.toHaveProperty("subcategory_id");
});

test("the operator verifies a certificate and records a suspension; the tenure comes back recounted", async ({ page }) => {
  const decided: unknown[] = [];
  const susp: unknown[] = [];
  const record = { id: "lv1", status: "pending_review", seller_user_id: "u-adv", seller_name: "Test Advokat", holder_name: "Aliyev Vali", certificate_number: "ADV-12346", issuing_authority: "Adliya vazirligi", advocate_status_started_at: "2020-05-12", submitted_at: "2026-10-28T08:00:00Z", evidence: [{ id: "v1", file_name: "guvohnoma.pdf" }] };
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/call-center/marketplace/advocate-licenses": { items: [record], total: 1, has_more: false },
      "/call-center/marketplace/advocate-licenses/lv1": {
        record,
        seller: { id: "u-adv", name: "Test Advokat", phone: "+998901112233", lexgo_id: "LGA-7K2Q", role: "advokat", account_status: "active" },
        ai_analysis: { status: "analyzed", confidence: 0.91, extracted: { holder_name: "Aliyev Vali", certificate_number: "ADV-12345", issuing_authority: "Adliya vazirligi", advocate_status_started_at: "2020-05-12" } },
        checklist: ["holder_identity", "certificate_number", "issuing_authority", "status_date", "evidence_authenticity", "verifier_conclusion"].map((key) => ({ key })),
        practice: { active_experience_days: 2300, active_experience_years: 6.3, suspended_days: 0, suspensions: [] },
        reviews: [],
      },
      "POST /call-center/marketplace/advocate-practice/u-adv/suspensions": (b: unknown) => (susp.push(b), { status: 201, json: { active_experience_days: 2269, active_experience_years: 6.21, suspended_days: 31, suspensions: [{ id: "s1", started_at: "2025-01-01", ended_at: "2025-01-31", reason: "Maqom to'xtatilgan" }] } }),
      "POST /call-center/marketplace/advocate-licenses/lv1/review": (b: unknown) => (decided.push(b), { status: "approved" }),
    }),
  );
  await page.goto("/ru/admin/call-center?tab=licenses");
  await expect(page.getByRole("tab", { name: /Удостоверения адвокатов/ })).toBeVisible();
  await page.getByRole("button", { name: /Test Advokat/ }).click();
  const box = page.locator(".vrf");
  await expect(box.locator(".vrf__facts")).toContainText("ADV-12346");
  // The software read another number: shown beside what was typed.
  await expect(box.locator(".vrf__ai")).toContainText("Ввёл адвокат: ADV-12346");
  await expect(box).toContainText("Личность владельца");
  // Certificates have no review chat.
  await expect(box.locator(".vrf__room")).toHaveCount(0);
  expect(await box.innerText()).not.toMatch(/holder_identity|status_date|evidence_authenticity/);

  const s = box.locator(".alr__susp");
  await expect(s.locator(".alr__tenure")).toContainText("6,3");
  await s.getByRole("button", { name: "Добавить период" }).click();
  await s.getByRole("combobox", { name: "Начало" }).fill("01.01.2025");
  await s.getByRole("combobox", { name: "Начало" }).press("Tab");
  await s.getByRole("combobox", { name: "Конец" }).fill("31.01.2025");
  await s.getByRole("combobox", { name: "Конец" }).press("Tab");
  await s.locator("textarea").fill("Maqom to'xtatilgan");
  await s.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect.poll(() => susp.length).toBe(1);
  expect(susp[0]).toEqual({ started_at: "2025-01-01", ended_at: "2025-01-31", reason: "Maqom to'xtatilgan", evidence_ids: [] });
  // The backend's recount, shown as it is.
  await expect(s.locator(".alr__tenure")).toContainText("6,21");
  await expect(s.locator(".alr__tenure")).toContainText("2 269");
  await expect(s.locator(".alr__slist")).toContainText("Maqom to'xtatilgan");
  await shot(page, "license-review");

  for (const g of await box.locator(".vrf__v").all()) await g.getByRole("radio", { name: "Да" }).click();
  await box.getByRole("radio", { name: /^Подтвердить/ }).click();
  await box.getByRole("button", { name: "Подтвердить" }).click();
  await expect.poll(() => decided.length).toBe(1);
  const d = decided[0] as { decision: string; reason: string; checklist: { key: string; verdict: string }[] };
  expect([d.decision, d.reason]).toEqual(["approve", ""]);
  expect(d.checklist.map((c) => `${c.key}:${c.verdict}`)).toEqual(["holder_identity", "certificate_number", "issuing_authority", "status_date", "evidence_authenticity", "verifier_conclusion"].map((k) => `${k}:approved`));
});
