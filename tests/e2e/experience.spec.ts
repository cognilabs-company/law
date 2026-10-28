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
  const panel = page.locator(".exp:not(.ach)");
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
  "/call-center/marketplace/experience": { items: [rec({ id: "e9", root_id: "r1", source_id: "e1", status: "pending_review", version: 2, seller_name: "Test Advokat", submitted_at: "2026-10-24T08:00:00Z" })], total: 1 },
  "/call-center/marketplace/experience/e9": {
    record: rec({ id: "e9", root_id: "r1", source_id: "e1", status: "pending_review", version: 2, workplace: "Yangi joy", evidence: [{ id: "ev1", file_name: "buyruq.pdf" }] }),
    previous_approved_revision: rec({ id: "e1", root_id: "r1", status: "approved", version: 1, workplace: "Eski joy" }),
    reviews: [],
    checklist_keys: ["identity_license", "position_1_dates", "evidence_1_readable", "file_authenticity"],
  },
  "POST /call-center/marketplace/experience/e9/review": (b: unknown) => (decisions.push(b), { status: "ok" }),
  "POST /call-center/marketplace/experience/e9/communication": () => (rooms.push("open"), { room_id: "room-rev-1", status: "open" }),
  "POST /call-center/marketplace/experience/e9/communication/close": () => (rooms.push("close"), { room_id: "room-rev-1", status: "closed", read_only: true }),
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
  // Dynamic keys get human names, numbered — never the raw key.
  await expect(box).toContainText("Даты должности · 1");
  await expect(box).toContainText("Файл читается · 1");
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

test("a lawyer adds an achievement; the call center reviews it", async ({ page, browser }) => {
  let sent: Record<string, unknown> | null = null;
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/lawyers/me": ME,
      "/service-categories": CATS,
      "/marketplace/me/experience": { items: [] },
      "/marketplace/me/achievements": { items: [{ id: "a1", root_id: "a1", status: "approved", achievement_type: "award_recognition", title: "Yil advokati — 2025", achieved_at: "2025-12-20T00:00:00Z", description: "Advokatlar palatasi mukofoti" }] },
      "POST /marketplace/me/achievements/evidence": { id: "av1", file_name: "sertifikat.png" },
      "POST /marketplace/me/achievements": (b: unknown) => ((sent = b as Record<string, unknown>), { id: "a2", status: "pending_review" }),
    }),
  );
  await page.goto("/ru/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
  const ach = page.locator(".ach");
  await expect(ach).toContainText("Yil advokati — 2025");
  await expect(ach).toContainText("Награды и признание");
  await ach.getByRole("button", { name: "Добавить достижение" }).first().click();
  const form = page.getByRole("dialog", { name: "Новое достижение" });
  await form.getByRole("radio", { name: /^Квалификация и сертификат/ }).click();
  await form.getByLabel("Название").fill("Mediator sertifikati");
  await form.getByRole("combobox", { name: "Дата" }).fill("15.03.2024");
  await form.getByRole("combobox", { name: "Дата" }).press("Tab");
  await form.getByLabel("Суть").fill("Xalqaro mediatsiya kursini tamomladim");
  await expect(form).toContainText("Доказательства конфиденциальны");
  await form.locator('input[type="file"]').setInputFiles({ name: "sertifikat.png", mimeType: "image/png", buffer: Buffer.from("png") });
  await expect(form).toContainText("sertifikat.png");
  await shot(page, "achievement-form");
  await form.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toEqual({ source_id: null, achievement_type: "qualification_certification", title: "Mediator sertifikati", achieved_at: "2024-03-15T00:00:00Z", description: "Xalqaro mediatsiya kursini tamomladim", evidence_ids: ["av1"] });

  const cc = await browser.newPage();
  const decided: unknown[] = [];
  await mockBackend(
    cc,
    await signIn(cc, CALL_CENTER, {
      "/call-center/marketplace/achievements": { items: [{ id: "a2", status: "pending_review", achievement_type: "qualification_certification", title: "Mediator sertifikati", seller_name: "Test Advokat", submitted_at: "2026-10-28T08:00:00Z" }], total: 1 },
      "/call-center/marketplace/achievements/a2": { record: { id: "a2", status: "pending_review", achievement_type: "qualification_certification", title: "Mediator sertifikati", achieved_at: "2024-03-15T00:00:00Z", description: "Xalqaro mediatsiya kursi", evidence: [{ id: "av1", file_name: "sertifikat.png" }] }, checklist_keys: ["achievement_evidence", "public_safe"], reviews: [] },
      "POST /call-center/marketplace/achievements/a2/review": (b: unknown) => (decided.push(b), { status: "approved" }),
    }),
  );
  await cc.goto("/ru/admin/call-center?tab=achievements");
  await cc.getByRole("button", { name: /Test Advokat/ }).click();
  const box = cc.locator(".vrf");
  await expect(box).toContainText("Квалификация и сертификат");
  await expect(box).toContainText("Это первая отправка");
  for (const g of await box.locator(".vrf__v").all()) await g.getByRole("radio", { name: "Да" }).click();
  await box.getByRole("radio", { name: /^Подтвердить/ }).click();
  await box.getByRole("button", { name: "Подтвердить" }).click();
  await expect.poll(() => decided.length).toBe(1);
  expect(decided[0]).toMatchObject({ decision: "approved", checklist: [{ key: "achievement_evidence", verdict: "approved" }, { key: "public_safe", verdict: "approved" }] });
  await cc.close();
});

test("the public profile shows verified achievements only, with no evidence", async ({ page }) => {
  await mockBackend(page, {
    "/marketplace/lawyers": { items: [{ user_id: "u-adv", name: "Test Advokat", seller_type: "advokat", is_verified: true }], total: 1 },
    "/marketplace/lawyers/u-adv": { user_id: "u-adv", name: "Test Advokat", seller_type: "advokat", rating: 4.8, reviews_count: 3, is_verified: true },
    "/marketplace/lawyers/u-adv/services": { items: [] },
    "/marketplace/lawyers/u-adv/achievements": { items: [{ id: "a1", achievement_type: "award_recognition", title: "Yil advokati — 2025", achieved_at: "2025-12-20T00:00:00Z", description: "Advokatlar palatasi mukofoti" }] },
  });
  await page.goto("/uz/lawyers/u-adv");
  const panel = page.locator(".mk-ach");
  await expect(panel).toContainText("Yil advokati — 2025", { timeout: 20000 });
  await expect(panel).toContainText("Mukofot va e'tirof");
  await expect(panel.locator("a, button")).toHaveCount(0);
});
