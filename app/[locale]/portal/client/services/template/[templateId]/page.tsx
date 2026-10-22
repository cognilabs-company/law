import { setRequestLocale } from "next-intl/server";
import TemplateDocumentPage from "@/components/portal/docCatalog/TemplateDocumentPage";

type Props = { params: Promise<{ locale: string; templateId: string }> };

export default async function Page({ params }: Props) {
  const { locale, templateId } = await params;
  setRequestLocale(locale);
  return <TemplateDocumentPage templateId={decodeURIComponent(templateId)} />;
}
