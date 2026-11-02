"use client";

import "./WcDecide.css";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import PersonName from "@/components/ui/PersonName";
import { shortDateTime } from "@/lib/date";
import { saveBlob } from "@/lib/download";
import { fmtUzs } from "@/lib/money";
import { getSecureMessageFileAt } from "@/lib/services/backend";
import type { ChecklistItem, MarketFileRef, ReviewHistoryItem, ReviewOrderContext, ReviewPayment, ReviewResolutionInfo, ReviewResolution } from "@/lib/services/marketRuntime";
import { checklistSummary } from "@/components/admin/callcenter/cancellations/model";
import { Note, Section } from "../../panel/bits";
import { IcArrowRight, IcCheck, IcClock, IcCoins, IcDoc, IcTimeline } from "../../icons";

export type CancelDoneInfo = { res: ReviewResolution; action: string; amount: number; sellerName: string };

export function useMoney(): (n: number) => string {
  const te = useTranslations("enums");
  return (n) => `${fmtUzs(n)} ${te("currency")}`;
}

export function DeadlineAside({ ctx }: { ctx: ReviewOrderContext }) {
  const t = useTranslations("admin.callCenter.cancellations");
  const tdu = useTranslations("marketplace.orderDetail.duration");
  const locale = useLocale();
  const remaining = (seconds: number) => {
    const total = Math.max(1, Math.floor(seconds / 60));
    const d = Math.floor(total / 1440);
    const h = Math.floor((total % 1440) / 60);
    const m = total % 60;
    if (d) return [tdu("day", { n: d }), h ? tdu("hour", { n: h }) : ""].filter(Boolean).join(" ");
    if (h) return [tdu("hour", { n: h }), m ? tdu("minute", { n: m }) : ""].filter(Boolean).join(" ");
    return tdu("minute", { n: m });
  };
  return (
    <div className="opx-cx-dl" data-paused={ctx.deadlinePaused || undefined}>
      {ctx.deadlinePaused || ctx.expectedCompletedAt ? <small>{t("item.deadline")}</small> : null}
      {ctx.deadlinePaused ? (
        <>
          <b>
            <IcClock size={16} />
            {t("item.deadlinePaused")}
          </b>
          {ctx.expectedCompletedAt ? <small>{t("item.deadlineWas", { date: shortDateTime(ctx.expectedCompletedAt, locale) })}</small> : null}
          {ctx.remainingSeconds !== null && ctx.remainingSeconds > 0 ? <small>{t("item.remaining", { time: remaining(ctx.remainingSeconds) })}</small> : null}
        </>
      ) : ctx.expectedCompletedAt ? (
        <b className="opx-num">{shortDateTime(ctx.expectedCompletedAt, locale)}</b>
      ) : null}
      {ctx.startedAt ? <small className="opx-num">{`${t("item.started")}: ${shortDateTime(ctx.startedAt, locale)}`}</small> : null}
    </div>
  );
}

function ResultFile({ f }: { f: MarketFileRef }) {
  const tx = useTranslations("marketplace.orderExtras");
  const t = useTranslations("admin.callCenter.cancellations");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const name = f.name || tx("result.file");

  const get = async () => {
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
  };

  if (!f.url) {
    return (
      <span className="opx-file is-nolink">
        <IcDoc size={16} />
        <span>{name}</span>
        <small>{t("item.fileNoLink")}</small>
      </span>
    );
  }
  const verb = busy ? tx("result.downloading") : err ? tx("result.retry") : tx("result.download");
  return (
    <button type="button" className="opx-file" onClick={() => void get()} disabled={busy} aria-busy={busy} aria-label={`${verb}: ${name}`} data-err={err || undefined}>
      <IcDoc size={16} />
      <span>{name}</span>
      <small>{verb}</small>
    </button>
  );
}

export function FilesRow({ files }: { files: MarketFileRef[] }) {
  const t = useTranslations("admin.callCenter.cancellations");
  return (
    <Section icon={<IcDoc size={17} />} title={t("item.files")} count={files.length} className="opx-cx-files">
      {files.length ? (
        <div className="opx-files">
          {files.map((f, i) => (
            <ResultFile key={f.id || f.url || i} f={f} />
          ))}
        </div>
      ) : (
        <p className="opx-pnone">{t("item.filesEmpty")}</p>
      )}
    </Section>
  );
}

function HistoryStep({ h, last }: { h: ReviewHistoryItem; last: boolean }) {
  const t = useTranslations("admin.callCenter.cancellations");
  const locale = useLocale();
  const word = h.action || h.type || h.status;
  const label = t.has(`history.type.${word}`) ? t(`history.type.${word}`) : t.has(`action.${word}`) ? t(`action.${word}`) : t("history.event");
  const role = h.actor?.role && t.has(`history.role.${h.actor.role}`) ? t(`history.role.${h.actor.role}`) : "";
  return (
    <li className={last ? "is-last" : undefined}>
      <time className="opx-num" dateTime={h.at}>
        {h.at ? shortDateTime(h.at, locale) : ""}
      </time>
      <span>
        <b>{label}</b>
        {h.actor ? (
          <small>
            {t("history.by")} <PersonName id={h.actor.id} name={h.actor.name} />
            {role ? ` · ${role}` : ""}
          </small>
        ) : null}
        {h.fromSeller || h.toSeller ? (
          <small>
            {h.fromSeller ? <PersonName id={h.fromSeller.id} name={h.fromSeller.name} /> : t("history.unknown")} → {h.toSeller ? <PersonName id={h.toSeller.id} name={h.toSeller.name} /> : t("history.unknown")}
          </small>
        ) : null}
        {h.clientReason.trim() ? <small>{t("history.clientReason", { text: h.clientReason })}</small> : null}
        {h.note.trim() ? <small>{h.note}</small> : null}
      </span>
    </li>
  );
}

export function HistorySection({ items }: { items: ReviewHistoryItem[] }) {
  const t = useTranslations("admin.callCenter.cancellations");
  return (
    <Section icon={<IcTimeline size={17} />} title={t("history.title")} count={items.length}>
      {items.length ? (
        <ol className="opx-tl">
          {items.map((h, i) => (
            <HistoryStep key={h.id || `${h.at}-${i}`} h={h} last={i === items.length - 1} />
          ))}
        </ol>
      ) : (
        <p className="opx-pnone">{t("history.empty")}</p>
      )}
    </Section>
  );
}

export function ChecklistSection({ items }: { items: ChecklistItem[] }) {
  const t = useTranslations("admin.callCenter.cancellations");
  const tc = useTranslations("marketplace.orderDetail.checklist");
  const tcm = useTranslations("common");
  const sum = checklistSummary(items);
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
  return (
    <Section icon={<IcCheck size={17} />} title={t("item.checklist")} count={sum.total}>
      {items.length ? (
        <>
          <div className="opx-cx-prog">
            <span className="opx-cx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={sum.total} aria-valuenow={sum.done} aria-label={t("item.checklist")}>
              <i style={{ width: `${pct}%` }} />
            </span>
            <small className="opx-num">
              {t("item.checklistProgress", { done: sum.done, total: sum.total })}
              {sum.requiredTotal > 0 ? ` · ${t("item.checklistRequired", { done: sum.requiredDone, total: sum.requiredTotal })}` : ""}
            </small>
          </div>
          <ul className="opx-cx-checks">
            {items.map((it, i) => (
              <li key={it.id || i} data-status={it.status}>
                <span className="opx-cx-checks__ic" aria-hidden="true">
                  {it.status === "done" ? <IcCheck size={13} /> : it.status === "skipped_with_reason" ? <IcArrowRight size={13} /> : null}
                </span>
                <span>
                  <b>
                    {it.title}
                    {it.required ? <em className="opx-cx-tag">{tc("mark.required")}</em> : null}
                  </b>
                  <small>
                    {tc(`status.${it.status}`)}
                    {it.comment.trim() ? ` · ${it.comment}` : ""}
                  </small>
                  {it.files.length ? <small>{it.files.map((f) => f.name || tcm("file")).join(", ")}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="opx-pnone">{t("item.checklistEmpty")}</p>
      )}
    </Section>
  );
}

export function PaymentSection({ pay }: { pay: ReviewPayment | null }) {
  const t = useTranslations("admin.callCenter.cancellations");
  const tc = useTranslations("admin.ccx.cases");
  const none = useTranslations("common")("none");
  const money = useMoney();
  const status = pay?.status ? (t.has(`item.paymentStatus.${pay.status}`) ? t(`item.paymentStatus.${pay.status}`) : tc("other")) : none;
  return (
    <Section icon={<IcCoins size={17} />} title={t("item.payment")}>
      {pay ? (
        <dl className="opx-cx-kv">
          <div>
            <dt>{t("item.paymentStatusLabel")}</dt>
            <dd>{status}</dd>
          </div>
          {pay.amount > 0 ? (
            <div>
              <dt>{t("item.paymentAmount")}</dt>
              <dd className="opx-num">{money(pay.amount)}</dd>
            </div>
          ) : null}
          {pay.paidAmount > 0 ? (
            <div>
              <dt>{t("item.paymentPaid")}</dt>
              <dd className="opx-num">{money(pay.paidAmount)}</dd>
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
              <dd className="opx-num">{pay.requests}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="opx-pnone">{t("item.paymentNone")}</p>
      )}
    </Section>
  );
}

export function OutcomeSection({ res, clientReason }: { res: ReviewResolutionInfo; clientReason: string }) {
  const t = useTranslations("admin.callCenter.cancellations");
  const tc = useTranslations("admin.ccx.cases");
  const money = useMoney();
  const action = res.action;
  const label = action && t.has(`action.${action}`) ? t(`action.${action}`) : tc("other");
  return (
    <Section icon={<IcCheck size={17} />} title={t("item.outcome")}>
      <div className="opx-cx-out">
        <span className="opx-pill" data-tone={action === "cancel" || action === "refund" ? "hot" : "ok"}>
          {label}
        </span>
        {action === "new_price" && res.amount > 0 ? <p>{t("item.outcomeAmount", { price: money(res.amount) })}</p> : null}
        {action === "reassign" && res.lawyerName ? <p>{t("item.outcomeSeller", { name: res.lawyerName })}</p> : null}
        {clientReason.trim() ? (
          <p>
            <b>{t("item.clientReason")}: </b>
            {clientReason}
          </p>
        ) : null}
        {res.note.trim() ? (
          <p>
            <b>{t("item.outcomeNote")}: </b>
            {res.note}
          </p>
        ) : null}
        {res.resolvedByName ? <p>{t("item.resolvedBy", { name: res.resolvedByName })}</p> : null}
      </div>
    </Section>
  );
}

export function outcomeKey(action: string, has: (k: string) => boolean): string {
  return has(`outcome.${action}`) ? `outcome.${action}` : "outcome.other";
}

export function CancelDone({ done }: { done: CancelDoneInfo }) {
  const t = useTranslations("admin.callCenter.cancellations");
  const money = useMoney();
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    head.current?.focus({ preventScroll: true });
  }, []);
  const a = done.action;
  return (
    <section className="opx-cx-done" role="status">
      <span className="opx-cx-done__ic" aria-hidden="true">
        <IcCheck size={30} />
      </span>
      <h3 tabIndex={-1} ref={head}>
        {t("done.title")}
      </h3>
      <p className="opx-cx-done__p">{t(outcomeKey(a, (k) => t.has(k)))}</p>
      {a === "new_price" && done.amount > 0 ? <p className="opx-cx-done__p">{t("item.outcomeAmount", { price: money(done.amount) })}</p> : null}
      {a === "reassign" && done.sellerName ? <p className="opx-cx-done__p">{t("item.outcomeSeller", { name: done.sellerName })}</p> : null}
      {t.has(`done.next.${a}`) ? <Note tone="info">{t(`done.next.${a}`)}</Note> : null}
      {done.res.raw.idempotent_replay === true ? <Note tone="warn">{t("done.replay")}</Note> : null}
    </section>
  );
}
