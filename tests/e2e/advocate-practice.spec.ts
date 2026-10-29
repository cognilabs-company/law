import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, mockBackend, signIn } from "./mock";

// Final contract 2026-10-29 §9–14 (backend 69c11a6): the advocate's verified
// practice (tenure shown as the backend counts it, the certificate flow with
// software suggestions), pre-advocate employment kept apart from category
// experience, and the operator's certificate queue with the review chat,
// suspension periods, their documents and archiving. Canonical shapes only.
// Screenshots: XP_SHOTS=<dir>.
const shot = async (page: Page, name: string) => {
  if (process.env.XP_SHOTS) await page.screenshot({ path: `${process.env.XP_SHOTS}/prc-${name}.png`, fullPage: false });
};
const ME = { lawyer_name: "Test Advokat", region: "tashkent", bio: "", languages: ["uz"], specializations: [], experience_years: 8, lawyer_experience_years: 3, advocate_status_started_at: "2020-05-12", advocate_status_verification_status: "approved", advocate_status_verified_at: "2026-10-20T09:00:00Z", advocate_active_experience_days: 2300, advocate_active_experience_years: 6.3 };
// §10 AdvocatePracticeOut: a first certificate was turned back for changes.
const PRACTICE = {
  seller_user_id: "u-adv",
  status_started_at: "2020-05-12",
  verification_status: "changes_requested",
  verified_at: null,
  active_experience_days: 2300,
  active_experience_years: 6.3,
  suspended_days: 31,
  suspensions: [{ id: "s1", started_at: "2025-01-01", ended_at: "2025-01-31", reason: "Maqom vaqtincha to'xtatilgan", days: 31, evidence_ids: [] }],
  certificate_number: null,
  issuing_authority: null,
  latest_verification: { id: "lv0", status: "changes_requested", reason: "Skan o'qilmaydi", reviewed_at: "2026-10-28T10:00:00Z", version: 1 },
  legal_basis: { code: "advocate_status_begins_on_certificate_issue", text: "O'zbekiston Respublikasining «Advokatura to'g'risida»gi Qonuni", suspension_excluded: true },
};
const LICENSE_CONFIG = {
  evidence: { required: true, min_files: 1, max_files: 20, max_file_size_bytes: 20971520, allowed_mime_types: ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], allowed_extensions: [".pdf", ".jpg", ".jpeg", ".png", ".docx"] },
  states: ["processing", "analyzed", "manual_review_required"],
  verification_statuses: ["not_submitted", "pending_review", "approved", "rejected", "changes_requested"],
  review_decisions: ["approve", "reject", "changes_requested"],
  extracted_fields: ["holder_name", "certificate_number", "license_number", "issuing_authority", "advocate_status_started_at", "issue_date"],
  realtime_events: ["marketplace.advocate_license_evidence_analyzed"],
};
const NO_GROUPS = { items: [], groups: [], total: 0, count: 0, limit: 50, offset: 0, has_more: false };

test("the advocate's tenure is the backend's; the certificate's suggested values are checked and resubmitted", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  let saved: Record<string, unknown> | null = null;
  let polls = 0;
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/lawyers/me": ME,
      "PUT /lawyers/me": (b: unknown) => ((saved = b as Record<string, unknown>), ME),
      "/service-categories": [],
      "/marketplace/me/experience": NO_GROUPS,
      "/marketplace/me/achievements": NO_GROUPS,
      "/marketplace/me/advocate-practice": PRACTICE,
      "/marketplace/me/advocate-license/config": LICENSE_CONFIG,
      "POST /marketplace/me/advocate-license/evidence": { status: 201, json: { id: "v1", status: "processing", file_name: "guvohnoma.pdf", mime_type: "application/pdf", size: 8, extracted_fields: {}, ai_analysis: {}, final_decision: "operator_required" } },
      "/marketplace/me/advocate-license/evidence/v1": () => (
        ++polls,
        { id: "v1", status: "analyzed", file_name: "guvohnoma.pdf", mime_type: "application/pdf", size: 8, extracted_fields: { holder_name: "Aliyev Vali", certificate_number: "ADV-12345", issuing_authority: "Adliya vazirligi", advocate_status_started_at: "2020-05-12", issue_date: "2020-05-12" }, ai_analysis: {}, final_decision: "operator_required" }
      ),
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
  await expect(card).toContainText("Периоды приостановления не входят в стаж");
  await expect(card).toContainText("Комментарий оператора: Skan o'qilmaydi");
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

  await card.getByRole("button", { name: "Отправить снова" }).click();
  const form = page.getByRole("dialog", { name: "Удостоверение адвоката" });
  // The config's file rules: a video never leaves the page.
  await form.locator('input[type="file"]').setInputFiles({ name: "video.mp4", mimeType: "video/mp4", buffer: Buffer.from("x") });
  await expect(form).toContainText("Такой тип файла не принимается");
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
  // A resubmission names the latest verification (§9).
  expect(sent).toEqual({ source_id: "lv0", evidence_id: "v1", holder_name: "Aliyev Vali", certificate_number: "ADV-12346", license_number: "", issuing_authority: "Adliya vazirligi", advocate_status_started_at: "2020-05-12" });
});

test("a superadmin on the advocate's screens gets a friendly sentence, not an error", async ({ page }) => {
  const refused = { status: 403, json: { detail: { code: "advocate_role_required" } } };
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/lawyers/me": ME,
      "/service-categories": [],
      "/marketplace/me/experience": NO_GROUPS,
      "/marketplace/me/achievements": refused,
      "/marketplace/me/achievements/config": refused,
      "/marketplace/me/advocate-practice": refused,
      "/marketplace/me/advocate-license/config": refused,
    }),
  );
  await page.goto("/ru/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator(".prc .ach__denied")).toContainText("только для аккаунта адвоката");
  await expect(page.locator(".ach .ach__denied")).toContainText("только для аккаунта адвоката");
  expect(await page.locator(".prc, .ach").allInnerTexts()).not.toContain("advocate_role_required");
});

test("pre-advocate employment is its own section: no category, never mixed in", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  const pos = [{ title: "Tergovchi", started_at: "2014-09-01T00:00:00Z", ended_at: "2019-12-31T00:00:00Z", is_current: false }];
  const cat = { id: "e1", root_id: "e1", status: "approved", version: 1, experience_kind: "category_experience", category_id: "c1", workplace: "Oila byurosi", positions: [{ title: "Advokat", started_at: "2020-06-01T00:00:00Z", is_current: true }], years: 6 };
  const pre = { id: "p1", root_id: "p1", status: "approved", version: 1, experience_kind: "pre_advocate_employment", category_id: null, workplace: "Ichki ishlar vazirligi", positions: pos, years: 5 };
  const g = (r: Record<string, unknown>) => ({ root_id: r.root_id, current: r, pending_revision: null, latest: r, revision_count: 1 });
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/lawyers/me": ME,
      "/service-categories": [{ id: "c1", name: "Оила ва никоҳ", slug: "oila-va-nikoh" }],
      "/marketplace/me/achievements": NO_GROUPS,
      "/marketplace/me/advocate-practice": PRACTICE,
      "/marketplace/me/experience": { items: [], groups: [g(cat), g(pre)], total: 2, count: 2, limit: 50, offset: 0, has_more: false },
      "POST /marketplace/me/experience/evidence": { id: "ev1", file_name: "buyruq.pdf", mime_type: "application/pdf", size: 10 },
      "POST /marketplace/me/experience": (b: unknown) => ((sent = b as Record<string, unknown>), { id: "p2", status: "pending_review" }),
    }),
  );
  await page.goto("/ru/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
  const catPanel = page.locator(".exp:not(.ach):not(.exp--pre):not(.prc)");
  const prePanel = page.locator(".exp--pre");
  await expect(prePanel).toContainText("Работа до получения статуса адвоката");
  await expect(prePanel).toContainText("Ichki ishlar vazirligi");
  await expect(catPanel).toContainText("Oila byurosi");
  // Never in each other's lists, never years or price in the pre-advocate one.
  await expect(catPanel).not.toContainText("Ichki ishlar vazirligi");
  await expect(prePanel).not.toContainText("Oila byurosi");
  await expect(prePanel).not.toContainText("5 лет");

  await prePanel.getByRole("button", { name: "Добавить организацию" }).first().click();
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

test("the operator's experience queue filters the kind on the backend", async ({ page }) => {
  const kinds: string[] = [];
  const row = { id: "p9", root_id: "p9", status: "pending_review", version: 1, experience_kind: "pre_advocate_employment", workplace: "Ichki ishlar vazirligi", positions: [], seller: { id: "u-adv", lexgo_id: "LGA-7K2Q", name: "Test Advokat", phone: "+998901112233", role: "advokat", account_status: "active" }, submitted_at: "2026-10-28T08:00:00Z" };
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/service-categories": [],
      "/call-center/marketplace/experience": (_b: unknown, url: URL) => (kinds.push(url.searchParams.get("experience_kind") ?? ""), { items: url.searchParams.get("experience_kind") === "category_experience" ? [] : [row], total: 1, count: 1, limit: 50, offset: 0, has_more: false }),
    }),
  );
  await page.goto("/ru/admin/call-center?tab=experience");
  await expect(page.getByRole("button", { name: /Test Advokat/ })).toContainText("Работа до адвокатуры");
  await page.getByRole("radio", { name: "Опыт по категории" }).click();
  await expect.poll(() => kinds).toContain("category_experience");
  await expect(page.getByRole("button", { name: /Test Advokat/ })).toHaveCount(0);
});

const LICENSE_CHECKS = [
  ["holder_identity", "Egasining shaxsi", "Личность владельца"],
  ["certificate_number", "Guvohnoma raqami", "Номер удостоверения"],
  ["issuing_authority", "Bergan organ", "Выдавший орган"],
  ["status_date", "Maqom sanasi", "Дата статуса"],
  ["evidence_authenticity", "Hujjat haqiqiyligi", "Подлинность документа"],
  ["verifier_conclusion", "Tekshiruvchi xulosasi", "Заключение проверяющего"],
].map(([key, uz, ru]) => ({ key, label: uz, hint: uz, label_i18n: { uz_latn: uz, ru } }));

test("the operator verifies a certificate, talks to the advocate, records and archives suspensions", async ({ page }) => {
  const decided: unknown[] = [];
  const susp: unknown[] = [];
  const rooms: string[] = [];
  let archived = "";
  const record = { id: "lv1", root_id: "lv0", source_id: "lv0", version: 2, status: "pending_review", seller_user_id: "u-adv", holder_name: "Aliyev Vali", certificate_number: "ADV-12346", license_number: "", issuing_authority: "Adliya vazirligi", advocate_status_started_at: "2020-05-12", submitted_at: "2026-10-28T08:00:00Z" };
  const recounted = (n: number, years: number, list: unknown[]) => ({ ...PRACTICE, verification_status: "pending_review", active_experience_days: n, active_experience_years: years, suspended_days: 2300 - n, suspensions: list });
  const s2 = { id: "s2", started_at: "2025-01-01", ended_at: "2025-01-31", reason: "Maqom to'xtatilgan", days: 31, evidence_ids: ["d1"] };
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/call-center/marketplace/advocate-licenses": { items: [{ ...record, seller: { id: "u-adv", lexgo_id: "LGA-7K2Q", name: "Test Advokat", phone: "+998901112233", role: "advokat", account_status: "active" } }], total: 1, count: 1, limit: 50, offset: 0, has_more: false },
      "/call-center/marketplace/advocate-licenses/lv1": {
        record,
        seller: { id: "u-adv", name: "Test Advokat", phone: "+998901112233", lexgo_id: "LGA-7K2Q", role: "advokat", account_status: "active" },
        seller_profile: {},
        practice: recounted(2300, 6.3, []),
        evidence: { id: "v1", file_name: "guvohnoma.pdf", mime_type: "application/pdf", size: 8 },
        ai_analysis: { status: "completed", analysis_type: "advocate_license", document_readable: true, authenticity_confidence: 0.91, manipulation_risk: 0.05, ai_generated_risk: 0.02, risk_level: "low", risk_codes: [], risk_items: [], signature_detection: { signature: true, seal: true, electronic_signature: false }, pii_detected: [], operator_notes: [], extracted_fields: { holder_name: "Aliyev Vali", certificate_number: "ADV-12345", issuing_authority: "Adliya vazirligi", advocate_status_started_at: "2020-05-12" }, final_decision: "operator_required" },
        // Final contract §6: the backend's mismatches.
        mismatched_fields: [
          { field: "holder_name", submitted_value: "Aliyev Vali", extracted_value: "Aliyev Vali", matches: true },
          { field: "certificate_number", submitted_value: "ADV-12346", extracted_value: "ADV-12345", matches: false },
        ],
        previous_approved_verification: null,
        diff: [],
        history: [],
        reviews: [],
        checklist_keys: LICENSE_CHECKS.map((c) => c.key),
        checklist: LICENSE_CHECKS,
        communication: {},
        ai_advisory_only: true,
        final_decision_by: "operator",
      },
      "POST /call-center/marketplace/advocate-licenses/lv1/communication": () => (rooms.push("open"), { status: 201, json: { idempotent: false, room_id: "room-lic-1", messages_url: "/secure-chats/room-lic-1/messages", calls_url: "/secure-chats/room-lic-1/calls", call_types: ["audio", "video"], close_by_operator_only: true } }),
      "POST /call-center/marketplace/advocate-licenses/lv1/communication/close": () => (rooms.push("close"), { event: "marketplace.review_chat_closed", record_id: "lv1", room_id: "room-lic-1", status: "read_only" }),
      "POST /call-center/marketplace/advocate-practice/u-adv/suspensions/evidence": { status: 201, json: { id: "d1", file_name: "buyruq.pdf", mime_type: "application/pdf", size: 8, download_url: "/call-center/marketplace/advocate-practice/u-adv/suspensions/evidence/d1" } },
      "POST /call-center/marketplace/advocate-practice/u-adv/suspensions": (b: unknown) => (susp.push(b), { status: 201, json: { practice: recounted(2269, 6.21, [s2]) } }),
      "DELETE /call-center/marketplace/advocate-practice/u-adv/suspensions/s2": () => ((archived = "s2"), { practice: recounted(2300, 6.3, []) }),
      "POST /call-center/marketplace/advocate-licenses/lv1/review": (b: unknown) => (decided.push(b), { status: "approved" }),
    }),
  );
  await page.goto("/ru/admin/call-center?tab=licenses");
  await expect(page.getByRole("tab", { name: /Удостоверения адвокатов/ })).toBeVisible();
  await page.getByRole("button", { name: /Test Advokat/ }).click();
  const box = page.locator(".vrf");
  await expect(box.locator(".vrf__facts")).toContainText("ADV-12346");
  // The software read another number: shown beside what was typed.
  await expect(box.locator(".vrf__ai").last()).toContainText("Ввёл адвокат: ADV-12346");
  await expect(box).toContainText("Личность владельца");
  expect(await box.innerText()).not.toMatch(/holder_identity|status_date|evidence_authenticity|advocate_license|operator_required/);

  // The review chat with calls; only the operator closes it.
  await box.getByRole("button", { name: "Открыть чат" }).click();
  await expect(box.locator(".vrf__room")).toContainText("Чат открыт");
  await expect(box.getByRole("link", { name: "Перейти в чат" })).toHaveAttribute("href", /room-lic-1/);
  await box.getByRole("button", { name: "Закрыть чат" }).click();
  await expect(box.locator(".vrf__room")).toContainText("Чат закрыт");
  expect(rooms).toEqual(["open", "close"]);

  const s = box.locator(".alr__susp");
  await expect(s.locator(".alr__tenure")).toContainText("6,3");
  await s.getByRole("button", { name: "Добавить период" }).click();
  await s.getByRole("combobox", { name: "Начало" }).fill("01.01.2025");
  await s.getByRole("combobox", { name: "Начало" }).press("Tab");
  await s.getByRole("combobox", { name: "Конец" }).fill("31.01.2025");
  await s.getByRole("combobox", { name: "Конец" }).press("Tab");
  await s.locator("textarea").fill("Maqom to'xtatilgan");
  await s.locator('input[type="file"]').setInputFiles({ name: "buyruq.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(s.locator(".alr__flist")).toContainText("buyruq.pdf");
  await s.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect.poll(() => susp.length).toBe(1);
  expect(susp[0]).toEqual({ started_at: "2025-01-01", ended_at: "2025-01-31", reason: "Maqom to'xtatilgan", evidence_ids: ["d1"] });
  // The backend's recount, shown as it is.
  await expect(s.locator(".alr__tenure")).toContainText("6,21");
  await expect(s.locator(".alr__tenure")).toContainText("2 269");
  await expect(s.locator(".alr__slist")).toContainText("Maqom to'xtatilgan");
  await expect(s.locator(".alr__slist")).toContainText("Документ 1");
  await shot(page, "license-review");

  // A wrong period is archived after the handmade confirm, never erased.
  await s.getByRole("button", { name: "В архив" }).click();
  const ask = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "Архивировать период?" }));
  await expect(ask).toContainText("Архивировать период?");
  await ask.getByRole("button", { name: "В архив" }).click();
  await expect.poll(() => archived).toBe("s2");
  await expect(s.locator(".alr__tenure")).toContainText("6,3");
  await expect(s).toContainText("Периоды приостановления не записаны");

  for (const g of await box.locator(".vrf__v").all()) await g.getByRole("radio", { name: "Да" }).click();
  await box.getByRole("radio", { name: /^Подтвердить/ }).click();
  await box.getByRole("button", { name: "Подтвердить" }).click();
  await expect.poll(() => decided.length).toBe(1);
  const d = decided[0] as { decision: string; reason: string; checklist: { key: string; verdict: string }[] };
  expect([d.decision, d.reason]).toEqual(["approve", ""]);
  expect(d.checklist.map((c) => `${c.key}:${c.verdict}`)).toEqual(LICENSE_CHECKS.map((c) => `${c.key}:approved`));
});

test("without marketplace.experience.review the three review tabs are not offered", async ({ page }) => {
  const lawyer = { ...CALL_CENTER, permissions: ["callcenter.access", "leads.manage"] };
  await mockBackend(page, await signIn(page, lawyer, { "/service-categories": [] }));
  await page.goto("/ru/admin/call-center");
  await expect(page.getByRole("tab", { name: /Лиды/ })).toBeVisible();
  for (const name of [/Проверка опыта/, /Проверка достижений/, /Удостоверения адвокатов/]) await expect(page.getByRole("tab", { name })).toHaveCount(0);
});
