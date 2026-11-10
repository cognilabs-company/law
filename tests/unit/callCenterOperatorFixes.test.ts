import { describe, expect, it } from "vitest";
import { normQueueItem, queuePerson, type KanbanColumn } from "@/lib/services/backend";
import { contactsFromBoard, fillFromContacts } from "@/lib/ccx/queuePeople";
import { callAnalyticsOf, callCountsOf, callsShown } from "@/lib/services/dash";
import { crmMetricsOf, customerLeadsOf, resultKpisOf } from "@/lib/services/crm";
import { canBroadcastNotifications } from "@/lib/notifyAccess";
import { raSupervisorOk, RA_EMPTY_META } from "@/lib/services/remoteAssist";
import { dutyJobCount, nowJobCount } from "@/lib/callcenter/useCcOpen";
import { isDutyDesk } from "@/lib/ccx/duty";
import { leadCategoryLabel } from "@/lib/leadLabels";
import { taskErrorOf } from "@/lib/services/taskManagement";
import { toApiError } from "@/lib/http";
import { rates } from "@/components/ccx/analytics/model";

// Call-center operator walk-through, 2026-11-10
// (docs/LEXGO_CALL_CENTER_FIXES_2026_11_10.md).

describe("queue rows name the client (bug 1)", () => {
  it("reads a lead's contact from its details", () => {
    const q = normQueueItem({ id: "l1", type: "lead", title: "Lead", details: { name: "Zarina Usmonova", phone: "+998901112233", user_id: "u-9" }, age_minutes: 5 });
    expect(q.clientName).toBe("Zarina Usmonova");
    expect(q.clientPhone).toBe("+998901112233");
    expect(q.clientUserId).toBe("u-9");
  });

  it("reads an order's nested client and keeps explicit client_* keys", () => {
    expect(queuePerson({ id: "o1", type: "order", title: "order", client: { id: "u-1", name: "Dilnoza Karimova", phone: "+998900000005" } })).toEqual({ userId: "u-1", name: "Dilnoza Karimova", phone: "+998900000005" });
    expect(queuePerson({ id: "o2", type: "order", client_user_id: "u-2", client_name: "Bobur Aliyev" })).toEqual({ userId: "u-2", name: "Bobur Aliyev", phone: "" });
    expect(queuePerson({ id: "o3", type: "order", order: { client_name: "Aziz", service_title: "Meros", name: "Xizmat nomi" } }).name).toBe("Aziz");
  });

  it("never takes the job's own title, name or id for the person", () => {
    expect(queuePerson({ id: "o4", type: "order", title: "Ijara", name: "Ijara shartnomasi" })).toEqual({ userId: "", name: "", phone: "" });
    expect(queuePerson({ id: "o5", customer: { id: "crm-cust-1", name: "Ali" } }).userId).toBe("");
  });

  it("hides the phone when the row says it is gated", () => {
    expect(queuePerson({ id: "o6", client: { name: "Ali", phone: "+998901234567", phone_visible: false } }).phone).toBe("");
  });

  it("fills unnamed lead rows from the call-center board", () => {
    const board: KanbanColumn[] = [{ key: "new", title: "", color: "", order: 1, isFinal: false, count: 1, cards: [{ position: 0, lead: { id: "l2", workId: "", name: "Kamola", phone: "+998907776655", source: "", category: "", region: "", urgency: "", note: "", status: "new", score: 0, createdAt: "", details: { user_id: "u-7" } } }] }];
    const rows = [normQueueItem({ id: "l2", type: "lead" }), normQueueItem({ id: "o9", type: "order" })];
    const out = fillFromContacts(rows, contactsFromBoard(board));
    expect(out[0]).toMatchObject({ clientName: "Kamola", clientPhone: "+998907776655", clientUserId: "u-7" });
    expect(out[1].clientName).toBeUndefined();
  });

  it("placeholder titles are not shown as a category", () => {
    const t = Object.assign((k: string) => k, { has: () => false });
    expect(leadCategoryLabel(t, "Lead")).toBe("");
    expect(leadCategoryLabel(t, "order")).toBe("");
    expect(leadCategoryLabel(t, "family_law")).not.toBe("");
  });
});

describe("call analytics counts and shares agree (bug 4)", () => {
  it("missed is the remainder of the total", () => {
    const a = callAnalyticsOf({ total: 18, answered: 4, missed: 0 });
    expect(a).toMatchObject({ total: 18, answered: 4, missed: 14 });
    expect(rates(a)).toEqual({ answer: 22, miss: 78 });
  });

  it("a missed count above the remainder raises the total", () => {
    expect(callCountsOf(5, 4, 3)).toEqual({ total: 7, answered: 4, missed: 3 });
    expect(callCountsOf(0, 0, 0)).toEqual({ total: 0, answered: 0, missed: 0 });
  });

  it("sample numbers only with the demo switch on", () => {
    const empty = callAnalyticsOf({});
    expect(callsShown(false, empty, true)).toEqual({ demo: false, empty: true });
    expect(callsShown(false, null, false)).toEqual({ demo: false, empty: false });
    expect(callsShown(true, empty, true)).toEqual({ demo: true, empty: false });
    expect(callsShown(false, callAnalyticsOf({ total: 2, answered: 1 }), true)).toEqual({ demo: false, empty: false });
  });
});

describe("CRM numbers agree (bug 5)", () => {
  it("won and conversion come from the cycle history when it is sent", () => {
    const m = crmMetricsOf({ total: 2, active: 2, won: 0, closed: 0, conversion_percent: 0, cycle_metrics: { total: 2, open: 1, won: 1, rejected: 0, completed: 1, conversion_percent: 100 } });
    expect(m).toMatchObject({ won: 1, closed: 1, conversion: 100 });
    expect(m.cycles.conversion).toBe(m.conversion);
  });

  it("without cycles the lead counts stay", () => {
    expect(resultKpisOf({ won: 3, closed: 4, conversion: 75, cycles: { total: 0, open: 0, won: 0, rejected: 0, completed: 0, conversion: 0 } })).toEqual({ won: 3, closed: 4, conversion: 75 });
    expect(resultKpisOf({ won: 0, closed: 0, conversion: 0, cycles: { total: 3, open: 0, won: 1, rejected: 2, completed: 3, conversion: 0 } })).toEqual({ won: 1, closed: 3, conversion: 33.3 });
  });

  it("a customer's leads are read from a list, a page or active/past lists", () => {
    expect(customerLeadsOf({ leads: [{ id: "a" }] }).map((l) => l.id)).toEqual(["a"]);
    expect(customerLeadsOf({ leads: { items: [{ id: "b" }], total: 1 } }).map((l) => l.id)).toEqual(["b"]);
    expect(customerLeadsOf({ active_leads: [{ id: "c" }], past_leads: [{ id: "d" }, { id: "c" }] }).map((l) => l.id)).toEqual(["c", "d"]);
  });
});

describe("menus and actions follow the page's own gate (bugs 6, 7, 8)", () => {
  it("remote assistance opens for supervise or emergency revoke only", () => {
    expect(raSupervisorOk(RA_EMPTY_META)).toBe(false);
    expect(raSupervisorOk({ ...RA_EMPTY_META, loaded: true, capabilities: { supervise: false, view_audit: true } })).toBe(false);
    expect(raSupervisorOk({ ...RA_EMPTY_META, loaded: true, capabilities: { supervise: true } })).toBe(true);
    expect(raSupervisorOk({ ...RA_EMPTY_META, loaded: true, capabilities: { emergency_revoke: true } })).toBe(true);
  });

  it("a whole-role notification is admin work or an explicit permission", () => {
    expect(canBroadcastNotifications(["call_center_lawyer"], ["notifications.manage"])).toBe(false);
    expect(canBroadcastNotifications(["admin"], [])).toBe(true);
    expect(canBroadcastNotifications(["manager"], ["notifications.manage", "notifications.broadcast"])).toBe(true);
  });

  it("the Hozir badge counts what the Hozir page lists", () => {
    const lane = (n: number) => ({ items: Array.from({ length: n }, () => ({})) });
    expect(nowJobCount([{}, {}] as never, { lanes: [lane(3), lane(0)] } as never)).toBe(5);
    expect(nowJobCount(null, null)).toBe(0);
    expect(dutyJobCount([{ status: "scheduled" }, { status: "claimed" }, { status: "completed" }, { status: "cancelled" }, { status: "expired" }])).toBe(2);
  });

  it("the duty desk is the duty lawyer's", () => {
    expect(isDutyDesk(["call_center_lawyer"])).toBe(true);
    expect(isDutyDesk(["call_center_lawyer", "admin"])).toBe(false);
    expect(isDutyDesk(["call_center"], "navbatchi_yurist")).toBe(true);
    expect(isDutyDesk(["call_center"])).toBe(false);
  });

  it("a refused task action shows our own translated text", async () => {
    const e = await toApiError(new Response(JSON.stringify({ detail: { code: "forbidden", message: "Bu task amali uchun ruxsat yo'q" } }), { status: 403 }));
    expect(taskErrorOf(e)).toMatchObject({ kind: "forbidden", message: "" });
  });
});
