import { describe, expect, it } from "vitest";
import { chatContacts, isMachineFileName, maskContacts } from "@/lib/chatFilter";

describe("chat contact masking", () => {
  it.each([
    ["Menga +998 90 123 45 67 ga qo'ng'iroq", "Menga ••• ga qo'ng'iroq"],
    ["Yozing: aziz@mail.uz", "Yozing: •••"],
    ["t.me/aziz_lawyer orqali", "••• orqali"],
    ["instagram.com/aziz", "•••"],
  ])("masks %j", (text, shown) => {
    expect(maskContacts(text)).toBe(shown);
    expect(chatContacts(text).length).toBeGreaterThan(0);
  });

  it.each(["Zoom: https://us02web.zoom.us/j/123456", "Qonun: https://lex.uz/docs/111", "Narxi 1 000 000 000 so'm, ish 2-1234/2025"])("lets %j through", (text) => {
    expect(maskContacts(text)).toBe(text);
    expect(chatContacts(text)).toEqual([]);
  });
});

describe("isMachineFileName", () => {
  it.each(["96B3381C-1A2B-4C3D-8E9F-001122334455.heic", "voice-1729740000000.webm", "1729740000000.jpg"])("treats %j as machine-made", (n) => {
    expect(isMachineFileName(n)).toBe(true);
  });
  it("keeps a real name", () => {
    expect(isMachineFileName("Shartnoma loyihasi.docx")).toBe(false);
  });
});
