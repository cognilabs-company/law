import UrgentAssignedPanel from "@/components/portal/UrgentAssignedPanel";

// "Mening Tezkor ishlarim" — the Tezkor Advokat requests this advocate is a
// participant in (GET /urgent-advokat/requests/assigned). The invite itself
// arrives as the ring card; this is the work behind it.
export default function Page() {
  return <UrgentAssignedPanel />;
}
