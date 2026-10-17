import { GroupPage, type GroupNeed } from "@/components/admin/studio/sx/home/GroupPage";

type Props = {
  params: Promise<{ locale: string; key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
}

function needOf(raw: string): GroupNeed {
  return raw === "returned" || raw === "review" || raw === "publish" ? raw : "";
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function AdminStudioGroupPage({ params, searchParams }: Props) {
  const { key } = await params;
  const sp = await searchParams;
  return <GroupPage groupKey={safeDecode(key)} need={needOf(first(sp.need))} />;
}
