import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import MarketplacePreview from "@/components/marketplace/MarketplacePreview";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MarketplacePreview />;
}
