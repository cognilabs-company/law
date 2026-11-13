"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomEvent, type Participant, type Room, type TranscriptionSegment } from "livekit-client";
import { getToken } from "@/lib/client";
import { ApiError, backoffMs } from "@/lib/http";
import {
  createRtSession,
  decideRtSuggestion,
  rtSocketUrl,
  rtUpdateOf,
  sendRtTranscript,
  setRtSessionState,
  topSuggestions,
  type RtDecision,
  type RtGeneration,
  type RtSegment,
  type RtSession,
  type RtSpeaker,
  type RtSourceType,
  type RtSuggestion,
} from "@/lib/services/executive";

// The realtime call assistant (contract 2026-11-13 §9) for one call:
// a session, the backend's suggestion socket, and the transcript the call
// produces. Speech comes from LiveKit's transcription events (each segment
// keeps its id as the stable segment_key, so a growing segment replaces
// its text) and from what the operator types. Suggestions are asked for
// only on final segments and never while paused. An unavailable AI
// provider shows a small state and the call goes on.
export type RtState = "off" | "starting" | "active" | "paused" | "ended" | "denied" | "failed";
export type RtLine = { key: string; speaker: RtSpeaker; text: string; atMs: number; final: boolean };

export type RealtimeAssist = {
  state: RtState;
  session: RtSession | null;
  cards: RtSuggestion[];
  generation: RtGeneration | "";
  errorCode: string;
  lines: RtLine[];
  socket: "connecting" | "online" | "offline";
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  end: () => Promise<void>;
  say: (speaker: RtSpeaker, text: string) => Promise<void>;
  decide: (s: RtSuggestion, d: RtDecision) => Promise<boolean>;
  unseen: number;
  markSeen: () => void;
};

type Opts = {
  room: Room | null;
  callId: string;
  sourceType?: RtSourceType;
  // The user's own role on the call: an operator, or the duty lawyer.
  self: "operator" | "lawyer";
  entity?: { type: string; id: string };
  clientUserId?: string;
  enabled: boolean;
};

const MAX_LINES = 80;

export function useRealtimeAssist({ room, callId, sourceType = "livekit", self, entity, clientUserId, enabled }: Opts): RealtimeAssist {
  const [state, setState] = useState<RtState>("off");
  const [session, setSession] = useState<RtSession | null>(null);
  const [cards, setCards] = useState<RtSuggestion[]>([]);
  const [generation, setGeneration] = useState<RtGeneration | "">("");
  const [errorCode, setErrorCode] = useState("");
  const [lines, setLines] = useState<RtLine[]>([]);
  const [socket, setSocket] = useState<"connecting" | "online" | "offline">("offline");
  const [unseen, setUnseen] = useState(0);
  const entityType = entity?.type ?? "";
  const entityId = entity?.id ?? "";
  const t0 = useRef(0);
  const sessionRef = useRef<RtSession | null>(null);
  const stateRef = useRef<RtState>("off");
  const sentFinal = useRef(new Set<string>());
  useEffect(() => {
    stateRef.current = state;
    sessionRef.current = session;
  });

  const apply = useCallback((items: RtSuggestion[], gen: RtGeneration, code: string) => {
    if (gen) setGeneration(gen);
    setErrorCode(code || "");
    if (gen === "completed" && items.length) {
      setCards((cur) => {
        // Decided cards stay decided; new ones replace the set the backend chose.
        const next = topSuggestions(items).map((s) => cur.find((c) => c.id === s.id && c.status !== "new") ?? s);
        return next;
      });
      setUnseen((n) => n + 1);
    }
  }, []);

  const start = useCallback(async () => {
    if (!enabled || !callId || stateRef.current === "starting" || stateRef.current === "active" || stateRef.current === "paused") return;
    setState("starting");
    try {
      const s = await createRtSession({ callId, sourceType, clientUserId, entityType, entityId, language: "auto" });
      t0.current = Date.now();
      setSession(s);
      setState(s.status === "paused" ? "paused" : s.status === "ended" ? "ended" : "active");
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? "denied" : "failed");
    }
  }, [enabled, callId, sourceType, clientUserId, entityType, entityId]);

  const send = useCallback(
    async (seg: RtSegment) => {
      const s = sessionRef.current;
      const st = stateRef.current;
      if (!s || (st !== "active" && st !== "paused")) return;
      try {
        const u = await sendRtTranscript(s.id, seg, st === "active");
        apply(u.items, u.generation, u.errorCode);
        if (u.generation === "session_not_active") setState((cur) => (cur === "active" ? "paused" : cur));
      } catch (e) {
        // Ended elsewhere (409) — stop; anything else: the next segment tries again.
        if (e instanceof ApiError && e.status === 409) setState("ended");
      }
    },
    [apply],
  );

  // A line on screen, replaced while the same segment grows.
  const note = useCallback((line: RtLine) => {
    setLines((cur) => {
      const i = cur.findIndex((l) => l.key === line.key);
      const next = i >= 0 ? cur.map((l, j) => (j === i ? line : l)) : [...cur, line];
      return next.slice(-MAX_LINES);
    });
  }, []);

  // LiveKit transcription → transcript segments.
  useEffect(() => {
    if (!room || !enabled) return;
    const on = (segments: TranscriptionSegment[], participant?: Participant) => {
      const st = stateRef.current;
      if (st !== "active" && st !== "paused") return;
      const speaker: RtSpeaker = participant?.isLocal ? self : "client";
      const base = t0.current || Date.now();
      for (const seg of segments) {
        const text = seg.text.trim();
        if (!text) continue;
        const key = `lk-${seg.id}`;
        if (sentFinal.current.has(key)) continue;
        const startMs = seg.startTime > 0 ? seg.startTime : Math.max(0, (seg.firstReceivedTime || Date.now()) - base);
        const endMs = seg.endTime > 0 ? seg.endTime : Math.max(startMs, (seg.lastReceivedTime || Date.now()) - base);
        note({ key, speaker, text, atMs: startMs, final: seg.final });
        if (seg.final) sentFinal.current.add(key);
        void send({ key, speaker, text, startMs, endMs, final: seg.final, language: seg.language || "auto" });
      }
    };
    room.on(RoomEvent.TranscriptionReceived, on);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, on);
    };
  }, [room, enabled, self, send, note]);

  // The suggestion socket, reconnecting with backoff while the session lives.
  const sessionId = session?.id ?? "";
  const live = state === "active" || state === "paused";
  useEffect(() => {
    if (!sessionId || !live) return;
    let ws: WebSocket | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const open = () => {
      const token = getToken();
      if (!token || closed) return;
      setSocket("connecting");
      ws = new WebSocket(rtSocketUrl(sessionId, token));
      ws.onopen = () => {
        tries = 0;
        setSocket("online");
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
          if (msg.type !== "realtime_ai.suggestions") return;
          const u = rtUpdateOf(msg);
          if (u.sessionId && u.sessionId !== sessionId) return;
          apply(u.items, u.generation, u.errorCode);
        } catch {
          /* not JSON */
        }
      };
      ws.onclose = () => {
        setSocket("offline");
        if (closed) return;
        timer = setTimeout(open, backoffMs(tries++));
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
      setSocket("offline");
    };
  }, [sessionId, live, apply]);

  const setRemote = useCallback(async (action: "pause" | "resume" | "end") => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      const next = await setRtSessionState(s.id, action);
      if (next.id) setSession(next);
      setState(action === "pause" ? "paused" : action === "resume" ? "active" : "ended");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setState("ended");
    }
  }, []);

  // The call ends → the session ends (best effort; the backend also closes it).
  useEffect(
    () => () => {
      const s = sessionRef.current;
      const st = stateRef.current;
      if (s && (st === "active" || st === "paused")) void setRtSessionState(s.id, "end").catch(() => undefined);
    },
    [],
  );

  const say = useCallback(
    async (speaker: RtSpeaker, text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const at = Math.max(0, Date.now() - (t0.current || Date.now()));
      const key = `typed-${Date.now().toString(36)}`;
      note({ key, speaker, text: clean, atMs: at, final: true });
      await send({ key, speaker, text: clean, startMs: at, endMs: at, final: true });
    },
    [note, send],
  );

  const decide = useCallback(async (s: RtSuggestion, d: RtDecision) => {
    try {
      const out = await decideRtSuggestion(s.id, d);
      setCards((cur) =>
        d.action === "dismissed"
          ? cur.filter((c) => c.id !== s.id)
          : cur.map((c) => (c.id === s.id ? { ...c, ...(out.id ? out : {}), status: d.action, editedText: d.action === "edited" ? d.editedText : c.editedText } : c)),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    state: enabled ? state : "off",
    session,
    cards,
    generation,
    errorCode,
    lines,
    socket,
    start,
    pause: () => setRemote("pause"),
    resume: () => setRemote("resume"),
    end: () => setRemote("end"),
    say,
    decide,
    unseen,
    markSeen: () => setUnseen(0),
  };
}
