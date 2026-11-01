import MtmDetail from "@/components/admin/mobileTesting/MtmDetail";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// One test phone's history (primary superadmin only).
export default async function AdminMobileTestingDevice({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <MtmDetail installationId={decodeURIComponent(id)} backDate={first(sp.date)} />;
}
