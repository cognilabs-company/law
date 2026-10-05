"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  isWaitingTicket,
  loadLatestMessages,
  loadNewMessages,
  loadOlderMessages,
  sendSupportMessage,
  ticketTitle,
  type MessageCursor,
  type SupportMessage,
  type SupportTicket,
} from "@/lib/services/support";
import { ApiError, contactBlockedOf, isAborted, isForbidden, parseServerTime } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import { dateOnly, dateTimeFull, timeOnly } from "@/lib/date";
import { initials } from "@/lib/lawyers";
import ContactBlockedNote from "@/components/ContactBlockedNote";
import { IconAlert, IconCheckDouble, IconHeadset, IconLock, IconPaperclip, IconPlus, IconRefresh, IconSend, IconSparkle, IconUser } from "@/components/icons";
import { SupportStatus } from "./bits";

const PAGE = 50;
const GROUP_MS = 5 * 60 * 1000;

const byTime = (a: SupportMessage, b: SupportMessage) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

const visible = (m: SupportMessage) => Boolean(m.content.trim() || m.attachments.length || m.messageType === "system");

function merge(cur: SupportMessage[], next: SupportMessage[]): SupportMessage[] {
  const seen = new Map(cur.map((m) => [m.id, m]));
  for (const m of next) if (m.id && visible(m)) seen.set(m.id, m);
  return [...seen.values()].sort(byTime);
}

function near(a: string, b: string): boolean {
  const x = parseServerTime(a);
  const y = parseServerTime(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(y - x) <= GROUP_MS;
}

const isMissing = (e: unknown) => isForbidden(e) || (e instanceof ApiError && e.status === 404);

export default function SupportChat({
  ticket,
  meId,
  mode,
  canWrite,
  readOnlyNote,
  onTicket,
  onMessage,
  onNewChat,
  onBack,
}: {
  ticket: SupportTicket;
  meId: string;
  mode: "client" | "operator";
  canWrite: boolean;
  readOnlyNote?: string;
  onTicket?: (t: SupportTicket) => void;
  onMessage?: (m: SupportMessage) => void;
  onNewChat?: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [msgs, setMsgs] = useState<SupportMessage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [hasMore, setHasMore] = useState(false);
  const [older, setOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [announce, setAnnounce] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const cursor = useRef<MessageCursor | null>(null);
  const onTicketRef = useRef(onTicket);
  const msgsRef = useRef<SupportMessage[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const keep = useRef<number | null>(null);
  const stick = useRef(true);
  const known = Boolean(ticket.status);
  const closed = ticket.status === "closed";
  const ticketId = ticket.id;
  const clientUserId = ticket.clientUserId;

  useEffect(() => {
    onTicketRef.current = onTicket;
    msgsRef.current = msgs;
  });

  const roleLabel = useCallback((r: string) => (r && t.has(`roles.${r}`) ? t(`roles.${r}`) : r), [t]);

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
        if (isAborted(e) || c.signal.aborted) return;
        setState(isMissing(e) ? "missing" : "error");
      });
    return () => c.abort();
  }, [ticketId, reloadKey]);

  const announceFresh = useCallback(
    (items: SupportMessage[]) => {
      const have = new Set(msgsRef.current.map((m) => m.id));
      const fresh = items.filter((m) => m.id && !have.has(m.id) && m.senderUserId !== meId && m.messageType !== "system" && m.content.trim());
      const last = fresh[fresh.length - 1];
      if (last) setAnnounce(`${last.senderName || roleLabel(last.senderRole)}: ${last.content}`);
    },
    [meId, roleLabel],
  );

  const refresh = useCallback(() => {
    const cur = cursor.current;
    if (!cur) return;
    loadNewMessages(ticketId, cur, clientUserId)
      .then((r) => {
        cursor.current = r.cursor;
        if (r.items.length) {
          announceFresh(r.items);
          setMsgs((list) => merge(list, r.items));
        }
        if (r.ticket) onTicketRef.current?.(r.ticket);
      })
      .catch(() => {});
  }, [ticketId, clientUserId, announceFresh]);

  const retry = () => {
    setState("loading");
    setReloadKey((n) => n + 1);
  };

  useSupportEvents((e) => {
    if (e.ticketId !== ticketId) return;
    if (e.message && visible(e.message)) {
      const m = e.message;
      announceFresh([m]);
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
      const sent = { ...m, id: m.id || `local-${Date.now()}`, senderUserId: m.senderUserId || meId, content: m.content || body, createdAt: m.createdAt || new Date().toISOString() };
      stick.current = true;
      setMsgs((cur) => merge(cur, [sent]));
      setText("");
      if (field.current) field.current.style.height = "";
      onMessage?.(sent);
    } catch (e) {
      setError(e);
    } finally {
      setSending(false);
    }
  };

  const clientFromMsgs = useMemo(() => msgs.find((m) => m.senderUserId && m.senderUserId === clientUserId && m.senderName)?.senderName ?? "", [msgs, clientUserId]);
  const operatorFromMsgs = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.senderUserId && clientUserId && m.senderUserId !== clientUserId && m.messageType !== "system" && m.senderName) return m.senderName;
    }
    return "";
  }, [msgs, clientUserId]);

  const opName = ticket.operatorName || operatorFromMsgs;
  const clientName = ticket.clientName || clientFromMsgs;
  const connecting = mode === "client" && !opName && isWaitingTicket(ticket);
  const aiNow = mode === "client" && !opName && ticket.status === "ai_handling";
  const who =
    mode === "client"
      ? opName || (connecting ? t("chat.connecting") : aiNow ? t("roles.ai") : t("chat.operatorFallback"))
      : clientName || t("client");
  const person = mode === "client" ? opName : clientName;
  const category = t.has(`categories.${ticket.category}`) ? t(`categories.${ticket.category}`) : ticket.category;
  const sub = [mode === "operator" && ticket.clientLexgoId ? t("chat.lexgoId", { id: ticket.clientLexgoId }) : "", ticketTitle(ticket, t("untitled")), category, ticket.workId]
    .filter(Boolean)
    .join(" · ");
  const writable = canWrite && !closed && state !== "missing";

  return (
    <div className="supchat" data-ai-target="support:chat">
      <div className="supchat__head">
        <span className={`supchat__av${connecting ? " supchat__av--wait" : ""}${aiNow ? " supchat__av--ai" : ""}`} aria-hidden="true">
          {person ? initials(person) : aiNow ? <IconSparkle /> : mode === "client" ? <IconHeadset /> : <IconUser />}
        </span>
        <div className="supchat__who">
          {known ? (
            <>
              <b>{who}</b>
              <small>{sub}</small>
            </>
          ) : (
            <>
              <span className="supchat__ghost" />
              <span className="supchat__ghost supchat__ghost--sm" />
            </>
          )}
        </div>
        <SupportStatus status={ticket.status} />
      </div>

      {connecting ? (
        <p className="supchat__banner supchat__banner--wait" role="status">
          <i aria-hidden="true" />
          {t("waitingBanner")}
        </p>
      ) : null}

      <div className="supchat__msgs" ref={box} onScroll={onScroll} role="log" aria-live="off" aria-label={t("chat.log")} aria-busy={state === "loading"} tabIndex={0}>
        {hasMore ? (
          <button type="button" className="supchat__older" onClick={() => void loadOlder()} disabled={older}>
            {t("loadOlder")}
          </button>
        ) : null}
        {state === "loading" ? (
          <div className="supchat__sk">
            <span />
            <span />
            <span />
            <em className="sr-only">{t("loadingMsgs")}</em>
          </div>
        ) : null}
        {state === "error" ? (
          <div className="supchat__state">
            <IconAlert />
            <p>{tc("serverError")}</p>
            <button type="button" className="btn btn--line btn--sm" onClick={retry}>
              <IconRefresh />
              {tc("retry")}
            </button>
          </div>
        ) : null}
        {state === "missing" ? (
          <div className="supchat__state">
            <IconLock />
            <p>{t("chat.missing")}</p>
            {onBack ? (
              <button type="button" className="btn btn--line btn--sm" onClick={onBack}>
                {t("back")}
              </button>
            ) : null}
          </div>
        ) : null}
        {state === "ready" && !msgs.length ? <p className="supchat__hint">{t("noMessages")}</p> : null}
        {msgs.map((m, i) => {
          const prev = i > 0 ? msgs[i - 1] : undefined;
          const mine = Boolean(meId) && m.senderUserId === meId;
          const sys = m.senderRole === "system" || m.messageType === "system";
          const day = m.createdAt ? dateOnly(m.createdAt, locale) : "";
          const showDay = Boolean(day) && (!prev || dateOnly(prev.createdAt, locale) !== day);
          const cont = Boolean(prev) && !showDay && !sys && prev?.senderUserId === m.senderUserId && prev?.messageType !== "system" && near(prev?.createdAt ?? "", m.createdAt);
          const role = m.senderRole && !sys ? roleLabel(m.senderRole) : "";
          return (
            <div key={m.id || `${m.createdAt}-${i}`} className="supchat__row">
              {showDay ? <span className="supchat__day">{day}</span> : null}
              <div className={`supmsg${mine ? " supmsg--me" : ""}${sys ? " supmsg--sys" : ""}${cont ? " supmsg--cont" : ""}`}>
                {!mine && !sys && !cont && (m.senderName || role) ? (
                  <span className="supmsg__who">
                    {m.senderName || role}
                    {m.senderName && role ? <em>{role}</em> : null}
                  </span>
                ) : null}
                {m.content ? <p>{m.content}</p> : null}
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
                {m.createdAt ? <time dateTime={m.createdAt}>{timeOnly(m.createdAt, locale)}</time> : null}
              </div>
            </div>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {closed ? (
        <div className="supchat__end">
          <span className="supchat__endic" aria-hidden="true">
            <IconCheckDouble />
          </span>
          <div className="supchat__endtx">
            <b>{t("closedBanner")}</b>
            {ticket.closedAt ? <small>{t("chat.closedAt", { date: dateTimeFull(ticket.closedAt, locale) })}</small> : null}
            {ticket.resolution ? (
              <p>
                <em>{t("resolution")}</em>
                {ticket.resolution}
              </p>
            ) : (
              <p>{t("chat.noResolution")}</p>
            )}
          </div>
          {onNewChat ? (
            <button type="button" className="btn btn--pri btn--sm" onClick={onNewChat}>
              <IconPlus />
              {t("chat.newChat")}
            </button>
          ) : null}
        </div>
      ) : state === "missing" ? null : (
        <>
          {!canWrite && known ? (
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
              ref={field}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                if (window.matchMedia("(pointer: coarse)").matches) return;
                e.preventDefault();
                void send();
              }}
              placeholder={t("ph")}
              aria-label={t("ph")}
              rows={1}
              maxLength={4000}
              disabled={!writable}
              data-ai-target="support:message-input"
            />
            <button type="submit" className="supchat__send" disabled={!writable || sending || !text.trim()} aria-label={t("send")} title={t("send")}>
              <IconSend />
            </button>
            <span className="supchat__keys" aria-hidden="true">
              {t("chat.enterHint")}
            </span>
          </form>
        </>
      )}
      {error ? contactBlockedOf(error) ? <ContactBlockedNote error={error} /> : <p className="supchat__err" role="alert">{errorText(error, tc)}</p> : null}
    </div>
  );
}
