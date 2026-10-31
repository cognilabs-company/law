import type { StudioJourneyType } from "@/lib/services/studio";
import { ctorQueryOf, ctorQueryString } from "../ctorpage/urlState";

export type EntityCard = {
  key: string;
  title: string;
  code: string;
  total: number;
  active: number | null;
  inactive: number | null;
  incomplete: number | null;
  // incomplete = drafts in Studio + creation journeys left part-way.
  incompleteDrafts: number | null;
  incompleteJourneys: number | null;
  studioObjects: number | null;
  listUrl: string;
  incompleteUrl: string;
  createUrl: string;
};

const RECORDS_PATH = /^\/(?:api\/backend\/)?studio\/constructors\/([^/?#]+)\/records\/?$/;
const enc = encodeURIComponent;

function dictOf(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function strOf(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

function optNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// The card list is still a flexible structure in OpenAPI (answers
// 2026-10-31 §4.8): counts may sit on the card or under `counts`, as
// `active_count` or plain `active`, and URLs under `urls`. Whatever is
// missing stays null rather than being made up.
export function normEntityCard(raw: unknown, keyHint = ""): EntityCard | null {
  const d = dictOf(raw);
  const n = dictOf(d.counts);
  const u = dictOf(d.urls ?? d.links);
  const count = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = optNum(d[k] ?? n[k]);
      if (v !== null) return v;
    }
    return null;
  };
  const url = (...keys: string[]): string => keys.map((k) => strOf(d[k]) || strOf(u[k])).find(Boolean) ?? "";
  const code = strOf(d.constructor_code ?? d.code);
  const key = strOf(d.key) || keyHint || code;
  if (!key || !code) return null;
  return {
    key,
    title: strOf(d.title),
    code,
    total: count("total", "total_count") ?? 0,
    active: count("active_count", "active"),
    inactive: count("inactive_count", "inactive"),
    incomplete: count("incomplete_count", "incomplete"),
    incompleteDrafts: count("studio_object_incomplete_count"),
    incompleteJourneys: count("journey_incomplete_count"),
    studioObjects: count("studio_object_count"),
    listUrl: url("list_url", "list"),
    incompleteUrl: url("incomplete_url", "incomplete"),
    createUrl: url("create_url", "create"),
  };
}

export function normEntityCards(raw: unknown): EntityCard[] | null {
  // A list, or an object keyed by the card's key.
  const rows: [string, unknown][] = Array.isArray(raw) ? raw.map((r) => ["", r]) : raw && typeof raw === "object" ? Object.entries(raw as Record<string, unknown>) : [];
  if (!Array.isArray(raw) && !rows.length) return null;
  const out: EntityCard[] = [];
  for (const [hint, r] of rows) {
    const c = normEntityCard(r, hint);
    if (c && !out.some((x) => x.key === c.key)) out.push(c);
  }
  return out;
}

export function recordsHrefOf(url: string, fallbackCode: string): string {
  let code = fallbackCode;
  let qs = "";
  if (url) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url, "http://studio.local");
    } catch {
      parsed = null;
    }
    const m = parsed ? RECORDS_PATH.exec(parsed.pathname) : null;
    if (parsed && m) {
      code = safeDecode(m[1]) || fallbackCode;
      const sp: Record<string, string> = {};
      parsed.searchParams.forEach((v, k) => {
        if (!(k in sp)) sp[k] = v;
      });
      qs = ctorQueryString(ctorQueryOf(sp));
    }
  }
  if (!code) return "";
  return `/admin/studio/c/${enc(code)}${qs ? `?${qs}` : ""}`;
}

export function createTypeOf(card: Pick<EntityCard, "key" | "code">): StudioJourneyType | null {
  const key = card.key.toLowerCase();
  const code = card.code.toUpperCase();
  if (key === "services" || code === "K02") return "service";
  if (key === "packages" || code === "K03-M" || code === "K03") return "package";
  return null;
}

export function createHrefOf(card: Pick<EntityCard, "key" | "code" | "createUrl">): string {
  const type = card.createUrl ? createTypeOf(card) : null;
  return type ? `/admin/studio/create?type=${type}` : "";
}
