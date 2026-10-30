import { describe, expect, it } from "vitest";
import { answerText } from "@/lib/answerText";

const yn = { yes: "Ha", no: "Yo'q" };

describe("a form answer in words", () => {
  it("never shows raw JSON", () => {
    expect(answerText({ full_name: "Ali Valiyev", has_children: true }, yn)).toBe("Full name: Ali Valiyev; Has children: Ha");
    expect(answerText(["uy", "mashina"], yn)).toBe("uy, mashina");
    expect(answerText([{ item: "uy" }, { item: "mashina" }], yn)).toBe("Item: uy, Item: mashina");
    expect(answerText(false, yn)).toBe("Yo'q");
    expect(answerText({ empty: null, n: 3 }, yn)).toBe("N: 3");
  });

  it("uses the screen's own field names when it has them", () => {
    expect(answerText({ region: "Toshkent" }, yn, (k) => (k === "region" ? "Hudud" : k))).toBe("Hudud: Toshkent");
  });
});
