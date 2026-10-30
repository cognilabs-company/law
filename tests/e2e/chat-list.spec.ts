import { expect, test, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn, type Mock } from "./mock";

// TSK-637367: the chat list and the room as a whole — the last message and
// the unread count per conversation, a new message moving its room to the
// top live, a reaction that never becomes the "last message", a file sent
// as a bubble, and the phone layout where the list and the room swap.

const ADV_A = { user_id: "u-a", name: "Aziza Advokat", role: "advokat" };
const ADV_B = { user_id: "u-b", name: "Bobur Yurist", role: "yurist" };
const ME = { user_id: "u-client", name: "Test Mijoz", role: "client" };
const ROOMS = [
  { id: "ra", status: "active", participants: [ME, ADV_A], unread_count: 2, last_message_at: "2026-10-30T09:00:00Z", last_message: { id: "a2", sender_user_id: "u-a", message_type: "text", filtered_content: "Hujjatlarni yuboring", created_at: "2026-10-30T09:00:00Z" } },
  { id: "rb", status: "active", participants: [ME, ADV_B], unread_count: 0, last_message_at: "2026-10-29T15:00:00Z", last_message: { id: "b1", sender_user_id: "u-client", message_type: "text", filtered_content: "Rahmat", created_at: "2026-10-29T15:00:00Z" } },
];
const MSGS = [
  { id: "a1", sender_user_id: "u-a", message_type: "text", filtered_content: "Assalomu alaykum", created_at: "2026-10-30T08:55:00Z" },
  { id: "a2", sender_user_id: "u-a", message_type: "text", filtered_content: "Hujjatlarni yuboring", created_at: "2026-10-30T09:00:00Z" },
];

async function open(page: Page, extra: Record<string, unknown> = {}): Promise<Mock> {
  const routes = await signIn(page, CLIENT, {
    "/secure-chats": { rooms: ROOMS },
    "/secure-chats/ra": ROOMS[0],
    "/secure-chats/ra/messages": { messages: MSGS },
    "/secure-chats/rb": ROOMS[1],
    "/secure-chats/rb/messages": { messages: [] },
    ...extra,
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/portal/client/messages");
  return mock;
}

const rows = (page: Page) => page.locator(".mx-list__rows > li");

test("the list shows each last message and unread count, and a new message moves its room to the top", async ({ page }) => {
  const mock = await open(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText("Aziza Advokat");
  await expect(rows(page).nth(0)).toContainText("Hujjatlarni yuboring");
  await expect(rows(page).nth(0).locator(".mx-badge")).toHaveText("2");
  await expect(rows(page).nth(1)).toContainText("Bobur Yurist");
  await expect(rows(page).nth(1)).toContainText("Rahmat");
  await expect(rows(page).nth(1).locator(".mx-badge")).toHaveCount(0);

  // Bobur writes: his room goes to the top with one unread.
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  // The socket may still be opening: send again until it lands (the same
  // message id is counted once, so a repeat changes nothing).
  const b2 = { event: "secure_chat.message_created", room_id: "rb", message: { id: "b2", sender_user_id: "u-b", message_type: "text", filtered_content: "Ertaga sudga boramiz", created_at: new Date().toISOString() } };
  await expect(async () => {
    await mock.push(b2);
    await expect(rows(page).nth(0)).toContainText("Bobur Yurist", { timeout: 1500 });
  }).toPass({ timeout: 20000 });
  await expect(rows(page).nth(0)).toContainText("Ertaga sudga boramiz");
  await expect(rows(page).nth(0).locator(".mx-badge")).toHaveText("1");
  // The same message heard twice counts once.
  await mock.push(b2);
  await expect(rows(page).nth(0).locator(".mx-badge")).toHaveText("1");

  // A reaction reads as a reaction in words, never as the raw message type.
  await mock.push({ event: "secure_chat.message_created", room_id: "ra", message: { id: "a3", sender_user_id: "u-a", message_type: "reaction", filtered_content: "👍", created_at: new Date().toISOString() } });
  const a = rows(page).filter({ hasText: "Aziza Advokat" });
  await expect(a.locator(".mx-row__p")).toContainText("реакция 👍");
  await expect(a.locator(".mx-row__p")).not.toContainText("reaction");
});

test("an empty list says so", async ({ page }) => {
  await open(page, { "/secure-chats": { rooms: [] } });
  await expect(page.locator(".mx-list__rows")).toHaveCount(0);
  await expect(page.locator(".mx__list")).toContainText(/нет|Нет|пока/);
});

test("in a room: a reaction is sent as a reaction, a file as a file bubble", async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  let uploads = 0;
  const mock = await open(page, {
    "POST /secure-chats/ra/messages": (b: unknown) => {
      sent.push(b as Record<string, unknown>);
      return { id: `n${sent.length}`, sender_user_id: "u-client", created_at: new Date().toISOString(), ...(b as object) };
    },
    "POST /secure-chats/ra/messages/upload": () => (++uploads, { id: "f1", sender_user_id: "u-client", message_type: "file", meta: { file_name: "shartnoma.pdf", mime_type: "application/pdf", size: 2048, download_url: "/secure-chats/ra/messages/f1/file" }, created_at: new Date().toISOString() }),
  });
  await rows(page).filter({ hasText: "Aziza Advokat" }).click();
  const msg = page.locator(".mxm").filter({ hasText: "Hujjatlarni yuboring" });
  await expect(msg).toBeVisible();
  await msg.hover();
  await msg.getByRole("button", { name: "Отреагировать" }).click();
  await msg.getByRole("menuitemcheckbox", { name: "👍" }).click();
  // Over the room's live socket when it is open, else over HTTP.
  await expect.poll(() => [...mock.sent, ...sent.map((x) => JSON.stringify(x))].some((x) => x.includes("reaction") && x.includes("👍"))).toBe(true);
  await expect(page.locator(".mxm__reacts").first()).toContainText("👍");

  await page.locator('input[type="file"]').first().setInputFiles({ name: "shartnoma.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  // Picked files wait above the composer until sent.
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect.poll(() => uploads).toBe(1);
  await expect(page.locator(".mxm").filter({ hasText: "shartnoma.pdf" }).first()).toBeVisible();
});

test("on a phone the list and the room take the whole screen in turn", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator(".mx__list")).toBeVisible();
  await expect(page.locator(".mx__room")).toBeHidden();
  await rows(page).filter({ hasText: "Aziza Advokat" }).click();
  await expect(page.locator(".mx__room")).toBeVisible();
  await expect(page.locator(".mx__list")).toBeHidden();
  await expect(page.getByText("Hujjatlarni yuboring").last()).toBeVisible();
  // Nothing spills sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
