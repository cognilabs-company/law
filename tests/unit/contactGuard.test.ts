import { describe, expect, it } from "vitest";
import { findContacts, stripContacts } from "@/lib/contactGuard";

const kinds = (s: string) => findContacts(s).map((h) => h.kind);

describe("findContacts", () => {
  it.each([
    ["Tel: +998 90 123 45 67", "phone"],
    ["909338678 ga yozing", "phone"],
    ["8 (90) 123 45 67", "phone"],
    ["Pochta: aziz@mail.uz", "email"],
    ["@aziz_lawyer bilan", "username"],
    ["https://example.com/page", "link"],
    ["sayt: advokat.uz", "link"],
    ["telegram: aziz99", "messenger"],
  ])("finds the contact in %j", (text, kind) => {
    expect(kinds(text)).toContain(kind);
  });

  it.each([
    "2015–2023 yillarda Oila kodeksining 39-moddasi bo'yicha 120 ta ish",
    "Narxi 1 250 000 so'm",
    "Ish raqami 2-1234/2025",
    "Qonun matni: https://lex.uz/docs/111",
    "Telegram orqali emas, faqat LexGo ichida",
  ])("leaves ordinary experience text alone: %j", (text) => {
    expect(findContacts(text)).toEqual([]);
  });
});

describe("stripContacts", () => {
  it("takes every contact out and reports what it took", () => {
    const r = stripContacts("Tel +998 90 123 45 67 yoki aziz@mail.uz orqali", true);
    expect(r.text).toBe("Tel yoki orqali");
    expect(r.removed.map((h) => h.kind).sort()).toEqual(["email", "phone"]);
  });

  it("marks a contact that runs to the end as the tail still being typed", () => {
    const r = stripContacts("Yozing @akhm");
    expect(r.tail?.kind).toBe("username");
    expect(r.text).toBe("Yozing ");
  });

  it("returns clean text untouched", () => {
    const text = "10 yillik tajriba, 39-modda";
    expect(stripContacts(text, true)).toEqual({ text, removed: [], tail: null });
  });
});
