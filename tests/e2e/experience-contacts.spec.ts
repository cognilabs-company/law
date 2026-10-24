import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, mockBackend, signIn } from "./mock";

const ME = {
  lawyer_name: "Test Advokat",
  region: "tashkent",
  bio: "",
  languages: ["uz"],
  specializations: ["oila-va-nikoh"],
  experience_years: 8,
  lawyer_experience_years: 8,
};

// "About me" sits in the second tab's first panel, behind its edit button.
async function openBio(page: Page) {
  await page.getByRole("tab").nth(1).click();
  await page.getByRole("button", { name: "Изменить" }).first().click();
  const bio = page.locator("#spe-bio");
  await expect(bio).toBeVisible();
  return bio;
}

test.describe("contact details in a lawyer's 'about me'", () => {
  test("disappear as typed, the note names only their kind, and the save carries none", async ({ page }) => {
    let saved: Record<string, unknown> | null = null;
    const routes = await signIn(page, ADVOCATE, {
      "/lawyers/me": ME,
      "PUT /lawyers/me": (body: unknown) => {
        saved = body as Record<string, unknown>;
        return { ...ME, ...(body as object) };
      },
    });
    const mock = await mockBackend(page, routes);
    await page.goto("/ru/portal/advocate/profile");
    const bio = await openBio(page);

    await bio.click();
    await page.keyboard.type("10 yillik tajriba. Tel 909338678 @akhmad_law yozing", { delay: 15 });
    await expect(bio).toHaveValue("10 yillik tajriba. Tel yozing");
    const note = page.locator("#spe-bio-g");
    await expect(note).toContainText("Контактные данные указывать нельзя");
    await expect(note).toContainText("Телефон");
    await expect(note).toContainText("Имя пользователя");
    // Only the kind is named, never the number or the handle.
    await expect(note).not.toContainText("909338678");
    await expect(note).not.toContainText("akhmad");

    await bio.fill("");
    await page.keyboard.type("Oila nizolari bo'yicha 8 yil. t.me/akhmad_law", { delay: 10 });
    await page.getByRole("button", { name: "Сохранить" }).first().click();
    await expect.poll(() => saved).not.toBeNull();
    expect(JSON.stringify(saved)).not.toMatch(/t\.me|akhmad|909338678|aziz@mail/);
    expect(mock.refused.filter((r) => !r.includes("/lawyers/me"))).toEqual([]);
  });
});
