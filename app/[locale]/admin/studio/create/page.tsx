import { CreateHome } from "@/components/admin/studio/sx/journey/CreateHome";
import type { StudioJourneyType } from "@/lib/services/studio";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
}

function typeOf(raw: string): StudioJourneyType | null {
  return raw === "service" || raw === "package" ? raw : null;
}

export default async function AdminStudioCreatePage({ searchParams }: Props) {
  const sp = await searchParams;
  return <CreateHome initialType={typeOf(first(sp.type))} />;
}
