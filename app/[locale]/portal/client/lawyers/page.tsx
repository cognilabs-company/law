import MarketDirectory from "@/components/marketplace/MarketDirectory";

type Props = { searchParams: Promise<{ q?: string | string[]; type?: string | string[] }> };

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ClientLawyers({ searchParams }: Props) {
  const sp = await searchParams;
  return <MarketDirectory variant="portal" initialQuery={one(sp.q).slice(0, 200)} initialSellerType={one(sp.type)} />;
}
