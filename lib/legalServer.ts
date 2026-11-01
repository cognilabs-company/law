// Server components only. Browsers go through /api/backend
// (lib/services/backend.ts → listLegalConsents).
import { currentConsents, normConsentDoc, normConsentDocs, type ConsentDoc } from "@/lib/services/backend";
import { LEGAL_LANG_REFUSED, type LegalLang } from "@/lib/legal";

// Same origin the proxy uses (app/api/backend/[...path]/route.ts).
const BACKEND = process.env.BACKEND_ORIGIN || "https://lexgo.api.cognilabs.org";

// GET a public legal endpoint in `lang`, cached for 10 minutes. The URL
// carries ?lang=, so each language has its own cache entry, and the tags name
// the language too: a ru page never gets the uz text. A 422
// legal_language_not_supported asks once more for Uzbek. null on any other
// failure (only 200s enter the data cache, so it is retried on the next
// regeneration). No AbortSignal: it would disable fetch memoization between
// generateMetadata and the page.
async function legalFetch(path: string, lang: LegalLang, tags: string[]): Promise<unknown | null> {
  const get = (l: LegalLang) =>
    fetch(`${BACKEND}${path}?lang=${l}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 600, tags: [...tags, ...tags.map((t) => `${t}-${l}`)] },
    });
  try {
    let res = await get(lang);
    if (res.status === 422 && lang !== "uz") {
      const detail = ((await res.json().catch(() => null)) as { detail?: { code?: string } } | null)?.detail;
      if (detail?.code === LEGAL_LANG_REFUSED) res = await get("uz");
    }
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Current legal documents for the ISR pages; null means the API was
// unreachable, [] means no documents.
//
// LEXGO_FRONTEND_LEGAL_SERVICE_UPDATE_2026-09-22.md: /legal/consents is now a
// lightweight summary — body/body_json/content are omitted — "for list/table/
// card screens" only. Fine for the /legal index (titles only) and for the
// "all docs" side-nav on /legal/[slug], but NOT for the single document a
// user is actually reading: every doc here comes back with body === "".
export async function fetchCurrentConsents(lang: LegalLang): Promise<ConsentDoc[] | null> {
  const data = await legalFetch("/legal/consents", lang, ["legal-consents"]);
  return data === null ? null : currentConsents(normConsentDocs(data, lang));
}

// Full body for exactly one document — /legal/[slug] fetches the lightweight
// list first (for the id + the "all docs" nav), then this for the one doc it
// actually renders. null on any failure: the caller falls back to the
// summary doc (empty body) rather than failing the page outright.
export async function fetchConsentDetail(id: string, lang: LegalLang): Promise<ConsentDoc | null> {
  const data = await legalFetch(`/legal/consents/${encodeURIComponent(id)}`, lang, ["legal-consents", `legal-consent-${id}`]);
  return data === null ? null : normConsentDoc(data, lang);
}

// A document by canonical slug or footer alias (/legal/terms → user_offer,
// /legal/disclaimer → platform_rules), with its full text. null on failure.
export async function fetchConsentBySlug(slug: string, lang: LegalLang): Promise<ConsentDoc | null> {
  const data = await legalFetch(`/legal/consents/by-slug/${encodeURIComponent(slug)}`, lang, ["legal-consents", `legal-consent-slug-${slug}`]);
  if (data === null) return null;
  const doc = normConsentDoc(data, lang);
  return doc.id && doc.slug ? doc : null;
}
