import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { LEGAL_PATHS, legalLabelKey, legalSlugFromPath } from "@/lib/legal";
import { fetchCurrentConsents, fetchConsentDetail } from "@/lib/legalServer";
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
  const key = legalLabelKey(apiSlug);
  if (t.has(key)) return { title: t(key) };
  const doc = (await fetchCurrentConsents())?.find((d) => d.slug === apiSlug);
  return { title: doc?.title || t("indexTitle") };
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const apiSlug = legalSlugFromPath(slug);
  const docs = await fetchCurrentConsents();
  const summary = docs?.find((d) => d.slug === apiSlug);
  if (summary && docs) {
    // The list above is body-less now (2026-09-22 backend) — fetch the one
    // document actually being read for its real text; fall back to the
    // (empty-body) summary rather than failing the page if that 404s/errors.
    const doc = (await fetchConsentDetail(summary.id)) ?? summary;
    return <LegalDocument doc={doc} all={docs} />;
  }
  // The three always-published documents never 404 on a missing or partial
  // list (that would be cached for 10 minutes): let the browser retry.
  const known = (LEGAL_PATHS as readonly string[]).includes(slug);
  if (!docs || known) return <LegalDocsFallback slug={apiSlug} />;
  notFound();
}
