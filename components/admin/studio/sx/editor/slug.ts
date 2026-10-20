import type { StudioConstructor, StudioSchemaField } from "@/lib/services/studio";
import type { SxPayload } from "../contract";
import type { SxErrors } from "../types";

export const SLUG_PATH = "slug";
export const SLUG_ON_TITLE = "@slugTitle";
const SLUG_MAX = 80;

const CYRILLIC: Readonly<Record<string, string>> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  ў: "o",
  қ: "q",
  ғ: "g",
  ҳ: "h",
  є: "ye",
  і: "i",
  ї: "yi",
};

const APOSTROPHES = /['`´ʻʼʽ‘’‛′]/g;

export function slugify(text: string, max: number = SLUG_MAX): string {
  const lower = String(text ?? "").toLowerCase();
  let latin = "";
  for (const ch of lower) latin += CYRILLIC[ch] ?? ch;
  const plain = latin
    .replace(APOSTROPHES, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : SLUG_MAX;
  return plain.length > limit ? plain.slice(0, limit).replace(/-+$/, "") : plain;
}

export function slugFieldOf(ctor: Pick<StudioConstructor, "typed" | "schema"> | null): StudioSchemaField | null {
  if (!ctor) return null;
  return ctor.typed.find((f) => f.key === SLUG_PATH) ?? null;
}

export function slugRequired(ctor: Pick<StudioConstructor, "typed" | "schema"> | null): boolean {
  const f = slugFieldOf(ctor);
  if (!f || !ctor) return false;
  return f.required || ctor.schema.required.includes(SLUG_PATH);
}

const filled = (v: unknown): boolean => (typeof v === "string" ? v.trim() !== "" : v !== null && v !== undefined);

export type SlugPolicy = {
  force?: boolean;
  keep?: boolean;
  fresh?: boolean;
  rejected?: string;
  generated?: readonly string[];
  titles?: readonly string[];
};

export function slugOf(payload: SxPayload | null | undefined): string {
  const v = payload ? payload[SLUG_PATH] : undefined;
  return typeof v === "string" ? v.trim() : "";
}

function withoutSlug(payload: SxPayload): SxPayload {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) if (k !== SLUG_PATH) out[k] = v;
  return out as SxPayload;
}

export function withGeneratedSlug(ctor: Pick<StudioConstructor, "typed" | "schema"> | null, payload: SxPayload, title: string, policy: SlugPolicy = {}): SxPayload {
  const f = slugFieldOf(ctor);
  if (!f) return payload;
  const max = f.type === "text" && f.max !== null && f.max > 0 ? f.max : SLUG_MAX;
  const value = slugify(title, max);
  if (filled(payload[SLUG_PATH])) {
    if (policy.keep) return payload;
    const current = slugOf(payload);
    const auto = new Set<string>(policy.generated ?? []);
    for (const t of policy.titles ?? []) if (t.trim()) auto.add(slugify(t, max));
    const own = Boolean(policy.fresh) || (Boolean(policy.rejected) && current === policy.rejected) || auto.has(current);
    if (!own || value === current) return payload;
    return value ? { ...payload, [SLUG_PATH]: value } : withoutSlug(payload);
  }
  if (!policy.force && !slugRequired(ctor)) return payload;
  return value ? { ...payload, [SLUG_PATH]: value } : payload;
}

const INHERITED_KEY = "lexgo_sx_inherited_slugs";
const INHERITED_MAX = 50;
const inherited = new Map<string, string>();

function readInherited(): Record<string, string> {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(INHERITED_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, s] of Object.entries(v as Record<string, unknown>)) if (typeof s === "string" && s) out[k] = s;
    return out;
  } catch {
    return {};
  }
}

export function noteInheritedSlug(id: string, payload: SxPayload | null | undefined): void {
  const slug = slugOf(payload);
  if (!id || !slug) return;
  inherited.set(id, slug);
  if (typeof window === "undefined") return;
  try {
    const all: Record<string, string> = { ...readInherited(), [id]: slug };
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - INHERITED_MAX))) delete all[k];
    window.sessionStorage.setItem(INHERITED_KEY, JSON.stringify(all));
  } catch {
    return;
  }
}

export function inheritedSlugOf(id: string | null | undefined): string {
  if (!id) return "";
  return inherited.get(id) ?? readInherited()[id] ?? "";
}

export function isSlugPath(path: string): boolean {
  return path === SLUG_PATH || path.startsWith(`${SLUG_PATH}.`) || path.startsWith(`${SLUG_PATH}[`);
}

export function slugErrorsOnTitle(errors: SxErrors, titlePath: string): { errors: SxErrors; moved: boolean } {
  const keys = Object.keys(errors).filter((k) => k === SLUG_PATH || k.startsWith(`${SLUG_PATH}.`));
  if (!keys.length) return { errors, moved: false };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors)) if (!keys.includes(k)) out[k] = v;
  if (!out[titlePath]) out[titlePath] = SLUG_ON_TITLE;
  return { errors: out, moved: true };
}
