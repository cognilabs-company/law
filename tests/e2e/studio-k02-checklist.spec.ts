import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import fx from "./fixtures/studio-k02.json";

// The service constructor's checklist in two lists by payout stage (live
// K02 schema 2026-10-28: item.payout_stage = first_checklist | final_completion):
// the advocate's items for the second 30%, and the final 40% ones.
test("service checklist: a 30% list and a final 40% list; an item can switch between them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K02": fx.k02,
      "/studio/constructors/K02/form-context": fx.formContext,
      "/studio/constructors/K02/records": fx.records,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
    } as never),
  );
  await page.goto("/uz/admin/studio/o/new?new=K02");
  const first = page.locator('.sx-k2stage[data-stage="first_checklist"]');
  // TSK-881437: the owner's exact name; the backend's "Bajarish ro'yxati" never shows.
  await expect(page.getByText("Ushbu xizmat doirasida bajariladigan ishlarning cheklisti").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Bajarish ro.yxati/)).toHaveCount(0);
  // TSK-331025: the K36 coefficients are picked with the price, not left in "Asosiy".
  await expect(page.locator('[data-section="K02__price"]')).toContainText("Advokat narx koeffitsiyentlari");
  await expect(page.locator('[data-section="asosiy"]')).not.toContainText("Advokat narx koeffitsiyentlari");
  // TSK-856179: the duration unit reads Kun / Soat / Daqiqa, capitalised.
  const delivery = page.locator('[data-section="K02__delivery"]');
  await delivery.scrollIntoViewIfNeeded();
  const unitText = await delivery.innerText();
  expect(unitText).toMatch(/Kun|Soat|Daqiqa/);
  expect(unitText).not.toMatch(/(^|\s)(kun|soat|daqiqa)(\s|$)/m);
  // TSK-942891: a Studio select shows hover (border and background) and a focus ring.
  const box = page.locator('[data-section="K02__delivery"] .sx-picker__box').first();
  await expect(box).toBeVisible();
  await box.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const rest = await box.evaluate((el) => { const c = getComputedStyle(el); return `${c.borderColor}|${c.backgroundColor}`; });
  await box.hover();
  await expect.poll(() => box.evaluate((el) => { const c = getComputedStyle(el); return `${c.borderColor}|${c.backgroundColor}`; })).not.toBe(rest);
  await page.mouse.move(0, 0);
  await box.locator(".sx-picker__trigger").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect.poll(() => box.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
  // …and the same design system's error and disabled looks: a red border
  // when invalid, a dashed one when off.
  await page.mouse.move(0, 0);
  await box.locator(".sx-picker__trigger").blur();
  const states = await box.evaluate((el) => {
    const root = el.closest(".sx-picker") as HTMLElement;
    (el as HTMLElement).style.transition = "none";
    const read = () => { const c = getComputedStyle(el); return { line: c.borderColor, style: c.borderTopStyle }; };
    const rest = read();
    root.setAttribute("data-invalid", "");
    const bad = read();
    root.removeAttribute("data-invalid");
    root.setAttribute("data-disabled", "");
    const off = read();
    root.removeAttribute("data-disabled");
    return { rest, bad, off };
  });
  expect(states.bad.line).not.toBe(states.rest.line);
  expect(states.off.style).toBe("dashed");
  const final = page.locator('.sx-k2stage[data-stage="final_completion"]');
  await first.scrollIntoViewIfNeeded({ timeout: 30000 });
  await expect(first).toContainText("30% cheklisti — ikkinchi to'lov");
  await expect(final).toContainText("Yakuniy 40% cheklisti");
  // TSK-938937: the add control is a contrasting button with its own hover
  // and focus looks, not a faint text link.
  const add = first.getByRole("button", { name: "30% bandini qo'shish" });
  await page.mouse.move(0, 0);
  const addRest = await add.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(addRest).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  await add.hover();
  await expect.poll(() => add.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(addRest);
  await add.focus();
  await expect.poll(() => add.evaluate((el) => { const c = getComputedStyle(el); return c.outlineStyle !== "none" || c.boxShadow !== "none"; })).toBe(true);
  await add.click();
  await expect(first.locator(".sx-k2stage__h em")).toHaveText("1");
  await final.getByRole("button", { name: "Yakuniy band qo'shish" }).click();
  await expect(final.locator(".sx-k2stage__h em")).toHaveText("1");
  if (process.env.K02_SHOTS) {
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.K02_SHOTS}/k02-checklist.png`, fullPage: false });
  }
  // Switching an item's stage moves it to the other list.
  await first.getByRole("radio", { name: /Yakuniy 40%/ }).first().click();
  await expect(first.locator(".sx-k2stage__h em")).toHaveText("0");
  await expect(final.locator(".sx-k2stage__h em")).toHaveText("2");
});

// TSK-938937: adding a question is a real dropdown — a contrasting control
// with a chevron that opens the answer types; the picked type makes the row.
test("adding a question opens a menu of answer types and the row takes the picked one", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K02": fx.k02,
      "/studio/constructors/K02/form-context": fx.formContext,
      "/studio/constructors/K02/records": fx.records,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
    } as never),
  );
  await page.goto("/uz/admin/studio/o/new?new=K02");
  const add = page.getByRole("button", { name: "Savol qo'shish" }).first();
  await expect(add).toBeVisible({ timeout: 20000 });
  await expect(add).toHaveAttribute("aria-haspopup", "menu");
  await expect(add).toHaveClass(/sx-btn--add/);
  await add.click();
  const menu = page.getByRole("menu", { name: "Savol qo'shish" });
  await expect(menu.getByRole("menuitem", { name: "Qisqa matn" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Sana" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Sana" }).click();
  await expect(menu).toHaveCount(0);
  // The new row says its answer type.
  await expect(page.locator(".sx-rep__row").filter({ hasText: "Sana" }).first()).toBeVisible();
});

// TSK-206001: a service's rules are added per side — the performer's and
// the client's in their own panels, each row kept with its audience.
test("performer and client rules are added in their own panels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K02": fx.k02,
      "/studio/constructors/K02/form-context": fx.formContext,
      "/studio/constructors/K02/records": fx.records,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
    } as never),
  );
  await page.goto("/uz/admin/studio/o/new?new=K02");
  const performer = page.locator(".sx-ra__panel").filter({ hasText: "Ijrochi qoidalari" });
  const client = page.locator(".sx-ra__panel").filter({ hasText: "Mijoz qoidalari" });
  await performer.scrollIntoViewIfNeeded({ timeout: 30000 });
  await expect(performer).toContainText("Shu xizmatga xos ijrochi qoidasi yo‘q.");
  await performer.getByRole("button", { name: "Ijrochi qoidasini qo‘shish" }).click();
  await performer.getByPlaceholder("Masalan: Maxfiylik").fill("Mijoz ma'lumotlari sir");
  await client.getByRole("button", { name: "Mijoz qoidasini qo‘shish" }).click();
  await client.getByPlaceholder("Masalan: Maxfiylik").fill("Hujjatlarni 2 kunda yuboring");
  // Each rule stays on its own side.
  await expect(performer.locator("input").first()).toHaveValue("Mijoz ma'lumotlari sir");
  await expect(client.locator("input").first()).toHaveValue("Hujjatlarni 2 kunda yuboring");
  await expect(performer).not.toContainText("Hujjatlarni 2 kunda yuboring");
  await expect(performer.locator(".sx-ra__count")).toHaveAttribute("aria-label", "1 ta qoida");
  await expect(client.locator(".sx-ra__count")).toHaveAttribute("aria-label", "1 ta qoida");
});

// TSK-732568 / TSK-617437: a checklist item has a performer's name and a
// client's name, and a "client sees it" switch per proof method; the form
// groups fields by who reads them, and the preview shows each side apart.
test("a checklist item names both sides and says what the client sees; the preview splits the readers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K02": fx.k02,
      "/studio/constructors/K02/form-context": fx.formContext,
      "/studio/constructors/K02/records": fx.records,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
    } as never),
  );
  await page.goto("/uz/admin/studio/o/new?new=K02");
  // Fields are grouped by reader.
  await expect(page.locator(".sx-agrp").first()).toBeVisible({ timeout: 20000 });
  expect(await page.locator(".sx-agrp").count()).toBeGreaterThan(1);
  await expect(page.locator('.sx-agrp[data-who="client"]').first()).toContainText("Mijoz ko'radi");

  const first = page.locator('.sx-k2stage[data-stage="first_checklist"]');
  await first.scrollIntoViewIfNeeded({ timeout: 30000 });
  await first.getByRole("button", { name: "30% bandini qo'shish" }).click();
  await expect(first).toContainText("Band nomi (mijoz)");
  await expect(first.getByPlaceholder("Masalan: Pasport tekshirildi")).toBeVisible();
  // Turn the image proof on, then let the client see it.
  const image = first.locator(".sx-k2m").filter({ hasText: "Rasm" }).first();
  await image.getByRole("checkbox").click();
  const show = image.getByRole("switch", { name: "Rasm mijozga ko'rinsin" });
  await expect(show).toBeEnabled();
  await expect(show).toHaveAttribute("aria-checked", "false");
  await show.click();
  await expect(show).toHaveAttribute("aria-checked", "true");

  // The preview: the client and the performer, each with their own fields.
  const preview = page.locator(".sx-apv");
  await preview.scrollIntoViewIfNeeded();
  await preview.getByRole("radio", { name: /Ijrochi/ }).click();
  await expect(preview).toHaveAttribute("data-view", "performer");
  await preview.getByRole("radio", { name: /Mijoz/ }).click();
  await expect(preview).toHaveAttribute("data-view", "client");
});

// TSK-656862: who may do a service is a list. An old draft's single
// executor_type becomes executor_types, and every save sends the list
// (never the old single field).
test("executor types are a list: an old single value becomes a list, and the save sends the list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const saves: Record<string, unknown>[] = [];
  const obj = (payload: Record<string, unknown>) => ({ id: "obj-k02", constructor_code: "K02", title: "Ajrashish", status: "draft", lock_version: 1, payload, current_version: { payload } });
  let current = obj({ title: "Ajrashish", executor_type: "advokat", price_factor_ids: ["pf-urgent", "pf-night"] });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K02": fx.k02,
      "/studio/constructors/K02/form-context": fx.formContext,
      "/studio/constructors/K02/records": fx.records,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
      "/studio/objects/obj-k02": () => current,
      "POST /studio/objects/obj-k02/save": (b: unknown) => {
        const body = b as { payload: Record<string, unknown> };
        saves.push(body.payload);
        current = obj(body.payload);
        return current;
      },
      "POST /studio/constructors/K02/preview": { ok: true },
      "/studio/reference/price-factors": { key: "price-factors", items: [
        { id: "pf-urgent", value: "pf-urgent", label: "Shoshilinchlik", adjustment_type: "percent", adjustment_value: 10 },
        { id: "pf-night", value: "pf-night", label: "Tungi ish", adjustment_type: "fixed", adjustment_value: 50000 },
      ], total: 2, count: 2, limit: 50, offset: 0, has_more: false },
      "POST /studio/constructors/K02/validate": { ok: true, errors: [] },
    } as never),
  );
  await page.goto("/uz/admin/studio/o/obj-k02");
  const field = page.locator('[data-path="executor_types"]').first();
  await field.scrollIntoViewIfNeeded({ timeout: 30000 });
  await expect(field.getByRole("checkbox", { name: /Advokat/ }).first()).toBeChecked();
  await field.getByRole("checkbox", { name: /^Yurist/ }).first().check({ force: true });
  await page.getByRole("button", { name: "Saqlash", exact: true }).first().click();
  await expect.poll(() => saves.length).toBeGreaterThan(0);
  const sent = saves.at(-1) as Record<string, unknown>;
  expect(sent.executor_types).toEqual(expect.arrayContaining(["advokat", "yurist"]));
  expect(sent).not.toHaveProperty("executor_type");

  // TSK-269743: each picked price factor shows its own name, kind and value,
  // one per row — never "selected factor".
  const names = page.locator(".sx-k2fo__name");
  await names.first().scrollIntoViewIfNeeded();
  await expect(names).toHaveCount(2);
  await expect(names.nth(0)).toContainText("Shoshilinchlik");
  await expect(names.nth(1)).toContainText("Tungi ish");
  await expect(page.locator(".sx-k2fo__shared").nth(0)).toContainText("10");
  await expect(page.locator(".sx-k2fo__shared").nth(1)).toContainText(/50[\s\u00a0\u202f]?000/);
  await expect(page.getByText(/Tanlangan omil|Tanlangan yozuv/)).toHaveCount(0);
});

// Owner, 2026-10-30: a checklist item is named, nothing more — no
// description / comment box for the performer or the client. An older item
// that has descriptions keeps them: they are saved back unchanged. The
// payout stage switch, the required switch and the proof methods stay.
test("a checklist item has names only — no description fields — and an older item's descriptions survive a save", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const saves: Record<string, unknown>[] = [];
  const old = { id: "chk-1", executor_title: "Pasportni tekshirish", client_title: "Pasport tekshirildi", description: "Muddati va F.I.Sh.ni solishtiring", client_description: "Advokat hujjatingizni tekshiradi", payout_stage: "first_checklist", required: true, verification_methods: ["checkbox"] };
  const obj = (payload: Record<string, unknown>) => ({ id: "obj-k02", constructor_code: "K02", title: "Ajrashish", status: "draft", lock_version: 1, payload, current_version: { payload } });
  let current = obj({ title: "Ajrashish", executor_types: ["advokat"], completion_checklist: [old] });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K02": fx.k02,
      "/studio/constructors/K02/form-context": fx.formContext,
      "/studio/constructors/K02/records": fx.records,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
      "/studio/objects/obj-k02": () => current,
      "POST /studio/objects/obj-k02/save": (b: unknown) => {
        const body = b as { payload: Record<string, unknown> };
        saves.push(body.payload);
        current = obj(body.payload);
        return current;
      },
      "POST /studio/constructors/K02/preview": { ok: true },
      "POST /studio/constructors/K02/validate": { ok: true, errors: [] },
    } as never),
  );
  await page.goto("/uz/admin/studio/o/obj-k02");
  const first = page.locator('.sx-k2stage[data-stage="first_checklist"]');
  await first.scrollIntoViewIfNeeded({ timeout: 30000 });
  await expect(first.locator(".sx-rep__sum").first()).toHaveText("Pasportni tekshirish");
  await first.getByRole("button", { name: "Ochish: Pasportni tekshirish" }).click();
  const row = first.locator(".sx-rep__row").first();
  await expect(row).toHaveAttribute("data-open", "");
  // Names, stage, required, proof methods — and no description of any kind.
  await expect(row.getByPlaceholder("Masalan: Mijozning pasportini tekshiring")).toHaveValue("Pasportni tekshirish");
  await expect(row.getByPlaceholder("Masalan: Pasport tekshirildi")).toHaveValue("Pasport tekshirildi");
  await expect(row.getByRole("radio", { name: /30% bosqichi/ })).toBeVisible();
  await expect(row.getByRole("switch", { name: /Majburiy band/ })).toBeVisible();
  await expect(row.locator(".sx-k2m")).toHaveCount(4);
  await expect(row.locator("textarea")).toHaveCount(0);
  await expect(row.locator('[data-path$=".description"], [data-path$=".client_description"]')).toHaveCount(0);
  await expect(row).not.toContainText(/Ko'rsatma \(ijrochi\)|Izoh \(mijoz\)/);
  // A new item: names only too.
  await first.getByRole("button", { name: "30% bandini qo'shish" }).click();
  const added = first.locator(".sx-rep__row").nth(1);
  await expect(added.locator("textarea")).toHaveCount(0);
  await added.getByPlaceholder("Masalan: Mijozning pasportini tekshiring").fill("Shartnomani o'qish");
  // Rename the old item and save: its descriptions go back as they were.
  await row.getByPlaceholder("Masalan: Mijozning pasportini tekshiring").fill("Pasport va ID kartani tekshirish");
  if (process.env.ADDON_SHOTS) {
    for (const scheme of ["light", "dark"] as const) {
      for (const [w, h] of [[1440, 900], [390, 844]] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme);
        await page.setViewportSize({ width: w, height: h });
        await row.locator(".sx-k2cl__voices").evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        await page.waitForTimeout(700);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: `${process.env.ADDON_SHOTS}/task-b-editor-${w}-${scheme}.png` });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.getByRole("button", { name: "Saqlash", exact: true }).first().click();
  await expect.poll(() => saves.length).toBeGreaterThan(0);
  const list = (saves.at(-1) as { completion_checklist: Record<string, unknown>[] }).completion_checklist;
  const kept = list.find((x) => x.id === "chk-1") as Record<string, unknown>;
  expect(kept.executor_title).toBe("Pasport va ID kartani tekshirish");
  expect(kept.description).toBe("Muddati va F.I.Sh.ni solishtiring");
  expect(kept.client_description).toBe("Advokat hujjatingizni tekshiradi");
  expect(kept.payout_stage).toBe("first_checklist");
  const fresh = list.find((x) => x.executor_title === "Shartnomani o'qish") as Record<string, unknown>;
  expect(fresh.payout_stage).toBe("first_checklist");
  expect(fresh.description ?? "").toBe("");
  expect(fresh.client_description ?? "").toBe("");
});
