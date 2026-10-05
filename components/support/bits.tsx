"use client";

import { useLocale, useTranslations } from "next-intl";
import type { SupportTicket } from "@/lib/services/support";
import { shortDateTime } from "@/lib/date";

export function SupportStatus({ status }: { status: string }) {
  const t = useTranslations("support");
  return <span className={`spill spill--${status}`}>{t.has(`status.${status}`) ? t(`status.${status}`) : status}</span>;
}

export function TicketCard({
  ticket,
  active,
  unread,
  showClient,
  onOpen,
  extra,
}: {
  ticket: SupportTicket;
  active: boolean;
  unread?: number;
  showClient?: boolean;
  onOpen: () => void;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const cat = t.has(`categories.${ticket.category}`) ? t(`categories.${ticket.category}`) : ticket.category;
  return (
    <div className={`supcard${active ? " is-on" : ""}${unread ? " has-new" : ""}`} data-ai-target={`support-ticket:${ticket.id}`}>
      <button type="button" className="supcard__main" onClick={onOpen} aria-current={active || undefined}>
        <span className="supcard__top">
          <span className="supcard__id">{ticket.workId || ticket.id.slice(0, 8)}</span>
          <SupportStatus status={ticket.status} />
          {unread ? <span className="supcard__new">{unread}</span> : null}
        </span>
        <b className="supcard__t">{showClient && ticket.clientName ? ticket.clientName : ticket.title || t("untitled")}</b>
        {ticket.lastMessage ? <span className="supcard__last">{ticket.lastMessage}</span> : null}
        <span className="supcard__meta">
          <span>{cat}</span>
          {showClient ? <span className={`supcard__prio supcard__prio--${ticket.priority}`}>{t.has(`priorities.${ticket.priority}`) ? t(`priorities.${ticket.priority}`) : ticket.priority}</span> : null}
          {ticket.operatorName ? <span>{t("operatorIs", { name: ticket.operatorName })}</span> : null}
          <time dateTime={ticket.updatedAt}>{ticket.updatedAt ? shortDateTime(ticket.updatedAt, locale) : ""}</time>
        </span>
      </button>
      {extra}
    </div>
  );
}
