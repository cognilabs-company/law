import SupportQueue from "@/components/support/SupportQueue";

type Props = { params: Promise<{ locale: string; ticketId: string }> };

export default async function Page({ params }: Props) {
  const { ticketId } = await params;
  return <SupportQueue ticketId={decodeURIComponent(ticketId)} />;
}
