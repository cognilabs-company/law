import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepAlive, isPong } from "@/lib/socketKeepalive";
import { notifLink } from "@/lib/notifications";

// TEZKOR_HIMOYA_FRONTEND_UPDATE_2026_11_21.md §7.1: ping every 25 s; no pong
// within 10 s → reconnect.
class FakeSock {
  readyState = 1;
  sent: string[] = [];
  closed = 0;
  send(m: string) {
    this.sent.push(m);
  }
  close() {
    this.closed += 1;
    this.readyState = 3;
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("socket keepalive (§7.1)", () => {
  it("pings every 25 s and stays open while pongs come back", () => {
    const s = new FakeSock();
    const ka = keepAlive(s as unknown as WebSocket);
    vi.advanceTimersByTime(25_000);
    expect(s.sent).toEqual(['{"event":"ping"}']);
    ka.pong();
    vi.advanceTimersByTime(25_000);
    ka.pong();
    vi.advanceTimersByTime(9_000);
    expect(s.closed).toBe(0);
    ka.stop();
  });
  it("closes the socket when no pong arrives within 10 s", () => {
    const s = new FakeSock();
    keepAlive(s as unknown as WebSocket);
    vi.advanceTimersByTime(25_000 + 10_000);
    expect(s.closed).toBe(1);
  });
  it("recognises the pong frame", () => {
    expect(isPong({ event: "pong", room_id: "r" })).toBe(true);
    expect(isPong({ event: "message" })).toBe(false);
    expect(isPong(null)).toBe(false);
  });
});


describe("call and order notifications (§7.4, §8, §2.3)", () => {
  it("a meeting still running opens to join; a missed call opens its chat", () => {
    expect(notifLink("meeting_in_progress", "chat", { room_id: "r1", call_id: "c1" }, "client")).toBe("/portal/chat/r1?join=c1");
    expect(notifLink("call_missed", "other" as never, { room_id: "r1", call_id: "c1" }, "client")).toBe("/portal/chat/r1");
  });
  it("a revoked order sends the lawyer to the orders list; a stuck refund to the call center", () => {
    expect(notifLink("marketplace.assignment_revoked", "other" as never, { order_id: "o1" }, "advocate")).toBe("/portal/advocate/marketplace-orders");
    expect(notifLink("marketplace.refund_operator_required", "other" as never, { order_id: "o1" }, "client", true, true)).toBe("/admin/call-center?tab=refunds");
  });
});
