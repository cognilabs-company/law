import { setRequestLocale } from "next-intl/server";
import DocumentEditorWorkspace from "@/components/portal/DocumentEditorWorkspace";

type Props = { params: Promise<{ locale: string; recordId: string }> };

export default async function Page({ params }: Props) {
  const { locale, recordId } = await params;
  setRequestLocale(locale);
  return <DocumentEditorWorkspace ns="portal.lawyer.documentRequests" recordId={recordId} backHref="/portal/lawyer/document-requests" />;
}
