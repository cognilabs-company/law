import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";
import {
  aiApplyBody,
  aiCardsOf,
  applyAiRun,
  assignLead,
  canArchiveContact,
  crmContactOf,
  crmCustomerDetailOf,
  changeLeadStatus,
  chronological,
  crmActivityOf,
  crmAnalyticsOf,
  crmCallOf,
  callCompleteBody,
  callEnded,
  crmSmsOf,
  smsBody,
  smsEditable,
  crmCan,
  crmEventOf,
  crmGlobalAnalytics,
  crmHistoryOf,
  reopenBody,
  crmLeadOf,
  crmMetaOf,
  crmMetricsOf,
  crmNextStatuses,
  isClaimRace,
  isVersionConflict,
  leadCan,
  leadCreateBody,
  leadQueryString,
  transferLead,
  updateCrmLead,
  type CrmLead,
} from "@/lib/services/crm";
import { placeLead } from "@/components/crm/leadQuery";
import { donutArcs } from "@/components/crm/StatusDonut";
import { sectionOk, visibleSections } from "@/components/crm/sections";

// The CRM client against the production shapes of 26 Oct 2026 (GET
// /crm/meta, /crm/leads, /crm/me/metrics, /crm/analytics).

// GET /crm/meta of release 13cb257 (29 Oct 2026): the six fixed statuses.
const LIVE_META = {
  statuses: [
    { key: "new", title: "Yangi", color: "#2563eb", order: 10, is_final: false, transitions: ["qualified", "proposal", "decision_pending", "won", "rejected"] },
    { key: "qualified", title: "Saralangan", color: "#7c3aed", order: 20, is_final: false, transitions: ["proposal", "decision_pending", "won", "rejected"] },
    { key: "proposal", title: "Taklif", color: "#0891b2", order: 30, is_final: false, transitions: ["qualified", "decision_pending", "won", "rejected"] },
    { key: "decision_pending", title: "Qaror kutilmoqda", color: "#d97706", order: 40, is_final: false, transitions: ["proposal", "won", "rejected"] },
    { key: "won", title: "Yutildi", color: "#16a34a", order: 50, is_final: true, transitions: [] },
    { key: "rejected", title: "Rad etilgan", color: "#dc2626", order: 60, is_final: true, transitions: [] },
  ],
  scores: ["cold", "warm", "hot"],
  languages: ["uz_latn", "uz_cyrl", "ru"],
  contact_types: ["phone", "telegram", "email"],
  sources: ["manual", "web", "phone"],
  customer_lifecycles: ["prospect", "customer"],
  permissions: ["crm.leads.view", "crm.leads.claim", "crm.analytics.self"],
  scope: "own_and_unassigned",
  revenue_visible: false,
  telephony: { provider: "disabled", enabled: false, recording_consent_required: true, live_transcription: true },
  automation: { actions: ["send_sms", "create_task"], sms_operator_approval_default: true, no_answer_sms_delay_seconds: 180 },
  detail_rendering: { field: "detail_sections", raw_json_forbidden: true },
};

const LEAD = { id: "l1", work_id: "LEAD-1", status: "qualified", lock_version: 4, allowed_actions: ["view_timeline", "change_status", "claim"], customer: { id: "c1", public_id: "CRM-1", name: "Mijoz" }, watchers: [] };

describe("meta", () => {
  it("builds the status selector from the backend's own map", () => {
    const m = crmMetaOf(LIVE_META);
    expect(m.statuses).toEqual(["new", "qualified", "proposal", "decision_pending", "won", "rejected"]);
    expect(crmNextStatuses(m, "new")).toEqual(["qualified", "proposal", "decision_pending", "won", "rejected"]);
    expect(crmNextStatuses(m, "won")).toEqual([]);
    expect(crmNextStatuses(m, "nonsense")).toEqual([]);
    expect([m.telephony.enabled, m.telephony.liveTranscription, m.telephony.recordingAccess]).toEqual([false, true, false]);
    expect([m.automationActions, m.noAnswerSmsDelaySec, m.lifecycles]).toEqual([["send_sms", "create_task"], 180, ["prospect", "customer"]]);
  });
  it("gates by permission codes, never by role", () => {
    const m = crmMetaOf(LIVE_META);
    expect(crmCan(m, "crm.leads.view")).toBe(true);
    expect(crmCan(m, "crm.customers.merge")).toBe(false);
    expect(crmGlobalAnalytics(m)).toBe(false);
    // The permission opens global analytics; revenue_visible only shows money.
    expect(crmGlobalAnalytics(crmMetaOf({ ...LIVE_META, permissions: ["crm.analytics.global"], revenue_visible: false }))).toBe(true);
  });
  it("uses each lead's allowed_actions", () => {
    const l = crmLeadOf(LEAD);
    expect(leadCan(l, "claim")).toBe(true);
    expect(leadCan(l, "transfer")).toBe(false);
    expect(leadCan(null, "claim")).toBe(false);
  });
});

describe("revenue never reaches an operator", () => {
  it("drops revenue from operator metrics", () => {
    const m = crmMetricsOf({ total: 3, active: 2, won: 1, conversion_percent: 33.3, average_first_response_minutes: 12, overdue_next_actions: 1, revenue_visible: false, paid_revenue: 999 });
    expect(m).toMatchObject({ total: 3, active: 2, won: 1, conversion: 33.3, firstResponseMin: 12, overdue: 1 });
    expect(JSON.stringify(m)).not.toContain("999");
  });
  it("hides paid revenue unless the backend marks it visible", () => {
    expect(crmAnalyticsOf({ paid_revenue: 25039162, revenue_visible: false }).paidRevenue).toBeNull();
    expect(crmAnalyticsOf({ paid_revenue: 25039162, revenue_visible: true }).paidRevenue).toBe(25039162);
  });
});

describe("telephony and recordings", () => {
  it("never keeps a recording or transcript without recording_access", () => {
    const raw = { id: "c", status: "completed", recording_url: "https://x/rec.mp3", transcript: [{ t: "hi" }] };
    expect(crmCallOf(raw, false)).toMatchObject({ recordingUrl: "", transcript: [] });
    expect(crmCallOf(raw, true).recordingUrl).toBe("https://x/rec.mp3");
  });
});

describe("lead writes carry the lock version", () => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    sent.length = 0;
  });
  const stub = (answer: unknown, status = 200) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
        return new Response(JSON.stringify(answer), { status, headers: { "content-type": "application/json" } });
      }),
    );
  it("status, edit, assign and transfer all send expected_lock_version", async () => {
    stub({ ...LEAD, lock_version: 5 });
    const lead = crmLeadOf(LEAD);
    await changeLeadStatus(lead, "qualified", "Gaplashildi", "2026-10-27T09:00:00+05:00");
    await updateCrmLead(lead, { title: "Shartnoma" });
    await assignLead(lead, "op-2", "");
    await transferLead(lead, "op-3", "Smena almashdi");
    expect(sent.map((s) => s.body.expected_lock_version)).toEqual([4, 4, 4, 4]);
    expect(sent[0].body).toMatchObject({ status: "qualified", reason: "Gaplashildi" });
    expect(sent[3].url).toMatch(/\/crm\/leads\/l1\/transfer$/);
  });
  it("a transfer without a reason never leaves the browser", () => {
    expect(() => transferLead(crmLeadOf(LEAD), "op-3", "  ")).toThrow();
  });
  it("tells a version conflict and a lost claim apart by detail.code", async () => {
    stub({ detail: { code: "crm_lead_version_conflict", message: "changed" } }, 409);
    const e = await changeLeadStatus(crmLeadOf(LEAD), "qualified", "x").catch((x) => x);
    expect(isVersionConflict(e)).toBe(true);
    expect(isClaimRace(e)).toBe(false);
    const race = new ApiError(409, "taken", undefined, { code: "crm_lead_already_claimed" });
    expect(isClaimRace(race)).toBe(true);
    expect(isVersionConflict(race)).toBe(false);
  });
  it("AI apply sends only the ticked paths, their edits and the lock", async () => {
    stub({ ok: true });
    await applyAiRun("run-1", ["summary", "urgency", "summary"], { summary: "Tuzatilgan matn", reply_drafts: "not ticked" }, 7);
    expect(sent[0].url).toMatch(/\/crm\/ai\/runs\/run-1\/apply$/);
    expect(sent[0].body).toEqual({ selected_paths: ["summary", "urgency"], overrides: { summary: "Tuzatilgan matn" }, expected_lock_version: 7 });
  });
});

describe("AI suggestion cards", () => {
  it("offers lead fields to apply and drafts to copy only", () => {
    const cards = aiCardsOf({ summary: "S", urgency: "high", risk_flags: ["deadline"], reply_drafts: ["Assalomu alaykum"], next_action: { at: "2026-10-27T09:00:00Z", note: "Qo'ng'iroq" }, auto_executed: false });
    const by = Object.fromEntries(cards.map((c) => [c.path, c]));
    expect(by.summary.applicable).toBe(true);
    expect(by.urgency.applicable).toBe(true);
    expect(by["next_action.at"].applicable).toBe(true);
    expect(by.risk_flags.applicable).toBe(false);
    expect(by.reply_drafts.applicable).toBe(false);
    expect(aiApplyBody([], {}, 1)).toEqual({ selected_paths: [], overrides: {}, expected_lock_version: 1 });
  });
});

describe("lists and timeline", () => {
  it("puts every filter in the backend query", () => {
    const q = leadQueryString({ queueOnly: true, status: "new", score: "hot", q: " ali ", operator: "op", nextTo: "2026-10-26T12:00:00Z", limit: 50, offset: 100 });
    expect(q).toContain("queue_only=true");
    expect(q).toContain("status=new");
    expect(q).toContain("score=hot");
    expect(q).toContain("q=ali");
    expect(q).toContain("assigned_operator_user_id=op");
    expect(q).toContain("next_action_to=");
    expect(q).toContain("offset=100");
    expect(q).not.toContain("mine_only");
  });
  // CRM contract 2026-10-27 §7: always one CRM customer; no category,
  // no client_user_id, no inline customer.
  it("creates a lead for one CRM customer, never sending category or a user id", () => {
    const b = leadCreateBody({ title: " A ", customerId: "c1", region: "Samarqand" });
    expect(b).toMatchObject({ customer_id: "c1", title: "A", region: "Samarqand" });
    expect(b).not.toHaveProperty("category");
    expect(b).not.toHaveProperty("client_user_id");
    expect(b).not.toHaveProperty("customer");
  });
  it("shows the timeline oldest first", () => {
    const items = [crmActivityOf({ id: "b", created_at: "2026-10-26T10:00:00Z" }), crmActivityOf({ id: "a", created_at: "2026-10-26T09:00:00Z" })];
    expect(chronological(items).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("realtime → what refetches", () => {
  it("maps each crm event to its caches, never to an append", () => {
    expect(crmEventOf({ event: "crm.resync" })?.invalidate).toEqual(["all"]);
    expect(crmEventOf({ event: "crm.lead.claimed", lead_id: "l1" })).toMatchObject({ leadId: "l1", invalidate: expect.arrayContaining(["queue", "lead"]) });
    expect(crmEventOf({ event: "crm.lead.status_changed", data: { lead_id: "l2" } })).toMatchObject({ leadId: "l2", invalidate: expect.arrayContaining(["lead", "metrics"]) });
    expect(crmEventOf({ event: "crm.ai.completed", run_id: "r1", lead_id: "l1" })?.invalidate).toEqual(["ai"]);
    expect(crmEventOf({ event: "crm.export.ready", export_id: "x1" })).toMatchObject({ exportId: "x1", invalidate: ["export"] });
    expect(crmEventOf({ event: "notification.created", notification: { data: { event: "crm.lead.created", lead_id: "l9" } } })).toMatchObject({ name: "crm.lead.created", leadId: "l9" });
    expect(crmEventOf({ event: "marketplace.order_paid" })).toBeNull();
  });
});

describe("board placement", () => {
  const L = (id: string, status: string) => ({ id, status }) as unknown as CrmLead;
  const cols = () => [
    { status: "contacted", items: [L("a", "contacted"), L("b", "contacted")], total: 5 },
    { status: "qualified", items: [L("c", "qualified")], total: 1 },
  ];
  it("moves a lead to the top of its new column and fixes both totals", () => {
    const out = placeLead(cols(), L("a", "qualified"));
    expect(out[0].items.map((x) => x.id)).toEqual(["b"]);
    expect(out[0].total).toBe(4);
    expect(out[1].items.map((x) => x.id)).toEqual(["a", "c"]);
    expect(out[1].total).toBe(2);
  });
  it("replaces in place when the status did not change (fresh lock, same column)", () => {
    const fresh = { ...L("b", "contacted"), lockVersion: 9 } as CrmLead;
    const out = placeLead(cols(), fresh);
    expect(out[0].items[0]).toBe(fresh);
    expect(out[0].items).toHaveLength(2);
    expect(out[0].total).toBe(5);
  });
  it("drops a lead whose status has no column, never below zero", () => {
    const out = placeLead([{ status: "contacted", items: [L("a", "contacted")], total: 0 }], L("a", "won"));
    expect(out[0].items).toEqual([]);
    expect(out[0].total).toBe(0);
  });
});

describe("status donut", () => {
  it("gives each non-empty status its share of the ring, in order, with gaps", () => {
    const arcs = donutArcs([
      { status: "new", count: 1 },
      { status: "contacted", count: 0 },
      { status: "won", count: 3 },
    ]);
    const C = 2 * Math.PI * 70;
    expect(arcs.map((a) => a.status)).toEqual(["new", "won"]);
    expect(arcs[0].share).toBe(0.25);
    expect(arcs[1].offset).toBeCloseTo(C / 4);
    expect(arcs[0].length).toBeLessThan(C / 4);
  });
  it("draws one full ring for a single status and nothing for none", () => {
    expect(donutArcs([{ status: "won", count: 4 }])[0].length).toBeCloseTo(2 * Math.PI * 70);
    expect(donutArcs([{ status: "won", count: 0 }])).toEqual([]);
  });
});

describe("CRM customer / lead contract 2026-10-27", () => {
  it("a customer body never carries user_id", async () => {
    const { customerBody } = await import("@/lib/services/crm");
    expect(customerBody({ name: " Aziza ", contacts: [{ type: "phone", value: "+998901234567", primary: true }] })).not.toHaveProperty("user_id");
  });
  it("reads the select's options with their display label and badge", async () => {
    const { customerOptionOf } = await import("@/lib/services/crm");
    const o = customerOptionOf({ id: "c1", public_id: "CRM-12AB34CD", name: "Aziza", region: "Toshkent", primary_phone: "+998901234567", is_lexgo_user: true, lexgo_user_label: "LexGo foydalanuvchisi", lead_count: 3, display_label: "Aziza · CRM-12AB34CD · +998901234567" });
    expect(o).toMatchObject({ id: "c1", label: "Aziza · CRM-12AB34CD · +998901234567", isLexgoUser: true, region: "Toshkent", leadCount: 3 });
    expect(customerOptionOf({ id: "c2", name: "Bek", public_id: "CRM-1" }).label).toBe("Bek · CRM-1");
  });
  it("reads detail_sections with nested groups; empty sections dropped", async () => {
    const { detailSectionsOf } = await import("@/lib/services/crm");
    const s = detailSectionsOf([
      { key: "request", title: "Murojaat", items: [{ key: "title", label: "Nomi", value_type: "text", value: "X", items: [] }] },
      { key: "additional", title: "Qo'shimcha", items: [{ key: "g", label: "G", value_type: "group", value: null, items: [{ key: "a", label: "A", value_type: "boolean", value: true, items: [] }] }] },
      { key: "empty", title: "E", items: [] },
    ]);
    expect(s.map((x) => x.key)).toEqual(["request", "additional"]);
    expect(s[1].items[0].items[0]).toMatchObject({ type: "boolean", value: true });
  });
  it("a payload is readable only when something besides ids and codes is left", async () => {
    const { hasReadable } = await import("@/components/crm/DetailSections");
    expect(hasReadable({ moved_by_user_id: "2b0a4af1-b3b9-421c-8b5a-229c20bd59f3", column_key: "new_lead" })).toBe(false);
    expect(hasReadable({ note: "Mijoz qayta qo'ng'iroq qiladi" })).toBe(true);
    expect(hasReadable({ duration_sec: 240 })).toBe(true);
  });
});

describe("dynamic kanban (contract 2026-10-28)", () => {
  it("reads columns from the meta, in the backend's order, with colour and the final flag", async () => {
    const { crmMetaOf } = await import("@/lib/services/crm");
    const m = crmMetaOf({ statuses: [{ key: "won", title: "Won", color: "#059669", order: 50, is_final: true }, { key: "new", title: "New", color: "#2563eb", order: 10, is_final: false }, { key: "follow_up", title: "Qayta aloqa", color: "nope", order: 20 }] });
    expect(m.statuses).toEqual(["new", "follow_up", "won"]);
    expect(m.statusInfo[1]).toEqual({ key: "follow_up", title: "Qayta aloqa", color: "", order: 20, isFinal: false });
  });
  it("the journey is the open columns, then where the lead ended (or the first final one)", async () => {
    const { crmMetaOf, journeyOf } = await import("@/lib/services/crm");
    const m = crmMetaOf({ statuses: [{ key: "new", order: 10 }, { key: "contacted", order: 20 }, { key: "won", order: 50, is_final: true }, { key: "lost", order: 60, is_final: true }] });
    expect(journeyOf(m, "contacted")).toEqual(["new", "contacted", "won"]);
    expect(journeyOf(m, "lost")).toEqual(["new", "contacted", "lost"]);
  });
  it("a drop between two cards becomes the exact zero-based position in the full column", async () => {
    const { positionIn } = await import("@/lib/services/crm");
    const order = ["a", "b", "x", "c", "d"];
    expect(positionIn(order, "x", "c", "b")).toBe(2); // where it already is
    expect(positionIn(order, "x", "a", null)).toBe(0); // to the top
    expect(positionIn(order, "x", null, "d")).toBe(4); // to the end
    expect(positionIn(order, "n", "c", null)).toBe(3); // from another column
    expect(positionIn(["a", "b"], "n", "gone", null)).toBe(0);
  });
});

// Contract 13cb257 §5/§20: the menu is built from permissions, never roles.
describe("sections by permission", () => {
  const keys = (perms: string[]) => visibleSections(crmMetaOf({ ...LIVE_META, permissions: perms })).map((s) => s.key);
  const OPERATOR = ["crm.customers.view", "crm.customers.manage", "crm.leads.view", "crm.leads.manage", "crm.leads.claim", "crm.ai.use", "crm.calls.start", "crm.sms.manage", "crm.analytics.self"];
  const ROP = [...OPERATOR, "crm.leads.view_all", "crm.leads.assign", "crm.customers.merge", "crm.automation.manage", "crm.exports.create", "crm.templates.manage"];
  const SUPER = [...ROP, "crm.analytics.global", "crm.revenue.view", "crm.live_calls.view", "crm.calls.recordings.view"];
  it("an operator sees their own work, never robots, global analytics, live office or exports", () => {
    expect(keys(OPERATOR)).toEqual(["overview", "leads", "customers", "performance", "calls", "sms", "templates"]);
  });
  it("a sales head adds robots and exports", () => {
    expect(keys(ROP)).toEqual(["overview", "leads", "customers", "performance", "calls", "sms", "templates", "automation", "exports"]);
  });
  it("a superadmin sees all eleven", () => {
    expect(keys(SUPER)).toHaveLength(11);
    expect(sectionOk("live", crmMetaOf({ ...LIVE_META, permissions: SUPER }))).toBe(true);
    expect(sectionOk("live", crmMetaOf({ ...LIVE_META, permissions: OPERATOR }))).toBe(false);
  });
  it("nothing without meta", () => {
    expect(visibleSections(null)).toEqual([]);
  });
});

// §2/§8: lifecycle, account linking and the last active contact.
describe("customers", () => {
  const contact = (id: string, status = "active") => crmContactOf({ id, contact_type: "phone", value: "+998901234567", status });
  it("the last active contact cannot be archived", () => {
    expect(canArchiveContact([contact("a")], "a")).toBe(false);
    expect(canArchiveContact([contact("a"), contact("b", "archived")], "a")).toBe(false);
    expect(canArchiveContact([contact("a"), contact("b")], "a")).toBe(true);
  });
  it("reads lifecycle and account linking; prospect until a paid purchase", () => {
    const c = crmCustomerDetailOf({ id: "c1", public_id: "CRM-1", lifecycle: "customer", became_customer_at: "2026-10-20T10:00:00Z", account_linking: { status: "linked", automatic_by_verified_phone: true, required_action: "" } });
    expect([c.lifecycle, c.becameCustomerAt, c.linking.linked]).toEqual(["customer", "2026-10-20T10:00:00Z", true]);
    const p = crmCustomerDetailOf({ id: "c2", account_linking: { status: "unlinked", automatic_by_verified_phone: true, required_action: "Telefonni tasdiqlang" } });
    expect([p.lifecycle, p.linking.linked, p.linking.requiredAction]).toEqual(["prospect", false, "Telefonni tasdiqlang"]);
  });
});

// §2/§7: reopen as a new cycle; the history keeps every cycle.
describe("cycles", () => {
  it("a reopen sends the new inquiry, its source and reason", () => {
    expect(reopenBody({ inquiry: " Yana ", source: "phone", reason: "", operatorId: "" })).toEqual({ inquiry: "Yana", source: "phone", reason: "Yangi murojaat", assigned_operator_user_id: null });
  });
  it("reads cycles newest first with their final status", () => {
    const h = crmHistoryOf({ current_cycle_id: "b", cycle_number: 2, cycles: [{ id: "a", sequence: 1, terminal_status: "won" }, { id: "b", sequence: 2, terminal_status: "" }], status_history: [{ id: "e1", title: "Holat o'zgardi" }] });
    expect(h.cycles.map((c) => [c.sequence, c.terminalStatus])).toEqual([
      [2, ""],
      [1, "won"],
    ]);
    expect(h.events).toHaveLength(1);
  });
  it("a lead carries its cycle number and order state by work ID", () => {
    const l = crmLeadOf({ id: "l", cycle_number: 3, converted_order_id: "o-uuid", converted_order: { id: "o-uuid", work_id: "ORD-7", payment_status: "unpaid" } });
    expect([l.cycleNumber, l.order?.workId, l.order?.paymentStatus]).toEqual([3, "ORD-7", "unpaid"]);
  });
  it("a stale write is any 409 about the version", () => {
    expect(isVersionConflict(new ApiError(409, "x", undefined, { code: "crm_lead_version_conflict" }))).toBe(true);
    expect(isVersionConflict(new ApiError(409, "x", undefined, { code: "crm_lead_stale_version" }))).toBe(true);
    expect(isVersionConflict(new ApiError(409, "x", undefined, { code: "crm_ai_run_active" }))).toBe(false);
  });
});

// §14/§15: calls with the consent text and live transcript; SMS states.
describe("calls and SMS", () => {
  it("reads the consent text from the call's metadata and its transcript", () => {
    const c = crmCallOf({ id: "c1", status: "initiated", contact_id: "k1", metadata: { recording_consent_text: "Suhbat yozib olinmoqda" }, transcript: [{ speaker: "customer", text: "Salom", started_at_ms: 0, ended_at_ms: 900 }, { speaker: "operator", text: " " }] }, false);
    expect([c.consentText, c.contactId, c.transcript.length, callEnded(c)]).toEqual(["Suhbat yozib olinmoqda", "k1", 1, false]);
    expect(callEnded(crmCallOf({ id: "c2", status: "no_answer" }, false))).toBe(true);
  });
  it("a completion carries the status, summary and transcript", () => {
    expect(callCompleteBody("no_answer", " ", [{ speaker: "customer", text: "Alo", startMs: 0, endMs: 1 }])).toEqual({ status: "no_answer", summary: "", transcript: [{ speaker: "customer", text: "Alo", started_at_ms: 0, ended_at_ms: 1 }], recording_url: "", metadata: {} });
  });
  it("an SMS draft and its states; only drafts and scheduled ones are editable", () => {
    expect(smsBody({ body: " Salom ", language: "uz_latn", contactId: "k1" })).toEqual({ body: "Salom", language: "uz_latn", contact_id: "k1", scheduled_at: null });
    const s = crmSmsOf({ id: "s1", status: "provider_configuration_required", body: "x" });
    expect([s.status, smsEditable(s), smsEditable(crmSmsOf({ id: "s2", status: "draft" }))]).toEqual(["provider_configuration_required", false, true]);
  });
});
