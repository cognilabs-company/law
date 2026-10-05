import { Suspense } from "react";
import SupportHub from "@/components/support/SupportHub";

type Props = { params: Promise<{ locale: string; ticketId: string }> };

export default async function Page({ params }: Props) {
  const { ticketId } = await params;
  return (
    <Suspense fallback={null}>
      <SupportHub role="lawyer" ticketId={decodeURIComponent(ticketId)} />
    </Suspense>
  );
}
