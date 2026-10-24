import { describe, expect, it } from "vitest";
import { categoryName, categoryTitleName } from "@/lib/categoryNames";

describe("category names", () => {
  it("names a known category by slug in each language", () => {
    const c = { slug: "oila-va-nikoh", title: "Оила ва никоҳ" };
    expect(categoryName(c, "uz")).toBe("Oila va nikoh");
    expect(categoryName(c, "ru")).toBe("Семья и брак");
    expect(categoryName(c, "en")).toBe("Family and marriage");
  });

  it("finds a category from the backend's Cyrillic title alone", () => {
    expect(categoryTitleName("Оила ва никоҳ", "ru")).toBe("Семья и брак");
    expect(categoryTitleName("  оила   ва никоҳ ", "uz")).toBe("Oila va nikoh");
  });

  it("keeps the backend title for a category it does not know", () => {
    expect(categoryName({ slug: "new-thing", title: "Yangi bo'lim" }, "ru")).toBe("Yangi bo'lim");
  });
});
