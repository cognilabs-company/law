// The admin legal editor's rules (LEXGO_LEGAL_DOCUMENT_LANGUAGES_FRONTEND_FINAL
// _2026_11_01, backend eecebb9): one document in Uzbek, Russian and English.
// Uzbek title + body are required; Russian and English are optional, but a
// language that is started needs both its title and its body. A version
// keeps only the translations sent with it, so leaving one out removes it
// from that version. Pure functions, so the rules are tested apart from the UI.
import { ApiError } from "@/lib/http";
import type { LegalLang } from "@/lib/legal";
import type { ConsentDoc } from "@/lib/services/backend";

export const LEGAL_LANGS: readonly LegalLang[] = ["uz", "ru", "en"];
export type LegalPart = "title" | "body";
export type LegalDraft = Record<LegalLang, { title: string; body: string }>;
// "uz.title" → why it can't be sent: "required" (Uzbek is missing) or "pair"
// (this language has only one of its two parts).
export type LegalDraftErrors = Partial<Record<`${LegalLang}.${LegalPart}`, "required" | "pair">>;

const filled = (s: string) => s.trim().length > 0;

export const emptyDraft = (): LegalDraft => ({ uz: { title: "", body: "" }, ru: { title: "", body: "" }, en: { title: "", body: "" } });

// The draft a version opens with: its own translations; a document from
// before the maps existed has its plain title and body as the Uzbek text.
export function draftOf(doc: Pick<ConsentDoc, "title" | "body" | "titleI18n" | "bodyI18n"> | null | undefined): LegalDraft {
  const d = emptyDraft();
  if (!doc) return d;
  for (const l of LEGAL_LANGS) d[l] = { title: doc.titleI18n[l] ?? "", body: doc.bodyI18n[l] ?? "" };
  if (!filled(d.uz.title) && !filled(d.ru.title) && !filled(d.en.title)) d.uz.title = doc.title;
  if (!filled(d.uz.body) && !filled(d.ru.body) && !filled(d.en.body)) d.uz.body = doc.body;
  return d;
}

// "complete" = both parts, "partial" = one part, "empty" = none.
export function langState(draft: LegalDraft, l: LegalLang): "complete" | "partial" | "empty" {
  const t = filled(draft[l].title);
  const b = filled(draft[l].body);
  return t && b ? "complete" : t || b ? "partial" : "empty";
}

export function validateDraft(draft: LegalDraft): LegalDraftErrors {
  const out: LegalDraftErrors = {};
  if (!filled(draft.uz.title)) out["uz.title"] = "required";
  if (!filled(draft.uz.body)) out["uz.body"] = "required";
  for (const l of ["ru", "en"] as const) {
    if (langState(draft, l) !== "partial") continue;
    if (!filled(draft[l].title)) out[`${l}.title`] = "pair";
    if (!filled(draft[l].body)) out[`${l}.body`] = "pair";
  }
  return out;
}

// Every complete translation, in one request body.
export function i18nPayload(draft: LegalDraft): { title_i18n: Record<string, string>; body_i18n: Record<string, string> } {
  const title_i18n: Record<string, string> = {};
  const body_i18n: Record<string, string> = {};
  for (const l of LEGAL_LANGS) {
    if (langState(draft, l) !== "complete") continue;
    title_i18n[l] = draft[l].title.trim();
    body_i18n[l] = draft[l].body;
  }
  return { title_i18n, body_i18n };
}

// The optional languages this version will go out without. `had` marks the
// ones the version it replaces has, which this one would remove.
export function missingLangs(draft: LegalDraft, previous: readonly string[] = []): { lang: "ru" | "en"; had: boolean }[] {
  return (["ru", "en"] as const).filter((l) => langState(draft, l) !== "complete").map((l) => ({ lang: l, had: previous.includes(l) }));
}

// The backend's refusals, on the fields they name:
// legal_uz_translation_required { fields: ["title_i18n.uz", "body_i18n.uz"] }
// legal_translation_pair_required { languages: ["en"] }. Anything else → null.
export function serverDraftErrors(e: unknown, draft: LegalDraft): LegalDraftErrors | null {
  if (!(e instanceof ApiError)) return null;
  const raw = e.data?.detail;
  const detail = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const code = typeof detail.code === "string" ? detail.code : e.code;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  if (code === "legal_uz_translation_required") {
    const out: LegalDraftErrors = {};
    const fields = list(detail.fields);
    for (const part of ["title", "body"] as const) {
      if (!fields.length || fields.some((f) => f.startsWith(`${part}_i18n`) || f === part)) out[`uz.${part}`] = "required";
    }
    return out;
  }
  if (code === "legal_translation_pair_required") {
    const out: LegalDraftErrors = {};
    for (const l of list(detail.languages)) {
      if (l !== "ru" && l !== "en") continue;
      const missing = (["title", "body"] as const).filter((p) => !filled(draft[l][p]));
      for (const p of missing.length ? missing : (["title", "body"] as const)) out[`${l}.${p}`] = "pair";
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

// The first tab with a problem, to open it.
export function firstErrorLang(errors: LegalDraftErrors): LegalLang | null {
  return LEGAL_LANGS.find((l) => errors[`${l}.title`] || errors[`${l}.body`]) ?? null;
}
