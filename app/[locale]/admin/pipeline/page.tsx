import { redirect } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

// "Sotuv voronkasi" and the CRM kanban became one board on the backend
// (dynamic kanban contract 2026-10-28: same leads, same columns), so this
// route opens the CRM board. The old screen is kept in LegacyPipeline.tsx
// for now and is not routed.
export default async function PipelinePage({ params }: Props) {
  const { locale } = await params;
  redirect({ href: "/admin/crm/leads?tab=all&view=board", locale });
}
