// Server components only. Browsers go through /api/backend
// (lib/services/backend.ts → listLegalConsents).
import { currentConsents, normConsentDoc, normConsentDocs, type ConsentDoc } from "@/lib/services/backend";

// Same origin the proxy uses (app/api/backend/[...path]/route.ts).
const BACKEND = process.env.BACKEND_ORIGIN || "https://lexgo.api.cognilabs.org";

// Current legal documents for the ISR pages, cached for 10 minutes. null means
// the API was unreachable (only 200s enter the data cache, so a failure is
// retried on the next regeneration); [] means no documents. No AbortSignal:
// it would disable fetch memoization between generateMetadata and the page.
//
// LEXGO_FRONTEND_LEGAL_SERVICE_UPDATE_2026-09-22.md: /legal/consents is now a
// lightweight summary — body/body_json/content are omitted — "for list/table/
// card screens" only. Fine for the /legal index (titles only) and for the
// "all docs" side-nav on /legal/[slug], but NOT for the single document a
// user is actually reading: every doc here comes back with body === "".
export async function fetchCurrentConsents(): Promise<ConsentDoc[] | null> {
  try {
    const res = await fetch(`${BACKEND}/legal/consents`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 600, tags: ["legal-consents"] },
    });
    if (!res.ok) return null;
    return currentConsents(normConsentDocs(await res.json()));
  } catch {
    return null;
  }
}

// Full body for exactly one document — /legal/[slug] fetches the lightweight
// list first (for the id + the "all docs" nav), then this for the one doc it
// actually renders. null on any failure: the caller falls back to the
// summary doc (empty body) rather than failing the page outright.
export async function fetchConsentDetail(id: string): Promise<ConsentDoc | null> {
  try {
    const res = await fetch(`${BACKEND}/legal/consents/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 600, tags: ["legal-consents", `legal-consent-${id}`] },
    });
    if (!res.ok) return null;
    return normConsentDoc(await res.json());
  } catch {
    return null;
  }
}
