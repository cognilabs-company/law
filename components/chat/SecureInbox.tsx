"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  listSecureChats,
  listLawyers,
  getLawyerClients,
  listAssignedUrgentRequests,
  listMyUrgentRequests,
  mergeSecureRoom,
  normSecureRoom,
  type SecureRoom,
  type UrgentRequest,
} from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useAuth } from "@/lib/auth";
import { subscribeUserEvents } from "@/lib/userSocket";
import { dateTimeFull } from "@/lib/date";
import { initials } from "@/lib/lawyers";
import { statusLabel } from "@/lib/labels";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconShieldCheck, IconArrowRight, IconLock, IconSearch, IconChat, IconClock, IconUsers, IconBolt } from "@/components/icons";

// The secure-chat inbox. /secure-chats returns rooms with ids only — no
// counterpart name, no last message — so every row used to read "Room #1",
// which told the user nothing about which conversation they were opening.
// This resolves the other side's name from the directories the account can
// already see, keeps the rooms searchable, and lights a row up the moment a
// message arrives on the user socket.

type Dir = Map<string, string>;

function roomStamp(room: SecureRoom): number {
  const value = Date.parse(room.updatedAt || room.lastMessageAt || room.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}
function sortRooms(rooms: SecureRoom[]): SecureRoom[] {
  return [...rooms].sort((a, b) => roomStamp(b) - roomStamp(a));
}

// R3/R32 (LEXGO_URGENT_GROUP_CHAT_FRONTEND L16, L260-262). A selected advocate
// has to be able to ENTER the group room, and to find the "Chatni yakunlash"
// action once inside — and that action only exists when the chat is opened
// WITH its Tezkor Advokat record, because completion is a request-level POST
// (/urgent-advokat/requests/{record_id}/chat/complete). /secure-chats answers
// rooms alone: no record, no work id, no service. So the inbox joins the two
// lists itself and every row that belongs to an urgent record links into the
// room carrying it.
//
// Both lists are read because both sides of the room reach it from here: an
// advocate sees the panels they were assigned to
// (/urgent-advokat/requests/assigned) and a client their own
// (/urgent-advokat/requests/me). Each answers [] for the other role, so the
// pair costs one wasted request and removes a whole class of "the button is
// missing for this user".
//
// One room really does host several records: measured on production, room
// f43fa109 is referenced by fifteen of this client's requests. The live one
// is what the header should describe, so an unfinished record wins over a
// finished one and, among equals, the newest.
function pickRecord(a: UrgentRequest | undefined, b: UrgentRequest): UrgentRequest {
  if (!a) return b;
  const done = (r: UrgentRequest) => (r.finalStatuses.length ? r.finalStatuses.includes(r.status) : r.status === "completed" || r.status === "cancelled");
  if (done(a) !== done(b)) return done(a) ? b : a;
  return Date.parse(b.createdAt || "") > Date.parse(a.createdAt || "") ? b : a;
}

export default function SecureInbox() {
  const t = useTranslations("secureChat.inbox");
  const ts = useTranslations("secureChat");
  const tc = useTranslations("portal.common");
  // The service names are the client-facing catalogue wording, which is where
  // "Ikkinchi fikr — advokatlar guruhi" is already translated; the raw
  // `title` the record carries is the backend's ASCII spelling of it.
  const tk = useTranslations("portal.client.urgent");
  const locale = useLocale();
  const { session } = useAuth();
  const res = useResource(listSecureChats, []);
  const { setData } = res;
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<Dir>(new Map());
  // roomId → the Tezkor Advokat record that room belongs to.
  const [ua, setUa] = useState<Map<string, UrgentRequest>>(new Map());

  // Who the other side is. Lawyers/advocates are a public directory; a seller
  // additionally sees their own clients. Both calls are best-effort: a name is
  // an improvement on the row, never a requirement for it.
  useEffect(() => {
    let alive = true;
    Promise.allSettled([listLawyers({ includeUnverified: true }), getLawyerClients()]).then(([lawyers, clients]) => {
      if (!alive) return;
      const m: Dir = new Map();
      if (lawyers.status === "fulfilled") for (const l of lawyers.value) if (l.userId) m.set(l.userId, l.name || l.phone);
      if (clients.status === "fulfilled") for (const c of clients.value) if (c.id) m.set(c.id, c.name || c.phone);
      setDir(m);
    });
    return () => { alive = false; };
  }, []);

  // The urgent records behind these rooms. Best-effort in exactly the way the
  // directory above is: a row without its record is still a working chat, it
  // just opens without the completion action and without its header chips.
  useEffect(() => {
    let alive = true;
    Promise.allSettled([listAssignedUrgentRequests(), listMyUrgentRequests()]).then((res) => {
      if (!alive) return;
      const m = new Map<string, UrgentRequest>();
      for (const r of res) {
        if (r.status !== "fulfilled") continue;
        for (const req of r.value) {
          if (!req.secureChatRoomId) continue;
          m.set(req.secureChatRoomId, pickRecord(m.get(req.secureChatRoomId), req));
        }
      }
      setUa(m);
    });
    return () => { alive = false; };
  }, []);

  // A new secure-chat message marks its room, so the inbox does not have to be
  // reloaded to see that something happened.
  useEffect(() => {
    return subscribeUserEvents((e) => {
      const d = e as Record<string, unknown>;
      const roomId = String(d.room_id ?? "");
      if (!roomId) return;
      if (e.event === "secure_chat.read") {
        setData((cur) => cur.map((room) => (room.id === roomId
          ? { ...room, unreadCount: 0, hasUnread: false, lastReadAt: String(d.last_read_at ?? room.lastReadAt) }
          : room)));
        return;
      }
      if (e.event !== "secure_chat.message_created") return;
      const rawRoom = d.room && typeof d.room === "object" && !Array.isArray(d.room) ? d.room as Record<string, unknown> : null;
      const rawMessage = d.message && typeof d.message === "object" && !Array.isArray(d.message) ? d.message as Record<string, unknown> : null;
      setData((cur) => {
        const current = cur.find((room) => room.id === roomId);
        const patch = rawRoom
          ? { ...rawRoom, id: rawRoom.id ?? roomId }
          : rawMessage
            ? { id: roomId, updated_at: rawMessage.created_at, last_message_at: rawMessage.created_at, last_message: rawMessage }
            : null;
        if (!patch) return cur;
        const next = current ? mergeSecureRoom(current, patch) : normSecureRoom(patch);
        if (!next.id) return cur;
        const senderId = rawMessage ? String(rawMessage.sender_user_id ?? rawMessage.sender_id ?? "") : "";
        const isMine = rawMessage ? senderId === (session?.id ?? "") || rawMessage.is_mine === true : false;
        const updated = rawRoom || isMine
          ? next
          : { ...next, unreadCount: Math.max(next.unreadCount, (current?.unreadCount ?? 0) + 1), hasUnread: true };
        return sortRooms([updated, ...cur.filter((room) => room.id !== roomId)]);
      });
    });
  }, [session?.id, setData]);

  const me = session?.id ?? "";
  const otherOf = (r: SecureRoom) => (r.clientUserId === me ? r.sellerUserId : r.clientUserId) || r.sellerUserId || r.clientUserId || r.lastMessage?.senderId || "";
  const nameOf = (r: SecureRoom) => dir.get(otherOf(r)) || r.lastMessage?.senderName || "";
  const previewOf = (r: SecureRoom) => {
    const message = r.lastMessage;
    if (!message) return "";
    const content = message.content || (message.messageType === "voice" ? ts("voiceNote") : message.messageType === "file" ? ts("fileGeneric") : "");
    return message.isMine ? t("minePrefix", { text: content }) : content;
  };
  const svcOf = (req: UrgentRequest) => (tk.has(`kinds.${req.serviceKind}`) ? tk(`kinds.${req.serviceKind}`) : req.serviceTitle || req.serviceKind);
  // The record travels in the query string, exactly as the call-centre board
  // sends it (?ua=&wid=&svc=) — that is what the chat reads to offer
  // "Chatni yakunlash" and to fill its header. The service goes in already
  // localised, because the chat has no catalogue to look the slug up in.
  const hrefOf = (r: SecureRoom) => {
    const req = ua.get(r.id);
    if (!req) return `/portal/chat/${r.id}`;
    const q = new URLSearchParams({ ua: req.id });
    if (req.workId) q.set("wid", req.workId);
    const svc = svcOf(req);
    if (svc) q.set("svc", svc);
    return `/portal/chat/${r.id}?${q.toString()}`;
  };

  const rows = useMemo(() => {
    // Newest room first — the list arrived in creation order, which put the
    // conversation the user is most likely to want at the very bottom.
    const sorted = sortRooms(res.data);
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    // The work id is searchable too: it is the number a client and an advocate
    // quote at each other ("LGT-20260926-77ADA6F5"), and until the join above
    // existed the inbox had no idea it belonged to a room.
    return sorted.filter((r) =>
      [nameOf(r), r.id, r.orderId, r.caseId, ua.get(r.id)?.workId, ua.get(r.id) ? svcOf(ua.get(r.id)!) : ""].some((v) =>
        (v || "").toLowerCase().includes(needle),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.data, q, dir, me, ua]);

  const unreadN = rows.reduce((sum, room) => sum + room.unreadCount, 0);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b className="ppanel__t"><span className="pico"><IconChat /></span>{t("title")}</b>
        <span className="ppanel__hact">
          {unreadN ? <em className="sinbox__newn">{t("newN", { n: unreadN })}</em> : null}
          <span className="advmuted">{rows.length}</span>
        </span>
      </div>

      <div className="sinbox__banner">
        <span className="sinbox__banner-i"><IconLock /></span>
        <span>{t("lead")}</span>
      </div>

      {res.data.length > 4 ? (
        <div className="svsel__bar sinbox__search">
          <span className="svsel__search">
            <IconSearch />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
          </span>
        </div>
      ) : null}

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : res.status === "error" ? (
        <EmptyState icon={<IconShieldCheck />} title={tc("loadError")} text={tc("loadErrorText")} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconShieldCheck />} title={t("empty")} text={t("emptyText")} />
      ) : !rows.length ? (
        <EmptyState icon={<IconSearch />} title={t("noMatch")} text={t("noMatchText")} />
      ) : (
        <div className="sinbox">
          {rows.map((r, i) => {
            const name = nameOf(r);
            const isNew = r.unreadCount > 0;
            const preview = previewOf(r);
            const lastAt = r.lastMessage?.createdAt || r.lastMessageAt || r.updatedAt;
            const req = ua.get(r.id);
            const group = req?.serviceKind === "second_opinion_group";
            return (
              <Link
                key={r.id}
                href={hrefOf(r)}
                className={`sinbox__item${isNew ? " sinbox__item--new" : ""}`}
                onClick={() => setData((cur) => cur.map((room) => (room.id === r.id ? { ...room, unreadCount: 0, hasUnread: false } : room)))}
              >
                <span className={`sinbox__av${group ? " sinbox__av--group" : ""}`}>
                  {group ? <IconUsers /> : name ? initials(name) : <IconShieldCheck />}
                </span>
                <div className="sinbox__m">
                  <b>{name || `${t("room")} #${i + 1}`}</b>
                  {preview ? <span className="sinbox__preview">{preview}</span> : null}
                  <span className="sinbox__sub">
                    <IconLock />
                    {t("secured")}
                    {lastAt ? <><IconClock />{dateTimeFull(lastAt, locale)}</> : null}
                  </span>
                  {/* Which work this room is. Without it a group panel and a
                      private conversation with the same advocate are two
                      identical rows. */}
                  {req ? (
                    <span className="sinbox__ua">
                      <em className="sinbox__uak"><IconBolt />{svcOf(req)}</em>
                      {req.workId ? <em className="sinbox__uaw" title={t("workId")}>{req.workId}</em> : null}
                    </span>
                  ) : null}
                </div>
                <div className="sinbox__right">
                  {isNew ? <span className="sinbox__unread" aria-label={t("unreadCount", { n: r.unreadCount })}>{r.unreadCount}</span> : null}
                  {r.status ? <span className={`sinbox__st sinbox__st--${r.status.toLowerCase()}`}>{statusLabel(tc, r.status)}</span> : null}
                  <span className="sinbox__go"><IconArrowRight /></span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
