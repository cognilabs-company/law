"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-approvals.css";
import "./sx-ap2.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { useStudioRegistry } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { MessageSquareTextIcon, PaperclipIcon, BadgeCheckIcon, EyeIcon, PencilIcon, RocketIcon, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxPanel } from "../layout/Panel";
import { SxPager, SxTable, type SxColumn } from "../layout/Table";
import { useNow } from "../live";
import { groupHue } from "../tones";
import { useStudioLabels } from "../useStudioLabels";
import type { ApprRow, ApprSection } from "./model";
import { APPR_PAGE, pageSlice, workCounts } from "./queue";
import { AgeChip, CtorTile, MiniRail, PickBox } from "./RowBits";

export type ApprPick = {
  can: (row: ApprRow) => boolean;
  has: (id: string) => boolean;
  toggle: (row: ApprRow) => void;
  setMany: (ids: readonly string[], on: boolean) => void;
};

export type QueueColumnOpts = { onOpen?: (row: ApprRow) => void; pick?: ApprPick | null };

export type QueueSectionProps = {
  section: Exclude<ApprSection, "done">;
  rows: readonly ApprRow[];
  loading: boolean;
  busy: boolean;
  page: number;
  onPage: (page: number) => void;
  openId: string;
  onOpen: (row: ApprRow) => void;
  pick?: ApprPick | null;
};

const ACT = "admin.studio.approvals.act";

export function useQueueColumns(section: ApprSection, openId: string, opts: QueueColumnOpts = {}): SxColumn<ApprRow>[] {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const now = useNow();
  const { onOpen, pick } = opts;

  const groupOf = (key: string) => (key ? reg.groups.find((x) => x.key === key) : undefined);

  const record = (r: ApprRow): ReactNode => {
    const parts: ReactNode[] = [];
    const g = groupOf(r.group);
    if (r.group)
      parts.push(
        <span key="g" className="sx-ap2-grp">
          {labels.groupName(r.group, g?.title)}
        </span>,
      );
    if (r.code) parts.push(<span key="c">{labels.ctorName(r.code)}</span>);
    if (r.version) parts.push(<span key="v">{t("sx.editor.versionTag", { v: r.version })}</span>);
    if (r.comments > 0)
      parts.push(
        <span key="m">
          {glyph(MessageSquareTextIcon, { size: 14 })}
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
        <CtorTile code={r.code} group={r.group} hue={r.group ? groupHue(r.group, g?.order ?? 1) : undefined} />
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

  const youAct = (r: ApprRow): ReactNode => {
    const name = r.title || t("sx.ui.untitled");
    if (r.kind === "returned") {
      return (
        <SxLinkButton
          variant="secondary"
          size="sm"
          icon={PencilIcon}
          href={`/admin/studio/o/${encodeURIComponent(r.id)}`}
          className="sx-ap2-act"
          aiId={aiId(ACT, "fix", r.id)}
          aiLabel={t("sx.appr.dw.fix")}
        >
          {t("sx.appr.dw.fix")}
          <span className="sx-vh sx-ap2-for">{`: ${name}`}</span>
        </SxLinkButton>
      );
    }
    const pub = r.kind === "publish";
    const label = pub ? t("sx.appr.act.publish") : t("sx.ap2.act.review");
    return (
      <SxButton
        variant="secondary"
        size="sm"
        icon={pub ? RocketIcon : EyeIcon}
        className={pub ? "sx-ap2-act sx-ap2-act--pub" : "sx-ap2-act"}
        onClick={() => onOpen?.(r)}
        aria-haspopup="dialog"
        aiId={aiId(ACT, pub ? "publish" : "review", r.id)}
        aiLabel={label}
      >
        {label}
        <span className="sx-vh sx-ap2-for">{`: ${name}`}</span>
      </SxButton>
    );
  };

  const next = (r: ApprRow): ReactNode => {
    const n = r.next;
    if (n.kind === "you") return onOpen ? youAct(r) : <span className="sx-appr-you">{t(`sx.appr.next.you.${r.kind === "done" ? "review" : r.kind}`)}</span>;
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

  const sent = (r: ApprRow): ReactNode => {
    if (r.at && section !== "done") return <AgeChip at={r.at} since={r.since} now={now} />;
    if (r.at)
      return (
        <time className="sx-appr-time" dateTime={r.at} title={labels.dateTime(r.at)}>
          {now ? labels.ago(r.at, now) : labels.date(r.at)}
        </time>
      );
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sx-vh">{t("sx.ui.notSet")}</span>
      </>
    );
  };

  const pickCell = (r: ApprRow): ReactNode =>
    pick && pick.can(r) ? (
      <PickBox checked={pick.has(r.id)} onToggle={() => pick.toggle(r)} label={t("sx.ap2.pick.row", { title: r.title || t("sx.ui.untitled") })} aiId={aiId("admin.studio.approvals.pick", r.id)} />
    ) : null;

  const cols: SxColumn<ApprRow>[] = [
    { key: "record", header: t("sx.appr.col.record"), primary: true, cell: record },
    { key: "status", header: t("sx.appr.col.status"), width: "160px", cell: (r) => <MiniRail status={r.statusRaw} /> },
    { key: "next", header: t("sx.appr.col.next"), width: "184px", cell: next },
    { key: "sent", header: t(section === "done" ? "sx.appr.col.published" : "sx.appr.col.sent"), width: "124px", align: "end", cell: sent },
  ];
  if (pick) cols.unshift({ key: "pick", header: t("sx.ap2.pick.col"), srOnlyHeader: true, width: "52px", cell: pickCell });
  return section === "done" ? cols.filter((c) => c.key !== "next") : cols;
}

export function QueueSection({ section, rows, loading, busy, page, onPage, openId, onOpen, pick }: QueueSectionProps): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const pickable = pick ? rows.filter((r) => pick.can(r)) : [];
  const pickOn = pick && pickable.length ? pick : null;
  const columns = useQueueColumns(section, openId, { onOpen, pick: pickOn });
  const picked = pickOn ? pickable.filter((r) => pickOn.has(r.id)).length : 0;
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
          <>
            {pickOn ? (
              <PickBox
                checked={picked === pickable.length}
                mixed={picked > 0 && picked < pickable.length}
                onToggle={() =>
                  pickOn.setMany(
                    pickable.map((r) => r.id),
                    picked < pickable.length,
                  )
                }
                label={t("sx.ap2.pick.all")}
                aiId={`admin.studio.approvals.section.${section}.pick-all`}
                className="sx-ap2-all"
              >
                <span className="sx-ap2-all__t">{t("sx.ap2.pick.all")}</span>
                <span className="sx-ap2-all__n sx-num">{labels.num(pickable.length)}</span>
              </PickBox>
            ) : null}
            <span className="sx-appr-count sx-num">
              <span aria-hidden="true">{labels.num(count)}</span>
              <span className="sx-vh">{t("sx.appr.count", { n: count })}</span>
            </span>
          </>
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
        empty={section === "mine" ? <SxEmpty compact icon={BadgeCheckIcon} title={t("sx.home.waiting.empty")} /> : <SxEmpty compact title={t("sx.appr.empty.others")} />}
        footer={
          slice.total > APPR_PAGE ? (
            <SxPager from={slice.from} to={slice.to} total={slice.total} onPrev={() => onPage(slice.page - 1)} onNext={() => onPage(slice.page + 1)} aiId={pagerId} />
          ) : undefined
        }
      />
    </SxPanel>
  );
}
