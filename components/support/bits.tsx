"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { parseServerTime } from "@/lib/http";
import { shortDateTime } from "@/lib/date";
import { initials } from "@/lib/lawyers";
import { isWaitingTicket, ticketTitle, type SupportTicket } from "@/lib/services/support";
import { IconCheck, IconClock, IconHeadset, IconUser } from "@/components/icons";

type T = ReturnType<typeof useTranslations>;

const subscribeClock = (cb: () => void) => {
  const id = window.setInterval(cb, 30000);
  return () => window.clearInterval(id);
};
const readMinute = () => Math.floor(Date.now() / 60000);
const serverMinute = () => null;

export function useMinuteNow(): number | null {
  const minute = useSyncExternalStore<number | null>(subscribeClock, readMinute, serverMinute);
  return minute === null ? null : minute * 60000;
}

export function minutesSince(iso: string, now: number | null): number | null {
  if (now === null || !iso) return null;
  const at = parseServerTime(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now - at) / 60000));
}

export function agoText(t: T, locale: string, iso: string, now: number | null): string {
  const m = minutesSince(iso, now);
  if (m === null) return iso ? shortDateTime(iso, locale) : "";
  if (m < 1) return t("ago.now");
  if (m < 60) return t("ago.minutes", { n: m });
  if (m < 1440) return t("ago.hours", { n: Math.floor(m / 60) });
  if (m < 10080) return t("ago.days", { n: Math.floor(m / 1440) });
  return shortDateTime(iso, locale);
}

export function waitText(t: T, iso: string, now: number | null): string {
  const m = minutesSince(iso, now);
  if (m === null) return "";
  if (m < 1) return t("wait.now");
  if (m < 60) return t("wait.minutes", { n: m });
  if (m < 1440) return t("wait.hours", { h: Math.floor(m / 60), m: m % 60 });
  return t("wait.days", { n: Math.floor(m / 1440) });
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function SupportStatus({ status }: { status: string }) {
  const t = useTranslations("support");
  if (!status) return null;
  return (
    <span className={`spill spill--${status}`}>
      <i aria-hidden="true" />
      {t.has(`status.${status}`) ? t(`status.${status}`) : status}
    </span>
  );
}

export function TicketCard({
  ticket,
  active,
  unread,
  view,
  now,
  onOpen,
  extra,
}: {
  ticket: SupportTicket;
  active: boolean;
  unread?: number;
  view: "client" | "operator";
  now: number | null;
  onOpen: () => void;
  extra?: ReactNode;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const title = ticketTitle(ticket, t("untitled"));
  const cat = t.has(`categories.${ticket.category}`) ? t(`categories.${ticket.category}`) : ticket.category;
  const waiting = isWaitingTicket(ticket);
  const closed = ticket.status === "closed";
  const person = view === "client" ? ticket.operatorName : ticket.clientName;
  const heading = view === "operator" && person ? person : title;
  const when = ticket.lastMessageAt || ticket.updatedAt;
  const lead = flat(title).replace(/…$/, "").trim();
  const last = ticket.lastMessage && !(lead && flat(ticket.lastMessage).startsWith(lead)) ? ticket.lastMessage : "";
  const wait = view === "operator" && waiting ? waitText(t, ticket.createdAt, now) : "";
  return (
    <div className={`supitem${active ? " is-on" : ""}${unread ? " has-new" : ""}${closed ? " is-closed" : ""}`} data-ai-target={`support-ticket:${ticket.id}`}>
      <button type="button" className="supitem__main" onClick={onOpen} aria-current={active || undefined}>
        <span className={`supitem__av${view === "client" && waiting && !person ? " supitem__av--wait" : ""}`} aria-hidden="true">
          {person ? initials(person) : view === "client" ? <IconHeadset /> : <IconUser />}
        </span>
        <span className="supitem__body">
          <span className="supitem__top">
            <b className="supitem__t">{heading}</b>
            {when ? <time dateTime={when}>{agoText(t, locale, when, now)}</time> : null}
          </span>
          {view === "operator" && heading !== title ? <span className="supitem__sub">{title}</span> : null}
          {last ? <span className="supitem__last">{last}</span> : null}
          <span className="supitem__meta">
            <SupportStatus status={ticket.status} />
            {view === "client" && ticket.operatorName ? <span>{t("operatorIs", { name: ticket.operatorName })}</span> : null}
            {view === "operator" && ticket.clientLexgoId ? <span>{t("chat.lexgoId", { id: ticket.clientLexgoId })}</span> : null}
            {cat ? <span>{cat}</span> : null}
            {ticket.priority === "high" ? <span className="supitem__urgent">{t("urgent")}</span> : null}
            {wait ? (
              <span className="supitem__wait">
                <IconClock />
                {wait}
              </span>
            ) : null}
            {unread ? <span className="supitem__new">{unread}</span> : null}
          </span>
          {closed && ticket.resolution ? (
            <span className="supitem__res">
              <IconCheck />
              <span>{ticket.resolution}</span>
            </span>
          ) : null}
        </span>
      </button>
      {extra}
    </div>
  );
}
