import EmployeeCard from "@/components/internal/EmployeeCard";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <EmployeeCard id={decodeURIComponent(id)} />;
}
