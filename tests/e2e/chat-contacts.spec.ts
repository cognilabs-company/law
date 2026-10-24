import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

const ROOM = "room-1";

test.describe("secure chat contact sharing", () => {
  test("a message with a contact is not sent; ordinary text is", async ({ page }) => {
    const routes = await signIn(page, CLIENT, {
      [`/secure-chats/${ROOM}/messages`]: { items: [] },
      [`/secure-chats/${ROOM}`]: { id: ROOM, title: "Test xizmat", participants: [{ user_id: "u-client" }, { user_id: "u-adv", name: "Test Advokat" }] },
      [`POST /secure-chats/${ROOM}/messages`]: (body: unknown) => ({ id: "m-new", sender_user_id: "u-client", message_type: "text", filtered_content: (body as { content?: string })?.content ?? "", created_at: new Date().toISOString() }),
    });
    const mock = await mockBackend(page, routes);
    await page.goto(`/ru/portal/chat/${ROOM}`);
    const box = page.getByPlaceholder("Напишите сообщение…");
    await expect(box).toBeVisible();

    const leak = "Menga +998 90 123 45 67 ga yozing";
    await box.fill(leak);
    await box.press("Enter");
    await expect(page.getByText("Нельзя указывать контакты вне платформы").first()).toBeVisible();
    // The text stays to be edited, and it left the browser by no route.
    await expect(box).toHaveValue(leak);
    const wire = () => [...mock.sent, ...mock.calls.filter((c) => c.method !== "GET").map((c) => JSON.stringify(c.body))].join("\n");
    expect(wire()).not.toContain("123 45 67");

    await box.fill("Salom, hujjatlarni yubordim");
    await box.press("Enter");
    await expect.poll(wire).toContain("Salom, hujjatlarni yubordim");
  });
});
