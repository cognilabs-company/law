import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";
import {
  aiApplyBody,
  aiCardsOf,
  applyAiRun,
  assignLead,
  changeLeadStatus,
  chronological,
  crmActivityOf,
  crmAnalyticsOf,
  crmCallOf,
  crmCan,
  crmEventOf,
  crmGlobalAnalytics,
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

// The CRM client against the production shapes of 26 Oct 2026 (GET
// /crm/meta, /crm/leads, /crm/me/metrics, /crm/analytics).

const LIVE_META = {
  statuses: [
    { key: "new", transitions: ["closed", "contacted"] },
    { key: "contacted", transitions: ["closed", "proposal", "qualified"] },
    { key: "qualified", transitions: ["closed", "payment_pending", "proposal", "won"] },
    { key: "proposal", transitions: ["closed", "payment_pending", "qualified", "won"] },
    { key: "payment_pending", transitions: ["closed", "proposal", "won"] },
    { key: "won", transitions: ["closed"] },
    { key: "closed", transitions: ["new"] },
  ],
  scores: ["cold", "warm", "hot"],
  languages: ["uz_latn", "uz_cyrl", "ru"],
  contact_types: ["phone", "telegram", "email"],
  sources: ["manual", "web", "phone"],
  permissions: ["crm.leads.view", "crm.leads.claim", "crm.analytics.self"],
  scope: "own_and_queue",
  revenue_visible: false,
  telephony: { provider: "disabled", enabled: false, recording_consent_required: true, live_transcription: "provider_pending" },
};

const LEAD = { id: "l1", work_id: "LEAD-1", status: "contacted", lock_version: 4, allowed_actions: ["view_timeline", "change_status", "claim"], customer: { id: "c1", public_id: "CRM-1", name: "Mijoz" }, watchers: [] };

describe("meta", () => {
  it("builds the status selector from the backend's own map", () => {
    const m = crmMetaOf(LIVE_META);
    expect(crmNextStatuses(m, "new")).toEqual(["closed", "contacted"]);
    expect(crmNextStatuses(m, "won")).toEqual(["closed"]);
    expect(crmNextStatuses(m, "closed")).toEqual(["new"]);
    expect(crmNextStatuses(m, "nonsense")).toEqual([]);
    expect(m.telephony.enabled).toBe(false);
    expect(m.telephony.recordingAccess).toBe(false);
  });
  it("gates by permission codes, never by role", () => {
    const m = crmMetaOf(LIVE_META);
    expect(crmCan(m, "crm.leads.view")).toBe(true);
    expect(crmCan(m, "crm.customers.merge")).toBe(false);
    expect(crmGlobalAnalytics(m)).toBe(false);
    // The permission alone is not enough: revenue_visible must be true too.
    expect(crmGlobalAnalytics(crmMetaOf({ ...LIVE_META, permissions: ["crm.analytics.global"], revenue_visible: false }))).toBe(false);
    expect(crmGlobalAnalytics(crmMetaOf({ ...LIVE_META, permissions: ["crm.analytics.global"], revenue_visible: true }))).toBe(true);
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
