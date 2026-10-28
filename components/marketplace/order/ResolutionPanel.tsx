"use client";

import "./resolution.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { IconAlert, IconArrowRight, IconChat, IconCheck, IconCircleCheck, IconCircleX, IconClock, IconCoins, IconHistory, IconHourglass, IconLock, IconPhone, IconRefresh, IconSend, IconUsers } from "@/components/icons";
import { useMarketError } from "@/components/marketplace/useMarketError";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { awaitingSeller } from "@/lib/services/marketplace";
import {
  chooseOrderResolution,
  escalationClosed,
  getOrderRefund,
  getOrderTimeline,
  idemKeyFor,
  idemLost,
  idemSettle,
  isResolutionEvent,
  refundPreviewOf,
  refundStepOf,
  type IdemSlot,
  type OrderRefund,
  type RefundStep,
  type ResolutionChoice,
  type TimelineItem,
} from "@/lib/services/resolution";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { useCountdown } from "@/lib/useCountdown";
import type { OrderSectionProps } from "./types";

// The client's side of an assignment the seller declined or let expire
// (TSK-131840): when the call center offers a choice, another specialist or
// a full refund, the client picks one here — once: one Idempotency-Key per
// choice, the buttons gone the moment it is sent. Then the chosen path
// follows live (realtime events, with a slow refresh as the fallback): a new
// specialist on the same order, or the refund's steps up to "refunded". The
// buttons come from the offer and show only while the backend says
// `can_choose`; the deadline is the backend's, the countdown only redraws.

const REFUND_STATUSES = new Set(["refund_pending", "refunded"]);
// Still looking for the new specialist: the order may still carry the
// previous seller's name then, so no name is shown as the new one.
const ASSIGNING = new Set(["resolution_required", "sent_to_seller", "seller_selection", "awaiting_seller", "awaiting_seller_acceptance", "pending_assignment", "reassigning"]);
const STEPS: RefundStep[] = ["requested", "processing", "refunded"];
// A step not reached yet shows what it is; a passed one gets a tick.
const STEP_ICON: Partial<Record<RefundStep, typeof IconSend>> = { requested: IconSend, processing: IconHourglass, refunded: IconCoins };

const money = (amount: number, currency: string, som: string) => `${fmtUzs(amount)} ${currency === "UZS" ? som : currency}`;

function RefundTracker({ rf, step, amount, currency }: { rf: OrderRefund | null; step: RefundStep; amount: number; currency: string }): ReactElement {
  const t = useTranslations("marketplace.orderDetail.resolution");
  const locale = useLocale();
  const at = STEPS.indexOf(step === "rejected" ? "processing" : step);
  return (
    <div className="mrs-refund" data-step={step} role="status" aria-live="polite">
      <div className="mrs-refund__head">
        <span className="mrs-refund__ico" aria-hidden="true">
          {step === "refunded" || step === "none" ? <IconCircleCheck /> : step === "rejected" ? <IconCircleX /> : <IconCoins />}
        </span>
        <span className="mrs-refund__txt">
          <small>{t("refundAmount")}</small>
          <b>{step === "none" ? t("refund.not_charged") : money(amount, currency, t("som"))}</b>
        </span>
        <span className="mrs-chip" data-tone={step === "refunded" || step === "none" ? "ok" : step === "rejected" ? "bad" : "wait"}>
          {t(`step.${step}`)}
        </span>
      </div>
      {step !== "none" ? (
        <ol className="mrs-steps" aria-label={t("refundSteps")}>
          {STEPS.map((s, i) => {
            const state = step === "rejected" && s === "refunded" ? "bad" : i < at || step === "refunded" ? "done" : i === at ? "now" : "todo";
            const Mark = state === "done" ? IconCheck : state === "bad" ? IconCircleX : (STEP_ICON[s] ?? IconClock);
            return (
              <li key={s} data-state={state}>
                <i aria-hidden="true">
                  <Mark />
                </i>
                <span>{s === "refunded" && step === "rejected" ? t("step.rejected") : t(`step.${s}`)}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className="mrs-meta">
        {step === "rejected"
          ? t("refundRejected")
          : step === "refunded"
            ? t("refundDone")
            : step === "none"
              ? t("refundNone")
              : rf && !rf.providerEnabled
                ? t("manualText")
                : t("refundWait")}
        {rf?.updatedAt ? ` · ${t("updated", { time: shortDateTime(rf.updatedAt, locale) })}` : ""}
      </p>
    </div>
  );
}

function Timeline({ items }: { items: TimelineItem[] }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.resolution");
  const ts = useTranslations("portal.common.orderStatus");
  const locale = useLocale();
  if (!items.length) return null;
  const label = (it: TimelineItem) => {
    if (it.type === "refund" && t.has(`refund.${it.status}`)) return `${t("refundStatus")}: ${t(`refund.${it.status}`)}`;
    if (it.choice && t.has(`picked.${it.choice}`)) return t(`picked.${it.choice}`);
    if (t.has(`event.${it.status}`)) return t(`event.${it.status}`);
    if (t.has(`event.${it.type}`)) return t(`event.${it.type}`);
    if (it.status && ts.has(it.status)) return ts(it.status);
    return it.status || it.type;
  };
  const who = (it: TimelineItem) => it.actor || (it.actorRole && t.has(`role.${it.actorRole}`) ? t(`role.${it.actorRole}`) : "");
  return (
    <section className="mrs-tl" aria-label={t("timeline")}>
      <h3 className="mrs-h">
        <IconHistory aria-hidden="true" />
        {t("timeline")}
      </h3>
      <ol>
        {items.map((it) => (
          <li key={it.id || `${it.type}-${it.at}`}>
            <i aria-hidden="true" />
            <div>
              <b>{label(it)}</b>
              <small>
                {[it.at ? shortDateTime(it.at, locale) : "", who(it)].filter(Boolean).join(" · ")}
                {it.amount !== null ? ` · ${money(it.amount, "UZS", t("som"))}` : ""}
              </small>
              {it.message ? <p>{it.message}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function ResolutionPanel({ o, view, aiBase, onRefresh }: OrderSectionProps & { onRefresh: () => void }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.resolution");
  const marketError = useMarketError();
  const [choice, setChoice] = useState<ResolutionChoice | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();
  const slot = useRef<IdemSlot["current"]>(null);
  const [error, setError] = useState<SxDialogErrorText>(null);
  // Sent this session: the buttons never come back, whatever a stale
  // refresh says, until the backend reports the choice itself.
  const [sent, setSent] = useState<ResolutionChoice | "">("");
  // A lost answer freezes the note: only the same request goes again.
  const [lost, setLost] = useState(false);
  const [refund, setRefund] = useState<OrderRefund | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const r = o.resolution;
  const offer = r?.offer ?? null;
  const rf = refund ?? r?.refund ?? null;
  const chosen: ResolutionChoice | "" = sent || (offer?.selectedChoice === "reassign" || offer?.selectedChoice === "refund" ? offer.selectedChoice : "") || (rf ? "refund" : "");
  const refunding = REFUND_STATUSES.has(o.status) || !!rf || chosen === "refund";
  const involved = !!r || o.status === "resolution_required" || refunding;
  const step: RefundStep = o.status === "refunded" ? "refunded" : rf ? refundStepOf(rf.status) : "requested";
  const canChoose = !!r?.canChoose && !!offer && !chosen;
  const preview = refundPreviewOf(o);
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });

  useEffect(() => {
    if (!involved) return;
    const ctl = new AbortController();
    const load = () => {
      getOrderTimeline(o.id, ctl.signal).then(
        (items) => {
          setTimeline(items);
          setLoadFailed(false);
        },
        (e) => {
          if (isAborted(e)) return;
          logApiError("order.timeline", e);
          setLoadFailed(true);
          setTimeline((cur) => cur ?? []);
        },
      );
      if (refunding) getOrderRefund(o.id, ctl.signal).then((x) => x && setRefund(x), (e) => !isAborted(e) && logApiError("order.refund", e));
    };
    load();
    const off = subscribeUserEvents((ev) => {
      if (!isResolutionEvent(ev.event)) return;
      const id = String(ev.order_id ?? (ev.data as { order_id?: unknown } | undefined)?.order_id ?? "");
      if (id && id !== o.id) return;
      load();
      refreshRef.current();
    });
    // No continuous polling (contract 2026-10-26 §13): one read, then the
    // live events; after a socket reconnect, one catch-up read.
    const offResync = onUserSocketResync(() => {
      load();
      refreshRef.current();
    });
    return () => {
      ctl.abort();
      off();
      offResync();
    };
  }, [involved, refunding, o.id, o.status]);

  const left = useCountdown(canChoose ? (offer?.deadlineAt ?? "") : "", () => refreshRef.current());
  if (view !== "client" || !involved) return null;
  const ai = `${aiBase}.resolution`;

  async function submit() {
    if (!choice || busy || sent || !once()) return;
    setBusy(true);
    setError(null);
    const box: IdemSlot = { current: slot.current };
    const key = idemKeyFor(box, `${o.id}:${choice}:${note.trim()}`);
    slot.current = box.current;
    try {
      await chooseOrderResolution(o.id, choice, note, key);
      idemSettle(box);
      slot.current = box.current;
      setSent(choice);
      setChoice("");
      onRefresh();
    } catch (e) {
      idemSettle(box, e);
      slot.current = box.current;
      if (escalationClosed(e)) {
        setChoice("");
        onRefresh();
        return;
      }
      setLost(idemLost(e));
      const fallback = t("error");
      const msg = marketError(e, fallback);
      setError({ title: fallback, text: idemLost(e) ? t("lost") : msg === fallback ? "" : msg });
    } finally {
      setBusy(false);
    }
  }

  const clock = left === null ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const closed = refunding && (step === "refunded" || step === "none" || o.status === "refunded");
  const tone = canChoose ? "choose" : chosen === "refund" || refunding ? (step === "rejected" ? "bad" : closed ? "done" : "refund") : chosen === "reassign" ? "reassign" : offer?.status === "expired" ? "expired" : "wait";
  const title = canChoose ? t("titleChoose") : refunding ? (closed ? t("titleClosed") : t("titleRefund")) : chosen === "reassign" ? t("titleReassign") : offer?.status === "expired" ? t("titleExpired") : t("title");
  const lead = canChoose ? t("leadChoose") : refunding ? (closed ? t("leadClosed") : t("leadRefund")) : chosen === "reassign" ? t("leadReassign") : offer?.status === "expired" ? t("expired") : t("leadWorking");
  const newSeller = chosen === "reassign" && o.lawyerName && !awaitingSeller(o) && !ASSIGNING.has(o.status) ? o.lawyerName : "";

  return (
    <section className="mrs" data-tone={tone} aria-labelledby={`${ai}-title`} data-ai-id={ai}>
      <header className="mrs__head">
        <span className="mrs__ico" aria-hidden="true">
          {tone === "choose" ? <IconAlert /> : tone === "reassign" ? <IconUsers /> : tone === "done" ? <IconCircleCheck /> : tone === "bad" ? <IconCircleX /> : tone === "refund" ? <IconCoins /> : <IconHourglass />}
        </span>
        <span className="mrs__titles">
          <h2 id={`${ai}-title`}>{title}</h2>
          <p>{lead}</p>
        </span>
        {canChoose && clock ? (
          <span className="mrs-chip" data-tone={left !== null && left < 300 ? "bad" : "wait"} aria-label={t("deadline", { time: clock })} title={t("deadline", { time: clock })}>
            <IconClock aria-hidden="true" />
            {clock}
          </span>
        ) : null}
      </header>

      {canChoose && offer ? (
        <>
          {offer.message ? (
            <figure className="mrs-quote">
              <figcaption>{t("fromOperator")}</figcaption>
              <blockquote>{offer.message}</blockquote>
            </figure>
          ) : null}
          <div className="mrs-choices" role="group" aria-label={t("chooseLabel")}>
            {offer.options.includes("reassign") ? (
              <button type="button" className="mrs-choice" onClick={() => setChoice("reassign")} data-ai-id={`${ai}.reassign`} disabled={busy}>
                <span className="mrs-choice__ico" aria-hidden="true">
                  <IconUsers />
                </span>
                <b>{t("choice.reassign")}</b>
                <span>{t("choiceText.reassign")}</span>
                <small>{t("choiceMeta.reassign")}</small>
              </button>
            ) : null}
            {offer.options.includes("refund") ? (
              <button type="button" className="mrs-choice" data-kind="refund" onClick={() => setChoice("refund")} data-ai-id={`${ai}.refund`} disabled={busy}>
                <span className="mrs-choice__ico" aria-hidden="true">
                  <IconCoins />
                </span>
                <b>{t("choice.refund")}</b>
                <span>{t("choiceText.refund")}</span>
                <small>{preview.source === "none" ? t("refund.not_charged") : money(preview.amount, preview.currency, t("som"))}</small>
              </button>
            ) : null}
          </div>
          {clock ? <p className="mrs-meta">{t("deadline", { time: clock })}</p> : null}
        </>
      ) : null}

      {!canChoose && offer?.status === "expired" && !chosen ? (
        <p className="mrs-meta">
          <IconClock aria-hidden="true" /> {t("expiredText")}
        </p>
      ) : null}

      {chosen === "reassign" ? (
        <div className="mrs-path" role="status" aria-live="polite">
          <ol className="mrs-steps" aria-label={t("reassignSteps")}>
            <li data-state="done">
              <i aria-hidden="true">
                <IconCheck />
              </i>
              <span>{t("rstep.chosen")}</span>
            </li>
            <li data-state={newSeller ? "done" : "now"}>
              <i aria-hidden="true">{newSeller ? <IconCheck /> : <IconUsers />}</i>
              <span>{newSeller ? t("rstep.found", { name: newSeller }) : t("rstep.searching")}</span>
            </li>
            <li data-state={newSeller ? "now" : "todo"}>
              <i aria-hidden="true">
                <IconArrowRight />
              </i>
              <span>{t("rstep.continue")}</span>
            </li>
          </ol>
          {/* The backend's own neutral line, never "searching for a lawyer" (§3.2). */}
          <p className="mrs-meta">{newSeller ? t("reassignGoing") : o.clientMessage || t("reassignWait")}</p>
        </div>
      ) : null}

      {refunding ? <RefundTracker rf={rf} step={step} amount={rf?.amount ?? preview.amount} currency={rf?.currency ?? preview.currency} /> : null}

      {closed ? (
        <ul className="mrs-closed" aria-label={t("closedLabel")}>
          <li>
            <IconLock aria-hidden="true" />
            {t("closed.order")}
          </li>
          <li>
            <IconChat aria-hidden="true" />
            {o.chatReadOnly ? t("closed.chatRead") : o.canStartChat ? t("closed.chatOpen") : t("closed.chat")}
          </li>
          <li>
            <IconPhone aria-hidden="true" />
            {t("closed.calls")}
          </li>
          <li>
            <IconCircleX aria-hidden="true" />
            {t("closed.services")}
          </li>
        </ul>
      ) : null}

      {timeline === null ? (
        <div className="mrs-sk" aria-hidden="true">
          <span className="sx-sk" />
          <span className="sx-sk" />
        </div>
      ) : (
        <Timeline items={timeline} />
      )}
      {loadFailed ? (
        <p className="mrs-meta mrs-meta--err">
          {t("loadFailed")}{" "}
          <button type="button" className="mrs-link" onClick={() => onRefresh()}>
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
        </p>
      ) : null}

      {choice ? (
        <SxDialog
          open
          onClose={() => !busy && !lost && setChoice("")}
          title={t(`confirm.${choice}`)}
          description={t(`confirmText.${choice}`)}
          busy={busy}
          aiId={`${ai}.dialog`}
          footer={
            <>
              <SxButton variant="secondary" onClick={() => setChoice("")} disabled={busy || lost}>
                {t("back")}
              </SxButton>
              <SxButton variant={choice === "refund" ? "danger" : "primary"} busy={busy} disabled={!!sent} onClick={() => void submit()} aiId={`${ai}.submit`}>
                {t(`submit.${choice}`)}
              </SxButton>
            </>
          }
        >
          {choice === "refund" ? (
            <div className="mrs-sum">
              <small>{t("refundAmount")}</small>
              <b>{preview.source === "none" ? t("refund.not_charged") : money(preview.amount, preview.currency, t("som"))}</b>
              <span>{preview.source === "none" ? t("refundNone") : preview.source === "paid" ? t("sumPaid") : t("sumBackend")}</span>
            </div>
          ) : null}
          <Field id={`${ai}-note`} label={t("note")}>
            {(a) => <TextArea {...a} value={note} onChange={setNote} minRows={3} maxLength={1000} placeholder={t("notePh")} readOnly={lost} />}
          </Field>
          <SxDialogError error={error} />
        </SxDialog>
      ) : null}
    </section>
  );
}
