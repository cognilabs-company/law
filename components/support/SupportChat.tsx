"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  assistInfoOf,
  byMessageTime,
  isClosedStatus,
  isVisibleMessage,
  isWaitingTicket,
  loadLatestMessages,
  loadNewMessages,
  loadOlderMessages,
  reopenSupportTicket,
  sendSupportMessage,
  supportCallHref,
  ticketTitle,
  timeOf,
  type MessageCursor,
  type SupportAssistInfo,
  type SupportAssistKind,
  type SupportCall,
  type SupportEvent,
  type SupportMessage,
  type SupportTicket,
} from "@/lib/services/support";
import { ApiError, asDict, asStr, contactBlockedOf, isAborted, isForbidden, parseServerTime } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { toast } from "@/lib/toast";
import { fmtUzs } from "@/lib/money";
import { subscribeUserEvents } from "@/lib/userSocket";
import { CALLROOM_EVENT } from "@/lib/callEvents";
import { getCall } from "@/lib/services/backend";
import { primeCallAudio, stopAllCallTones } from "@/lib/callSounds";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import { dateOnly, dateTimeFull, timeOnly } from "@/lib/date";
import { initials } from "@/lib/lawyers";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import ContactBlockedNote from "@/components/ContactBlockedNote";
import {
  IconAlert,
  IconArrowRight,
  IconBriefcase,
  IconCard,
  IconCheckDouble,
  IconChevronLeft,
  IconClose,
  IconFileText,
  IconHeadset,
  IconHourglass,
  IconLock,
  IconPaperclip,
  IconPhone,
  IconPlus,
  IconRefresh,
  IconSend,
  IconSparkle,
  IconUser,
  IconVideo,
} from "@/components/icons";
import { SupportStatus, useMinuteNow, useSupportCall, useSupportHours, useSupportLabels, type SupportCallControl } from "./bits";

const PAGE = 50;
const GROUP_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SYNC_MS = 1500;
const CALL_OVER = new Set(["ended", "cancelled", "expired", "missed", "rejected", "failed"]);
const AI_ROLES = new Set(["ai", "assistant", "ai_instructor", "bot"]);

type AssistCard = { key: string; info: SupportAssistInfo; at: string };
type Row = { kind: "msg"; m: SupportMessage; at: number } | { kind: "card"; c: AssistCard; at: number };

const ASSIST_HREF: Partial<Record<SupportAssistKind, string>> = {
  subscription_checkout: "/portal/client/payments",
  document_request: "/portal/client/documents",
  marketplace_purchase: "/portal/client/marketplace-orders",
};

const ASSIST_TONE: Record<SupportAssistKind, string> = {
  subscription_preview: "info",
  subscription_checkout: "wait",
  document_request: "ok",
  marketplace_purchase: "wait",
};

function merge(cur: SupportMessage[], next: SupportMessage[]): SupportMessage[] {
  const seen = new Map(cur.map((m) => [m.id, m]));
  for (const m of next) if (m.id && isVisibleMessage(m)) seen.set(m.id, m);
  return [...seen.values()].sort(byMessageTime);
}

function near(a: string, b: string): boolean {
  const x = parseServerTime(a);
  const y = parseServerTime(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(y - x) <= GROUP_MS;
}

const isMissing = (e: unknown) => isForbidden(e) || (e instanceof ApiError && e.status === 404);

function AssistIcon({ kind }: { kind: SupportAssistKind }) {
  if (kind === "subscription_checkout") return <IconCard />;
  if (kind === "document_request") return <IconFileText />;
  if (kind === "marketplace_purchase") return <IconBriefcase />;
  return <IconSparkle />;
}

function AssistNote({ card }: { card: AssistCard }) {
  const t = useTranslations("support");
  const locale = useLocale();
  const { info } = card;
  const href = ASSIST_HREF[info.kind];
  const money = info.amount > 0 ? (info.currency && !/^uzs$/i.test(info.currency) ? `${fmtUzs(info.amount)} ${info.currency}` : t("assistNote.amount", { amount: fmtUzs(info.amount) })) : "";
  return (
    <div className={`supassist supassist--${ASSIST_TONE[info.kind]}`} role="note">
      <span className="supassist__ic" aria-hidden="true">
        <AssistIcon kind={info.kind} />
      </span>
      <div className="supassist__tx">
        <span className="supassist__kick">{t("assistNote.kicker")}</span>
        <b>{t(`assistNote.${info.kind}.title`)}</b>
        {info.title ? <span className="supassist__what">{info.title}</span> : null}
        <p>{t(`assistNote.${info.kind}.text`)}</p>
        {info.workId || money ? (
          <span className="supassist__meta">
            {info.workId ? <span className="supassist__id">{t("assistNote.workId", { id: info.workId })}</span> : null}
            {money ? <span className="supassist__sum">{money}</span> : null}
          </span>
        ) : null}
        {href ? (
          <Link href={href} className="supassist__go">
            {t("assistNote.open")}
            <IconArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {card.at ? (
        <time className="supassist__at" dateTime={card.at}>
          {timeOnly(card.at, locale)}
        </time>
      ) : null}
    </div>
  );
}

export default function SupportChat({
  ticket,
  meId,
  mode,
  canWrite,
  canCall,
  call,
  readOnlyNote,
  onTicket,
  onMessage,
  onReopen,
  onMissing,
  onNewChat,
  onBack,
}: {
  ticket: SupportTicket;
  meId: string;
  mode: "client" | "operator";
  canWrite: boolean;
  canCall?: boolean;
  call?: SupportCallControl;
  readOnlyNote?: string;
  onTicket?: (t: SupportTicket) => void;
  onMessage?: (m: SupportMessage) => void;
  onReopen?: (t: SupportTicket) => void;
  onMissing?: (ticketId: string) => void;
  onNewChat?: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const labels = useSupportLabels();
  const [msgs, setMsgs] = useState<SupportMessage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [hasMore, setHasMore] = useState(false);
  const [older, setOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [announce, setAnnounce] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [syncReq, setSyncReq] = useState(0);
  const [ring, setRing] = useState<SupportCall | null>(null);
  const [cards, setCards] = useState<AssistCard[]>([]);
  const [reopen, setReopen] = useState<{ reason: string; busy: boolean; err: unknown } | null>(null);
  const ownCall = useSupportCall(ticket.id, ticket.workId);
  const { calling, start: startCall } = call ?? ownCall;
  const cursor = useRef<MessageCursor | null>(null);
  const onTicketRef = useRef(onTicket);
  const onMissingRef = useRef(onMissing);
  const msgsRef = useRef<SupportMessage[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const keep = useRef<number | null>(null);
  const stick = useRef(true);
  const syncLater = useRef(false);
  const known = Boolean(ticket.status);
  const closed = isClosedStatus(ticket.status);
  const ticketId = ticket.id;
  const clientUserId = ticket.clientUserId;
  const [prevClosed, setPrevClosed] = useState(closed);
  if (prevClosed !== closed) {
    setPrevClosed(closed);
    setReopen(null);
  }
  const holder = `${ticket.status}|${ticket.operatorUserId}`;
  const [prevHolder, setPrevHolder] = useState(holder);
  if (prevHolder !== holder) {
    setPrevHolder(holder);
    if (!prevHolder.startsWith("|")) setSyncReq((n) => n + 1);
  }

  useEffect(() => {
    onTicketRef.current = onTicket;
    onMissingRef.current = onMissing;
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
        setMsgs((cur) => merge(cur, r.items));
        setHasMore(r.cursor.hasOlder);
        setState("ready");
        if (r.ticket) onTicketRef.current?.(r.ticket);
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        const gone = isMissing(e);
        setState(gone ? "missing" : "error");
        if (gone) onMissingRef.current?.(ticketId);
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
    const have = new Set(msgsRef.current.map((m) => m.id));
    loadNewMessages(ticketId, cur, clientUserId, have)
      .then((r) => {
        const now = cursor.current;
        if (!now) return;
        if (r.cursor.order === "asc") cursor.current = { ...now, loaded: Math.max(now.loaded, r.cursor.loaded) };
        if (r.items.length) {
          announceFresh(r.items);
          setMsgs((list) => merge(list, r.items));
        }
        if (r.ticket) onTicketRef.current?.(r.ticket);
      })
      .catch(() => {});
  }, [ticketId, clientUserId, announceFresh]);

  useEffect(() => {
    if (!syncReq) return;
    const id = window.setTimeout(() => {
      if (document.visibilityState === "visible") refresh();
      else syncLater.current = true;
    }, SYNC_MS);
    return () => window.clearTimeout(id);
  }, [syncReq, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !syncLater.current) return;
      syncLater.current = false;
      refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const retry = () => {
    setState("loading");
    setReloadKey((n) => n + 1);
  };

  const addCard = (e: SupportEvent) => {
    const info = assistInfoOf(e.name, e.action, locale);
    if (!info) return;
    const at = e.createdAt || new Date().toISOString();
    const key = info.kind === "subscription_preview" ? info.kind : `${info.kind}:${info.workId || at}`;
    setCards((cur) => [...cur.filter((c) => c.key !== key), { key, info, at }]);
    const title = t(`assistNote.${info.kind}.title`);
    setAnnounce(title);
    if (info.kind !== "subscription_preview") toast(title, { tone: "ok" });
  };

  const { online } = useSupportEvents((e) => {
    if (e.ticketId !== ticketId) return;
    if (e.kind === "message" || e.kind === "created") {
      const fresh = e.messages.filter(isVisibleMessage);
      if (fresh.length) {
        announceFresh(fresh);
        setMsgs((cur) => merge(cur, fresh));
        if (fresh.some((m) => m.senderUserId !== meId)) setSyncReq((n) => n + 1);
      } else if (e.kind === "message" && !e.messages.length) refresh();
    }
    if (e.ticket) onTicketRef.current?.(e.ticket);
    else if (e.kind === "closed") onTicketRef.current?.({ ...ticket, status: "closed" });
    else if (e.kind === "reopened") onTicketRef.current?.({ ...ticket, status: "reopened" });
    if (mode !== "client") return;
    if (e.kind === "call" && e.call && !CALL_OVER.has(e.call.status.toLowerCase())) setRing(e.call);
    if (e.kind === "assist") addCard(e);
  }, refresh);

  const live = mode === "client" || (Boolean(meId) && ticket.operatorUserId === meId);
  usePoll(refresh, 12000, !closed && state === "ready" && (!online || !live));

  const ringId = ring?.callId ?? "";
  useEffect(() => {
    if (!ringId) return;
    return subscribeUserEvents((ev) => {
      if (!ev.event.startsWith("call.")) return;
      const c = asDict(ev.call);
      if (asStr(ev.call_id ?? c.id) !== ringId) return;
      const status = asStr(c.status ?? ev.status).toLowerCase();
      if (ev.event === "call.ended" || ev.event === "call.participant_joined" || CALL_OVER.has(status)) setRing(null);
    });
  }, [ringId]);

  const ringRoom = ring?.roomId ?? "";
  useEffect(() => {
    if (!ringId || !ringRoom) return;
    const timers: number[] = [];
    const recheck = () => {
      getCall(ringRoom, ringId)
        .then((c) => {
          const mine = c.participants.find((p) => p.userId === meId)?.status ?? "";
          if (CALL_OVER.has(c.status.toLowerCase()) || (mine !== "" && mine !== "invited")) setRing(null);
        })
        .catch(() => {});
    };
    const onRoom = () => {
      timers.push(window.setTimeout(recheck, 2500), window.setTimeout(recheck, 7000));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener(CALLROOM_EVENT, onRoom);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener(CALLROOM_EVENT, onRoom);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ringId, ringRoom, meId]);

  const loadOlder = async () => {
    const cur = cursor.current;
    if (older || !hasMore || !cur) return;
    setOlder(true);
    const el = box.current;
    keep.current = el ? el.scrollHeight - el.scrollTop : null;
    stick.current = false;
    try {
      const r = await loadOlderMessages(ticketId, cur, PAGE, clientUserId);
      const now = cursor.current;
      const loaded = r.cursor.order === "asc" && now ? Math.max(r.cursor.loaded, now.loaded) : r.cursor.loaded;
      cursor.current = { ...r.cursor, loaded };
      setMsgs((list) => merge(list, r.items));
      setHasMore(r.cursor.hasOlder);
    } catch {
      keep.current = null;
    } finally {
      setOlder(false);
    }
  };

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = msgs.map((m) => ({ kind: "msg", m, at: timeOf(m.createdAt) }));
    if (!cards.length) return list;
    for (const c of cards) list.push({ kind: "card", c, at: timeOf(c.at) });
    return list.sort((a, b) => a.at - b.at);
  }, [msgs, cards]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (keep.current !== null) {
      el.scrollTop = el.scrollHeight - keep.current;
      keep.current = null;
      return;
    }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [rows]);

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
      const sent = { ...m, senderUserId: m.senderUserId || meId, content: m.content || body, createdAt: m.createdAt || new Date().toISOString() };
      stick.current = true;
      if (sent.id) setMsgs((cur) => merge(cur, [sent]));
      else refresh();
      setText("");
      if (field.current) field.current.style.height = "";
      onMessage?.(sent);
    } catch (e) {
      setError(e);
    } finally {
      setSending(false);
    }
  };

  const joinRing = () => {
    if (!ring) return;
    stopAllCallTones();
    primeCallAudio();
    const href = supportCallHref(ring.roomId, ring.callId);
    setRing(null);
    router.push(href);
  };

  const doReopen = async () => {
    if (!reopen || reopen.busy) return;
    const reason = reopen.reason;
    setReopen({ reason, busy: true, err: null });
    try {
      const next = await reopenSupportTicket(ticketId, reason);
      const status = next.status && !isClosedStatus(next.status) ? next.status : "reopened";
      const tk = next.id ? { ...next, status } : { ...ticket, status };
      setReopen(null);
      onReopen?.(tk);
      toast(t("chat.reopenedOk"), { tone: "ok" });
      window.requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    } catch (e) {
      setReopen((r) => (r ? { ...r, busy: false, err: e } : r));
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
  const who = mode === "client" ? opName || (aiNow ? t("roles.ai") : t("chat.teamName")) : clientName || t("client");
  const person = mode === "client" ? opName : clientName;
  const category = labels.category(ticket.category);
  const sub = [mode === "operator" && ticket.clientLexgoId ? t("chat.lexgoId", { id: ticket.clientLexgoId }) : "", ticketTitle(ticket, t("untitled")), category, ticket.workId]
    .filter(Boolean)
    .join(" · ");
  const meta = [category, ticket.workId].filter(Boolean).join(" · ");
  const hours = useSupportHours(mode === "client" && !closed);
  const line = mode !== "client" ? sub : closed ? meta : hours ? (hours.open ? t("chat.replyFast") : t("chat.hoursLine", { hours: hours.schedule })) : "";
  const now = useMinuteNow();
  const today = now === null ? "" : dateOnly(new Date(now).toISOString(), locale);
  const yesterday = now === null ? "" : dateOnly(new Date(now - DAY_MS).toISOString(), locale);
  const dayText = (day: string) => (day && day === today ? t("chat.today") : day && day === yesterday ? t("chat.yesterday") : day);
  const writable = canWrite && !closed && state !== "missing";
  const callable = mode === "operator" && Boolean(canCall) && known && !closed && state !== "missing";
  const canReopen = mode === "client" && Boolean(onReopen) && state !== "missing" && (!clientUserId || !meId || clientUserId === meId);
  const aiBase = mode === "client" ? "support.ticket" : "call_center.support.ticket";
  const aiOf = (...parts: string[]) => (ticketId ? aiId(aiBase, ticketId, ...parts) : undefined);
  const aiInput = aiOf("message-input");
  const fitAfterFill = useRef(false);

  useAiField(mode === "client" && aiInput ? aiInput : "", {
    get: () => text,
    set: (value) => {
      fitAfterFill.current = true;
      setText(value.slice(0, 4000));
      setError(null);
    },
    sensitive: true,
    fillable: true,
    disabled: !writable,
  });

  useLayoutEffect(() => {
    if (!fitAfterFill.current) return;
    fitAfterFill.current = false;
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  return (
    <div
      className="supchat"
      data-ai-target="support:chat"
      data-ai-id={mode === "client" ? "support.chat" : "call_center.support.chat"}
      data-ai-type="chat"
      data-ai-label={mode === "client" ? t("aiLabels.chat") : t("aiLabels.clientChat")}
      data-ai-entity-type="support_ticket"
      data-ai-entity-id={ticketId || undefined}
    >
      <div className="supchat__head">
        {mode === "client" && onBack ? (
          <button type="button" className="supchat__back" onClick={onBack} aria-label={t("back")} title={t("back")}>
            <IconChevronLeft />
          </button>
        ) : null}
        <span className={`supchat__av${connecting ? " supchat__av--wait" : ""}${aiNow ? " supchat__av--ai" : ""}`} aria-hidden="true">
          {person ? initials(person) : aiNow ? <IconSparkle /> : mode === "client" ? <IconHeadset /> : <IconUser />}
        </span>
        <div className="supchat__who" data-ai-private>
          {known ? (
            <>
              <b>{who}</b>
              {line ? <small className={mode === "client" && !closed ? `supchat__line${hours?.open ? " is-open" : ""}` : undefined}>{line}</small> : null}
            </>
          ) : (
            <>
              <span className="supchat__ghost" />
              <span className="supchat__ghost supchat__ghost--sm" />
            </>
          )}
        </div>
        <SupportStatus status={ticket.status} />
        {callable ? (
          <div className="supchat__calls" role="group" aria-label={t("call.group")} data-ai-id={aiOf("call")} data-ai-type="call_button">
            <button
              type="button"
              className="supchat__call"
              onClick={() => void startCall("audio")}
              disabled={Boolean(calling)}
              title={t("call.audio")}
              aria-busy={calling === "audio" || undefined}
              data-ai-id={aiOf("call", "audio")}
              data-ai-type="call_button"
            >
              <IconPhone aria-hidden="true" />
              <span>{calling === "audio" ? t("call.starting") : t("call.audio")}</span>
            </button>
            <button
              type="button"
              className="supchat__call supchat__call--video"
              onClick={() => void startCall("video")}
              disabled={Boolean(calling)}
              title={t("call.video")}
              aria-busy={calling === "video" || undefined}
              data-ai-id={aiOf("call", "video")}
              data-ai-type="call_button"
            >
              <IconVideo aria-hidden="true" />
              <span>{calling === "video" ? t("call.starting") : t("call.video")}</span>
            </button>
          </div>
        ) : null}
      </div>

      {ring && mode === "client" ? (
        <div className="supchat__ring" role="status">
          <span className="supchat__ringic" aria-hidden="true">
            {ring.callType === "video" ? <IconVideo /> : <IconPhone />}
          </span>
          <span className="supchat__ringtx">
            <b>{t("call.incoming")}</b>
            <small>{ring.callType === "video" ? t("call.video") : t("call.audio")}</small>
          </span>
          <button type="button" className="btn btn--sm supchat__join" onClick={joinRing} data-ai-id={aiOf("call")} data-ai-type="call_button">
            {ring.callType === "video" ? <IconVideo aria-hidden="true" /> : <IconPhone aria-hidden="true" />}
            {t("call.join")}
          </button>
          <button type="button" className="supchat__ringx" onClick={() => setRing(null)} aria-label={tc("a11y.close")} title={tc("a11y.close")}>
            <IconClose />
          </button>
        </div>
      ) : null}

      {connecting ? (
        <div className="supwait" role="status">
          <span className="supwait__ic" aria-hidden="true">
            <IconHourglass />
          </span>
          <span className="supwait__tx">
            <b>{t("chat.waitTitle")}</b>
            <span>{t("chat.waitText")}</span>
          </span>
        </div>
      ) : null}

      <div
        className="supchat__msgs"
        ref={box}
        onScroll={onScroll}
        role="log"
        aria-live="off"
        aria-label={t("chat.log")}
        aria-busy={state === "loading"}
        tabIndex={0}
        data-ai-id={aiOf("messages")}
        data-ai-type="list"
        data-ai-private
      >
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
        {state === "ready" && !rows.length ? <p className="supchat__hint">{t("noMessages")}</p> : null}
        {mode === "client" && state === "ready" && !hasMore && rows.length && meta ? <p className="supchat__start">{meta}</p> : null}
        {rows.map((row, i) => {
          const prevRow = i > 0 ? rows[i - 1] : undefined;
          const iso = row.kind === "msg" ? row.m.createdAt : row.c.at;
          const prevIso = prevRow ? (prevRow.kind === "msg" ? prevRow.m.createdAt : prevRow.c.at) : "";
          const day = iso ? dateOnly(iso, locale) : "";
          const showDay = Boolean(day) && (!prevRow || dateOnly(prevIso, locale) !== day);
          if (row.kind === "card") {
            return (
              <div key={`card-${row.c.key}`} className="supchat__row">
                {showDay ? <span className="supchat__day">{dayText(day)}</span> : null}
                <AssistNote card={row.c} />
              </div>
            );
          }
          const m = row.m;
          const prev = prevRow && prevRow.kind === "msg" ? prevRow.m : undefined;
          const mine = Boolean(meId) && m.senderUserId === meId;
          const sys = m.senderRole === "system" || m.messageType === "system";
          const ai = !mine && !sys && AI_ROLES.has(m.senderRole);
          const cont = Boolean(prev) && !showDay && !sys && prev?.senderUserId === m.senderUserId && prev?.messageType !== "system" && near(prev?.createdAt ?? "", m.createdAt);
          const role = m.senderRole && !sys ? roleLabel(m.senderRole) : "";
          return (
            <div key={m.id || `${m.createdAt}-${i}`} className="supchat__row">
              {showDay ? <span className="supchat__day">{dayText(day)}</span> : null}
              <div className={`supmsg${mine ? " supmsg--me" : ""}${sys ? " supmsg--sys" : ""}${ai ? " supmsg--ai" : ""}${cont ? " supmsg--cont" : ""}`}>
                {ai && !cont ? (
                  <span className="supmsg__who">
                    <span className="supmsg__ai">
                      <IconSparkle aria-hidden="true" />
                      {m.senderName || t("roles.ai")}
                    </span>
                  </span>
                ) : !mine && !sys && !cont && (m.senderName || role) ? (
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
          <div className="supchat__endtx" data-ai-private>
            <b>{t("closedBanner")}</b>
            {ticket.closedAt ? <small>{t("chat.closedAt", { date: dateTimeFull(ticket.closedAt, locale) })}</small> : null}
            {ticket.resolution ? (
              <p className="supchat__res">
                <em>{t("resolution")}</em>
                {ticket.resolution}
              </p>
            ) : (
              <p>{t("chat.noResolution")}</p>
            )}
          </div>
          {!(canReopen && reopen) && (canReopen || onNewChat) ? (
            <div className="supchat__endacts">
              {canReopen ? (
                <button type="button" className="btn btn--line btn--sm" onClick={() => setReopen({ reason: "", busy: false, err: null })} data-ai-id={aiOf("reopen")}>
                  <IconRefresh />
                  {t("chat.reopen")}
                </button>
              ) : null}
              {onNewChat ? (
                <button type="button" className="btn btn--pri btn--sm" onClick={onNewChat}>
                  <IconPlus />
                  {t("chat.newChat")}
                </button>
              ) : null}
            </div>
          ) : null}
          {canReopen && reopen ? (
            <form
              className="supchat__reopen"
              data-ai-private
              onSubmit={(e) => {
                e.preventDefault();
                void doReopen();
              }}
            >
              <label className="supchat__reopenfield">
                <span>{t("chat.reopenReason")}</span>
                <textarea
                  value={reopen.reason}
                  onChange={(e) => {
                    const reason = e.target.value;
                    setReopen((r) => (r ? { ...r, reason, err: null } : r));
                  }}
                  rows={2}
                  maxLength={1000}
                  placeholder={t("chat.reopenPh")}
                  autoFocus
                />
              </label>
              {reopen.err ? (
                <p className="supchat__reopenerr" role="alert">
                  {errorText(reopen.err, tc)}
                </p>
              ) : null}
              <div className="supchat__reopenacts">
                <button type="button" className="btn btn--line btn--sm" onClick={() => setReopen(null)} disabled={reopen.busy}>
                  {t("cancel")}
                </button>
                <button type="submit" className="btn btn--pri btn--sm" disabled={reopen.busy}>
                  <IconRefresh />
                  {t("chat.reopenDo")}
                </button>
              </div>
            </form>
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
            data-ai-private
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="supchat__field">
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
                data-ai-id={aiInput}
              />
              <button type="submit" className="supchat__send" disabled={!writable || sending || !text.trim()} aria-label={t("send")} title={t("send")}>
                <IconSend />
              </button>
            </div>
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
