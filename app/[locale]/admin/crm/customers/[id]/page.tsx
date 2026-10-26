import { setRequestLocale } from "next-intl/server";
import CrmCustomerPage from "@/components/crm/CrmCustomerPage";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <CrmCustomerPage customerId={decodeURIComponent(id)} />;
}
