import { redirect } from "@/i18n/navigation";
import { Editor } from "@/components/admin/studio/sx/editor/Editor";
import { categoryKindOf } from "@/components/admin/studio/sx/shared/categoryKindLink";
import { RetiredObjectGuard } from "@/components/admin/studio/sx/layout/Retired";
import { retiredGroupHref, retiredMoveOf } from "@/lib/studio/retired";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
}

export default async function AdminStudioObjectPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  const sp = await searchParams;
  const focus = first(sp.focus);
  const newCode = first(sp.new);
  const parent = first(sp.parent);
  const category = newCode.toUpperCase() === "K01";
  const categoryKind = category ? categoryKindOf(first(sp.kind), parent) : undefined;
  const objectId = decodeURIComponent(id);
  const move = objectId === "new" ? retiredMoveOf(newCode) : null;
  if (move) redirect({ href: retiredGroupHref(move), locale });
  return (
    <RetiredObjectGuard id={objectId} newCode={newCode}>
      <Editor id={objectId} newCode={newCode} ctx={first(sp.ctx)} focus={focus || undefined} categoryKind={categoryKind} ruleKind={first(sp.rule) === "new" || first(sp.rule) === "version" ? (first(sp.rule) as "new" | "version") : undefined} ruleFrom={first(sp.from)} prefill={categoryKind === "sub" && parent ? { parent_id: parent } : undefined} />
    </RetiredObjectGuard>
  );
}
