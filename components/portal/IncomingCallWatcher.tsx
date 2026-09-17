"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { listInvitedCalls, listLawyers } from "@/lib/services/backend";
import { connectUserSocket, disconnectUserSocket, subscribeUserEvents, userSocketState, subscribeUserSocketState, type UserEvent } from "@/lib/userSocket";
import { playRingtone } from "@/lib/callSounds";
import CallRoom from "@/components/chat/CallRoom";
import { IconPhone, IconVideo, IconClose } from "@/components/icons";

type Incoming = { kind: "chat" | "meet"; roomId: string; callId: string; callType: "audio" | "video"; callerName: string; resume?: boolean };

let nameCache: Map<string, string> | null = null;
async function nameOf(userId: string): Promise<string> {
  if (!nameCache) {
    try {
      const ls = await listLawyers();
      nameCache = new Map(ls.map((l) => [l.userId, l.name]));
    } catch {
      nameCache = new Map();
    }
  }
  return nameCache.get(userId) || "";
}
// Fallback poll of /calls/invited only while the user socket is down (and on
// mount / tab focus) — the socket's `call.incoming` is the primary signal.
const FALLBACK_MS = 45_000;

// Rings for incoming calls anywhere in the portal:
//  • `call.incoming` on the global user socket (/ws/users/me) — 1:1 calls in
//    the user's secure-chat rooms (accept → open the chat) and meeting invites
//    (accept → join the LiveKit room inline; the token is fetched on join).
export default function IncomingCallWatcher() {
  const t = useTranslations("call");
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [pendingInc, setInc] = useState<Incoming | null>(null);
  const inc = session ? pendingInc : null; // never ring without a session
  const [meet, setMeet] = useState<Incoming | null>(null); // an accepted meeting rendered inline
  const dismissed = useRef<Set<string>>(new Set());
  const onChatPage = pathname.includes("/portal/chat/");
  const onChatPageRef = useRef(onChatPage);
  useEffect(() => { onChatPageRef.current = onChatPage; }, [onChatPage]);
  const inMeetRef = useRef(!!meet);
  useEffect(() => { inMeetRef.current = !!meet; }, [meet]);

  // Global user socket: opened once per session token, closed on logout.
  const token = session?.token ?? "";
  useEffect(() => {
    if (!token) { disconnectUserSocket(); return; }
    connectUserSocket(token);
    return () => { /* kept open across navigation; closed when the token goes */ };
  }, [token]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    const me = session.id;
    async function onEvent(e: UserEvent) {
      if (e.event !== "call.incoming" || inMeetRef.current) return;
      const call = (e.call && typeof e.call === "object" ? e.call : {}) as Record<string, unknown>;
      const roomId = String(e.room_id ?? call.room_id ?? "");
      const callId = String(e.call_id ?? call.id ?? "");
      const caller = String(e.caller_user_id ?? "");
      if (!roomId || !callId || caller === me || dismissed.current.has(callId)) return;
      if (String(call.status || "active") !== "active") return;
      // A meeting (title / invited participant) opens inline; a room call opens the chat.
      const parts = Array.isArray(call.participants) ? (call.participants as Record<string, unknown>[]) : [];
      // My own call (host / already joined) must never ring me, even if the event has no caller id.
      if (parts.some((p) => String(p.user_id ?? p.id) === me && ["host", "joined", "left", "declined", "removed"].includes(String(p.status)))) return;
      const isMeet = !!call.title || parts.some((p) => String(p.user_id ?? p.id) === me && String(p.status) === "invited");
      // Inside that very chat the chat's own card handles it.
      if (!isMeet && onChatPageRef.current) return;
      const name = String(e.caller_name ?? call.caller_name ?? "") || (await nameOf(caller)) || t("someone");
      if (!alive) return;
      setInc({ kind: isMeet ? "meet" : "chat", roomId, callId, callType: String(call.call_type) === "audio" ? "audio" : "video", callerName: name });
    }
    const unsub = subscribeUserEvents((e) => { void onEvent(e); });

    // Fallback: pending meeting invites via REST on mount, on focus, and while the socket is down.
    async function pollInvites() {
      if (document.visibilityState === "hidden" || inMeetRef.current) return;
      try {
        const invited = await listInvitedCalls();
        const inv = invited.find((c) => c.callStatus === "active" && c.status === "invited" && !dismissed.current.has(c.callId));
        if (!alive) return;
        if (inv) setInc({ kind: "meet", roomId: inv.roomId, callId: inv.callId, callType: inv.callType, callerName: inv.callerName || t("someone") });
      } catch { /* ignore */ }
    }
    void pollInvites();
    const iv = setInterval(() => { if (userSocketState() !== "online") void pollInvites(); }, FALLBACK_MS);
    const onVis = () => { if (document.visibilityState === "visible") void pollInvites(); };
    document.addEventListener("visibilitychange", onVis);
    const unsubState = subscribeUserSocketState((s) => { if (s === "online") void pollInvites(); });
    return () => {
      alive = false;
      unsub();
      unsubState();
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session, t]);

  // Ring while an incoming call is pending.
  useEffect(() => {
    if (!inc) return;
    const stop = playRingtone();
    return stop;
  }, [inc]);

  // Resume an active meeting after a page reload (the call is in memory only).
  useEffect(() => {
    if (!session || meet) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("lexgo_active_call"); } catch { raw = null; }
    if (!raw) return;
    let stored: { roomId?: string; callId?: string; callType?: string } | null = null;
    try { stored = JSON.parse(raw); } catch { stored = null; }
    if (!stored?.roomId || !stored?.callId) return;
    let alive = true;
    listInvitedCalls()
      .then((list) => {
        if (!alive) return;
        const c = list.find((x) => x.callId === stored!.callId);
        if (c && c.callStatus === "active" && c.status !== "removed" && c.status !== "left" && c.status !== "declined") {
          // Offer to rejoin (ring card) — never open a meeting by itself.
          setInc({ kind: "meet", roomId: stored!.roomId!, callId: stored!.callId!, callType: stored!.callType === "audio" ? "audio" : "video", callerName: c.callerName || t("someone"), resume: true });
        } else {
          try { sessionStorage.removeItem("lexgo_active_call"); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [session, meet, t]);

  // An accepted meeting is rendered inline (invitee isn't a chat-room member).
  if (meet) {
    return (
      <CallRoom
        roomId={meet.roomId}
        callId={meet.callId}
        callType={meet.callType}
        isCaller={false}
        onEnd={() => {
          dismissed.current.add(meet.callId);
          setMeet(null);
        }}
      />
    );
  }

  if (!inc) return null;

  function accept() {
    if (!inc) return;
    dismissed.current.add(inc.callId);
    const target = inc;
    setInc(null);
    if (target.kind === "meet") {
      setMeet(target); // render CallRoom inline; it fetches the join token itself
    } else {
      router.push(`/portal/chat/${target.roomId}?join=${target.callId}`);
    }
  }
  function decline() {
    if (!inc) return;
    dismissed.current.add(inc.callId);
    if (inc.resume) { try { sessionStorage.removeItem("lexgo_active_call"); } catch { /* ignore */ } }
    setInc(null);
  }

  return (
    <div className="incall">
      <div className="incall__card">
        <span className="incall__av">
          {inc.callType === "video" ? <IconVideo /> : <IconPhone />}
        </span>
        <div className="incall__m">
          <b>{inc.callerName}</b>
          <span>{inc.resume ? t("resumeMeet") : inc.kind === "meet" ? t("incomingMeet") : inc.callType === "video" ? t("incomingVideo") : t("incomingAudio")}</span>
        </div>
        <div className="incall__act">
          <button className="incall__btn incall__btn--decline" type="button" onClick={decline} aria-label={t("decline")}>
            <IconClose />
          </button>
          <button className="incall__btn incall__btn--accept" type="button" onClick={accept} aria-label={t("accept")}>
            <IconPhone />
          </button>
        </div>
      </div>
    </div>
  );
}
