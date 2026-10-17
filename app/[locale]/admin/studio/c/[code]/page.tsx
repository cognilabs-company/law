import { CtorPage } from "@/components/admin/studio/sx/ctorpage/CtorPage";
import { ctorQueryOf } from "@/components/admin/studio/sx/ctorpage/urlState";

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
  const { code } = await params;
  const sp = await searchParams;
  return <CtorPage code={safeDecode(code)} initial={ctorQueryOf(sp)} />;
}
