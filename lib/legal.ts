// Legal documents: public URL segment ↔ API slug, and the localized label keys
// (namespace "legal") shared by the /legal pages, footer, checklist and gate.

// Public URL segments of the documents LexGo always publishes.
export const LEGAL_PATHS = ["terms", "privacy", "disclaimer"] as const;

const PATH_TO_SLUG: Record<string, string> = {
  terms: "terms",
  privacy: "privacy",
  disclaimer: "legal_disclaimer",
};

// /legal/disclaimer → "legal_disclaimer"; unknown segments map 1:1
// ("public-offer" → "public_offer").
export function legalSlugFromPath(p: string): string {
  return PATH_TO_SLUG[p] ?? p.replace(/-/g, "_");
}

// "legal_disclaimer" → "disclaimer"; a future API slug such as "public_offer"
// gets /legal/public-offer with no code change.
export function legalPathFromSlug(s: string): string {
  const known = Object.keys(PATH_TO_SLUG).find((k) => PATH_TO_SLUG[k] === s);
  return known ?? s.replace(/_/g, "-");
}

// Message key (namespace "legal") of a known document, else null → callers
// fall back to the API title: `key ? t(key) : doc.title`.
export function legalLabelKey(slug: string): string | null {
  if (slug === "terms") return "docs.terms";
  if (slug === "privacy") return "docs.privacy";
  if (slug === "legal_disclaimer") return "docs.disclaimer";
  return null;
}

// Placeholder checklist while /legal/consents is loading or has failed.
export const LEGAL_FALLBACK_ITEMS = [
  { slug: "terms", title: "", version: "", body: "" },
  { slug: "privacy", title: "", version: "", body: "" },
  { slug: "legal_disclaimer", title: "", version: "", body: "" },
];
