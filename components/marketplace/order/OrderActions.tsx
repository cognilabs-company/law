"use client";

import { useId, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { SxPanel } from "@/components/admin/studio/sx/layout/Panel";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { errDetail, parseServerTime } from "@/lib/http";
import { startCall } from "@/lib/services/backend";
import { cancelMarketplaceOrder, marketChatHref, type MarketOrder, type MarketPhase } from "@/lib/services/marketplace";
import type { OrderChecklist } from "@/lib/services/marketRuntime";
import CompleteOrderDialog from "../CompleteOrderDialog";
import SupplementalDialog from "../SupplementalDialog";
import { useMarketError } from "../useMarketError";
import ContactAdvocate, { callStateOf } from "./ContactAdvocate";
import { MessageSquareTextIcon, CircleCheckIcon, CoinsIcon, PhoneIcon, VideoIcon, XIcon } from "./icons";
import type { OrderView } from "./types";

const REASON_MAX = 500;
const WORK_PHASES: ReadonlySet<MarketPhase> = new Set<MarketPhase>(["paid", "in_progress"]);
const CLOSED_PHASES: ReadonlySet<MarketPhase> = new Set<MarketPhase>(["completed", "rated", "cancelled"]);

export default function OrderActions({
  o,
  phase,
  view,
  aiBase,
  listHref,
  checklist,
  onChanged,
  onShowChecklist,
}: {
  o: MarketOrder;
  phase: MarketPhase;
  view: OrderView;
  aiBase: string;
  listHref: string;
  checklist: OrderChecklist | null;
  onChanged: (patch?: Partial<MarketOrder>) => void;
  onShowChecklist: () => void;
}): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail");
  const to = useTranslations("marketplace.orders");
  const marketErr = useMarketError();
  const router = useRouter();
  const reasonId = useId();
  const [calling, setCalling] = useState<"" | "audio" | "video">("");
  const [callErr, setCallErr] = useState("");
  const [supOpen, setSupOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<SxDialogErrorText>(null);

  const seller = view === "seller";
  const chat = o.canStartChat ? "open" : o.roomId && o.chatReadOnly ? "view" : "";
  const calls = o.canCreateCall && o.callsAllowed && !CLOSED_PHASES.has(phase);
  const contact = !seller && chat === "open";
  const supplemental = seller && WORK_PHASES.has(phase) && !o.workPaused && !!(o.serviceId || o.packageId);
  const complete = seller && o.canComplete && (o.explicit.complete ? !CLOSED_PHASES.has(phase) : phase === "in_progress" || (phase === "paid" && !o.canStart));
  const cancel = o.canCancel && (o.explicit.cancel ? !CLOSED_PHASES.has(phase) && phase !== "review" : view === "client" && phase === "pending");

  if (!chat && !calls && !supplemental && !complete && !cancel) return null;

  const counterpartId = view === "client" ? o.lawyerUserId : o.clientUserId;

  async function call(kind: "audio" | "video") {
    if (calling || !o.roomId) return;
    setCalling(kind);
    setCallErr("");
    try {
      const c = await startCall(o.roomId, kind, o.serviceTitle || o.workId || "LexGo", counterpartId ? { participantUserIds: [counterpartId] } : undefined);
      router.push(`/portal/chat/${encodeURIComponent(o.roomId)}?join=${encodeURIComponent(c.id)}`);
    } catch (e) {
      setCallErr(errDetail(e) || to("callError"));
      setCalling("");
    }
  }

  function closeCancel() {
    if (cancelBusy) return;
    setCancelOpen(false);
    setReason("");
    setCancelErr(null);
  }

  async function runCancel() {
    if (cancelBusy) return;
    setCancelBusy(true);
    setCancelErr(null);
    try {
      const r = await cancelMarketplaceOrder(o.id, reason, o.urls.cancel);
      setCancelOpen(false);
      setReason("");
      onChanged({ status: r.status, paymentStatus: r.paymentStatus, canCancel: false });
    } catch (e) {
      const fallback = to("cancelError");
      const msg = marketErr(e, fallback);
      setCancelErr({ title: fallback, text: msg === fallback ? "" : msg });
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <SxPanel title={t("actions.title")} className="mod-actions" as="section">
      <div className="mod-actions__list">
        {contact ? (
          <ContactAdvocate tone="sx" chatHref={marketChatHref(o)} roomId={o.roomId} callTitle={o.serviceTitle || o.workId || "LexGo"} counterpartId={counterpartId} calls={CLOSED_PHASES.has(phase) ? "closed" : callStateOf(o)} callTypes={o.callTypes} aiId={`${aiBase}.contact`} chatAiId={`${aiBase}.chat`} />
        ) : chat ? (
          <SxLinkButton variant={chat === "open" ? "primary" : "secondary"} icon={MessageSquareTextIcon} href={marketChatHref(o)} aiId={`${aiBase}.chat`}>
            {chat === "open" ? to("openChat") : t("actions.viewChat")}
          </SxLinkButton>
        ) : null}
        {calls && !contact ? (
          <div className="mod-actions__calls" role="group" aria-label={to("call")} data-ai-id={`${aiBase}.call`} data-ai-type="call_button" data-ai-label={to("call")}>
            {o.callTypes.includes("audio") ? (
              <SxButton icon={PhoneIcon} disabled={!!calling} onClick={() => void call("audio")}>
                {calling === "audio" ? to("calling") : to("audio")}
              </SxButton>
            ) : null}
            {o.callTypes.includes("video") ? (
              <SxButton icon={VideoIcon} disabled={!!calling} onClick={() => void call("video")}>
                {calling === "video" ? to("calling") : to("video")}
              </SxButton>
            ) : null}
          </div>
        ) : null}
        {callErr ? (
          <SxNote tone="error" role="alert">
            {callErr}
          </SxNote>
        ) : null}
        {supplemental ? (
          <SxButton icon={CoinsIcon} onClick={() => setSupOpen(true)} aiId={`${aiBase}.supplemental`}>
            {to("supplemental")}
          </SxButton>
        ) : null}
        {complete ? (
          <SxButton variant="primary" icon={CircleCheckIcon} disabled={o.workPaused} title={o.workPaused ? to("pausedHint") : undefined} onClick={() => setCompleteOpen(true)} aiId={`${aiBase}.complete`}>
            {to("complete")}
          </SxButton>
        ) : null}
        {cancel ? (
          <SxButton variant="danger" icon={XIcon} onClick={() => setCancelOpen(true)} aiId={`${aiBase}.cancel`}>
            {to("cancel")}
          </SxButton>
        ) : null}
      </div>

      {seller ? (
        <SupplementalDialog
          order={supOpen ? o : null}
          onClose={() => setSupOpen(false)}
          onSent={(s) => {
            if (s) onChanged({ supplemental: s, workPaused: s.status === "pending" });
            else onChanged();
          }}
        />
      ) : null}
      {seller ? (
        <CompleteOrderDialog
          order={completeOpen ? o : null}
          onClose={() => setCompleteOpen(false)}
          checklist={checklist}
          onShowChecklist={onShowChecklist}
          detailHref={`${listHref.replace(/\/+$/, "")}/${encodeURIComponent(o.id)}`}
          onDone={(status, r) => {
            const at = r?.ratingDeadlineAt ? parseServerTime(r.ratingDeadlineAt) : Number.NaN;
            onChanged({
              status,
              chatReadOnly: r?.chatReadOnly ?? true,
              callsAllowed: r?.callsAllowed ?? false,
              canComplete: false,
              canStartChat: false,
              canCreateCall: false,
              ...(r?.ratingDeadlineAt ? { rating: { ...o.rating, canRate: true, available: true, closed: false, deadlineAt: r.ratingDeadlineAt, expiresAt: Number.isFinite(at) ? at : 0 } } : {}),
            });
          }}
        />
      ) : null}
      {cancel || cancelOpen ? (
        <SxDialog
          open={cancelOpen}
          onClose={closeCancel}
          title={to("cancelTitle")}
          description={o.paymentStatus === "paid" ? t("actions.cancelPaidLead") : to("cancelLead")}
          busy={cancelBusy}
          dirty={!!reason.trim()}
          size="sm"
          aiId={`${aiBase}.cancel-modal`}
          footer={
            <>
              <SxButton variant="danger" busy={cancelBusy} onClick={() => void runCancel()}>
                {cancelBusy ? to("cancelling") : to("cancelConfirm")}
              </SxButton>
              <SxButton variant="ghost" disabled={cancelBusy} onClick={closeCancel}>
                {to("keep")}
              </SxButton>
            </>
          }
        >
          <Field id={reasonId} label={to("reason")}>
            {(a11y) => <TextArea {...a11y} value={reason} onChange={setReason} placeholder={to("reasonPh")} maxLength={REASON_MAX} counter minRows={3} />}
          </Field>
          <SxDialogError error={cancelErr} />
        </SxDialog>
      ) : null}
    </SxPanel>
  );
}
