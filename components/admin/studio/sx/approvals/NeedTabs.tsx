"use client";

import "../sx-core.css";
import "./sx-ap2.css";
import { useEffect, useRef, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { EyeIcon, ListChecksIcon, RocketIcon, Undo2Icon } from "../icons";
import { SxSegmented, type SxSegItem } from "../shared/Segmented";
import { useStudioLabels } from "../useStudioLabels";
import type { ApprNeed, ApprRow } from "./model";
import { rowMatches } from "./queue";
import type { ApprQuery } from "./urlState";

export type NeedTabsProps = { query: ApprQuery; onChange: (next: ApprQuery) => void; rows: readonly ApprRow[]; loading: boolean };

type NeedValue = "all" | Exclude<ApprNeed, "">;

export function NeedTabs({ query, onChange, rows, loading }: NeedTabsProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const box = useRef<HTMLDivElement>(null);
  const need = query.need;
  useEffect(() => {
    const seg = box.current?.querySelector<HTMLElement>(".sx-seg");
    const on = seg?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!seg || !on || seg.scrollWidth <= seg.clientWidth) return;
    seg.scrollLeft = Math.max(0, on.offsetLeft - (seg.clientWidth - on.offsetWidth) / 2);
  }, [need, loading]);
  const base = { ...query, need: "" as ApprNeed };
  const work = rows.filter((r) => r.section !== "done" && rowMatches(r, base, labels));
  const count = (k: ApprNeed): number | null => (loading ? null : k ? work.filter((r) => r.kind === k).length : work.length);
  const items: SxSegItem<NeedValue>[] = [
    { value: "publish", label: t("sx.appr.grp.mine.publish"), icon: RocketIcon, count: count("publish"), aiId: "admin.studio.approvals.filters.need.publish" },
    { value: "review", label: t("sx.appr.need.review"), icon: EyeIcon, count: count("review"), aiId: "admin.studio.approvals.filters.need.review" },
    { value: "returned", label: t("sx.appr.need.returned"), icon: Undo2Icon, count: count("returned"), aiId: "admin.studio.approvals.filters.need.returned" },
    { value: "all", label: t("sx.appr.filter.all"), icon: ListChecksIcon, count: count(""), aiId: "admin.studio.approvals.filters.need.all" },
  ];
  return (
    <div className="sx-ap2-need" ref={box}>
      <SxSegmented<NeedValue>
        items={items}
        value={query.need || "all"}
        onChange={(v) => onChange({ ...query, need: v === "all" ? "" : v })}
        label={t("sx.appr.filter.need")}
        className="sx-ap2-need__seg"
        aiId="admin.studio.approvals.filters.need"
      />
    </div>
  );
}
