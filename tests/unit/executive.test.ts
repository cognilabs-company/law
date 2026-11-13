import { describe, expect, it } from "vitest";
import {
  connectorTone,
  lawyerDraftOf,
  metricOf,
  normCeoPlatform,
  normDepartmentDashboard,
  normItMonitoring,
  normRtTimeline,
  normSalesScript,
  rtUpdateOf,
  scheduleBody,
  scriptBody,
  topSuggestions,
  transcriptBody,
} from "@/lib/services/executive";

// TEZKOR_HIMOYA_EXECUTIVE_HRM_LIVE_AI_FRONTEND_2026_11_13: the frontend
// renders the backend's verdicts and never invents a number.

describe("CEO platform analytics (§4)", () => {
  it("reads a metric with its previous period, and never turns nothing into zero", () => {
    expect(metricOf({ value: 120, previous: 100 })).toMatchObject({ value: 120, previous: 100, changePct: 20 });
    expect(metricOf({ value: 5, previous: 4, change_pct: 7.5 }).changePct).toBe(7.5);
    expect(metricOf(undefined).value).toBeNull();
    expect(metricOf({ status: "not_connected" })).toMatchObject({ value: null, status: "not_connected" });
  });

  it("keeps a not-connected store apart from a zero count", () => {
    const d = normCeoPlatform({
      summary: { unique_users: { value: 10, previous: 8 }, paid_revenue: 500000 },
      installs: { android: { status: "not_connected", installs: 0 }, ios: { installs: 3 } },
      connectors: { google_play: { status: "not_connected" } },
      retention: { d1: 40, d7: 20 },
      funnel: [{ step: "register_started", count: 9 }, { step: "otp_succeeded", count: 6, conversion_pct: 66.7 }],
    });
    expect(d.kpis.unique_users.value).toBe(10);
    expect(d.kpis.paid_revenue.value).toBe(500000);
    expect(d.kpis.orders.value).toBeNull();
    const android = d.installs.find((i) => i.platform === "android")!;
    expect(android.status).toBe("not_connected");
    expect(android.value.value).toBeNull();
    expect(d.installs.find((i) => i.platform === "ios")!.value.value).toBe(3);
    expect(d.connectors[0]).toMatchObject({ key: "google_play", status: "not_connected" });
    expect(d.retention).toMatchObject({ d1: 40, d7: 20, d30: null });
    expect(d.funnel.map((f) => f.key)).toEqual(["register_started", "otp_succeeded"]);
  });
});

describe("IT monitoring (§5)", () => {
  it("lists connectors in a fixed order with honest tones", () => {
    const d = normItMonitoring({ snapshot: { captured_at: "2026-11-13T10:00:00Z" }, connectors: { sip: { status: "not_connected" }, database: { status: "ok", latency_ms: 4 }, redis: { status: "degraded" } }, open_incidents: [{ id: "i1", title: "Workers slow", severity: "high" }] });
    expect(d.connectors.map((c) => c.key)).toEqual(["database", "redis", "sip"]);
    expect(d.connectors.map((c) => connectorTone(c.status))).toEqual(["ok", "warn", "off"]);
    expect(d.incidents[0]).toMatchObject({ id: "i1", title: "Workers slow", severity: "high", status: "open" });
    expect(d.snapshotAt).toBe("2026-11-13T10:00:00Z");
  });
});

describe("department head (§6)", () => {
  it("keeps payroll and finance hidden unless the backend says otherwise", () => {
    const d = normDepartmentDashboard({ head_employee_id: "e1", allowed_unit_ids: ["u1", "u2"], employee_count: 7, online_count: 3, schedule_count: 2 });
    expect(d).toMatchObject({ headEmployeeId: "e1", employeeCount: 7, onlineCount: 3, scheduleCount: 2, payrollVisible: false, financeVisible: false });
    expect(d.units.map((u) => u.id)).toEqual(["u1", "u2"]);
  });

  it("sends exactly one target, and an empty week for 24/7", () => {
    const weekly = [{ weekday: 0, start: "09:00", end: "18:00" }];
    expect(scheduleBody({ target: { employeeId: "e1" }, title: " Hafta ", type: "weekly", timezone: "Asia/Tashkent", weekly })).toEqual({ employee_id: "e1", title: "Hafta", schedule_type: "weekly", timezone: "Asia/Tashkent", weekly });
    const b = scheduleBody({ target: { orgUnitId: "u1" }, title: "24/7", type: "24_7", timezone: "", weekly });
    expect(b).toEqual({ org_unit_id: "u1", title: "24/7", schedule_type: "24_7", timezone: "Asia/Tashkent", weekly: [] });
    expect("employee_id" in b).toBe(false);
  });
});

describe("sales scripts (§8)", () => {
  it("builds the body and reads the published version", () => {
    const body = scriptBody({ code: " sos ", title: "SOS", audience: "call_center", serviceScope: "sos", language: "uz_latn", content: { opening: " Salom ", questions: ["a", " ", "b"], objections: [] }, changeNote: "v1" });
    expect(body).toEqual({ code: "sos", title: "SOS", audience: "call_center", service_scope: "sos", language: "uz_latn", content: { opening: "Salom", questions: ["a", "b"], objections: [] }, change_note: "v1" });
    const s = normSalesScript({ id: "s1", code: "sos", title: "SOS", status: "draft", current_version: 2, versions: [{ version: 1, status: "published", content: { opening: "x" } }, { version: 2, status: "draft", content: { opening: "y" } }] });
    expect(s).toMatchObject({ id: "s1", currentVersion: 2, publishedVersion: 1 });
    expect(s.versions.map((v) => v.version)).toEqual([2, 1]);
  });
});

describe("realtime call AI (§9)", () => {
  it("asks for suggestions only on final segments", () => {
    expect(transcriptBody({ key: "k1", speaker: "client", text: "Yordam", startMs: 12000, endMs: 16500, final: true }, true)).toMatchObject({ segment_key: "k1", is_final: true, generate_suggestions: true, language: "auto" });
    expect(transcriptBody({ key: "k1", speaker: "client", text: "Yor", startMs: 12000, endMs: 13000, final: false }, true).generate_suggestions).toBe(false);
    expect(transcriptBody({ key: "k2", speaker: "operator", text: "Ha", startMs: 0, endMs: 1, final: true }, false).generate_suggestions).toBe(false);
  });

  it("shows at most three cards, in the backend's priority order", () => {
    const u = rtUpdateOf({ session_id: "s", call_id: "c", generation_status: "completed", items: [{ id: "a", priority: 3, text: "c" }, { id: "b", priority: 1, text: "a" }, { id: "c", priority: 2, text: "b" }, { id: "d", priority: 4, text: "d" }] });
    expect(topSuggestions(u.items).map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(rtUpdateOf({ generation_status: "provider_unavailable", error_code: "ai_provider_timeout", items: [] })).toMatchObject({ generation: "provider_unavailable", errorCode: "ai_provider_timeout", items: [] });
  });

  it("merges the timeline by call position", () => {
    const t = normRtTimeline({ transcript: [{ speaker: "client", text: "Salom", start_ms: 1000, end_ms: 2000 }], suggestions: [{ id: "s1", text: "Ismini so'rang", transcript_start_ms: 1500 }] });
    expect(t.map((e) => `${e.kind}@${e.atMs}`)).toEqual(["transcript@1000", "suggestion@1500"]);
  });
});

describe("duty-lawyer drafts (§10)", () => {
  it("always needs a person unless the backend explicitly says not", () => {
    expect(lawyerDraftOf({ id: "d1", content: "Javob" }).requiresHumanConfirmation).toBe(true);
    expect(lawyerDraftOf({ draft: { id: "d1", requires_human_confirmation: true }, execution: "ready_for_explicit_action" })).toMatchObject({ id: "d1", execution: "ready_for_explicit_action" });
  });
});
