"use client";

import "../sx-tones.css";
import "./sx-home.css";
import { useId, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { logApiError } from "@/lib/http";
import { exportStudioXlsx, useStudioAccess, useStudioRegistry, type StudioConstructor, type StudioGroup } from "@/lib/services/studio";
import { notify } from "@/lib/toast";
import { SxButton, SxLinkButton } from "../Button";
import { useEditorErrorText } from "../editor/useEditorErrorText";
import { RefreshCwIcon, DownloadIcon, PlusIcon } from "../icons";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import { groupHue } from "../tones";
import { useStudioLabels, type StudioLabels } from "../useStudioLabels";
import { GroupCard, GroupCardSkeleton, type GroupCardKind, type GroupCardModel } from "./GroupCard";
import { groupNext, groupProgress, groupSteps } from "./groupModel";
import { Overview } from "./Overview";
import { ResumePanel } from "./ResumePanel";
import { groupTotalsOf, lastActivityOf, needCountsOf, sumRecords, useStudioSummary, type NeedCounts, type StudioSummary } from "./summary";
import { useActionItems } from "./useActionItems";
import { WaitingPanel } from "./WaitingPanel";

const ZERO: Readonly<Record<GroupCardKind, number>> = { returned: 0, review: 0, publish: 0 };
const SK_CARDS = [0, 1, 2, 3, 4, 5];

export function groupCardModel(
  g: StudioGroup,
  items: readonly StudioConstructor[],
  labels: Pick<StudioLabels, "groupName" | "groupWhat" | "ctorName">,
  counts?: Readonly<Record<GroupCardKind, number>>,
  summary?: StudioSummary | null,
): GroupCardModel {
  const rows = groupSteps(g, items);
  const { done, total } = groupProgress(rows);
  const next = groupNext(g, rows);
  const codes = rows.map((r) => r.code);
  const totals = groupTotalsOf(g.key, codes, summary ?? null);
  return {
    key: g.key,
    order: g.order,
    hue: groupHue(g.key, g.order),
    name: labels.groupName(g.key, g.title),
    what: labels.groupWhat(g.key, g.description),
    done,
    total,
    blocked: rows.filter((r) => r.state === "blocked").length,
    records: totals ? totals.total : sumRecords(rows, summary ?? null),
    runtime: totals?.runtime ?? null,
    last: lastActivityOf(codes, summary ?? null, g.key),
    lastSlot: !!summary?.detailed,
    steps: rows.map((r) => ({ code: r.code, step: r.step, name: labels.ctorName(r.code, r.ctor?.title), state: r.state })),
    next: next ? { code: next.code, name: labels.ctorName(next.code, next.ctor?.title) } : null,
    counts: counts ?? ZERO,
  };
}

export function Home(): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const reg = useStudioRegistry();
  const actions = useActionItems();
  const summary = useStudioSummary();
  const errText = useEditorErrorText();
  const headingId = useId();
  const [exporting, setExporting] = useState(false);

  const doExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportStudioXlsx();
      notify.success(t("sx.home.exportOk"));
    } catch (e) {
      logApiError("studio.export", e);
      notify.error(errText(e).text || t("sx.home.exportFail"));
    } finally {
      setExporting(false);
    }
  };

  const head =
    acc.isAdmin || acc.canEdit ? (
      <>
        {acc.isAdmin ? (
          <SxButton variant="secondary" size="sm" icon={DownloadIcon} busy={exporting} onClick={() => void doExport()} aiId="admin.studio.export" aiLabel={t("sx.home.excelAria")} aria-label={t("sx.home.excelAria")}>
            {t("sx.home.excel")}
          </SxButton>
        ) : null}
        {acc.canEdit ? (
          <SxLinkButton variant="primary" size="sm" icon={PlusIcon} href="/admin/studio/create" aiId="admin.studio.home.create">
            {t("sx.journeyRun.title")}
          </SxLinkButton>
        ) : null}
      </>
    ) : undefined;

  const allow: Readonly<Record<keyof NeedCounts, boolean>> = { returned: acc.canEdit, review: acc.canReview, publish: acc.canPublish };
  const fromSummary = !!summary.data?.detailed;
  const countsOf = (g: StudioGroup) => (fromSummary ? (needCountsOf(g.key, groupSteps(g, reg.items).map((r) => r.code), summary.data, allow) ?? undefined) : actions.byGroup[g.key]);
  const cards = reg.groups.map((g) => groupCardModel(g, reg.items, labels, countsOf(g), summary.data));
  const countsLoading = !fromSummary && (actions.loading || summary.loading);
  const sumDone = cards.reduce((a, c) => a + c.done, 0);
  const sumTotal = cards.reduce((a, c) => a + c.total, 0);
  const groupsDone = cards.filter((c) => c.total > 0 && c.done >= c.total).length;
  const regLoading = !cards.length && !reg.error && reg.avail !== "off" && reg.at === 0;

  return (
    <SxPage title={t("sx.ui.studio")} section="home" lead={t("sx.home.lead")} aiId="admin.studio.home" actions={head}>
      <>
        <div className="sx-home">
          <Overview done={sumDone} total={sumTotal} groups={cards.length} groupsDone={groupsDone} ready={cards.length > 0 || (reg.at > 0 && !reg.error)} summary={summary} />
          <div className="sx-home__band">
            <WaitingPanel data={actions} max={3} aiId="admin.studio.home.waiting" />
            <ResumePanel />
          </div>
          <section className="sx-home__groups" aria-labelledby={headingId}>
            <div className="sx-home__hrow">
              <h2 id={headingId} className="sx-home__h">
                {t("sx.home.groups.title")}
              </h2>
              {cards.length ? <span className="sx-home__hcount sx-num">{labels.num(cards.length)}</span> : null}
            </div>
            {cards.length ? (
              <ol className="sx-ggrid" aria-label={t("sx.home.groups.title")} data-ai-id="admin.studio.home.groups" data-ai-type="list" data-ai-label={t("sx.home.groups.title")}>
                {cards.map((m, i) => (
                  <GroupCard key={m.key} model={m} index={i} loadingCounts={countsLoading} />
                ))}
              </ol>
            ) : reg.error ? (
              <SxNote
                tone="error"
                title={t("sx.ui.errorTitle")}
                action={
                  <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => void reg.reload()} aiId="admin.studio.home.groups.retry">
                    {t("sx.ui.retry")}
                  </SxButton>
                }
              >
                {t("sx.ui.loadFail")}
              </SxNote>
            ) : regLoading ? (
              <ol className="sx-ggrid" aria-hidden="true">
                {SK_CARDS.map((i) => (
                  <GroupCardSkeleton key={i} index={i} />
                ))}
              </ol>
            ) : null}
          </section>
        </div>
      </>
    </SxPage>
  );
}
