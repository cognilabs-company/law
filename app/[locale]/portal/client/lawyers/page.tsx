import LawyersSection from "@/components/sections/LawyersSection";

// The client directory reads /marketplace/lawyers: it is the only list that
// carries the paid boost and the backend's own ranking (S2 of the
// 2026-09-29 promotions MD). The public landing page keeps /lawyers.
export default function ClientLawyers() {
  return <LawyersSection standalone compact showFlow={false} marketplace />;
}
