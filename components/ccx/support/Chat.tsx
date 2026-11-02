"use client";

import { Fragment, useId, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { dateOnly, dateTimeFull, timeOnly } from "@/lib/date";
import { errorText } from "@/lib/errorText";
import { contactBlockedOf } from "@/lib/http";
import { humanize } from "@/lib/labels";
import { initials } from "@/lib/lawyers";
import { isUrgentPriority, ticketTitle, type SupportMessage, type SupportTicket } from "@/lib/services/support";
import ContactBlockedNote from "@/components/ContactBlockedNote";
import { useSupportLabels } from "@/components/support/bits";
import PersonName from "@/components/ui/PersonName";
import { IcArrowLeft, IcCheck, IcRefresh, IcUser } from "../icons";
import { IcAlert, IcBubble, IcClip, IcDownload, IcLock, IcPanel, IcSend, IcSpark, IcSwap } from "./icons";
import { QUICK, codeOf, fileSize, near, priorityTone, statusTone, whoOf, type Who } from "./model";
import type { TicketChat } from "./useTicketChat";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT = 4000;

type HeadProps = {
  ticket: SupportTicket;
  mine: boolean;
  isOpen: boolean;
  claimable: boolean;
  busy: boolean;
  transferOff: boolean;
  gone: boolean;
  info: boolean;
  onInfo: (open: boolean) => void;
  onClaim: () => void;
  onTransfer: () => void;
  onClose: () => void;
  onBack: () => void;
};

export function ChatHead({ ticket, mine, isOpen, claimable, busy, transferOff, gone, info, onInfo, onClaim, onTransfer, onClose, onBack }: HeadProps) {
  const t = useTranslations("support");
  const tx = useTranslations("admin.ccx.support");
  const labels = useSupportLabels();
  const uid = useId();
  const known = Boolean(ticket.status);
  const title = ticketTitle(ticket, t("untitled"));
  const status = ticket.status ? (t.has(`status.${ticket.status}`) ? t(`status.${ticket.status}`) : humanize(ticket.status)) : "";
  const person = ticket.clientName || (ticket.clientLexgoId ? t("chat.lexgoId", { id: ticket.clientLexgoId }) : t("client"));
  const own = mine && isOpen;
  const reason = !known
    ? null
    : ticket.status === "reopened" && ticket.reopenReason
      ? { label: t("queue.reopenReason"), text: ticket.reopenReason }
      : ticket.status === "transferred" && ticket.transferReason
        ? { label: t("queue.transferReason"), text: ticket.transferReason }
        : null;
  const tid = ticket.id;
  return (
    <>
      <header className="opx-sx-chead">
        <button type="button" className="opx-sx-back" onClick={onBack} aria-label={t("back")} title={t("back")}>
          <IcArrowLeft size={18} />
        </button>
        <span className="opx-sx-chead__ic" aria-hidden="true">
          <IcBubble size={20} />
        </span>
        <div className="opx-sx-chead__txt" data-ai-private>
          {known ? (
            <>
              <span className="opx-sx-chead__row">
                <h3>{title}</h3>
                <span className="opx-pill opx-sx-pill" data-tone={statusTone(ticket.status)}>
                  {status}
                </span>
                {isUrgentPriority(ticket.priority) ? (
                  <span className="opx-sx-urg" data-tone={priorityTone(ticket.priority)}>
                    {labels.priority(ticket.priority) || t("urgent")}
                  </span>
                ) : null}
              </span>
              <span className="opx-sx-chead__sub">
                <b className="opx-num">{codeOf(ticket)}</b>
                <span>
                  <IcUser size={14} />
                  <span>{person}</span>
                </span>
              </span>
            </>
          ) : gone ? (
            <span className="opx-sx-chead__row">
              <h3 className="opx-num">{codeOf(ticket)}</h3>
            </span>
          ) : (
            <>
              <i className="opx-shim opx-sx-shim-t" />
              <i className="opx-shim opx-sx-shim-s" />
            </>
          )}
        </div>
        {!mine && (ticket.operatorUserId || ticket.operatorName) ? (
          <span className="opx-sx-op" title={t("operator")}>
            <i aria-hidden="true">{ticket.operatorName ? initials(ticket.operatorName) : <IcUser size={14} />}</i>
            <span className="opx-sr">{t("operator")}: </span>
            <PersonName id={ticket.operatorUserId} name={ticket.operatorName} />
          </span>
        ) : null}
        <div className="opx-sx-chead__acts">
          {claimable ? (
            <button type="button" className="opx-pbtn opx-pbtn--blue opx-sx-act is-claim" disabled={busy} onClick={onClaim} data-ai-id={aiId("call_center.support.ticket", tid, "claim")}>
              <IcCheck size={16} />
              <span>{t("claim")}</span>
            </button>
          ) : null}
          {own ? (
            <>
              <button
                type="button"
                className="opx-pbtn opx-sx-act"
                disabled={busy || transferOff}
                aria-label={t("transfer")}
                title={transferOff ? t("queue.transferOff") : t("transfer")}
                aria-describedby={transferOff ? `${uid}-noxfer` : undefined}
                onClick={onTransfer}
                data-ai-id={aiId("call_center.support.ticket", tid, "transfer")}
              >
                <IcSwap size={16} />
                <span className="opx-sx-act__l">{tx("transferShort")}</span>
              </button>
              <button
                type="button"
                className="opx-pbtn opx-sx-act"
                disabled={busy}
                aria-label={t("close")}
                title={t("close")}
                onClick={onClose}
                data-ai-id={aiId("call_center.support.ticket", tid, "close")}
              >
                <IcCheck size={16} />
                <span className="opx-sx-act__l">{tx("closeShort")}</span>
              </button>
            </>
          ) : null}
          <button type="button" className="opx-pbtn opx-sx-act opx-sx-infobtn" aria-expanded={info} aria-label={tx("details")} title={tx("details")} onClick={() => onInfo(!info)}>
            <IcPanel size={16} />
          </button>
        </div>
      </header>
      {(own && transferOff) || reason ? (
        <div className="opx-sx-notes">
          {own && transferOff ? (
            <p className="opx-sx-note" id={`${uid}-noxfer`}>
              <IcLock size={15} />
              <span>{t("queue.transferOff")}</span>
            </p>
          ) : null}
          {reason ? (
            <p className="opx-sx-note" data-tone="info" data-ai-private>
              <b>{reason.label}:</b>
              <span>{reason.text}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function MessageLog({ chat, bindBox, ticket, meId, now, onBack }: { chat: TicketChat; bindBox: (el: HTMLDivElement | null) => void; ticket: SupportTicket; meId: string; now: number | null; onBack: () => void }) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const tx = useTranslations("admin.ccx.support");
  const locale = useLocale();
  const today = now === null ? "" : dateOnly(new Date(now).toISOString(), locale);
  const yesterday = now === null ? "" : dateOnly(new Date(now - DAY_MS).toISOString(), locale);
  const dayText = (day: string) => (day && day === today ? `${t("chat.today")}, ${day}` : day && day === yesterday ? `${t("chat.yesterday")}, ${day}` : day);
  const roleLabel = (r: string) => (r && t.has(`roles.${r}`) ? t(`roles.${r}`) : r ? humanize(r) : "");
  const clientUserId = ticket.clientUserId;
  const clientName = ticket.clientName || chat.msgs.find((m) => m.senderUserId && m.senderUserId === clientUserId && m.senderName)?.senderName || t("client");
  const nameOf = (m: SupportMessage, who: Who) => {
    if (who === "client") return m.senderName || clientName;
    if (who === "ai") return m.senderName || t("roles.ai");
    if (who === "me") return m.senderName || tx("you");
    return m.senderName || roleLabel(m.senderRole) || t("operator");
  };
  return (
    <>
      <div
        className="opx-sx-msgs"
        ref={bindBox}
        onScroll={chat.onScroll}
        role="log"
        aria-live="off"
        aria-label={t("chat.log")}
        aria-busy={chat.state === "loading"}
        tabIndex={0}
        data-ai-id={ticket.id ? aiId("call_center.support.ticket", ticket.id, "messages") : undefined}
        data-ai-type="list"
        data-ai-private
      >
        {chat.hasMore ? (
          <button type="button" className="opx-sx-older" onClick={() => void chat.loadOlder()} disabled={chat.older} aria-busy={chat.older || undefined}>
            {t("loadOlder")}
          </button>
        ) : null}
        {chat.state === "loading" ? (
          <div className="opx-sx-msk" aria-hidden="true">
            <i className="opx-shim" />
            <i className="opx-shim is-out" />
            <i className="opx-shim" />
          </div>
        ) : null}
        {chat.state === "loading" ? <span className="opx-sr">{t("loadingMsgs")}</span> : null}
        {chat.state === "error" ? (
          <div className="opx-sx-state" role="alert">
            <IcAlert size={26} />
            <p>{tc("serverError")}</p>
            <button type="button" className="opx-pbtn" onClick={chat.retry}>
              <IcRefresh size={16} />
              {tc("retry")}
            </button>
          </div>
        ) : null}
        {chat.state === "missing" ? (
          <div className="opx-sx-state">
            <IcLock size={26} />
            <p>{t("chat.missing")}</p>
            <button type="button" className="opx-pbtn" onClick={onBack}>
              <IcArrowLeft size={16} />
              {t("back")}
            </button>
          </div>
        ) : null}
        {chat.state === "ready" && !chat.msgs.length ? <p className="opx-sx-hint">{t("noMessages")}</p> : null}
        {chat.msgs.map((m, i) => {
          const prev = i > 0 ? chat.msgs[i - 1] : undefined;
          const day = m.createdAt ? dateOnly(m.createdAt, locale) : "";
          const showDay = Boolean(day) && (!prev || dateOnly(prev.createdAt, locale) !== day);
          const who = whoOf(m, meId, clientUserId);
          const cont = Boolean(prev) && !showDay && who !== "sys" && prev?.senderUserId === m.senderUserId && prev?.messageType !== "system" && near(prev?.createdAt ?? "", m.createdAt);
          const role = who === "staff" || who === "me" ? roleLabel(m.senderRole) : "";
          return (
            <Fragment key={m.id || `${m.createdAt}-${i}`}>
              {showDay ? (
                <div className="opx-sx-day">
                  <span>{dayText(day)}</span>
                </div>
              ) : null}
              <Bubble m={m} who={who} cont={cont} name={nameOf(m, who)} role={role} />
            </Fragment>
          );
        })}
      </div>
      <p className="opx-sr" aria-live="polite" aria-atomic="true">
        {chat.announce}
      </p>
    </>
  );
}

function Bubble({ m, who, cont, name, role }: { m: SupportMessage; who: Who; cont: boolean; name: string; role: string }) {
  const locale = useLocale();
  const at = m.createdAt ? timeOnly(m.createdAt, locale) : "";
  if (who === "sys") {
    return (
      <div className="opx-sx-sys">
        <span>{m.content}</span>
        {at ? (
          <time className="opx-num" dateTime={m.createdAt}>
            {at}
          </time>
        ) : null}
      </div>
    );
  }
  return (
    <div className="opx-sx-msg" data-who={who} data-side={who === "me" || who === "staff" ? "out" : "in"} data-cont={cont ? "" : undefined}>
      <span className="opx-sx-av" aria-hidden="true">
        {cont ? null : who === "ai" ? <IcSpark size={16} /> : initials(name) || <IcUser size={16} />}
      </span>
      <div className="opx-sx-bub">
        {cont ? null : (
          <span className="opx-sx-bub__who">
            <b>{name}</b>
            {role && role !== name ? <em>{role}</em> : null}
            {at ? (
              <time className="opx-num" dateTime={m.createdAt}>
                {at}
              </time>
            ) : null}
          </span>
        )}
        {m.content ? <p>{m.content}</p> : null}
        {m.attachments.length ? (
          <ul className="opx-sx-files">
            {m.attachments.map((a, k) => {
              const size = fileSize(a.size);
              const body = (
                <>
                  <span className="opx-sx-file__ic" aria-hidden="true">
                    <IcClip size={16} />
                  </span>
                  <span className="opx-sx-file__t">
                    <b>{a.name || a.url}</b>
                    {size ? <small className="opx-num">{size}</small> : null}
                  </span>
                  {a.url ? <IcDownload size={17} /> : null}
                </>
              );
              return (
                <li key={`${a.url}-${k}`}>
                  {a.url ? (
                    <a className="opx-sx-file" href={a.url} target="_blank" rel="noreferrer">
                      {body}
                    </a>
                  ) : (
                    <span className="opx-sx-file">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        {cont && at ? (
          <time className="opx-sx-bub__at opx-num" dateTime={m.createdAt}>
            {at}
          </time>
        ) : null}
      </div>
    </div>
  );
}

export function Composer({ chat, ticket, canWrite, claimable }: { chat: TicketChat; ticket: SupportTicket; canWrite: boolean; claimable: boolean }) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const tx = useTranslations("admin.ccx.support");
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const known = Boolean(ticket.status);
  const writable = canWrite && chat.state !== "missing";

  const fit = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = async () => {
    if (!writable || chat.sending || !text.trim()) return;
    const ok = await chat.send(text);
    if (!ok) return;
    setText("");
    if (field.current) field.current.style.height = "";
  };

  const quick = (line: string) => {
    const next = (text.trim() ? `${text.trimEnd()} ${line}` : line).slice(0, MAX_TEXT);
    setText(next);
    chat.clearError();
    window.requestAnimationFrame(() => {
      const el = field.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      fit(el);
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    void submit();
  };

  return (
    <div className="opx-sx-compose">
      {!canWrite && known ? (
        <p className="opx-sx-ro">
          <IcLock size={15} />
          <span>{claimable ? tx("claimToReply") : t("readOnly")}</span>
        </p>
      ) : null}
      {writable ? (
        <div className="opx-sx-quick" role="group" aria-label={tx("quickLabel")}>
          <span>{tx("quickLabel")}</span>
          {QUICK.map((k) => (
            <button key={k} type="button" title={tx(`quick.${k}`)} onClick={() => quick(tx(`quick.${k}`))}>
              {tx(`quickTag.${k}`)}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="opx-sx-form"
        data-ai-private
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          ref={field}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            chat.clearError();
            fit(e.currentTarget);
          }}
          onKeyDown={onKey}
          placeholder={t("ph")}
          aria-label={t("ph")}
          rows={1}
          maxLength={MAX_TEXT}
          disabled={!writable}
          data-ai-target="support:message-input"
          data-ai-id={ticket.id ? aiId("call_center.support.ticket", ticket.id, "message-input") : undefined}
        />
        <div className="opx-sx-form__foot">
          {writable ? (
            <span className="opx-sx-keys" aria-hidden="true">
              {t("chat.enterHint")}
            </span>
          ) : null}
          <button type="submit" className="opx-pbtn opx-pbtn--main opx-sx-send" disabled={!writable || chat.sending || !text.trim()} aria-busy={chat.sending || undefined}>
            <IcSend size={16} />
            {t("send")}
          </button>
        </div>
      </form>
      {chat.error ? (
        contactBlockedOf(chat.error) ? (
          <ContactBlockedNote error={chat.error} />
        ) : (
          <p className="opx-ferr" role="alert">
            {errorText(chat.error, tc)}
          </p>
        )
      ) : null}
    </div>
  );
}

export function ClosedBanner({ ticket }: { ticket: SupportTicket }) {
  const t = useTranslations("support");
  const locale = useLocale();
  return (
    <div className="opx-sx-end" data-ai-private>
      <span className="opx-sx-end__ic" aria-hidden="true">
        <IcCheck size={18} />
      </span>
      <div className="opx-sx-end__tx">
        <b>{t("closedBanner")}</b>
        {ticket.closedAt ? <small>{t("chat.closedAt", { date: dateTimeFull(ticket.closedAt, locale) })}</small> : null}
        {ticket.resolution ? (
          <p>
            <em>{t("resolution")}:</em> {ticket.resolution}
          </p>
        ) : (
          <p>{t("chat.noResolution")}</p>
        )}
      </div>
    </div>
  );
}
