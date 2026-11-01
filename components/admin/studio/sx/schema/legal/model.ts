import { ApiError } from "@/lib/http";
import type { StudioConstructor } from "@/lib/services/studio";
import type { SxDerivedTitle, SxPayload, SxValues } from "../../contract";
import type { SxErrors } from "../../types";

type Dict = Record<string, unknown>;

export type UzScript = "uz_latn" | "uz_cyrl";
export type TrailLang = "ru" | "en";
export type LegalLang = UzScript | TrailLang;
export type LangTab = "uz" | TrailLang;
export type LangState = "empty" | "partial" | "complete";
export type OmissionNote = { kind: "removed" | "unpublished"; langs: TrailLang[] };
export type TranslitDirection = "lat_to_cyr" | "cyr_to_lat";
export type LegalPart = "title" | "body";
export type LegalText = { title: string; body: string };
export type LegalResult = { title: string | null; body: string | null };
export type GenSnap = { title: string | null; body: string | null };
export type GenApply = { next: LegalText; snap: GenSnap; held: LegalPart[] };
export type K07Keys = { title: boolean; body: boolean; version: boolean; bump: boolean; bumpOptions: readonly string[] };
export type DocField = { name: string; label: string };

export const UZ_SCRIPTS: readonly UzScript[] = ["uz_latn", "uz_cyrl"];
export const TRAIL_LANGS: readonly TrailLang[] = ["ru", "en"];
export const LANG_TABS: readonly LangTab[] = ["uz", "ru", "en"];
export const LEGAL_PARTS: readonly LegalPart[] = ["title", "body"];
export const VERSION_BUMPS: readonly string[] = ["minor", "major"];
export const REACCEPT_ERROR = "@code:reaccept_requires_acceptance";
// What a missing part of a language says on its field: Uzbek is required,
// Russian and English only come as a pair of title and text.
export const UZ_PART_ERROR: Readonly<Record<LegalPart, string>> = { title: "@code:legal_uz_title_required", body: "@code:legal_uz_body_required" };
export const PAIR_ERROR: Readonly<Record<TrailLang, Record<LegalPart, string>>> = {
  ru: { title: "@code:legal_ru_title_required", body: "@code:legal_ru_body_required" },
  en: { title: "@code:legal_en_title_required", body: "@code:legal_en_body_required" },
};
export const UZ_REQUIRED_CODE = "legal_uz_translation_required";
export const PAIR_REQUIRED_CODE = "legal_translation_pair_required";
const TRANSLATION_REQUIRED = "@code:translation_required";
const STUDIO_LANG_ERROR: Readonly<Record<TrailLang, Record<LegalPart, string>>> = {
  ru: { title: "@code:legal_ru_title_studio", body: "@code:legal_ru_body_studio" },
  en: { title: "@code:legal_en_title_studio", body: "@code:legal_en_body_studio" },
};
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

export function stateOf(t: LegalText): LangState {
  const title = !!t.title.trim();
  const body = !blankHtml(t.body);
  return title && body ? "complete" : title || body ? "partial" : "empty";
}

export const tabLang = (root: SxValues, tab: LangTab): LegalLang => (tab === "uz" ? scriptOf(root.source_script) : tab);

export function langState(root: SxValues, tab: LangTab): LangState {
  return stateOf(textOf(root, tabLang(root, tab)));
}

// The parts of a language its own pair still lacks: nothing when it is
// complete or left out entirely.
export function missingParts(t: LegalText): LegalPart[] {
  if (stateOf(t) !== "partial") return [];
  return t.title.trim() ? ["body"] : ["title"];
}

// Russian or English left empty is not published with this version: an
// existing document loses that translation until a reviewed one comes, a new
// one just goes out without it.
export function omissionOf(root: SxValues): OmissionNote | null {
  const langs = TRAIL_LANGS.filter((l) => langState(root, l) === "empty");
  return langs.length ? { kind: isNewDocument(root) ? "unpublished" : "removed", langs } : null;
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
    [ti[source], ti[otherScript(source)], ti.uz, ti.ru, ti.en]
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
      // A version the backend already keeps under its canonical "uz" key is
      // edited in the chosen script; the canonical copy is not sent back.
      if (own.call(ti, "uz")) {
        const { uz, ...rest } = ti;
        ti = UZ_SCRIPTS.every((s) => !str(rest[s]).trim()) && str(uz).trim() ? { ...rest, [source]: str(uz) } : rest;
        put("title_i18n", ti);
      }
      if (own.call(bi, "uz")) {
        const { uz, ...rest } = bi;
        bi = UZ_SCRIPTS.every((s) => blankHtml(str(rest[s]))) && !blankHtml(str(uz)) ? { ...rest, [source]: str(uz) } : rest;
        put("body_i18n", bi);
      }
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
  if (!text.title.trim()) out[`title_i18n.${source}`] = UZ_PART_ERROR.title;
  if (blankHtml(text.body)) out[`body_i18n.${source}`] = UZ_PART_ERROR.body;
  for (const lang of TRAIL_LANGS) for (const part of missingParts(textOf(v, lang))) out[`${part}_i18n.${lang}`] = PAIR_ERROR[lang][part];
  if (v.requires_reaccept === true && v.acceptance_required !== true) out.requires_reaccept = REACCEPT_ERROR;
  return out;
}

// What is sent: every language that has both parts, the chosen Uzbek script
// and whatever the author has half-filled (the form blocks that first). A
// Russian or English left empty is not sent at all, nor the old title_json /
// body_json or the canonical "uz" copy.
export function k07Outgoing(payload: SxPayload): SxPayload {
  const src: SxPayload = payload ?? {};
  const ti = { ...dict(src.title_i18n) };
  const bi = { ...dict(src.body_i18n) };
  delete ti.uz;
  delete bi.uz;
  for (const lang of TRAIL_LANGS) {
    if (stateOf({ title: str(ti[lang]), body: str(bi[lang]) }) !== "empty") continue;
    delete ti[lang];
    delete bi[lang];
  }
  const out: SxPayload = { ...src, title_i18n: ti, body_i18n: bi };
  delete out.title_json;
  delete out.body_json;
  return out;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).map((x) => x.trim()).filter(Boolean) : []);

type LegalProblem = { code: string; fields: string[]; languages: string[] };

function problemsOf(raw: unknown): LegalProblem[] {
  const top = raw instanceof ApiError ? raw.data : dict(raw);
  const out: LegalProblem[] = [];
  const add = (d: Dict) => {
    const code = str(d.code).toLowerCase();
    if (code !== UZ_REQUIRED_CODE && code !== PAIR_REQUIRED_CODE) return;
    const one = str(d.field) || str(d.path);
    out.push({ code, fields: [...strList(d.fields), ...(one ? [one] : [])], languages: strList(d.languages).map((l) => l.toLowerCase()) });
  };
  const scan = (d: Dict) => {
    add(d);
    for (const k of ["errors", "field_errors"]) for (const it of Array.isArray(d[k]) ? d[k] : []) if (isDict(it)) add(it);
  };
  scan(top);
  if (isDict(top.detail)) scan(top.detail);
  else if (Array.isArray(top.detail)) for (const it of top.detail) if (isDict(it)) add(it);
  return out;
}

// "title_i18n.uz" (or a script key) as the path the Uzbek editor has now.
function uzPathOf(path: string, source: UzScript): { part: LegalPart; path: string } | null {
  const m = /^(?:body\.|payload\.)?(title|body)_i18n\.(uz|uz_latn|uz_cyrl)$/.exec(path.trim());
  return m ? { part: m[1] as LegalPart, path: `${m[1]}_i18n.${source}` } : null;
}

// The backend's legal checks put on the field they are about: a missing
// Uzbek title or text on the Uzbek tab, a half translation on the part its
// language still lacks. Errors already on a canonical "uz" path move to the
// script being edited. Anything else is left as it came.
export function k07ServerErrors(errors: SxErrors, raw: unknown, payload: SxValues): SxErrors {
  const v: SxValues = payload ?? {};
  const source = scriptOf(v.source_script);
  const out: Record<string, string> = {};
  for (const [path, token] of Object.entries(errors ?? {})) {
    const uz = uzPathOf(path, source);
    const trail = /^(?:body\.|payload\.)?(title|body)_i18n\.(ru|en)$/.exec(path.trim());
    // Studio validate answers a missing language with HTTP 200, ok=false and
    // translation_required on its field (backend answers 2026-11-01 N5): the
    // Uzbek one is required, a Russian or English one wants its pair.
    if (uz) out[uz.path] = token === `@code:${UZ_REQUIRED_CODE}` || token === "@required" || token === "@code:required" || token === TRANSLATION_REQUIRED ? UZ_PART_ERROR[uz.part] : token;
    else if (trail && (token === TRANSLATION_REQUIRED || token === `@code:${PAIR_REQUIRED_CODE}`)) {
      const lang = trail[2] as TrailLang;
      const text = textOf(v, lang);
      // Half a translation wants its other half; a language left out
      // entirely is one Studio's own check asks for.
      const empty = !text.title.trim() && blankHtml(text.body);
      out[path.trim().replace(/^(?:body|payload)\./, "")] = empty ? STUDIO_LANG_ERROR[lang][trail[1] as LegalPart] : PAIR_ERROR[lang][trail[1] as LegalPart];
    }
    else out[path] = token;
  }
  for (const p of problemsOf(raw)) {
    if (p.code === UZ_REQUIRED_CODE) {
      const parts = p.fields.map((f) => uzPathOf(f, source)?.part).filter((x): x is LegalPart => !!x);
      for (const part of parts.length ? parts : LEGAL_PARTS) out[`${part}_i18n.${source}`] = UZ_PART_ERROR[part];
      continue;
    }
    for (const lang of p.languages) {
      if (lang !== "uz" && lang !== "ru" && lang !== "en") continue;
      const at = lang === "uz" ? source : lang;
      const text = textOf(v, at);
      const missing = LEGAL_PARTS.filter((part) => (part === "title" ? !text.title.trim() : blankHtml(text.body)));
      for (const part of missing.length && missing.length < 2 ? missing : LEGAL_PARTS) out[`${part}_i18n.${at}`] = lang === "uz" ? UZ_PART_ERROR[part] : PAIR_ERROR[lang][part];
    }
  }
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
