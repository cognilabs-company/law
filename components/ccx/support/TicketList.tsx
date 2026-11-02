"use client";

import { useLocale, useTranslations } from "next-intl";
import { errorText } from "@/lib/errorText";
import { humanize } from "@/lib/labels";
import { aiId } from "@/lib/ai/ids";
import { isActiveTicket, isClosedStatus, isUrgentPriority, isWaitingTicket, ticketTitle, type SupportTicket } from "@/lib/services/support";
import { agoText, lastPreview, minutesSince, useSupportLabels, waitText } from "@/components/support/bits";
import { IcCheck, IcClock, IcRefresh, IcSupport, IcUser } from "../icons";
import { IcAlert, IcBubble, IcSort } from "./icons";
import { codeOf, priorityTone, statusTone, waitShare, waitTone, type Order } from "./model";

type Props = {
  items: SupportTicket[];
  status: "loading" | "ready" | "error";
  error: unknown;
  count: number;
  order: Order;
  claimTab: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  searching: boolean;
  selectedId: string;
  meId: string;
  now: number | null;
  busy: boolean;
  onOrder: (o: Order) => void;
  onRetry: () => void;
  onMore: () => void;
  onOpen: (tk: SupportTicket) => void;
  onClaim: (tk: SupportTicket) => void;
};

export default function TicketList(p: Props) {
  const t = useTranslations("support");
  const tq = useTranslations("admin.ccx.queues");
  const tc = useTranslations("common");
  const tp = useTranslations("admin.ccx.panel");
  const tx = useTranslations("admin.ccx.support");
  return (
    <aside className="opx-sx-col opx-sx-list" aria-label={t("queueTitle")}>
      <div className="opx-sx-list__bar">
        <span className="opx-sx-list__n opx-num">{p.status === "ready" && p.items.length ? tx("count", { n: p.count }) : ""}</span>
        <label className="opx-sx-sort">
          <span className="opx-sr">{tq("sortAria")}</span>
          <IcSort size={16} />
          <select value={p.order} onChange={(e) => p.onOrder(e.target.value === "new" ? "new" : "old")}>
            <option value="old">{tq("sort.old")}</option>
            <option value="new">{tq("sort.new")}</option>
          </select>
        </label>
      </div>
      <div className="opx-sx-items" data-ai-target="support:ticket-list" data-ai-id="call_center.support.queue" data-ai-type="list" data-ai-label={t("queueTitle")}>
        {p.status === "loading" ? (
          <div className="opx-sx-ghosts" aria-busy="true" aria-label={tp("loading")}>
            <i className="opx-shim" />
            <i className="opx-shim" />
            <i className="opx-shim" />
          </div>
        ) : p.status === "error" ? (
          <div className="opx-sx-empty" role="alert">
            <IcAlert size={26} />
            <p>{errorText(p.error, tc) || tc("serverError")}</p>
            <button type="button" className="opx-pbtn" onClick={p.onRetry}>
              <IcRefresh size={16} />
              {tc("retry")}
            </button>
          </div>
        ) : !p.items.length ? (
          <div className="opx-sx-empty">
            <IcSupport size={28} />
            <p>{p.searching ? t("chats.noMatch") : tx("empty")}</p>
            {p.searching ? <small>{t("chats.noMatchText")}</small> : null}
          </div>
        ) : (
          <ul className="opx-sx-ul">
            {p.items.map((tk, i) => (
              <TicketRow
                key={tk.id}
                ticket={tk}
                i={i}
                now={p.now}
                active={tk.id === p.selectedId}
                unread={tk.id !== p.selectedId && Boolean(p.meId) && tk.operatorUserId === p.meId && isActiveTicket(tk) ? tk.unreadCount : 0}
                claim={p.claimTab && isWaitingTicket(tk)}
                busy={p.busy}
                onOpen={p.onOpen}
                onClaim={p.onClaim}
              />
            ))}
          </ul>
        )}
        {p.hasMore && p.status === "ready" ? (
          <button type="button" className="opx-pbtn opx-sx-more" onClick={p.onMore} disabled={p.loadingMore} aria-busy={p.loadingMore}>
            {tc("loadMore")}
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function TicketRow({
  ticket,
  i,
  now,
  active,
  unread,
  claim,
  busy,
  onOpen,
  onClaim,
}: {
  ticket: SupportTicket;
  i: number;
  now: number | null;
  active: boolean;
  unread: number;
  claim: boolean;
  busy: boolean;
  onOpen: (tk: SupportTicket) => void;
  onClaim: (tk: SupportTicket) => void;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const labels = useSupportLabels();
  const title = ticketTitle(ticket, t("untitled"));
  const last = lastPreview(ticket, title);
  const when = ticket.lastMessageAt || ticket.updatedAt;
  const waiting = isWaitingTicket(ticket);
  const waited = waiting ? minutesSince(ticket.createdAt, now) : null;
  const tone = waitTone(waited);
  const cat = labels.category(ticket.category);
  const person = ticket.clientName || (ticket.clientLexgoId ? t("chat.lexgoId", { id: ticket.clientLexgoId }) : t("client"));
  const status = ticket.status ? (t.has(`status.${ticket.status}`) ? t(`status.${ticket.status}`) : humanize(ticket.status)) : "";
  const aiLabel = [ticket.workId, cat, status].filter(Boolean).join(" · ") || t("untitled");
  return (
    <li
      className={`opx-sx-item${active ? " is-on" : ""}${unread ? " has-new" : ""}${claim ? " has-claim" : ""}${isClosedStatus(ticket.status) ? " is-closed" : ""}`}
      data-tone={waiting ? tone : undefined}
      style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
      data-ai-target={`support-ticket:${ticket.id}`}
      data-ai-id={ticket.id ? aiId("call_center.support.ticket", ticket.id) : undefined}
      data-ai-type="list_item"
      data-ai-label={aiLabel}
      data-ai-entity-type="support_ticket"
      data-ai-entity-id={ticket.id || undefined}
      data-ai-private
    >
      <button type="button" className="opx-sx-item__main" onClick={() => onOpen(ticket)} aria-current={active || undefined}>
        <span className="opx-sx-item__top">
          <i className="opx-sx-dot" data-tone={priorityTone(ticket.priority)} aria-hidden="true" />
          <b className="opx-num">{codeOf(ticket)}</b>
          {isUrgentPriority(ticket.priority) ? (
            <span className="opx-sx-urg" data-tone={priorityTone(ticket.priority)}>
              {labels.priority(ticket.priority) || t("urgent")}
            </span>
          ) : null}
          {when ? (
            <time className="opx-num" dateTime={when}>
              {agoText(t, locale, when, now)}
            </time>
          ) : null}
          {unread ? (
            <span className="opx-sx-unread opx-num" title={t("unreadAria", { n: unread })}>
              <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
              <span className="opx-sr">{t("unreadAria", { n: unread })}</span>
            </span>
          ) : null}
        </span>
        <b className="opx-sx-item__title">{title}</b>
        <span className="opx-sx-item__line">
          <IcUser size={14} />
          <span>{person}</span>
        </span>
        {last ? (
          <span className={`opx-sx-item__line is-msg${unread ? " is-new" : ""}`}>
            <IcBubble size={14} />
            <span>{last}</span>
          </span>
        ) : null}
        {waiting ? (
          <span className="opx-sx-item__wait">
            <IcClock size={14} />
            <span className="opx-num">{waitText(t, ticket.createdAt, now) || t("queue.waiting")}</span>
            <i className="opx-sx-meter" aria-hidden="true">
              <i style={{ width: `${waitShare(waited)}%` }} />
            </i>
          </span>
        ) : (
          <span className="opx-sx-item__meta">
            {status ? (
              <span className="opx-pill opx-sx-pill" data-tone={statusTone(ticket.status)}>
                {status}
              </span>
            ) : null}
            {cat ? <span>{cat}</span> : null}
          </span>
        )}
        {isClosedStatus(ticket.status) && ticket.resolution ? (
          <span className="opx-sx-item__res">
            <IcCheck size={14} />
            <span>{ticket.resolution}</span>
          </span>
        ) : null}
      </button>
      {claim ? (
        <button
          type="button"
          className="opx-sx-claim"
          disabled={busy}
          onClick={() => onClaim(ticket)}
          data-ai-id={aiId("call_center.support.ticket", ticket.id, "claim")}
          data-ai-label={t("claim")}
        >
          <IcCheck size={15} />
          {t("claim")}
        </button>
      ) : null}
    </li>
  );
}
