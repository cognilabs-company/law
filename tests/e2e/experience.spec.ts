import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, mockBackend, signIn } from "./mock";

// Experience and achievements (TSK-415946, 920636, 874927, 100467, 365169,
// 493303; contract 2026-10-27 §15–18): a workplace with several positions;
// edits are revisions; the call center sees what changed, ticks a dynamic
// checklist, approves / asks for changes / rejects, and can talk to the
// seller in a protected room only it closes. Screenshots: XP_SHOTS=<dir>.
const ME = { lawyer_name: "Test Advokat", region: "tashkent", bio: "", languages: ["uz"], specializations: [], experience_years: 8 };
const CATS = [{ id: "c1", name: "Оила ва никоҳ", slug: "oila-va-nikoh" }, { id: "c2", name: "Мерос", slug: "meros" }];
const rec = (extra: Record<string, unknown>) => ({ category_id: "c1", workplace: "Adliya", positions: [{ title: "Advokat", started_at: "2018-03-01T00:00:00Z", ended_at: null, is_current: true }], description: "Oilaviy nizolar bo'yicha 40 dan ortiq ish", evidence: [], ...extra });
const shot = async (page: Page, name: string) => {
  if (process.env.XP_SHOTS) await page.screenshot({ path: `${process.env.XP_SHOTS}/xp-${name}.png` });
};

test("a lawyer adds a workplace with two positions and evidence; no old stages or results", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  let cancelled = "";
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/lawyers/me": ME,
      "/service-categories": CATS,
      "/marketplace/me/achievements": { items: [] },
      "/marketplace/me/experience": {
        items: [],
        groups: [
          { root_id: "r1", current: rec({ id: "e1", root_id: "r1", status: "approved", version: 1, years: 6 }), pending_revision: rec({ id: "e3", root_id: "r1", status: "pending_review", version: 2, workplace: "Yangi joy" }), latest: rec({ id: "e3", root_id: "r1", status: "pending_review", version: 2 }), revision_count: 2 },
          { root_id: "r2", current: null, pending_revision: null, latest: rec({ id: "e2", root_id: "r2", category_id: "c2", workplace: "Meros byurosi", status: "rejected", rejection_reason: "Ish joyi hujjati yetishmaydi" }), revision_count: 1 },
        ],
      },
      "POST /marketplace/me/experience/e3/cancel": () => ((cancelled = "e3"), { status: "cancelled" }),
      "/service-categories/tree": [{ id: "c2", parent_id: null, title: "Мерос", children: [{ id: "c2-a", parent_id: "c2", title: "Vasiyatnoma", children: [] }] }],
      "POST /marketplace/me/experience/evidence": { id: "ev1", file_name: "mehnat-daftarchasi.pdf", mime_type: "application/pdf", size: 10 },
      "POST /marketplace/me/experience": (b: unknown) => ((sent = b as Record<string, unknown>), { id: "e9", status: "pending_review" }),
    }),
  );
  await page.goto("/ru/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
  const panel = page.locator(".exp:not(.ach):not(.exp--pre):not(.prc)");
  await expect(panel.locator(".exp__card").first()).toContainText("Adliya");
  await expect(panel).toContainText("Семья и брак");
  await expect(panel).toContainText("Подтверждён · 6 лет");
  await expect(panel).toContainText("Причина отказа: Ish joyi hujjati yetishmaydi");
  await expect(panel.locator(".exp__roles").first()).toContainText("Advokat");

  await panel.getByRole("button", { name: "Отменить проверку" }).click();
  await expect.poll(() => cancelled).toBe("e3");

  await panel.getByRole("button", { name: "Добавить опыт" }).first().click();
  const form = page.getByRole("dialog", { name: "Новый опыт" });
  await expect(form.locator("select")).toHaveCount(0);
  await form.getByRole("button", { name: /Категория/ }).click();
  await page.getByRole("listbox").getByRole("option").nth(1).click();
  await form.getByRole("radio", { name: "Vasiyatnoma" }).click();
  await form.getByLabel("Место работы").fill("Toshkent advokatlar hay'ati");
  await form.getByLabel("Должность", { exact: true }).first().fill("Yurist");
  await form.getByRole("radio", { name: "Работа завершена" }).first().click();
  await form.getByRole("combobox", { name: "Должность 1: Дата начала" }).fill("01.05.2015");
  await form.getByRole("combobox", { name: "Должность 1: Дата начала" }).press("Tab");
  await form.getByRole("combobox", { name: "Должность 1: Дата окончания" }).fill("31.12.2018");
  await form.getByRole("combobox", { name: "Должность 1: Дата окончания" }).press("Tab");
  // A second position in the same workplace, still held.
  await form.getByRole("button", { name: "Добавить должность" }).click();
  await form.getByLabel("Должность", { exact: true }).nth(1).fill("Advokat");
  await form.getByRole("combobox", { name: "Должность 2: Дата начала" }).fill("01.01.2019");
  await form.getByRole("combobox", { name: "Должность 2: Дата начала" }).press("Tab");
  // The old "which cases" and "results" pickers are gone.
  await expect(form.getByText("Первая инстанция")).toHaveCount(0);
  await form.getByLabel("Описание опыта").fill("Meros ishlari bo'yicha 25 ta ish, vasiyatnoma va ulush taqsimoti");
  // Why the files are worth it, and that they stay private.
  await expect(form.getByText("Остаётся конфиденциальным")).toBeVisible();
  await form.locator('input[type="file"]').setInputFiles({ name: "mehnat-daftarchasi.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(form).toContainText("mehnat-daftarchasi.pdf");
  await shot(page, "form");
  await form.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toMatchObject({
    source_id: null,
    category_id: "c2",
    subcategory_id: "c2-a",
    workplace: "Toshkent advokatlar hay'ati",
    positions: [
      { title: "Yurist", started_at: "2015-05-01T00:00:00Z", ended_at: "2018-12-31T00:00:00Z", is_current: false },
      { title: "Advokat", started_at: "2019-01-01T00:00:00Z", ended_at: null, is_current: true },
    ],
    evidence_ids: ["ev1"],
  });
  expect(sent).not.toHaveProperty("stages");
  expect(sent).not.toHaveProperty("results");
});

const reviewRoutes = (decisions: unknown[], rooms: string[]) => ({
  "/service-categories": CATS,
  "/call-center/marketplace/experience": { items: [rec({ id: "e9", root_id: "r1", source_id: "e1", status: "pending_review", version: 2, seller: { id: "u-adv", lexgo_id: "LGA-7K2Q", name: "Test Advokat", phone: "+998901112233", role: "advokat", account_status: "active" }, submitted_at: "2026-10-24T08:00:00Z" })], total: 1 },
  "/call-center/marketplace/experience/e9": {
    record: rec({ id: "e9", root_id: "r1", source_id: "e1", status: "pending_review", version: 2, workplace: "Yangi joy", evidence: [{ id: "ev1", file_name: "buyruq.pdf" }] }),
    previous_approved_revision: rec({ id: "e1", root_id: "r1", status: "approved", version: 1, workplace: "Eski joy" }),
    reviews: [],
    checklist_keys: ["identity_license", "position_1_dates", "evidence_1_readable", "file_authenticity"],
    // Point 6: the advocate in full, from the detail's `seller`.
    seller: { id: "u-adv", name: "Test Advokat", phone: "+998901112233", lexgo_id: "LGA-7K2Q", role: "advokat", account_status: "active" },
    // Gaps closed §12–13: the checklist with labels, and a labelled diff.
    checklist: [
      { key: "identity_license", label: "Shaxs va litsenziya", hint: "", label_i18n: { uz_latn: "Shaxs va litsenziya", ru: "Личность и лицензия" } },
      { key: "position_1_dates", label: "1-lavozim sanalari", hint: "", label_i18n: { uz_latn: "1-lavozim sanalari", ru: "Даты должности 1" } },
      { key: "evidence_1_readable", label: "1-fayl o'qiladi", hint: "", label_i18n: { uz_latn: "1-fayl o'qiladi", ru: "Файл 1 читается" } },
      { key: "file_authenticity", label: "Fayllar haqiqiy", hint: "Soxta emasligini tekshiring", label_i18n: { uz_latn: "Fayllar haqiqiy", ru: "Файлы подлинные" } },
    ],
    diff: [
      { field: "workplace", label: "Ish joyi", before: "Eski joy", after: "Yangi joy" },
      { field: "evidence", label: "Dalillar", before: [], after: [{ file_name: "buyruq.pdf" }] },
    ],
  },
  "POST /call-center/marketplace/experience/e9/review": (b: unknown) => (decisions.push(b), { status: "ok" }),
  "POST /call-center/marketplace/experience/e9/communication": () => (rooms.push("open"), { idempotent: false, room_id: "room-rev-1", messages_url: "/secure-chats/room-rev-1/messages", calls_url: "/secure-chats/room-rev-1/calls", call_types: ["audio", "video"], close_by_operator_only: true }),
  "POST /call-center/marketplace/experience/e9/communication/close": () => (rooms.push("close"), { event: "marketplace.review_chat_closed", record_id: "e9", room_id: "room-rev-1", status: "read_only" }),
});

test("the call center sees what changed, ticks every item, then approves", async ({ page }) => {
  const decisions: unknown[] = [];
  await mockBackend(page, await signIn(page, CALL_CENTER, reviewRoutes(decisions, [])));
  await page.goto("/ru/admin/call-center?tab=experience");
  await page.getByRole("button", { name: /Test Advokat/ }).click();
  const box = page.locator(".vrf");
  // Field by field: the old workplace struck out, the new one marked.
  // The category name loads after the record and still shows.
  await expect(box.locator(".vrf__facts")).toContainText("Семья и брак");
  await expect(box.locator(".vrf__diff del")).toHaveText("Eski joy");
  await expect(box.locator(".vrf__diff ins")).toHaveText(["Yangi joy", "buyruq.pdf"]);
  // The backend's labels, in the page's language — never the raw key.
  await expect(box).toContainText("Даты должности 1");
  await expect(box).toContainText("Файл 1 читается");
  await expect(box.locator(".vrf__diff b").first()).toHaveText("Ish joyi");
  const who = box.locator(".vrf__seller");
  await expect(who).toContainText("Test Advokat");
  await expect(who).toContainText("LGA-7K2Q");
  await expect(who).toContainText("Адвокат");
  await expect(who.getByRole("link", { name: "+998901112233" })).toHaveAttribute("href", "tel:+998901112233");
  expect(await box.innerText()).not.toMatch(/position_1_dates|evidence_1_readable/);
  await shot(page, "review");
  const approve = box.getByRole("radio", { name: /^Подтвердить/ });
  await expect(approve).toBeDisabled();
  for (const g of await box.locator(".vrf__v").all()) await g.getByRole("radio", { name: "Да" }).click();
  await expect(approve).toBeEnabled();
  await box.locator(".vrf__v").last().getByRole("radio", { name: "Нет" }).click();
  await expect(approve).toBeDisabled();
  await box.locator(".vrf__v").last().getByRole("radio", { name: "Не относится" }).click();
  await approve.click();
  await box.getByRole("button", { name: "Подтвердить" }).click();
  await expect.poll(() => decisions.length).toBe(1);
  const d = decisions[0] as { decision: string; checklist: { key: string; verdict: string }[] };
  expect(d.decision).toBe("approved");
  expect(d.checklist.map((c) => c.verdict)).toEqual(["approved", "approved", "approved", "not_applicable"]);
});

test("asking for changes needs a reason; the review chat opens and only the operator closes it", async ({ page }) => {
  const decisions: unknown[] = [];
  const rooms: string[] = [];
  await mockBackend(page, await signIn(page, CALL_CENTER, reviewRoutes(decisions, rooms)));
  await page.goto("/ru/admin/call-center?tab=experience");
  await page.getByRole("button", { name: /Test Advokat/ }).click();
  const box = page.locator(".vrf");
  await box.getByRole("button", { name: "Открыть чат" }).click();
  await expect(box.locator(".vrf__room")).toContainText("Чат открыт");
  await expect(box.getByRole("link", { name: "Перейти в чат" })).toHaveAttribute("href", /room-rev-1/);
  await box.getByRole("button", { name: "Закрыть чат" }).click();
  await expect(box.locator(".vrf__room")).toContainText("Чат закрыт");
  await expect(box.getByRole("link", { name: "Посмотреть историю" })).toBeVisible();
  expect(rooms).toEqual(["open", "close"]);

  await box.getByRole("radio", { name: /^Запросить правки/ }).click();
  const send = box.getByRole("button", { name: "Вернуть на правки" });
  await expect(send).toBeDisabled();
  await box.getByRole("textbox").last().fill("Iltimos, buyruq nusxasini yuklang");
  await expect(send).toBeEnabled();
  await send.click();
  await expect.poll(() => decisions.length).toBe(1);
  expect(decisions[0]).toMatchObject({ decision: "changes_requested", reason: "Iltimos, buyruq nusxasini yuklang" });
});

// Final contract 2026-10-29 §2: the config with the backend's labels.
const L = (uz: string, ru: string, en: string) => ({ label: uz, title: uz, label_i18n: { uz_latn: uz, ru, en } });
const ACH_CONFIG = {
  process_stages: [
    { value: "pre_investigation", ...L("Tergovga qadar tekshiruv", "Доследственная проверка", "Pre-investigation review") },
    { value: "inquiry", ...L("Surishtiruv", "Дознание", "Inquiry") },
    { value: "preliminary_investigation", ...L("Dastlabki tergov", "Предварительное следствие", "Preliminary investigation") },
    { value: "court", ...L("Sud jarayoni", "Судебный процесс", "Court proceedings") },
  ],
  result_scopes: [
    { value: "full", ...L("To‘liq ijobiy natija", "Полный положительный результат", "Full positive result") },
    { value: "partial", ...L("Qisman ijobiy natija", "Частичный положительный результат", "Partial positive result") },
  ],
  evidence: { required: true, min_files: 1, max_files: 20, max_file_size_bytes: 20971520, allowed_mime_types: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"], allowed_extensions: [".docx", ".jpg", ".pdf", ".png"] },
  description: { min_length: 5, max_length: 5000 },
  warning: "Faqat haqiqiy va o'zingizga tegishli hujjatlarni yuklang.",
  warning_i18n: { uz_latn: "Faqat haqiqiy va o'zingizga tegishli hujjatlarni yuklang.", ru: "Загружайте только подлинные документы, относящиеся к вам.", en: "Upload only genuine documents of your own." },
  public_fields: ["process_stage", "result_scope", "category", "year", "public_description", "lexgo_verified"],
  workflow: ["evidence_upload", "submission", "ai_advisory_analysis", "operator_review", "public_profile"],
};
const ach = (extra: Record<string, unknown>) => ({ process_stage: "court", result_scope: "full", category_id: "c1", category_title: "Оила ва никоҳ", achieved_at: "2025-12-20", description: "Sud bosqichida to'liq oqlov hukmi", public_description: "", version: 1, evidence: [], ai_analysis_status: "completed", rejection_reason: "", ...extra });
const group = (a: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ root_id: a.root_id, current: a.status === "approved" ? a : null, pending_revision: null, latest: a, revision_count: 1, ...extra });

test("an advocate adds an achievement from the backend's config", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  const a1 = ach({ id: "a1", root_id: "a1", status: "approved" });
  const a3 = ach({ id: "a3", root_id: "a3", status: "changes_requested", process_stage: "inquiry", result_scope: "partial", rejection_reason: "Qaror nusxasi o'qilmaydi" });
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/lawyers/me": ME,
      "/service-categories": CATS,
      "/marketplace/me/experience": { items: [], groups: [] },
      "/marketplace/me/achievements/config": ACH_CONFIG,
      "/marketplace/me/achievements": { items: [], groups: [group(a1), group(a3)], total: 2, total_records: 2, count: 2, limit: 50, offset: 0, has_more: false },
      "POST /marketplace/me/achievements/evidence": { status: 201, json: { id: "av1", file_name: "qaror.pdf", mime_type: "application/pdf", size: 8, download_url: "/marketplace/achievements/evidence/av1" } },
      "POST /marketplace/me/achievements": (b: unknown) => ((sent = b as Record<string, unknown>), { status: 201, json: { id: "a2", status: "ai_analysis_pending" } }),
    }),
  );
  await page.goto("/ru/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
  const panel = page.locator(".ach");
  // The backend's own labels in the page's language.
  await expect(panel).toContainText("Судебный процесс");
  await expect(panel).toContainText("Полный положительный результат");
  await expect(panel).toContainText("Нужна доработка");
  await expect(panel).toContainText("Комментарий оператора: Qaror nusxasi o'qilmaydi");
  await expect(panel).toContainText("Анализ ИИ — только рекомендация");
  // The workflow track, every step with its icon; the approved one is done.
  await expect(panel.locator(".ach__track").first().locator("li")).toHaveCount(5);
  await expect(panel.locator(".ach__track").first().locator("li i svg")).toHaveCount(5);
  // Never the price, never a raw key.
  expect(await panel.innerText()).not.toMatch(/цена|цены|ценообраз|стоимост|court|changes_requested|ai_analysis|operator_review/i);
  await panel.getByRole("button", { name: "Добавить достижение" }).first().click();
  const form = page.getByRole("dialog", { name: "Новое достижение" });
  await expect(form.locator("select, input[type=date], input[type=checkbox]")).toHaveCount(0);
  // Exactly the config's four stages and two results; no court-instance field.
  await expect(form.locator(".ach__type")).toHaveCount(4);
  await expect(form.locator(".ach__res")).toHaveCount(2);
  await expect(form.getByText(/инстанц/i)).toHaveCount(0);
  await form.getByRole("radio", { name: /Судебный процесс/ }).click();
  await form.getByRole("radio", { name: "Частичный положительный результат" }).click();
  await form.getByRole("button", { name: /Категория услуг/ }).click();
  await page.getByRole("listbox").getByRole("option").nth(1).click();
  await form.getByRole("combobox", { name: "Дата результата" }).fill("15.03.2026");
  await form.getByRole("combobox", { name: "Дата результата" }).press("Tab");
  await form.getByLabel("Описание результата").fill("Apellyatsiyada jazo yengillashtirildi");
  // A file the config refuses never leaves the page; a good one uploads.
  await form.locator('input[type="file"]').setInputFiles({ name: "video.mp4", mimeType: "video/mp4", buffer: Buffer.from("x") });
  await expect(form.locator(".ach__files li[data-state=error]")).toContainText("Такой тип файла не принимается");
  await form.locator(".ach__files li[data-state=error]").getByRole("button").click();
  await form.locator('input[type="file"]').setInputFiles({ name: "qaror.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(form.locator(".ach__files li[data-state=done]")).toContainText("qaror.pdf");
  // The backend's warning, in the page's language, right above the send button.
  await expect(page.locator(".amodal__f .ach__warn")).toHaveText(ACH_CONFIG.warning_i18n.ru);
  await shot(page, "achievement-form");
  await page.locator(".amodal__f").getByRole("button", { name: "Отправить на проверку" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toEqual({ source_id: null, process_stage: "court", result_scope: "partial", category_id: "c2", achieved_at: "2026-03-15", description: "Apellyatsiyada jazo yengillashtirildi", evidence_ids: ["av1"] });
});

const CHECKS = [
  ["type_and_date", "Turi va sanasi", "Тип и дата"],
  ["evidence_supports_claim", "Dalillar ma’lumotni tasdiqlaydi", "Доказательства подтверждают сведения"],
  ["category_relevance", "Kategoriyaga mosligi", "Соответствие категории"],
  ["public_confidentiality", "Ommaviy matnda maxfiylik", "Конфиденциальность публичного текста"],
  ["authenticity", "Hujjat haqiqiyligi", "Подлинность документа"],
  ["verifier_conclusion", "Tekshiruvchi xulosasi", "Заключение проверяющего"],
].map(([key, uz, ru]) => ({ key, label: uz, hint: uz, label_i18n: { uz_latn: uz, ru } }));
const ccAch = (decided: unknown[], record: Record<string, unknown>, ai: Record<string, unknown>) => ({
  "/service-categories": CATS,
  "/call-center/marketplace/achievements": { items: [{ ...record, seller: { id: "u-adv", lexgo_id: "LGA-7K2Q", name: "Test Advokat", phone: "+998901112233", role: "advokat", account_status: "active" }, submitted_at: "2026-10-28T08:00:00Z" }], total: 1, count: 1, limit: 50, offset: 0, has_more: false },
  "/call-center/marketplace/achievements/a2": {
    record: { ...record, evidence: [{ id: "av1", file_name: "qaror.pdf", download_url: "/marketplace/achievements/evidence/av1" }] },
    seller: { id: "u-adv", name: "Test Advokat", phone: "+998901112233", lexgo_id: "LGA-7K2Q", role: "advokat", account_status: "active" },
    previous_approved_revision: null,
    diff: [],
    history: [],
    reviews: [],
    ai_analysis: ai,
    risk_catalog: [{ code: "date_mismatch", label: "Sana mos emas", label_i18n: { uz_latn: "Sana mos emas", ru: "Дата не совпадает" } }],
    checklist_keys: CHECKS.map((c) => c.key),
    checklist: CHECKS,
    communication: {},
    ai_advisory_only: true,
    final_decision_by: "operator",
  },
  "POST /call-center/marketplace/achievements/a2/review": (b: unknown) => (decided.push(b), { status: "approved" }),
});
const AI = { status: "completed", analysis_type: "achievement", document_readable: true, claim_supported: true, stage_matches: true, result_scope_matches: false, authenticity_confidence: 0.82, manipulation_risk: 0.04, ai_generated_risk: 0.4, risk_level: "medium", risk_codes: ["date_mismatch", "code_without_label"], risk_items: [], signature_detection: { signature: true, seal: false, electronic_signature: false }, pii_detected: ["phone"], operator_notes: ["Sanani qaror bilan solishtiring"], extracted_fields: {}, final_decision: "operator_required", reason: "" };

test("the call center weighs the risk indicators and approves with a safe public text", async ({ page }) => {
  const decided: unknown[] = [];
  const record = { id: "a2", root_id: "r2", status: "pending_review", process_stage: "court", result_scope: "partial", category_id: "c1", category_title: "Оила ва никоҳ", achieved_at: "2026-03-15", description: "Apellyatsiyada jazo yengillashtirildi", version: 1 };
  await mockBackend(page, await signIn(page, CALL_CENTER, ccAch(decided, record, AI)));
  await page.goto("/ru/admin/call-center?tab=achievements");
  await page.getByRole("button", { name: /Test Advokat/ }).click();
  const box = page.locator(".vrf");
  await expect(box.locator(".vrf__facts")).toContainText("Судебный процесс");
  const risk = box.locator(".vrf__ai");
  await expect(risk).toContainText("Индикаторы риска");
  await expect(risk).toContainText("не вердикт");
  // A risk shows with the backend's label; a code without one is left out.
  await expect(risk.locator(".vrf__codes li")).toHaveText(["Дата не совпадает"]);
  await expect(risk).toContainText("82%");
  await expect(risk).toContainText("40%");
  // The backend's checklist labels.
  await expect(box).toContainText("Доказательства подтверждают сведения");
  expect(await box.innerText()).not.toMatch(/date_mismatch|code_without_label|type_and_date|evidence_supports_claim|pending_review|phone/);
  await shot(page, "achievement-review");
  for (const g of await box.locator(".vrf__v").all()) await g.getByRole("radio", { name: "Да" }).click();
  await box.getByRole("radio", { name: /^Подтвердить/ }).click();
  const send = box.getByRole("button", { name: "Подтвердить" });
  // No safe public text, no approval.
  await expect(send).toBeDisabled();
  await box.locator(".vrf__public textarea").fill("Sud bosqichida jazo yengillashtirildi");
  await expect(send).toBeEnabled();
  await send.click();
  await expect.poll(() => decided.length).toBe(1);
  expect(decided[0]).toEqual({
    decision: "approve",
    reason: "",
    public_description: "Sud bosqichida jazo yengillashtirildi",
    checklist: CHECKS.map((c) => ({ key: c.key, verdict: "approved", note: "" })),
  });
});

test("no decision while the software is still reading the files", async ({ page }) => {
  const record = { id: "a2", root_id: "r2", status: "ai_analysis_pending", process_stage: "inquiry", result_scope: "full", category_id: "c1", achieved_at: "2026-03-15", description: "Ish to'xtatildi", version: 1 };
  await mockBackend(page, await signIn(page, CALL_CENTER, ccAch([], record, { ...AI, status: "processing" })));
  await page.goto("/ru/admin/call-center?tab=achievements");
  await page.getByRole("button", { name: /Test Advokat/ }).click();
  const box = page.locator(".vrf");
  await expect(box.locator(".vrf__blocked")).toContainText("ещё проверяются программой");
  for (const d of ["Подтвердить", "Запросить правки", "Отклонить"]) await expect(box.getByRole("radio", { name: new RegExp(`^${d}`) })).toBeDisabled();
});

test("the public profile shows the operator-approved text only, never the private one", async ({ page }) => {
  await mockBackend(page, {
    "/marketplace/lawyers": { items: [{ user_id: "u-adv", name: "Test Advokat", seller_type: "advokat", is_verified: true }], total: 1 },
    "/marketplace/lawyers/u-adv": { user_id: "u-adv", name: "Test Advokat", seller_type: "advokat", rating: 4.8, reviews_count: 3, is_verified: true },
    "/marketplace/lawyers/u-adv/services": { items: [] },
    "/marketplace/lawyers/u-adv/achievements": { items: [{ id: "a1", process_stage: "court", result_scope: "full", category_id: "c1", category_title: "Oila ishlari", year: 2025, achieved_at: "2025-12-20", public_description: "Sud bosqichida to'liq ijobiy natija", description: "Maxfiy: mijoz Aliyev, ish raqami 12-345", lexgo_verified: true, verified_at: "2026-01-10T09:00:00Z" }], total: 1, count: 1, limit: 20, offset: 0, has_more: false },
  });
  await page.goto("/uz/lawyers/u-adv");
  const panel = page.locator(".mk-ach");
  await expect(panel).toContainText("Sud jarayoni", { timeout: 20000 });
  await expect(panel).toContainText("To'liq ijobiy natija");
  await expect(panel).toContainText("Sud bosqichida to'liq ijobiy natija");
  await expect(panel).not.toContainText("Maxfiy");
  await expect(panel).toContainText("LexGo tasdiqlagan");
  await expect(panel.locator("a, button")).toHaveCount(0);
});
