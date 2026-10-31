import { describe, expect, it } from "vitest";
import { ApiError, errDetail, errorCode, isCodeLike, toApiError } from "@/lib/http";
import { errorText } from "@/lib/errorText";

// Backend answers 2026-10-31 §6.3 / §7.6: `detail` is `{code, message?}`,
// a plain string, or a FastAPI 422 list. A known code is localized, an
// unknown one gets the generic message; a raw code is never shown.
const res = (status: number, body: unknown) => toApiError(new Response(JSON.stringify(body), { status }));
const KNOWN: Record<string, string> = {
  "apiErrors.rule_title_exists": "A rule with this name already exists.",
  "apiErrors.experience_evidence_too_large": "The file is larger than 20 MB.",
};
const tc = Object.assign((key: string) => KNOWN[key] ?? `[${key}]`, { has: (key: string) => key in KNOWN });

describe("error parser", () => {
  it("reads the code of an object detail and localizes it", async () => {
    const e = await res(409, { detail: { code: "rule_title_exists", existing_rule_id: "r1", message: "Qoida bor" } });
    expect(errorCode(e)).toBe("rule_title_exists");
    expect(errorText(e, tc)).toBe("A rule with this name already exists.");
  });
  it("a screen's own map wins over the shared table", async () => {
    const e = await res(409, { detail: { code: "rule_title_exists" } });
    expect(errorText(e, tc, { rule_title_exists: "Own words" })).toBe("Own words");
  });
  it("a plain string detail that is a code is the code, never the text", async () => {
    const e = await res(413, { detail: "experience_evidence_too_large" });
    expect(errorCode(e)).toBe("experience_evidence_too_large");
    expect(e.code).toBe("experience_evidence_too_large");
    expect(errDetail(e)).toBe("");
    expect(errorText(e, tc)).toBe("The file is larger than 20 MB.");
  });
  it("a plain string detail in words is shown as the server sent it", async () => {
    const e = await res(403, { detail: "Ruxsat berilmagan amal" });
    expect(errorCode(e)).toBe("");
    expect(errorText(e, tc)).toBe("Ruxsat berilmagan amal");
  });
  it("reads a code from a FastAPI list detail", async () => {
    const e = await res(422, { detail: [{ loc: ["body", "ended_at"], msg: "Value error, experience_dates_invalid", type: "value_error" }] });
    expect(errorCode(e)).toBe("experience_dates_invalid");
    // Unknown here → the generic message, not the code.
    expect(errorText(e, tc)).toBe("[serverError]");
    const ctx = await res(422, { detail: [{ loc: ["body", "x"], msg: "bad", ctx: { code: "rule_title_exists" } }] });
    expect(errorCode(ctx)).toBe("rule_title_exists");
  });
  it("a list detail in words shows its first message", async () => {
    const e = await res(422, { detail: [{ loc: ["body", "title"], msg: "Field required", type: "missing" }] });
    expect(errorCode(e)).toBe("");
    expect(errorText(e, tc)).toBe("Field required");
  });
  it("an unknown code gets the generic message for its status, never the code or its message", async () => {
    const e = await res(409, { detail: { code: "something_new_happened", message: "raw" } });
    expect(errorCode(e)).toBe("something_new_happened");
    expect(errorText(e, tc)).toBe("[conflict]");
    expect(errorText(await res(400, { detail: { code: "x_y" } }), tc)).toBe("[serverError]");
  });
  it("a code-like string detail with no translation gets the generic message", async () => {
    const e = await res(403, { detail: "seller_type_invalid" });
    expect(errorText(e, tc)).toBe("[forbidden]");
    expect(errorText(e, tc)).not.toMatch(/seller_type_invalid/);
  });
  it("tells codes from words", () => {
    for (const c of ["rule_title_exists", "seller.not_found", "forbidden", "auth:expired", "HTTP_403"]) expect(isCodeLike(c)).toBe(true);
    for (const w of ["Not Found", "Forbidden", "Qoida topilmadi", "Нет доступа.", ""]) expect(isCodeLike(w)).toBe(false);
  });
  it("network and abort errors keep their own messages", () => {
    expect(errorText(new ApiError(0, "network_error"), tc)).toBe("[offline]");
    expect(errorText(new ApiError(0, "aborted"), tc)).toBe("");
    expect(errorText(new Error("boom"), tc)).toBe("[serverError]");
  });
});
