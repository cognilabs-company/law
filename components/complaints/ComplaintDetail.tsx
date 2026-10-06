"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { dateTimeFull } from "@/lib/date";
import { humanize, personName } from "@/lib/labels";
import {
  complaintStage,
  getQualityComplaintDetail,
  getWorkRef,
  sourceHref,
  workHref,
  type ComplaintDetail as Detail,
  type ComplaintItem,
  type WorkRef,
} from "@/lib/services/complaints";
import { Skeleton } from "@/components/portal/DataState";
import {
  IconArrowRight,
  IconBolt,
  IconBriefcase,
  IconChat,
  IconCheck,
  IconClose,
  IconEdit,
  IconFileText,
  IconHeadset,
  IconMinus,
  IconRefresh,
  IconStarRate,
} from "@/components/icons";
import { CategoryTile, STAGE_ICONS, StatusPill, Stars, useComplaintLabels } from "./bits";

type Load<T> = { status: "idle" | "loading" | "ready" | "error"; data: T | null };

type Related = { Icon: ComponentType; title: string; workId: string; href: string } | "loading" | null;

type StepTone = "done" | "now" | "todo" | "rework" | "ok" | "bad" | "end";

const MINUTE = 60_000;

const STEP_MARK: Record<StepTone, ReactNode> = {
  done: <IconCheck />,
  now: null,
  todo: null,
  rework: <IconRefresh />,
  ok: <IconCheck />,
  bad: <IconClose />,
  end: <IconMinus />,
};

function apart(a: string, b: string): boolean {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) > MINUTE;
}

function Step({ tone, label, sub, current }: { tone: StepTone; label: string; sub?: string; current?: boolean }) {
  return (
    <li className={`shks__s shks__s--${tone}`} aria-current={current ? "step" : undefined}>
      <span className="shks__dot" aria-hidden>
        {STEP_MARK[tone]}
      </span>
      <span className="shks__l">{label}</span>
      {sub ? <span className="shks__sub">{sub}</span> : null}
    </li>
  );
}

export default function ComplaintDetail({ item }: { item: ComplaintItem }) {
  const t = useTranslations("portal.client.complaints");
  const tw = useTranslations("portal.client.works");
  const tc = useTranslations("common");
  const locale = useLocale();
  const L = useComplaintLabels();

  const detailRef = item.workId || item.id;
  const wantsDetail = item.kind === "quality" && !!detailRef;
  const [detail, setDetail] = useState<Load<Detail>>(() => ({ status: wantsDetail ? "loading" : "idle", data: null }));
  const [detailTick, setDetailTick] = useState(0);
  const [work, setWork] = useState<Load<WorkRef>>(() => ({ status: item.relatedRef ? "loading" : "idle", data: null }));

  useEffect(() => {
    if (!wantsDetail) return;
    let alive = true;
    getQualityComplaintDetail(detailRef)
      .then((data) => {
        if (alive) setDetail({ status: "ready", data });
      })
      .catch(() => {
        if (alive) setDetail((cur) => (cur.data ? cur : { status: "error", data: null }));
      });
    return () => {
      alive = false;
    };
  }, [wantsDetail, detailRef, detailTick, item.status, item.updatedAt]);

  useEffect(() => {
    if (!item.relatedRef) return;
    let alive = true;
    getWorkRef(item.relatedRef)
      .then((data) => {
        if (alive) setWork({ status: "ready", data });
      })
      .catch(() => {
        if (alive) setWork({ status: "error", data: null });
      });
    return () => {
      alive = false;
    };
  }, [item.relatedRef]);

  function retryDetail() {
    setDetail({ status: "loading", data: null });
    setDetailTick((n) => n + 1);
  }

  const d = detail.data;
  const quality = item.kind === "quality";
  const status = d?.status || item.status;
  const stage = complaintStage(status);
  const decided = stage === "resolved" || stage === "rejected" || stage === "closed";
  const reviewed = decided || stage === "rework";
  const rating = d?.rating ?? 0;
  const lawyerName = personName(d?.lawyerName || item.lawyerName);
  const operatorName = personName(d?.operatorName || item.operatorName);
  const operatorNote = d?.operatorNote || item.operatorNote;
  const updatedAt = d?.updatedAt || item.updatedAt;
  const decidedAt = decided ? d?.resolvedAt || item.resolvedAt || updatedAt : "";
  const changedAt = !decided && apart(updatedAt, item.createdAt) ? updatedAt : "";
  const hint = L.hint({ kind: item.kind, status });
  const tag = L.tag(status);
  const StateIcon = STAGE_ICONS[stage];
  const headLabel = quality ? L.kind("quality") : item.category ? L.category(item.category) : L.kind("manual");
  const decisionMeta = [operatorName && !operatorNote ? t("decisionBy", { name: operatorName }) : "", decidedAt ? dateTimeFull(decidedAt, locale) : ""]
    .filter(Boolean)
    .join(" · ");
  const replyAt = decided ? "" : changedAt;
  const finalTone: StepTone = stage === "resolved" ? "ok" : stage === "rejected" ? "bad" : stage === "closed" ? "end" : stage === "rework" ? "rework" : "todo";
  const workType = (type: string) => (type && tw.has(`type.${type}`) ? tw(`type.${type}`) : humanize(type));

  let related: Related = null;
  if (quality && item.source) {
    related = {
      Icon: item.source === "urgent" ? IconBolt : IconFileText,
      title: d?.workTitle || item.subject || L.source(item.source),
      workId: "",
      href: sourceHref(item.source),
    };
  } else if (item.relatedRef) {
    if (work.status === "loading") related = "loading";
    else if (work.data?.id) {
      const w = work.data;
      related = {
        Icon: w.type === "urgent_advokat" ? IconBolt : w.type === "document_lawyer_work" ? IconFileText : IconBriefcase,
        title: w.title || workType(w.type),
        workId: w.workId,
        href: workHref(w.type),
      };
    } else related = { Icon: IconBriefcase, title: t("relatedId", { id: item.relatedRef }), workId: "", href: "" };
  }

  return (
    <div className="shkd">
      <div className="shkd__id">
        <CategoryTile item={item} />
        <span className="shkd__idtx">
          <b>{headLabel}</b>
          {item.workId ? <span className="wid">{item.workId}</span> : null}
        </span>
        <StatusPill status={status} label={tag} />
      </div>

      <ol className="shks" aria-label={t("timeline")}>
        <Step tone="done" label={t("step.received")} sub={item.createdAt ? dateTimeFull(item.createdAt, locale) : ""} />
        <Step
          tone={reviewed ? "done" : "now"}
          label={t("step.review")}
          sub={reviewed ? "" : stage === "new" ? t("step.queued") : t("step.active")}
          current={!reviewed}
        />
        <Step
          tone={finalTone}
          label={t("step.decision")}
          sub={decided ? tag : stage === "rework" ? L.stage("rework") : ""}
          current={reviewed}
        />
      </ol>

      <div className={`shkd__state shkd__state--${stage}`}>
        <StateIcon aria-hidden />
        <div className="shkd__statetx">
          {decided || stage === "rework" ? <b>{tag}</b> : null}
          <p>{hint}</p>
          {stage === "rejected" ? <p className="shkd__esc">{t("escalate")}</p> : null}
          {decided && decisionMeta ? <small>{decisionMeta}</small> : null}
          {!decided && changedAt ? <small>{t("updatedAt", { date: dateTimeFull(changedAt, locale) })}</small> : null}
        </div>
      </div>

      {operatorNote ? (
        <article className="shkd__reply" aria-label={t("reply.title")}>
          <span className="shkd__av" aria-hidden>
            <IconHeadset />
          </span>
          <div className="shkd__bubble" data-ai-private>
            <span className="shkd__bubbleh">
              <b>{operatorName || t("reply.staff")}</b>
              {replyAt ? <small>{dateTimeFull(replyAt, locale)}</small> : null}
            </span>
            <p>{operatorNote}</p>
          </div>
        </article>
      ) : null}

      {quality ? (
        <section className="shkd__sec">
          <h3 className="shkd__h">
            <IconStarRate aria-hidden />
            {t("comment")}
          </h3>
          {detail.status === "loading" ? (
            <Skeleton rows={1} />
          ) : detail.status === "error" ? (
            <div className="shkd__err" role="alert">
              <span>{t("detailError")}</span>
              <button type="button" className="btn btn--line btn--sm" onClick={retryDetail}>
                <IconRefresh aria-hidden />
                {tc("retry")}
              </button>
            </div>
          ) : (
            <div className="shkd__mine" data-ai-private>
              {rating > 0 ? <Stars n={rating} label={t("ratingAria", { n: rating })} /> : null}
              {d?.comment ? <p>{d.comment}</p> : <p className="shkd__muted">{t("noComment")}</p>}
            </div>
          )}
        </section>
      ) : item.description ? (
        <section className="shkd__sec">
          <h3 className="shkd__h">
            <IconEdit aria-hidden />
            {t("text")}
          </h3>
          <div className="shkd__mine" data-ai-private>
            <p>{item.description}</p>
          </div>
        </section>
      ) : null}

      {related ? (
        <section className="shkd__sec">
          <h3 className="shkd__h">
            <IconBriefcase aria-hidden />
            {t("related")}
          </h3>
          {related === "loading" ? (
            <Skeleton rows={1} />
          ) : (
            <div className="shkd__rel">
              <span className="shkd__relm">
                <span className="shkd__relic" aria-hidden>
                  <related.Icon />
                </span>
                <span className="shkd__relt">
                  <b>{related.title}</b>
                  {related.workId ? <small className="wid">{related.workId}</small> : null}
                  {lawyerName ? <small className="shkd__who">{t("f.lawyer")}: {lawyerName}</small> : null}
                </span>
              </span>
              {related.href ? (
                <Link href={related.href} className="btn btn--line btn--sm">
                  {t("relatedOpen")}
                  <IconArrowRight aria-hidden />
                </Link>
              ) : null}
            </div>
          )}
        </section>
      ) : lawyerName ? (
        <p className="shkd__who">
          {t("f.lawyer")}: {lawyerName}
        </p>
      ) : null}

      <div className="shkd__acts">
        <Link href="/portal/client/support" className="btn btn--line btn--sm">
          <IconChat aria-hidden />
          {t("chatShort")}
        </Link>
      </div>
    </div>
  );
}
