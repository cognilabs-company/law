// Global settings of the document services (TSK-136097): one active,
// versioned configuration. A change is a new draft (POST), publishing makes
// it the active one, rollback brings an earlier version back; orders keep
// the snapshot they were made with. GET /document-service-settings/runtime
// is what the services read now.

import { asArr, asDict, asNum, asStr, http, type Dict } from "@/lib/http";

export const DOC_FORMATS = ["pdf", "doc", "docx"] as const;
export const DOC_MODES = ["manual", "lawyer", "review", "analysis"] as const;

export type PageTier = { minPages: number; maxPages: number | null; amount: number };
export type DocSettings = {
  allowedFormats: string[];
  maxFileMb: number;
  includedPages: number;
  pagePricing: PageTier[];
  extraPagePrice: number;
  modes: string[];
  planRequirements: Dict;
  reviewPolicy: Dict;
  downloadPolicy: Dict;
  currency: string;
};
export type DocSettingsVersion = { id: string; version: number | null; status: string; createdAt: string; publishedAt: string; createdBy: string; settings: DocSettings };

export function settingsOf(v: unknown): DocSettings {
  const d = asDict(v);
  return {
    allowedFormats: asArr(d.allowed_formats).map((x) => asStr(x)).filter(Boolean),
    maxFileMb: asNum(d.max_file_mb, 25),
    includedPages: asNum(d.included_pages, 10),
    pagePricing: asArr(d.page_pricing).map((x) => {
      const r = asDict(x);
      const max = r.max_pages;
      return { minPages: asNum(r.min_pages, 1), maxPages: max === null || max === undefined || max === "" ? null : asNum(max), amount: asNum(r.amount) };
    }),
    extraPagePrice: asNum(d.extra_page_price),
    modes: asArr(d.modes).map((x) => asStr(x)).filter(Boolean),
    planRequirements: asDict(d.plan_requirements),
    reviewPolicy: asDict(d.review_policy),
    downloadPolicy: asDict(d.download_policy),
    currency: asStr(d.currency) || "UZS",
  };
}

export function settingsBody(s: DocSettings): Dict {
  return {
    allowed_formats: s.allowedFormats,
    max_file_mb: s.maxFileMb,
    included_pages: s.includedPages,
    page_pricing: s.pagePricing.map((r) => ({ min_pages: r.minPages, max_pages: r.maxPages, amount: r.amount })),
    extra_page_price: s.extraPagePrice,
    modes: s.modes,
    plan_requirements: s.planRequirements,
    review_policy: s.reviewPolicy,
    download_policy: s.downloadPolicy,
    currency: "UZS",
  };
}

function versionOf(v: unknown): DocSettingsVersion {
  const d = asDict(v);
  const n = Number(d.version ?? d.version_number);
  const by = asDict(d.created_by);
  return {
    id: asStr(d.id ?? d.settings_id),
    version: Number.isFinite(n) && n > 0 ? n : null,
    status: asStr(d.status).toLowerCase(),
    createdAt: asStr(d.created_at),
    publishedAt: asStr(d.published_at),
    createdBy: asStr(by.name ?? d.created_by_name),
    settings: settingsOf(d.settings ?? d.payload ?? d.data ?? d),
  };
}

export async function getDocSettingsAdmin(signal?: AbortSignal): Promise<{ active: DocSettingsVersion | null; versions: DocSettingsVersion[] }> {
  const d = asDict(await http("/admin/document-service-settings", { signal }));
  const active = d.active && typeof d.active === "object" ? versionOf(d.active) : null;
  return { active, versions: asArr(d.versions ?? d.items).map(versionOf).filter((v) => v.id) };
}

export async function getDocSettingsRuntime(signal?: AbortSignal): Promise<{ settings: DocSettings; version: number | null; settingsId: string }> {
  const d = asDict(await http("/document-service-settings/runtime", { signal }));
  const n = Number(d.version);
  return { settings: settingsOf(d.settings), version: Number.isFinite(n) ? n : null, settingsId: asStr(d.settings_id) };
}

export async function createDocSettingsDraft(s: DocSettings): Promise<DocSettingsVersion> {
  return versionOf(await http("/admin/document-service-settings", { method: "POST", body: JSON.stringify(settingsBody(s)) }));
}

export async function publishDocSettings(id: string): Promise<DocSettingsVersion> {
  return versionOf(await http(`/admin/document-service-settings/${encodeURIComponent(id)}/publish`, { method: "POST", body: "{}" }));
}

export async function rollbackDocSettings(id: string): Promise<DocSettingsVersion> {
  return versionOf(await http(`/admin/document-service-settings/${encodeURIComponent(id)}/rollback`, { method: "POST", body: "{}" }));
}

// Client-side checks that mirror the payload schema, so a bad draft is
// caught before the request.
export function docSettingsIssues(s: DocSettings): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s.allowedFormats.length) out.formats = "pickFormat";
  if (!s.modes.length) out.modes = "pickMode";
  if (!(s.maxFileMb >= 1 && s.maxFileMb <= 500)) out.maxFileMb = "range";
  if (!(s.includedPages >= 1 && s.includedPages <= 1000)) out.includedPages = "range";
  if (!(s.extraPagePrice >= 0)) out.extraPagePrice = "range";
  s.pagePricing.forEach((r, i) => {
    if (!(r.minPages >= 1) || (r.maxPages !== null && r.maxPages < r.minPages) || !(r.amount >= 0)) out[`tier${i}`] = "tier";
  });
  return out;
}

// The runtime settings for client-side checks, read once per page load;
// the backend's own validation stays final (2026-10-24 §9).
let runtimeCache: Promise<DocSettings | null> | null = null;
export function docRuntimeSettings(): Promise<DocSettings | null> {
  runtimeCache ??= getDocSettingsRuntime().then(
    (r) => r.settings,
    () => {
      runtimeCache = null;
      return null;
    },
  );
  return runtimeCache;
}

const MIME_OF: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};
// An <input accept> value for the given extensions.
export const acceptFor = (formats: readonly string[]): string => formats.flatMap((f) => [`.${f}`, MIME_OF[f] ?? ""]).filter(Boolean).join(",");
