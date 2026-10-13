import { redirectKeepingQuery } from "@/lib/profileTabs";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ClientReviewsPage({ params, searchParams }: Props) {
  return redirectKeepingQuery("/portal/client/works", params, searchParams);
}
