import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// The backend names system roles and permissions in English; the admin page
// shows LexGo's own names for them, and an admin-made role keeps its own.
test("admin roles page shows translated role and permission names", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/admin/roles": [
      { id: "r1", name: "task_manager", title: "Task Manager", description: "", permissions: ["tasks.view", "tasks.manage", "tasks.assign", "tasks.delete"] },
      { id: "r2", name: "custom_reviewers", title: "Tekshiruvchilar guruhi", description: "", permissions: ["tasks.view"] },
    ],
    "/admin/permissions": [
      { code: "tasks.view", title: "View tasks" },
      { code: "tasks.manage", title: "Manage tasks" },
      { code: "tasks.assign", title: "Assign tasks" },
      { code: "tasks.delete", title: "Delete tasks" },
    ],
    "/admin/permission-matrix": { roles: [], permissions: [], matrix: {} },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/admin/roles");
  await expect(page.getByText("Менеджер задач").first()).toBeVisible();
  await expect(page.getByText("Tekshiruvchilar guruhi").first()).toBeVisible();
  await expect(page.getByText("Task Manager")).toHaveCount(0);
  // Russian plural: 4 → "разрешения".
  await expect(page.getByText("4 разрешения").first()).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("View tasks");
  expect(mock.refused).toEqual([]);
});
