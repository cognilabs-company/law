"use client";

import { useState } from "react";
import MarketDirectory from "@/components/marketplace/MarketDirectory";
import { MarketModeSwitch } from "@/components/marketplace/NearbySellers";
import { modeOf, writeNearbyParams, DEFAULT_NEARBY_RADIUS, type NearbyMode } from "@/lib/services/marketDiscovery";
import ClientSpecialists from "./ClientSpecialists";

// "Advokat va yuristlar": the by-specialist view is the Tezkor Himoya 1920 page (1b);
// the by-service browser and the nearby map stay the marketplace's own, one
// switch away, with ?mode= in the address as before.
export default function ClientLawyersPage(props: { q: string; area: string; region: string; type: string; mode: string; radius: string; service: string }) {
  const [mode, setMode] = useState<NearbyMode>(() => modeOf(props.mode));
  const go = (m: NearbyMode) => {
    setMode(m);
    const next = writeNearbyParams(window.location.href, { mode: m, radius: DEFAULT_NEARBY_RADIUS, serviceId: "" });
    window.history.replaceState(window.history.state, "", next);
  };
  if (mode !== "all") {
    return <MarketDirectory key={mode} variant="portal" initialQuery={props.q} initialSellerType={props.type} initialMode={mode} initialRadius={props.radius} initialNearbyService={props.service} onLeave={() => go("all")} />;
  }
  return (
    <>
      <MarketModeSwitch mode="all" onChange={go} />
      <ClientSpecialists initialQuery={props.q} initialArea={props.area} initialRegion={props.region} initialType={props.type} />
    </>
  );
}
