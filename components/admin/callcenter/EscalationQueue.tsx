"use client";

import "./escalations.css";
import { IconArrowRight } from "@/components/icons";
import QueueHead from "./QueueHead";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { ChoiceCards } from "@/components/admin/studio/sx/form/ChoiceCards";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { shortDateTime } from "@/lib/date";
import { ApiError, errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { humanize } from "@/lib/labels";
import { subscribeUserEvents } from "@/lib/userSocket";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { escalationClosed, idemKeyFor, idemLost, idemSettle, isResolutionEvent, listAssignmentEscalations, resolveAssignmentEscalation, type AssignmentEscalation, type EscalationAction, type IdemSlot } from "@/lib/services/resolution";

// Orders the seller declined or let the 30-minute acceptance pass
// (TSK-131840): one row per order (the backend keeps escalations unique),
// with the order, payment, client, previous seller, every assignment
// attempt and the contact history on one screen. The operator offers the
// client a choice, reassigns (a new 30-minute window starts), messages,
// cancels or refunds; each action is confirmed and carries an
// Idempotency-Key, reused only when retrying after a lost answer.

const MESSAGE_MAX = 1000;
const NEEDS_REASON = new Set<EscalationAction>(["cancel", "full_refund"]);

function ActionDialog({ esc, action, onClose, onDone, onClosed }: { esc: AssignmentEscalation; action: EscalationAction; onClose: () => void; onDone: () => void; onClosed: () => void }): ReactElement {
  const t = useTranslations("callCenter.escalations");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [message, setMessage] = useState(action === "offer_resolution" ? t("offerDefault") : "");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [target, setTarget] = useState<"client" | "seller">("client");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SxDialogErrorText>(null);
  const once = useSameTickGuard();
  const slot = useRef<IdemSlot["current"]>(null);
  // The answer to a send was lost: the form is frozen and only the same
  // request goes again, with the same key.
  const [lost, setLost] = useState(false);

  const mins = Number(minutes);
  const errs = {
    message: (action === "message" || action === "offer_resolution") && !message.trim() ? t("err.message") : "",
    reason: NEEDS_REASON.has(action) && reason.trim().length < 5 ? t("err.reason") : "",
    minutes: action === "offer_resolution" && !(Number.isInteger(mins) && mins >= 5 && mins <= 1440) ? t("err.minutes") : "",
  };
  const shown = tried ? errs : { message: "", reason: "", minutes: "" };

  async function submit() {
    if (busy || !once()) return;
    setTried(true);
    if (errs.message || errs.reason || errs.minutes) return;
    setBusy(true);
    setError(null);
    const input = { action, message, reason, target: action === "message" ? target : undefined, deadlineMinutes: action === "offer_resolution" ? mins : undefined };
    const box: IdemSlot = { current: slot.current };
    const key = idemKeyFor(box, JSON.stringify([esc.id, input]));
    slot.current = box.current;
    try {
      await resolveAssignmentEscalation(esc.id, input, key);
      idemSettle(box);
      slot.current = box.current;
      onDone();
    } catch (e) {
      idemSettle(box, e);
      slot.current = box.current;
      if (escalationClosed(e)) return onClosed();
      logApiError("escalation.resolve", e);
      setLost(idemLost(e));
      setError({ title: t("err.failed"), text: idemLost(e) ? t("err.lost") : e instanceof ApiError && e.code === "no_eligible_marketplace_candidate" ? t("err.noCandidate") : errDetail(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={t(`action.${action}`)}
      description={[esc.order.workId, esc.order.serviceTitle].filter(Boolean).join(" · ") || undefined}
      busy={busy}
      dirty={!!message.trim() || !!reason.trim()}
      aiId="call_center.escalations.dialog"
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={busy}>
            {t("back")}
          </SxButton>
          <SxButton variant={action === "cancel" || action === "full_refund" ? "danger" : "primary"} busy={busy} onClick={() => void submit()} aiId="call_center.escalations.submit">
            {t(`confirm.${action}`)}
          </SxButton>
        </>
      }
    >
      <SxNote tone={action === "cancel" || action === "full_refund" ? "warn" : "info"}>{t(`actionHint.${action}`)}</SxNote>
      {action === "message" ? (
        <Field id={`${uid}-target`} as="fieldset" label={t("target")} required>
          {(a) => (
            <ChoiceCards
              {...a}
              columns={2}
              value={target}
              onChange={(v) => !lost && setTarget(v === "seller" ? "seller" : "client")}
              options={[
                { value: "client", title: t("targetClient") },
                { value: "seller", title: t("targetSeller") },
              ]}
              aiId="call_center.escalations.target"
            />
          )}
        </Field>
      ) : null}
      {action === "offer_resolution" || action === "message" ? (
        <Field id={`${uid}-msg`} label={t("message")} required error={shown.message} help={action === "offer_resolution" ? t("messageHelp") : ""}>
          {(a) => <TextArea {...a} value={message} onChange={setMessage} minRows={3} maxLength={MESSAGE_MAX} counter readOnly={lost} />}
        </Field>
      ) : null}
      {action === "offer_resolution" ? (
        <Field id={`${uid}-min`} label={t("minutes")} required error={shown.minutes} help={t("minutesHelp")}>
          {(a) => <input {...a} className="esc__num" inputMode="numeric" value={minutes} readOnly={lost} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 4))} />}
        </Field>
      ) : null}
      {action !== "message" && action !== "offer_resolution" ? (
        <Field id={`${uid}-reason`} label={t("reason")} required={NEEDS_REASON.has(action)} error={shown.reason} help={t("reasonHelp")}>
          {(a) => <TextArea {...a} value={reason} onChange={setReason} minRows={3} maxLength={MESSAGE_MAX} counter readOnly={lost} />}
        </Field>
      ) : null}
      <SxDialogError error={error} />
    </SxDialog>
  );
}

function Row({ esc, onAct }: { esc: AssignmentEscalation; onAct: (a: EscalationAction) => void }): ReactElement {
  const t = useTranslations("callCenter.escalations");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const o = esc.order;
  const offer = esc.resolution?.offer ?? null;
  const when = (iso: string) => (iso ? shortDateTime(iso, locale) : "");
  const label = (group: string, v: string) => (v && t.has(`${group}.${v}`) ? t(`${group}.${v}`) : humanize(v) || "—");
  return (
    <li className="esc__item" data-open={open || undefined}>
      <button type="button" className="esc__row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{o.serviceTitle || o.packageTitle || o.workId || esc.orderId}</b>
        <span className="esc__chip" data-s={esc.status}>
          {label("status", esc.status)}
        </span>
        <span>{label("why", esc.reason)}</span>
        <time>{when(esc.createdAt)}</time>
      </button>
      {open ? (
        <div className="esc__body">
          <dl className="esc__facts">
            <div>
              <dt>{t("f.order")}</dt>
              <dd>{[o.workId, o.serviceTitle].filter(Boolean).join(" · ") || esc.orderId}</dd>
            </div>
            <div>
              <dt>{t("f.price")}</dt>
              <dd>{o.price ? `${fmtUzs(o.price)} ${t("som")}` : "—"}</dd>
            </div>
            <div>
              <dt>{t("f.payment")}</dt>
              <dd>{label("payment", o.paymentStatus)}</dd>
            </div>
            <div>
              <dt>{t("f.client")}</dt>
              <dd>{[o.clientName, o.clientPhone].filter(Boolean).join(" · ") || "—"}</dd>
            </div>
            <div>
              <dt>{t("f.previous")}</dt>
              <dd>{esc.previousSellerName || esc.previousSellerUserId || "—"}</dd>
            </div>
            {offer ? (
              <div>
                <dt>{t("f.offer")}</dt>
                <dd>
                  {label("offer", offer.status)}
                  {offer.deadlineAt ? ` · ${t("until", { time: when(offer.deadlineAt) })}` : ""}
                  {offer.selectedChoice ? ` · ${label("choice", offer.selectedChoice)}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
          {esc.attempts.length ? (
            <section aria-label={t("attempts")}>
              <b className="esc__h">{t("attempts")}</b>
              <ol className="esc__log">
                {esc.attempts.map((a, i) => (
                  <li key={`${a.sellerUserId}-${a.at}-${i}`}>
                    <time>{when(a.at)}</time>
                    <span>{a.sellerName || a.sellerUserId || "—"}</span>
                    {a.rank !== null ? <span className="esc__muted">{t("rank", { n: a.rank })}</span> : null}
                    <span>{label("attempt", a.status)}</span>
                    {a.reason ? <span className="esc__muted">{a.reason}</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {esc.history.length ? (
            <section aria-label={t("history")}>
              <b className="esc__h">{t("history")}</b>
              <ol className="esc__log">
                {esc.history.map((h, i) => (
                  <li key={h.id || `${h.at}-${i}`}>
                    <time>{when(h.at)}</time>
                    <span>{label("event", h.type || h.status)}</span>
                    {h.actor ? <span className="esc__muted">{h.actor}</span> : null}
                    {h.message ? <span>{h.message}</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {esc.actions.length ? (
            <div className="esc__acts sx">
              {esc.actions.map((a) => (
                <SxButton key={a} size="sm" variant={a === "offer_resolution" ? "primary" : a === "cancel" || a === "full_refund" ? "danger" : "secondary"} onClick={() => onAct(a)} aiId={`call_center.escalations.${a}`}>
                  {t(`action.${a}`)}
                </SxButton>
              ))}
            </div>
          ) : (
            <p className="esc__muted">{t("noActions")}</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

export default function EscalationQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.escalations");
  const [items, setItems] = useState<AssignmentEscalation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<{ esc: AssignmentEscalation; action: EscalationAction } | null>(null);
  const [done, setDone] = useState("");
  const onCountRef = useRef(onCount);
  useEffect(() => {
    onCountRef.current = onCount;
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await listAssignmentEscalations({}, signal);
      setItems(r.items);
      setFailed(false);
      onCountRef.current?.(r.total);
    } catch (e) {
      if (isAborted(e)) return;
      // Not this operator's queue (callcenter_operator_required): the tab
      // goes away like the other queues it cannot open.
      if (isForbidden(e)) return setDenied(true);
      logApiError("escalations.list", e);
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    const off = subscribeUserEvents((e) => {
      if (isResolutionEvent(e.event) || /marketplace\.(order_declined|assignment_)/.test(String(e.event ?? ""))) void load();
    });
    return () => {
      ctl.abort();
      off();
    };
  }, [load]);

  if (denied) return null;
  return (
    <section className="ppanel esc" data-ai-target="callcenter:escalations">
      <QueueHead
        icon={IconArrowRight}
        title={t("title")}
        lead={t("lead")}
        count={items && !failed ? items.length : null}
        refreshLabel={t("refresh")}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load().finally(() => setRefreshing(false));
        }}
        aiBase="call_center.escalations"
      />
      {done ? <Notice ok msg={done} /> : null}
      {failed ? (
        <ErrorState title={t("loadFailed")} onRetry={() => void load()} compact />
      ) : !items ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState size="sm" icon={<IconArrowRight />} title={t("empty")} />
      ) : null}
      {items?.length ? (
        <ul className="esc__list">
          {items.map((e) => (
            <Row key={e.id} esc={e} onAct={(action) => setActing({ esc: e, action })} />
          ))}
        </ul>
      ) : null}
      {acting ? (
        <ActionDialog
          esc={acting.esc}
          action={acting.action}
          onClose={() => {
            setActing(null);
            // After a lost answer the escalation's real state comes first.
            void load();
          }}
          onDone={() => {
            setDone(t(`done.${acting.action}`));
            setActing(null);
            void load();
          }}
          onClosed={() => {
            setDone(t("alreadyClosed"));
            setActing(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
