"use client";

import MarketDirectory from "@/components/marketplace/MarketDirectory";
import ClientSpecialists from "./ClientSpecialists";

// "Advokat va yuristlar": one page, three views behind the tabs, each with
// its banner on top and the tabs under it —
//   Mutaxassislar bo'yicha  the marketplace banner, then the LexGo 1920
//                           specialist list (1b), narrowed by the banner's
//                           AI search;
//   Xizmatlar bo'yicha      a compact services banner, then the services;
//   Xaritada                no banner, the map is the page.
// ?mode=services|nearby (with ?radius, ?service) opens the other views; ?q,
// ?area, ?region and ?type go to the specialist list's own search bar.
export default function ClientLawyersPage(props: { q: string; area: string; region: string; type: string; mode: string; radius: string; service: string }) {
  return (
    <MarketDirectory
      variant="portal"
      initialSellerType={props.type}
      initialMode={props.mode === "map" ? "nearby" : props.mode}
      initialRadius={props.radius}
      initialNearbyService={props.service}
      renderSpecialists={({ matchedIds }) => (
        <ClientSpecialists initialQuery={props.q} initialArea={props.area} initialRegion={props.region} initialType={props.type} onlyIds={matchedIds} />
      )}
    />
  );
}
