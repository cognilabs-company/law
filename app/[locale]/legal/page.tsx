import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { fetchCurrentConsents } from "@/lib/legalServer";
import LegalDocList from "@/components/legal/LegalDocList";
import LegalDocsFallback from "@/components/legal/LegalDocsFallback";

type Props = { params: Promise<{ locale: string }> };

// Legal texts change rarely; re-fetch from the API at most every 10 minutes.
export const revalidate = 600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("indexTitle") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const docs = await fetchCurrentConsents();
  return docs ? <LegalDocList docs={docs} /> : <LegalDocsFallback />;
}
