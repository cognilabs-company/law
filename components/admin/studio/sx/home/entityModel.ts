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

export function normEntityCard(raw: unknown): EntityCard | null {
  const d = dictOf(raw);
  const code = strOf(d.constructor_code ?? d.code);
  const key = strOf(d.key) || code;
  if (!key || !code) return null;
  return {
    key,
    title: strOf(d.title),
    code,
    total: optNum(d.total) ?? 0,
    active: optNum(d.active_count),
    inactive: optNum(d.inactive_count),
    incomplete: optNum(d.incomplete_count),
    incompleteDrafts: optNum(d.studio_object_incomplete_count),
    incompleteJourneys: optNum(d.journey_incomplete_count),
    studioObjects: optNum(d.studio_object_count),
    listUrl: strOf(d.list_url),
    incompleteUrl: strOf(d.incomplete_url),
    createUrl: strOf(d.create_url),
  };
}

export function normEntityCards(raw: unknown): EntityCard[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EntityCard[] = [];
  for (const r of raw) {
    const c = normEntityCard(r);
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
