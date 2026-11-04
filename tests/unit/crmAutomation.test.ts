import { describe, expect, it } from "vitest";
import {
  approvalDraftOf,
  automationCatalogOf,
  automationMetricsOf,
  automationRunXOf,
  automationRuleOf,
  condBody,
  condTreeOf,
  readableRows,
  ruleBody,
  rulePreviewOf,
  smartScriptOf,
  type CondGroup,
} from "@/lib/services/crmAutomation";
import { crmEventOf, crmLeadOf, CRM_ERROR_CODES } from "@/lib/services/crm";
import { ROP_NAV, isRopAccount, ropActive, ropVisible } from "@/components/crm/rop/ropNav";
import { crmMetaOf } from "@/lib/services/crm";

// ROP CRM final contract 2026-11-04 §16–§19, §22, §23.

const CATALOG = {
  triggers: [{ key: "call_no_answer", title: "Qo'ng'iroqqa javob berilmadi", description: "Mijoz javob bermadi", group: "calls" }],
  actions: [
    {
      key: "send_sms",
      title: "SMS tayyorlash",
      description: "Mijozga SMS loyihasi",
      group: "communication",
      risk: "high",
      integration: "sms",
      approval_required: true,
      client_facing: true,
      fields: [
        { key: "body", label: "Matn", type: "textarea", required: true },
        { key: "language", label: "Til", type: "select", options: [{ value: "uz_latn", label: "O'zbekcha" }, "ru"] },
      ],
    },
    { key: "plan_call", title: "Qo'ng'iroq rejalash", group: "communication", fields: [{ name: "due_in_minutes", type: "integer", default: 30, min: 1 }] },
  ],
  condition_operators: ["eq", "ne", "in", "not_in", "contains", "not_contains", "exists", "not_exists", "gt", "gte", "lt", "lte"],
  execution_modes: [{ key: "sequential", label: "Ketma-ket", description: "Birin-ketin" }],
  statuses: ["draft", "active", "paused", "archived"],
  integrations: { sms: { available: false } },
  safety_rules: ["Mijozga yuboriladigan har bir xabar tasdiqdan o'tadi"],
  action_groups: [{ key: "communication", title: "Muloqot" }],
};

describe("automation catalog", () => {
  it("reads triggers, actions with fields, operators, modes and safety", () => {
    const c = automationCatalogOf(CATALOG);
    expect(c.triggers[0]).toMatchObject({ key: "call_no_answer", label: "Qo'ng'iroqqa javob berilmadi", group: "calls" });
    expect(c.actions.map((a) => a.key)).toEqual(["send_sms", "plan_call"]);
    const sms = c.actions[0];
    expect([sms.approvalRequired, sms.clientFacing, sms.risk, sms.integrationAvailable]).toEqual([true, true, "high", false]);
    expect(sms.fields.map((f) => [f.key, f.type, f.required])).toEqual([["body", "textarea", true], ["language", "select", false]]);
    expect(sms.fields[1].options.map((o) => o.value)).toEqual(["uz_latn", "ru"]);
    expect(c.actions[1].fields[0]).toMatchObject({ key: "due_in_minutes", type: "integer", defaultValue: 30, min: 1 });
    expect(c.operators).toHaveLength(12);
    expect(c.executionModes[0]).toMatchObject({ value: "sequential", label: "Ketma-ket" });
    expect(c.safetyRules).toHaveLength(1);
    expect(c.groups[0]).toMatchObject({ value: "communication", label: "Muloqot" });
  });
  it("accepts actions sent as a map keyed by type", () => {
    const c = automationCatalogOf({ actions: { notify_rop: { title: "ROPga xabar", fields: [] } } });
    expect(c.actions[0]).toMatchObject({ key: "notify_rop", label: "ROPga xabar" });
  });
  it("reads smart scripts", () => {
    expect(smartScriptOf({ key: "no_answer_recovery", title: "Javobsiz", trigger_type: "call_no_answer", actions: [{ type: "send_sms" }] })).toMatchObject({ key: "no_answer_recovery", trigger: "call_no_answer", actions: ["send_sms"] });
  });
});

describe("conditions", () => {
  it("sends a flat list while everything is AND", () => {
    const g = condTreeOf([{ field: "lead.status", operator: "in", value: ["new"] }, { field: "lead.score", operator: "exists", value: "x" }]);
    expect(condBody(g)).toEqual([
      { field: "lead.status", operator: "in", value: ["new"] },
      { field: "lead.score", operator: "exists", value: null },
    ]);
  });
  it("sends a tree once OR or nesting is used, and reads it back", () => {
    const tree = { operator: "or", conditions: [{ field: "lead.urgency", operator: "eq", value: "urgent" }, { operator: "and", conditions: [{ field: "lead.score", operator: "eq", value: "hot" }, { field: "lead.cycle_number", operator: "gt", value: 1 }] }] };
    const g = condTreeOf(tree);
    expect(g.op).toBe("or");
    expect((g.items[1] as CondGroup).items).toHaveLength(2);
    expect(condBody(g)).toEqual(tree);
    // {all|any} trees are read too.
    expect(condTreeOf({ any: [{ field: "a", operator: "eq", value: 1 }] }).op).toBe("or");
  });
});

describe("rules", () => {
  it("round-trips a rule with mode, policy and lock version", () => {
    const r = automationRuleOf({ id: "r1", name: "Javobsiz", description: "d", trigger_type: "call_no_answer", delay_seconds: 180, priority: 10, execution_mode: "sequential", stop_policy: { stop_on_reply: true }, conditions: [], actions: [{ type: "send_sms", body: "Salom" }], status: "archived", lock_version: 4 });
    expect([r.status, r.lockVersion, r.executionMode, r.actions[0].params]).toEqual(["archived", 4, "sequential", { body: "Salom" }]);
    const b = ruleBody({ ...r, name: " Javobsiz " });
    expect(b).toMatchObject({ name: "Javobsiz", trigger_type: "call_no_answer", delay_seconds: 180, execution_mode: "sequential", stop_policy: { stop_on_reply: true }, actions: [{ type: "send_sms", body: "Salom" }] });
  });
  it("reads a preview without writes", () => {
    const p = rulePreviewOf({ summary: "SMS yuboriladi", warnings: ["Tasdiq kerak"], condition_trace: [{ field: "lead.status", operator: "eq", value: "new", matched: true }], writes_performed: false, matched: true });
    expect([p.summary, p.warnings, p.trace[0].matched, p.writesPerformed, p.matched]).toEqual(["SMS yuboriladi", ["Tasdiq kerak"], true, false, true]);
  });
});

describe("runs, drafts, metrics", () => {
  it("offers retry/cancel only when the run allows it", () => {
    expect(automationRunXOf({ id: "a", status: "failed", steps: [{ action_type: "send_sms", status: "failed", attempts: 2, error: { message: "SMS off" } }] })).toMatchObject({ canRetry: true, canCancel: false, steps: [{ index: 0, attempts: 2, error: "SMS off" }] });
    expect(automationRunXOf({ id: "b", status: "scheduled" })).toMatchObject({ canRetry: false, canCancel: true });
    expect(automationRunXOf({ id: "c", status: "failed", can_retry: false })).toMatchObject({ canRetry: false });
  });
  it("marks editable drafts", () => {
    expect(approvalDraftOf({ id: "d", status: "pending_approval", payload: { body: "Salom" }, editable_fields: ["body"] })).toMatchObject({ editable: true, editableFields: ["body"] });
    expect(approvalDraftOf({ id: "e", payload: { body: "x" } }).editable).toBe(false);
  });
  it("reads automation metrics (a 0–1 rate becomes a percent)", () => {
    expect(automationMetricsOf({ total_runs: 10, status_counts: { completed: 8, failed: 2 }, success_rate: 0.8, scheduled_queue_size: 3, queue_lag_seconds: 42 })).toMatchObject({ total: 10, successRate: 80, queueSize: 3, queueLagSec: 42 });
  });
  it("shows values as readable lines, never ids or secrets", () => {
    const rows = readableRows({ body: "Salom", lead_id: "uuid", nested: { to_phone: "+998", token: "x" } });
    expect(rows).toEqual([{ label: "Body", value: "Salom" }, { label: "Nested · To phone", value: "+998" }]);
  });
});

describe("kanban rank, realtime and errors", () => {
  it("reads the backend's kanban.rank", () => {
    expect(crmLeadOf({ id: "l", kanban: { rank: 1500 } }).rank).toBe(1500);
    expect(crmLeadOf({ id: "l" }).rank).toBeNull();
  });
  it("maps every automation event", () => {
    for (const n of ["crm.automation.rule_created", "crm.automation.rule_updated", "crm.automation.run_completed", "crm.automation.run_failed", "crm.automation.approval_required", "crm.automation.sla_escalated"]) {
      expect(crmEventOf({ event: n })?.invalidate).toContain("automation");
    }
  });
  it("knows every §23 code", () => {
    for (const c of ["crm_lead_edit_denied", "crm_automation_rule_version_conflict", "crm_automation_action_configuration_invalid", "crm_automation_trigger_invalid", "crm_automation_run_not_retryable", "crm_automation_run_not_cancellable", "crm_automation_draft_not_found", "crm_export_not_ready", "crm_global_analytics_superadmin_only"]) {
      expect(CRM_ERROR_CODES as readonly string[]).toContain(c);
    }
  });
});

describe("ROP navigation (§4)", () => {
  const ALL = ["crm.analytics.self", "crm.leads.view", "crm.customers.view", "crm.live_calls.view", "crm.automation.manage", "crm.exports.create"];
  it("shows every row with the full ROP set and none for revenue", () => {
    expect(ropVisible(crmMetaOf({ permissions: ALL })).map((i) => i.key)).toEqual(["overview", "leads", "kanban", "customers", "operators", "live", "robots", "runs", "drafts", "templates", "exports"]);
    expect(ROP_NAV.some((i) => /revenue/i.test(i.key))).toBe(false);
  });
  it("drops a row when its permission is revoked", () => {
    const keys = ropVisible(crmMetaOf({ permissions: ALL.filter((p) => p !== "crm.automation.manage") })).map((i) => i.key);
    expect(keys).not.toContain("robots");
    expect(keys).not.toContain("drafts");
  });
  it("matches nested pages to their row and picks the ROP account", () => {
    const items = ropVisible(crmMetaOf({ permissions: ALL }));
    expect(ropActive(items, "/admin/crm/leads/abc")?.key).toBe("leads");
    expect(ropActive(items, "/admin/crm/automation/runs")?.key).toBe("runs");
    expect(ropActive(items, "/admin/crm")?.key).toBe("overview");
    expect(isRopAccount(["sales_head"])).toBe(true);
    expect(isRopAccount(["sales_head", "superadmin"])).toBe(false);
    expect(isRopAccount(["call_center"])).toBe(false);
  });
});
