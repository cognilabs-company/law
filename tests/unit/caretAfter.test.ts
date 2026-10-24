import { describe, expect, it } from "vitest";
import { caretAfter } from "@/components/ui/ContactGuardNote";

describe("caret after a cut", () => {
  it("keeps a caret before the cut, moves one after it back by the cut", () => {
    expect(caretAfter("ab +998901234567 cd", "ab cd", 2)).toBe(2);
    expect(caretAfter("ab +998901234567 cd", "ab cd", 19)).toBe(5);
  });
  it("puts a caret inside the cut where the cut began", () => {
    expect(caretAfter("Salom @yozing davomi", "Salom yozing davomi", 7)).toBe(6);
  });
});
