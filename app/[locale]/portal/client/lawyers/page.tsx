import ClientLawyersPage from "@/components/portal/dash/ClientLawyersPage";

type Q = string | string[] | undefined;
type Props = { searchParams: Promise<Record<string, Q>> };

const one = (v?: Q) => (Array.isArray(v) ? v[0] : v) ?? "";

// "Advokat va yuristlar" — reference/design-lexgo-1920/1b_mijoz_advokatlar.png.
// ?q, ?area, ?region and ?type arrive from the dashboard and the header
// search; ?mode=services|nearby (with ?radius, ?service) opens the service
// browser or the map.
export default async function ClientLawyers({ searchParams }: Props) {
  const sp = await searchParams;
  return (
    <ClientLawyersPage
      q={one(sp.q).slice(0, 200)}
      area={one(sp.area)}
      region={one(sp.region)}
      type={one(sp.type)}
      mode={one(sp.mode)}
      radius={one(sp.radius)}
      service={one(sp.service).slice(0, 80)}
    />
  );
}
