// Legal documents: public URL segment ↔ API slug, and the localized label keys
// (namespace "legal") shared by the /legal pages, footer, checklist and gate.

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
// → "docs.disclaimer", "public_offer" → "docs.publicOffer". Callers guard with
// t.has() and fall back to the API title, which the backend only writes in
// Uzbek — so publishing a new document is a messages-only change, where the
// old hardcoded list silently left every new slug untranslated.
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
