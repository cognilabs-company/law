"use client";

import { useTranslations } from "next-intl";
import { useRaSupportCall } from "@/lib/remoteAssist/store";
import { isClosedStatus, ticketTitle, type SupportTicket } from "@/lib/services/support";
import type { AssistCapabilities, AssistContext } from "@/lib/services/supportAssist";
import { useSupportCall } from "@/components/support/bits";
import AssistPanel from "@/components/support/assist/AssistPanel";
import { IcClose } from "../icons";
import { IcLock } from "./icons";
import { ChatHead, ClosedBanner, Composer, MessageLog } from "./Chat";
import Details from "./Details";
import { useTicketChat } from "./useTicketChat";

export type Side = "details" | "assist";

type Props = {
  ticket: SupportTicket;
  meId: string;
  now: number | null;
  busy: boolean;
  mine: boolean;
  isOpen: boolean;
  claimable: boolean;
  watching: boolean;
  transferOff: boolean;
  callOff: boolean;
  ctx: AssistContext | null;
  missing: boolean;
  assistKey: number;
  side: Side;
  assistOn: boolean;
  info: boolean;
  onSide: (side: Side) => void;
  onInfo: (open: boolean) => void;
  onClaim: () => void;
  onTransfer: () => void;
  onClose: () => void;
  onBack: () => void;
  onTicket: (tk: SupportTicket) => void;
  onMissing: (ticketId: string) => void;
  onActed: (ticketId: string) => void;
  onCaps: (ticketId: string, caps: AssistCapabilities) => void;
};

export default function Desk(p: Props) {
  const t = useTranslations("support");
  const tp = useTranslations("admin.ccx.panel");
  const tx = useTranslations("admin.ccx.support");
  const { ticket, meId } = p;
  const { bindBox, ...chat } = useTicketChat({ ticket, meId, onTicket: p.onTicket, onMissing: p.onMissing });
  const call = useSupportCall(ticket.id, ticket.workId);
  const raCall = useRaSupportCall(ticket.id);
  const known = Boolean(ticket.status);
  const closed = isClosedStatus(ticket.status);
  const canWrite = p.mine && p.isOpen;
  const callable = canWrite && !p.callOff && known && !closed && chat.state !== "missing";
  const title = known ? ticketTitle(ticket, t("untitled")) : t("aiLabels.clientChat");

  return (
    <>
      <section
        className="opx-sx-col opx-sx-conv"
        aria-label={title}
        data-ai-target="support:chat"
        data-ai-id="call_center.support.chat"
        data-ai-type="chat"
        data-ai-label={t("aiLabels.clientChat")}
        data-ai-entity-type="support_ticket"
        data-ai-entity-id={ticket.id || undefined}
      >
        <ChatHead
          ticket={ticket}
          mine={p.mine}
          isOpen={p.isOpen}
          claimable={p.claimable}
          busy={p.busy}
          transferOff={p.transferOff}
          gone={chat.state === "missing"}
          info={p.info}
          onInfo={p.onInfo}
          onClaim={p.onClaim}
          onTransfer={p.onTransfer}
          onClose={p.onClose}
          onBack={p.onBack}
        />
        <MessageLog chat={chat} bindBox={bindBox} ticket={ticket} meId={meId} now={p.now} onBack={p.onBack} />
        {closed ? <ClosedBanner ticket={ticket} /> : chat.state === "missing" ? null : <Composer chat={chat} ticket={ticket} canWrite={canWrite} claimable={p.claimable} />}
      </section>

      <aside className={`opx-sx-col opx-sx-info${p.info ? " is-open" : ""}`} aria-label={tx("details")}>
        <div className="opx-sx-info__bar">
          <div className="opx-sx-switch" role="group">
            <button type="button" aria-pressed={p.side === "details"} className={p.side === "details" ? "is-on" : undefined} onClick={() => p.onSide("details")}>
              {tx("details")}
            </button>
            <button
              type="button"
              aria-pressed={p.side === "assist"}
              className={p.side === "assist" ? "is-on" : undefined}
              onClick={() => p.onSide("assist")}
              data-ai-id="call_center.support.view.assist"
            >
              {t("assist.title")}
            </button>
          </div>
          <button type="button" className="opx-sx-x" onClick={() => p.onInfo(false)} aria-label={tp("close")} title={tp("close")}>
            <IcClose size={17} />
          </button>
        </div>
        <div className="opx-sx-info__body" hidden={p.side !== "details"}>
          {!known && chat.state === "missing" ? (
            <div className="opx-sx-state">
              <IcLock size={24} />
              <p>{t("chat.missing")}</p>
            </div>
          ) : (
            <Details
              ticket={ticket}
              ctx={p.ctx}
              msgs={chat.msgs}
              meId={meId}
              now={p.now}
              mine={p.mine}
              callable={callable}
              calling={call.calling}
              raCall={raCall}
              onCall={(k) => void call.start(k)}
            />
          )}
        </div>
        {p.assistOn ? (
          <div className="opx-sx-info__body opx-sx-assist" hidden={p.side !== "assist"}>
            <AssistPanel
              ticket={ticket}
              mine={p.mine && p.isOpen}
              readOnly={p.watching}
              missing={p.missing}
              refreshKey={p.assistKey}
              onCall={(k) => void call.start(k)}
              calling={call.calling}
              onActed={p.onActed}
              onCapabilities={p.onCaps}
            />
          </div>
        ) : null}
      </aside>
    </>
  );
}
