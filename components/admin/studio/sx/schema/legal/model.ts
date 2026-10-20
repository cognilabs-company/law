import type { StudioConstructor } from "@/lib/services/studio";
import type { SxDerivedTitle, SxPayload, SxValues } from "../../contract";
import type { SxErrors } from "../../types";

type Dict = Record<string, unknown>;

export type UzScript = "uz_latn" | "uz_cyrl";
export type LegalLang = UzScript | "ru";
export type TranslitDirection = "lat_to_cyr" | "cyr_to_lat";
export type LegalPart = "title" | "body";
export type LegalText = { title: string; body: string };
export type LegalResult = { title: string | null; body: string | null };
export type GenSnap = { title: string | null; body: string | null };
export type GenApply = { next: LegalText; snap: GenSnap; held: LegalPart[] };
export type K07Keys = { title: boolean; body: boolean; version: boolean; bump: boolean; bumpOptions: readonly string[] };
export type DocField = { name: string; label: string };

export const UZ_SCRIPTS: readonly UzScript[] = ["uz_latn", "uz_cyrl"];
export const LEGAL_PARTS: readonly LegalPart[] = ["title", "body"];
export const VERSION_BUMPS: readonly string[] = ["minor", "major"];
export const REACCEPT_ERROR = "@code:reaccept_requires_acceptance";
export const EMPTY_SNAP: GenSnap = { title: null, body: null };
export const K06_HIDDEN_KEY = /^(audience|visibility|price|currency|price_[a-z_]+|[a-z_]*accounting[a-z_]*|vat_[a-z_]+|tax_[a-z_]+)$/;

export const isK06Hidden = (key: string): boolean => K06_HIDDEN_KEY.test(key);

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const dict = (v: unknown): Dict => (isDict(v) ? v : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const own = Object.prototype.hasOwnProperty;

export const scriptOf = (v: unknown): UzScript => (v === "uz_cyrl" ? "uz_cyrl" : "uz_latn");
export const otherScript = (s: UzScript): UzScript => (s === "uz_latn" ? "uz_cyrl" : "uz_latn");
export const directionOf = (source: UzScript): TranslitDirection => (source === "uz_latn" ? "lat_to_cyr" : "cyr_to_lat");

export function hasTopField(ctor: Pick<StudioConstructor, "typed">, key: string): boolean {
  return ctor.typed.some((f) => f.key === key);
}

export function isK07V2(ctor: Pick<StudioConstructor, "typed">): boolean {
  return hasTopField(ctor, "source_script");
}

export function k07Keys(ctor: Pick<StudioConstructor, "typed">): K07Keys {
  const bump = ctor.typed.find((f) => f.key === "version_bump") ?? null;
  return {
    title: hasTopField(ctor, "title"),
    body: hasTopField(ctor, "body"),
    version: hasTopField(ctor, "version"),
    bump: !!bump,
    bumpOptions: bump?.options.length ? bump.options : VERSION_BUMPS,
  };
}

export function textOf(root: SxValues, lang: LegalLang): LegalText {
  return { title: str(dict(root.title_i18n)[lang]), body: str(dict(root.body_i18n)[lang]) };
}

export function blankHtml(html: string): boolean {
  return !String(html ?? "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

export function textEmpty(t: LegalText): boolean {
  return !t.title.trim() && blankHtml(t.body);
}

const sameText = (a: string, b: string): boolean => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

export function userOwned(current: string, snap: string | null): boolean {
  if (!current.trim() || blankHtml(current)) return false;
  if (snap === null) return true;
  return current !== snap;
}

export function editedParts(current: LegalText, snap: GenSnap): LegalPart[] {
  return LEGAL_PARTS.filter((p) => userOwned(current[p], snap[p]));
}

export function applyGenerated(current: LegalText, result: LegalResult, snap: GenSnap, force: boolean): GenApply {
  const next: LegalText = { ...current };
  const out: GenSnap = { ...snap };
  const held: LegalPart[] = [];
  for (const part of LEGAL_PARTS) {
    const res = result[part];
    if (res === null) continue;
    const cur = current[part];
    if (sameText(cur, res)) {
      out[part] = cur;
      continue;
    }
    if (force || !userOwned(cur, snap[part])) {
      next[part] = res;
      out[part] = res;
    } else held.push(part);
  }
  return { next, snap: out, held };
}

export function k07TitleFrom(payload: SxValues): SxDerivedTitle {
  const source = scriptOf(payload.source_script);
  const ti = dict(payload.title_i18n);
  const value =
    [ti[source], ti[otherScript(source)], ti.ru]
      .map((v) => str(v).trim())
      .find(Boolean) ?? "";
  return { value, path: `title_i18n.${source}` };
}

export function k07Transform(keys: K07Keys): (next: SxPayload, prev: SxValues) => SxPayload {
  return (next, prev) => {
    const src: SxPayload = next ?? {};
    const initial = prev === next;
    let out: SxPayload | null = null;
    const put = (key: string, value: unknown) => {
      const base: SxPayload = out ?? src;
      const has = own.call(base, key);
      if (value === undefined ? !has : has && base[key] === value) return;
      const copy: SxPayload = out ?? { ...src };
      if (value === undefined) delete copy[key];
      else copy[key] = value;
      out = copy;
    };
    const sync = (key: string, want: string) => {
      if (str((out ?? src)[key]) !== want) put(key, want);
    };
    const source = scriptOf(src.source_script);
    if (src.source_script !== source) put("source_script", source);
    let ti = dict(src.title_i18n);
    let bi = dict(src.body_i18n);
    if (initial) {
      const oldTitle = str(src.title).trim();
      if (oldTitle && UZ_SCRIPTS.every((s) => !str(ti[s]).trim())) {
        ti = { ...ti, [source]: str(src.title) };
        put("title_i18n", ti);
      }
      const oldBody = str(src.body);
      if (!blankHtml(oldBody) && UZ_SCRIPTS.every((s) => blankHtml(str(bi[s])))) {
        bi = { ...bi, [source]: oldBody };
        put("body_i18n", bi);
      }
    }
    if (keys.title) sync("title", str(ti[source]));
    else put("title", undefined);
    if (keys.body) sync("body", str(bi[source]));
    else put("body", undefined);
    if (!keys.version) put("version", undefined);
    if (keys.bump && !keys.bumpOptions.includes(str(src.version_bump))) put("version_bump", keys.bumpOptions.includes("minor") ? "minor" : keys.bumpOptions[0]);
    if (src.acceptance_required !== true && src.requires_reaccept === true) put("requires_reaccept", false);
    return out ?? src;
  };
}

export function k07Validate(payload: SxValues): SxErrors {
  const v: SxValues = payload ?? {};
  const out: Record<string, string> = {};
  const source = scriptOf(v.source_script);
  const text = textOf(v, source);
  if (!text.title.trim()) out[`title_i18n.${source}`] = "@required";
  if (blankHtml(text.body)) out[`body_i18n.${source}`] = "@required";
  if (v.requires_reaccept === true && v.acceptance_required !== true) out.requires_reaccept = REACCEPT_ERROR;
  return out;
}

export function isNewDocument(root: SxValues): boolean {
  return !str(root.document_id).trim();
}

export function k06Transform(present: ReadonlySet<string>): (next: SxPayload) => SxPayload {
  return (next) => {
    const src: SxPayload = next ?? {};
    let out: SxPayload | null = null;
    for (const key of Object.keys(src)) {
      if (present.has(key) || !isK06Hidden(key)) continue;
      out = out ?? { ...src };
      delete out[key];
    }
    return out ?? src;
  };
}

export function k06Validate(payload: SxValues): SxErrors {
  const v: SxValues = payload ?? {};
  return str(v.service_id).trim() ? {} : { service_id: "@required" };
}

export const isUploadMode = (root: SxValues): boolean => str(root.mode) === "upload";

export function docFieldsOf(root: SxValues): DocField[] {
  const rows = Array.isArray(root.fields) ? root.fields : [];
  const seen = new Set<string>();
  const out: DocField[] = [];
  for (const row of rows) {
    const d = dict(row);
    const name = str(d.name).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, label: str(d.label).trim() || name });
  }
  return out;
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

export function placeholdersIn(html: string): string[] {
  const out: string[] = [];
  for (const m of String(html ?? "").matchAll(PLACEHOLDER)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function placeholderToken(name: string): string {
  return `{{${name}}}`;
}

export function plainLength(html: string): number {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .trim().length;
}
