"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { ApiError, asDict, asStr, isAborted, isForbidden, parseServerTime } from "@/lib/http";
import { dateOnly, timeOnly } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { subscribeUserEvents } from "@/lib/userSocket";
import { primeCallAudio, stopAllCallTones } from "@/lib/callSounds";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import { openInstructor } from "@/lib/guide/panel";
import { assistInfoOf, byMessageTime, createSupportTicket, isClosedStatus, isVisibleMessage, isWaitingTicket, loadLatestMessages, loadNewMessages, loadOlderMessages, reopenSupportTicket, sendSupportMessage, supportCallHref, ticketTitle, timeOf, type MessageCursor, type SupportAssistInfo, type SupportCall, type SupportEventKind, type SupportMessage, type SupportTicket } from "@/lib/services/support";
import { useMinuteNow, useSupportHours, useSupportLabels } from "@/components/support/bits";
import { useMyChats } from "@/components/support/useMyChats";
import { SUPPORT_PHONE, SUPPORT_TEL } from "@/components/support/contact";
import { IconAlert, IconArrowRight, IconBolt, IconCard, IconChat, IconCheckDouble, IconClock, IconFileText, IconHeadset, IconPhone, IconPlus, IconRefresh, IconSend, IconSparkle, IconVideo } from "@/components/icons";
import { Avatar, Banner, Btn, Dialog, Empty, Field, Loading, Search, Spinner, Tag, TextArea, Toggle, useOs, useToast, type Tone } from "../kit/kit";
import type { NativeProps } from "../native";
import "./support.css";

// Support as a desktop program — Get Help on Windows, Apple Support on the
// Mac: the requests on the left (open ones and closed ones), the chosen one
// on the right as a conversation with the operator or the AI, what the
// operator set up for you along the way as notes in it; "New request" to
// describe a problem with its topic, and the support line's hours and
// phone. An operator's call rings here and opens in Messages.

const TOPICS = ["subscription", "payment", "documents", "urgent_advokat", "account", "technical"] as const;
const PAGE = 50;
const DAY_MS = 864e5;
const CALL_OVER = new Set(["ended", "cancelled", "expired", "missed", "rejected", "failed"]);
const AI_ROLES = new Set(["ai", "assistant", "ai_instructor", "bot"]);
const STATUS_OF: Partial<Record<SupportEventKind, string>> = { claimed: "claimed", transferred: "transferred", closed: "closed", reopened: "reopened" };
const TONE: Record<string, Tone> = { ai_handling: "info", waiting_operator: "warn", claimed: "ok", transferred: "info", waiting_client_confirm: "warn", reopened: "accent", closed: "neutral", resolved: "ok", cancelled: "err" };

const merge = (cur: SupportMessage[], next: SupportMessage[]) => {
  const seen = new Map(cur.map((m) => [m.id, m]));
  for (const m of next) if (m.id && isVisibleMessage(m)) seen.set(m.id, m);
  return [...seen.values()].sort(byMessageTime);
};
const guess = (text: string) => {
  const s = text.toLowerCase();
  if (/(tarif|obuna|подписк|тариф|plan|subscri)/.test(s)) return "subscription";
  if (/(to'lov|tolov|оплат|платеж|pay|karta|card)/.test(s)) return "payment";
  if (/(hujjat|документ|document)/.test(s)) return "documents";
  return "";
};

export default function SupportApp({ route, openApp }: NativeProps) {
  const t = useTranslations("support");
  const d = useTranslations("portal.desk.support");
  const os = useOs();
  const locale = useLocale();
  const { session } = useAuth();
  const me = session?.id ?? "";
  const labels = useSupportLabels();
  const hours = useSupportHours();
  const now = useMinuteNow();
  const chats = useMyChats();
  const { upsert, patch, poll, bump, clearUnread } = chats;
  const routeTicket = /[?&]ticket=([^&#]+)/.exec(route)?.[1] ?? "";
  const [sel, setSel] = useState(routeTicket ? decodeURIComponent(routeTicket) : "");
  const [composing, setComposing] = useState(!routeTicket);
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [q, setQ] = useState("");
  const [toast, say] = useToast();

  const { online } = useSupportEvents((e) => {
    const owner = e.ticket?.clientUserId || e.clientUserId;
    if (owner && me && owner !== me) return;
    const known = Boolean(chats.map[e.ticketId]);
    if (e.ticket) upsert(e.ticket);
    else if (known && STATUS_OF[e.kind]) patch(e.ticketId, { status: STATUS_OF[e.kind] });
    if (e.kind === "message") {
      const last = e.messages[e.messages.length - 1];
      if (last && !e.ticket) {
        const at = last.createdAt || new Date().toISOString();
        patch(e.ticketId, { lastMessage: last.content, lastMessageAt: at, updatedAt: at });
      }
      if (e.ticketId !== sel) for (const m of e.messages) if (m.senderUserId && m.senderUserId !== me) bump(e.ticketId, m.id);
      if (!e.messages.length) poll();
    } else if (!e.ticket && !known && e.kind === "created") poll();
  }, poll);
  usePoll(poll, 30000, chats.status === "ready" && !online);

  const list = tab === "active" ? chats.active : chats.closed;
  const needle = q.trim().toLowerCase();
  const shown = list.filter((tk) => !needle || [ticketTitle(tk, ""), tk.lastMessage, tk.workId, labels.category(tk.category)].some((s) => (s || "").toLowerCase().includes(needle)));
  const current = sel ? chats.map[sel] ?? null : null;
  const choose = (id: string) => {
    if (sel && sel !== id) clearUnread(sel);
    clearUnread(id);
    setSel(id);
    setComposing(false);
  };
  const ago = (iso: string) => {
    const v = parseServerTime(iso);
    if (!now || !Number.isFinite(v)) return "";
    return dateOnly(iso, locale) === dateOnly(new Date(now).toISOString(), locale) ? timeOnly(iso, locale) : dateOnly(iso, locale);
  };
  const status = (s: string) => (t.has(`status.${s}`) ? t(`status.${s}`) : s);

  return (
    <div className={`dx dx--${os} dx--side dx-app--support`} data-os={os}>
      <aside className="dx-side dxs-side" aria-label={t("chats.title")}>
        <div className="dx-side__drag" aria-hidden />
        <div className="dxs-side__head">
          {os === "win" ? <h2>{t("chats.title")}</h2> : null}
          <Btn kind="primary" icon={<IconPlus />} onClick={() => (setComposing(true), setSel(""))} className="dxs-newbtn">
            {d("newRequest")}
          </Btn>
          <Search value={q} onChange={setQ} placeholder={t("chats.searchPh")} wide />
          <div className="dxs-tabs" role="tablist" aria-label={t("chats.filterLabel")}>
            {(["active", "closed"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
                {t(`chats.tabs.${k}`)}
                {k === "active" && chats.active.length ? <span>{chats.active.length}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="dxs-list" role="listbox" aria-label={t("chats.title")}>
          {chats.status === "loading" ? (
            <Loading label={t("loadingMsgs")} />
          ) : chats.status === "error" && !list.length ? (
            <Empty icon={<IconAlert />} title={d("loadError")} action={<Btn onClick={poll}>{d("retry")}</Btn>} />
          ) : !shown.length ? (
            <Empty icon={<IconChat />} title={needle ? t("chats.noMatch") : tab === "active" ? t("chats.emptyActive") : t("chats.emptyClosed")} />
          ) : (
            shown.map((tk) => {
              const unread = tk.id === sel ? 0 : tk.unreadCount;
              const title = ticketTitle(tk, t("untitled"));
              const at = tk.lastMessageAt || tk.updatedAt || tk.createdAt;
              return (
                <div key={tk.id} role="option" tabIndex={0} aria-selected={sel === tk.id} className={`dxs-item${sel === tk.id ? " is-on" : ""}${unread ? " is-new" : ""}`} onClick={() => choose(tk.id)} onKeyDown={(e) => e.key === "Enter" && choose(tk.id)}>
                  <span className="dxs-item__top">
                    <b>{title}</b>
                    <time>{ago(at)}</time>
                  </span>
                  <small>{tk.lastMessage && tk.lastMessage !== title ? tk.lastMessage : labels.category(tk.category)}</small>
                  <span className="dxs-item__meta">
                    <Tag tone={TONE[tk.status] ?? "neutral"}>{status(tk.status)}</Tag>
                    {tk.workId ? <em>#{tk.workId}</em> : null}
                    {unread ? <span className="dxs-badge">{unread}</span> : null}
                  </span>
                </div>
              );
            })
          )}
        </div>
        <div className="dxs-hours">
          <span className={`dxs-hours__dot${hours?.open ? " is-open" : ""}`} aria-hidden />
          <span>
            <b>{hours ? (hours.open ? d("online") : d("offline")) : t("chat.teamName")}</b>
            {hours ? <small>{hours.schedule}</small> : null}
          </span>
          <a href={`tel:${SUPPORT_TEL}`} className="dxs-hours__tel" title={t("callUs")}>
            <IconPhone />
          </a>
        </div>
      </aside>
      <main className="dx-main">
        {current ? (
          <Ticket
            key={current.id}
            ticket={current}
            me={me}
            onTicket={(tk) => {
              if (tk.clientUserId && me && tk.clientUserId !== me) return;
              upsert(tk);
              clearUnread(tk.id);
            }}
            onSent={(m) => patch(current.id, { lastMessage: m.content, lastMessageAt: m.createdAt, updatedAt: m.createdAt })}
            onReopened={(tk) => {
              upsert(tk);
              setTab("active");
              say(t("chat.reopenedOk"));
            }}
            onJoin={(href) => openApp("messages", href)}
            onNew={() => (setSel(""), setComposing(true))}
          />
        ) : composing || !sel ? (
          <Compose
            latest={chats.active[0] ?? null}
            onResume={(id) => choose(id)}
            onCreated={(tk) => {
              say(tk.workId ? t("created", { id: tk.workId }) : t("createdPlain"));
              if (tk.id) {
                upsert(tk);
                setTab("active");
                choose(tk.id);
              } else poll();
            }}
          />
        ) : (
          <Loading label={t("loadingMsgs")} />
        )}
      </main>
      {toast}
    </div>
  );
}

// A new request: the topic (or none — the backend guesses it), the problem
// in words, whether it is urgent. An open request is offered to continue
// instead; the AI instructor is a click away for what it can answer.
function Compose({ latest, onResume, onCreated }: { latest: SupportTicket | null; onResume: (id: string) => void; onCreated: (tk: SupportTicket) => void }) {
  const t = useTranslations("support");
  const th = useTranslations("support.hub");
  const d = useTranslations("portal.desk.support");
  const labels = useSupportLabels();
  const { session } = useAuth();
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [anyway, setAnyway] = useState(false);
  const auto = !topic && text.trim().length > 8 ? guess(text) : "";

  async function submit() {
    const message = text.trim();
    if (message.length < 3 || busy) return;
    setBusy(true);
    setErr("");
    try {
      const tk = await createSupportTicket({ message, category: topic || auto || "general", priority: urgent ? "high" : "normal", source: "support_page", context: { current_path: "desktop/support", role: session?.role ?? "", topic_picked: Boolean(topic) } });
      setText("");
      setTopic("");
      setUrgent(false);
      onCreated(tk);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 429 ? d("tooMany") : d("sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dxs-new">
      <header className="dxs-new__hero">
        <span className="dxs-new__ic" aria-hidden>
          <IconHeadset />
        </span>
        <h1>{th("title")}</h1>
        <p>{t("compose.lead")}</p>
      </header>
      {latest && !anyway ? (
        <div className="dxs-resume">
          <Banner tone="info" title={t("compose.resumeTitle")} action={<Btn kind="primary" small onClick={() => onResume(latest.id)}>{t("compose.resume")}</Btn>}>
            {t("compose.resumeText")}
            <button type="button" className="dxs-link" onClick={() => setAnyway(true)}>
              {t("compose.newAnyway")}
            </button>
          </Banner>
        </div>
      ) : (
        <form
          className="dxs-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label={t("category")} hint={auto ? t("compose.autoTopic", { topic: labels.category(auto) }) : t("compose.autoHint")}>
            <div className="dxs-topics" role="radiogroup" aria-label={t("category")}>
              {TOPICS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={topic === k} className={topic === k ? "is-on" : ""} onClick={() => setTopic(topic === k ? "" : k)}>
                  {th.has(`topics.${k}.label`) ? th(`topics.${k}.label`) : labels.category(k)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("message")} error={err || undefined}>
            <TextArea value={text} onChange={setText} placeholder={t("messagePh")} rows={6} maxLength={4000} ariaLabel={t("message")} />
          </Field>
          <div className="dxs-form__row">
            <Toggle checked={urgent} onChange={setUrgent} label={t("compose.urgent")} />
            <span>
              <b>{t("compose.urgent")}</b>
              <small>{t("compose.urgentHint")}</small>
            </span>
          </div>
          <div className="dxs-form__acts">
            <Btn icon={<IconSparkle />} onClick={() => openInstructor(text.trim() ? { text: text.trim(), send: true } : {})}>
              {t("chats.askAi")}
            </Btn>
            <Btn kind="primary" type="submit" icon={<IconSend />} busy={busy} disabled={busy || text.trim().length < 3}>
              {t("submit")}
            </Btn>
          </div>
        </form>
      )}
      <p className="dxs-phone">
        <IconPhone aria-hidden />
        {t("callUs")}:{" "}
        <a href={`tel:${SUPPORT_TEL}`}>{SUPPORT_PHONE}</a>
      </p>
    </div>
  );
}

type Card = { key: string; info: SupportAssistInfo; at: string };
type Row = { kind: "msg"; m: SupportMessage; at: number } | { kind: "card"; c: Card; at: number };
const assistKey = (i: SupportAssistInfo) => (i.kind === "document_request" && ["pending", "approved", "rejected"].includes(i.pay) ? `assistNote.document_request.${i.pay}` : `assistNote.${i.kind}`);
const ASSIST_ICON = { subscription_checkout: <IconCard />, document_request: <IconFileText />, marketplace_purchase: <IconBolt />, urgent_advokat: <IconBolt />, subscription_preview: <IconSparkle /> } as const;

// One request as a conversation: the history (older pages as one scrolls
// up), what arrives live, a composer while it is open, a reopen when it is
// closed, and the operator's call as a banner to join.
function Ticket({ ticket, me, onTicket, onSent, onReopened, onJoin, onNew }: { ticket: SupportTicket; me: string; onTicket: (t: SupportTicket) => void; onSent: (m: SupportMessage) => void; onReopened: (t: SupportTicket) => void; onJoin: (href: string) => void; onNew: () => void }) {
  const t = useTranslations("support");
  const d = useTranslations("portal.desk.support");
  const locale = useLocale();
  const os = useOs();
  const labels = useSupportLabels();
  const hours = useSupportHours(!isClosedStatus(ticket.status));
  const now = useMinuteNow();
  const [msgs, setMsgs] = useState<SupportMessage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [hasMore, setHasMore] = useState(false);
  const [older, setOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);
  const [ring, setRing] = useState<SupportCall | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [reopen, setReopen] = useState<{ reason: string; busy: boolean } | null>(null);
  const cursor = useRef<MessageCursor | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const keep = useRef<number | null>(null);
  const stick = useRef(true);
  const onTicketRef = useRef(onTicket);
  useEffect(() => {
    onTicketRef.current = onTicket;
  });
  const id = ticket.id;
  const client = ticket.clientUserId;
  const closed = isClosedStatus(ticket.status);
  const role = useCallback((r: string) => (r && t.has(`roles.${r}`) ? t(`roles.${r}`) : r), [t]);

  useEffect(() => {
    const c = new AbortController();
    cursor.current = null;
    loadLatestMessages(id, PAGE, c.signal)
      .then((r) => {
        if (c.signal.aborted) return;
        cursor.current = r.cursor;
        stick.current = true;
        setMsgs((cur) => merge(cur, r.items));
        setHasMore(r.cursor.hasOlder);
        setState("ready");
        if (r.ticket) onTicketRef.current(r.ticket);
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setState(isForbidden(e) || (e instanceof ApiError && e.status === 404) ? "missing" : "error");
      });
    return () => c.abort();
  }, [id, reload]);
  const refresh = useCallback(() => {
    const cur = cursor.current;
    if (!cur) return;
    loadNewMessages(id, cur, client, new Set(msgs.map((m) => m.id)))
      .then((r) => {
        const n = cursor.current;
        if (n && r.cursor.order === "asc") cursor.current = { ...n, loaded: Math.max(n.loaded, r.cursor.loaded) };
        if (r.items.length) setMsgs((l) => merge(l, r.items));
        if (r.ticket) onTicketRef.current(r.ticket);
      })
      .catch(() => undefined);
  }, [id, client, msgs]);
  const { online } = useSupportEvents((e) => {
    if (e.ticketId !== id) return;
    if (e.kind === "message" || e.kind === "created") {
      const fresh = e.messages.filter(isVisibleMessage);
      if (fresh.length) setMsgs((cur) => merge(cur, fresh));
      else if (e.kind === "message") refresh();
    }
    if (e.ticket) onTicketRef.current(e.ticket);
    else if (e.kind === "closed") onTicketRef.current({ ...ticket, status: "closed" });
    else if (e.kind === "reopened") onTicketRef.current({ ...ticket, status: "reopened" });
    if (e.kind === "call" && e.call && !CALL_OVER.has(e.call.status.toLowerCase())) setRing(e.call);
    if (e.kind === "assist") {
      const info = assistInfoOf(e.name, e.action, locale);
      if (!info) return;
      const at = e.createdAt || new Date().toISOString();
      const key = info.kind === "subscription_preview" ? info.kind : `${info.kind}:${info.workId || info.targetId || at}`;
      setCards((cur) => [...cur.filter((c) => c.key !== key), { key, info, at }]);
    }
  }, refresh);
  usePoll(refresh, 12000, !closed && state === "ready" && !online);
  const ringId = ring?.callId ?? "";
  useEffect(() => {
    if (!ringId) return;
    return subscribeUserEvents((ev) => {
      if (!ev.event.startsWith("call.")) return;
      const c = asDict(ev.call);
      if (asStr(ev.call_id ?? c.id) !== ringId) return;
      if (ev.event === "call.ended" || ev.event === "call.participant_joined" || CALL_OVER.has(asStr(c.status ?? ev.status).toLowerCase())) setRing(null);
    });
  }, [ringId]);

  const rows = useMemo<Row[]>(() => {
    const l: Row[] = msgs.map((m) => ({ kind: "msg", m, at: timeOf(m.createdAt) }));
    for (const c of cards) l.push({ kind: "card", c, at: timeOf(c.at) });
    return l.sort((a, b) => a.at - b.at);
  }, [msgs, cards]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (keep.current !== null) {
      el.scrollTop = el.scrollHeight - keep.current;
      keep.current = null;
    } else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [rows]);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  async function loadOlder() {
    const cur = cursor.current;
    if (older || !hasMore || !cur) return;
    setOlder(true);
    const el = box.current;
    keep.current = el ? el.scrollHeight - el.scrollTop : null;
    stick.current = false;
    try {
      const r = await loadOlderMessages(id, cur, PAGE, client);
      const n = cursor.current;
      cursor.current = { ...r.cursor, loaded: r.cursor.order === "asc" && n ? Math.max(r.cursor.loaded, n.loaded) : r.cursor.loaded };
      setMsgs((l) => merge(l, r.items));
      setHasMore(r.cursor.hasOlder);
    } catch {
      keep.current = null;
    } finally {
      setOlder(false);
    }
  }
  async function send() {
    const body = text.trim();
    if (!body || sending || closed) return;
    setSending(true);
    setErr("");
    try {
      const m = await sendSupportMessage(id, body, client);
      const sent = { ...m, senderUserId: m.senderUserId || me, content: m.content || body, createdAt: m.createdAt || new Date().toISOString() };
      stick.current = true;
      if (sent.id) setMsgs((l) => merge(l, [sent]));
      else refresh();
      setText("");
      onSent(sent);
    } catch {
      setErr(d("sendFailed"));
    } finally {
      setSending(false);
    }
  }
  async function doReopen() {
    if (!reopen || reopen.busy) return;
    setReopen({ ...reopen, busy: true });
    try {
      onReopened(await reopenSupportTicket(id, reopen.reason.trim()));
      setReopen(null);
    } catch {
      setReopen({ ...reopen, busy: false });
      setErr(d("sendFailed"));
    }
  }
  const join = () => {
    if (!ring) return;
    stopAllCallTones();
    primeCallAudio();
    onJoin(supportCallHref(ring.roomId, ring.callId));
    setRing(null);
  };

  const title = ticketTitle(ticket, t("untitled"));
  const today = now === null ? "" : dateOnly(new Date(now).toISOString(), locale);
  const yesterday = now === null ? "" : dateOnly(new Date(now - DAY_MS).toISOString(), locale);
  const dayText = (day: string) => (day === today ? t("chat.today") : day === yesterday ? t("chat.yesterday") : day);
  const operator = ticket.operatorName || (ticket.operatorUserId ? t("chat.operatorFallback") : "");
  const sub = [labels.category(ticket.category), ticket.workId ? `#${ticket.workId}` : "", operator ? t("operatorIs", { name: operator }) : ""].filter(Boolean).join(" · ");

  return (
    <section className="dxs-chat" aria-label={title}>
      <header className="dxs-chat__head">
        {os === "win" ? (
          <span className="dxs-chat__ic" aria-hidden>
            <IconHeadset />
          </span>
        ) : null}
        <div className="dxs-chat__t">
          <b>{title}</b>
          <small>{sub || t("chat.teamName")}</small>
        </div>
        <Tag tone={TONE[ticket.status] ?? "neutral"}>{t.has(`status.${ticket.status}`) ? t(`status.${ticket.status}`) : ticket.status || "…"}</Tag>
        <button type="button" className="dxs-hb" onClick={refresh} aria-label={d("refresh")} title={d("refresh")}>
          <IconRefresh />
        </button>
      </header>
      {ring ? (
        <div className="dxs-ring" role="alert">
          <span className="dxs-ring__ic">{ring.callType === "video" ? <IconVideo /> : <IconPhone />}</span>
          <b>{t("call.incoming")}</b>
          <Btn kind="primary" onClick={join}>
            {t("call.join")}
          </Btn>
        </div>
      ) : null}
      {isWaitingTicket(ticket) && !closed ? (
        <div className="dxs-note">
          <IconClock aria-hidden />
          <span>
            <b>{t("chat.waitTitle")}</b>
            {hours ? (hours.open ? t("chat.waitText") : t("chat.hoursLine", { hours: hours.schedule })) : t("waitingBanner")}
          </span>
        </div>
      ) : null}
      <div
        className="dxs-log"
        ref={box}
        onScroll={() => {
          const el = box.current;
          if (!el) return;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 40 && hasMore && !older) void loadOlder();
        }}
        aria-label={t("chat.log")}
      >
        {older ? <Spinner small /> : null}
        {state === "loading" ? (
          <Loading label={t("loadingMsgs")} />
        ) : state === "missing" ? (
          <Empty icon={<IconAlert />} title={t("chat.missing")} />
        ) : state === "error" ? (
          <Empty icon={<IconAlert />} title={d("loadError")} action={<Btn onClick={() => (setState("loading"), setReload((n) => n + 1))}>{d("retry")}</Btn>} />
        ) : !rows.length ? (
          <Empty icon={<IconChat />} title={t("noMessages")} />
        ) : (
          rows.map((r, i) => {
            const prev = rows[i - 1];
            const day = dateOnly(new Date(r.at).toISOString(), locale);
            const newDay = !prev || dateOnly(new Date(prev.at).toISOString(), locale) !== day;
            const sep = newDay ? (
              <p className="dxs-day">
                <span>{dayText(day)}</span>
              </p>
            ) : null;
            if (r.kind === "card") {
              const k = assistKey(r.c.info);
              const money = r.c.info.amount > 0 ? t("assistNote.amount", { amount: fmtUzs(r.c.info.amount) }) : "";
              return (
                <div key={r.c.key}>
                  {sep}
                  <div className="dxs-assist" role="note">
                    <span className="dxs-assist__ic">{ASSIST_ICON[r.c.info.kind] ?? <IconSparkle />}</span>
                    <span className="dxs-assist__t">
                      <small>{t("assistNote.kicker")}</small>
                      <b>{t(`${k}.title`)}</b>
                      {r.c.info.title ? <em>{r.c.info.title}</em> : null}
                      <span>{t(`${k}.text`)}</span>
                      {r.c.info.workId || money ? <small>{[r.c.info.workId ? t("assistNote.workId", { id: r.c.info.workId }) : "", money].filter(Boolean).join(" · ")}</small> : null}
                    </span>
                    <time>{timeOnly(r.c.at, locale)}</time>
                  </div>
                </div>
              );
            }
            const m = r.m;
            const mine = !!me && m.senderUserId === me;
            const sys = m.senderRole === "system" || m.messageType === "system";
            const ai = !mine && !sys && AI_ROLES.has(m.senderRole);
            const cont = prev?.kind === "msg" && !newDay && prev.m.senderUserId === m.senderUserId && r.at - prev.at < 5 * 60000;
            if (sys)
              return (
                <div key={m.id}>
                  {sep}
                  <p className="dxs-sys">{m.content}</p>
                </div>
              );
            return (
              <div key={m.id}>
                {sep}
                <div className={`dxs-msg${mine ? " is-me" : ""}${ai ? " is-ai" : ""}${cont ? " is-cont" : ""}`}>
                  {!mine && !cont ? (
                    <span className="dxs-msg__who">
                      {ai ? (
                        <span className="dxs-msg__ai" aria-hidden>
                          <IconSparkle />
                        </span>
                      ) : (
                        <Avatar name={m.senderName || role(m.senderRole) || "?"} size={22} />
                      )}
                      {m.senderName || role(m.senderRole)}
                      {m.senderName && m.senderRole ? <em>{role(m.senderRole)}</em> : null}
                    </span>
                  ) : null}
                  <div className="dxs-bub">
                    {m.content}
                    {m.attachments.length ? (
                      <span className="dxs-att">
                        {m.attachments.map((a) => (
                          <a key={a.url} href={a.url} target="_blank" rel="noreferrer">
                            <IconFileText aria-hidden />
                            {a.name || a.url}
                          </a>
                        ))}
                      </span>
                    ) : null}
                    <time>{timeOnly(m.createdAt, locale)}</time>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {closed ? (
        <footer className="dxs-closed">
          <span>
            <IconCheckDouble aria-hidden />
            <b>{t("closedBanner")}</b>
            {ticket.closedAt ? <small>{t("chat.closedAt", { date: dateOnly(ticket.closedAt, locale) })}</small> : null}
          </span>
          {ticket.resolution ? <p>{ticket.resolution}</p> : null}
          <span className="dxs-closed__acts">
            <Btn onClick={onNew} icon={<IconPlus />}>
              {t("chat.newChat")}
            </Btn>
            {!client || !me || client === me ? (
              <Btn kind="primary" icon={<IconArrowRight />} onClick={() => setReopen({ reason: "", busy: false })}>
                {t("chat.reopen")}
              </Btn>
            ) : null}
          </span>
        </footer>
      ) : (
        <footer className="dxs-compose">
          {err ? <small className="dxs-err">{err}</small> : null}
          <div className="dxs-bar">
            <textarea
              ref={field}
              rows={1}
              value={text}
              maxLength={4000}
              placeholder={t("ph")}
              aria-label={t("ph")}
              onChange={(e) => (setText(e.target.value), setErr(""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="button" className="dxs-send" onClick={() => void send()} disabled={!text.trim() || sending} aria-label={t("send")} title={t("chat.enterHint")}>
              {sending ? <Spinner small /> : <IconSend />}
            </button>
          </div>
        </footer>
      )}
      <Dialog
        open={reopen !== null}
        title={t("chat.reopenDo")}
        onClose={() => setReopen(null)}
        onSubmit={() => void doReopen()}
        actions={
          <>
            <Btn onClick={() => setReopen(null)}>{t("cancel")}</Btn>
            <Btn kind="primary" type="submit" busy={reopen?.busy} disabled={reopen?.busy}>
              {t("chat.reopen")}
            </Btn>
          </>
        }
      >
        <Field label={t("chat.reopenReason")}>
          <TextArea value={reopen?.reason ?? ""} onChange={(v) => setReopen((r) => (r ? { ...r, reason: v } : r))} placeholder={t("chat.reopenPh")} rows={3} maxLength={1000} ariaLabel={t("chat.reopenReason")} />
        </Field>
      </Dialog>
    </section>
  );
}
