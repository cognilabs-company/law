"use client";

import "./deal.css";
import { useId, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { useMarketError } from "@/components/marketplace/useMarketError";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { parseServerTime } from "@/lib/http";
import { marketChatHref, type MarketSignal } from "@/lib/services/marketplace";
import { marketErrorInfo, requestCancellationReview, type CancellationReview } from "@/lib/services/marketRuntime";
import { MessageSquareTextIcon, LifeBuoyIcon } from "./icons";
import { SECTION_ID, type OrderSectionProps } from "./types";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

// Contract 2026-10-26 §4: a reason of 3–2000 characters.
export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 2000;

const OUTCOMES = ["continue", "new_price", "cancel", "reassign", "refund"];

type Held = { outcome: string; groupRoomId: string; amount: number };

function resolutionOf(sig: MarketSignal | null): Held | null | undefined {
  if (!sig || sig.kind !== "review") return undefined;
  if (sig.sub === "resolved") return { outcome: sig.outcome ?? "", groupRoomId: sig.groupRoomId ?? "", amount: sig.amount ?? 0 };
  if (sig.sub === "created") return null;
  return undefined;
}

export function isReviewResolved(review: CancellationReview | null): boolean {
  return !!review && (!!review.action || !!review.resolvedAt || /resolv|closed|done/.test(review.status));
}

export default function CancellationRequest({ o, phase, view, aiBase, onChanged, lastSignal }: OrderSectionProps & { lastSignal: MarketSignal | null }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail");
  const tOutcome = useTranslations("marketplace.toast.review.outcome");
  const te = useTranslations("enums");
  const locale = useLocale();
  const marketError = useMarketError();
  const uid = useId();
  const [held, setHeld] = useState<Held | null>(() => resolutionOf(lastSignal) ?? null);
  const [seenSignal, setSeenSignal] = useState(lastSignal);
  if (seenSignal !== lastSignal) {
    setSeenSignal(lastSignal);
    const next = resolutionOf(lastSignal);
    if (next !== undefined) setHeld(next);
  }
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState("");
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();
  const [error, setError] = useState<SxDialogErrorText>(null);

  const review = o.cancellationReview;
  const resolved = isReviewResolved(review);
  const ai = `${aiBase}.cancel-review`;
  const showReview = (phase === "review" || (!!review && !resolved)) && !(held && !resolved);
  const showResolution = resolved || !!held;
  const allowed = o.canRequestCancellation ?? (view === "seller" && (phase === "paid" || phase === "in_progress"));
  const showRequest = allowed && !(review && !resolved) && !showReview;

  if (!showReview && !showResolution && !showRequest) return null;

  const cur = (v: number) => `${fmtUzs(v)} ${!o.currency || o.currency === "UZS" ? te("currency") : o.currency}`;
  const stamp = (iso: string): string => {
    const at = iso ? parseServerTime(iso) : NaN;
    return Number.isFinite(at) ? shortDateTime(new Date(at).toISOString(), locale) : "";
  };

  const reasonId = `${uid}-reason`;
  const errId = `${uid}-err`;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
    setReasonErr("");
  };

  const submit = async () => {
    if (busy || !once()) return;
    const text = reason.trim();
    if (text.length < CANCEL_REASON_MIN) {
      setReasonErr(t("cancel.reasonShort", { n: CANCEL_REASON_MIN }));
      if (typeof document !== "undefined") document.getElementById(reasonId)?.focus();
      return;
    }
    setReasonErr("");
    setError(null);
    setBusy(true);
    try {
      const r = await requestCancellationReview(o.id, text, o.urls.cancellationReview);
      const filled: CancellationReview = { ...r, orderId: r.orderId || o.id, reason: r.reason || text, status: r.status || "open" };
      setOpen(false);
      setReason("");
      onChanged({ status: "cancellation_review", cancellationReview: filled, deadlinePaused: true });
    } catch (e) {
      const info = marketErrorInfo(e);
      if (info?.status === 409 && /exist|already|open/.test(info.code)) {
        setOpen(false);
        setReason("");
        onChanged();
        return;
      }
      const fallback = t("cancel.error");
      const msg = marketError(e, fallback);
      setError({ title: fallback, text: msg === fallback ? "" : msg });
      if (info?.status === 409) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const outcomeRaw = (resolved && review ? review.action : held?.outcome || review?.action || "").toLowerCase();
  const outcome = OUTCOMES.includes(outcomeRaw) ? outcomeRaw : "other";
  const newPrice = outcome === "new_price" ? (resolved && review?.amount ? review.amount : held?.amount || review?.amount || 0) : 0;
  const groupRoomRaw = (resolved && review?.groupChatRoomId) || held?.groupRoomId || review?.groupChatRoomId || "";
  // The separate cancellation discussion the call center may open (contract
  // 2026-10-26 §6); a legacy group room id is the same idea. Never the
  // service chat itself.
  const discussion = review?.discussion ?? null;
  const roomRaw = discussion?.roomId || groupRoomRaw;
  const groupRoomId = roomRaw && roomRaw !== o.roomId && roomRaw !== review?.serviceChatRoomId ? roomRaw : "";
  const discussionClosed = !!discussion && discussion.readOnly && discussion.roomId === groupRoomId;
  // Only the line meant for the client and seller (client_visible_reason);
  // the operator's internal note is never shown here.
  const resolvedNote = resolved && review ? review.clientVisibleReason.trim() : "";
  const discussionBlock = groupRoomId ? (
    <div className="mcr-group" data-closed={discussionClosed || undefined}>
      <p>{discussionClosed ? t("cancel.discussionClosed") : t("cancel.groupChatText")}</p>
      <SxLinkButton variant={discussionClosed ? "secondary" : "primary"} icon={MessageSquareTextIcon} href={marketChatHref({ roomId: groupRoomId, workId: o.workId, serviceTitle: o.serviceTitle })} aiId={`${ai}.group-chat`}>
        {discussionClosed ? t("cancel.discussionHistory") : t("cancel.openGroupChat")}
      </SxLinkButton>
    </div>
  ) : null;

  const reviewPanel = showReview ? (
    <SxPanel id={SECTION_ID.cancel} className="mcr mcr-review" title={t("cancel.reviewTitle")} lead={view === "client" ? o.clientMessage || t("cancel.reviewClient") : t("cancel.reviewSeller")} aiId={ai}>
      {review?.reason ? (
        <figure className="mcr-quote">
          <figcaption>{t("cancel.reviewReason")}</figcaption>
          <blockquote>{review.reason}</blockquote>
        </figure>
      ) : null}
      {review?.createdAt && stamp(review.createdAt) ? <p className="mcr-meta">{t("cancel.reviewSent", { date: stamp(review.createdAt) })}</p> : null}
      {!showResolution ? discussionBlock : null}
    </SxPanel>
  ) : null;

  const resolutionPanel = showResolution ? (
    <SxPanel id={showReview ? undefined : SECTION_ID.cancel} className="mcr mcr-resolved" title={t("cancel.resolvedTitle")} aiId={`${ai}.resolution`}>
      <p className="mcr-outcome">{tOutcome(outcome)}</p>
      {newPrice > 0 ? <p className="mcr-price sx-num">{t("cancel.newPrice", { price: cur(newPrice) })}</p> : null}
      {resolvedNote ? (
        <figure className="mcr-quote">
          <figcaption>{t("cancel.resolvedNote")}</figcaption>
          <blockquote>{resolvedNote}</blockquote>
        </figure>
      ) : null}
      {discussionBlock}
    </SxPanel>
  ) : null;

  const requestPanel = showRequest ? (
    <SxPanel id={showReview || showResolution ? undefined : SECTION_ID.cancel} className="mcr mcr-request" title={t("cancel.problemTitle")} lead={t("cancel.problemLead")} aiId={`${ai}.problem`}>
      <div className="mcr-actions">
        <SxButton
          variant="secondary"
          icon={LifeBuoyIcon}
          onClick={() => {
            setError(null);
            setReasonErr("");
            setOpen(true);
          }}
          aiId={`${ai}.open`}
        >
          {t("cancel.request")}
        </SxButton>
      </div>
      <SxDialog
        open={open}
        onClose={close}
        title={t("cancel.dialogTitle")}
        description={t("cancel.dialogLead")}
        busy={busy}
        dirty={!!reason.trim()}
        initialFocus="textarea"
        aiId={`${ai}.modal`}
        footer={
          <>
            <SxButton variant="primary" busy={busy} onClick={() => void submit()} aria-describedby={error ? errId : undefined} aiId={`${ai}.submit`}>
              {busy ? t("cancel.sending") : t("cancel.submit")}
            </SxButton>
            <SxButton variant="ghost" onClick={close} disabled={busy} aiId={`${ai}.keep`}>
              {t("cancel.keep")}
            </SxButton>
          </>
        }
      >
        <SxDialogError error={error} id={errId} />
        <Field id={reasonId} label={t("cancel.reason")} required error={reasonErr}>
          {(a11y) => (
            <TextArea
              {...a11y}
              value={reason}
              onChange={(v) => {
                setReason(v.slice(0, CANCEL_REASON_MAX));
                if (reasonErr && v.trim().length >= CANCEL_REASON_MIN) setReasonErr("");
              }}
              maxLength={CANCEL_REASON_MAX}
              counter
              minRows={4}
              placeholder={t("cancel.reasonPh")}
              disabled={busy}
              aiId={`${ai}.reason`}
              aiLabel={t("cancel.reason")}
            />
          )}
        </Field>
      </SxDialog>
    </SxPanel>
  ) : null;

  return (
    <>
      {reviewPanel}
      {resolutionPanel}
      {requestPanel}
    </>
  );
}
