"use client";

import "../../sx-tones.css";
import "../sx-home.css";
import "../sx-group.css";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import type { StudioConstructor } from "@/lib/services/studio";
import { SxLinkButton } from "../../Button";
import { enterStyle } from "../../hooks";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, CircleCheckIcon, CircleDashedIcon, GlobeIcon, LayersIcon, LockIcon, PlusIcon, ShieldCheckIcon, ctorIcon, glyph } from "../../icons";
import { SxGuideButton } from "../../layout/Guide";
import { journeyTypeOfCode } from "../../shared/journeyLinks";
import { StartJourneyButton } from "../../shared/StartJourney";
import { sxStatus } from "../../status";
import type { StudioLabels } from "../../useStudioLabels";
import type { GroupStepRow } from "../groupModel";
import { LastActivity } from "../LastActivity";
import { useStepStateText } from "../StepMap";
import type { CtorSummary } from "../summary";
import { StepRecords } from "./StepRecords";

const enc = encodeURIComponent;
const SENTINEL = "\u0000";

export function createHrefFor(code: string, ctor: StudioConstructor | null): string {
  const fc = ctor?.operations.formContextEndpoint ?? "";
  return `/admin/studio/o/new?new=${enc(code)}${fc ? `&ctx=${enc(`${fc}?mode=create`)}` : ""}`;
}

export function withList(text: string, nodes: readonly ReactNode[]): ReactNode {
  const at = text.indexOf(SENTINEL);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      {nodes}
      {text.slice(at + SENTINEL.length)}
    </>
  );
}

export function BlockedLine({ row, labels, group }: { row: GroupStepRow; labels: StudioLabels; group: string }): ReactElement {
  const t = useTranslations("studio");
  const chips = row.missing.map((code) => (
    <Link key={code} href={`/admin/studio/c/${enc(code)}`} className="sx-tl__dep" data-ai-id={aiId("admin.studio.group.step", row.code, "dep", code)} data-ai-type="link" data-ai-label={labels.ctorName(code)}>
      {glyph(ctorIcon(code, group), { size: 14 })}
      <span>{labels.ctorName(code)}</span>
    </Link>
  ));
  return (
    <p className="sx-gstate sx-tl__blocked" data-state="blocked">
      {glyph(LockIcon, { size: 14 })}
      <span className="sx-tl__deps">{chips.length ? withList(t("sx.gpage.state.blocked", { list: SENTINEL }), chips) : t("sx.guide.notDone")}</span>
    </p>
  );
}

function Node({ row, labels }: { row: GroupStepRow; labels: StudioLabels }) {
  if (row.state === "done") return <span className="sx-tl__node" data-state="done">{glyph(CheckIcon, { size: 16, strokeWidth: 2.5 })}</span>;
  if (row.state === "blocked") return <span className="sx-tl__node" data-state="blocked">{glyph(LockIcon, { size: 14 })}</span>;
  return (
    <span className="sx-tl__node sx-num" data-state={row.state}>
      {labels.num(row.step)}
    </span>
  );
}

const STATE_ICON = { done: CircleCheckIcon, next: ArrowRightIcon, blocked: LockIcon, open: CircleDashedIcon } as const;
const STATUS_ORDER: readonly string[] = ["draft", "changes_requested", "submitted", "in_review", "approved", "published"];

export function statusChipsOf(stats: CtorSummary | null): { status: string; n: number }[] {
  if (!stats) return [];
  return STATUS_ORDER.map((status) => ({ status, n: stats.byStatus[status] ?? 0 })).filter((x) => x.n > 0);
}

type StepItemProps = { row: GroupStepRow; after: GroupStepRow | null; index: number; group: string; labels: StudioLabels; records: number | null; stats: CtorSummary | null; canEdit: boolean };

function StepItem({ row, after, index, group, labels, records, stats, canEdit }: StepItemProps) {
  const t = useTranslations("studio");
  const stateText = useStepStateText();
  const [open, setOpen] = useState(false);
  const panelId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-latest`;
  const name = labels.ctorName(row.code, row.ctor?.title);
  const what = labels.ctorWhat(row.code, { description: row.ctor?.description });
  const base = aiId("admin.studio.group.step", row.code);
  const jt = journeyTypeOfCode(row.code);
  const canCreate = canEdit && row.state !== "blocked";
  const href = `/admin/studio/c/${enc(row.code)}`;
  const chips = statusChipsOf(stats);
  return (
    <li className="sx-tl__item sx-enter" data-state={row.state} style={enterStyle(Math.min(index, 12))}>
      <div className="sx-tl__rail" aria-hidden="true">
        <Node row={row} labels={labels} />
        {after ? <span className="sx-tl__line" data-solid={row.state === "done" ? "" : undefined} /> : null}
      </div>
      <article className="sx-tl__card" data-state={row.state} data-ai-id={aiId("admin.studio.flow.step", row.code)} data-ai-type="list_item" data-ai-label={name}>
        <div className="sx-tl__head">
          <span className="sx-tl__tile sx-sq">{glyph(ctorIcon(row.code, group), { size: 22 })}</span>
          <div className="sx-tl__titles">
            <span className="sx-tl__step sx-num">{t("sx.gp.step", { n: row.step })}</span>
            <h3 className="sx-tl__name">
              <Link href={href} className="sx-tl__link" data-ai-id={aiId(base, "title")} data-ai-type="link" data-ai-label={name}>
                {name}
              </Link>
            </h3>
          </div>
          <span className="sx-tl__chip" data-state={row.state}>
            {glyph(STATE_ICON[row.state], { size: 14 })}
            <span>{stateText(row.state)}</span>
          </span>
        </div>
        {what ? (
          <p className="sx-tl__what" title={what}>
            {what}
          </p>
        ) : null}
        <div className="sx-tl__meta">
          {records !== null ? (
            <span className="sx-tl__mchip sx-num">
              {glyph(LayersIcon, { size: 13 })}
              <span>{t("sx.hm.card.records", { n: records })}</span>
            </span>
          ) : null}
          {stats?.runtime ? (
            <span className="sx-tl__mchip sx-num">
              {glyph(GlobeIcon, { size: 13 })}
              <span>{t("sx.hm.card.runtime", { n: stats.runtime })}</span>
            </span>
          ) : null}
          {chips.map((c) => (
            <span key={c.status} className="sx-tl__mchip sx-tl__schip sx-num" data-tone={sxStatus(c.status).tone} title={t("sx.gp.statusN", { label: labels.status(c.status), n: c.n })}>
              <span>{labels.status(c.status)}</span>
              <span className="sx-tl__schip-n">{labels.num(c.n)}</span>
            </span>
          ))}
          {row.ctor?.approvalRequired ? (
            <span className="sx-tl__mchip">
              {glyph(ShieldCheckIcon, { size: 13 })}
              <span>{t("sx.gp.approval")}</span>
            </span>
          ) : null}
          <span className="sx-tl__mchip sx-tl__code">{row.code}</span>
        </div>
        {stats?.lastAt ? <LastActivity last={{ at: stats.lastAt, objectId: stats.lastObjectId, code: stats.code }} aiId={aiId(base, "last")} className="sx-tl__last" /> : null}
        {row.state === "blocked" ? <BlockedLine row={row} labels={labels} group={group} /> : null}
        <div className="sx-tl__actions">
          <SxLinkButton variant={row.state === "next" ? "primary" : "secondary"} size="sm" href={href} iconEnd={ArrowRightIcon} aiId={aiId(base, "open")} aiLabel={`${t("sx.ui.open")}: ${name}`}>
            {t("sx.ui.open")}
          </SxLinkButton>
          {canCreate ? (
            jt ? (
              <StartJourneyButton type={jt} variant="ghost" size="sm" label={jt === "package" ? t("sx.journeyRun.newPackage") : t("sx.journeyRun.newService")} aiId={aiId(base, "new")} />
            ) : (
              <SxLinkButton variant="add" size="sm" icon={PlusIcon} href={createHrefFor(row.code, row.ctor)} aiId={aiId(base, "new")} aiLabel={`${t("sx.gp.new")}: ${name}`}>
                {t("sx.gp.new")}
              </SxLinkButton>
            )
          ) : null}
          <span className="sx-tl__spacer" />
          <SxGuideButton code={row.code} label={t("sx.gp.what")} aiId={aiId(base, "guide")} />
          <button
            type="button"
            className="sx-tl__more"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label={t("sx.gp.latestOf", { name })}
            title={t("sx.gp.latest")}
            onClick={() => setOpen((v) => !v)}
            data-ai-id={aiId(base, "latest", "toggle")}
            data-ai-type="button"
            data-ai-label={t("sx.gp.latest")}
          >
            {glyph(ChevronDownIcon, { size: 18 })}
          </button>
        </div>
        {open ? <StepRecords code={row.code} id={panelId} name={name} /> : null}
      </article>
    </li>
  );
}

export type StepTimelineProps = {
  rows: readonly GroupStepRow[];
  group: string;
  labels: StudioLabels;
  recordsOf: (row: GroupStepRow) => number | null;
  statsOf?: (row: GroupStepRow) => CtorSummary | null;
  canEdit: boolean;
  label: string;
};

export function StepTimeline({ rows, group, labels, recordsOf, statsOf, canEdit, label }: StepTimelineProps): ReactElement {
  return (
    <ol className="sx-tl" aria-label={label} data-ai-id="admin.studio.group.steps" data-ai-type="list" data-ai-label={label}>
      {rows.map((r, i) => (
        <StepItem key={r.code} row={r} after={rows[i + 1] ?? null} index={i} group={group} labels={labels} records={recordsOf(r)} stats={statsOf?.(r) ?? null} canEdit={canEdit} />
      ))}
    </ol>
  );
}
