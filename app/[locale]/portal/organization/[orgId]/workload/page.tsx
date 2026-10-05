import RouteAlias from "@/components/RouteAlias";

type Props = { params: Promise<{ locale: string; orgId: string }> };

export default async function Page({ params }: Props) {
  const { orgId } = await params;
  return <RouteAlias to={`/portal/advocate/organization/${orgId}/workload`} />;
}
