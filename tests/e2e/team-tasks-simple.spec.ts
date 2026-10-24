import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn, type Who } from "./mock";

// Ulugbek's task account (TSK-371625): no start / send-to-test / ready
// buttons, nothing of the kind is sent, and the final action approves and
// archives the task with a required closing note. Other users keep the
// full flow.
const ULUGBEK: Who = { ...ADMIN, id: "dc68625e-b472-46ab-bd19-96cfa57591e1", name: "Ulugbek Omonov" };
const task = (id: string, status: string, next: string[]) => ({
  id,
  task_code: `TSK-${id}`,
  title: `Vazifa ${id}`,
  description: "Tavsif",
  status,
  deadline_at: "2026-11-12T13:00:00Z",
  lock_version: 3,
  assignees: [],
  history: [],
  attachments: [],
  actions: { can_edit: true, can_assign: true, can_delete: true, can_change_status: true, next_statuses: next, is_assigned: false },
  created_at: "2026-10-23T12:00:00Z",
  updated_at: "2026-10-23T12:00:00Z",
});
const ITEMS = [task("1", "in_progress", ["testing"]), task("2", "testing", ["ready", "in_progress"])];
const routes = (extra: Record<string, unknown> = {}) => ({
  "/task-management/meta": { statuses: [{ value: "new" }, { value: "in_progress" }, { value: "testing" }, { value: "ready" }] },
  "/task-management/stats": {},
  "/task-management/users": { items: [] },
  "/task-management": { items: ITEMS, total: 2, counts: {} },
  "/task-management/2": ITEMS[1],
  "/task-management/2/history": { items: [] },
  ...extra,
});

test("Ulugbek sees no workflow buttons and approves-and-archives with a note", async ({ page }) => {
  let deleted: unknown = null;
  const r = await signIn(page, ULUGBEK, routes({ "DELETE /task-management/2": (b: unknown) => ((deleted = b), {}) }));
  const mock = await mockBackend(page, r);
  await page.goto("/ru/admin/team-tasks");
  await expect(page.getByText("Vazifa 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отправить на тест" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Подтвердить готовность" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Вернуть на доработку" })).toHaveCount(1);
  await page.getByRole("button", { name: "Открыть задачу TSK-2 — Vazifa 2" }).click();
  await page.getByRole("button", { name: "Отметить как принятую и архивировать" }).click();
  const dialog = page.getByRole("dialog", { name: /принять и архивировать/ });
  await dialog.getByRole("button", { name: "Принять и архивировать" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("textbox").fill("Hammasi to'g'ri ishlayapti");
  await dialog.getByRole("button", { name: "Принять и архивировать" }).click();
  await expect.poll(() => deleted).toEqual({ reason: "Принято и архивировано: Hammasi to'g'ri ishlayapti", expected_lock_version: 3 });
  expect(mock.calls.some((c) => c.method === "POST" && c.path.endsWith("/status"))).toBe(false);
});

test("other users keep the full flow", async ({ page }) => {
  const r = await signIn(page, ADMIN, routes());
  await mockBackend(page, r);
  await page.goto("/ru/admin/team-tasks");
  await expect(page.getByRole("button", { name: "Отправить на тест" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Подтвердить готовность" })).toHaveCount(1);
  await page.getByRole("button", { name: "Открыть задачу TSK-2 — Vazifa 2" }).click();
  await expect(page.getByRole("button", { name: "Удалить" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отметить как принятую и архивировать" })).toHaveCount(0);
});
