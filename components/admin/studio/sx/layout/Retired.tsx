"use client";

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { getStudioObject, useStudioRegistry, type StudioGroup } from "@/lib/services/studio";
import { retiredGroupHref, retiredMoveOf, type RetiredMove } from "@/lib/studio/retired";
import { SxLinkButton } from "../Button";
import { ArrowRightIcon } from "../icons";
import { useStudioLabels } from "../useStudioLabels";
import { SxNote } from "./Note";
import { SxPageNotice } from "./Page";

const AI = "admin.studio.retired";

export function retiredGroupOf(move: RetiredMove, groups: readonly Pick<StudioGroup, "key" | "codes">[]): string {
  if (groups.some((g) => g.key === move.group)) return move.group;
  return groups.find((g) => g.codes.includes(move.anchor))?.key ?? move.group;
}

function RetiredNote({ move }: { move: RetiredMove }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  const target = move.target ? reg.items.find((c) => c.code === move.target) ?? null : null;
  const targetName = move.target ? labels.ctorName(move.target, target?.title) : "";
  return (
    <SxNote
      tone="info"
      role="status"
      title={t("sx.retired.title", { name: labels.ctorName(move.code) })}
      onDismiss={() => setShown(false)}
      action={
        target ? (
          <SxLinkButton variant="secondary" size="sm" iconEnd={ArrowRightIcon} href={`/admin/studio/c/${encodeURIComponent(target.code)}`} aiId={aiId(AI, move.code, "open")}>
            {t("sx.retired.open", { name: targetName })}
          </SxLinkButton>
        ) : undefined
      }
    >
      <p data-ai-id={aiId(AI, move.code)} data-ai-type="notice" data-ai-label={t("sx.retired.title", { name: labels.ctorName(move.code) })}>
        {t(`sx.retired.text.${move.code}`, { target: targetName || labels.ctorName("K10") })}
      </p>
    </SxNote>
  );
}

export function RetiredGroupFrame({ code, groupKey, children }: { code: string; groupKey: string; children: ReactNode }): ReactElement {
  const move = retiredMoveOf(code);
  const reg = useStudioRegistry();
  const router = useRouter();
  const ready = reg.avail === "on" && reg.groups.length > 0;
  const better = move && ready ? retiredGroupOf(move, reg.groups) : "";
  useEffect(() => {
    if (move && better && better !== groupKey && !reg.groups.some((g) => g.key === groupKey)) router.replace(retiredGroupHref(move, better));
  }, [move, better, groupKey, reg.groups, router]);
  if (!move) return <>{children}</>;
  return <SxPageNotice notice={<RetiredNote move={move} />}>{children}</SxPageNotice>;
}

export function RetiredObjectGuard({ id, newCode, children }: { id: string; newCode: string; children: ReactNode }): ReactElement {
  const router = useRouter();
  const reg = useStudioRegistry();
  const [code, setCode] = useState("");
  useEffect(() => {
    if (!id || id === "new") return;
    let alive = true;
    getStudioObject(id).then(
      (d) => {
        if (alive) setCode(d.code);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [id]);
  const move = retiredMoveOf(id === "new" ? newCode : code);
  const ready = reg.avail !== "checking";
  useEffect(() => {
    if (!move || !ready) return;
    router.replace(retiredGroupHref(move, reg.groups.length ? retiredGroupOf(move, reg.groups) : move.group));
  }, [move, ready, reg.groups, router]);
  return <>{children}</>;
}
