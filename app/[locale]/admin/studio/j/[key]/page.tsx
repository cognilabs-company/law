import { StudioJourneyPage } from "@/components/admin/studio/GroupFlow";

type Props = { params: Promise<{ locale: string; key: string }> };

export default async function AdminStudioJourneyPage({ params }: Props) {
  const { key } = await params;
  return <StudioJourneyPage journeyKey={decodeURIComponent(key)} />;
}
