import { setRequestLocale } from "next-intl/server";
import CrmLeadPage from "@/components/crm/CrmLeadPage";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <CrmLeadPage leadId={decodeURIComponent(id)} />;
}
