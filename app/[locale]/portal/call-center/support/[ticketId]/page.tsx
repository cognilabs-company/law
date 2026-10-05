import RouteAlias from "@/components/RouteAlias";

type Props = { params: Promise<{ locale: string; ticketId: string }> };

export default async function Page({ params }: Props) {
  const { ticketId } = await params;
  return <RouteAlias to={`/admin/call-center/support/${ticketId}`} />;
}
