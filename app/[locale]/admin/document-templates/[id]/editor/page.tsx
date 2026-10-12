import TemplateEditor from "@/components/admin/templateEditor/TemplateEditor";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function AdminTemplateEditorPage({ params }: Props) {
  const { id } = await params;
  return <TemplateEditor templateId={decodeURIComponent(id)} />;
}
