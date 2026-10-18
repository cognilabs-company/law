"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-approvals.css";
import { useId, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxButton } from "../Button";
import { RefreshCwIcon, ChevronDownIcon, ChevronUpIcon } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPager, SxTable } from "../layout/Table";
import type { ApprRow } from "./model";
import { APPR_PAGE, pageSlice } from "./queue";
import { useQueueColumns } from "./QueueSection";
import { DONE_LIMIT } from "./useApprovals";

export type DoneSectionProps = {
  open: boolean;
  onToggle: () => void;
  rows: readonly ApprRow[] | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  page: number;
  onPage: (p: number) => void;
  onOpen: (row: ApprRow) => void;
  locked?: boolean;
};

const NO_ROWS: readonly ApprRow[] = [];

export function DoneSection({ open, onToggle, rows, loading, error, onRetry, page, onPage, onOpen, locked = false }: DoneSectionProps): ReactElement {
  const t = useTranslations("studio");
  const uid = useId();
  const h2Id = `${uid}-h`;
  const bodyId = `${uid}-b`;
  const columns = useQueueColumns("done", "");
  const title = t("sx.appr.sec.done");
  const shown = open || locked;
  const slice = pageSlice(rows ?? NO_ROWS, page, APPR_PAGE);

  let body: ReactElement | null = null;
  if (shown) {
    body =
      error && !rows?.length ? (
        <SxNote
          tone="error"
          title={t("sx.ui.errorTitle")}
          action={
            <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} busy={loading} onClick={onRetry} aiId="admin.studio.approvals.section.done.retry">
              {t("sx.ui.retry")}
            </SxButton>
          }
        >
          {t("sx.ui.loadFail")}
        </SxNote>
      ) : (
        <SxTable<ApprRow>
          caption={title}
          aiId="admin.studio.approvals.list.done"
          rows={slice.rows}
          columns={columns}
          rowKey={(r) => r.id}
          onRowClick={onOpen}
          rowTitle={(r) => r.title || t("sx.ui.untitled")}
          rowTone={(r) => (r.test ? "muted" : undefined)}
          loading={loading || rows === null}
          skeletonRows={4}
          empty={<SxEmpty compact title={t("sx.appr.empty.done")} />}
          footer={
            slice.total > APPR_PAGE ? (
              <SxPager
                from={slice.from}
                to={slice.to}
                total={slice.total}
                onPrev={() => onPage(slice.page - 1)}
                onNext={() => onPage(slice.page + 1)}
                aiId="admin.studio.approvals.section.done.pager"
              />
            ) : undefined
          }
        />
      );
  }

  return (
    <section className="sx-appr-done" aria-labelledby={h2Id} data-ai-id="admin.studio.approvals.section.done" data-ai-type="section" data-ai-label={title}>
      <div className="sx-appr-done__head">
        <div className="sx-appr-done__titles">
          <h2 id={h2Id} className="sx-appr-done__title">
            {title}
          </h2>
          <p className="sx-appr-done__hint">{t("sx.appr.sec.doneHintN", { n: DONE_LIMIT })}</p>
        </div>
        {locked ? null : (
          <SxButton
            variant="ghost"
            size="sm"
            iconEnd={open ? ChevronUpIcon : ChevronDownIcon}
            aria-expanded={open}
            aria-controls={open ? bodyId : undefined}
            onClick={onToggle}
            aiId="admin.studio.approvals.section.done.toggle"
          >
            {open ? t("sx.appr.sec.hide") : t("sx.appr.sec.show")}
          </SxButton>
        )}
      </div>
      {shown ? <div id={bodyId}>{body}</div> : null}
    </section>
  );
}
