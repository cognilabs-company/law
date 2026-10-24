"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { canMakeCalls, sessionRoles, useAuth } from "@/lib/auth";
import { subscribeUserEvents } from "@/lib/userSocket";
import { dateOnly, shortDateTime, timeOnly } from "@/lib/date";
import { CALL_LINK_RE, chatContacts, isMachineFileName, maskContacts } from "@/lib/chatFilter";
import { canRecordVoice } from "@/lib/voiceRecorder";
import { roomOrderLock, subscribeOrderLock } from "@/components/marketplace/order/lock";
import CallRoom from "@/components/chat/CallRoom";
import DeskCall from "../call/DeskCall";
import { getLawyerClients, getUrgentRequest, listAssignedUrgentRequests, listLawyers, listMyUrgentRequests, listSecureChats, mergeSecureRoom, normSecureRoom, type SecureRoom, type UrgentRequest } from "@/lib/services/backend";
import { IconAlert, IconChat, IconCheck, IconClock, IconClose, IconCopy, IconLock, IconMic, IconMoreHorizontal, IconPaperclip, IconPhone, IconReply, IconSend, IconShieldCheck, IconSparkle, IconTag, IconTrash, IconUsers, IconVideo } from "@/components/icons";
import { Avatar, Btn, Dialog, Empty, Loading, Search, Spinner, TextArea, useConfirm, useHost, useOs, useToast } from "../../kit/kit";
import type { NativeProps } from "../../native";
import Attachment from "./Attachment";
import { useChat, type ChatError, type ChatMsg } from "./useChat";
import "./messages.css";
import { SECURE_UPLOAD_ACCEPT, secureUploadProblem, type SecureUploadProblem } from "@/lib/secureUpload";
import { useSecureUploadText } from "@/components/chat/useSecureUploadText";

// Messages as a desktop program — Messages on the Mac, Teams' chat on
// Windows: the conversations on the left with who, the last word and what
// is unread; the chosen one on the right with its bubbles by day, replies,
// photos, files and voice notes, a composer at the bottom, and the calls in
// its header. A call fills the window, so the window itself can float as
// picture-in-picture. Rooms arrive at /portal/chat/<id>, the cabinet's link.

type Kind = "all" | "urgent" | "order" | "case" | "other";
const KINDS: Kind[] = ["urgent", "order", "case", "other"];
const stamp = (r: SecureRoom) => {
  const v = Date.parse(r.updatedAt || r.lastMessageAt || r.createdAt || "");
  return Number.isFinite(v) ? v : 0;
};
const sortRooms = (l: SecureRoom[]) => [...l].sort((a, b) => stamp(b) - stamp(a));
const done = (r: UrgentRequest) => (r.finalStatuses.length ? r.finalStatuses.includes(r.status) : r.status === "completed" || r.status === "cancelled");
const pick = (a: UrgentRequest | undefined, b: UrgentRequest) => (!a ? b : done(a) !== done(b) ? (done(a) ? b : a) : Date.parse(b.createdAt || "") > Date.parse(a.createdAt || "") ? b : a);
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const METADATA_ONLY = "[metadata_only]";
const TTL = [0, 24, 168, 720] as const;
const TTL_KEY: Record<number, string> = { 0: "ttlOff", 24: "ttl24h", 168: "ttl7d", 720: "ttl30d" };

function parseRoute(route: string) {
  const m = /\/portal\/chat\/([^/?#]+)(?:\?([^#]*))?/.exec(route);
  if (!m) return null;
  const q = new URLSearchParams(m[2] ?? "");
  return { id: decodeURIComponent(m[1]), ua: q.get("ua") ?? "", wid: q.get("wid") ?? "", svc: q.get("svc") ?? "", join: q.get("join") ?? "" };
}

export default function MessagesApp({ base, route, onRoute, openApp, tell, pip }: NativeProps) {
  const t = useTranslations("secureChat");
  const ti = useTranslations("secureChat.inbox");
  const tk = useTranslations("portal.client.urgent");
  const d = useTranslations("portal.desk.messages");
  const locale = useLocale();
  const os = useOs();
  const { session } = useAuth();
  const me = session?.id ?? "";
  const role = session?.role ?? "";
  const [rooms, setRooms] = useState<SecureRoom[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [dir, setDir] = useState<Map<string, string>>(new Map());
  const [ua, setUa] = useState<Map<string, UrgentRequest>>(new Map());
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const at = parseRoute(route);
  const [sel, setSel] = useState(at?.id ?? "");
  const [link, setLink] = useState(at);
  // A new link (another app opened a room here) moves the selection.
  const [seenRoute, setSeenRoute] = useState(route);
  if (route !== seenRoute) {
    setSeenRoute(route);
    if (at) {
      setSel(at.id);
      setLink(at);
    }
  }

  useEffect(() => {
    let alive = true;
    listSecureChats()
      .then((l) => {
        if (!alive) return;
        setRooms(sortRooms(l));
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [tick]);
  useEffect(() => {
    let alive = true;
    // A client has no client list or assigned urgent requests to ask for.
    const seller = role !== "client";
    Promise.allSettled([listLawyers({ includeUnverified: true }), seller ? getLawyerClients() : Promise.resolve([])]).then(([lawyers, clients]) => {
      if (!alive) return;
      const m = new Map<string, string>();
      if (lawyers.status === "fulfilled") for (const l of lawyers.value) if (l.userId) m.set(l.userId, l.name || l.phone);
      if (clients.status === "fulfilled") for (const c of clients.value) if (c.id) m.set(c.id, c.name || c.phone);
      setDir(m);
    });
    Promise.allSettled([seller ? listAssignedUrgentRequests() : Promise.resolve([]), listMyUrgentRequests()]).then((res) => {
      if (!alive) return;
      const m = new Map<string, UrgentRequest>();
      for (const r of res) if (r.status === "fulfilled") for (const x of r.value) if (x.secureChatRoomId) m.set(x.secureChatRoomId, pick(m.get(x.secureChatRoomId), x));
      setUa(m);
    });
    return () => {
      alive = false;
    };
  }, [role]);
  // New messages move their room to the top and count as unread there —
  // except in the room that is open.
  const selRef = useRef(sel);
  useEffect(() => {
    selRef.current = sel;
  });
  useEffect(
    () =>
      subscribeUserEvents((e) => {
        const x = e as Record<string, unknown>;
        const id = String(x.room_id ?? "");
        if (!id) return;
        if (e.event === "secure_chat.read") return setRooms((cur) => cur && cur.map((r) => (r.id === id ? { ...r, unreadCount: 0, hasUnread: false } : r)));
        if (e.event !== "secure_chat.message_created") return;
        const raw = x.room && typeof x.room === "object" ? (x.room as Record<string, unknown>) : null;
        const msg = x.message && typeof x.message === "object" ? (x.message as Record<string, unknown>) : null;
        setRooms((cur) => {
          if (!cur) return cur;
          const was = cur.find((r) => r.id === id);
          const patch = raw ? { ...raw, id: raw.id ?? id } : msg ? { id, updated_at: msg.created_at, last_message_at: msg.created_at, last_message: msg } : null;
          if (!patch) return cur;
          const next = was ? mergeSecureRoom(was, patch) : normSecureRoom(patch);
          if (!next.id) return cur;
          const mine = msg ? String(msg.sender_user_id ?? msg.sender_id ?? "") === me || msg.is_mine === true : false;
          const open = selRef.current === id;
          const row = open ? { ...next, unreadCount: 0, hasUnread: false } : raw || mine ? next : { ...next, unreadCount: (was?.unreadCount ?? 0) + 1, hasUnread: true };
          return sortRooms([row, ...cur.filter((r) => r.id !== id)]);
        });
      }),
    [me],
  );

  const svcOf = (r: UrgentRequest) => (tk.has(`kinds.${r.serviceKind}`) ? tk(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind);
  const otherOf = (r: SecureRoom) => (r.clientUserId === me ? r.sellerUserId : r.clientUserId) || r.sellerUserId || r.clientUserId || r.lastMessage?.senderId || "";
  const nameOf = (r: SecureRoom) => dir.get(otherOf(r)) || r.lastMessage?.senderName || "";
  const kindOf = (r: SecureRoom): Kind => (ua.has(r.id) ? "urgent" : r.orderId ? "order" : r.caseId ? "case" : "other");
  const preview = (r: SecureRoom) => {
    const m = r.lastMessage;
    if (!m) return "";
    const raw = m.content || "";
    const text =
      m.messageType === "voice"
        ? t("voiceNote")
        : m.messageType === "call" || m.messageType === "meeting" || CALL_LINK_RE.test(raw)
          ? t("joinZoom")
          : raw && isMachineFileName(raw)
            ? /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(raw)
              ? t("imageGeneric")
              : t("fileGeneric")
            : raw || (m.messageType === "file" ? t("fileGeneric") : "");
    return m.isMine ? ti("minePrefix", { text }) : text;
  };
  const all = useMemo(() => rooms ?? [], [rooms]);
  const needle = q.trim().toLowerCase();
  const kinds = KINDS.filter((k) => all.some((r) => kindOf(r) === k));
  const shown = all.filter((r) => (kind === "all" || kindOf(r) === kind) && (!needle || [nameOf(r), r.id, r.orderId, r.caseId, ua.get(r.id)?.workId, ua.get(r.id) ? svcOf(ua.get(r.id)!) : ""].some((v) => (v || "").toLowerCase().includes(needle))));
  const room = all.find((r) => r.id === sel) ?? null;
  const unread = all.reduce((n, r) => n + r.unreadCount, 0);

  function choose(r: SecureRoom) {
    setSel(r.id);
    setLink(null);
    setRooms((cur) => cur && cur.map((x) => (x.id === r.id ? { ...x, unreadCount: 0, hasUnread: false } : x)));
    onRoute(`/portal/chat/${r.id}`);
  }
  const titleOf = (r: SecureRoom | null, i = 0) => (r ? nameOf(r) || `${ti("room")} #${i + 1}` : link?.svc || t("title"));
  const req = (room ? ua.get(room.id) : undefined) ?? null;

  const list = (
    <aside className="dx-side dxm-side" aria-label={ti("title")}>
      <div className="dx-side__drag" aria-hidden />
      <div className="dxm-side__head">
        {os === "win" ? (
          <h2>
            {d("chats")}
            {unread ? <span className="dxm-badge">{unread}</span> : null}
          </h2>
        ) : null}
        <Search value={q} onChange={setQ} placeholder={ti("search")} wide />
        {kinds.length > 1 ? (
          <div className="dxm-kinds" role="radiogroup" aria-label={ti("fKind")}>
            {(["all", ...kinds] as Kind[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>
                {k === "all" ? d("all") : ti(`kinds.${k}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="dxm-rooms" role="listbox" aria-label={ti("title")}>
        {rooms === null ? (
          failed ? (
            <Empty icon={<IconAlert />} title={d("loadError")} action={<Btn onClick={() => setTick((n) => n + 1)}>{d("retry")}</Btn>} />
          ) : (
            <Loading label={t("loading")} />
          )
        ) : !all.length ? (
          <Empty icon={<IconShieldCheck />} title={ti("empty")} text={ti("emptyText")} />
        ) : !shown.length ? (
          <Empty title={ti("noMatch")} text={ti("noMatchText")} />
        ) : (
          shown.map((r, i) => {
            const name = titleOf(r, i);
            const u = ua.get(r.id);
            const group = u?.serviceKind === "second_opinion_group";
            const lastAt = r.lastMessage?.createdAt || r.lastMessageAt || r.updatedAt;
            return (
              <div key={r.id} role="option" tabIndex={0} aria-selected={sel === r.id} className={`dxm-room${sel === r.id ? " is-on" : ""}${r.unreadCount ? " is-new" : ""}`} onClick={() => choose(r)} onKeyDown={(e) => e.key === "Enter" && choose(r)}>
                {group ? (
                  <span className="dxm-room__grp" aria-hidden>
                    <IconUsers />
                  </span>
                ) : (
                  <Avatar name={name} size={os === "mac" ? 40 : 36} />
                )}
                <span className="dxm-room__t">
                  <span className="dxm-room__top">
                    <b>{name}</b>
                    {lastAt ? <time>{dayKey(lastAt) === dayKey(new Date().toISOString()) ? timeOnly(lastAt, locale) : dateOnly(lastAt, locale)}</time> : null}
                  </span>
                  <span className="dxm-room__sub">
                    <small>{preview(r) || (u ? svcOf(u) : ti("secured"))}</small>
                    {r.unreadCount ? <span className="dxm-badge">{r.unreadCount > 99 ? "99+" : r.unreadCount}</span> : null}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );

  return (
    <div className={`dx dx--${os} dx--side dx-app--messages`} data-os={os}>
      {pip ? null : list}
      <main className="dx-main">
        {sel ? (
          <Conversation
            key={sel}
            roomId={sel}
            room={room}
            title={titleOf(room)}
            urgentId={req?.id || (link?.id === sel ? link.ua : "")}
            service={req ? svcOf(req) : link?.id === sel ? link.svc : ""}
            workId={req?.workId || (link?.id === sel ? link.wid : "")}
            join={link?.id === sel ? link.join : ""}
            pip={pip}
            tell={tell}
            openOrder={room?.orderId ? () => openApp("marketplaceOrders", `${base}/marketplace-orders/${room.orderId}`) : undefined}
            onGone={() => {
              setSel("");
              setRooms((cur) => cur && cur.filter((r) => r.id !== sel));
              onRoute("");
            }}
          />
        ) : (
          <div className="dxm-none">
            <div className="dx-side__drag dxm-none__drag" aria-hidden />
            <Empty icon={<IconChat />} title={d("pick")} text={d("pickText")} />
          </div>
        )}
      </main>
    </div>
  );
}

// A conversation inside another program's pane (the editor's Chat tab):
// the bubbles and the composer, no header and no calls of its own.
const quiet = () => undefined;
export function ChatPane({ roomId, title }: { roomId: string; title: string }) {
  return <Conversation roomId={roomId} room={null} title={title} urgentId="" service="" workId="" join="" pip={false} tell={quiet} onGone={quiet} pane />;
}

function Conversation({ roomId, room, title, urgentId, service, workId, join, pip, tell, openOrder, onGone, pane }: { roomId: string; room: SecureRoom | null; title: string; urgentId: string; service: string; workId: string; join: string; pip: boolean; tell: NativeProps["tell"]; openOrder?: () => void; onGone: () => void; pane?: boolean }) {
  const t = useTranslations("secureChat");
  const d = useTranslations("portal.desk.messages");
  const tcb = useTranslations("common");
  const locale = useLocale();
  const os = useOs();
  const { menu, dragWindow, zoomWindow } = useHost();
  const { session } = useAuth();
  const me = session?.id ?? "";
  const [toast, say] = useToast();
  const [confirmNode, confirm] = useConfirm();
  const uploadText = useSecureUploadText();
  const onError = (e: ChatError, detail?: string, upload?: SecureUploadProblem | null) =>
    say(
      detail ||
        (upload ? uploadText(upload) : "") ||
        { send: t("wsSendFailed"), attach: t("attachFailed"), call: t("callFailed"), session: t("wsSessionExpired"), forbidden: t("wsForbidden"), settings: t("settingsFailed"), delete: t("deleteFailed"), complete: t("completeFailed"), mic: t("micDenied") }[e],
      "err",
    );
  const chat = useChat(roomId, { joinCallId: join, onError, callTitle: (k) => t(k === "video" ? "videoCall" : "audioCall") });
  const { setFinished } = chat;
  const [text, setText] = useState("");
  const [reply, setReply] = useState<ChatMsg | null>(null);
  const [ttl, setTtl] = useState(0);
  const [callsOff, setCallsOff] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const [today, setToday] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const staff = sessionRoles(session).some((r) => r !== "client");

  useEffect(() => {
    const h = setTimeout(() => setToday(new Date().toISOString()), 0);
    return () => clearTimeout(h);
  }, []);
  // The urgent request behind the room, and the order's lock: either can
  // close the chat for writing or turn the calls off.
  useEffect(() => {
    if (!urgentId) return;
    let alive = true;
    getUrgentRequest(urgentId)
      .then((r) => alive && (r.finalStatuses.length ? r.finalStatuses.includes(r.status) : r.status === "completed") && setFinished(true))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [urgentId, setFinished]);
  useEffect(() => {
    const st = (room?.status || "").toLowerCase();
    if (st === "completed" || st === "closed") {
      const h = setTimeout(() => setFinished(true), 0);
      return () => clearTimeout(h);
    }
  }, [room?.status, setFinished]);
  const orderId = urgentId ? "" : room?.orderId ?? "";
  useEffect(() => {
    if (!orderId) return;
    const ctrl = new AbortController();
    const apply = (l: { chatReadOnly: boolean; callsAllowed: boolean }) => {
      if (l.chatReadOnly) setFinished(true);
      if (!l.callsAllowed) setCallsOff(true);
    };
    const off = subscribeOrderLock(orderId, apply);
    roomOrderLock({ orderId, clientUserId: room?.clientUserId, sellerUserId: room?.sellerUserId }, me, ctrl.signal)
      .then((l) => l && !ctrl.signal.aborted && apply(l))
      .catch(() => undefined);
    return () => {
      off();
      ctrl.abort();
    };
  }, [orderId, room?.clientUserId, room?.sellerUserId, me, setFinished]);
  // A call fills the window; the desktop learns of it (it brings the window
  // forward and can float it).
  const call = chat.active;
  useEffect(() => {
    if (!call) return;
    tell({ type: "lexgo-desk:call", on: true, video: call.callType === "video" });
    return () => tell({ type: "lexgo-desk:call", on: false, video: false });
  }, [call, tell]);
  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" });
  }, [chat.msgs.length]);
  useEffect(() => {
    if (!flash) return;
    const h = setTimeout(() => setFlash(""), 1600);
    return () => clearTimeout(h);
  }, [flash]);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const who = (m: ChatMsg) => m.sender?.name.trim() || t("unknownSender");
  const role = (m: ChatMsg) => {
    const r = (m.sender?.role || "").toLowerCase();
    const k = r === "client" ? "roleClient" : r === "advokat" || r === "advocate" ? "roleAdvokat" : r === "yurist" || r === "lawyer" ? "roleYurist" : r.includes("operator") || r.includes("call") ? "roleOperator" : "";
    return k ? t(k) : "";
  };
  const excerpt = (m: { messageType?: string; filteredContent?: string; content?: string; file?: ChatMsg["file"] }) => {
    if (m.messageType === "voice") return t("voiceNote");
    if (m.messageType === "file" || m.file) return m.file?.fileName || t("fileGeneric");
    const c = m.filteredContent ?? m.content ?? "";
    return !c || c === METADATA_ONLY ? t("hiddenQuote") : maskContacts(c);
  };
  const quoteOf = (r: NonNullable<ChatMsg["replyTo"]>) => {
    const o = chat.msgs.find((x) => x.id === r.id);
    return o ? excerpt(o) : excerpt({ messageType: r.messageType, content: r.content });
  };
  const canReply = (m: ChatMsg) => !chat.finished && !!m.id && !m.pending && !m.failed && !m.id.startsWith("tmp-");
  const many = new Set(chat.msgs.map((m) => m.senderId).filter(Boolean)).size > 2;
  const jump = (id: string) => {
    const el = body.current?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
  };

  function send() {
    if (!text.trim()) return;
    // No phone, e-mail, username or link leaves the composer (the backend refuses it too).
    if (chatContacts(text).length) return say(tcb("contactBlocked"), "err");
    void chat.send(text, reply);
    setText("");
    setReply(null);
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape" && reply) setReply(null);
  };
  function pickFile(files: FileList | null) {
    const f = files?.[0];
    if (file.current) file.current.value = "";
    if (!f) return;
    const problem = secureUploadProblem(f);
    if (problem) return say(uploadText(problem), "err");
    void chat.attach(f, "file", f.name, reply);
    setReply(null);
  }
  async function remove() {
    const ok = await confirm({ title: t("deleteAsk"), text: t("archiveNote"), ok: t("deleteChat"), cancel: t("cancel"), danger: true });
    if (ok && (await chat.remove())) onGone();
  }
  const setAutoDelete = (h: number) => {
    const prev = ttl;
    setTtl(h);
    void chat.ttl(h).then((ok) => ok || setTtl(prev));
  };
  const more = (e: MouseEvent) =>
    menu?.(e, title, [
      ...(openOrder ? [{ id: "order", label: d("openOrder"), icon: <IconTag />, onSelect: openOrder }] : []),
      { id: "copilot", label: t("askCopilot"), icon: <IconSparkle />, onSelect: () => tell({ type: "lexgo-desk:copilot", entity: { type: "secure_chat", id: roomId, title: service || (workId ? `#${workId}` : title) } }) },
      { sep: true, id: "s1" },
      { heading: t("ttlTitle"), id: "ttl" },
      ...TTL.map((h) => ({ id: `ttl${h}`, label: t(TTL_KEY[h]), icon: <IconClock />, checked: ttl === h, onSelect: () => setAutoDelete(h) })),
      { sep: true as const, id: "s2" },
      ...(urgentId && staff && !chat.finished ? [{ id: "complete", label: t("completeChat"), icon: <IconCheck />, onSelect: () => setSummary("") }] : []),
      { id: "del", label: t("deleteChat"), icon: <IconTrash />, danger: true, onSelect: () => void remove() },
    ]);
  const msgMenu = (e: MouseEvent, m: ChatMsg) => {
    e.preventDefault();
    const txt = m.filteredContent && m.filteredContent !== METADATA_ONLY ? m.filteredContent : "";
    menu?.(e, excerpt(m).slice(0, 40), [
      ...(canReply(m) ? [{ id: "reply", label: t("reply"), icon: <IconReply />, onSelect: () => (setReply(m), field.current?.focus()) }] : []),
      ...(txt ? [{ id: "copy", label: d("copy"), icon: <IconCopy />, onSelect: () => void navigator.clipboard?.writeText(txt).then(() => say(d("copied"))) }] : []),
      ...(m.failed && m.messageType === "text" ? [{ id: "again", label: d("resend"), icon: <IconSend />, onSelect: () => void chat.send(m.filteredContent, null) }] : []),
    ]);
  };
  const calls = !pane && canMakeCalls(session) && !callsOff;
  const sub = chat.conn === "online" ? [service, workId ? `#${workId}` : ""].filter(Boolean).join(" · ") || t("secured") : chat.conn === "connecting" ? t("connecting") : t("offline");
  const drag = (e: React.PointerEvent<HTMLElement>) => !(e.target as HTMLElement).closest("button,input,textarea,a") && dragWindow?.(e);

  if (call && session)
    return (
      <div className={`dxm-call${pip ? " is-pip" : ""}`}>
        <CallRoom roomId={roomId} callId={call.callId} callType={call.callType} isCaller={call.isCaller} lk={call.lk} title={title} skin={DeskCall} onEnd={() => chat.setActive(null)} />
      </div>
    );

  return (
    <section className={`dxm-conv${pane ? " is-pane" : ""}`} aria-label={title}>
      <header className="dxm-head" onPointerDown={drag} onDoubleClick={(e) => !(e.target as HTMLElement).closest("button") && zoomWindow?.()}>
        {os === "win" ? <Avatar name={title} size={32} /> : null}
        <div className="dxm-head__t">
          <b>{title}</b>
          <small className={`is-${chat.conn}`}>
            <i aria-hidden />
            {sub}
          </small>
        </div>
        <div className="dxm-head__tools">
          {calls ? (
            <>
              <button type="button" className="dxm-hb" onClick={() => void chat.call("audio")} disabled={chat.finished} aria-label={t("audioCall")} title={t("audioCall")}>
                <IconPhone />
              </button>
              <button type="button" className="dxm-hb" onClick={() => void chat.call("video")} disabled={chat.finished} aria-label={t("videoCall")} title={t("videoCall")}>
                <IconVideo />
              </button>
            </>
          ) : null}
          <button type="button" className="dxm-hb" onClick={more} aria-label={t("chatSettings")} title={t("chatSettings")}>
            <IconMoreHorizontal />
          </button>
        </div>
      </header>

      {chat.incoming && !call && !pane ? (
        <div className="dxm-ring" role="alert">
          <span className="dxm-ring__ic">{chat.incoming.callType === "video" ? <IconVideo /> : <IconPhone />}</span>
          <span className="dxm-ring__t">
            <b>{t("incomingCall")}</b>
            <small>{title}</small>
          </span>
          <Btn onClick={chat.dismiss}>{t("callDismiss")}</Btn>
          <Btn kind="primary" onClick={chat.join}>
            {t("callJoin")}
          </Btn>
        </div>
      ) : null}

      <div className="dxm-body" ref={body}>
        <p className="dxm-sys">
          <IconLock aria-hidden />
          {t("encrypted")}
        </p>
        {chat.status === "loading" && !chat.msgs.length ? (
          <Loading label={t("loading")} />
        ) : chat.status === "error" && !chat.msgs.length ? (
          <Empty icon={<IconAlert />} title={t("errorLoad")} action={<Btn onClick={chat.retry}>{d("retry")}</Btn>} />
        ) : !chat.msgs.length ? (
          <Empty icon={<IconChat />} title={t("empty")} text={t("safetyNote")} />
        ) : (
          chat.msgs.map((m, i) => {
            const prev = chat.msgs[i - 1];
            const dk = dayKey(m.createdAt);
            const day = !prev || dayKey(prev.createdAt) !== dk;
            const mine = m.senderId === me;
            const sys = m.messageType === "system" || m.messageType === "result";
            const head = !mine && many && (day || prev?.senderId !== m.senderId);
            const tail = chat.msgs[i + 1]?.senderId !== m.senderId || dayKey(chat.msgs[i + 1]?.createdAt ?? "") !== dk;
            const dayLabel = today && dk === dayKey(today) ? t("today") : today && dk === dayKey(new Date(Date.parse(today) - 864e5).toISOString()) ? t("yesterday") : dateOnly(m.createdAt, locale);
            const callNote = m.messageType === "call" || m.messageType === "meeting" || CALL_LINK_RE.test(m.filteredContent || "");
            const textBody = m.messageType === "voice" || callNote ? "" : (m.filteredContent || "").trim() === (m.file?.fileName || "").trim() ? "" : m.filteredContent === METADATA_ONLY ? "" : m.filteredContent;
            return (
              <div key={m.id || i} className="dxm-row-wrap">
                {day ? (
                  <p className="dxm-day">
                    <span>{dayLabel}</span>
                  </p>
                ) : null}
                {sys ? (
                  <p className="dxm-note">
                    <b>{m.messageType === "result" ? t("noticeResult") : t("noticeSystem")}</b>
                    {textBody}
                  </p>
                ) : (
                  <div className={`dxm-msg${mine ? " is-me" : ""}${tail ? " is-tail" : ""}${flash === m.id ? " is-flash" : ""}`} data-mid={m.id} onContextMenu={(e) => msgMenu(e, m)}>
                    {head ? (
                      <span className="dxm-msg__who">
                        {who(m)}
                        {role(m) ? <em>{role(m)}</em> : null}
                      </span>
                    ) : null}
                    <div className={`dxm-bub${m.isBlocked ? " is-blocked" : ""}${m.file && !textBody ? " is-media" : ""}`}>
                      {m.replyTo ? (
                        <button type="button" className="dxm-quote" onClick={() => jump(m.replyTo!.id)} title={t("replyJump")}>
                          <b>{(m.replyTo.sender?.id || chat.msgs.find((x) => x.id === m.replyTo!.id)?.senderId) === me ? d("you") : m.replyTo.sender?.name || t("unknownSender")}</b>
                          <span>{quoteOf(m.replyTo)}</span>
                        </button>
                      ) : null}
                      {m.file || m.messageType === "voice" ? <Attachment roomId={roomId} msg={m} /> : null}
                      {callNote ? (
                        <span className="dxm-callnote">
                          <IconVideo aria-hidden />
                          {t("joinZoom")}
                        </span>
                      ) : null}
                      {m.isBlocked ? <span className="dxm-bub__blk">{t("blocked")}</span> : textBody ? <span className="dxm-bub__txt">{maskContacts(textBody)}</span> : null}
                      <span className="dxm-bub__meta">
                        {m.pending ? <Spinner small /> : m.failed ? <IconAlert className="is-err" /> : null}
                        <time dateTime={m.createdAt} title={shortDateTime(m.createdAt, locale)}>
                          {timeOnly(m.createdAt, locale)}
                        </time>
                      </span>
                    </div>
                    {m.failed ? (
                      <button type="button" className="dxm-msg__fail" onClick={() => m.messageType === "text" && void chat.send(m.filteredContent, null)}>
                        {d("notSent")}
                        {m.messageType === "text" ? ` · ${d("resend")}` : ""}
                      </button>
                    ) : null}
                    {canReply(m) ? (
                      <button type="button" className="dxm-msg__reply" onClick={() => (setReply(m), field.current?.focus())} aria-label={t("reply")} title={t("reply")}>
                        <IconReply />
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {chat.finished ? (
        <footer className="dxm-done">
          <IconLock aria-hidden />
          {t("chatFinished")}
        </footer>
      ) : (
        <footer className="dxm-compose">
          {reply ? (
            <div className="dxm-replying">
              <IconReply aria-hidden />
              <span>
                <b>{reply.senderId === me ? d("you") : who(reply)}</b>
                <small>{excerpt(reply)}</small>
              </span>
              <button type="button" onClick={() => setReply(null)} aria-label={t("replyCancel")} title={t("replyCancel")}>
                <IconClose />
              </button>
            </div>
          ) : null}
          {chat.rec.on ? (
            <div className="dxm-rec" role="status">
              <i aria-hidden />
              <span>{d("recording", { time: `${Math.floor(chat.rec.sec / 60)}:${String(chat.rec.sec % 60).padStart(2, "0")}` })}</span>
              <Btn onClick={chat.cancelVoice}>{t("voiceCancel")}</Btn>
              <Btn kind="primary" icon={<IconSend />} onClick={() => void chat.voice(reply).then(() => setReply(null))}>
                {t("voiceSend")}
              </Btn>
            </div>
          ) : (
            <div className="dxm-bar">
              <button type="button" className="dxm-cb" onClick={() => file.current?.click()} aria-label={t("attachFile")} title={t("attachFile")}>
                <IconPaperclip />
              </button>
              <input ref={file} type="file" accept={SECURE_UPLOAD_ACCEPT} hidden onChange={(e) => pickFile(e.target.files)} />
              <textarea ref={field} className="dxm-field" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={t("placeholder")} aria-label={t("placeholder")} maxLength={4000} />
              {text.trim() ? (
                <button type="button" className="dxm-cb dxm-cb--send" onClick={send} aria-label={t("send")} title={t("send")}>
                  <IconSend />
                </button>
              ) : canRecordVoice() ? (
                <button type="button" className="dxm-cb" onClick={() => void chat.voice(reply)} aria-label={t("voiceRecord")} title={t("voiceHint")}>
                  <IconMic />
                </button>
              ) : null}
            </div>
          )}
        </footer>
      )}

      <Dialog
        open={summary !== null}
        title={t("completeChat")}
        onClose={() => setSummary(null)}
        onSubmit={() => void chat.complete(urgentId, summary ?? "").then((ok) => ok && (setSummary(null), say(t("completedOk"))))}
        actions={
          <>
            <Btn onClick={() => setSummary(null)}>{t("cancel")}</Btn>
            <Btn kind="primary" type="submit">
              {t("completeSubmit")}
            </Btn>
          </>
        }
      >
        <p className="dx-dlg__text">{t("completeConfirm")}</p>
        <TextArea value={summary ?? ""} onChange={setSummary} placeholder={t("completeSummaryPh")} rows={4} ariaLabel={t("completeSummary")} />
      </Dialog>
      {confirmNode}
      {toast}
    </section>
  );
}
