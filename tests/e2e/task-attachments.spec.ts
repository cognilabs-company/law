import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// TSK-323073: a task's attached images show as thumbnails in its detail,
// fetched with the signed-in token; tapping one opens the full viewer; a
// picture that fails to load says so and can be retried; other files are
// rows to download; a task without files says it has none.
// Backend answers 2026-10-31 §5.2: preview only when preview_supported,
// read from inline_url (else preview_url); download_url only downloads.

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
const IMG = (id: string, name: string) => ({ id, file_name: name, mime_type: "image/png", size_bytes: 2048, kind: "image", preview_supported: true, inline_url: `/task-management/2/attachments/${id}/file?disposition=inline`, preview_url: `/task-management/2/attachments/${id}/file?disposition=inline&from=preview_url`, download_url: `/task-management/2/attachments/${id}/file?disposition=attachment`, uploader: { id: "u-k", name: "Kamron" }, created_at: "2026-10-23T12:00:00Z" });
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
  const urls: string[] = [];
  await page.route(/\/task-management\/2\/attachments\/i1\/file/, (r) => (auth.push(r.request().headers().authorization ?? ""), urls.push(r.request().url()), r.fulfill({ status: 200, contentType: "image/png", body: PNG })));
  await page.route(/\/task-management\/2\/attachments\/i2\/file/, (r) => (++brokenTries === 1 ? r.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"Not Found"}' }) : r.fulfill({ status: 200, contentType: "image/png", body: PNG })));
  await page.goto("/ru/admin/team-tasks");
  await page.getByRole("button", { name: "Открыть задачу TSK-2 — Vazifa 2" }).click();
  return { mock, auth, urls, tries: () => brokenTries };
}

test("images show as thumbnails, open in the viewer, a failed one retries; files download", async ({ page }) => {
  const { auth, urls, tries } = await open(page, [IMG("i1", "ekran-1.png"), IMG("i2", "ekran-2.png"), PDF]);
  const att = page.getByRole("region", { name: "Вложения" }).or(page.locator(".ttk-att")).first();
  await expect(att.locator(".ttk-att__n")).toHaveText("3");
  const first = att.locator(".ttk-att__th").filter({ hasText: "ekran-1.png" });
  await expect(first.locator("img")).toBeVisible();
  // Visible means it has a box; the blob may still be decoding.
  await expect.poll(() => first.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2);
  // Fetched with the signed-in token, shown from a blob — never a public link.
  expect(auth[0]).toBe("Bearer test-token");
  // From inline_url, preferred over preview_url.
  expect(urls[0]).toMatch(/disposition=inline$/);
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

test("a file without preview_supported is download only; a previewable PDF opens inline, downloads from download_url", async ({ page, context }) => {
  const NOPREVIEW = { ...IMG("i3", "skan.png"), preview_supported: false };
  const PDFV = { ...PDF, id: "d2", file_name: "shartnoma.pdf", preview_supported: true, inline_url: "/task-management/2/attachments/d2/file?disposition=inline", preview_url: "/task-management/2/attachments/d2/file?disposition=inline&from=preview_url", download_url: "/task-management/2/attachments/d2/file?disposition=attachment" };
  const hits: string[] = [];
  const auth: string[] = [];
  await open(page, [NOPREVIEW, PDF, PDFV]);
  // Registered after the mock, so these answer first.
  await page.route(/\/task-management\/2\/attachments\/(i3|d1|d2)\/file/, (r) => {
    hits.push(r.request().url());
    auth.push(r.request().headers().authorization ?? "");
    return r.fulfill({ status: 200, contentType: r.request().url().includes("i3") ? "image/png" : "application/pdf", body: r.request().url().includes("i3") ? PNG : Buffer.from("%PDF-1.4 test") });
  });
  const att = page.locator(".ttk-att").first();
  await expect(att.locator(".ttk-att__n")).toHaveText("3");
  // preview_supported: false — no thumbnail and nothing fetched, a row to download.
  await expect(att.locator(".ttk-att__th")).toHaveCount(0);
  await expect(att.locator(".ttk-att__file").filter({ hasText: "skan.png" })).toBeVisible();
  await expect(att.getByRole("button", { name: "skan.png — открыть для просмотра" })).toHaveCount(0);
  await expect(att.getByRole("button", { name: "skan.png — скачать" })).toBeVisible();
  // A PDF without preview support downloads only.
  await expect(att.getByRole("button", { name: "talablar.pdf — открыть для просмотра" })).toHaveCount(0);
  expect(hits).toEqual([]);

  // The previewable PDF opens in a new tab, read with the token from
  // inline_url (preferred over preview_url). Headless Chromium has no PDF
  // viewer, so the tab itself is not inspected.
  const popup = context.waitForEvent("page");
  await att.getByRole("button", { name: "shartnoma.pdf — открыть для просмотра" }).click();
  const tab = await popup;
  await expect.poll(() => hits.at(-1)).toMatch(/d2\/file\?disposition=inline$/);
  expect(auth.at(-1)).toBe("Bearer test-token");
  await expect(att.locator(".ttk-att__file").filter({ hasText: "shartnoma.pdf" })).not.toContainText("Не удалось открыть");
  if (!tab.isClosed()) await tab.close();

  // Download is always download_url.
  await att.getByRole("button", { name: "shartnoma.pdf — скачать" }).click();
  await expect.poll(() => hits.at(-1)).toMatch(/d2\/file\?disposition=attachment$/);

  if (process.env.TASK_ATT_SHOTS) {
    const dir = process.env.TASK_ATT_SHOTS;
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((th) => document.documentElement.setAttribute("data-theme", th), theme);
      for (const w of [1440, 390]) {
        await page.setViewportSize({ width: w, height: w > 400 ? 900 : 844 });
        await att.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${dir}/task-attachments-${w}-${theme}.png` });
      }
    }
  }
});
