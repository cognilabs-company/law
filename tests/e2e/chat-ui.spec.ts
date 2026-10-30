import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// Chat states (TSK-637367): a reply sent with only its target's id still
// quotes it, and a server failure is not blamed on the user's connection.
test("a reply by id quotes the loaded message", async ({ page }) => {
  const routes = await signIn(page, CLIENT, {
    "/secure-chats/r1": { id: "r1", participants: [{ user_id: "u-client" }, { user_id: "u-adv", name: "Test Advokat" }] },
    "/secure-chats/r1/messages": {
      messages: [
        { id: "m1", sender_user_id: "u-adv", message_type: "text", filtered_content: "Shartnomani ko'rib chiqing", created_at: "2026-10-24T08:00:00Z" },
        { id: "m2", sender_user_id: "u-client", message_type: "text", filtered_content: "Ko'rdim", reply_to_message_id: "m1", created_at: "2026-10-24T08:05:00Z" },
      ],
    },
  });
  await mockBackend(page, routes);
  await page.goto("/ru/portal/chat/r1");
  const reply = page.locator(".mxm").filter({ hasText: "Ko'rdim" });
  await expect(reply).toContainText("Shartnomani ko'rib chiqing");
});

test("a server error in the chat list says so, not 'check your internet'", async ({ page }) => {
  const routes = await signIn(page, CLIENT, { "/secure-chats": { status: 500, json: { detail: "boom" } } });
  await mockBackend(page, routes);
  await page.goto("/ru/portal/client/messages");
  await expect(page.getByText("Сервер сейчас не ответил. Попробуйте ещё раз чуть позже.")).toBeVisible();
});

// TSK-637367: the AI chat's own states — its history failing to load says
// so with a retry, and an empty history says there are no chats yet.
test("the AI chat history: an error with a retry, then the empty state", async ({ page }) => {
  // Failing until the retry (React's dev mode may load twice on mount).
  let down = true;
  const routes = await signIn(page, CLIENT, {
    "/clients/[^/]+/chats": () => (down ? { status: 500, json: { detail: "boom" } } : []),
  });
  await mockBackend(page, routes);
  await page.goto("/ru/chat");
  await expect(page.getByText("Не удалось загрузить историю чатов.")).toBeVisible({ timeout: 20000 });
  down = false;
  await page.getByRole("button", { name: "Повторить" }).first().click();
  await expect(page.getByText("Пока нет чатов")).toBeVisible();
});
