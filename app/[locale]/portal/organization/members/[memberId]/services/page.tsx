import OrgMemberResolver from "@/components/org/OrgMemberResolver";

type Props = { params: Promise<{ locale: string; memberId: string }> };

export default async function Page({ params }: Props) {
  const { memberId } = await params;
  return <OrgMemberResolver memberId={decodeURIComponent(memberId)} />;
}
