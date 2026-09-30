import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import SellerProfile from "@/components/marketplace/SellerProfile";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketplace" });
  return { title: t("metaTitle"), robots: { index: false, follow: true } };
}

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <section className="sec mk-sec">
      <div className="wrap">
        <SellerProfile userId={decodeURIComponent(id)} variant="public" />
      </div>
    </section>
  );
}
