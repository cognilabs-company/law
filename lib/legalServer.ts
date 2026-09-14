// Server components only. Browsers go through /api/backend
// (lib/services/backend.ts → listLegalConsents).
import { currentConsents, normConsentDocs, type ConsentDoc } from "@/lib/services/backend";

// Same origin the proxy uses (app/api/backend/[...path]/route.ts).
const BACKEND = process.env.BACKEND_ORIGIN || "https://lexgo.api.cognilabs.org";

// Current legal documents for the ISR pages, cached for 10 minutes. null means
// the API was unreachable (only 200s enter the data cache, so a failure is
// retried on the next regeneration); [] means no documents. No AbortSignal:
// it would disable fetch memoization between generateMetadata and the page.
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
