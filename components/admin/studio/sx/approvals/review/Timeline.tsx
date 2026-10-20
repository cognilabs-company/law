"use client";

import "../../sx-core.css";
import "../sx-ap3.css";
import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import type { StudioVersion } from "@/lib/services/studio";
import { SxButton } from "../../Button";
import { SxNote } from "../../layout/Note";
import { useNow } from "../../live";
import { SxSegmented, type SxSegItem } from "../../shared/Segmented";
import type { SxIcon } from "../../types";
import { useStudioLabels } from "../../useStudioLabels";
import {
  ActivityIcon,
  AlarmClockIcon,
  ArchiveIcon,
  ArrowRightLeftIcon,
  BanIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  GitBranchIcon,
  HistoryIcon,
  MessageSquareTextIcon,
  PencilLineIcon,
  PlusIcon,
  RadioIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
  glyph,
} from "../../icons";
import { stepName } from "../../editor/model";
import type { ApprEvent, ApprEventKind } from "../approvalsApi";
import type { ReviewHistory } from "./useReview";

export type TimelineProps = { history: ReviewHistory; versions: readonly StudioVersion[]; onRetry: () => void };

type Cat = "all" | "decisions" | "comments" | "versions" | "release" | "audit";

const AI = "admin.studio.approvals.drawer.timeline";
const FIRST = 8;

const ICON: Readonly<Record<ApprEventKind, SxIcon>> = {
  comment: MessageSquareTextIcon,
  comment_updated: PencilLineIcon,
  comment_deleted: Trash2Icon,
  reassign: ArrowRightLeftIcon,
  rollback: HistoryIcon,
  restore: RotateCcwIcon,
  withdraw: Undo2Icon,
  archive: ArchiveIcon,
  version: GitBranchIcon,
  publish: RadioIcon,
  overdue: AlarmClockIcon,
  auto: SparklesIcon,
  submit: SendIcon,
  returned: Undo2Icon,
  rejected: BanIcon,
  approved: CircleCheckIcon,
  created: PlusIcon,
  save: SaveIcon,
  other: ActivityIcon,
};

const TONE: Partial<Readonly<Record<ApprEventKind, string>>> = {
  approved: "approved",
  auto: "approved",
  publish: "published",
  returned: "returned",
  rejected: "returned",
  overdue: "returned",
  submit: "review",
  archive: "archived",
  comment_deleted: "archived",
};

export function catOf(e: Pick<ApprEvent, "kind" | "audit">): Exclude<Cat, "all"> | null {
  const kind = e.kind;
  if (e.audit) return "audit";
  if (kind === "approved" || kind === "returned" || kind === "rejected" || kind === "auto" || kind === "reassign" || kind === "overdue" || kind === "submit") return "decisions";
  if (kind === "comment" || kind === "comment_updated" || kind === "comment_deleted") return "comments";
  if (kind === "version" || kind === "save" || kind === "created" || kind === "withdraw") return "versions";
  if (kind === "publish" || kind === "rollback" || kind === "archive" || kind === "restore") return "release";
  return null;
}

const RAW_KEY = /^[a-z0-9_.:-]+$/;

export function Timeline({ history, versions, onRetry }: TimelineProps): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const now = useNow();
  const [cat, setCat] = useState<Cat>("all");
  const [all, setAll] = useState(false);
  const { events, summary, error, closed } = history;

  if (closed) {
    return <p className="sx-ap3-tl__closed">{t("sx.ap3.tl.closed")}</p>;
  }
  if (!events && error) {
    return (
      <SxNote
        tone="error"
        action={
          <SxButton variant="ghost" size="sm" onClick={onRetry} aiId={`${AI}.retry`}>
            {t("sx.ui.retry")}
          </SxButton>
        }
      >
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  }
  if (!events) {
    return (
      <div className="sx-ap3-tl__sk" aria-busy="true">
        <span className="sx-vh">{t("sx.ui.loading")}</span>
        <span className="sx-sk" aria-hidden="true" />
        <span className="sx-sk" aria-hidden="true" />
        <span className="sx-sk" aria-hidden="true" />
      </div>
    );
  }
  if (!events.length) return <p className="sx-ap3-tl__closed">{t("sx.ap3.tl.empty")}</p>;

  const verOf = (e: ApprEvent): string => e.version || (e.versionId ? (versions.find((v) => v.id === e.versionId)?.version ?? "") : "");
  const labelOf = (e: ApprEvent): string => {
    if (e.kind === "version") {
      const v = verOf(e);
      return v ? t("sx.ap3.ev.versionN", { v }) : t("sx.ap3.ev.version");
    }
    if (e.kind !== "other") return t(`sx.ap3.ev.${e.kind}`);
    return labels.locale === "uz" && e.title && !RAW_KEY.test(e.title) ? e.title : t("sx.ap3.ev.other");
  };
  const stageOf = (e: ApprEvent): string => (e.stage || e.stageRole ? stepName(labels, { role: e.stageRole, title: e.stage }) : "");

  const main = events.filter((e) => !e.audit);
  const counts: Record<Cat, number> = { all: main.length, decisions: 0, comments: 0, versions: 0, release: 0, audit: 0 };
  for (const e of events) {
    const c = catOf(e);
    if (c) counts[c] += 1;
  }
  const cats: Cat[] = ["all", "decisions", "comments", "versions", "release", "audit"];
  const items: SxSegItem<Cat>[] = cats.filter((c) => c === "all" || counts[c] > 0).map((c) => ({ value: c, label: t(`sx.ap3.tl.cat.${c}`), count: counts[c], aiId: `${AI}.cat.${c}` }));
  const active = items.some((i) => i.value === cat) ? cat : "all";
  const list = active === "all" ? main : events.filter((e) => catOf(e) === active);
  const shown = all ? list : list.slice(0, FIRST);
  const known = summary.filter((s) => t.has(`sx.ap3.sum.${s.key}`));

  return (
    <div className="sx-ap3-tl" data-ai-id={AI} data-ai-type="list" data-ai-label={t("sx.ap3.tl.title")}>
      {known.length ? (
        <p className="sx-ap3-tl__sum">
          {known.map((s) => (
            <span key={s.key} className="sx-ap3-tl__chip">
              <b className="sx-num">{labels.num(s.n)}</b> {t(`sx.ap3.sum.${s.key}`, { n: s.n })}
            </span>
          ))}
        </p>
      ) : null}
      {items.length > 1 ? <SxSegmented<Cat> items={items} value={active} onChange={(v) => { setCat(v); setAll(false); }} label={t("sx.ap3.tl.filter")} size="sm" className="sx-ap3-tl__seg" aiId={`${AI}.filter`} /> : null}
      {!list.length ? <p className="sx-ap3-tl__closed">{t("sx.ap3.tl.empty")}</p> : null}
      <ol className="sx-ap3-tl__list">
        {shown.map((e) => {
          const v = e.kind === "version" ? "" : verOf(e);
          const tone = TONE[e.kind];
          const stage = stageOf(e);
          return (
            <li key={e.id} className="sx-ap3-tl__item" data-tone={tone} data-deleted={e.deleted ? "" : undefined}>
              <span className="sx-ap3-tl__dot" aria-hidden="true">
                {glyph(ICON[e.kind], { size: 14 })}
              </span>
              <div className="sx-ap3-tl__body">
                <p className="sx-ap3-tl__top">
                  <span className="sx-ap3-tl__what">{labelOf(e)}</span>
                  {v ? <span className="sx-code">{t("sx.editor.versionTag", { v })}</span> : null}
                  {e.deleted && e.kind !== "comment_deleted" ? <span className="sx-ap3-tl__del">{t("sx.ap3.tl.deleted")}</span> : null}
                </p>
                <p className="sx-ap3-tl__meta">
                  {e.actor ? <span>{e.actorCode ? `${e.actor} · ${e.actorCode}` : e.actor}</span> : null}
                  {stage ? <span>{t("sx.ap3.tl.stage", { name: stage })}</span> : null}
                  {e.at ? (
                    <time dateTime={e.at} title={now ? labels.ago(e.at, now) : undefined}>
                      {labels.dateTime(e.at)}
                    </time>
                  ) : null}
                </p>
                {e.text ? <p className="sx-ap3-tl__text">{e.text}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {list.length > FIRST ? (
        <SxButton variant="ghost" size="sm" iconEnd={ChevronDownIcon} onClick={() => setAll((x) => !x)} aria-expanded={all} aiId={`${AI}.all`}>
          {all ? t("sx.appr.dw.collapse") : t("sx.ap3.tl.all", { n: list.length })}
        </SxButton>
      ) : null}
    </div>
  );
}
