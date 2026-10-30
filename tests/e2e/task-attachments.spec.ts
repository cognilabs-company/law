import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// TSK-323073: a task's attached images show as thumbnails in its detail,
// fetched with the signed-in token from preview_url; tapping one opens the
// full viewer; a picture that fails to load says so and can be retried;
// other files are rows to download; a task without files says it has none.

// A real 2×2 PNG, so the browser actually decodes the thumbnail.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEIGBkYGBgAAA4NAgEbYbZYAAAAAElFTkSuQmCC", "base64");

const task = (attachments: unknown[]) => ({
  id: "2",
  task_code: "TSK-2",
  title: "Vazifa 2",
  description: "Tavsif",
  status: "in_progress",
  deadline_at: "2026-11-12T13:00:00Z",
  lock_version: 3,
  assignees: [],
  history: [],
  attachments,
  attachments_count: attachments.length,
  actions: { can_edit: true, can_assign: true, can_delete: true, can_change_status: true, next_statuses: [], is_assigned: false },
  created_at: "2026-10-23T12:00:00Z",
  updated_at: "2026-10-23T12:00:00Z",
});
const IMG = (id: string, name: string) => ({ id, file_name: name, mime_type: "image/png", size_bytes: 2048, kind: "image", preview_supported: true, preview_url: `/task-management/2/attachments/${id}/file?disposition=inline`, download_url: `/task-management/2/attachments/${id}/file?disposition=attachment`, uploader: { id: "u-k", name: "Kamron" }, created_at: "2026-10-23T12:00:00Z" });
const PDF = { id: "d1", file_name: "talablar.pdf", mime_type: "application/pdf", size_bytes: 40960, kind: "document", preview_supported: false, download_url: "/task-management/2/attachments/d1/file?disposition=attachment", created_at: "2026-10-23T12:00:00Z" };

async function open(page: Page, attachments: unknown[]) {
  const t = task(attachments);
  const mock = await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/task-management/meta": { statuses: [{ value: "in_progress" }] },
      "/task-management/stats": {},
      "/task-management/users": { items: [] },
      "/task-management": { items: [t], total: 1, counts: {} },
      "/task-management/2": t,
      "/task-management/2/history": { items: [] },
    }),
  );
  // Registered after the mock, so these answer first: one image as real
  // bytes, the other broken until it is retried.
  let brokenTries = 0;
  const auth: string[] = [];
  await page.route(/\/task-management\/2\/attachments\/i1\/file/, (r) => (auth.push(r.request().headers().authorization ?? ""), r.fulfill({ status: 200, contentType: "image/png", body: PNG })));
  await page.route(/\/task-management\/2\/attachments\/i2\/file/, (r) => (++brokenTries === 1 ? r.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"Not Found"}' }) : r.fulfill({ status: 200, contentType: "image/png", body: PNG })));
  await page.goto("/ru/admin/team-tasks");
  await page.getByRole("button", { name: "Открыть задачу TSK-2 — Vazifa 2" }).click();
  return { mock, auth, tries: () => brokenTries };
}

test("images show as thumbnails, open in the viewer, a failed one retries; files download", async ({ page }) => {
  const { auth, tries } = await open(page, [IMG("i1", "ekran-1.png"), IMG("i2", "ekran-2.png"), PDF]);
  const att = page.getByRole("region", { name: "Вложения" }).or(page.locator(".ttk-att")).first();
  await expect(att.locator(".ttk-att__n")).toHaveText("3");
  const first = att.locator(".ttk-att__th").filter({ hasText: "ekran-1.png" });
  await expect(first.locator("img")).toBeVisible();
  // Visible means it has a box; the blob may still be decoding.
  await expect.poll(() => first.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2);
  // Fetched with the signed-in token, shown from a blob — never a public link.
  expect(auth[0]).toBe("Bearer test-token");
  expect(await first.locator("img").getAttribute("src")).toMatch(/^blob:/);
  // The broken one says so and comes back on retry.
  const second = att.locator(".ttk-att__th").filter({ hasText: "ekran-2.png" });
  await expect(second).toContainText("Не удалось загрузить изображение");
  await second.getByRole("button", { name: "Повторить" }).click();
  await expect(second.locator("img")).toBeVisible();
  expect(tries()).toBe(2);
  // The document is a row to download, not a thumbnail.
  await expect(att.locator(".ttk-att__file")).toContainText("talablar.pdf");
  await expect(att.getByRole("button", { name: "talablar.pdf — скачать" })).toBeVisible();

  await first.getByRole("button", { name: "ekran-1.png — открыть полностью" }).click();
  const viewer = page.getByRole("dialog", { name: "ekran-1.png" });
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText("1 из 2");
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
});

test("a task without files says so; on a phone the thumbnails fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, [IMG("i1", "ekran-1.png")]);
  const att = page.locator(".ttk-att").first();
  await expect(att.locator("img")).toBeVisible();
  const box = await att.locator(".ttk-att__th").first().boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("no attachments: the empty line", async ({ page }) => {
  await open(page, []);
  await expect(page.locator(".ttk-att").first()).toContainText("Вложений нет.");
});
