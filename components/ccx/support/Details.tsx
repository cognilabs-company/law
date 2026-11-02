"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { shortDateTime } from "@/lib/date";
import { humanize } from "@/lib/labels";
import { openRaConsole } from "@/lib/remoteAssist/store";
import { isClosedStatus, isUrgentPriority, isWaitingTicket, timeOf, type SupportCallKind, type SupportMessage, type SupportTicket } from "@/lib/services/support";
import type { AssistContext } from "@/lib/services/supportAssist";
import { minutesSince, useSupportLabels, waitText } from "@/components/support/bits";
import PersonName from "@/components/ui/PersonName";
import { CopyButton } from "../now/NowFocus";
import { Loading, PartyCard, Timeline, type Step } from "../panel/bits";
import { IcClock, IcDoc, IcFlag, IcLayers, IcPhone, IcShield, IcTimeline, IcUser } from "../icons";
import { IcBubble, IcScreen, IcVideo } from "./icons";
import { priorityTone, statusTone, waitTone, whoOf } from "./model";

type Props = {
  ticket: SupportTicket;
  ctx: AssistContext | null;
  msgs: SupportMessage[];
  meId: string;
  now: number | null;
  mine: boolean;
  callable: boolean;
  calling: SupportCallKind | "";
  raCall: string;
  onCall: (kind: SupportCallKind) => void;
};

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div>
      <dt>
        <span className="opx-sx-facts__ic" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function Details({ ticket, ctx, msgs, meId, now, mine, callable, calling, raCall, onCall }: Props) {
  const t = useTranslations("support");
  const ta = useTranslations("support.assist");
  const tc = useTranslations("common");
  const tp = useTranslations("admin.ccx.panel");
  const tx = useTranslations("admin.ccx.support");
  const locale = useLocale();
  const labels = useSupportLabels();

  if (!ticket.status) return <Loading label={tp("loading")} />;

  const client = ctx?.client ?? null;
  const clientUserId = ticket.clientUserId;
  const fromMsgs = msgs.find((m) => m.senderUserId && m.senderUserId === clientUserId && m.senderName)?.senderName ?? "";
  const name = client?.name || ticket.clientName || fromMsgs;
  const lexgoId = client?.lexgoId || ticket.clientLexgoId;
  const phone = client?.phone ?? "";
  const account = client?.accountStatus && client.accountStatus !== "active" ? client.accountStatus : "";
  const waiting = isWaitingTicket(ticket);
  const waited = waiting ? minutesSince(ticket.createdAt, now) : null;
  const source = ticket.source;
  const channel = source ? (tx.has(`source.${source}`) ? tx(`source.${source}`) : humanize(source)) : "";
  const status = t.has(`status.${ticket.status}`) ? t(`status.${ticket.status}`) : humanize(ticket.status);
  const tid = ticket.id;

  const steps: Step[] = [];
  if (ticket.createdAt) steps.push({ id: "created", at: ticket.createdAt, title: tx("history.created"), sub: channel || undefined });
  const reply = msgs.find((m) => {
    const who = whoOf(m, meId, clientUserId);
    return who === "staff" || who === "me";
  });
  if (reply) steps.push({ id: `reply-${reply.id}`, at: reply.createdAt, title: tx("history.firstReply"), sub: reply.senderName || undefined });
  for (const m of msgs) {
    if (whoOf(m, meId, clientUserId) === "sys" && m.content.trim()) steps.push({ id: `sys-${m.id}`, at: m.createdAt, title: m.content.trim() });
  }
  if (isClosedStatus(ticket.status) && ticket.closedAt) steps.push({ id: "closed", at: ticket.closedAt, title: t("closedBanner"), sub: ticket.resolution || undefined });
  const history = steps
    .map((s, i) => ({ s, i, at: timeOf(s.at) }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.s);

  return (
    <div className="opx-sx-details" data-ai-private>
      <PartyCard
        role={t("client")}
        name={name || ta("client.noName")}
        phone={phone || undefined}
        lexgoId={lexgoId || undefined}
        extra={
          <>
            {account ? (
              <span className="opx-pill opx-sx-pill" data-tone="warn">
                {ta("client.account", { status: humanize(account) })}
              </span>
            ) : null}
            {callable ? (
              <span className="opx-sx-calls" role="group" aria-label={t("call.group")} data-ai-id={tid ? aiId("call_center.support.ticket", tid, "call") : undefined} data-ai-type="call_button">
                <button
                  type="button"
                  className="opx-sx-cbtn"
                  onClick={() => onCall("audio")}
                  disabled={Boolean(calling)}
                  aria-busy={calling === "audio" || undefined}
                  aria-label={ta("client.callAudio")}
                  title={ta("client.callAudio")}
                  data-ai-id={tid ? aiId("call_center.support.ticket", tid, "call", "audio") : undefined}
                  data-ai-type="call_button"
                >
                  <IcPhone size={14} />
                  {calling === "audio" ? t("call.starting") : ta("client.audio")}
                </button>
                <button
                  type="button"
                  className="opx-sx-cbtn"
                  onClick={() => onCall("video")}
                  disabled={Boolean(calling)}
                  aria-busy={calling === "video" || undefined}
                  aria-label={ta("client.callVideo")}
                  title={ta("client.callVideo")}
                  data-ai-id={tid ? aiId("call_center.support.ticket", tid, "call", "video") : undefined}
                  data-ai-type="call_button"
                >
                  <IcVideo size={14} />
                  {calling === "video" ? t("call.starting") : ta("client.video")}
                </button>
                {mine ? (
                  <button
                    type="button"
                    className="opx-sx-cbtn"
                    onClick={() => openRaConsole({ ticketId: tid, clientName: name || "", workId: ticket.workId })}
                    disabled={!raCall}
                    title={raCall ? t("call.remoteAssistHint") : t("call.remoteAssistNeedCall")}
                    data-ai-id={tid ? aiId("call_center.support.ticket", tid, "remote_assist") : undefined}
                    data-ai-type="call_button"
                  >
                    <IcScreen size={14} />
                    {t("call.remoteAssist")}
                  </button>
                ) : null}
              </span>
            ) : null}
          </>
        }
      />

      <dl className="opx-sx-facts">
        <Row icon={<IcLayers size={16} />} label={t("queue.topic")}>
          {labels.category(ticket.category) || tc("none")}
        </Row>
        <Row icon={<IcBubble size={16} />} label={tx("channel")}>
          {channel || tc("none")}
        </Row>
        <Row icon={<IcTimeline size={16} />} label={t("createdAt")}>
          <span className="opx-num">{ticket.createdAt ? shortDateTime(ticket.createdAt, locale) : tc("none")}</span>
        </Row>
        {waiting ? (
          <Row icon={<IcClock size={16} />} label={t("queue.waiting")}>
            <span className="opx-pill opx-sx-pill opx-num" data-tone={waitTone(waited)}>
              {waitText(t, ticket.createdAt, now) || tc("none")}
            </span>
          </Row>
        ) : (
          <Row icon={<IcShield size={16} />} label={t("statusLabel")}>
            <span className="opx-pill opx-sx-pill" data-tone={statusTone(ticket.status)}>
              {status}
            </span>
          </Row>
        )}
        <Row icon={<IcFlag size={16} />} label={t("priority")}>
          {isUrgentPriority(ticket.priority) ? (
            <span className="opx-pill opx-sx-pill" data-tone={priorityTone(ticket.priority)}>
              {labels.priority(ticket.priority)}
            </span>
          ) : (
            labels.priority(ticket.priority) || tc("none")
          )}
        </Row>
        <Row icon={<IcUser size={16} />} label={t("operator")}>
          {ticket.operatorUserId || ticket.operatorName ? <PersonName id={ticket.operatorUserId} name={ticket.operatorName} /> : tc("none")}
        </Row>
        {ticket.workId ? (
          <Row icon={<IcDoc size={16} />} label={tx("ticketId")}>
            <span className="opx-sx-wid opx-num">
              {ticket.workId}
              <CopyButton value={ticket.workId} label={tx("ticketId")} />
            </span>
          </Row>
        ) : null}
      </dl>

      <Timeline steps={history} empty={tc("none")} />
    </div>
  );
}
