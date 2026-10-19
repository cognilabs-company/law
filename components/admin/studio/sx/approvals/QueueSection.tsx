"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "./sx-approvals.css";
import "./sx-ap2.css";
import "./sx-ap3.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownWideNarrowIcon } from "lucide-react";
import { aiId } from "@/lib/ai/ids";
import { useStudioRegistry } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { MessageSquareTextIcon, PaperclipIcon, BadgeCheckIcon, ChevronDownIcon, CircleAlertIcon, EyeIcon, ListChecksIcon, PencilIcon, RocketIcon, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxPanel } from "../layout/Panel";
import { SxPager, SxTable, type SxColumn } from "../layout/Table";
import { useNow } from "../live";
import { groupHue } from "../tones";
import { useStudioLabels } from "../useStudioLabels";
import { needsViewer, type ApprRow } from "./model";
import { APPR_PAGE, pageSlice } from "./queue";
import { AgeChip, CtorTile, MiniRail, PickBox } from "./RowBits";

export type ApprPick = {
  can: (row: ApprRow) => boolean;
  has: (id: string) => boolean;
  toggle: (row: ApprRow) => void;
  setMany: (ids: readonly string[], on: boolean) => void;
};

export type QueueColumnOpts = { onOpen?: (row: ApprRow) => void; pick?: ApprPick | null; fails?: ReadonlyMap<string, string> };
export type QueueMore = { has: boolean; loaded: number; total: number; busy: boolean; error: unknown; onMore: () => void };
export type QueueMode = "work" | "done";

export type QueueSectionProps = {
  rows: readonly ApprRow[];
  loading: boolean;
  busy: boolean;
  page: number;
  onPage: (page: number) => void;
  openId: string;
  onOpen: (row: ApprRow) => void;
  pick?: ApprPick | null;
  more?: QueueMore | null;
  fails?: ReadonlyMap<string, string>;
};

const ACT = "admin.studio.approvals.act";
const SEC = "admin.studio.approvals.section.queue";

export function useQueueColumns(mode: QueueMode, openId: string, opts: QueueColumnOpts = {}): SxColumn<ApprRow>[] {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const now = useNow();
  const { onOpen, pick, fails } = opts;
  const done = mode === "done";

  const groupOf = (key: string) => (key ? reg.groups.find((x) => x.key === key) : undefined);

  const record = (r: ApprRow): ReactNode => {
    const parts: ReactNode[] = [];
    const g = groupOf(r.group);
    const you = !done && needsViewer(r);
    if (r.group)
      parts.push(
        <span key="g" className="sx-ap2-grp">
          {labels.groupName(r.group, g?.title)}
        </span>,
      );
    if (r.code) parts.push(<span key="c">{labels.ctorName(r.code)}</span>);
    if (r.version) parts.push(<span key="v">{t("sx.editor.versionTag", { v: r.version })}</span>);
    if (!done && r.progress)
      parts.push(
        <span key="p">
          {glyph(ListChecksIcon, { size: 14 })}
          <span>{t("sx.ap3.row.steps", { done: r.progress.done, total: r.progress.total })}</span>
        </span>,
      );
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
    const failed = !done ? fails?.get(r.id) : undefined;
    if (failed)
      parts.push(
        <span key="x" className="sx-ap3-fail">
          {glyph(CircleAlertIcon, { size: 14 })}
          <span>{t("sx.ap3.row.failed", { reason: failed })}</span>
        </span>,
      );
    return (
      <span className="sx-appr-rec" data-open={openId && r.id === openId ? "" : undefined} data-you={you ? "" : undefined}>
        <CtorTile code={r.code} group={r.group} hue={r.group ? groupHue(r.group, g?.order ?? 1) : undefined} />
        <span className="sx-appr-tx">
          <span className="sx-appr-tl">
            <span className="sx-appr-t">{r.title || t("sx.ui.untitled")}</span>
            {you ? <span className="sx-ap2-you">{t("sx.appr.sec.mine")}</span> : null}
          </span>
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
    if (n.kind === "people") return <span className="sx-appr-who">{labels.list(n.names, 2)}</span>;
    if (n.kind === "role") return <span className="sx-appr-who">{labels.role(n.role)}</span>;
    if (n.kind === "author") return <span className="sx-appr-who">{n.names[0] ? t("sx.appr.next.author", { name: n.names[0] }) : t("sx.appr.next.authorAny")}</span>;
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sx-vh">{t("sx.ui.notSet")}</span>
      </>
    );
  };

  const sent = (r: ApprRow): ReactNode => {
    if (r.at && !done) return <AgeChip at={r.at} since={r.since} now={now} />;
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
    { key: "sent", header: t(done ? "sx.appr.col.published" : "sx.appr.col.sent"), width: "132px", align: "end", cell: sent },
  ];
  if (pick) cols.unshift({ key: "pick", header: t("sx.ap2.pick.col"), srOnlyHeader: true, width: "52px", cell: pickCell });
  return done ? cols.filter((c) => c.key !== "next") : cols;
}

export function QueueSection({ rows, loading, busy, page, onPage, openId, onOpen, pick, more, fails }: QueueSectionProps): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const pickable = pick ? rows.filter((r) => pick.can(r)) : [];
  const pickOn = pick && pickable.length ? pick : null;
  const columns = useQueueColumns("work", openId, { onOpen, pick: pickOn, fails });
  const picked = pickOn ? pickable.filter((r) => pickOn.has(r.id)).length : 0;
  const slice = pageSlice(rows, page, APPR_PAGE);
  const title = t("sx.appr.sec.queue");
  const count = rows.length;
  const yours = rows.filter(needsViewer).length;
  const lead =
    count > 0 ? (
      <span className="sx-appr-lead">
        <span className="sx-appr-lead__sort">
          {glyph(ArrowDownWideNarrowIcon, { size: 14 })}
          {t("sx.appr.sec.newest")}
        </span>
        {yours > 0 ? (
          <span className="sx-appr-lead__you">
            <span className="sx-appr-lead__dot" aria-hidden="true" />
            {t("sx.appr.sec.yoursN", { n: yours })}
          </span>
        ) : null}
      </span>
    ) : undefined;
  return (
    <SxPanel
      as="section"
      flush
      className="sx-appr-sec"
      title={title}
      titleAs="h2"
      lead={lead}
      aiId={SEC}
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
                aiId={`${SEC}.pick-all`}
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
        aiId="admin.studio.approvals.list"
        rows={slice.rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={onOpen}
        rowTitle={(r) => r.title || t("sx.ui.untitled")}
        rowTone={(r) => (r.test ? "muted" : undefined)}
        loading={loading}
        skeletonRows={4}
        busy={busy}
        empty={<SxEmpty compact icon={BadgeCheckIcon} title={t("sx.home.waiting.empty")} />}
        footer={
          slice.total > APPR_PAGE || more?.has ? (
            <>
              {slice.total > APPR_PAGE ? (
                <SxPager from={slice.from} to={slice.to} total={slice.total} onPrev={() => onPage(slice.page - 1)} onNext={() => onPage(slice.page + 1)} aiId={`${SEC}.pager`} />
              ) : null}
              {more?.has ? (
                <div className="sx-ap3-more">
                  <span className="sx-ap3-more__n sx-num">{t("sx.ap3.more.shown", { n: more.loaded, total: more.total })}</span>
                  {more.error && !more.busy ? (
                    <span className="sx-ap3-more__err" role="alert">
                      {t("sx.ap3.more.fail")}
                    </span>
                  ) : null}
                  <SxButton variant="secondary" size="sm" icon={ChevronDownIcon} busy={more.busy} onClick={more.onMore} aiId={`${SEC}.more`}>
                    {t("sx.ap3.more.load", { n: Math.max(0, more.total - more.loaded) })}
                  </SxButton>
                </div>
              ) : null}
            </>
          ) : undefined
        }
      />
    </SxPanel>
  );
}
