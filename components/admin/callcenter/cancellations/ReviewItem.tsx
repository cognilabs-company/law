"use client";

import { useId, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { aiId } from "@/lib/ai/ids";
import { shortDateTime } from "@/lib/date";
import { saveBlob } from "@/lib/download";
import { humanize } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { getSecureMessageFileAt } from "@/lib/services/backend";
import { reviewOrderOf, reviewPaymentOf, reviewResolutionOf, type CancellationReview, type ChecklistItem, type MarketFileRef, type ReviewAction } from "@/lib/services/marketRuntime";
import type { SxIcon } from "@/components/admin/studio/sx/types";
import {
  RotateCcwIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CoinsIcon,
  DownloadIcon,
  FileTextIcon,
  HandCoinsIcon,
  ListChecksIcon,
  CirclePauseIcon,
  BanIcon,
  StoreIcon,
  CircleUserIcon,
  ArrowRightLeftIcon,
  glyph,
} from "./icons";
import { CCX_AI, checklistSummary, isOpenReview, orderPhaseKey, orderPhaseTone, reviewTone, staffChatHref } from "./model";

export const REVIEW_ACTION_ICON: Readonly<Record<ReviewAction, SxIcon>> = {
  continue: ArrowRightIcon,
  new_price: CoinsIcon,
  cancel: BanIcon,
  reassign: ArrowRightLeftIcon,
  refund: RotateCcwIcon,
};

export function isReviewAction(v: string): v is ReviewAction {
  return v in REVIEW_ACTION_ICON;
}

export type ReviewItemProps = { review: CancellationReview; onResolve: (r: CancellationReview) => void };

function useRemaining(): (seconds: number) => string {
  const tdu = useTranslations("marketplace.orderDetail.duration");
  return (seconds) => {
    const total = Math.max(1, Math.floor(seconds / 60));
    const d = Math.floor(total / 1440);
    const h = Math.floor((total % 1440) / 60);
    const m = total % 60;
    if (d) return [tdu("day", { n: d }), h ? tdu("hour", { n: h }) : ""].filter(Boolean).join(" ");
    if (h) return [tdu("hour", { n: h }), m ? tdu("minute", { n: m }) : ""].filter(Boolean).join(" ");
    return tdu("minute", { n: m });
  };
}

function CheckRow({ item }: { item: ChecklistItem }): ReactElement {
  const tc = useTranslations("marketplace.orderDetail.checklist");
  const icon = item.status === "done" ? CircleCheckIcon : item.status === "skipped_with_reason" ? ArrowRightIcon : CircleDashedIcon;
  return (
    <li className="ccx-check" data-status={item.status}>
      <span className="ccx-check__icon">{glyph(icon, { size: 16 })}</span>
      <div className="ccx-check__body">
        <p className="ccx-check__title">
          <span>{item.title}</span>
          {item.required ? <span className="ccx-chip">{tc("mark.required")}</span> : null}
        </p>
        <p className="ccx-check__status">{tc(`status.${item.status}`)}</p>
        {item.comment.trim() ? <p className="ccx-check__note">{item.comment}</p> : null}
        {item.files.length ? (
          <ul className="ccx-check__files">
            {item.files.map((f, i) => (
              <li key={f.id || f.url || i}>
                {glyph(FileTextIcon, { size: 14 })}
                <span>{f.name || f.id}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function ResultFile({ f, ai }: { f: MarketFileRef; ai: string }): ReactElement {
  const tx = useTranslations("marketplace.orderExtras");
  const tq = useTranslations("admin.callCenter.cancellations");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const name = f.name || tx("result.file");
  async function get() {
    if (busy || !f.url) return;
    setBusy(true);
    setErr(false);
    try {
      saveBlob(await getSecureMessageFileAt(f.url), name);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }
  const verb = busy ? tx("result.downloading") : err ? tx("result.retry") : tx("result.download");
  return (
    <li className="ccx-file">
      {glyph(FileTextIcon, { size: 16 })}
      <span className="ccx-file__name">{name}</span>
      {f.url ? (
        <SxButton size="sm" variant="ghost" icon={DownloadIcon} busy={busy} onClick={() => void get()} aria-label={`${verb}: ${name}`} aiId={ai}>
          {verb}
        </SxButton>
      ) : (
        <span className="ccx-muted">{tq("item.fileNoLink")}</span>
      )}
    </li>
  );
}

export function ReviewItem({ review, onResolve }: ReviewItemProps): ReactElement {
  const t = useTranslations("admin.callCenter.cancellations");
  const tp = useTranslations("marketplace.orderDetail.phase");
  const troles = useTranslations("marketplace.roles");
  const te = useTranslations("enums");
  const locale = useLocale();
  const remaining = useRemaining();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [expanded, setExpanded] = useState(false);
  const ctx = reviewOrderOf(review);
  const pay = reviewPaymentOf(review);
  const res = reviewResolutionOf(review);
  const open = isOpenReview(review);
  const sum = checklistSummary(review.checklist);
  const ai = aiId(`${CCX_AI}.item`, review.id);
  const titleId = `${uid}-title`;
  const detailsId = `${uid}-details`;
  const work = ctx.workId || ctx.serviceTitle || review.id;
  const money = (n: number) => `${fmtUzs(n)} ${te("currency")}`;
  const status = review.status;
  const pill = status ? (t.has(`pill.${status}`) ? t(`pill.${status}`) : humanize(status)) : t("pill.open");
  const phase = orderPhaseKey(ctx.status);
  const phaseLabel = phase ? tp(phase) : ctx.status ? humanize(ctx.status) : "—";
  const roleLabel = ctx.sellerType && troles.has(ctx.sellerType) ? troles(ctx.sellerType) : "";
  const chatHref = staffChatHref(ctx.serviceChatRoomId, ctx.workId, ctx.serviceTitle);
  const groupHref = res ? staffChatHref(res.groupChatRoomId, ctx.workId, ctx.serviceTitle) : "";
  const resolved = !open && !!res;
  const action = res?.action ?? "";
  const payStatus = pay?.status ? (t.has(`item.paymentStatus.${pay.status}`) ? t(`item.paymentStatus.${pay.status}`) : humanize(pay.status)) : "—";

  return (
    <article
      className="ccx-card"
      data-open={open || undefined}
      data-expanded={expanded || undefined}
      data-ai-id={ai}
      data-ai-type="list_item"
      data-ai-entity-type="cancellation_review"
      data-ai-entity-id={review.id}
      data-ai-label={[ctx.workId, ctx.serviceTitle].filter(Boolean).join(" · ") || undefined}
      data-ai-private=""
      aria-labelledby={titleId}
    >
      <header className="ccx-head">
        <div className="ccx-head__top">
          {ctx.workId ? (
            <span className="sx-code" aria-label={t("item.workIdAria")}>
              {ctx.workId}
            </span>
          ) : null}
          <span className="ccx-pill" data-tone={reviewTone(status)}>
            {pill}
          </span>
        </div>
        <h3 id={titleId} className="ccx-head__title">
          {ctx.serviceTitle || t("item.noTitle")}
        </h3>
        <p className="ccx-meta">
          {review.createdAt ? <span>{t("item.requested", { date: shortDateTime(review.createdAt, locale) })}</span> : null}
          {res?.resolvedAt ? <span>{t("item.resolvedAt", { date: shortDateTime(res.resolvedAt, locale) })}</span> : null}
        </p>
      </header>

      <div className="ccx-main">
        <div className="ccx-reason">
          <p className="ccx-label">{t("item.reason")}</p>
          {review.reason.trim() ? <p className="ccx-reason__text">{review.reason}</p> : <p className="ccx-reason__text ccx-muted">{t("item.noReason")}</p>}
        </div>
        <div className="ccx-parties">
          <div className="ccx-party">
            <span className="ccx-party__icon">{glyph(CircleUserIcon, { size: 20 })}</span>
            <div className="ccx-party__body">
              <p className="ccx-label">{t("item.client")}</p>
              <p className="ccx-party__name">{ctx.clientName || "—"}</p>
              {ctx.clientPhone ? (
                <a className="sx-link ccx-tel" href={`tel:${ctx.clientPhone}`}>
                  {ctx.clientPhone}
                </a>
              ) : null}
            </div>
          </div>
          <div className="ccx-party">
            <span className="ccx-party__icon">{glyph(StoreIcon, { size: 20 })}</span>
            <div className="ccx-party__body">
              <p className="ccx-label">{t("item.seller")}</p>
              <p className="ccx-party__name">
                {ctx.sellerName || "—"}
                {roleLabel ? <span className="ccx-muted"> · {roleLabel}</span> : null}
              </p>
              {ctx.sellerPhone ? (
                <a className="sx-link ccx-tel" href={`tel:${ctx.sellerPhone}`}>
                  {ctx.sellerPhone}
                </a>
              ) : null}
            </div>
          </div>
        </div>
        {resolved && res ? (
          <div className="ccx-outcome">
            <p className="ccx-label">{t("item.outcome")}</p>
            <p className="ccx-outcome__act">
              {isReviewAction(action) ? glyph(REVIEW_ACTION_ICON[action], { size: 16 }) : null}
              <span>{action && t.has(`action.${action}`) ? t(`action.${action}`) : action ? humanize(action) : t("outcome.other")}</span>
            </p>
            {action === "new_price" && res.amount > 0 ? <p>{t("item.outcomeAmount", { price: money(res.amount) })}</p> : null}
            {action === "reassign" && res.lawyerName ? <p>{t("item.outcomeSeller", { name: res.lawyerName })}</p> : null}
            {res.note.trim() ? (
              <p>
                <span className="ccx-muted">{t("item.outcomeNote")}: </span>
                {res.note}
              </p>
            ) : null}
            {res.resolvedByName ? <p className="ccx-muted">{t("item.resolvedBy", { name: res.resolvedByName })}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="ccx-side">
        <dl className="ccx-facts">
          <div>
            <dt>{t("item.price")}</dt>
            <dd className="sx-num">{ctx.price > 0 ? money(ctx.price) : "—"}</dd>
          </div>
          <div>
            <dt>{t("item.orderStatus")}</dt>
            <dd>
              <span className="ccx-pill" data-tone={orderPhaseTone(phase)}>
                {phaseLabel}
              </span>
            </dd>
          </div>
          <div>
            <dt>{t("item.deadline")}</dt>
            <dd>
              {ctx.deadlinePaused ? (
                <>
                  <span className="ccx-paused">
                    {glyph(CirclePauseIcon, { size: 16 })}
                    <span>{t("item.deadlinePaused")}</span>
                  </span>
                  {ctx.expectedCompletedAt ? <span className="ccx-sub">{t("item.deadlineWas", { date: shortDateTime(ctx.expectedCompletedAt, locale) })}</span> : null}
                  {ctx.remainingSeconds !== null && ctx.remainingSeconds > 0 ? <span className="ccx-sub">{t("item.remaining", { time: remaining(ctx.remainingSeconds) })}</span> : null}
                </>
              ) : ctx.expectedCompletedAt ? (
                shortDateTime(ctx.expectedCompletedAt, locale)
              ) : (
                "—"
              )}
            </dd>
          </div>
          {ctx.startedAt ? (
            <div>
              <dt>{t("item.started")}</dt>
              <dd>{shortDateTime(ctx.startedAt, locale)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="ccx-acts">
          {open ? (
            <SxButton variant="primary" icon={ArrowRightIcon} aria-label={t("item.resolveAria", { work })} aiId={`${ai}.resolve`} aiLabel={t("item.resolve")} onClick={() => onResolve(review)}>
              {t("item.resolve")}
            </SxButton>
          ) : null}
          {chatHref ? (
            <SxLinkButton variant="secondary" icon={MessageSquareTextIcon} href={chatHref} target="_blank" aiId={`${ai}.chat`} aiLabel={t("item.serviceChat")}>
              {t("item.serviceChat")}
              <span className="sx-vh"> ({t("item.newTab")})</span>
            </SxLinkButton>
          ) : (
            <p className="ccx-muted ccx-nochat">{t("item.noChat")}</p>
          )}
          {resolved && groupHref ? (
            <SxLinkButton variant="secondary" icon={MessagesSquareIcon} href={groupHref} target="_blank" aiId={`${ai}.group-chat`} aiLabel={t("item.groupChat")}>
              {t("item.groupChat")}
              <span className="sx-vh"> ({t("item.newTab")})</span>
            </SxLinkButton>
          ) : null}
        </div>
      </div>

      <div className="ccx-more">
        <SxButton
          variant="ghost"
          size="sm"
          iconEnd={expanded ? ChevronUpIcon : ChevronDownIcon}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={t("item.moreAria", { work })}
          aiId={`${ai}.details`}
          aiLabel={expanded ? t("item.less") : t("item.more")}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t("item.less") : t("item.more")}
        </SxButton>
        <div id={detailsId} className="ccx-details" hidden={!expanded}>
          <section aria-labelledby={`${uid}-ck`} className="ccx-sec">
            <h4 id={`${uid}-ck`} className="ccx-sec__title">
              {glyph(ListChecksIcon, { size: 16 })}
              <span>{t("item.checklist")}</span>
            </h4>
            {review.checklist.length ? (
              <>
                <p className="ccx-sub">
                  {t("item.checklistProgress", { done: sum.done, total: sum.total })}
                  {sum.requiredTotal > 0 ? ` · ${t("item.checklistRequired", { done: sum.requiredDone, total: sum.requiredTotal })}` : ""}
                </p>
                <ul className="ccx-checks">
                  {review.checklist.map((item, i) => (
                    <CheckRow key={item.id || i} item={item} />
                  ))}
                </ul>
              </>
            ) : (
              <p className="ccx-muted">{t("item.checklistEmpty")}</p>
            )}
          </section>
          <section aria-labelledby={`${uid}-pay`} className="ccx-sec">
            <h4 id={`${uid}-pay`} className="ccx-sec__title">
              {glyph(HandCoinsIcon, { size: 16 })}
              <span>{t("item.payment")}</span>
            </h4>
            {pay ? (
              <dl className="ccx-facts ccx-facts--inline">
                <div>
                  <dt>{t("item.paymentStatusLabel")}</dt>
                  <dd>{payStatus}</dd>
                </div>
                {pay.amount > 0 ? (
                  <div>
                    <dt>{t("item.paymentAmount")}</dt>
                    <dd className="sx-num">{money(pay.amount)}</dd>
                  </div>
                ) : null}
                {pay.paidAmount > 0 ? (
                  <div>
                    <dt>{t("item.paymentPaid")}</dt>
                    <dd className="sx-num">{money(pay.paidAmount)}</dd>
                  </div>
                ) : null}
                {pay.reason ? (
                  <div>
                    <dt>{t("item.paymentReason")}</dt>
                    <dd>{pay.reason}</dd>
                  </div>
                ) : null}
                {pay.requests > 1 ? (
                  <div>
                    <dt>{t("item.paymentCount")}</dt>
                    <dd className="sx-num">{pay.requests}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="ccx-muted">{t("item.paymentNone")}</p>
            )}
          </section>
          <section aria-labelledby={`${uid}-files`} className="ccx-sec">
            <h4 id={`${uid}-files`} className="ccx-sec__title">
              {glyph(FileTextIcon, { size: 16 })}
              <span>{t("item.files")}</span>
            </h4>
            {review.resultFiles.length ? (
              <ul className="ccx-files">
                {review.resultFiles.map((f, i) => (
                  <ResultFile key={f.id || f.url || i} f={f} ai={aiId(ai, "file", i)} />
                ))}
              </ul>
            ) : (
              <p className="ccx-muted">{t("item.filesEmpty")}</p>
            )}
          </section>
        </div>
      </div>
    </article>
  );
}
