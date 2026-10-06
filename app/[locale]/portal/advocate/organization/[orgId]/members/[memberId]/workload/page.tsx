import OrgMemberPage from "@/components/org/OrgMemberPage";

type Props = { params: Promise<{ locale: string; orgId: string; memberId: string }> };

export default async function Page({ params }: Props) {
  const { orgId, memberId } = await params;
  return <OrgMemberPage orgId={decodeURIComponent(orgId)} memberId={decodeURIComponent(memberId)} tab="workload" />;
}
