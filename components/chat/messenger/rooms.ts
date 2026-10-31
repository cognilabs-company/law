"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  isLegacyReaction,
  listSecureChats,
  listAssignedUrgentRequests,
  listMyUrgentRequests,
  mergeSecureRoom,
  normSecureRoom,
  type SecureRoom,
  type UrgentRequest,
} from "@/lib/services/backend";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";

// One copy of the account's secure-chat rooms for every screen that shows
// them: the conversation list, the room header (peer name, status, order) and
// the compact chat inside a document request. Each of those used to call
// /secure-chats on its own — the room page did it once per open just to learn
// its own status. Here the list is read once per session, kept in order by
// the user socket (a new message moves its room to the top and counts it as
// unread unless that room is the one on screen), and re-read after the socket
// comes back from a drop, which is when events can have been missed.

export type RoomsState = {
  status: "idle" | "loading" | "ready" | "error";
  rooms: SecureRoom[];
  error: unknown;
  // roomId → the Tezkor Advokat record that room belongs to (see pickRecord).
  records: Map<string, UrgentRequest>;
};

const EMPTY: RoomsState = { status: "idle", rooms: [], error: undefined, records: new Map() };

let state: RoomsState = EMPTY;
let me = "";
let openRoom = "";
let seq = 0;
const subs = new Set<() => void>();
// Messages already counted towards a room's unread badge. The open room hears
// the same message twice — on its own socket and on the user socket — and a
// reconnect replays history; each message is counted once.
const counted = new Set<string>();
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
let offEvents: (() => void) | null = null;

function emit(next: Partial<RoomsState>) {
  state = { ...state, ...next };
  for (const f of subs) f();
}

export function roomStamp(room: SecureRoom): number {
  const v = Date.parse(room.lastMessage?.createdAt || room.lastMessageAt || room.updatedAt || room.createdAt || "");
  return Number.isFinite(v) ? v : 0;
}
export function sortRooms(rooms: SecureRoom[]): SecureRoom[] {
  return [...rooms].sort((a, b) => roomStamp(b) - roomStamp(a));
}

// R3/R32 (LEXGO_URGENT_GROUP_CHAT_FRONTEND L16, L260-262): completion is a
// request-level action, so a room that belongs to a Tezkor Advokat record has
// to be opened WITH that record. One room hosts several records (room
// f43fa109: fifteen); the live one wins over a finished one, then the newest.
function pickRecord(a: UrgentRequest | undefined, b: UrgentRequest): UrgentRequest {
  if (!a) return b;
  const done = (r: UrgentRequest) => (r.finalStatuses.length ? r.finalStatuses.includes(r.status) : r.status === "completed" || r.status === "cancelled");
  if (done(a) !== done(b)) return done(a) ? b : a;
  return Date.parse(b.createdAt || "") > Date.parse(a.createdAt || "") ? b : a;
}

async function load() {
  const mine = ++seq;
  emit({ status: state.status === "ready" ? "ready" : "loading", error: undefined });
  // Both record lists, because both sides of a room reach it from here: an
  // advocate's assigned panels and a client's own requests. Each answers []
  // for the other role. Best-effort: a room without its record still works.
  const recs = Promise.allSettled([listAssignedUrgentRequests(), listMyUrgentRequests()]).then((res) => {
    const m = new Map<string, UrgentRequest>();
    for (const r of res) {
      if (r.status !== "fulfilled") continue;
      for (const req of r.value) if (req.secureChatRoomId) m.set(req.secureChatRoomId, pickRecord(m.get(req.secureChatRoomId), req));
    }
    return m;
  });
  try {
    const rooms = await listSecureChats();
    if (mine !== seq) return;
    emit({ status: "ready", rooms: sortRooms(rooms) });
  } catch (e) {
    if (mine !== seq) return;
    // A failed refresh keeps the list it already had on screen.
    emit(state.rooms.length ? { status: "ready" } : { status: "error", error: e });
  }
  const records = await recs;
  if (mine === seq) emit({ records });
}

function scheduleReload(ms = 600) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void load(), ms);
}

type Raw = Record<string, unknown>;
const dict = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);

// A message that reached a room, from either socket. Moves the room to the
// top, refreshes its preview and — when it is someone else's and the room is
// not the one being read — counts it as unread.
export function noteRoomMessage(roomId: string, message: Raw, room?: Raw | null) {
  if (!roomId || state.status === "idle") return;
  // A legacy "reaction" record (no reaction API yet, §5.1) is not a message:
  // it neither moves the room nor counts as unread.
  if (!room && isLegacyReaction(String(message.message_type ?? ""))) return;
  const cur = state.rooms.find((r) => r.id === roomId);
  const patch = room
    ? { ...room, id: room.id ?? roomId }
    : { id: roomId, updated_at: message.created_at, last_message_at: message.created_at, last_message: message };
  const next = cur ? mergeSecureRoom(cur, patch) : normSecureRoom(patch);
  if (!next.id) return;
  const sender = String(message.sender_user_id ?? message.sender_id ?? "");
  const isMine = (!!me && sender === me) || message.is_mine === true;
  const id = String(message.id ?? "");
  let updated = next;
  if (roomId === openRoom) updated = { ...next, unreadCount: 0, hasUnread: false };
  else if (!room && !isMine && id && !counted.has(id)) {
    counted.add(id);
    updated = { ...next, unreadCount: (cur?.unreadCount ?? 0) + 1, hasUnread: true };
  }
  if (isMine && updated.lastMessage) updated = { ...updated, lastMessage: { ...updated.lastMessage, isMine: true } };
  emit({ rooms: sortRooms([updated, ...state.rooms.filter((r) => r.id !== roomId)]) });
  // A room this list has never seen has no participants yet: read the list
  // again shortly to learn who it is with.
  if (!cur) scheduleReload();
}

export function markRoomRead(roomId: string) {
  if (!state.rooms.some((r) => r.id === roomId && (r.unreadCount || r.hasUnread))) return;
  emit({ rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, unreadCount: 0, hasUnread: false } : r)) });
}

// The room on screen. Its messages are being read as they arrive, so they
// never count as unread; opening it clears what it had. The backend marks
// the room read itself when its history is fetched.
export function setOpenRoom(roomId: string) {
  openRoom = roomId;
  if (roomId) markRoomRead(roomId);
}

export function patchRoom(roomId: string, patch: Partial<SecureRoom>) {
  if (!state.rooms.some((r) => r.id === roomId)) return;
  emit({ rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) });
}

export function dropRoom(roomId: string) {
  emit({ rooms: state.rooms.filter((r) => r.id !== roomId) });
}

export function reloadRooms() {
  void load();
}

function start() {
  if (offEvents) return;
  const offEv = subscribeUserEvents((e) => {
    const d = e as Raw;
    const roomId = String(d.room_id ?? "");
    if (!roomId) return;
    if (e.event === "secure_chat.read") {
      // Read on another device, or by this one's own history fetch.
      if (!d.user_id || String(d.user_id) === me) markRoomRead(roomId);
      return;
    }
    if (e.event === "secure_chat.read_only") {
      // Closed by a refund, a final cancellation, a reassignment or the
      // operator (contract 2026-10-26 §15): history stays, input stops.
      patchRoom(roomId, { readOnly: true });
      return;
    }
    if (e.event !== "secure_chat.message_created") return;
    const msg = dict(d.message);
    const room = dict(d.room);
    if (msg || room) noteRoomMessage(roomId, msg ?? {}, room);
  });
  const offSync = onUserSocketResync(() => scheduleReload(0));
  offEvents = () => {
    offEv();
    offSync();
  };
}

function subscribe(f: () => void) {
  subs.add(f);
  start();
  return () => {
    subs.delete(f);
  };
}
const snap = () => state;
const serverSnap = () => EMPTY;

// The rooms of the signed-in account. `userId` empty (signed out, or auth
// still loading) reads nothing; a different account starts from scratch.
export function useRooms(userId: string): RoomsState {
  const s = useSyncExternalStore(subscribe, snap, serverSnap);
  useEffect(() => {
    if (!userId) return;
    if (userId !== me) {
      me = userId;
      counted.clear();
      seq++;
      state = EMPTY;
    }
    if (state.status === "idle") void load();
  }, [userId]);
  return userId && userId === me ? s : EMPTY;
}

export function useRoom(userId: string, roomId: string): { room: SecureRoom | null; record: UrgentRequest | null; status: RoomsState["status"] } {
  const s = useRooms(userId);
  return { room: s.rooms.find((r) => r.id === roomId) ?? null, record: s.records.get(roomId) ?? null, status: s.status };
}
