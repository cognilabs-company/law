import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// TSK-637367: a voice message — recorded with the browser's (fake, for the
// test) microphone, listened to before sending, then sent as a voice file
// and shown as a voice bubble.
test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

const ME = { user_id: "u-client", name: "Test Mijoz", role: "client" };
const ROOM = { id: "ra", status: "active", participants: [ME, { user_id: "u-a", name: "Aziza Advokat", role: "advokat" }], unread_count: 0, last_message_at: "2026-10-30T09:00:00Z" };

test("a voice message is recorded, listened to, and sent as a voice file", async ({ page }) => {
  const uploads: string[] = [];
  await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/secure-chats": { rooms: [ROOM] },
      "/secure-chats/ra": ROOM,
      "/secure-chats/ra/messages": { messages: [{ id: "a1", sender_user_id: "u-a", message_type: "text", filtered_content: "Ovozli xabar yuboring", created_at: "2026-10-30T09:00:00Z" }] },
    }),
  );
  await page.route(/\/secure-chats\/ra\/messages\/upload/, async (route) => {
    uploads.push(route.request().postDataBuffer()?.toString("latin1") ?? "");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "v1", sender_user_id: "u-client", message_type: "voice", meta: { file_name: "voice.webm", mime_type: "audio/webm", size: 4096, download_url: "/secure-chats/ra/messages/v1/file", duration_seconds: 2 }, created_at: new Date().toISOString() }) });
  });
  await page.goto("/ru/portal/client/messages");
  await page.locator(".mx-list__rows > li").first().click();
  await expect(page.getByText("Ovozli xabar yuboring").last()).toBeVisible();
  await page.getByRole("button", { name: "Голосовое сообщение" }).click();
  const bar = page.getByRole("group", { name: "Голосовое сообщение" });
  await expect(bar).toBeVisible();
  await page.waitForTimeout(1500);
  await bar.getByRole("button", { name: "Остановить и прослушать" }).click();
  await bar.getByRole("button", { name: "Отправить" }).click();
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0]).toContain("voice");
  await expect(page.locator(".mxm").filter({ hasText: /Голосовое сообщение|0:0/ }).last()).toBeVisible();
});
