import ObjectList from "@/components/admin/studio/ObjectList";

type Props = { params: Promise<{ locale: string; code: string }> };

export default async function AdminStudioConstructorPage({ params }: Props) {
  const { code } = await params;
  return <ObjectList code={decodeURIComponent(code)} />;
}
