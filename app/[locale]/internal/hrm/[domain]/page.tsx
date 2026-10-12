import HrmModuleScreen from "@/components/internal/hrm/HrmModuleScreen";

type Props = { params: Promise<{ locale: string; domain: string }> };

export default async function InternalHrmModulePage({ params }: Props) {
  const { domain } = await params;
  return <HrmModuleScreen domain={decodeURIComponent(domain)} />;
}
