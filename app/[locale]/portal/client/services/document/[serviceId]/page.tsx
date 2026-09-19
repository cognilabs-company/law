import { setRequestLocale } from "next-intl/server";
import ServiceDocumentPage from "@/components/portal/ServiceDocumentPage";

type Props = { params: Promise<{ locale: string; serviceId: string }> };

export default async function Page({ params }: Props) {
  const { locale, serviceId } = await params;
  setRequestLocale(locale);
  return <ServiceDocumentPage serviceId={serviceId} />;
}
