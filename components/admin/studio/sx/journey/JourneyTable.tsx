"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-journey.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { StudioCreationJourney } from "@/lib/services/studio";
import { ArrowRightIcon, EyeIcon } from "../icons";
import { SxTable, type SxColumn, type SxRowAction } from "../layout/Table";
import { useNow } from "../live";
import { SxProgress } from "../shared/Progress";
import { creationJourneyHref, journeyObjectId } from "../shared/journeyLinks";
import { useStudioLabels } from "../useStudioLabels";
import { stepLabel } from "./steps";

export type JourneyListKind = "drafts" | "incomplete" | "completed";

export type JourneyTableProps = {
  list: JourneyListKind;
  rows: readonly StudioCreationJourney[];
  caption: string;
  loading: boolean;
  busy?: boolean;
  error?: ReactNode;
  empty: ReactNode;
  footer?: ReactNode;
};

export function journeyRowHref(j: StudioCreationJourney, list: JourneyListKind): string {
  if (list === "completed") {
    const objectId = journeyObjectId(j);
    if (objectId) return `/admin/studio/o/${encodeURIComponent(objectId)}`;
  }
  return creationJourneyHref(j);
}

export function JourneyTable({ list, rows, caption, loading, busy, error, empty, footer }: JourneyTableProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const now = useNow();
  const tr = (key: string) => t(key);
  const progressLabel = t("sx.journeyRun.col.progress");

  const columns: SxColumn<StudioCreationJourney>[] = [
    {
      key: "title",
      header: t("sx.cpage.col.title"),
      primary: true,
      cell: (j) => <span className="sx-jr-cell__title">{j.title || t("sx.ui.untitled")}</span>,
    },
    {
      key: "type",
      header: t("sx.journeyRun.col.type"),
      cell: (j) => <span className="sx-jr-cell__muted">{t(j.type === "package" ? "sx.journeyRun.package" : "sx.journeyRun.service")}</span>,
    },
    {
      key: "progress",
      header: progressLabel,
      cell: (j) => (
        <span className="sx-jr-cellprog">
          <SxProgress value={j.progress} label={`${j.title || t("sx.ui.untitled")}: ${progressLabel}`} size="sm" className="sx-jr-cellprog__bar" />
          <span className="sx-num sx-jr-cellprog__pct">{j.progress === null ? "—" : t("sx.journeyRun.percent", { n: Math.round(j.progress) })}</span>
        </span>
      ),
    },
    {
      key: "step",
      header: t("sx.journeyRun.col.step"),
      hideBelow: "md",
      cell: (j) => <span className="sx-jr-cell__muted">{stepLabel(j.currentStep, tr) || "—"}</span>,
    },
    {
      key: "updated",
      header: t("sx.layout.updated"),
      hideBelow: "md",
      cell: (j) => (
        <span className="sx-jr-cell__muted" title={j.updatedAt ? labels.dateTime(j.updatedAt) : undefined}>
          {j.updatedAt && now ? labels.ago(j.updatedAt, now) : j.updatedAt ? labels.date(j.updatedAt) : "—"}
        </span>
      ),
    },
  ];

  const action: SxRowAction<StudioCreationJourney> =
    list === "completed"
      ? { key: "view", label: t("sx.ui.view"), icon: EyeIcon, href: (j) => journeyRowHref(j, list) }
      : { key: "resume", label: t("sx.journeyRun.resume"), icon: ArrowRightIcon, href: (j) => journeyRowHref(j, list) };

  return (
    <SxTable
      rows={rows}
      columns={columns}
      rowKey={(j) => j.id}
      caption={caption}
      loading={loading}
      skeletonRows={3}
      busy={busy}
      error={error}
      empty={empty}
      rowHref={(j) => journeyRowHref(j, list)}
      rowTitle={(j) => j.title || t("sx.ui.untitled")}
      rowActions={[action]}
      footer={footer}
      aiId={`admin.studio.create.${list}`}
    />
  );
}
