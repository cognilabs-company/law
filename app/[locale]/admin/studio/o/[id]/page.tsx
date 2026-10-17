import { Editor } from "@/components/admin/studio/sx/editor/Editor";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
}

export default async function AdminStudioObjectPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const focus = first(sp.focus);
  return <Editor id={decodeURIComponent(id)} newCode={first(sp.new)} ctx={first(sp.ctx)} focus={focus || undefined} />;
}
