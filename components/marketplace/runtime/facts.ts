import { DEFAULT_BUSINESS_WEEKDAYS, type ChecklistItem, type MinimumRequirements, type RuntimeConfig, type RuntimeDuration, type RuntimeFactor, type RuntimeGuarantee, type RuntimeTemplate, type ServiceRule } from "@/lib/services/marketRuntime";

export type DurationKey = "minute" | "hour" | "day" | "businessDay" | "week" | "month" | "other";
export type DurationParts = { key: DurationKey; n: number; unit: string; business: boolean };

const KNOWN_UNITS = ["minute", "hour", "day", "week", "month"] as const;

export function durationParts(d: RuntimeDuration | null | undefined): DurationParts | null {
  if (!d) return null;
  const unit = (d.unit || "").trim();
  const n = Math.round((Number(d.value) || 0) * 10) / 10;
  if (!(n > 0) || !unit) return null;
  const business = d.calendar === "business";
  const known = (KNOWN_UNITS as readonly string[]).includes(unit) ? (unit as (typeof KNOWN_UNITS)[number]) : null;
  const key: DurationKey = !known ? "other" : known === "day" && business ? "businessDay" : known;
  return { key, n, unit, business };
}

const WEEKDAY_ANCHOR = Date.UTC(2024, 0, 1);

function weekdayName(day: number, locale: string): string {
  try {
    const s = new Intl.DateTimeFormat(locale === "uz" ? "uz-Latn" : locale, { weekday: "long", timeZone: "UTC" }).format(new Date(WEEKDAY_ANCHOR + (day - 1) * 86400000));
    return locale === "en" ? s : s.toLocaleLowerCase(locale === "uz" ? "uz-Latn" : locale);
  } catch {
    return String(day);
  }
}

export function businessWeekdays(d: RuntimeDuration | null | undefined): number[] {
  const list = (d?.businessWeekdays ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  return list.length ? [...new Set(list)].sort((a, b) => a - b) : [...DEFAULT_BUSINESS_WEEKDAYS];
}

export function weekdayRange(days: readonly number[], locale: string): string {
  if (!days.length) return "";
  const contiguous = days.every((n, i) => i === 0 || n === days[i - 1] + 1);
  if (contiguous && days.length > 2) return `${weekdayName(days[0], locale)}–${weekdayName(days[days.length - 1], locale)}`;
  return days.map((n) => weekdayName(n, locale)).join(", ");
}

export type DurationStart = "afterAccept" | "afterPayment";

export function durationStart(d: RuntimeDuration): DurationStart | null {
  const s = (d.startsOn || "").trim().toLowerCase();
  if (!s || /accept|start|seller|work/.test(s)) return "afterAccept";
  if (/pay/.test(s)) return "afterPayment";
  return null;
}

export function orderedFactors(list: readonly RuntimeFactor[] | null | undefined): RuntimeFactor[] {
  const valid = (list ?? []).filter((f) => f.value > 0 && !!f.title.trim());
  return [...valid.filter((f) => f.adjustmentType !== "percent"), ...valid.filter((f) => f.adjustmentType === "percent")];
}

const AMOUNT_KEYS = ["effective_amount", "estimated_amount", "amount_uzs", "price_delta"];

export function factorAmount(base: number, f: RuntimeFactor): number {
  if (!(f.value > 0)) return 0;
  for (const k of AMOUNT_KEYS) {
    const n = Number(f.raw?.[k]);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  if (f.adjustmentType === "percent") return Math.max(0, Math.round((Math.max(0, Number(base) || 0) * f.value) / 100));
  return Math.max(0, f.value);
}

export type TemplateInfo = { mode: "required" | "optional"; source: "catalog" | "upload" | "catalog_or_upload" | "" };

const TEMPLATE_SOURCES = ["catalog", "upload", "catalog_or_upload"] as const;

export function templateInfo(t: RuntimeTemplate | null | undefined): TemplateInfo | null {
  if (!t) return null;
  const mode = (t.mode || "").trim().toLowerCase();
  if (mode !== "required" && mode !== "optional") return null;
  const raw = (t.source || "").trim().toLowerCase();
  const source = (TEMPLATE_SOURCES as readonly string[]).includes(raw) ? (raw as TemplateInfo["source"]) : "";
  return { mode, source };
}

export type RequirementInfo = { verified: boolean; years: number; rating: number };

export function requirementInfo(r: MinimumRequirements | null | undefined): RequirementInfo | null {
  if (!r || r.empty) return null;
  const verified = r.verified === true;
  const years = r.minimumExperienceYears > 0 ? r.minimumExperienceYears : 0;
  const rating = r.minimumRating > 0 ? r.minimumRating : 0;
  if (!verified && !years && !rating) return null;
  return { verified, years, rating };
}

export type GuaranteeIcon = "shield" | "refund" | "clock" | "check" | "lock" | "star" | "doc";

const ICON_RULES: [RegExp, GuaranteeIcon][] = [
  [/refund|money|pul|qaytar|coin/, "refund"],
  [/clock|time|deadline|muddat/, "clock"],
  [/lock|secure|privacy/, "lock"],
  [/star|quality|sifat/, "star"],
  [/doc|file|hujjat/, "doc"],
  [/check|ok|done/, "check"],
];

export function guaranteeIcon(icon: string): GuaranteeIcon {
  const s = (icon || "").trim().toLowerCase();
  if (!s) return "shield";
  for (const [re, name] of ICON_RULES) if (re.test(s)) return name;
  return "shield";
}

export function guaranteesOf(c: RuntimeConfig | null | undefined): RuntimeGuarantee[] {
  const seen = new Set<string>();
  const out: RuntimeGuarantee[] = [];
  for (const g of c?.guarantees ?? []) {
    if (!g.title.trim()) continue;
    const key = g.id || g.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

export function checklistOf(c: RuntimeConfig | null | undefined): ChecklistItem[] {
  const list = (c?.checklistPreview ?? []).filter((i) => !!i.title.trim());
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const x = a.item.sortOrder > 0 ? a.item.sortOrder : Infinity;
      const y = b.item.sortOrder > 0 ? b.item.sortOrder : Infinity;
      return x === y ? a.i - b.i : x < y ? -1 : 1;
    })
    .map((x) => x.item);
}

export function rulesOf(c: RuntimeConfig | null | undefined): ServiceRule[] {
  const seen = new Set<string>();
  const out: ServiceRule[] = [];
  for (const r of c?.rules ?? []) {
    if (!r.title.trim() && !r.body.trim()) continue;
    const key = r.id || r.ruleKey || r.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export type ProofKind = "comment" | "image" | "file";

export function proofsOf(item: ChecklistItem): ProofKind[] {
  const methods = item.verificationMethods ?? [];
  const out: ProofKind[] = [];
  if (methods.includes("comment") || item.commentRequired) out.push("comment");
  if (methods.includes("image") || item.imageRequired) out.push("image");
  if (methods.includes("file") || item.fileRequired) out.push("file");
  return out;
}

export type FactSection = "duration" | "steps" | "guarantees" | "checklist" | "rules" | "template" | "factors" | "requirements";

export const DETAIL_SECTIONS: readonly FactSection[] = ["duration", "steps", "checklist", "rules", "template", "factors", "requirements"];
export const ASSIST_SECTIONS: readonly FactSection[] = ["duration", "steps", "guarantees", "checklist", "rules", "template", "factors", "requirements"];
export const SELLER_PREVIEW_SECTIONS: readonly FactSection[] = ["duration", "guarantees", "checklist", "rules"];

function hasSection(c: RuntimeConfig, s: FactSection): boolean {
  switch (s) {
    case "duration":
      return !!durationParts(c.duration);
    case "steps":
      return c.usageSteps.length > 0;
    case "guarantees":
      return guaranteesOf(c).length > 0;
    case "checklist":
      return checklistOf(c).length > 0;
    case "rules":
      return rulesOf(c).length > 0;
    case "template":
      return !!templateInfo(c.template);
    case "factors":
      return orderedFactors(c.pricing?.factors).length > 0;
    case "requirements":
      return !!requirementInfo(c.minimumRequirements);
  }
}

export function factSections(c: RuntimeConfig | null | undefined, wanted: readonly FactSection[]): FactSection[] {
  if (!c) return [];
  return wanted.filter((s) => hasSection(c, s));
}

export function fmtPct(v: number, locale: string): string {
  const s = String(Math.round((Number(v) || 0) * 100) / 100);
  return locale === "en" ? s : s.replace(".", ",");
}

export type HeadingLevel = 3 | 4 | 5;

