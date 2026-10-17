import { Wizard } from "@/components/admin/studio/sx/journey/Wizard";

type Props = { params: Promise<{ locale: string; id: string }> };

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function AdminStudioCreateJourneyPage({ params }: Props) {
  const { id } = await params;
  return <Wizard id={safeDecode(id)} />;
}
