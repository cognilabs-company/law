import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import ContactSection from "@/components/sections/ContactSection";
import { getPublicSupport } from "@/lib/publicSupport";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contactPage" });
  return { title: t("metaTitle") };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const s = await getPublicSupport(locale === "ru" || locale === "en" ? locale : "uz");
  const company = s?.company.name ? { name: s.company.name, address: s.company.address } : null;
  return <ContactSection company={company} />;
}
