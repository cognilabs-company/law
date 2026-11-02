"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import { useTranslations } from "next-intl";
import { ApiError, isAborted, isForbidden } from "@/lib/http";
import { forgetSupportCall, rememberSupportCall } from "@/lib/remoteAssist/store";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import {
  isClosedStatus,
  isVisibleMessage,
  loadLatestMessages,
  loadNewMessages,
  loadOlderMessages,
  sendSupportMessage,
  type MessageCursor,
  type SupportMessage,
  type SupportTicket,
} from "@/lib/services/support";
import { mergeMessages } from "./model";

const PAGE = 50;
const SYNC_MS = 1500;
const CALL_OVER = new Set(["ended", "cancelled", "expired", "missed", "rejected", "failed"]);

export type ChatState = "loading" | "ready" | "error" | "missing";

const isMissing = (e: unknown) => isForbidden(e) || (e instanceof ApiError && e.status === 404);

type Args = {
  ticket: SupportTicket;
  meId: string;
  onTicket: (t: SupportTicket) => void;
  onMissing: (ticketId: string) => void;
};

export function useTicketChat({ ticket, meId, onTicket, onMissing }: Args) {
  const t = useTranslations("support");
  const [msgs, setMsgs] = useState<SupportMessage[]>([]);
  const [state, setState] = useState<ChatState>("loading");
  const [hasMore, setHasMore] = useState(false);
  const [older, setOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [announce, setAnnounce] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [syncReq, setSyncReq] = useState(0);
  const cursor = useRef<MessageCursor | null>(null);
  const onTicketRef = useRef(onTicket);
  const onMissingRef = useRef(onMissing);
  const msgsRef = useRef<SupportMessage[]>([]);
  const box = useRef<HTMLDivElement | null>(null);
  const bindBox = useCallback((el: HTMLDivElement | null) => {
    box.current = el;
  }, []);
  const keep = useRef<number | null>(null);
  const stick = useRef(true);
  const syncLater = useRef(false);
  const ticketId = ticket.id;
  const clientUserId = ticket.clientUserId;
  const closed = isClosedStatus(ticket.status);
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
        setMsgs((cur) => mergeMessages(cur, r.items));
        setHasMore(r.cursor.hasOlder);
        setState("ready");
        if (r.ticket) onTicketRef.current(r.ticket);
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        const gone = isMissing(e);
        setState(gone ? "missing" : "error");
        if (gone) onMissingRef.current(ticketId);
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
          setMsgs((list) => mergeMessages(list, r.items));
        }
        if (r.ticket) onTicketRef.current(r.ticket);
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

  const { online } = useSupportEvents((e) => {
    if (e.ticketId !== ticketId) return;
    if (e.kind === "message" || e.kind === "created") {
      const fresh = e.messages.filter(isVisibleMessage);
      if (fresh.length) {
        announceFresh(fresh);
        setMsgs((cur) => mergeMessages(cur, fresh));
        if (fresh.some((m) => m.senderUserId !== meId)) setSyncReq((n) => n + 1);
      } else if (e.kind === "message" && !e.messages.length) refresh();
    }
    if (e.ticket) onTicketRef.current(e.ticket);
    else if (e.kind === "closed") onTicketRef.current({ ...ticket, status: "closed" });
    else if (e.kind === "reopened") onTicketRef.current({ ...ticket, status: "reopened" });
    if (e.kind === "call" && e.call) {
      if (CALL_OVER.has(e.call.status.toLowerCase())) forgetSupportCall(ticketId, e.call.callId);
      else rememberSupportCall(ticketId, e.call.callId);
    }
  }, refresh);

  const live = Boolean(meId) && ticket.operatorUserId === meId;
  usePoll(refresh, 12000, !closed && state === "ready" && (!online || !live));

  const retry = () => {
    setState("loading");
    setReloadKey((n) => n + 1);
  };

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
      setMsgs((list) => mergeMessages(list, r.items));
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

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 40 && hasMore && !older) void loadOlder();
  };

  const send = async (raw: string): Promise<boolean> => {
    const body = raw.trim();
    if (!body || sending || closed) return false;
    setSending(true);
    setError(null);
    try {
      const m = await sendSupportMessage(ticketId, body, clientUserId);
      const sent: SupportMessage = { ...m, senderUserId: m.senderUserId || meId, content: m.content || body, createdAt: m.createdAt || new Date().toISOString() };
      stick.current = true;
      if (sent.id) setMsgs((cur) => mergeMessages(cur, [sent]));
      else refresh();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setSending(false);
    }
  };

  const clearError = () => {
    if (error) setError(null);
  };

  return { msgs, state, hasMore, older, sending, error, announce, bindBox, onScroll, loadOlder, retry, send, clearError };
}

export type TicketChat = Omit<ReturnType<typeof useTicketChat>, "bindBox">;
