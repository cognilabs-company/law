import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";
import {
  cabinetOrderFlags,
  cancelMyUrgentRequest,
  cancelSosRequest,
  consentsFor,
  createDocumentRequest,
  expressUnansweredOf,
  isSosNotCancellable,
  isSosOpen,
  listInvitedCalls,
  listMySosRequests,
  messageSenderId,
  normConsentDoc,
  normInvitedCall,
  normSos,
  payDocumentRequest,
  resetPassword,
  reviewInFlight,
  reviewReturned,
  setAcceptingOrders,
  urgentCancelRefusal,
  verifyPasswordResetCode,
} from "@/lib/services/backend";
import { checkoutReturnUrl, clickErrorOf, renewClickCheckout } from "@/lib/services/clickCheckout";
import { isReferralInvalid } from "@/lib/referral";

// BACKEND_FIXES_LIVE_2026-11-23 (backend b4646ab): the frontend side of the
// fixes that went live.

const err = (status: number, code: string, detail: Record<string, unknown> = {}) =>
  new ApiError(status, code, undefined, { data: { detail: { code, ...detail } }, code });

describe("consents follow the backend's audience and acceptance_required", () => {
  const doc = (slug: string, audience: unknown, required: unknown) =>
    normConsentDoc({ id: slug, slug, version: "1.0", title: slug, language: "uz", audience, acceptance_required: required });
  const all = ["client", "yurist", "advokat", "advokat_tashkiloti"];
  const docs = [
    doc("user_offer", all, true),
    doc("privacy", all, true),
    doc("cookie", all, false),
    doc("lawyer_partnership_offer", ["yurist", "advokat"], true),
    doc("organization_agreement", ["advokat_tashkiloti"], true),
    doc("payment_refund_warranty", ["client"], true),
    doc("remote_assistance_consent", ["client"], false),
    doc("client_advocate_contract_template", all, true),
  ];
  const slugs = (xs: { slug: string }[]) => xs.map((d) => d.slug);

  it("reads audience as a list and acceptance_required as a flag", () => {
    expect(doc("privacy", "client, yurist", true)).toMatchObject({ audience: ["client", "yurist"], acceptanceRequired: true });
    expect(doc("privacy", undefined, undefined)).toMatchObject({ audience: [], acceptanceRequired: null });
  });
  it("a client signs the common documents and the refund warranty, nothing optional", () => {
    expect(slugs(consentsFor(docs, "client", "client"))).toEqual(["user_offer", "privacy", "payment_refund_warranty"]);
  });
  it("a lawyer and an advocate sign the partnership offer; only the organisation owner signs its agreement", () => {
    expect(slugs(consentsFor(docs, "lawyer", "yurist"))).toEqual(["user_offer", "privacy", "lawyer_partnership_offer"]);
    expect(slugs(consentsFor(docs, "advocate", "advokat"))).toEqual(["user_offer", "privacy", "lawyer_partnership_offer"]);
    expect(slugs(consentsFor(docs, "advocate", "advokat_tashkiloti"))).toEqual(["user_offer", "privacy", "lawyer_partnership_offer", "organization_agreement"]);
  });
  it("at sign-up (no backend role yet) the role's own list still applies", () => {
    expect(slugs(consentsFor(docs, "advocate"))).toEqual(["user_offer", "privacy", "lawyer_partnership_offer"]);
  });
  it("staff get only the all-roles documents", () => {
    expect(slugs(consentsFor(docs, "staff", "admin"))).toEqual(["user_offer", "privacy"]);
  });
  it("a document without an audience still falls back to the slug map", () => {
    const old = [doc("lawyer_partnership_offer", [], null), doc("platform_rules", [], null)];
    expect(slugs(consentsFor(old, "client"))).toEqual(["platform_rules"]);
    expect(slugs(consentsFor(old, "lawyer"))).toEqual(["lawyer_partnership_offer", "platform_rules"]);
  });
});

describe("urgent advokat: client cancel and the unanswered express call", () => {
  it("names each refusal", () => {
    expect(urgentCancelRefusal(err(409, "urgent_request_not_cancellable", { status: "completed" }))).toEqual({ kind: "tooLate", status: "completed" });
    expect(urgentCancelRefusal(err(404, "urgent_request_not_found"))).toMatchObject({ kind: "notFound" });
    expect(urgentCancelRefusal(err(403, "urgent_request_forbidden"))).toMatchObject({ kind: "forbidden" });
    expect(urgentCancelRefusal(new ApiError(500))).toBeNull();
    expect(urgentCancelRefusal(new Error("x"))).toBeNull();
  });
  it("reads the express_call_unanswered notification, and tells a hang-up apart", () => {
    const n = (title: string, data: Record<string, unknown> = {}) => ({ event: "notification.created", notification: { id: "n1", kind: "urgent_advokat.express_call_unanswered", title, data: { record_id: "u-1", ...data } } });
    expect(expressUnansweredOf(n("Advokat javob bermadi"))).toEqual({ recordId: "u-1", hungUp: false });
    expect(expressUnansweredOf(n("Qo'ng'iroq bekor qilindi"))).toEqual({ recordId: "u-1", hungUp: true });
    expect(expressUnansweredOf({ event: "notification.created", notification: { kind: "in_app", data: { event: "urgent_advokat.express_call_unanswered", urgent_request_id: "u-2" } } })).toEqual({ recordId: "u-2", hungUp: false });
    expect(expressUnansweredOf({ event: "urgent_advokat.express_call_unanswered", record_id: "u-3" })).toEqual({ recordId: "u-3", hungUp: false });
    expect(expressUnansweredOf({ event: "notification.created", notification: { kind: "order_created" } })).toBeNull();
    expect(expressUnansweredOf({ event: "urgent_advokat.status_updated", status: "open_pool" })).toBeNull();
  });
});

describe("SOS reads", () => {
  it("normalises the detail and tells open from finished", () => {
    const r = normSos({ id: "s1", status: "Assigned", category: "police", operator: { name: "Aziza" }, chat_room_id: "room-1", operator_call_id: "call-1", created_at: "2026-11-23T10:00:00Z" });
    expect(r).toMatchObject({ id: "s1", status: "assigned", dutyName: "Aziza", roomId: "room-1", operatorCallId: "call-1" });
    expect(isSosOpen(r)).toBe(true);
    for (const s of ["resolved", "cancelled", "completed", "closed"]) expect(isSosOpen({ status: s })).toBe(false);
  });
  it("a finished SOS answers 409 sos_not_cancellable", () => {
    expect(isSosNotCancellable(err(409, "sos_not_cancellable"))).toBe(true);
    expect(isSosNotCancellable(err(403, "sos_status_forbidden"))).toBe(false);
  });
});

describe("pure readers", () => {
  it("an invited call rings only inside its window", () => {
    expect(normInvitedCall({ room_id: "r", call_id: "c", ringing: false, ring_expires_at: "2026-11-23T10:01:00Z" })).toMatchObject({ ringing: false, ringExpiresAt: "2026-11-23T10:01:00Z" });
    expect(normInvitedCall({ room_id: "r", call_id: "c" }).ringing).toBe(true);
  });
  it("Click comes back only to the production site's pages, without a hash", () => {
    expect(checkoutReturnUrl("https://tezkorhimoya.uz/uz/portal/client/cases?x=1#top")).toBe("https://tezkorhimoya.uz/uz/portal/client/cases?x=1");
    expect(checkoutReturnUrl("https://www.tezkorhimoya.uz/ru/portal")).toBe("https://www.tezkorhimoya.uz/ru/portal");
    expect(checkoutReturnUrl("http://localhost:3000/uz/portal")).toBe("");
    expect(checkoutReturnUrl("https://tezkorhimoya.uz.evil.com/")).toBe("");
  });
  it("a refused provider reads as a provider problem", () => {
    expect(clickErrorOf(err(422, "payment_provider_not_allowed")).key).toBe("providerInvalid");
  });
  it("the cabinet's order switch and count", () => {
    expect(cabinetOrderFlags({ accepting_orders: false, new_orders_count: 3 })).toEqual({ acceptingOrders: false, newOrdersCount: 3 });
    expect(cabinetOrderFlags({})).toEqual({ acceptingOrders: null, newOrdersCount: null });
  });
  it("the sender of a chat frame, however it is spelled", () => {
    expect(messageSenderId({ sender_user_id: "u1" })).toBe("u1");
    expect(messageSenderId({ sender: { id: "u2", phone: null } })).toBe("u2");
    expect(messageSenderId({}, { sender_user_id: "u3" })).toBe("u3");
  });
  it("onboarding review states", () => {
    expect(reviewInFlight("submitted")).toBe(true);
    expect(reviewInFlight("none")).toBe(false);
    expect(reviewReturned("rejected")).toBe(true);
  });
  it("an inactive referrer's code", () => {
    expect(isReferralInvalid(err(422, "referral_code_invalid"))).toBe(true);
    expect(isReferralInvalid(err(422, "phone_taken"))).toBe(false);
  });
});

describe("requests", () => {
  const sent: { url: string; method: string; body: Record<string, unknown> }[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    sent.length = 0;
  });
  const stub = (...answers: { status?: number; json: unknown }[]) => {
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        sent.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : {} });
        const a = answers[Math.min(i++, answers.length - 1)];
        return new Response(JSON.stringify(a.json), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
      }),
    );
  };

  it("documents: never a client price, never Payme", async () => {
    stub({ json: { id: "d1", status: "draft" } });
    await createDocumentRequest({ template_id: "t1", document_type: "document", title: "Ariza", price: 99000 });
    expect(sent[0].body).toMatchObject({ price: 0, currency: "UZS" });
    stub({ json: { id: "d1", status: "payment_pending" } });
    await payDocumentRequest("d1");
    expect(sent[1]).toMatchObject({ method: "POST", body: { provider: "", amount: 0, currency: "UZS" } });
    expect(sent[1].url).toMatch(/\/document-requests\/d1\/payments$/);
  });
  it("Click renewal sends the return page, and retries without it when refused", async () => {
    stub({ status: 422, json: { detail: { code: "return_url_not_allowed" } } }, { json: { status: "pending", payment_url: "https://checkout.example/x" } });
    const r = await renewClickCheckout("p1", "https://tezkorhimoya.uz/uz/portal/client/cases");
    expect(sent[0].body).toEqual({ return_url: "https://tezkorhimoya.uz/uz/portal/client/cases" });
    expect(sent[1].body).toEqual({});
    expect(r.url).toBe("https://checkout.example/x");
  });
  it("Click renewal off the production site sends no return page", async () => {
    stub({ json: { status: "pending", payment_url: "https://checkout.example/y" } });
    await renewClickCheckout("p1", "");
    expect(sent[0]).toMatchObject({ method: "POST", body: {} });
  });
  it("the client cancels on the client route", async () => {
    stub({ json: { id: "u-1", status: "cancelled" } });
    await cancelMyUrgentRequest("u-1", "  ");
    expect(sent[0].url).toMatch(/\/urgent-advokat\/requests\/u-1\/cancel$/);
    expect(sent[0].url).not.toMatch(/call-center/);
    expect(sent[0].body).toEqual({});
  });
  it("SOS: newest first list, and a cancel is a PATCH to cancelled", async () => {
    stub({ json: { items: [{ id: "s2", status: "pending" }, { id: "s1", status: "resolved" }], total: 2, limit: 10, offset: 0, has_more: false } });
    const rows = await listMySosRequests();
    expect(sent[0].url).toMatch(/\/sos\/me\?limit=10&offset=0$/);
    expect(rows.map((r) => r.id)).toEqual(["s2", "s1"]);
    stub({ json: { id: "s2", status: "cancelled" } });
    await cancelSosRequest("s2");
    expect(sent[1]).toMatchObject({ method: "PATCH", body: { status: "cancelled" } });
    expect(sent[1].url).toMatch(/\/sos\/s2$/);
  });
  it("password reset: verify the code, then reset with the token", async () => {
    stub({ json: { valid: true, reset_token: "rt-1", expires_at: "2026-11-23T10:10:00Z" } });
    const v = await verifyPasswordResetCode("ver-1", "123456");
    expect(v).toEqual({ valid: true, resetToken: "rt-1", expiresAt: "2026-11-23T10:10:00Z" });
    expect(sent[0]).toMatchObject({ method: "POST", body: { verification_id: "ver-1", code: "123456" } });
    expect(sent[0].url).toMatch(/\/auth\/password\/verify$/);
    stub({ json: { ok: true } });
    await resetPassword("ver-1", { resetToken: "rt-1" }, "newpass123");
    expect(sent[1].body).toEqual({ verification_id: "ver-1", reset_token: "rt-1", password: "newpass123" });
    await resetPassword("ver-1", { code: "123456" }, "newpass123");
    expect(sent[2].body).toEqual({ verification_id: "ver-1", code: "123456", password: "newpass123" });
  });
  it("the seller's order switch is a PUT", async () => {
    stub({ json: { enabled: false } });
    expect(await setAcceptingOrders(false)).toBe(false);
    expect(sent[0]).toMatchObject({ method: "PUT", body: { enabled: false } });
    expect(sent[0].url).toMatch(/\/lawyers\/me\/accepting-orders$/);
  });
  it("invited calls carry the ring flag", async () => {
    stub({ json: { items: [{ room_id: "r", call_id: "c", status: "invited", call_status: "active", ringing: false }] } });
    expect((await listInvitedCalls())[0].ringing).toBe(false);
  });
});
