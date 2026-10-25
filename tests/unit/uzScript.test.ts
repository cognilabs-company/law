import { describe, expect, it } from "vitest";
import { uzLatin } from "@/lib/uzScript";

describe("uzLatin", () => {
  it("writes Uzbek Cyrillic in Latin", () => {
    expect(uzLatin("Ота-оналик ҳуқуқидан маҳрум қилиш")).toBe("Ota-onalik huquqidan mahrum qilish");
    expect(uzLatin("Истеъмолчиларга ичимлик ва оқова суви")).toBe("Iste’molchilarga ichimlik va oqova suvi");
    expect(uzLatin("Ғалаба Ўзбекистон шартнома")).toBe("G‘alaba O‘zbekiston shartnoma");
    expect(uzLatin("Ер ва уй-жой")).toBe("Yer va uy-joy");
  });
  it("leaves Latin text alone", () => {
    expect(uzLatin("Qarzdorlikni Undirish")).toBe("Qarzdorlikni Undirish");
  });
});
