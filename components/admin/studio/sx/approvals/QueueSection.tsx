"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-approvals.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChatCircleTextIcon, PaperclipIcon, SealCheckIcon, ctorGlyph, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxPanel } from "../layout/Panel";
import { SxPager, SxTable, type SxColumn } from "../layout/Table";
import { useNow } from "../live";
import { StatusRail } from "../StatusRail";
import { useStudioLabels } from "../useStudioLabels";
import type { ApprRow, ApprSection } from "./model";
import { APPR_PAGE, pageSlice, workCounts } from "./queue";

export type QueueSectionProps = {
  section: Exclude<ApprSection, "done">;
  rows: readonly ApprRow[];
  loading: boolean;
  busy: boolean;
  page: number;
  onPage: (page: number) => void;
  openId: string;
  onOpen: (row: ApprRow) => void;
};

export function useQueueColumns(section: ApprSection, openId: string): SxColumn<ApprRow>[] {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const now = useNow();

  const record = (r: ApprRow): ReactNode => {
    const parts: ReactNode[] = [];
    if (r.code) parts.push(<span key="c">{labels.ctorName(r.code)}</span>);
    if (r.version) parts.push(<span key="v">{t("sx.editor.versionTag", { v: r.version })}</span>);
    if (r.comments > 0)
      parts.push(
        <span key="m">
          {glyph(ChatCircleTextIcon, { size: 14 })}
          <span aria-hidden="true">{labels.num(r.comments)}</span>
          <span className="sx-vh">{t("sx.appr.row.comments", { n: r.comments })}</span>
        </span>,
      );
    if (r.hasFile)
      parts.push(
        <span key="f">
          {glyph(PaperclipIcon, { size: 14 })}
          <span className="sx-vh">{t("sx.appr.row.file")}</span>
        </span>,
      );
    if (r.overdue)
      parts.push(
        <span key="o" data-late="">
          {t("sx.editor.steps.overdue")}
        </span>,
      );
    return (
      <span className="sx-appr-rec" data-open={openId && r.id === openId ? "" : undefined}>
        <span className="sx-appr-g">{ctorGlyph(r.code, r.group, { size: 18 })}</span>
        <span className="sx-appr-tx">
          <span className="sx-appr-t">{r.title || t("sx.ui.untitled")}</span>
          {parts.length ? (
            <span className="sx-appr-m">
              {parts.map((p, i) => (
                <span key={i} className="sx-appr-mp">
                  {p}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </span>
    );
  };

  const next = (r: ApprRow): ReactNode => {
    const n = r.next;
    if (n.kind === "you") return <span className="sx-appr-you">{t(`sx.appr.next.you.${r.kind === "done" ? "review" : r.kind}`)}</span>;
    if (n.kind === "people") return labels.list(n.names, 2);
    if (n.kind === "role") return labels.role(n.role);
    if (n.kind === "author") return n.names[0] ? t("sx.appr.next.author", { name: n.names[0] }) : t("sx.appr.next.authorAny");
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sx-vh">{t("sx.ui.notSet")}</span>
      </>
    );
  };

  const sent = (r: ApprRow): ReactNode =>
    r.at ? (
      <time className="sx-appr-time" dateTime={r.at} title={labels.dateTime(r.at)}>
        {now ? labels.ago(r.at, now) : labels.date(r.at)}
      </time>
    ) : (
      <>
        <span aria-hidden="true">—</span>
        <span className="sx-vh">{t("sx.ui.notSet")}</span>
      </>
    );

  const cols: SxColumn<ApprRow>[] = [
    { key: "record", header: t("sx.appr.col.record"), primary: true, cell: record },
    { key: "status", header: t("sx.appr.col.status"), width: "200px", cell: (r) => <StatusRail status={r.statusRaw} variant="compact" celebrateOnPublish={false} /> },
    { key: "next", header: t("sx.appr.col.next"), width: "200px", cell: next },
    { key: "sent", header: t(section === "done" ? "sx.appr.col.published" : "sx.appr.col.sent"), width: "140px", align: "end", cell: sent },
  ];
  return section === "done" ? cols.filter((c) => c.key !== "next") : cols;
}

export function QueueSection({ section, rows, loading, busy, page, onPage, openId, onOpen }: QueueSectionProps): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const columns = useQueueColumns(section, openId);
  const counts = workCounts(rows);
  const slice = pageSlice(rows, page, APPR_PAGE);
  const title = t(`sx.appr.sec.${section}`);
  const count = rows.length;
  const pagerId = `admin.studio.approvals.section.${section}.pager`;
  return (
    <SxPanel
      as="section"
      flush
      className="sx-appr-sec"
      title={title}
      titleAs="h2"
      aiId={`admin.studio.approvals.section.${section}`}
      actions={
        count > 0 ? (
          <span className="sx-appr-count sx-num">
            <span aria-hidden="true">{labels.num(count)}</span>
            <span className="sx-vh">{t("sx.appr.count", { n: count })}</span>
          </span>
        ) : undefined
      }
    >
      <SxTable<ApprRow>
        caption={title}
        aiId={section === "mine" ? "admin.studio.approvals.list" : "admin.studio.approvals.list.others"}
        rows={slice.rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={onOpen}
        rowTitle={(r) => r.title || t("sx.ui.untitled")}
        rowTone={(r) => (r.test ? "muted" : undefined)}
        groupBy={(r) => ({ key: r.kind, title: t(`sx.appr.grp.${section}.${r.kind === "done" ? "review" : r.kind}`), meta: labels.num(r.kind === "done" ? 0 : counts[r.kind]) })}
        loading={loading}
        skeletonRows={4}
        busy={busy}
        empty={section === "mine" ? <SxEmpty compact icon={SealCheckIcon} title={t("sx.home.waiting.empty")} /> : <SxEmpty compact title={t("sx.appr.empty.others")} />}
        footer={
          slice.total > APPR_PAGE ? (
            <SxPager from={slice.from} to={slice.to} total={slice.total} onPrev={() => onPage(slice.page - 1)} onNext={() => onPage(slice.page + 1)} aiId={pagerId} />
          ) : undefined
        }
      />
    </SxPanel>
  );
}
