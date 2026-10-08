"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";
import { Link } from "@/i18n/navigation";
import { useStudioText } from "../bits";
import { COUNT_LIMIT, sumCounts, type CountStatus, type StatusCount } from "./useDashData";
import { IconChevronRight, IconEdit, IconHourglass, IconRefresh, IconRocket } from "@/components/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type TileKey = "draft" | "waiting" | "published" | "changes";

const TILES: { key: TileKey; Glyph: Icon; tone: string }[] = [
  { key: "draft", Glyph: IconEdit, tone: "draft" },
  { key: "waiting", Glyph: IconHourglass, tone: "wait" },
  { key: "published", Glyph: IconRocket, tone: "ok" },
  { key: "changes", Glyph: IconRefresh, tone: "warn" },
];

export default function DashTiles({ counts, loading, canReview }: { counts: Record<CountStatus, StatusCount>; loading: boolean; canReview: boolean }) {
  const { t, num } = useStudioText();
  const value: Record<TileKey, StatusCount> = {
    draft: counts.draft,
    waiting: sumCounts(counts.submitted, counts.in_review),
    published: counts.published,
    changes: counts.changes_requested,
  };
  const ready = counts.approved && counts.approved.n > 0 ? counts.approved : null;
  const show = (c: StatusCount) => (c === null ? "—" : c.capped ? `${num(Math.max(c.n, COUNT_LIMIT))}+` : num(c.n));

  return (
    <ul className="stu-dt" aria-label={t("dash.tiles.label")} data-ai-id="admin.studio.dash.tiles" data-ai-type="section" data-ai-label={t("dash.tiles.label")}>
      {TILES.map(({ key, Glyph, tone }) => {
        const c = value[key];
        const link = key === "waiting" && canReview;
        const body: ReactNode = (
          <>
            <span className="stu-dt__ico" aria-hidden>
              <Glyph />
            </span>
            <span className="stu-dt__txt">
              <span className="stu-dt__l">{t(`dash.tiles.${key}`)}</span>
              {loading ? <span className="stu-dt__sk" aria-hidden /> : <b className="stu-dt__n">{show(c)}</b>}
              <span className="stu-dt__h">
                {key === "waiting" && ready && !loading ? t("dash.tiles.readyToPublish", { n: show(ready) }) : t(`dash.tiles.${key}Hint`)}
              </span>
            </span>
            {link ? <IconChevronRight className="stu-dt__go" aria-hidden /> : null}
          </>
        );
        return (
          <li key={key} className={`stu-dt__i stu-dt__i--${tone}`}>
            {link ? (
              <Link href="/admin/studio/approvals" className="stu-dt__c stu-dt__c--link" data-ai-id={`admin.studio.dash.tiles.${key}`} data-ai-type="link" data-ai-label={t(`dash.tiles.${key}`)}>
                {body}
              </Link>
            ) : (
              <div className="stu-dt__c" data-ai-id={`admin.studio.dash.tiles.${key}`} data-ai-type="card" data-ai-label={t(`dash.tiles.${key}`)}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
