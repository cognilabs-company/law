import RouteAlias from "@/components/RouteAlias";

type Props = { params: Promise<{ locale: string; orgId: string; memberId: string }> };

export default async function Page({ params }: Props) {
  const { orgId, memberId } = await params;
  return <RouteAlias to={`/portal/advocate/organization/${orgId}/members/${memberId}/services`} />;
}
