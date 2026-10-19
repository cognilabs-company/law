"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-journey.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import type { StudioCreationJourney } from "@/lib/services/studio";
import { ArchiveIcon, ArrowRightIcon, BanIcon, EyeIcon, RotateCcwIcon } from "../icons";
import { SxTable, type SxColumn, type SxRowAction } from "../layout/Table";
import { useNow } from "../live";
import { SxProgress } from "../shared/Progress";
import { creationJourneyHref, journeyObjectId } from "../shared/journeyLinks";
import { useStudioLabels } from "../useStudioLabels";
import { canContinueJourney, journeyActionsFor, journeyCapsOf, journeyOwnerOf, journeyStatusOf, useJourneyDefinitions, type JourneyAction } from "./journeyApi";
import { JourneyStatusPill } from "./JourneyStatusPill";
import { stepLabel, stepTitleOf } from "./steps";

export type JourneyTableProps = {
  rows: readonly StudioCreationJourney[];
  caption: string;
  loading: boolean;
  busy?: boolean;
  error?: ReactNode;
  empty: ReactNode;
  footer?: ReactNode;
  showStatus?: boolean;
  actingId?: string;
  onAction?: (j: StudioCreationJourney, action: JourneyAction) => void;
  aiId: string;
};

export function journeyRowHref(j: StudioCreationJourney): string {
  if (journeyStatusOf(j.status) === "completed") {
    const objectId = journeyObjectId(j);
    if (objectId) return `/admin/studio/o/${encodeURIComponent(objectId)}`;
  }
  return creationJourneyHref(j);
}

const ACTION_ICON = { abandon: BanIcon, archive: ArchiveIcon, restore: RotateCcwIcon } as const;

export function useJourneyOwnerLabel(): (j: StudioCreationJourney) => { text: string; title?: string } {
  const t = useTranslations("studio");
  const { session } = useAuth();
  const me = String(session?.id ?? "").trim();
  return (j) => {
    const o = journeyOwnerOf(j);
    if (o.id && me && o.id === me) return { text: t("sx.journeyRun.ownerYou"), title: o.name || undefined };
    if (o.name) return { text: o.name };
    if (o.id) return { text: t("sx.journeyRun.ownerOther"), title: o.id };
    return { text: "—" };
  };
}

export function JourneyTable({ rows, caption, loading, busy, error, empty, footer, showStatus = false, actingId = "", onAction, aiId }: JourneyTableProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const now = useNow();
  const defs = useJourneyDefinitions().defs;
  const ownerOf = useJourneyOwnerLabel();
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
    ...(showStatus
      ? [
          {
            key: "status",
            header: t("sx.journeyRun.col.status"),
            cell: (j: StudioCreationJourney) => <JourneyStatusPill status={j.status} size="sm" />,
          },
        ]
      : []),
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
      cell: (j) => <span className="sx-jr-cell__muted">{stepLabel(j.currentStep, tr, stepTitleOf(defs, j.type, j.currentStep)) || "—"}</span>,
    },
    {
      key: "owner",
      header: t("sx.journeyRun.col.owner"),
      hideBelow: "lg",
      cell: (j) => {
        const o = ownerOf(j);
        return (
          <span className="sx-jr-cell__muted" title={o.title}>
            {o.text}
          </span>
        );
      },
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

  const actionsOf = (j: StudioCreationJourney): SxRowAction<StudioCreationJourney>[] => {
    const s = journeyStatusOf(j.status);
    const caps = journeyCapsOf(j);
    const open: SxRowAction<StudioCreationJourney> =
      s === "draft" || s === "" || (!!onAction && canContinueJourney(j.status, caps))
        ? { key: "resume", label: t("sx.journeyRun.resume"), icon: ArrowRightIcon, href: journeyRowHref }
        : { key: "view", label: t("sx.ui.view"), icon: EyeIcon, href: journeyRowHref };
    if (!onAction) return [open];
    const busyNow = actingId === j.id;
    const extra = journeyActionsFor(j.status, caps).map(
      (a): SxRowAction<StudioCreationJourney> => ({
        key: a,
        label: t(`sx.journeyRun.act.${a}`),
        icon: ACTION_ICON[a],
        danger: a === "abandon",
        disabled: () => busyNow || !!actingId,
        onSelect: (row) => onAction(row, a),
      }),
    );
    return [open, ...extra];
  };

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
      rowHref={journeyRowHref}
      rowTitle={(j) => j.title || t("sx.ui.untitled")}
      rowTone={(j) => (journeyStatusOf(j.status) === "abandoned" || journeyStatusOf(j.status) === "archived" ? "muted" : undefined)}
      rowActions={actionsOf}
      footer={footer}
      aiId={aiId}
    />
  );
}
