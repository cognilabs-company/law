import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { supportLang } from "@/lib/support";
import { fetchPublicSupport } from "@/lib/supportServer";
import SupportView from "@/components/support/SupportView";
import SupportFallback from "@/components/support/SupportFallback";

type Props = { params: Promise<{ locale: string }> };

// Public, login-free support page — the App Store / Google Play "Support URL"
// (TEZKOR_HIMOYA_PUBLIC_SUPPORT_FRONTEND, 2026-11-26). The text comes from
// GET /public/support in the page's language; re-fetched at most every 10
// minutes.
export const revalidate = 600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const info = await fetchPublicSupport(supportLang(locale));
  const t = await getTranslations({ locale, namespace: "supportPage" });
  return { title: info?.title || t("metaTitle"), description: info?.intro || t("fallback.intro") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = supportLang(locale);
  const info = await fetchPublicSupport(lang);
  return info ? <SupportView info={info} source="api" /> : <SupportFallback lang={lang} />;
}
