import { describe, expect, it } from "vitest";
import { achievementBody, achievementOf, levelInput, levelOf } from "@/lib/services/achievements";

describe("achievement level", () => {
  it("reads the backend field first, then the level title", () => {
    expect(levelOf("partial", "To'liq yutuq")).toBe("partial");
    expect(levelOf("", "To'liq yutuq")).toBe("full");
    expect(levelOf(undefined, " Qisman yutuq ")).toBe("partial");
    expect(levelOf(null, "Yil advokati")).toBeNull();
  });

  it("sends a level submission with the temporary type, title and date", () => {
    expect(achievementBody(levelInput("full", " Da'vo to'liq qanoatlantirildi ", ["f1"], "2026-10-28"))).toEqual({
      source_id: null,
      achievement_type: "court_dispute_result",
      title: "To'liq yutuq",
      achieved_at: "2026-10-28T00:00:00Z",
      description: "Da'vo to'liq qanoatlantirildi",
      evidence_ids: ["f1"],
      result_level: "full",
    });
  });

  it("keeps the revision source and reads the level back from a saved record", () => {
    expect(achievementBody(levelInput("partial", "Jazo yengillashtirildi", [], "2026-10-28", "root-1")).source_id).toBe("root-1");
    expect(achievementOf({ id: "a1", achievement_type: "court_dispute_result", title: "Qisman yutuq" })?.level).toBe("partial");
    expect(achievementOf({ id: "a2", achievement_type: "award_recognition", title: "Yil advokati" })?.level).toBeNull();
  });
});
