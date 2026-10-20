import { GroupPage, type GroupNeed } from "@/components/admin/studio/sx/home/GroupPage";
import { RetiredGroupFrame } from "@/components/admin/studio/sx/layout/Retired";

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
  const groupKey = safeDecode(key);
  return (
    <RetiredGroupFrame code={first(sp.retired)} groupKey={groupKey}>
      <GroupPage groupKey={groupKey} need={needOf(first(sp.need))} />
    </RetiredGroupFrame>
  );
}
