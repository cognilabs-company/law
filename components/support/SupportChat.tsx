"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { loadLatestMessages, loadNewMessages, loadOlderMessages, sendSupportMessage, type MessageCursor, type SupportMessage, type SupportTicket } from "@/lib/services/support";
import { contactBlockedOf, isAborted } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import { dateOnly, timeOnly } from "@/lib/date";
import ContactBlockedNote from "@/components/ContactBlockedNote";
import { IconLock, IconPaperclip, IconSend } from "@/components/icons";
import { SupportStatus } from "./bits";

const PAGE = 50;

const byTime = (a: SupportMessage, b: SupportMessage) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

function merge(cur: SupportMessage[], next: SupportMessage[]): SupportMessage[] {
  const seen = new Map(cur.map((m) => [m.id, m]));
  for (const m of next) if (m.id) seen.set(m.id, m);
  return [...seen.values()].sort(byTime);
}

export default function SupportChat({
  ticket,
  meId,
  mode,
  canWrite,
  readOnlyNote,
  onTicket,
  onMessage,
}: {
  ticket: SupportTicket;
  meId: string;
  mode: "client" | "operator";
  canWrite: boolean;
  readOnlyNote?: string;
  onTicket?: (t: SupportTicket) => void;
  onMessage?: (m: SupportMessage) => void;
}) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [msgs, setMsgs] = useState<SupportMessage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [hasMore, setHasMore] = useState(false);
  const [older, setOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const cursor = useRef<MessageCursor | null>(null);
  const onTicketRef = useRef(onTicket);
  const box = useRef<HTMLDivElement>(null);
  const keep = useRef<number | null>(null);
  const stick = useRef(true);
  const closed = ticket.status === "closed";

  useEffect(() => {
    onTicketRef.current = onTicket;
  });

  const ticketId = ticket.id;
  const clientUserId = ticket.clientUserId;
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const c = new AbortController();
    cursor.current = null;
    loadLatestMessages(ticketId, PAGE, c.signal)
      .then((r) => {
        if (c.signal.aborted) return;
        cursor.current = r.cursor;
        stick.current = true;
        setMsgs(merge([], r.items));
        setHasMore(r.cursor.hasOlder);
        setState("ready");
        if (r.ticket) onTicketRef.current?.(r.ticket);
      })
      .catch((e: unknown) => {
        if (!isAborted(e) && !c.signal.aborted) setState("error");
      });
    return () => c.abort();
  }, [ticketId, reloadKey]);

  const refresh = useCallback(() => {
    const cur = cursor.current;
    if (!cur) return;
    loadNewMessages(ticketId, cur, clientUserId)
      .then((r) => {
        cursor.current = r.cursor;
        if (r.items.length) setMsgs((list) => merge(list, r.items));
        if (r.ticket) onTicketRef.current?.(r.ticket);
      })
      .catch(() => {});
  }, [ticketId, clientUserId]);

  const retry = () => {
    setState("loading");
    setReloadKey((n) => n + 1);
  };

  useSupportEvents((e) => {
    if (e.ticketId !== ticketId) return;
    if (e.message) {
      const m = e.message;
      setMsgs((cur) => merge(cur, [m]));
    }
    if (e.ticket) onTicketRef.current?.(e.ticket);
    else if (e.kind === "closed") onTicketRef.current?.({ ...ticket, status: "closed" });
    refresh();
  }, refresh);

  usePoll(refresh, 12000, !closed && state === "ready");

  const loadOlder = async () => {
    const cur = cursor.current;
    if (older || !hasMore || !cur) return;
    setOlder(true);
    const el = box.current;
    keep.current = el ? el.scrollHeight - el.scrollTop : null;
    stick.current = false;
    try {
      const r = await loadOlderMessages(ticketId, cur, PAGE, clientUserId);
      cursor.current = r.cursor;
      setMsgs((list) => merge(list, r.items));
      setHasMore(r.cursor.hasOlder);
    } catch {
      keep.current = null;
    } finally {
      setOlder(false);
    }
  };

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (keep.current !== null) {
      el.scrollTop = el.scrollHeight - keep.current;
      keep.current = null;
      return;
    }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 40 && hasMore && !older) void loadOlder();
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !canWrite || closed) return;
    setSending(true);
    setError(null);
    try {
      const m = await sendSupportMessage(ticketId, body, clientUserId);
      stick.current = true;
      setMsgs((cur) => merge(cur, [{ ...m, senderUserId: m.senderUserId || meId, content: m.content || body, createdAt: m.createdAt || new Date().toISOString() }]));
      setText("");
      onMessage?.(m);
    } catch (e) {
      setError(e);
    } finally {
      setSending(false);
    }
  };

  const roleLabel = (r: string) => (t.has(`roles.${r}`) ? t(`roles.${r}`) : r);

  return (
    <div className="supchat" data-ai-target="support:chat">
      <div className="supchat__head">
        <div>
          <span className="supchat__id">{ticket.workId || ticket.id.slice(0, 8)}</span>
          <b>{ticket.title || t("untitled")}</b>
          <small>
            {t.has(`categories.${ticket.category}`) ? t(`categories.${ticket.category}`) : ticket.category}
            {ticket.operatorName ? ` · ${t("operatorIs", { name: ticket.operatorName })}` : ""}
          </small>
        </div>
        <SupportStatus status={ticket.status} />
      </div>

      {ticket.status === "waiting_operator" && mode === "client" ? (
        <p className="supchat__banner supchat__banner--wait">
          <i aria-hidden="true" />
          {t("waitingBanner")}
        </p>
      ) : null}

      <div className="supchat__msgs" ref={box} onScroll={onScroll} aria-live="polite">
        {hasMore ? (
          <button type="button" className="supchat__older" onClick={() => void loadOlder()} disabled={older}>
            {t("loadOlder")}
          </button>
        ) : null}
        {state === "loading" ? <p className="supchat__hint">{t("loadingMsgs")}</p> : null}
        {state === "error" ? (
          <p className="supchat__hint">
            {tc("serverError")}{" "}
            <button type="button" className="supchat__retry" onClick={retry}>
              {tc("retry")}
            </button>
          </p>
        ) : null}
        {state === "ready" && !msgs.length ? <p className="supchat__hint">{t("noMessages")}</p> : null}
        {msgs.map((m, i) => {
          const mine = m.senderUserId === meId;
          const day = m.createdAt.slice(0, 10);
          const showDay = i === 0 || msgs[i - 1].createdAt.slice(0, 10) !== day;
          return (
            <div key={m.id || `${m.createdAt}-${i}`} className="supchat__row">
              {showDay && m.createdAt ? <span className="supchat__day">{dateOnly(m.createdAt, locale)}</span> : null}
              <div className={`supmsg${mine ? " supmsg--me" : ""}${m.senderRole === "system" ? " supmsg--sys" : ""}`}>
                {!mine && m.senderRole !== "system" ? (
                  <span className="supmsg__who">
                    {m.senderName || roleLabel(m.senderRole)}
                    {m.senderRole ? <em>{roleLabel(m.senderRole)}</em> : null}
                  </span>
                ) : null}
                <p>{m.content}</p>
                {m.attachments.length ? (
                  <ul className="supmsg__files">
                    {m.attachments.map((a, k) => (
                      <li key={`${a.url}-${k}`}>
                        <IconPaperclip />
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noreferrer">
                            {a.name || a.url}
                          </a>
                        ) : (
                          a.name
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <time dateTime={m.createdAt}>{m.createdAt ? timeOnly(m.createdAt, locale) : ""}</time>
              </div>
            </div>
          );
        })}
      </div>

      {closed ? (
        <p className="supchat__banner supchat__banner--closed">
          <IconLock />
          <span>
            <b>{t("closedBanner")}</b>
            {ticket.resolution ? <em>{ticket.resolution}</em> : null}
          </span>
        </p>
      ) : !canWrite ? (
        <p className="supchat__banner">
          <IconLock />
          {readOnlyNote || t("readOnly")}
        </p>
      ) : null}

      <form
        className="supchat__form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={closed ? t("closedBanner") : t("ph")}
          aria-label={t("ph")}
          rows={2}
          maxLength={4000}
          disabled={!canWrite || closed}
          data-ai-target="support:message-input"
        />
        <button type="submit" className="btn btn--pri" disabled={!canWrite || closed || sending || !text.trim()} aria-label={t("send")}>
          <IconSend />
        </button>
      </form>
      {error ? contactBlockedOf(error) ? <ContactBlockedNote error={error} /> : <p className="supchat__err" role="alert">{errorText(error, tc)}</p> : null}
    </div>
  );
}
