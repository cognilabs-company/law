import { Suspense } from "react";
import ClientSupport from "@/components/support/ClientSupport";

type Props = { params: Promise<{ locale: string; ticketId: string }> };

export default async function Page({ params }: Props) {
  const { ticketId } = await params;
  return (
    <Suspense fallback={null}>
      <ClientSupport ticketId={decodeURIComponent(ticketId)} />
    </Suspense>
  );
}
