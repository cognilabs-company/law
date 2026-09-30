import SellerProfile from "@/components/marketplace/SellerProfile";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <SellerProfile userId={decodeURIComponent(id)} variant="portal" />;
}
