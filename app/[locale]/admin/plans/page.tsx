import { redirect } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

// The old plan editor (create / edit / hide over a policy overlay) is gone
// (owner decision 2026-10-31 §6.1): tariffs change through the feature
// registry and versioned plans on /admin/tariffs. Old links land there.
export default async function PlansPage({ params }: Props) {
  const { locale } = await params;
  redirect({ href: "/admin/tariffs", locale });
}
