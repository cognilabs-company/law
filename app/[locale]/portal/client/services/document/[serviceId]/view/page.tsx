import { setRequestLocale } from "next-intl/server";
import ServiceDocumentView from "@/components/portal/ServiceDocumentView";

type Props = { params: Promise<{ locale: string; serviceId: string }> };

export default async function Page({ params }: Props) {
  const { locale, serviceId } = await params;
  setRequestLocale(locale);
  return <ServiceDocumentView serviceId={serviceId} />;
}
