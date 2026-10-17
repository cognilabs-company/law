import MarketDirectory from "@/components/marketplace/MarketDirectory";

type Props = { searchParams: Promise<{ q?: string | string[]; type?: string | string[]; mode?: string | string[]; radius?: string | string[]; service?: string | string[] }> };

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ClientLawyers({ searchParams }: Props) {
  const sp = await searchParams;
  return <MarketDirectory variant="portal" initialQuery={one(sp.q).slice(0, 200)} initialSellerType={one(sp.type)} initialMode={one(sp.mode)} initialRadius={one(sp.radius)} initialNearbyService={one(sp.service).slice(0, 80)} />;
}
