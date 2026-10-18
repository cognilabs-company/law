import { ApprovalsPage } from "@/components/admin/studio/sx/approvals/ApprovalsPage";
import { apprQueryOf } from "@/components/admin/studio/sx/approvals/urlState";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminStudioApprovalsPage({ searchParams }: Props) {
  return <ApprovalsPage initial={apprQueryOf(await searchParams)} />;
}
