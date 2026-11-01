import MtmOverview from "@/components/admin/mobileTesting/MtmOverview";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Mobile test monitoring: dashboard and device list (primary superadmin only).
export default async function AdminMobileTesting({ searchParams }: Props) {
  const sp = await searchParams;
  return <MtmOverview initialDate={first(sp.date)} initialUsage={first(sp.usage)} />;
}
