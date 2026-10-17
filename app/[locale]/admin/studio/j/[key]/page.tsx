import { LaunchPathPage } from "@/components/admin/studio/sx/paths/LaunchPathPage";

type Props = { params: Promise<{ locale: string; key: string }> };

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default async function AdminStudioJourneyPage({ params }: Props) {
  const { key } = await params;
  return <LaunchPathPage pathKey={safeDecode(key)} />;
}
