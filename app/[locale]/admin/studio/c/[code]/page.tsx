import { redirect } from "@/i18n/navigation";
import { CtorPage } from "@/components/admin/studio/sx/ctorpage/CtorPage";
import { ctorQueryOf } from "@/components/admin/studio/sx/ctorpage/urlState";
import { retiredGroupHref, retiredMoveOf } from "@/lib/studio/retired";

type Props = {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function AdminStudioConstructorPage({ params, searchParams }: Props) {
  const { locale, code } = await params;
  const sp = await searchParams;
  const decoded = safeDecode(code);
  const move = retiredMoveOf(decoded);
  if (move) redirect({ href: retiredGroupHref(move), locale });
  return <CtorPage code={decoded} initial={ctorQueryOf(sp)} />;
}
