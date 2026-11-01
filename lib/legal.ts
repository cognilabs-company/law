// Legal documents: public URL segment ↔ API slug, the language the backend
// writes them in, and the label keys (namespace "legal") used only while the
// documents are loading.

// LEXGO_PRIVACY_POLICY_I18N_FRONTEND_2026_11_01: the backend writes every
// legal document in uz, ru and en and picks one with ?lang=. Russian and
// English map to themselves; uz, uz_latn, uz_cyrl and anything else read the
// one Uzbek text. Every legal request goes through this.
export type LegalLang = "uz" | "ru" | "en";
export function legalLang(locale: string | null | undefined): LegalLang {
  const l = (locale || "").toLowerCase();
  return l.startsWith("ru") ? "ru" : l.startsWith("en") ? "en" : "uz";
}
// The backend refused the language (422 legal_language_not_supported): the
// local mapping is wrong, so ask once more for Uzbek instead of showing it.
export const LEGAL_LANG_REFUSED = "legal_language_not_supported";

// Public URL segments of the documents LexGo always publishes.
export const LEGAL_PATHS = ["terms", "privacy", "disclaimer"] as const;

// A Map, not an object literal: URL segments such as "constructor" or
// "toString" must never resolve to Object.prototype members.
const PATH_TO_SLUG = new Map<string, string>([
  ["terms", "terms"],
  ["privacy", "privacy"],
  ["disclaimer", "legal_disclaimer"],
]);

// /legal/disclaimer → "legal_disclaimer"; unknown segments map 1:1
// ("public-offer" → "public_offer").
export function legalSlugFromPath(p: string): string {
  return PATH_TO_SLUG.get(p) ?? p.replace(/-/g, "_");
}

// "legal_disclaimer" → "disclaimer"; a future API slug such as "public_offer"
// gets /legal/public-offer with no code change.
export function legalPathFromSlug(s: string): string {
  for (const [path, slug] of PATH_TO_SLUG) if (slug === s) return path;
  return s.replace(/_/g, "-");
}

// Message key (namespace "legal") for any document slug: "legal_disclaimer"
// → "docs.disclaimer", "public_offer" → "docs.publicOffer". Only for the
// placeholder rows shown before the documents arrive (or when they can't be
// loaded): a real document always reads its own title from the backend, in
// the page's language, and is never translated here.
export function legalLabelKey(slug: string): string {
  const base = (slug || "").replace(/^legal_/, "");
  return `docs.${base.replace(/_(w)/g, (_, c: string) => c.toUpperCase())}`;
}

// Placeholder checklist while /legal/consents is loading or has failed.
export const LEGAL_FALLBACK_ITEMS = [
  { slug: "terms", title: "", version: "", body: "" },
  { slug: "privacy", title: "", version: "", body: "" },
  { slug: "legal_disclaimer", title: "", version: "", body: "" },
];
