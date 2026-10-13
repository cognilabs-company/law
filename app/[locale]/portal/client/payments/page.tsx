import { redirectToProfileTab } from "@/lib/profileTabs";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ClientPaymentsPage({ params, searchParams }: Props) {
  return redirectToProfileTab("payments", params, searchParams);
}
