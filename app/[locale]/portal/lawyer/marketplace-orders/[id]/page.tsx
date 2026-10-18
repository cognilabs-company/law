import { setRequestLocale } from "next-intl/server";
import OrderDetailPage from "@/components/marketplace/order/OrderDetailPage";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <OrderDetailPage orderId={decodeURIComponent(id)} view="seller" listHref="/portal/lawyer/marketplace-orders" />;
}
