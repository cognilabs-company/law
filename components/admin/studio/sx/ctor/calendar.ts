import { studioDetailSnapshot } from "@/lib/services/studio";
import { fmtDate } from "@/lib/date";
import type { SxCtorLayout, SxLayoutCtx, SxLayoutField, SxPayload, SxTransformCtx, SxValues } from "../contract";
import type { SxErrors } from "../types";
import type { StudioLabels } from "../useStudioLabels";

export const HOLIDAY_RANGE = "holiday_range";
export const HOLIDAY_MIN_DAYS = 1;
export const HOLIDAY_MAX_DAYS = 30;
export const HOLIDAY_KEYS: readonly string[] = ["starts_on", "duration_days"];
export const K10_LEGACY_KEYS: readonly string[] = ["service_id", "sla_minutes", "calendar_key", "business_hours", "pause_rules", "escalation_rules", "reminders"];

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const own = (o: SxValues, k: string) => Object.prototype.hasOwnProperty.call(o, k);

const numOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function dayParts(v: unknown): [number, number, number] | null {
  const m = DAY.exec(typeof v === "string" ? v.trim().slice(0, 10) : "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const at = new Date(Date.UTC(y, mo - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d ? [y, mo, d] : null;
}

export function validHolidayDays(v: unknown): number | null {
  const n = numOf(v);
  return n !== null && Number.isInteger(n) && n >= HOLIDAY_MIN_DAYS && n <= HOLIDAY_MAX_DAYS ? n : null;
}

export function holidayEnd(startsOn: string, days: number): string {
  const p = dayParts(startsOn);
  if (!p || days < 1) return "";
  const at = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days - 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}

const dayText = (iso: string, locale: string): string => fmtDate(iso, locale).replace(/\s\d{4}$/, "");

const startOf = (root: SxValues): string => (typeof root.starts_on === "string" ? root.starts_on.trim().slice(0, 10) : "");

export function holidayRangeReady(root: SxValues): boolean {
  return !!dayParts(startOf(root)) && validHolidayDays(root.duration_days) !== null;
}

export function holidayRangeText(root: SxValues, labels: Pick<StudioLabels, "locale" | "days">): string {
  const start = startOf(root);
  const days = validHolidayDays(root.duration_days);
  if (!dayParts(start) || days === null) return "";
  const from = dayText(start, labels.locale);
  if (days === 1) return `${from}, ${labels.days(1)}`;
  return `${from} – ${dayText(holidayEnd(start, days), labels.locale)}, ${labels.days(days)}`;
}

export function isHolidayShape(code: string, root: SxValues): boolean {
  const ctor = studioDetailSnapshot(code || "K10");
  if (ctor?.typed.some((f) => HOLIDAY_KEYS.includes(f.key))) return true;
  return HOLIDAY_KEYS.some((k) => own(root, k));
}

const holidayCtx = (ctx: SxLayoutCtx) => isHolidayShape(ctx.code, ctx.root);
const notHoliday = (ctx: SxLayoutCtx) => !holidayCtx(ctx);

export function k10Validate(payload: SxValues): SxErrors {
  const out: Record<string, string> = {};
  const raw = payload.duration_days;
  if (raw !== undefined && raw !== null && raw !== "" && validHolidayDays(raw) === null) out.duration_days = `@code:holiday_duration_range:${HOLIDAY_MAX_DAYS}`;
  const start = payload.starts_on;
  if (typeof start === "string" && start.trim() && !dayParts(start)) out.starts_on = "@code:invalid_date";
  return out;
}

export function k10Transform(next: SxPayload, _prev: SxValues, ctx: SxTransformCtx): SxPayload {
  if (!isHolidayShape(ctx.code, next)) return next;
  if (!K10_LEGACY_KEYS.some((k) => own(next, k))) return next;
  const out: SxPayload = { ...next };
  for (const k of K10_LEGACY_KEYS) delete out[k];
  return out;
}

const LEGACY_FIELDS: readonly SxLayoutField[] = K10_LEGACY_KEYS.map((k): SxLayoutField => ({ path: k, visible: notHoliday }));

export const K10_LAYOUT: SxCtorLayout = {
  code: "K10",
  recordTitlePlaceholderKey: "sx.ph.K10__recordTitle",
  sections: [{ id: "asosiy", titleKey: "sx.section.asosiy", fields: ["holiday_id", "title", "starts_on", "duration_days", HOLIDAY_RANGE] }],
  fields: [
    ...LEGACY_FIELDS,
    { path: "pause_rules.*.roles", help: false },
    { path: "escalation_rules.*.target_type", clears: ["target_id"] },
    { path: "holiday_id", label: "sx.k10.field.holiday_id", help: "sx.k10.help.holiday_id", locked: (ctx) => (ctx.recordId && ctx.root.holiday_id ? "sx.k10.holidayLocked" : false) },
    { path: "title", label: "sx.k10.field.title", placeholder: "sx.k10.ph.title", help: false },
    { path: "starts_on", control: "date", label: "sx.k10.field.starts_on", help: false, span: 1 },
    { path: "duration_days", control: "number", label: "sx.k10.field.duration_days", help: "sx.k10.help.duration_days", suffixKey: "sx.k10.daysSuffix", span: 1 },
    {
      path: HOLIDAY_RANGE,
      span: 2,
      visible: (ctx) => holidayCtx(ctx) && holidayRangeReady(ctx.root),
      virtual: { type: "text", labelKey: "sx.k10.field.range", readOnly: true, display: (ctx, labels) => holidayRangeText(ctx.root, labels) },
    },
  ],
  transform: k10Transform,
  validate: k10Validate,
};
