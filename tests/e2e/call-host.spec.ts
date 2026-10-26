import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// Support calls open in the app-wide call host (IncomingCallWatcher), not on
// the chat page, so the call stays up while the client moves between pages —
// remote assistance opens pages for the client in the middle of the call.
// The LiveKit join isn't mocked: the room shows its error state, which is
// enough to see that it stays mounted.

test("a call opened through the host survives page changes", async ({ page }) => {
  const routes = await signIn(page, CLIENT, {
    "/clients/me": { id: CLIENT.id, name: CLIENT.name, phone: CLIENT.phone, email: "", region: "tashkent" },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/client/profile");
  await expect(page.locator('a[href$="/portal/client/notifications"]').first()).toBeAttached();

  await page.evaluate(() => {
    const detail: Record<string, unknown> = { roomId: "room-sup-1", callId: "call-sup-1", callType: "video" };
    window.dispatchEvent(new CustomEvent("lexgo:callroom-open", { detail }));
    (window as unknown as { __taken: unknown }).__taken = detail.taken;
  });
  expect(await page.evaluate(() => (window as unknown as { __taken: unknown }).__taken)).toBe(true);
  const call = page.locator(".mtg");
  await expect(call).toBeVisible();
  await expect(page).toHaveURL(/\/uz\/portal\/client\/profile$/);

  // Client-side navigation (what route.navigate does) keeps the same room.
  const marker = await call.evaluate((el) => ((el as HTMLElement).dataset.keep = "1"));
  expect(marker).toBe("1");
  await page.evaluate(() => {
    const a = document.querySelector<HTMLAnchorElement>('a[href$="/portal/client/notifications"]');
    a?.click();
  });
  await expect(page).toHaveURL(/\/portal\/client\/notifications$/);
  await expect(page.locator('.mtg[data-keep="1"]')).toHaveCount(1);
});
