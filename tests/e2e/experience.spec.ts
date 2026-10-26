import { expect, test } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, mockBackend, signIn } from "./mock";

// Experience per category (TSK-659111): a lawyer's edit is a pending
// revision while the approved one stays; the call center compares it with
// the approved version and decides item by item.
const ME = { lawyer_name: "Test Advokat", region: "tashkent", bio: "", languages: ["uz"], specializations: [], experience_years: 8 };
const CATS = [{ id: "c1", name: "Оила ва никоҳ", slug: "oila-va-nikoh" }, { id: "c2", name: "Мерос", slug: "meros" }];
const rec = (extra: Record<string, unknown>) => ({ category_id: "c1", workplace: "Adliya", position: "Advokat", started_at: "2018-03-01T00:00:00Z", ended_at: null, stages: ["first_instance"], results: ["full_success"], evidence: [], ...extra });

test("a lawyer sees grouped revisions, cancels a pending one and submits a typed record with evidence", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  let cancelled = "";
  const routes = await signIn(page, ADVOCATE, {
    "/lawyers/me": ME,
    "/service-categories": CATS,
    "/marketplace/me/experience": {
      items: [],
      groups: [
        { root_id: "r1", current: rec({ id: "e1", root_id: "r1", status: "approved", version: 1, years: 6 }), pending_revision: rec({ id: "e3", root_id: "r1", status: "pending_review", version: 2, workplace: "Yangi joy" }), latest: rec({ id: "e3", root_id: "r1", status: "pending_review", version: 2 }), revision_count: 2 },
        { root_id: "r2", current: null, pending_revision: null, latest: rec({ id: "e2", root_id: "r2", category_id: "c2", status: "rejected", rejection_reason: "Ish joyi hujjati yetishmaydi" }), revision_count: 1 },
      ],
    },
    "POST /marketplace/me/experience/e3/cancel": () => ((cancelled = "e3"), { status: "cancelled" }),
    "/service-categories/tree": [{ id: "c2", parent_id: null, title: "Мерос", children: [{ id: "c2-a", parent_id: "c2", title: "Vasiyatnoma", children: [] }] }],
    "POST /marketplace/me/experience/evidence": { id: "ev1", file_name: "proof.pdf", mime_type: "application/pdf", size: 10 },
    "POST /marketplace/me/experience": (b: unknown) => ((sent = b as Record<string, unknown>), { id: "e9", status: "pending_review" }),
  });
  await mockBackend(page, routes);
  await page.goto("/ru/portal/advocate/profile");
  await page.getByRole("tab").nth(1).click();
  const panel = page.locator(".exp");
  await expect(panel).toContainText("Семья и брак");
  await expect(panel).toContainText("Подтверждён · 6 лет");
  await expect(panel).toContainText("На проверке");
  await expect(panel).toContainText("до подтверждения действуют прежние");
  await expect(panel).toContainText("Причина отказа: Ish joyi hujjati yetishmaydi");
  await expect(panel).toContainText("Первая инстанция");

  await panel.getByRole("button", { name: "Отменить проверку" }).click();
  await expect.poll(() => cancelled).toBe("e3");

  // The form opens as a dialog (25 Oct 2026); dates go through the app's
  // date picker, typed as dd.mm.yyyy.
  await panel.getByRole("button", { name: "Добавить опыт" }).first().click();
  const form = page.getByRole("dialog", { name: "Новый опыт" });
  // The app's own dropdown and choice chips, not browser controls (26 Oct 2026).
  await expect(form.locator("select")).toHaveCount(0);
  await form.getByRole("button", { name: /Категория/ }).click();
  await page.getByRole("listbox").getByRole("option").nth(1).click(); // c2, shown by its localized name
  await form.getByRole("radio", { name: "Vasiyatnoma" }).click();
  await form.getByLabel("Место работы").fill("Toshkent advokatlar hay'ati");
  await form.getByLabel("Должность").fill("Advokat");
  await form.getByRole("combobox", { name: "Дата начала" }).fill("01.05.2019");
  await form.getByRole("combobox", { name: "Дата начала" }).press("Tab");
  await form.getByText("Апелляция").click();
  await form.getByText("Мировое соглашение").click();
  await form.getByLabel("Описание опыта").fill("Meros ishlari bo'yicha 25 ta ish, ulardan 18 tasi sudda to'liq yutilgan");
  await form.locator('input[type="file"]').setInputFiles({ name: "proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(form).toContainText("proof.pdf");
  await form.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toMatchObject({ source_id: null, category_id: "c2", subcategory_id: "c2-a", workplace: "Toshkent advokatlar hay'ati", started_at: "2019-05-01T00:00:00Z", ended_at: null, is_current: true, stages: ["appeal"], results: ["settlement"], evidence_ids: ["ev1"] });
  expect(sent).not.toHaveProperty("years");
});

test("the call center compares with the approved version and approves only a complete checklist", async ({ page }) => {
  const decisions: unknown[] = [];
  const routes = await signIn(page, CALL_CENTER, {
    "/service-categories": CATS,
    "/call-center/marketplace/experience": { items: [rec({ id: "e9", root_id: "r1", source_id: "e1", status: "pending_review", version: 2, seller_name: "Test Advokat", submitted_at: "2026-10-24T08:00:00Z" })], total: 1 },
    "/call-center/marketplace/experience/e9": {
      record: rec({ id: "e9", root_id: "r1", source_id: "e1", status: "pending_review", version: 2, workplace: "Yangi joy" }),
      previous_approved_revision: rec({ id: "e1", root_id: "r1", status: "approved", version: 1, workplace: "Eski joy" }),
      reviews: [],
      checklist_keys: ["identity_license", "workplace_position", "dates_duration", "category_relevance", "court_investigation_evidence", "duplicates_conflicts", "file_authenticity", "category_test", "verifier_conclusion"],
    },
    "POST /call-center/marketplace/experience/e9/review": (b: unknown) => (decisions.push(b), { status: "approved" }),
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/call-center?tab=experience");
  await page.getByRole("button", { name: /Test Advokat/ }).click();
  await expect(page.getByText("Yangi joy")).toBeVisible();
  await expect(page.getByText("Eski joy")).toBeVisible();
  const box = page.locator(".xpr__detail");
  const approve = box.getByRole("button", { name: "Подтвердить" });
  await expect(approve).toBeDisabled();
  for (const group of await box.getByRole("radiogroup").all()) await group.getByText("Подтверждено", { exact: true }).click();
  await expect(approve).toBeEnabled();
  await box.getByRole("radiogroup", { name: "Подлинность файлов" }).getByText("Отклонено").click();
  await expect(approve).toBeDisabled();
  await box.getByRole("radiogroup", { name: "Подлинность файлов" }).getByText("Подтверждено", { exact: true }).click();
  await box.getByRole("radiogroup", { name: "Результат теста по категории" }).getByText("Не относится").click();
  await approve.click();
  await expect.poll(() => decisions.length).toBe(1);
  const d = decisions[0] as { decision: string; checklist: { key: string; verdict: string }[] };
  expect(d.decision).toBe("approved");
  expect(d.checklist).toHaveLength(9);
  expect(d.checklist.find((c) => c.key === "category_test")?.verdict).toBe("not_applicable");
});
