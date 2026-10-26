"use client";

import { useCallback, useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError } from "@/components/admin/studio/sx/editor/SxDialog";
import { ChoiceCards } from "@/components/admin/studio/sx/form/ChoiceCards";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { MoneyInput } from "@/components/admin/studio/sx/form/MoneyInput";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { resolveCancellationReview, reviewActionsOf, reviewOrderOf, type CancellationReview, type ReviewAction, type ReviewResolution } from "@/lib/services/marketRuntime";
import { idemKeyFor, idemSettle, type IdemSlot } from "@/lib/services/resolution";
import { ShieldCheckIcon } from "./icons";
import { CLIENT_REASON_MAX, EMPTY_DRAFT, NOTE_MAX, resolveFailureOf, resolveSig, toResolveInput, validateResolve, type ResolveDraft, type ResolveErrors, type ResolveFailure, type ResolveField } from "./model";
import { REVIEW_ACTION_ICON } from "./ReviewItem";
import { SellerPicker } from "./SellerPicker";
import "./cancellations.css";

export type ResolveDialogProps = { review: CancellationReview; onClose: () => void; onResolved: (res: ReviewResolution) => void; onStale: () => void };

type Done = { res: ReviewResolution; action: string; amount: number; sellerName: string };

const ORDER: readonly ResolveField[] = ["action", "amount", "lawyer", "clientReason", "note"];
const PAID = new Set(["paid", "succeeded", "captured", "completed"]);

export function ResolveDialog({ review, onClose, onResolved, onStale }: ResolveDialogProps): ReactElement {
  const t = useTranslations("admin.callCenter.cancellations");
  const te = useTranslations("enums");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ctx = reviewOrderOf(review);
  const [draft, setDraft] = useState<ResolveDraft>(EMPTY_DRAFT);
  const [sellerName, setSellerName] = useState("");
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<ResolveFailure | null>(null);
  const [busy, setBusy] = useState(false);
  // `busy` only takes effect on the next render, so two clicks in one tick
  // would both pass it and send the decision (a refund) twice.
  const sending = useRef(false);
  // One Idempotency-Key per decision: a retry after a lost answer sends the
  // same key, so the backend never creates a second refund.
  const idem = useRef<IdemSlot>({ current: null });
  const [done, setDone] = useState<Done | null>(null);
  const focusOnce = useCallback((el: HTMLHeadingElement | null) => {
    el?.focus();
  }, []);

  const money = (n: number) => `${fmtUzs(n)} ${te("currency")}`;
  const ids = { action: `${uid}-action`, amount: `${uid}-amount`, lawyer: `${uid}-seller`, clientReason: `${uid}-client-reason`, note: `${uid}-note`, error: `${uid}-error` };
  const paid = PAID.has(ctx.paymentStatus);

  function errorsOf(d: ResolveDraft, f: ResolveFailure | null): ResolveErrors {
    const out: ResolveErrors = tried ? validateResolve(d, ctx.sellerUserId) : {};
    if (f && f.kind === "field") out[f.field] = f.key;
    return out;
  }
  const shown = errorsOf(draft, failure);
  const say = (key: string | undefined) => (key ? t(key, { max: key === "dialog.clientReasonLong" ? CLIENT_REASON_MAX : NOTE_MAX }) : "");
  const general = failure && failure.kind !== "field" ? failure : null;

  function update(patch: Partial<ResolveDraft>, field: ResolveField) {
    setDraft((d) => ({ ...d, ...patch }));
    setFailure((f) => (f && f.kind === "field" && (f.field === field || field === "action") ? null : f));
  }

  function focusField(field: ResolveField) {
    const el =
      field === "action"
        ? document.querySelector<HTMLInputElement>(`#${ids.action} input[type="radio"]:not([disabled])`)
        : document.getElementById(ids[field]);
    el?.focus();
  }

  async function submit() {
    if (busy || sending.current) return;
    setTried(true);
    const errs: ResolveErrors = { ...validateResolve(draft, ctx.sellerUserId) };
    if (failure && failure.kind === "field") errs[failure.field] = failure.key;
    const first = ORDER.find((k) => errs[k]);
    if (first) {
      focusField(first);
      return;
    }
    const input = toResolveInput(draft);
    if (!input) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    const key = idemKeyFor(idem.current, resolveSig(review.id, draft));
    try {
      const res = await resolveCancellationReview(review.id, input, key);
      idemSettle(idem.current);
      setDone({ res, action: res.action || input.action, amount: input.action === "new_price" ? input.amount : 0, sellerName: input.action === "reassign" ? sellerName : "" });
      setBusy(false);
      onResolved(res);
    } catch (e) {
      idemSettle(idem.current, e);
      sending.current = false;
      setBusy(false);
      const f = resolveFailureOf(e);
      setFailure(f);
      if (f.kind === "field") {
        window.setTimeout(() => focusField(f.field), 0);
        return;
      }
      if (f.kind === "generic") logApiError("resolve cancellation review", e);
      window.setTimeout(() => document.getElementById(ids.error)?.scrollIntoView?.({ block: "nearest" }), 0);
      if (f.refresh) onStale();
    }
  }

  const action = draft.action;
  const terminal = !!general && (general.kind === "resolved" || general.kind === "gone" || general.kind === "forbidden");
  const dirty = !done && !terminal && (action !== "" || draft.note.trim() !== "" || draft.clientReason.trim() !== "");
  // A paid order is never just cancelled: the backend answers 409
  // paid_order_requires_refund_action, so the card says so up front.
  const options = reviewActionsOf(review).map((a) => ({ value: a, title: t(`action.${a}`), description: t(`actionHint.${a}`), icon: REVIEW_ACTION_ICON[a], disabled: a === "cancel" && paid ? t("dialog.cancelPaid") : undefined }));
  const submitLabel = busy ? t("dialog.saving") : action ? t(`dialog.submit.${action}`) : t("dialog.submitAny");

  const footer = done || terminal ? (
    <SxButton variant="secondary" onClick={onClose} aiId="call_center.cancellations.resolve.close">
      {t("dialog.close")}
    </SxButton>
  ) : (
    <>
      <SxButton variant="secondary" onClick={onClose} disabled={busy}>
        {t("dialog.back")}
      </SxButton>
      <SxButton variant={action === "cancel" || action === "refund" ? "danger" : "primary"} busy={busy} onClick={() => void submit()} aiId="call_center.cancellations.resolve.submit" aiLabel={action ? t(`dialog.submit.${action}`) : t("dialog.submitAny")}>
        {submitLabel}
      </SxButton>
    </>
  );

  return (
    <SxDialog
      open
      onClose={onClose}
      title={t("dialog.title")}
      description={[ctx.workId, ctx.serviceTitle].filter(Boolean).join(" · ") || undefined}
      aiId="call_center.cancellations.resolve"
      size="md"
      busy={busy}
      dirty={dirty}
      footer={footer}
    >
      {done ? (
        <div className="ccx-rd-done" role="status">
          <h3 tabIndex={-1} ref={focusOnce}>
            {t("done.title")}
          </h3>
          <SxNote tone="success">
            <p>{t.has(`outcome.${done.action}`) ? t(`outcome.${done.action}`) : t("outcome.other")}</p>
            {done.action === "new_price" && done.amount > 0 ? <p>{t("item.outcomeAmount", { price: money(done.amount) })}</p> : null}
            {done.action === "reassign" && done.sellerName ? <p>{t("item.outcomeSeller", { name: done.sellerName })}</p> : null}
          </SxNote>
          {t.has(`done.next.${done.action}`) ? <p className="ccx-rd-chat">{t(`done.next.${done.action}`)}</p> : null}
          {done.res.raw.idempotent_replay === true ? <p className="ccx-rd-chat">{t("done.replay")}</p> : null}
        </div>
      ) : (
        <div className="ccx-rd">
          {general ? <SxDialogError id={ids.error} error={{ title: t("dialog.errorTitle"), text: t(general.key) }} /> : null}
          <SxNote tone="info" icon={ShieldCheckIcon}>
            {t("dialog.privacyNote")}
          </SxNote>
          <Field id={ids.action} as="fieldset" label={t("dialog.action")} required error={say(shown.action)}>
            {(a11y) => (
              <ChoiceCards
                {...a11y}
                columns={1}
                value={action}
                onChange={(v) => update({ action: v as ReviewAction }, "action")}
                options={options}
                aiId="call_center.cancellations.resolve.action"
              />
            )}
          </Field>
          {action === "new_price" ? (
            <div className="ccx-rd-group">
              <Field id={ids.amount} label={t("dialog.amount")} required help={ctx.price > 0 ? t("dialog.amountHelp", { price: money(ctx.price) }) : ""} error={say(shown.amount)}>
                {(a11y) => (
                  <MoneyInput
                    {...a11y}
                    currency={ctx.currency}
                    value={draft.amount}
                    onChange={(v) => update({ amount: v }, "amount")}
                    aiId="call_center.cancellations.resolve.amount"
                    aiLabel={t("dialog.amount")}
                  />
                )}
              </Field>
            </div>
          ) : null}
          {action === "reassign" ? (
            <div className="ccx-rd-group">
              <Field id={ids.lawyer} label={t("dialog.seller")} required help={t("dialog.sellerHelp")} error={say(shown.lawyer)}>
                {(a11y) => (
                  <SellerPicker
                    id={a11y.id}
                    aria-labelledby={a11y["aria-labelledby"]}
                    aria-describedby={a11y["aria-describedby"]}
                    invalid={a11y["aria-invalid"] === true}
                    required
                    value={draft.lawyerUserId}
                    serviceId={ctx.serviceId}
                    excludeUserId={ctx.sellerUserId}
                    onChange={(id, name) => {
                      setSellerName(name);
                      update({ lawyerUserId: id }, "lawyer");
                    }}
                  />
                )}
              </Field>
            </div>
          ) : null}
          {action === "refund" ? (
            <SxNote tone="warn" title={t("dialog.refundTitle")}>
              <p>{ctx.price > 0 ? t("dialog.refundAmount", { price: money(ctx.price) }) : t("dialog.refundAmountUnknown")}</p>
              <p>{t("dialog.refundOnce")}</p>
            </SxNote>
          ) : null}
          {action === "reassign" ? <SxNote tone="info">{t("dialog.reassignNote")}</SxNote> : null}
          {action ? (
            <Field id={ids.clientReason} label={t("dialog.clientReason")} help={t("dialog.clientReasonHelp")} error={say(shown.clientReason)}>
              {(a11y) => (
                <TextArea
                  {...a11y}
                  value={draft.clientReason}
                  onChange={(v) => update({ clientReason: v }, "clientReason")}
                  maxLength={CLIENT_REASON_MAX}
                  counter
                  minRows={2}
                  placeholder={t.has(`dialog.clientReasonPh.${action}`) ? t(`dialog.clientReasonPh.${action}`) : ""}
                  aiId="call_center.cancellations.resolve.client-reason"
                  aiLabel={t("dialog.clientReason")}
                />
              )}
            </Field>
          ) : null}
          <Field id={ids.note} label={t("dialog.note")} help={t("dialog.noteHelp")} error={say(shown.note)}>
            {(a11y) => (
              <TextArea
                {...a11y}
                value={draft.note}
                onChange={(v) => update({ note: v }, "note")}
                maxLength={NOTE_MAX}
                counter
                placeholder={t("dialog.notePh")}
                aiId="call_center.cancellations.resolve.note"
                aiLabel={t("dialog.note")}
              />
            )}
          </Field>
        </div>
      )}
    </SxDialog>
  );
}
