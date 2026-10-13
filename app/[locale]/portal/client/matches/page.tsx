import { redirectKeepingQuery } from "@/lib/profileTabs";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ClientMatchesPage({ params, searchParams }: Props) {
  return redirectKeepingQuery("/portal/client/intake", params, searchParams);
}
