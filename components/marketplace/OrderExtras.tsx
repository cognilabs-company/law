"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { IconAlert, IconCheck, IconCoins, IconDownload, IconFileText, IconHourglass, IconPause, IconStarRate } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import { saveBlob } from "@/lib/download";
import { getSecureMessageFileAt } from "@/lib/services/backend";
import { fileOrderComplaint, marketErrorCode, rateMarketplaceOrder, type MarketOrder, type OrderOption, type ResultFile } from "@/lib/services/marketplace";
import { useMarketError } from "./useMarketError";
import { useGuardedField } from "@/components/ui/ContactGuardNote";

const RESULT_MAX = 4000;

export function useTick(active: boolean, stepMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, stepMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, stepMs]);
  return now;
}

const leftMs = (iso: string, now: number) => (iso && now ? new Date(iso).getTime() - now : NaN);

export const ratingLeftMs = (r: Pick<MarketOrder["rating"], "expiresAt" | "deadlineAt">, now: number) => (r.expiresAt > 0 && now ? r.expiresAt - now : leftMs(r.deadlineAt, now));

function useLeftLabel() {
  const t = useTranslations("marketplace.orderExtras");
  return (ms: number, withSeconds: boolean) => {
    if (!Number.isFinite(ms)) return "";
    if (ms <= 0) return t("timeUp");
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (withSeconds && h === 0) return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return h ? t("hoursLeft", { h, m }) : t("minutesLeft", { m: Math.max(1, m) });
  };
}

export function OptionLines({ options, title }: { options: OrderOption[]; title: string }) {
  if (!options.length) return null;
  return (
    <div className="mko__opts">
      <small>{title}</small>
      <ul>
        {options.map((o, i) => (
          <li key={`${o.id}-${i}`}>
            <IconCheck aria-hidden="true" />
            <span>{o.label || o.id}</span>
            {o.amount ? <b>+{fmtUzs(o.amount)}</b> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SupplementalPanel({ o, view }: { o: MarketOrder; view: "client" | "seller" }) {
  const t = useTranslations("marketplace.orderExtras");
  const left = useLeftLabel();
  const s = o.supplemental;
  const pending = s?.status === "pending";
  const now = useTick(pending && !!s?.expiresAt, 30_000);
  if (!s) return null;
  const remain = leftMs(s.expiresAt, now);
  const warn = pending && Number.isFinite(remain) && remain < 3 * 3600_000;
  return (
    <div className={`mko__sup is-${s.status}${warn ? " is-warn" : ""}`} role="status" data-ai-id={`marketplace.orders.supplemental.${o.id}`} data-ai-type="section" data-ai-label={t(`sup.${s.status}`)}>
      <div className="mko__suph">
        <span className="mko__supi" aria-hidden="true">
          {pending ? <IconPause /> : s.status === "approved" ? <IconCheck /> : s.status === "rejected" || s.status === "cancelled" ? <IconAlert /> : <IconHourglass />}
        </span>
        <div>
          <b>{t(`sup.${s.status}`)}</b>
          <p>{pending ? (view === "client" ? t("sup.pendingClient") : t("sup.pendingSeller")) : t(`sup.${s.status}Text`)}</p>
        </div>
        {pending && s.expiresAt ? (
          <em className="mko__left">
            <IconHourglass aria-hidden="true" />
            {left(remain, false) || "—"}
          </em>
        ) : null}
      </div>
      <OptionLines options={s.options} title={t("sup.options")} />
      <div className="mko__supsum">
        {s.amount ? (
          <span>
            <IconCoins aria-hidden="true" />
            {t("sup.amount")}: <b>{fmtUzs(s.amount)}</b>
          </span>
        ) : null}
        {s.newTotal ? (
          <span>
            {t("sup.newTotal")}: <b>{fmtUzs(s.newTotal)}</b>
          </span>
        ) : null}
      </div>
      {s.note ? <blockquote className="mko__supnote">{s.note}</blockquote> : null}
    </div>
  );
}

function FileButton({ f }: { f: ResultFile }) {
  const t = useTranslations("marketplace.orderExtras");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  async function get() {
    if (busy || !f.downloadUrl) return;
    setBusy(true);
    setErr(false);
    try {
      saveBlob(await getSecureMessageFileAt(f.downloadUrl), f.fileName || "result");
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li>
      <IconFileText aria-hidden="true" />
      <span>{f.fileName || t("result.file")}</span>
      <button type="button" className="btn btn--line btn--sm" disabled={busy || !f.downloadUrl} onClick={() => void get()}>
        <IconDownload aria-hidden="true" />
        {busy ? t("result.downloading") : err ? t("result.retry") : t("result.download")}
      </button>
    </li>
  );
}

export function ResultBlock({ o }: { o: MarketOrder }) {
  const t = useTranslations("marketplace.orderExtras");
  if (!o.resultText && !o.resultFiles.length) return null;
  return (
    <section className="mko__res" data-ai-id={`marketplace.orders.result.${o.id}`} data-ai-type="section" data-ai-label={t("result.title")} data-ai-private>
      <b className="mko__resh">
        <IconCheck aria-hidden="true" />
        {t("result.title")}
      </b>
      {o.resultText ? <p className="mko__rest">{o.resultText.slice(0, RESULT_MAX)}</p> : null}
      {o.resultFiles.length ? (
        <ul className="mko__files">
          {o.resultFiles.map((f, i) => (
            <FileButton key={`${f.fileId}-${i}`} f={f} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const COMPLAINT_MIN = 10;
const COMPLAINT_MAX = 2000;
const FILED = new Set(["open", "pending", "submitted", "in_review", "under_review", "created"]);

// A complaint about the delivered service: its own action beside the
// rating, offered only while the backend says `complaint.available` (the
// same 15-minute window). A 1–2 star rating already opens one, so it is not
// offered again; once filed it waits for the call center.
export function ComplaintPanel({ o, onFiled }: { o: MarketOrder; onFiled: () => void }) {
  const t = useTranslations("marketplace.orderExtras.complaint");
  const marketErr = useMarketError();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [err, setErr] = useState("");
  const [filed, setFiled] = useState(false);
  const [closed, setClosed] = useState(false);
  const fieldId = useId();
  const lowRated = o.rating.value > 0 && o.rating.value <= 2;
  if (filed || FILED.has(o.complaint.status) || (lowRated && o.complaint.status !== "")) {
    return (
      <p className="mko__cmp is-filed" role="status">
        <IconHourglass aria-hidden="true" />
        <span>{t("pending")}</span>
      </p>
    );
  }
  if (closed) return <Notice ok={false} msg={err || t("closed")} />;
  if (!o.complaint.available || lowRated) return null;
  const short = reason.trim().length < COMPLAINT_MIN;

  async function submit() {
    if (busy || sending.current || short) return;
    sending.current = true;
    setBusy(true);
    setErr("");
    try {
      await fileOrderComplaint(o, reason);
      setFiled(true);
      onFiled();
    } catch (e) {
      sending.current = false;
      const code = marketErrorCode(e);
      setErr(marketErr(e, t("error")));
      if (code === "complaint_window_closed" || code === "rating_window_closed") setClosed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mko__cmp">
        <span>{t("lead")}</span>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen(true)} data-ai-id={`marketplace.orders.complaint.${o.id}.open`}>
          <IconAlert aria-hidden="true" />
          {t("open")}
        </button>
      </div>
    );
  }
  return (
    <section className="mko__cmp is-open" data-ai-id={`marketplace.orders.complaint.${o.id}`} data-ai-type="section" data-ai-label={t("title")}>
      <label htmlFor={fieldId}>
        <b>{t("title")}</b>
      </label>
      <textarea id={fieldId} rows={4} maxLength={COMPLAINT_MAX} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("placeholder")} aria-describedby={`${fieldId}-h`} />
      <small id={`${fieldId}-h`}>{t("hint", { n: COMPLAINT_MIN })}</small>
      {err ? <Notice ok={false} msg={err} /> : null}
      <div className="mko__cmpa">
        <button type="button" className="btn btn--soft btn--sm" onClick={() => setOpen(false)} disabled={busy}>
          {t("cancel")}
        </button>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => void submit()} disabled={busy || short}>
          {busy ? t("sending") : t("send")}
        </button>
      </div>
    </section>
  );
}

export function RatingPanel({ o, onRated }: { o: MarketOrder; onRated: () => void }) {
  const t = useTranslations("marketplace.orderExtras");
  const marketErr = useMarketError();
  const left = useLeftLabel();
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const commentGuard = useGuardedField(comment, setComment);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [closed, setClosed] = useState(false);
  const [sent, setSent] = useState(0);
  const errId = useId();
  const submitBtn = useRef<HTMLButtonElement>(null);
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (!refocus) return;
    const at = document.activeElement;
    if (!at || at === document.body) submitBtn.current?.focus();
  }, [refocus]);
  const open = o.rating.canRate && !o.rating.value && !closed && !sent;
  const timed = o.rating.expiresAt > 0 || !!o.rating.deadlineAt;
  const now = useTick(open && timed, 1000);
  const given = sent || o.rating.value;

  if (given) {
    return (
      <div className="mko__rated" role="status">
        <span className="mko__stars is-static" aria-label={t("rating.given", { n: given })}>
          {[1, 2, 3, 4, 5].map((n) => (
            <IconStarRate key={n} className={n <= given ? "is-on" : ""} aria-hidden="true" />
          ))}
        </span>
        <span>{sent ? t("rating.thanks") : t("rating.given", { n: given })}</span>
        {given <= 2 ? <small>{t("rating.complaintMade")}</small> : null}
      </div>
    );
  }
  if (closed) return <Notice ok={false} msg={err || t("rating.closed")} />;
  if (!o.rating.canRate) return null;

  const remain = ratingLeftMs(o.rating, now);
  if (Number.isFinite(remain) && remain <= 0 && !busy) return <Notice ok={false} msg={t("rating.closed")} />;
  const low = value > 0 && value <= 2;
  const shown = hover || value;

  async function submit() {
    if (busy || !value || (low && !comment.trim())) return;
    setBusy(true);
    setErr("");
    try {
      await rateMarketplaceOrder(o, { rating: value, comment });
      setSent(value);
      onRated();
    } catch (e) {
      const msg = marketErr(e, t("rating.error"));
      if (marketErrorCode(e) === "rating_window_closed") {
        setErr(msg);
        setClosed(true);
      } else {
        setErr(msg);
        setRefocus((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mko__rate" data-ai-id={`marketplace.orders.rating.${o.id}`} data-ai-type="section" data-ai-label={t("rating.title")}>
      <div className="mko__rateh">
        <b>{t("rating.title")}</b>
        {timed ? (
          <>
            <span className="sr-only">{t("rating.timeLeft")}</span>
            <em className={`mko__left${Number.isFinite(remain) && remain < 3 * 60_000 ? " is-warn" : ""}`} aria-live="off">
              <IconHourglass aria-hidden="true" />
              {left(remain, true) || "—"}
            </em>
          </>
        ) : null}
      </div>
      <p className="mko__ratel">{t("rating.lead")}</p>
      <div className="mko__stars" role="radiogroup" aria-label={t("rating.title")} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t("rating.star", { n })}
            className={n <= shown ? "is-on" : ""}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => setValue(n)}
            data-ai-id={`marketplace.orders.rating.${o.id}.star.${n}`}
          >
            <IconStarRate aria-hidden="true" />
          </button>
        ))}
        {shown ? <span className="mko__starl">{t(`rating.labels.${shown}`)}</span> : null}
      </div>
      {value ? (
        <>
        <label className={`mk-in mko__ratec${low ? " is-low" : ""}`}>
          <span>{low ? t("rating.lowLabel") : t("rating.commentLabel")}</span>
          <textarea value={comment} onChange={(e) => commentGuard.change(e.target.value, e)} onBlur={commentGuard.blur} rows={3} maxLength={1000} placeholder={low ? t("rating.lowPh") : t("rating.commentPh")} data-ai-id={`marketplace.orders.rating.${o.id}.comment`} />
          {low ? <small className="mko__lowhint">{t("rating.lowHint")}</small> : null}
        </label>
        {commentGuard.note}
        </>
      ) : null}
      {err ? (
        <div id={errId}>
          <Notice ok={false} msg={err} />
        </div>
      ) : null}
      {value ? (
        <button ref={submitBtn} type="button" className="btn btn--grad btn--sm" disabled={busy || (low && !comment.trim())} aria-describedby={err ? errId : undefined} onClick={() => void submit()} data-ai-id={`marketplace.orders.rating.${o.id}.submit`}>
          <IconStarRate aria-hidden="true" />
          {busy ? t("rating.sending") : t("rating.submit")}
        </button>
      ) : null}
    </section>
  );
}

export function RatingCountdown({ o, view, className }: { o: MarketOrder; view: "client" | "seller"; className?: string }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.rating");
  const left = useLeftLabel();
  const timed = o.rating.expiresAt > 0 || !!o.rating.deadlineAt;
  const open = o.rating.canRate && !o.rating.value && timed;
  const now = useTick(open, 1000);
  if (!open) return null;
  const remain = ratingLeftMs(o.rating, now);
  if (!Number.isFinite(remain) || remain <= 0) return null;
  const time = left(remain, true);
  const warn = remain < 3 * 60_000;
  return (
    <em className={["mko__left", "mko-rc", warn ? "is-warn" : "", className ?? ""].filter(Boolean).join(" ")} aria-live="off" data-view={view}>
      <IconHourglass aria-hidden="true" />
      {view === "client" ? t("clientLeft", { time }) : t("sellerLeft", { time })}
    </em>
  );
}
