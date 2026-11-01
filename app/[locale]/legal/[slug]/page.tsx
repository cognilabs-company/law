import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { LEGAL_PATHS, legalLabelKey, legalLang, legalSlugFromPath } from "@/lib/legal";
import { fetchConsentBySlug, fetchCurrentConsents, fetchConsentDetail } from "@/lib/legalServer";
import { findLegalDoc } from "@/lib/services/backend";
import LegalDocument from "@/components/legal/LegalDocument";
import LegalDocsFallback from "@/components/legal/LegalDocsFallback";

type Props = { params: Promise<{ locale: string; slug: string }> };

// Legal texts change rarely; re-fetch from the API at most every 10 minutes.
export const revalidate = 600;

// Prerendered per locale: terms, privacy, disclaimer. Other slugs the API
// publishes later render on demand (dynamicParams stays true).
export function generateStaticParams() {
  return LEGAL_PATHS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  const apiSlug = legalSlugFromPath(slug);
  // The document's own title in this language; the local label only when
  // the API can't be reached.
  const lang = legalLang(locale);
  const doc = findLegalDoc((await fetchCurrentConsents(lang)) ?? [], apiSlug) ?? (await fetchConsentBySlug(apiSlug, lang));
  if (doc?.title) return { title: doc.title };
  const key = legalLabelKey(apiSlug);
  return { title: t.has(key) ? t(key) : t("indexTitle") };
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const apiSlug = legalSlugFromPath(slug);
  const lang = legalLang(locale);
  const docs = await fetchCurrentConsents(lang);
  const summary = docs ? findLegalDoc(docs, apiSlug) : undefined;
  if (summary && docs) {
    // The list above is body-less now (2026-09-22 backend) — fetch the one
    // document actually being read for its real text; fall back to the
    // (empty-body) summary rather than failing the page if that 404s/errors.
    const doc = (await fetchConsentDetail(summary.id, lang)) ?? summary;
    return <LegalDocument doc={doc} all={docs} />;
  }
  // A footer alias the list doesn't name (terms → user_offer, disclaimer →
  // platform_rules): the backend resolves it to the canonical document.
  if (docs) {
    const byAlias = await fetchConsentBySlug(apiSlug, lang);
    if (byAlias) return <LegalDocument doc={byAlias} all={docs} />;
  }
  // The three always-published documents never 404 on a missing or partial
  // list (that would be cached for 10 minutes): let the browser retry.
  const known = (LEGAL_PATHS as readonly string[]).includes(slug);
  if (!docs || known) return <LegalDocsFallback slug={apiSlug} />;
  notFound();
}
