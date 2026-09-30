import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import MarketDirectory from "@/components/marketplace/MarketDirectory";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ area?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "lawyers" });
  return { title: t("metaTitle") };
}

export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { area } = await searchParams;
  return (
    <section className="sec mk-sec">
      <div className="wrap">
        <MarketDirectory variant="public" initialArea={area || ""} />
      </div>
    </section>
  );
}
