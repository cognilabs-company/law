"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/client";
import { backoffMs, isConflict, refreshAccessToken } from "@/lib/http";
import { emitRoomCallEvent, isCallEvent, subscribeRoomCallEvents } from "@/lib/callEvents";
import { playRingtone, primeCallAudio } from "@/lib/callSounds";
import { VoiceRecorder } from "@/lib/voiceRecorder";
import { completeUrgentChat, deleteSecureChat, getSecureMessages, listCalls, normSecureMsgCore, normSecureMsgFile, secureSocketUrl, sendSecureMessage, setChatAutoDelete, startCall, uploadSecureMessage, type CallSession, type LiveKitJoin, type SecureMessage } from "@/lib/services/backend";
import { secureUploadRefusal, type SecureUploadProblem } from "@/lib/secureUpload";

// One secure chat room for the desktop's Messages app: the history, the
// room's socket (reconnecting with a back-off, re-reading the history after
// a drop, refreshing the session once on 401), sending with an optimistic
// bubble the echo replaces, files and voice notes, replies, and the calls —
// starting one, an incoming one ringing, joining. The same endpoints and
// rules as the cabinet's chat page (components/chat/SecureChat.tsx).

export type ChatMsg = SecureMessage & { pending?: boolean; failed?: boolean };
export type Conn = "connecting" | "online" | "offline";
export type ActiveCall = { callId: string; callType: "audio" | "video"; isCaller: boolean; lk?: LiveKitJoin | null };
export type ChatError = "send" | "attach" | "call" | "session" | "forbidden" | "settings" | "delete" | "complete" | "mic";

const INCOMING_MAX_MS = 2 * 60 * 1000;
const TERMINAL = new Set(["ended", "cancelled", "expired", "completed"]);
const fresh = (c: CallSession, me: string) => {
  const st = c.status.trim().toLowerCase();
  if (!c.id || c.callerUserId === me || !["active", "ringing"].includes(st) || c.endedAt) return false;
  const at = Date.parse(c.startedAt);
  if (!Number.isFinite(at)) return false;
  const age = Date.now() - at;
  return age >= -30_000 && age <= INCOMING_MAX_MS;
};

export function useChat(roomId: string, opts: { joinCallId?: string; onError: (e: ChatError, detail?: string, upload?: SecureUploadProblem | null) => void; callTitle: (kind: "audio" | "video") => string }) {
  const { session } = useAuth();
  const me = session?.id ?? "";
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [conn, setConn] = useState<Conn>("connecting");
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<{ on: boolean; sec: number }>({ on: false, sec: 0 });
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<{ callId: string; callType: "audio" | "video" } | null>(null);
  const [reload, setReload] = useState(0);
  const seen = useRef(new Set<string>());
  const ws = useRef<WebSocket | null>(null);
  const recorder = useRef<VoiceRecorder | null>(null);
  const dismissed = useRef(new Set<string>());
  const activeRef = useRef(active);
  const errRef = useRef(opts.onError);
  useEffect(() => {
    activeRef.current = active;
    errRef.current = opts.onError;
  });

  const push = useCallback((list: ChatMsg[]) => {
    // Reactions are folded into chips by the full chat; here they are left
    // out rather than drawn as a lone emoji bubble.
    const add = list.filter((m) => !m.reaction && (!m.id || !seen.current.has(m.id)));
    if (!add.length) return;
    for (const m of add) if (m.id) seen.current.add(m.id);
    setMsgs((prev) => [...prev, ...add]);
  }, []);

  // History and the room's socket.
  useEffect(() => {
    let alive = true;
    let sock: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    let refreshing = false;
    const h0 = setTimeout(() => {
      seen.current = new Set();
      setMsgs([]);
      setStatus("loading");
      setFinished(false);
    }, 0);
    const history = () =>
      getSecureMessages(roomId)
        .then((m) => {
          if (!alive) return;
          push(m);
          setStatus("ready");
        })
        .catch(() => alive && setStatus((s) => (s === "ready" ? s : "error")));
    const failPending = () => setMsgs((prev) => prev.map((x) => (x.pending ? { ...x, pending: false, failed: true } : x)));
    const again = () => {
      if (!alive) return;
      retry = Math.min(retry + 1, 10);
      clearTimeout(timer);
      timer = setTimeout(connect, backoffMs(retry));
    };
    async function expired() {
      if (refreshing) return;
      refreshing = true;
      const ok = await refreshAccessToken().catch(() => null);
      refreshing = false;
      if (!alive) return;
      if (!ok) {
        failPending();
        errRef.current("session");
        return;
      }
      if (sock) {
        sock.onclose = null;
        try {
          sock.close();
        } catch {
          /* replaced below */
        }
      }
      retry = 0;
      connect();
    }
    function connect() {
      if (!alive) return;
      setConn("connecting");
      try {
        sock = new WebSocket(secureSocketUrl(roomId, getToken()));
        ws.current = sock;
      } catch {
        return again();
      }
      const mine = sock;
      sock.onopen = () => {
        if (!alive) return;
        retry = 0;
        setConn("online");
        if (!first) void history();
        first = false;
      };
      sock.onmessage = (e) => {
        let o: Record<string, unknown>;
        try {
          o = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (isCallEvent(String(o.event ?? ""))) return emitRoomCallEvent(roomId, o as { event: string });
        if (o.event === "error") {
          const code = Number(o.status_code) || 0;
          if (code === 401) return void expired();
          failPending();
          if (code === 409) setFinished(true);
          else errRef.current(code === 403 ? "forbidden" : "send", typeof o.detail === "string" ? o.detail : undefined);
          return;
        }
        const raw = (o.message ?? o) as Record<string, unknown>;
        const m: ChatMsg = { ...normSecureMsgCore(raw), ...normSecureMsgFile(raw) };
        if (!m.id || m.reaction) return;
        if (m.senderId === me) {
          setBusy(false);
          setMsgs((prev) => {
            if (seen.current.has(m.id)) return prev;
            seen.current.add(m.id);
            const i = prev.findIndex((x) => x.pending && (x.messageType || "text") === (m.messageType || "text"));
            if (i < 0) return [...prev, m];
            const next = [...prev];
            next[i] = m;
            return next;
          });
        } else push([m]);
      };
      sock.onclose = () => {
        if (!alive || ws.current !== mine) return;
        setConn("offline");
        again();
      };
      sock.onerror = () => {
        try {
          sock?.close();
        } catch {
          /* onclose reconnects */
        }
      };
    }
    const online = () => {
      if (!alive || sock?.readyState === WebSocket.OPEN) return;
      retry = 0;
      clearTimeout(timer);
      connect();
    };
    const offline = () => alive && setConn("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    void history();
    connect();
    return () => {
      alive = false;
      clearTimeout(h0);
      clearTimeout(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      if (sock) {
        sock.onclose = null;
        try {
          sock.close();
        } catch {
          /* gone */
        }
      }
    };
  }, [roomId, reload, me, push]);

  // An incoming call: on connect, and from the room's call events.
  useEffect(() => {
    if (!me) return;
    let alive = true;
    if (conn === "online")
      listCalls(roomId)
        .then((calls) => {
          const live = calls.filter((c) => fresh(c, me) && !dismissed.current.has(c.id)).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
          if (alive) setIncoming(live && !activeRef.current ? { callId: live.id, callType: live.callType === "video" ? "video" : "audio" } : null);
        })
        .catch(() => undefined);
    const off = subscribeRoomCallEvents(roomId, (e) => {
      const call = (e.call && typeof e.call === "object" ? e.call : {}) as Record<string, unknown>;
      const id = String(e.call_id ?? call.id ?? "");
      const st = String(e.status ?? call.status ?? "").trim().toLowerCase();
      if (e.event === "call.ended" || TERMINAL.has(st)) return setIncoming((c) => (c && c.callId === id ? null : c));
      if (e.event !== "call.created" || !id || dismissed.current.has(id) || activeRef.current) return;
      const caller = String(e.caller_user_id ?? call.caller_user_id ?? "");
      if (caller === me) return;
      setTimeout(() => !activeRef.current && !dismissed.current.has(id) && setIncoming({ callId: id, callType: String(call.call_type) === "audio" ? "audio" : "video" }), caller ? 0 : 800);
    });
    return () => {
      alive = false;
      off();
    };
  }, [roomId, me, conn]);
  useEffect(() => {
    if (!incoming || active) return;
    return playRingtone();
  }, [incoming, active]);
  // A link that says which call to join (?join=…).
  useEffect(() => {
    const id = opts.joinCallId;
    if (!id) return;
    let alive = true;
    listCalls(roomId)
      .then((calls) => {
        const c = calls.find((x) => x.id === id);
        if (alive && c && (c.status === "active" || c.status === "ringing")) setActive({ callId: c.id, callType: c.callType === "video" ? "video" : "audio", isCaller: false });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [roomId, opts.joinCallId]);
  // The voice note's running time.
  useEffect(() => {
    if (!rec.on) return;
    const h = setInterval(() => setRec((r) => ({ ...r, sec: r.sec + 1 })), 1000);
    return () => clearInterval(h);
  }, [rec.on]);
  useEffect(() => () => recorder.current?.cancel(), []);

  const optimistic = (p: Partial<ChatMsg>): ChatMsg => ({ id: `tmp-${Date.now()}`, senderId: me, sender: null, replyToId: "", replyTo: null, reaction: null, filteredContent: "", isBlocked: false, createdAt: new Date().toISOString(), messageType: "text", file: null, pending: true, ...p });
  const quote = (m: ChatMsg | null) => (m ? { id: m.id, sender: m.sender, messageType: m.messageType, content: m.filteredContent, isBlocked: m.isBlocked } : null);

  async function send(text: string, reply: ChatMsg | null) {
    const content = text.trim();
    if (!content || finished) return;
    const tmp = optimistic({ filteredContent: content, replyToId: reply?.id ?? "", replyTo: quote(reply) });
    setMsgs((p) => [...p, tmp]);
    setBusy(true);
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) {
      try {
        s.send(JSON.stringify({ content, message_type: "text", meta: reply?.id ? { reply_to_message_id: reply.id } : {} }));
        return;
      } catch {
        /* falls back to HTTP */
      }
    }
    try {
      const m = await sendSecureMessage(roomId, content, reply?.id ?? "");
      if (m.id) seen.current.add(m.id);
      setMsgs((p) => p.map((x) => (x.id === tmp.id ? m : x)));
    } catch (e) {
      setMsgs((p) => p.map((x) => (x.id === tmp.id ? { ...x, pending: false, failed: true } : x)));
      if (isConflict(e)) setFinished(true);
      else errRef.current("send");
    } finally {
      setBusy(false);
    }
  }
  async function attach(file: File | Blob, kind: "file" | "voice", name: string, reply: ChatMsg | null) {
    if (finished) return;
    const tmp = optimistic({ messageType: kind, replyToId: reply?.id ?? "", replyTo: quote(reply), file: { fileName: name, mimeType: file.type, size: file.size, downloadUrl: "", inlineUrl: "", preview: null } });
    setMsgs((p) => [...p, tmp]);
    try {
      const m = await uploadSecureMessage(roomId, { file, messageType: kind, fileName: name, replyToId: reply?.id });
      if (m.id) seen.current.add(m.id);
      setMsgs((p) => p.map((x) => (x.id === tmp.id ? m : x)));
    } catch (e) {
      setMsgs((p) => p.map((x) => (x.id === tmp.id ? { ...x, pending: false, failed: true } : x)));
      if (isConflict(e)) setFinished(true);
      else errRef.current("attach", undefined, secureUploadRefusal(e, name));
    }
  }
  async function voice(reply: ChatMsg | null) {
    const r = recorder.current;
    if (r?.active) {
      setRec({ on: false, sec: 0 });
      const note = await r.stop();
      recorder.current = null;
      if (note) void attach(note.blob, "voice", `voice-${Date.now()}.${note.mime.includes("mp4") || note.mime.includes("aac") ? "m4a" : note.mime.includes("ogg") ? "ogg" : "webm"}`, reply);
      return;
    }
    if (finished) return;
    const next = new VoiceRecorder();
    recorder.current = next;
    try {
      await next.start();
    } catch {
      recorder.current = null;
      return errRef.current("mic");
    }
    if (next.active) setRec({ on: true, sec: 0 });
  }
  const cancelVoice = () => {
    recorder.current?.cancel();
    recorder.current = null;
    setRec({ on: false, sec: 0 });
  };
  async function call(kind: "audio" | "video") {
    primeCallAudio();
    if (active) return;
    try {
      const calls = await listCalls(roomId);
      const live = calls.find((c) => c.status === "active" || c.status === "ringing");
      if (live) setActive({ callId: live.id, callType: live.callType === "video" ? "video" : "audio", isCaller: false });
      else {
        const c = await startCall(roomId, kind, opts.callTitle(kind));
        setActive({ callId: c.id, callType: kind, isCaller: true, lk: c.livekitToken ? { url: c.livekitUrl, room: c.livekitRoom, token: c.livekitToken, hints: c.hints, quality: c.quality } : null });
      }
      setIncoming(null);
    } catch {
      errRef.current("call");
    }
  }
  const join = () => {
    primeCallAudio();
    if (!incoming) return;
    setActive({ callId: incoming.callId, callType: incoming.callType, isCaller: false });
    setIncoming(null);
  };
  const dismiss = () => {
    if (incoming) dismissed.current.add(incoming.callId);
    setIncoming(null);
  };
  const ttl = (hours: number) =>
    setChatAutoDelete(roomId, hours).then(
      () => true,
      () => (errRef.current("settings"), false),
    );
  const remove = () =>
    deleteSecureChat(roomId).then(
      () => true,
      () => (errRef.current("delete"), false),
    );
  const complete = (recordId: string, summary: string) =>
    completeUrgentChat(recordId, summary.trim()).then(
      () => (setFinished(true), true),
      (e) => (isConflict(e) ? (setFinished(true), true) : (errRef.current("complete"), false)),
    );
  return { msgs, status, conn, finished, setFinished, busy, rec, active, setActive, incoming, send, attach, voice, cancelVoice, call, join, dismiss, ttl, remove, complete, retry: () => setReload((n) => n + 1) };
}
