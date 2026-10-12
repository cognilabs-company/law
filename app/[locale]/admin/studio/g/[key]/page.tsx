import { StudioGroupPage } from "@/components/admin/studio/GroupFlow";

type Props = { params: Promise<{ locale: string; key: string }> };

export default async function AdminStudioGroupPage({ params }: Props) {
  const { key } = await params;
  return <StudioGroupPage groupKey={decodeURIComponent(key)} />;
}
