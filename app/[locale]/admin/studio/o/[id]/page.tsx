import StudioObjectEditor from "@/components/admin/studio/StudioObjectEditor";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminStudioObjectPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const raw = sp.new;
  const newCode = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  return <StudioObjectEditor id={decodeURIComponent(id)} newCode={newCode} />;
}
