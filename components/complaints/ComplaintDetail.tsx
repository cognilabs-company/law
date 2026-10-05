"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { dateTimeFull } from "@/lib/date";
import { humanize, personName } from "@/lib/labels";
import {
  complaintPhase,
  getQualityComplaintDetail,
  getWorkRef,
  sourceHref,
  workHref,
  type ComplaintDetail as Detail,
  type ComplaintItem,
  type WorkRef,
} from "@/lib/services/complaints";
import { Skeleton } from "@/components/portal/DataState";
import { IconArrowRight, IconBolt, IconBriefcase, IconChat, IconCheck, IconFileText, IconRefresh } from "@/components/icons";
import { KindBadge, StatusPill, Stars, useComplaintLabels } from "./bits";

type Load<T> = { status: "idle" | "loading" | "ready" | "error"; data: T | null };

type Related = { Icon: ComponentType; title: string; workId: string; href: string } | "loading" | null;

const MINUTE = 60_000;

function apart(a: string, b: string): boolean {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) > MINUTE;
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
  const status = d?.status || item.status;
  const phase = complaintPhase(status);
  const decided = phase !== "open";
  const rating = d?.rating ?? 0;
  const lawyerName = personName(d?.lawyerName || item.lawyerName);
  const operatorName = personName(d?.operatorName || item.operatorName);
  const operatorNote = d?.operatorNote || item.operatorNote;
  const updatedAt = d?.updatedAt || item.updatedAt;
  const decidedAt = decided ? d?.resolvedAt || item.resolvedAt || updatedAt : "";
  const hint = L.hint({ kind: item.kind, status });
  const sentLabel = item.kind === "quality" ? (rating > 0 ? t("tl.opened", { n: rating }) : t("tl.openedPlain")) : t("tl.sent");
  const decidedMeta = [operatorName ? t("decisionBy", { name: operatorName }) : "", decidedAt ? dateTimeFull(decidedAt, locale) : ""].filter(Boolean).join(" · ");
  const workType = (type: string) => (type && tw.has(`type.${type}`) ? tw(`type.${type}`) : humanize(type));

  let related: Related = null;
  if (item.kind === "quality" && item.source) {
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
      <div className="shkd__head">
        <KindBadge kind={item.kind} label={L.kind(item.kind)} />
        <StatusPill status={status} label={L.status(status)} />
        {item.workId ? <span className="wid">{item.workId}</span> : null}
      </div>

      <dl className="shkd__facts">
        {item.kind === "manual" && item.category ? (
          <>
            <dt>{t("f.category")}</dt>
            <dd>{L.category(item.category)}</dd>
          </>
        ) : null}
        {item.kind === "quality" && item.source ? (
          <>
            <dt>{t("f.source")}</dt>
            <dd>{L.source(item.source)}</dd>
          </>
        ) : null}
        {rating > 0 ? (
          <>
            <dt>{t("f.rating")}</dt>
            <dd>
              <Stars n={rating} label={t("ratingAria", { n: rating })} />
            </dd>
          </>
        ) : null}
        {lawyerName ? (
          <>
            <dt>{t("f.lawyer")}</dt>
            <dd>{lawyerName}</dd>
          </>
        ) : null}
        {item.createdAt ? (
          <>
            <dt>{t("f.created")}</dt>
            <dd>{dateTimeFull(item.createdAt, locale)}</dd>
          </>
        ) : null}
        {apart(updatedAt, item.createdAt) ? (
          <>
            <dt>{t("f.updated")}</dt>
            <dd>{dateTimeFull(updatedAt, locale)}</dd>
          </>
        ) : null}
      </dl>

      {item.kind === "manual" ? (
        item.description ? (
          <section className="shkd__b">
            <b>{t("text")}</b>
            <p>{item.description}</p>
          </section>
        ) : null
      ) : detail.status === "loading" ? (
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
        <section className="shkd__b">
          <b>{t("comment")}</b>
          {d?.comment ? <p>{d.comment}</p> : <p className="shkd__muted">{t("noComment")}</p>}
        </section>
      )}

      <section className="shkd__sec">
        <b className="shkd__h">{t("timeline")}</b>
        <ol className="shkt">
          <li className="shkt__s shkt__s--done">
            <span className="shkt__dot" aria-hidden>
              <IconCheck />
            </span>
            <div className="shkt__m">
              <b>{sentLabel}</b>
              {item.createdAt ? <small>{dateTimeFull(item.createdAt, locale)}</small> : null}
            </div>
          </li>
          <li className={`shkt__s shkt__s--${decided ? "done" : "current"}`} aria-current={decided ? undefined : "step"}>
            <span className="shkt__dot" aria-hidden>
              {decided ? <IconCheck /> : null}
            </span>
            <div className="shkt__m">
              <b>{t("tl.review")}</b>
              {!decided && hint ? <p>{hint}</p> : null}
            </div>
          </li>
          <li
            className={`shkt__s ${decided ? `shkt__s--done shkt__s--${phase}` : "shkt__s--todo"}`}
            aria-current={decided ? "step" : undefined}
          >
            <span className="shkt__dot" aria-hidden>
              {decided ? <IconCheck /> : null}
            </span>
            <div className="shkt__m">
              <b>{decided ? L.status(status) : t("tl.decision")}</b>
              {decided && hint ? <p>{hint}</p> : null}
              {decided && operatorNote ? <p className="shkt__note">{operatorNote}</p> : null}
              {decided && decidedMeta ? <small>{decidedMeta}</small> : null}
            </div>
          </li>
        </ol>
      </section>

      {related ? (
        <section className="shkd__sec">
          <b className="shkd__h">{t("related")}</b>
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
