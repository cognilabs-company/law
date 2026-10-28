import { describe, expect, it } from "vitest";
import { GENERIC_LAYOUTS } from "@/components/admin/studio/sx/ctor/generic";
import { mp09Validate } from "@/components/admin/studio/sx/ctor/k12";
import { isRetiredStudioCode, retiredGroupHref, retiredMoveOf } from "@/lib/studio/retired";

describe("removed Studio constructors", () => {
  it.each(["SEC01", "K10", "k12-m", "MP08", "INT03"])("%s is gone and lands on the Studio home", (code) => {
    expect(isRetiredStudioCode(code)).toBe(true);
    const move = retiredMoveOf(code);
    expect(move && retiredGroupHref(move)).toBe(`/admin/studio?retired=${code.toUpperCase()}`);
  });

  it("a moved constructor still goes to its group", () => {
    expect(retiredGroupHref(retiredMoveOf("K05")!)).toBe("/admin/studio/g/services_packages?retired=K05");
  });

  it("live constructors are untouched", () => {
    expect(isRetiredStudioCode("K31")).toBe(false);
    expect(retiredMoveOf("K17")).toBeNull();
  });
});

describe("K17 v3 (TSK-342697)", () => {
  const validate = GENERIC_LAYOUTS.K17.validate!;
  it("a paid plan needs a price; a free one does not", () => {
    expect(validate({ is_free: false, benefits: ["A"] })).toEqual({ monthly_price: "@code:k17_price_required" });
    expect(validate({ is_free: false, six_month_price: 0, yearly_price: "" })).toEqual({ monthly_price: "@code:k17_price_required" });
    expect(validate({ is_free: false, yearly_price: 1609200 })).toEqual({});
    expect(validate({ is_free: true })).toEqual({});
  });
  it("refuses the same benefit line twice, whatever the case", () => {
    expect(validate({ is_free: true, benefits: ["Cheksiz konsultatsiya", { value: "200+ shablon" }, " cheksiz KONSULTATSIYA "] })).toEqual({ "benefits.2": "@code:benefit_duplicate" });
  });
});

describe("MP09 promotion", () => {
  it("checks the discount, the usage limit and the dates", () => {
    expect(mp09Validate({ target_type: "subscription", discount_type: "percent", discount_value: 120, usage_limit: 0, starts_at: "2026-11-02T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" })).toEqual({
      discount_value: "@code:maximum:100",
      usage_limit: "@code:minimum:1",
      ends_at: "@code:campaign_ends_before_start",
    });
    expect(mp09Validate({ target_type: "advertising", discount_type: "fixed", discount_value: 0 })).toEqual({ discount_value: "@code:minimum:1" });
    expect(mp09Validate({ target_type: "advertising", discount_type: "fixed", discount_value: 15000 })).toEqual({});
  });
});

describe("tariff version: developer task (TSK-692647)", () => {
  // Gaps closed 2026-10-28 §10: the task, the workflow approval and the
  // superadmin's decision; any may be null on a historical version.
  it("reads the task by its human code and the superadmin's decision", async () => {
    const { versionOf } = await import("@/lib/services/tariffs");
    const v = versionOf({
      id: "v1",
      version: 3,
      status: "draft",
      developer_task_id: "uuid-x",
      developer_deadline_at: "2026-11-30T00:00:00Z",
      developer_task: { id: "uuid-x", task_code: "TSK-123456", title: "Tarifni ishlab chiqish", status: "in_progress", deadline_at: "2026-11-30T00:00:00Z", assignees: [{ id: "2b0a4af1-b3b9-421c-8b5a-229c20bd59f3", name: "Abdurahmon" }] },
      approval: { status: "submitted" },
      superadmin_approval: { status: "done", decision: "approve", decided_at: "2026-11-01T00:00:00Z", actor: { id: "a", name: "Bosh admin" } },
    });
    expect(v.devTask).toEqual({ code: "TSK-123456", title: "Tarifni ishlab chiqish", status: "in_progress", deadlineAt: "2026-11-30T00:00:00Z", assignees: ["Abdurahmon"] });
    expect(v.approval).toEqual({ status: "approve", decision: "approve", by: "Bosh admin", at: "2026-11-01T00:00:00Z" });
    expect(versionOf({ id: "v2", status: "draft", approval: { status: "submitted" }, superadmin_approval: { status: "pending" } }).approval?.status).toBe("pending");
    expect(versionOf({ id: "v3", status: "published", developer_task: null, approval: null, superadmin_approval: null })).toMatchObject({ devTask: null, approval: null });
  });
});

describe("K36 price coefficient (TSK-331025)", () => {
  const validate = GENERIC_LAYOUTS.K36.validate!;
  it("the condition decides what must be filled", () => {
    expect(validate({ operator: "gte", increase_percent: 10 })).toEqual({ threshold: "@code:required" });
    expect(validate({ operator: "gte", threshold: 10, increase_percent: 10 })).toEqual({});
    expect(validate({ operator: "between", range_min: 10, range_max: 5, increase_percent: 10 })).toEqual({ range_max: "@code:k36_range_order" });
    expect(validate({ operator: "in", allowed_values: [], increase_percent: 10 })).toEqual({ allowed_values: "@code:required" });
  });
  it("the increase stays above 0 and at most 100", () => {
    expect(validate({ operator: "eq", threshold: 1, increase_percent: 0 })).toEqual({ increase_percent: "@code:k36_percent_range" });
    expect(validate({ operator: "eq", threshold: 1, increase_percent: 150 })).toEqual({ increase_percent: "@code:k36_percent_range" });
  });
});
