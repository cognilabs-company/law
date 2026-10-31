import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { normChecklistItem, clientChecklistItem } from "@/lib/services/marketRuntime";
import { duplicateNameOf, normRuleTitle, reportedTwin, twinsOf, type RuleTwin } from "@/components/admin/studio/sx/schema/ruleDuplicates";
import { executorTypesOf, k01LayoutOf, k02Transform } from "@/components/admin/studio/sx/ctor/services";
import { audienceOfField, bucketOf, seenBy } from "@/components/admin/studio/sx/schema/audience";
import { leftoverFields } from "@/components/admin/studio/sx/journey/steps";

// TSK-602765: a service rule's name is unique once case, spacing,
// apostrophes and punctuation are set aside.
describe("unique service rule names (TSK-602765)", () => {
  const rule = (value: string, title: string, extra: Partial<RuleTwin> = {}): RuleTwin => ({ value, objectId: "", title, version: "1", status: "published", scope: "shared", published: true, ...extra });
  it("normalises case, spaces, apostrophes and punctuation", () => {
    expect(normRuleTitle("  Maxfiylik  QOIDASI! ")).toBe("maxfiylik qoidasi");
    expect(normRuleTitle("Mijoz ma’lumotlari")).toBe(normRuleTitle("mijoz ma'lumotlari"));
  });
  it("finds the twin but never the rule itself or its own lineage", () => {
    const rules = [rule("r1", "Maxfiylik qoidasi", { ruleKey: "k1" }), rule("r2", "Boshqa qoida")];
    expect(twinsOf(rules, "maxfiylik  qoidasi.").map((r) => r.value)).toEqual(["r1"]);
    expect(twinsOf(rules, "Maxfiylik qoidasi", ["r1"])).toEqual([]);
    expect(twinsOf(rules, "Maxfiylik qoidasi", [], { id: "r1", key: "k1" })).toEqual([]);
  });
  it("reads the backend's rule_title_exists for a taken name and the existing rule (answers 2026-10-31 §4.1)", () => {
    const e = new ApiError(409, "x", undefined, { code: "rule_title_exists", data: { detail: { code: "rule_title_exists", existing_rule_id: "r1", existing_rule_key: "k1", existing_title: "Maxfiylik qoidasi" } } });
    expect(duplicateNameOf(e)).toMatchObject({ code: "rule_title_exists", existingId: "r1", existingKey: "k1", existingTitle: "Maxfiylik qoidasi" });
    // As a validation error too.
    expect(duplicateNameOf(new ApiError(422, "x", undefined, { code: "rule_title_exists", data: { detail: { code: "rule_title_exists", existing_rule_key: "k1" } } }))).toMatchObject({ existingId: "", existingKey: "k1" });
    expect(duplicateNameOf(new ApiError(422, "x", undefined, { code: "duplicate_value", data: { detail: { code: "duplicate_value" } } }))).toBeNull();
    expect(duplicateNameOf(new ApiError(409, "x", undefined, { code: "studio_version_conflict", data: { detail: { code: "studio_version_conflict" } } }))).toBeNull();
  });
  it("finds the rule the server named by its id, else by its key", () => {
    const rules = [rule("r1", "Maxfiylik qoidasi", { ruleKey: "k1" }), rule("r2", "Boshqa qoida", { ruleKey: "k2" })];
    expect(reportedTwin(rules, { id: "r2", key: "", title: "" })?.title).toBe("Boshqa qoida");
    expect(reportedTwin(rules, { id: "gone", key: "k1", title: "" })?.title).toBe("Maxfiylik qoidasi");
    expect(reportedTwin(rules, { id: "gone", key: "", title: "" })).toBeNull();
  });
});

// TSK-656862: several executor types, an old single one moved in, and the
// usage steps left out of the review step.
describe("executor types and the review step (TSK-656862)", () => {
  it("keeps a clean list and moves an old single type into it", () => {
    expect(executorTypesOf({ executor_types: ["advokat", " yurist ", "advokat", ""] })).toEqual(["advokat", "yurist"]);
    expect(executorTypesOf({ executor_type: "yurist" })).toEqual(["yurist"]);
    expect(executorTypesOf({})).toBeNull();
    const out = k02Transform({ executor_type: "advokat" });
    expect(out.executor_types).toEqual(["advokat"]);
    expect(out).not.toHaveProperty("executor_type");
  });
  it("does not ask for usage steps in the review step", () => {
    expect(leftoverFields("service", [], ["usage_steps", "executor_type", "price_note"])).toEqual(["price_note"]);
  });
});

// TSK-232286: a category is a top-level category or a subcategory.
describe("category or subcategory (TSK-232286)", () => {
  it("drops the parent of a top-level category and requires it for a subcategory", () => {
    const root = k01LayoutOf("root");
    expect(root.transform?.({ title: "Oila", parent_id: "p1" }, {}, undefined as never)).toEqual({ title: "Oila" });
    const sub = k01LayoutOf("sub");
    expect(sub.validate?.({ title: "Aliment" } as never)).toEqual({ parent_id: "@required" });
    expect(sub.validate?.({ title: "Aliment", parent_id: "p1" } as never)).toEqual({});
  });
});

// TSK-732568: the client sees the client's name and only the evidence the
// performer let them see.
describe("checklist items for the client (TSK-732568)", () => {
  it("shows the client title and only the allowed evidence", () => {
    const it0 = normChecklistItem({ id: "i1", executor_title: "Pasportni tekshiring", client_title: "Pasport tekshirildi", comment: "Ichki izoh", files: [{ id: "f1", file_name: "pasport.pdf" }], show_comment_to_client: false, show_files_to_client: true, show_images_to_client: false, status: "done" });
    const c = clientChecklistItem(it0);
    expect(c.title).toBe("Pasport tekshirildi");
    expect(c.executorTitle).toBe("");
    expect(c.comment).toBe("");
    expect(c.files.length).toBe(1);
    expect(JSON.stringify(c.raw)).not.toMatch(/Ichki izoh|Pasportni tekshiring/);
  });
});

// TSK-639097 / TSK-617437: every service field says who reads it, and the
// form groups fields by reader.
describe("who reads each field (TSK-639097, TSK-617437)", () => {
  it("names the reader of the service form's fields and groups them", () => {
    expect(audienceOfField("K02", "service_terms_text", {}, {})?.who).toBe("client");
    expect(audienceOfField("K02", "max_price", {}, {})?.who).toBe("performer");
    expect(audienceOfField("K02", "completion_checklist", {}, {})?.who).toBe("both");
    expect(bucketOf("both")).toBe("shared");
    expect(bucketOf("staff")).toBe("internal");
    expect(seenBy("client", "performer")).toBe(false);
    expect(seenBy("performer", "both")).toBe(true);
  });
});

// TSK-615032: the constructors removed from Studio leave no field labels,
// hints or reader notes behind (their names stay, for the "moved" note).
describe("removed Studio constructors leave nothing behind (TSK-615032)", () => {
  it("has no field strings or reader notes for a removed constructor", async () => {
    const { STUDIO_REMOVED_CODES } = await import("@/lib/studio/retired");
    const prefix = new RegExp(`^(${STUDIO_REMOVED_CODES.map((c) => c.replace(/[-]/g, "\\-")).join("|")})__`);
    for (const lang of ["uz", "ru", "en"]) {
      const d = (await import(`@/messages/${lang}.json`)).default as Record<string, unknown>;
      const keys: string[] = [];
      const walk = (x: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(x)) {
          if (prefix.test(k)) keys.push(k);
          if (v && typeof v === "object") walk(v as Record<string, unknown>);
        }
      };
      walk(d.studio as Record<string, unknown>);
      expect(keys).toEqual([]);
    }
    for (const code of STUDIO_REMOVED_CODES) expect(audienceOfField(code, "title", {}, {})?.use ?? "").not.toBe("callBg");
  });
});
