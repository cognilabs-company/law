import OwnerDashboard from "@/components/org/OwnerDashboard";

type Props = { params: Promise<{ locale: string; orgId: string }> };

export default async function Page({ params }: Props) {
  const { orgId } = await params;
  return <OwnerDashboard orgId={decodeURIComponent(orgId)} />;
}
