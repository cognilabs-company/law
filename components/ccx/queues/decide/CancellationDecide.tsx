"use client";

import "./WcDecide.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import PersonName from "@/components/ui/PersonName";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { getCancellationReview, resolveCancellationReview, reviewActionsOf, reviewOrderOf, reviewPaymentOf, reviewResolutionOf, type CancellationReview } from "@/lib/services/marketRuntime";
import { idemKeyFor, idemSettle, type IdemSlot } from "@/lib/services/resolution";
import {
  CLIENT_REASON_MAX,
  EMPTY_DRAFT,
  NOTE_MAX,
  isOpenReview,
  isReviewQueueEvent,
  mergeReview,
  orderPhaseKey,
  resolveFailureOf,
  resolveSig,
  reviewTone,
  toResolveInput,
  validateResolve,
  type CcxTone,
  type OrderPhaseKey,
  type ResolveDraft,
  type ResolveErrors,
  type ResolveFailure,
  type ResolveField,
} from "@/components/admin/callcenter/cancellations/model";
import { CaseBox, Choice, FactStrip, Field, Loading, Note, PanelFoot, PartyCard, Section, type Fact } from "../../panel/bits";
import { IcCheck, IcClock, IcCoins, IcDoc, IcFlag, IcLayers, IcScale } from "../../icons";
import { CancelDone, ChecklistSection, DeadlineAside, FilesRow, HistorySection, OutcomeSection, PaymentSection, outcomeKey, useMoney, type CancelDoneInfo } from "./CancelParts";
import CancelChat from "./CancelChat";
import SellerPick from "./SellerPick";
import type { DecideProps } from "./types";

type Tone = "ok" | "warn" | "hot" | "info" | "mute";

const KICK_MS = 300;
const ORDER: readonly ResolveField[] = ["action", "amount", "lawyer", "clientReason", "note"];
const PAID = new Set(["paid", "succeeded", "captured", "completed"]);
const PHASE_TONE: Record<OrderPhaseKey, Tone> = { pending: "info", paid: "ok", in_progress: "info", review: "warn", completed: "ok", rated: "ok", cancelled: "mute" };
const REVIEW_TONE: Record<CcxTone, Tone> = { draft: "mute", submitted: "warn", review: "info", approved: "ok", published: "ok", returned: "warn", archived: "mute" };

function errorsOf(base: ResolveErrors, f: ResolveFailure | null): ResolveErrors {
  const out: ResolveErrors = { ...base };
  if (f && f.kind === "field") out[f.field] = f.key;
  return out;
}

type Detail = { id: string; review: CancellationReview | null; failed: boolean };

function useReviewDetail(id: string) {
  const [tick, setTick] = useState(0);
  const [got, setGot] = useState<Detail | null>(null);

  useEffect(() => {
    if (!id) return;
    const ctl = new AbortController();
    getCancellationReview(id, ctl.signal).then(
      (review) => {
        if (!ctl.signal.aborted) setGot({ id, review, failed: false });
      },
      (e: unknown) => {
        if (ctl.signal.aborted || isAborted(e)) return;
        setGot((g) => ({ id, review: g && g.id === id ? g.review : null, failed: true }));
      },
    );
    return () => ctl.abort();
  }, [id, tick]);

  useEffect(() => {
    let timer = 0;
    const kick = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTick((k) => k + 1), KICK_MS);
    };
    const offEvents = subscribeUserEvents((ev) => {
      if (isReviewQueueEvent(ev)) kick();
    });
    const offResync = onUserSocketResync(kick);
    return () => {
      window.clearTimeout(timer);
      offEvents();
      offResync();
    };
  }, []);

  const refresh = useCallback(() => setTick((k) => k + 1), []);
  const mine = got && got.id === id ? got : null;
  return { review: mine?.review ?? null, loading: Boolean(id) && !mine, failed: Boolean(mine && mine.failed && !mine.review), refresh };
}

export default function CancellationDecide({ job, item, onDone, onClose, onDirty }: DecideProps<CancellationReview>) {
  const t = useTranslations("admin.callCenter.cancellations");
  const tx = useTranslations("admin.ccx.panel");
  const tcs = useTranslations("admin.ccx.cases");
  const tp = useTranslations("marketplace.orderDetail.phase");
  const troles = useTranslations("marketplace.roles");
  const locale = useLocale();
  const money = useMoney();
  const detail = useReviewDetail(item.id);
  const [draft, setDraft] = useState<ResolveDraft>(EMPTY_DRAFT);
  const [sellerName, setSellerName] = useState("");
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<ResolveFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CancelDoneInfo | null>(null);
  const sending = useRef(false);
  const idem = useRef<IdemSlot>({ current: null });
  const box = useRef<HTMLDivElement>(null);

  const review = mergeReview(item, detail.review);
  const ctx = reviewOrderOf(review);
  const pay = reviewPaymentOf(review);
  const res = reviewResolutionOf(review);
  const open = isOpenReview(review);
  const paid = PAID.has(ctx.paymentStatus);
  const actions = reviewActionsOf(review);
  const action = draft.action;
  const general = failure && failure.kind !== "field" ? failure : null;
  const terminal = !!general && (general.kind === "resolved" || general.kind === "gone" || general.kind === "forbidden");
  const shown = errorsOf(tried ? validateResolve(draft, ctx.sellerUserId) : {}, failure);
  const say = (key: string | undefined) => (key ? t(key, { max: key === "dialog.clientReasonLong" ? CLIENT_REASON_MAX : NOTE_MAX }) : "");

  const focusField = (field: ResolveField) => {
    const root = box.current;
    if (!root) return;
    const el = field === "action" ? root.querySelector<HTMLElement>('[data-cx="action"] input[type="radio"]:not([disabled])') : root.querySelector<HTMLElement>(`[data-cx="${field}"] input, [data-cx="${field}"] textarea`);
    el?.focus();
  };

  const update = (patch: Partial<ResolveDraft>, field: ResolveField) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setFailure((f) => (f && f.kind === "field" && (f.field === field || field === "action") ? null : f));
    onDirty(next.action !== "" || next.note.trim() !== "" || next.clientReason.trim() !== "");
  };

  const pickAction = (v: string) => {
    const a = actions.find((x) => x === v);
    if (a) update({ action: a }, "action");
  };

  const setAmount = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 12);
    update({ amount: digits ? Number(digits) : undefined }, "amount");
  };

  const submit = async () => {
    if (busy || sending.current) return;
    setTried(true);
    const errs = errorsOf(validateResolve(draft, ctx.sellerUserId), failure);
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
      const r = await resolveCancellationReview(review.id, input, key);
      idemSettle(idem.current);
      onDirty(false);
      setDone({ res: r, action: r.action || input.action, amount: input.action === "new_price" ? input.amount : 0, sellerName: input.action === "reassign" ? sellerName : "" });
      setBusy(false);
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
      if (f.kind === "resolved" || f.kind === "gone" || f.kind === "forbidden") onDirty(false);
      window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-cx="error"]')?.scrollIntoView?.({ block: "nearest" }), 0);
      if (f.refresh) detail.refresh();
    }
  };

  const finish = () => {
    if (done) onDone(t(outcomeKey(done.action, (k) => t.has(k))));
  };

  const phase = orderPhaseKey(ctx.status);
  const phaseLabel = phase ? tp(phase) : tcs("other");
  const status = review.status;
  const pill = status ? (t.has(`pill.${status}`) ? t(`pill.${status}`) : tcs("other")) : t("pill.open");
  const roleLabel = ctx.sellerType && troles.has(ctx.sellerType) ? troles(ctx.sellerType) : "";
  const requester = review.requester;
  const requesterRole = review.requesterRole || requester?.role || "";
  const reasonLabel = requesterRole === "client" || requesterRole === "seller" ? t(`item.reasonFrom.${requesterRole}`) : t("item.reason");
  const amountText = draft.amount === undefined ? "" : fmtUzs(draft.amount);
  const options = actions.map((a) => ({
    value: a,
    label: t(`action.${a}`),
    hint: a === "cancel" && paid ? t("dialog.cancelPaid") : t(`actionHint.${a}`),
    danger: a === "cancel" || a === "refund",
    disabled: a === "cancel" && paid,
  }));

  const facts: Fact[] = [{ icon: <IcDoc size={17} />, label: tx("service"), value: ctx.serviceTitle || t("item.noTitle") }];
  if (ctx.workId && ctx.workId !== job.code) facts.push({ icon: <IcLayers size={17} />, label: t("item.workIdAria"), value: <span className="opx-num">{ctx.workId}</span> });
  if (ctx.price > 0) facts.push({ icon: <IcCoins size={17} />, label: t("item.price"), value: <span className="opx-num">{money(ctx.price)}</span> });
  if (ctx.status) {
    facts.push({
      icon: <IcLayers size={17} />,
      label: t("item.orderStatus"),
      value: (
        <span className="opx-pill opx-fpill" data-tone={phase ? PHASE_TONE[phase] : "mute"}>
          {phaseLabel}
        </span>
      ),
    });
  }
  if (status && status !== "open") {
    facts.push({
      icon: <IcFlag size={17} />,
      label: t("filterLabel"),
      value: (
        <span className="opx-pill opx-fpill" data-tone={REVIEW_TONE[reviewTone(status)]}>
          {pill}
        </span>
      ),
    });
  }
  if (review.createdAt) facts.push({ icon: <IcClock size={17} />, label: tx("created"), value: shortDateTime(review.createdAt, locale) });
  if (res?.resolvedAt) facts.push({ icon: <IcCheck size={17} />, label: t("status.resolved"), value: shortDateTime(res.resolvedAt, locale) });

  const foot = done ? (
    <PanelFoot primary={finish} primaryLabel={t("dialog.close")} kbd={false} />
  ) : detail.loading ? (
    <PanelFoot onCancel={onClose} />
  ) : open && !terminal ? (
    <PanelFoot onCancel={onClose} primary={() => void submit()} primaryLabel={action ? t(`dialog.submit.${action}`) : t("dialog.submitAny")} busy={busy} danger={action === "cancel" || action === "refund"} />
  ) : (
    <PanelFoot onCancel={onClose} cancelLabel={t("dialog.close")} />
  );

  return (
    <>
      <div className="opx-pscroll" ref={box}>
        {done ? (
          <CancelDone done={done} />
        ) : detail.loading ? (
          <Loading label={t("loading")} />
        ) : (
          <>
            {detail.failed ? <Note tone="warn">{t("item.detailError")}</Note> : null}
            <div className="opx-pgrid2">
              <PartyCard role={t("item.client")} name={<PersonName id={ctx.clientUserId} name={ctx.clientName} />} phone={ctx.clientPhone || undefined} />
              <PartyCard role={t("item.seller")} name={<PersonName id={ctx.sellerUserId} name={ctx.sellerName} />} phone={ctx.sellerPhone || undefined} extra={roleLabel ? <span>{roleLabel}</span> : undefined} />
            </div>
            <FactStrip facts={facts} />
            <CaseBox
              icon={<IcFlag size={18} />}
              label={reasonLabel}
              title={requester && (requester.name || requester.id) ? <PersonName id={requester.id} name={requester.name} /> : undefined}
              aside={ctx.deadlinePaused || ctx.expectedCompletedAt || ctx.startedAt ? <DeadlineAside ctx={ctx} /> : undefined}
            >
              <p>{review.reason.trim() ? review.reason : t("item.noReason")}</p>
            </CaseBox>
            <FilesRow files={review.resultFiles} />
            <div className="opx-pcols">
              <div className="opx-cx-col">
                <HistorySection items={review.history} />
                <ChecklistSection items={review.checklist} />
                <PaymentSection pay={pay} />
              </div>
              <div className="opx-cx-col">
                {general ? (
                  <div data-cx="error">
                    <Note tone="bad">
                      <b>{t("dialog.errorTitle")}</b> {t(general.key)}
                    </Note>
                  </div>
                ) : null}
                {open && !terminal ? (
                  <Section icon={<IcScale size={17} />} title={t("dialog.title")}>
                    <Note tone="info">{t("dialog.privacyNote")}</Note>
                    <div data-cx="action">
                      <Choice label={t("dialog.action")} options={options} value={action} onChange={pickAction} error={say(shown.action)} />
                    </div>
                    {paid && actions.includes("cancel") && !action ? <p className="opx-cx-sub">{t("dialog.cancelPaid")}</p> : null}
                    {action === "new_price" ? (
                      <div data-cx="amount">
                        <Field
                          label={t("dialog.amount")}
                          value={amountText}
                          onChange={setAmount}
                          required
                          inputMode="numeric"
                          placeholder="0"
                          hint={ctx.price > 0 ? t("dialog.amountHelp", { price: money(ctx.price) }) : undefined}
                          error={say(shown.amount)}
                        />
                      </div>
                    ) : null}
                    {action === "reassign" ? (
                      <>
                        <div data-cx="lawyer">
                          <SellerPick
                            label={t("dialog.seller")}
                            required
                            hint={t("dialog.sellerHelp")}
                            error={say(shown.lawyer)}
                            value={draft.lawyerUserId}
                            serviceId={ctx.serviceId}
                            excludeUserId={ctx.sellerUserId}
                            onChange={(id, name) => {
                              setSellerName(name);
                              update({ lawyerUserId: id }, "lawyer");
                            }}
                          />
                        </div>
                        <Note tone="info">{t("dialog.reassignNote")}</Note>
                      </>
                    ) : null}
                    {action === "refund" ? (
                      <Note tone="warn">
                        <b>{t("dialog.refundTitle")}</b>
                        <br />
                        {ctx.price > 0 ? t("dialog.refundAmount", { price: money(ctx.price) }) : t("dialog.refundAmountUnknown")}
                        <br />
                        {t("dialog.refundOnce")}
                      </Note>
                    ) : null}
                    {action ? (
                      <div data-cx="clientReason">
                        <Field
                          label={t("dialog.clientReason")}
                          value={draft.clientReason}
                          onChange={(v) => update({ clientReason: v }, "clientReason")}
                          max={CLIENT_REASON_MAX}
                          multiline
                          rows={2}
                          placeholder={t.has(`dialog.clientReasonPh.${action}`) ? t(`dialog.clientReasonPh.${action}`) : undefined}
                          hint={t("dialog.clientReasonHelp")}
                          error={say(shown.clientReason)}
                        />
                      </div>
                    ) : null}
                    <div data-cx="note">
                      <Field
                        label={t("dialog.note")}
                        value={draft.note}
                        onChange={(v) => update({ note: v }, "note")}
                        max={NOTE_MAX}
                        multiline
                        placeholder={t("dialog.notePh")}
                        hint={t("dialog.noteHelp")}
                        error={say(shown.note)}
                      />
                    </div>
                  </Section>
                ) : !open && res ? (
                  <OutcomeSection res={res} clientReason={review.clientVisibleReason} />
                ) : null}
                <CancelChat review={review} open={open} />
              </div>
            </div>
          </>
        )}
      </div>
      {foot}
    </>
  );
}
