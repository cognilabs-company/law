import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";
import { isPrimaryOnly } from "@/lib/services/superadvokat";
import {
  MTM_DEBOUNCE_MS,
  createDebounce,
  daysInclusive,
  addDays,
  dashboardOf,
  detailOf,
  installationPageOf,
  isMtmEvent,
  mtmErrorKey,
  rangeProblem,
  releaseBody,
  releaseFieldErrors,
  releaseOf,
  releasePatchBody,
  reportOf,
  tashIso,
  tashParts,
  tashToday,
} from "@/lib/services/mobileTesting";

// The contract's own examples (docs/LEXGO_SUPERADMIN_MOBILE_TEST_MONITORING_FRONTEND_2026_11_01.md).
const ITEM = {
  id: "installation-uuid",
  tester: { id: "user-uuid", lexgo_id: "LGC-12345678", name: "Tester name", phone: "+998901234567" },
  platform: "android",
  distribution_track: "closed",
  app_version: "2.4.0",
  version_code: 20400,
  manufacturer: "Samsung",
  model: "SM-S918B",
  os_version: "15",
  locale: "uz",
  is_test: true,
  status: "active",
  first_seen_at: "2026-10-31T09:00:00Z",
  last_seen_at: "2026-11-01T12:30:00Z",
  usage: {
    date: "2026-11-01",
    foreground_seconds: 1800,
    foreground_minutes: 30.0,
    session_count: 4,
    first_activity_at: "2026-11-01T08:00:00Z",
    last_activity_at: "2026-11-01T12:30:00Z",
    used: true,
  },
};

describe("mobile testing parsing", () => {
  it("reads every dashboard field", () => {
    const d = dashboardOf({
      date: "2026-11-01",
      timezone: "Asia/Tashkent",
      summary: { registered_devices: 12, used_devices: 9, unused_devices: 3, active_now: 2, total_foreground_seconds: 15420, total_foreground_minutes: 257.0, sessions: 31 },
      items: [ITEM],
      realtime: { websocket_url: "/ws/users/me", events: ["mobile_testing.usage_updated"] },
    });
    expect(d.date).toBe("2026-11-01");
    expect(d.timezone).toBe("Asia/Tashkent");
    expect(d.summary).toEqual({ registeredDevices: 12, usedDevices: 9, unusedDevices: 3, activeNow: 2, totalForegroundSeconds: 15420, totalForegroundMinutes: 257, sessions: 31 });
    expect(d.items).toHaveLength(1);
    expect(d.realtime).toEqual({ websocketUrl: "/ws/users/me", events: ["mobile_testing.usage_updated"] });
  });

  it("reads every installation field and never an installation key", () => {
    const p = installationPageOf({ items: [{ ...ITEM, installation_key: "secret-key-value" }], total: 12, limit: 50, offset: 0, date: "2026-11-01" });
    expect(p.total).toBe(12);
    expect(p.date).toBe("2026-11-01");
    const it = p.items[0];
    expect(it).toEqual({
      id: "installation-uuid",
      tester: { id: "user-uuid", lexgoId: "LGC-12345678", name: "Tester name", phone: "+998901234567" },
      platform: "android",
      track: "closed",
      appVersion: "2.4.0",
      versionCode: 20400,
      manufacturer: "Samsung",
      model: "SM-S918B",
      osVersion: "15",
      locale: "uz",
      isTest: true,
      status: "active",
      firstSeenAt: "2026-10-31T09:00:00Z",
      lastSeenAt: "2026-11-01T12:30:00Z",
      usage: { date: "2026-11-01", foregroundSeconds: 1800, foregroundMinutes: 30, sessionCount: 4, firstActivityAt: "2026-11-01T08:00:00Z", lastActivityAt: "2026-11-01T12:30:00Z", used: true },
    });
    expect(JSON.stringify(it)).not.toContain("secret-key-value");
  });

  it("takes usage only from usage.used, never from last_seen_at", () => {
    const p = installationPageOf({ items: [{ ...ITEM, last_seen_at: "2026-11-01T12:59:00Z", usage: { ...ITEM.usage, used: false, foreground_minutes: 0, foreground_seconds: 0, session_count: 0 } }] });
    expect(p.items[0].usage?.used).toBe(false);
    expect(p.items[0].usage?.foregroundMinutes).toBe(0);
  });

  it("reads the detail: installation, period, daily oldest first, sessions newest first", () => {
    const d = detailOf({
      installation: ITEM,
      date_from: "2026-10-03",
      date_to: "2026-11-01",
      daily: [
        { date: "2026-11-01", foreground_seconds: 600, foreground_minutes: 10, session_count: 2, first_activity_at: "2026-11-01T05:00:00Z", last_activity_at: "2026-11-01T06:00:00Z" },
        { date: "2026-10-30", foreground_seconds: 120, foreground_minutes: 2, sessions: 1, first_activity_at: "", last_activity_at: "" },
      ],
      sessions: [
        { id: "s1", status: "completed", started_at: "2026-10-30T05:00:00Z", ended_at: "2026-10-30T05:02:00Z", foreground_seconds: 120 },
        { id: "s2", status: "stale", started_at: "2026-11-01T05:00:00Z", last_heartbeat_at: "2026-11-01T05:10:00Z", foreground_seconds: 600, foreground_minutes: 10 },
      ],
    });
    expect(d.installation.tester?.lexgoId).toBe("LGC-12345678");
    expect([d.dateFrom, d.dateTo]).toEqual(["2026-10-03", "2026-11-01"]);
    expect(d.daily.map((x) => x.date)).toEqual(["2026-10-30", "2026-11-01"]);
    expect(d.daily[0].sessions).toBe(1);
    expect(d.sessions.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(d.sessions[0]).toMatchObject({ status: "stale", lastHeartbeatAt: "2026-11-01T05:10:00Z", foregroundSeconds: 600, foregroundMinutes: 10 });
    expect(d.sessions[1].foregroundMinutes).toBeNull();
  });

  it("reads releases and reports", () => {
    expect(releaseOf({ id: "r1", platform: "android", version_name: "2.4.0", version_code: 20400, distribution_track: "closed", status: "active", auto_enroll: true, starts_at: "2026-11-01T00:00:00+05:00", ends_at: null, created_at: "a", updated_at: "b" })).toEqual({
      id: "r1",
      platform: "android",
      versionName: "2.4.0",
      versionCode: 20400,
      track: "closed",
      status: "active",
      autoEnroll: true,
      startsAt: "2026-11-01T00:00:00+05:00",
      endsAt: "",
      createdAt: "a",
      updatedAt: "b",
    });
    expect(reportOf({ id: "p1", report_date: "2026-10-31", status: "sent", first_telegram_message_id: 4521, attempt_count: 2, sent_at: "x", created_at: "y", updated_at: "z" })).toEqual({
      id: "p1",
      reportDate: "2026-10-31",
      status: "sent",
      telegramMessageId: "4521",
      attempts: 2,
      sentAt: "x",
      createdAt: "y",
      updatedAt: "z",
    });
  });

  it("builds the release bodies the contract shows", () => {
    expect(releaseBody({ platform: "android", versionName: " 2.4.0 ", versionCode: 20400, track: "closed", autoEnroll: true, startsAt: "2026-11-01T00:00:00+05:00", endsAt: null })).toEqual({
      platform: "android",
      version_name: "2.4.0",
      version_code: 20400,
      distribution_track: "closed",
      auto_enroll: true,
      starts_at: "2026-11-01T00:00:00+05:00",
      ends_at: null,
    });
    expect(releasePatchBody({ status: "closed", autoEnroll: false })).toEqual({ status: "closed", auto_enroll: false });
  });
});

describe("mobile testing errors", () => {
  const err = (status: number, data: Record<string, unknown>, code?: string, fieldErrors?: Record<string, string>) => new ApiError(status, undefined, undefined, { data, code, fieldErrors });

  it("maps 403 primary_superadmin_required to the locked state", () => {
    const e = err(403, { detail: { code: "primary_superadmin_required" } }, "primary_superadmin_required");
    expect(mtmErrorKey(e)).toBe("primary");
    expect(isPrimaryOnly(e)).toBe(true);
  });
  it("maps 409 mobile_test_release_exists to the version code field", () => {
    const e = err(409, { detail: { code: "mobile_test_release_exists" } }, "mobile_test_release_exists");
    expect(mtmErrorKey(e)).toBe("releaseExists");
    expect(releaseFieldErrors(e)).toEqual(["version_code"]);
  });
  it("maps 422 field errors to form fields, never to raw text", () => {
    const e = err(422, { detail: [{ loc: ["body", "version_code"], msg: "Input should be greater than or equal to 1", type: "greater_than_equal" }] }, undefined, { version_code: "Input should be greater than or equal to 1" });
    expect(mtmErrorKey(e)).toBe("validation");
    expect(releaseFieldErrors(e)).toEqual(["version_code"]);
  });
  it("maps the remaining statuses", () => {
    expect(mtmErrorKey(new ApiError(0, "network_error"))).toBe("offline");
    expect(mtmErrorKey(err(404, {}))).toBe("notFound");
    expect(mtmErrorKey(err(409, { detail: { code: "mobile_test_report_already_sent" } }, "mobile_test_report_already_sent"))).toBe("alreadySent");
    expect(mtmErrorKey(err(500, {}))).toBe("server");
    expect(mtmErrorKey(new Error("x"))).toBe("server");
  });
});

describe("Tashkent time", () => {
  it("shows instants on the Tashkent clock whatever the browser zone", () => {
    expect(tashParts("2026-11-01T12:30:00Z")).toEqual({ date: "2026-11-01", time: "17:30" });
    // 20:00 UTC is already the next day in Tashkent.
    expect(tashParts("2026-10-31T20:00:00Z")).toEqual({ date: "2026-11-01", time: "01:00" });
    expect(tashParts("2026-11-01T00:00:00+05:00")).toEqual({ date: "2026-11-01", time: "00:00" });
    expect(tashParts("")).toBeNull();
    expect(tashParts("not a date")).toBeNull();
  });
  it("turns picker values into a fixed +05:00 instant", () => {
    expect(tashIso("2026-11-01", "09:05")).toBe("2026-11-01T09:05:00+05:00");
    expect(tashIso("2026-11-01", "")).toBe("2026-11-01T00:00:00+05:00");
    expect(tashIso("", "09:05")).toBe("");
  });
  it("knows today's Tashkent date", () => {
    expect(tashToday(Date.parse("2026-10-31T19:30:00Z"))).toBe("2026-11-01");
    expect(tashToday(Date.parse("2026-10-31T18:59:00Z"))).toBe("2026-10-31");
  });
  it("limits the detail period to 366 days", () => {
    expect(daysInclusive("2026-10-03", "2026-11-01")).toBe(30);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(rangeProblem("2025-11-01", "2026-11-01")).toBe("");
    expect(daysInclusive("2025-11-01", "2026-11-01")).toBe(366);
    expect(rangeProblem("2025-10-31", "2026-11-01")).toBe("tooLong");
    expect(rangeProblem("2026-11-02", "2026-11-01")).toBe("order");
    expect(rangeProblem("", "2026-11-01")).toBe("missing");
  });
});

describe("realtime", () => {
  afterEach(() => vi.useRealTimers());
  it("knows the four mobile_testing events only", () => {
    expect(isMtmEvent("mobile_testing.installation_registered")).toBe(true);
    expect(isMtmEvent("mobile_testing.usage_updated")).toBe(true);
    expect(isMtmEvent("mobile_testing.session_stale")).toBe(true);
    expect(isMtmEvent("mobile_testing.report_sent")).toBe(true);
    expect(isMtmEvent("call.incoming")).toBe(false);
  });
  it("turns a burst of events into one refetch 300–500 ms after the last", () => {
    vi.useFakeTimers();
    expect(MTM_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    expect(MTM_DEBOUNCE_MS).toBeLessThanOrEqual(500);
    const fn = vi.fn();
    const d = createDebounce(fn, MTM_DEBOUNCE_MS);
    d.call();
    vi.advanceTimersByTime(200);
    d.call();
    vi.advanceTimersByTime(200);
    d.call();
    vi.advanceTimersByTime(MTM_DEBOUNCE_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    d.call();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
