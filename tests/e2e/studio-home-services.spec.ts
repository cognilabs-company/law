import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import studio from "./fixtures/studio-k31.json";

// Studio home (TSK-195678): active and unfinished services as two cards;
// the active card lists every service, the unfinished card only the ones
// left part-way, each row continued or viewed.
const rec = (id: string, title: string, status: string, source = "studio") => ({ id, title, status, source, studio_object_id: `obj-${id}`, constructor_code: "K02", updated_at: "2026-10-24T08:00:00Z", actions: {} });

test("the service cards open all services and only the unfinished ones", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/studio/constructors": studio.constructors,
    "/studio/objects/summary": {
      by_status: { published: 3, draft: 2 },
      by_constructor: { K02: 5 },
      by_constructor_detail: [],
      entity_cards: [{ key: "services", constructor_code: "K02", title: "Xizmatlar", total: 5, active_count: 3, incomplete_count: 2, studio_object_incomplete_count: 2, journey_incomplete_count: 0 }],
    },
    "/studio/journeys": { items: [] },
    "/studio/constructors/K02/records": (_b: unknown, url: URL) =>
      url.searchParams.get("status") === "draft"
        ? { items: [rec("d1", "Meros chala", "draft"), rec("d2", "Ajrashish chala", "draft")], total: 2 }
        : { items: [rec("p1", "Mehnat nizosi", "published", "runtime"), rec("p2", "Ijara", "published", "runtime"), rec("p3", "Kredit", "published", "runtime"), rec("d1", "Meros chala", "draft"), rec("d2", "Ajrashish chala", "draft")], total: 5 },
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/studio");
  const active = page.getByRole("button", { name: /Активные услуги: 3/ });
  const unfinished = page.getByRole("button", { name: /Незавершённые: 2/ });
  await expect(active).toBeVisible();
  await expect(unfinished).toBeVisible();

  await active.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Mehnat nizosi").first()).toBeVisible();
  await expect(dialog.getByText("Meros chala").first()).toBeVisible();
  // A published service is opened to look at; a draft is carried on.
  const view = dialog.getByRole("link", { name: /Открыть.*Mehnat nizosi/ });
  await expect(view).toHaveAttribute("href", /\/admin\/studio\/o\/obj-p1/);
  await expect(dialog.getByRole("link", { name: /Meros chala/ }).first()).toHaveAttribute("href", /\/admin\/studio\/o\/obj-d1/);
  await page.keyboard.press("Escape");

  await unfinished.click();
  await expect(dialog.getByText("Meros chala").first()).toBeVisible();
  await expect(dialog.getByText("Mehnat nizosi")).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: /Meros chala/ }).first()).toHaveAttribute("href", /\/admin\/studio\/o\/obj-d1/);
});
