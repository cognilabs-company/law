import { redirect } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

// The HR processes page became the catalog's module hub.
export default async function InternalHrPage({ params }: Props) {
  const { locale } = await params;
  redirect({ href: "/internal/hrm", locale });
}
