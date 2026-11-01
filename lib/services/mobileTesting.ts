// Superadmin mobile test monitoring (docs/LEXGO_SUPERADMIN_MOBILE_TEST_MONITORING_FRONTEND_2026_11_01.md).
// Only the primary superadmin may read any of this; everyone else gets 403
// primary_superadmin_required (isPrimaryOnly in ./superadvokat). Every total,
// minute and session count comes from the backend: nothing here adds seconds
// or subtracts timestamps. The installation key is never requested or parsed.
import { ApiError, asArr, asDict, asNum, asStr, errorCode, http, type Dict } from "@/lib/http";

export const MTM_TZ = "Asia/Tashkent";
// Tashkent has no daylight saving time: it is UTC+05:00 all year, so a
// Tashkent wall-clock time is sent with this fixed offset.
export const MTM_OFFSET = "+05:00";
export const MTM_MAX_DAYS = 366;
export const MTM_EVENTS = [
  "mobile_testing.installation_registered",
  "mobile_testing.usage_updated",
  "mobile_testing.session_stale",
  "mobile_testing.report_sent",
] as const;
export type MtmEvent = (typeof MTM_EVENTS)[number];
export const isMtmEvent = (name: unknown): name is MtmEvent => typeof name === "string" && (MTM_EVENTS as readonly string[]).includes(name);

export type MtmUsageFilter = "all" | "used" | "unused";
export const USAGE_FILTERS: readonly MtmUsageFilter[] = ["all", "used", "unused"];
export const TRACKS = ["internal", "closed", "open"] as const;
export type MtmTrack = (typeof TRACKS)[number];
export const RELEASE_STATUSES = ["active", "closed"] as const;
export const REPORT_STATUSES = ["pending", "sending", "sent", "failed"] as const;
export const SESSION_STATUSES = ["active", "completed", "stale"] as const;

const bool = (v: unknown): boolean => v === true;
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const day = (v: unknown): string => {
  const s = asStr(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
};

// ── Shapes ────────────────────────────────────────────────────────────────

export type MtmTester = { id: string; lexgoId: string; name: string; phone: string };
export type MtmUsage = {
  date: string;
  foregroundSeconds: number;
  foregroundMinutes: number;
  sessionCount: number;
  firstActivityAt: string;
  lastActivityAt: string;
  used: boolean;
};
export type MtmInstallation = {
  // Only for the detail link; never rendered.
  id: string;
  tester: MtmTester | null;
  platform: string;
  track: string;
  appVersion: string;
  versionCode: number | null;
  manufacturer: string;
  model: string;
  osVersion: string;
  locale: string;
  isTest: boolean;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
  usage: MtmUsage | null;
};
export type MtmSummary = {
  registeredDevices: number;
  usedDevices: number;
  unusedDevices: number;
  activeNow: number;
  totalForegroundSeconds: number;
  totalForegroundMinutes: number;
  sessions: number;
};
export type MtmDashboard = {
  date: string;
  timezone: string;
  summary: MtmSummary;
  items: MtmInstallation[];
  realtime: { websocketUrl: string; events: string[] };
};
export type MtmPage<T> = { items: T[]; total: number; limit: number; offset: number };
export type MtmInstallationPage = MtmPage<MtmInstallation> & { date: string };
export type MtmDaily = {
  date: string;
  foregroundSeconds: number;
  foregroundMinutes: number;
  sessions: number;
  firstActivityAt: string;
  lastActivityAt: string;
};
export type MtmSession = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string;
  lastHeartbeatAt: string;
  foregroundSeconds: number | null;
  foregroundMinutes: number | null;
  appVersion: string;
  versionCode: number | null;
  date: string;
};
export type MtmDetail = {
  installation: MtmInstallation;
  dateFrom: string;
  dateTo: string;
  timezone: string;
  daily: MtmDaily[];
  sessions: MtmSession[];
};
export type MtmRelease = {
  id: string;
  platform: string;
  versionName: string;
  versionCode: number | null;
  track: string;
  status: string;
  autoEnroll: boolean;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
};
export type MtmReport = {
  id: string;
  reportDate: string;
  status: string;
  telegramMessageId: string;
  attempts: number;
  sentAt: string;
  createdAt: string;
  updatedAt: string;
};

// ── Parsing ───────────────────────────────────────────────────────────────

export function testerOf(v: unknown): MtmTester | null {
  const d = asDict(v);
  if (!Object.keys(d).length) return null;
  return { id: asStr(d.id ?? d.user_id), lexgoId: asStr(d.lexgo_id), name: asStr(d.name ?? d.full_name), phone: asStr(d.phone) };
}

export function usageOf(v: unknown): MtmUsage | null {
  const d = asDict(v);
  if (!Object.keys(d).length) return null;
  return {
    date: day(d.date),
    foregroundSeconds: asNum(d.foreground_seconds),
    foregroundMinutes: asNum(d.foreground_minutes),
    sessionCount: asNum(d.session_count ?? d.sessions),
    firstActivityAt: asStr(d.first_activity_at),
    lastActivityAt: asStr(d.last_activity_at),
    // Contract §3: usage is read from this flag only, never from last_seen_at.
    used: bool(d.used),
  };
}

export function installationOf(v: unknown): MtmInstallation {
  const d = asDict(v);
  return {
    id: asStr(d.id ?? d.installation_id),
    tester: testerOf(d.tester),
    platform: asStr(d.platform).toLowerCase(),
    track: asStr(d.distribution_track).toLowerCase(),
    appVersion: asStr(d.app_version),
    versionCode: numOrNull(d.version_code),
    manufacturer: asStr(d.manufacturer),
    model: asStr(d.model),
    osVersion: asStr(d.os_version),
    locale: asStr(d.locale),
    isTest: bool(d.is_test),
    status: asStr(d.status).toLowerCase(),
    firstSeenAt: asStr(d.first_seen_at),
    lastSeenAt: asStr(d.last_seen_at),
    usage: usageOf(d.usage),
  };
}

export function summaryOf(v: unknown): MtmSummary {
  const d = asDict(v);
  return {
    registeredDevices: asNum(d.registered_devices),
    usedDevices: asNum(d.used_devices),
    unusedDevices: asNum(d.unused_devices),
    activeNow: asNum(d.active_now),
    totalForegroundSeconds: asNum(d.total_foreground_seconds),
    totalForegroundMinutes: asNum(d.total_foreground_minutes),
    sessions: asNum(d.sessions),
  };
}

export function dashboardOf(v: unknown): MtmDashboard {
  const d = asDict(v);
  const rt = asDict(d.realtime);
  return {
    date: day(d.date),
    timezone: asStr(d.timezone, MTM_TZ) || MTM_TZ,
    summary: summaryOf(d.summary),
    items: asArr(d.items).map(installationOf),
    realtime: { websocketUrl: asStr(rt.websocket_url), events: asArr(rt.events).map((e) => asStr(e)).filter(Boolean) },
  };
}

function pageOf<T>(v: unknown, map: (x: unknown) => T, limit: number, offset: number): MtmPage<T> {
  const d = asDict(v);
  const items = asArr(Array.isArray(v) ? v : d.items).map(map);
  return { items, total: asNum(d.total, items.length), limit: asNum(d.limit, limit), offset: asNum(d.offset, offset) };
}

export function installationPageOf(v: unknown, limit = 50, offset = 0): MtmInstallationPage {
  return { ...pageOf(v, installationOf, limit, offset), date: day(asDict(v).date) };
}

export function dailyOf(v: unknown): MtmDaily {
  const d = asDict(v);
  return {
    date: day(d.date ?? d.usage_date),
    foregroundSeconds: asNum(d.foreground_seconds),
    foregroundMinutes: asNum(d.foreground_minutes),
    sessions: asNum(d.session_count ?? d.sessions),
    firstActivityAt: asStr(d.first_activity_at),
    lastActivityAt: asStr(d.last_activity_at),
  };
}

export function sessionOf(v: unknown): MtmSession {
  const d = asDict(v);
  return {
    id: asStr(d.id ?? d.client_session_id),
    status: asStr(d.status).toLowerCase(),
    startedAt: asStr(d.started_at ?? d.start_at),
    endedAt: asStr(d.ended_at ?? d.finished_at ?? d.closed_at),
    lastHeartbeatAt: asStr(d.last_heartbeat_at ?? d.last_seen_at),
    foregroundSeconds: numOrNull(d.foreground_seconds ?? d.duration_seconds),
    foregroundMinutes: numOrNull(d.foreground_minutes ?? d.duration_minutes),
    appVersion: asStr(d.app_version),
    versionCode: numOrNull(d.version_code),
    date: day(d.usage_date ?? d.date),
  };
}

export function detailOf(v: unknown): MtmDetail {
  const d = asDict(v);
  const period = asDict(d.period);
  const daily = asArr(d.daily).map(dailyOf).filter((x) => x.date);
  daily.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    installation: installationOf(d.installation),
    dateFrom: day(d.date_from ?? period.date_from),
    dateTo: day(d.date_to ?? period.date_to),
    timezone: asStr(d.timezone, MTM_TZ) || MTM_TZ,
    daily,
    // Newest first for the timeline (ordering only, no durations).
    sessions: asArr(d.sessions).map(sessionOf).sort((a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0)),
  };
}

export function releaseOf(v: unknown): MtmRelease {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    platform: asStr(d.platform).toLowerCase(),
    versionName: asStr(d.version_name),
    versionCode: numOrNull(d.version_code),
    track: asStr(d.distribution_track).toLowerCase(),
    status: asStr(d.status).toLowerCase(),
    autoEnroll: bool(d.auto_enroll),
    startsAt: asStr(d.starts_at),
    endsAt: asStr(d.ends_at),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
  };
}

export function reportOf(v: unknown): MtmReport {
  const d = asDict(v);
  const msg = d.first_telegram_message_id ?? d.telegram_message_id ?? d.first_message_id;
  return {
    id: asStr(d.id),
    reportDate: day(d.report_date ?? d.date),
    status: asStr(d.status).toLowerCase(),
    telegramMessageId: msg === null || msg === undefined ? "" : asStr(msg),
    attempts: asNum(d.attempt_count ?? d.attempts),
    sentAt: asStr(d.sent_at),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
  };
}

// ── Requests ──────────────────────────────────────────────────────────────

const BASE = "/admin/mobile-testing";
const enc = encodeURIComponent;

// No date → the backend picks today in Asia/Tashkent and returns it.
export async function getMtmDashboard(date: string, signal?: AbortSignal): Promise<MtmDashboard> {
  const q = date ? `?date=${enc(date)}` : "";
  return dashboardOf(await http(`${BASE}/dashboard${q}`, { signal }));
}

export async function listMtmInstallations(
  opts: { date: string; usage: MtmUsageFilter; limit: number; offset: number },
  signal?: AbortSignal,
): Promise<MtmInstallationPage> {
  const p = new URLSearchParams({ usage: opts.usage, limit: String(opts.limit), offset: String(opts.offset) });
  if (opts.date) p.set("date", opts.date);
  return installationPageOf(await http(`${BASE}/installations?${p}`, { signal }), opts.limit, opts.offset);
}

// No range → the backend's default (the latest 30 days), echoed back.
export async function getMtmInstallation(id: string, range: { from: string; to: string }, signal?: AbortSignal): Promise<MtmDetail> {
  const p = new URLSearchParams();
  if (range.from) p.set("date_from", range.from);
  if (range.to) p.set("date_to", range.to);
  const q = p.toString();
  return detailOf(await http(`${BASE}/installations/${enc(id)}${q ? `?${q}` : ""}`, { signal }));
}

export async function listMtmReleases(signal?: AbortSignal): Promise<MtmRelease[]> {
  const d = await http(`${BASE}/releases`, { signal });
  return asArr(Array.isArray(d) ? d : asDict(d).items).map(releaseOf);
}

export type MtmReleaseInput = {
  platform: string;
  versionName: string;
  versionCode: number;
  track: string;
  autoEnroll: boolean;
  startsAt: string | null;
  endsAt: string | null;
};
export function releaseBody(input: MtmReleaseInput): Dict {
  return {
    platform: input.platform,
    version_name: input.versionName.trim(),
    version_code: input.versionCode,
    distribution_track: input.track,
    auto_enroll: input.autoEnroll,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
  };
}
const unwrap = (v: unknown): unknown => {
  const d = asDict(v);
  return d.release ?? d.item ?? v;
};
export async function createMtmRelease(input: MtmReleaseInput): Promise<MtmRelease> {
  return releaseOf(unwrap(await http(`${BASE}/releases`, { method: "POST", body: JSON.stringify(releaseBody(input)) })));
}
export type MtmReleasePatch = Partial<{ versionName: string; track: string; status: string; autoEnroll: boolean; startsAt: string | null; endsAt: string | null }>;
export function releasePatchBody(p: MtmReleasePatch): Dict {
  const body: Dict = {};
  if (p.versionName !== undefined) body.version_name = p.versionName.trim();
  if (p.track !== undefined) body.distribution_track = p.track;
  if (p.status !== undefined) body.status = p.status;
  if (p.autoEnroll !== undefined) body.auto_enroll = p.autoEnroll;
  if (p.startsAt !== undefined) body.starts_at = p.startsAt;
  if (p.endsAt !== undefined) body.ends_at = p.endsAt;
  return body;
}
export async function patchMtmRelease(id: string, patch: MtmReleasePatch): Promise<MtmRelease> {
  return releaseOf(unwrap(await http(`${BASE}/releases/${enc(id)}`, { method: "PATCH", body: JSON.stringify(releasePatchBody(patch)) })));
}

export async function listMtmReports(limit: number, offset: number, signal?: AbortSignal): Promise<MtmPage<MtmReport>> {
  return pageOf(await http(`${BASE}/reports?limit=${limit}&offset=${offset}`, { signal }), reportOf, limit, offset);
}

// force=true intentionally posts another Telegram message for a day that
// was already sent; the UI only reaches it through a second confirmation.
export async function sendMtmReport(date: string, force: boolean): Promise<MtmReport | null> {
  const d = asDict(await http(`${BASE}/reports/${enc(date)}/send?force=${force ? "true" : "false"}`, { method: "POST" }));
  const r = d.report ?? d.item ?? (d.report_date || d.status ? d : null);
  return r ? reportOf(r) : null;
}

// ── Errors ────────────────────────────────────────────────────────────────

// The message key (admin.mtm.err.*) for a failed request; the component
// turns it into uz/ru/en words, so no code or JSON reaches the screen.
export type MtmErrKey =
  | "primary"
  | "releaseExists"
  | "notFound"
  | "alreadySent"
  | "invalidDate"
  | "rangeTooLong"
  | "validation"
  | "conflict"
  | "offline"
  | "server";
export function mtmErrorKey(e: unknown): MtmErrKey {
  if (!(e instanceof ApiError)) return "server";
  if (e.status === 0) return "offline";
  const code = errorCode(e);
  if (code === "primary_superadmin_required" || e.status === 403) return "primary";
  if (code === "mobile_test_release_exists") return "releaseExists";
  if (/already_sent|already_exists|report_exists/.test(code)) return "alreadySent";
  if (/range|too_long|period/.test(code)) return "rangeTooLong";
  if (/date/.test(code)) return "invalidDate";
  if (e.status === 404) return "notFound";
  if (e.status === 409) return "conflict";
  if (e.status === 422 || e.status === 400) return "validation";
  return "server";
}

// Release form fields a 422 can point at (FastAPI loc's last segment).
export const RELEASE_FIELDS = ["platform", "version_name", "version_code", "distribution_track", "auto_enroll", "starts_at", "ends_at", "status"] as const;
export type ReleaseField = (typeof RELEASE_FIELDS)[number];
export function releaseFieldErrors(e: unknown): ReleaseField[] {
  if (!(e instanceof ApiError)) return [];
  const out = new Set<ReleaseField>();
  for (const k of Object.keys(e.fieldErrors)) if ((RELEASE_FIELDS as readonly string[]).includes(k)) out.add(k as ReleaseField);
  // A code that names a field (e.g. invalid_distribution_track) marks it too.
  const code = errorCode(e);
  for (const f of RELEASE_FIELDS) if (code && code.includes(f)) out.add(f);
  if (code === "mobile_test_release_exists") out.add("version_code");
  return [...out];
}

// ── Time (always Asia/Tashkent, never the browser's zone) ─────────────────

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: MTM_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
// The Tashkent calendar day and wall-clock time of an ISO instant.
export function tashParts(iso: string): { date: string; time: string } | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const p: Record<string, string> = {};
  for (const x of PARTS.formatToParts(new Date(at))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}
// The ISO instant for a Tashkent date + "HH:MM" (the form's pickers).
export function tashIso(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const t = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  return `${date}T${t}:00${MTM_OFFSET}`;
}
// Today's date in Tashkent, for a picker's upper bound.
export const tashToday = (now: number = Date.now()): string => tashParts(new Date(now).toISOString())?.date ?? "";

// Calendar days between two YYYY-MM-DD dates, both included. Pure calendar
// arithmetic in UTC, so the browser's zone can't shift it by a day.
export function daysInclusive(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}
export function addDays(date: string, n: number): string {
  const a = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + n));
  return a.toISOString().slice(0, 10);
}
export type RangeProblem = "" | "missing" | "order" | "tooLong";
export function rangeProblem(from: string, to: string): RangeProblem {
  if (!from || !to) return "missing";
  if (from > to) return "order";
  return daysInclusive(from, to) > MTM_MAX_DAYS ? "tooLong" : "";
}

// ── Realtime ──────────────────────────────────────────────────────────────

// Trailing debounce: a burst of events becomes one refetch `ms` after the
// last one. Totals are never patched locally; the refetch reads them again.
export function createDebounce(fn: () => void, ms: number): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call: () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn();
      }, ms);
    },
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
export const MTM_DEBOUNCE_MS = 400;
