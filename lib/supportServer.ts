// Server components only. Browsers go through /api/backend
// (components/support/SupportFallback.tsx).
import { backendOrigin } from "@/lib/http";
import { normSupport, type SupportInfo, type SupportLang } from "@/lib/support";

// Same origin the proxy uses (app/api/backend/[...path]/route.ts).
const BACKEND = process.env.BACKEND_ORIGIN || "https://lexgo.api.cognilabs.org";

// GET /public/support in `lang`, cached for 10 minutes per language. null on
// any failure (only 200s enter the data cache): the page then loads it in
// the browser and shows the built-in contacts meanwhile.
export async function fetchPublicSupport(lang: SupportLang): Promise<SupportInfo | null> {
  try {
    const res = await fetch(`${BACKEND}/public/support?lang=${lang}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 600, tags: ["public-support", `public-support-${lang}`] },
    });
    // Relative links resolve against the public API host, never this site.
    return res.ok ? normSupport(await res.json(), lang, backendOrigin("http")) : null;
  } catch {
    return null;
  }
}
