"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getDocumentRequestChat,
  startDocumentRequestAudioCall,
  type CallUsage,
} from "@/lib/services/backend";
import { ApiError, logApiError } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import SecureChat from "@/components/chat/SecureChat";
import CallRoom from "@/components/chat/CallRoom";
import { Notice } from "@/components/admin/AdminBits";
import { IconChat, IconPhone, IconClock } from "@/components/icons";

// lexgo_frontend_doc_chat_update.md §3 + §6, and the client half of
// LEXGO_MEETING_EXTENSION_FRONTEND_UPDATE.md.
//
// The chat only exists once a call-center advocate has claimed the work —
// before that the backend answers `available: false` rather than 404, which
// is a real state to show ("nobody has taken it yet"), not an error. The
// same claim is what makes the audio call possible, and the client may ring
// their advocate three times per document request.
type Chat = { available: boolean; roomId: string };

export default function DocumentRequestChat({ requestId }: { requestId: string }) {
  const t = useTranslations("portal.client.documents");
  const [chat, setChat] = useState<Chat | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState(false);

  const [call, setCall] = useState<{ roomId: string; callId: string } | null>(null);
  const [callBusy, setCallBusy] = useState(false);
  const [callErr, setCallErr] = useState("");
  const [usage, setUsage] = useState<CallUsage | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    getDocumentRequestChat(requestId)
      .then((c) => {
        if (!alive) return;
        setChat({ available: c.available, roomId: c.roomId });
        setStatus("ready");
      })
      .catch((e) => {
        if (!alive) return;
        logApiError("document-request chat", e);
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [requestId, reloadKey]);

  // The chat appears the moment an advocate claims the request, so the page
  // must not need a reload to notice it.
  useEffect(() => {
    return subscribeUserEvents((e) => {
      if (e.event === "document_request.claimed" || e.event === "document_request.completed") setReloadKey((k) => k + 1);
    });
  }, []);

  async function ring() {
    if (callBusy || call) return;
    setCallBusy(true);
    setCallErr("");
    try {
      const c = await startDocumentRequestAudioCall(requestId);
      setUsage(c.clientCallUsage);
      setCall({ roomId: c.roomId, callId: c.id });
      // "Meeting sahifasida chat panel ham ko'rinsin" — the call floats over
      // the chat rather than replacing it, so a file can still be sent while
      // the advocate is asking for it.
      setOpen(true);
    } catch (e) {
      // 429 is the documented "you have used all three calls" answer; every
      // other failure is worth retrying, so they read differently.
      setCallErr(e instanceof ApiError && e.status === 429 ? t("callLimitReached") : t("callFailed"));
      if (!(e instanceof ApiError && e.status === 429)) logApiError("document-request audio call", e);
    } finally {
      setCallBusy(false);
    }
  }

  if (status === "loading") return null;
  if (status === "error") return <Notice ok={false} msg={t("chatLoadError")} />;

  // Nobody has taken the work yet — say so rather than offering a chat that
  // would open onto an empty room.
  if (!chat?.available || !chat.roomId)
    return (
      <p className="docchat__wait">
        <IconClock />
        {t("chatNotYet")}
      </p>
    );

  return (
    <>
      <div className="docchat">
        <div className="docchat__acts">
          <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen((v) => !v)}>
            <IconChat />
            {open ? t("chatHide") : t("chatOpen")}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={ring} disabled={callBusy || !!call}>
            <IconPhone />
            {callBusy ? t("processingShort") : t("callLawyer")}
          </button>
          {usage ? <small className="advmuted">{t("callsLeft", { n: usage.remaining })}</small> : null}
        </div>
        {callErr ? <Notice ok={false} msg={callErr} /> : null}
        {open ? (
          <div className="docchat__box">
            <SecureChat roomId={chat.roomId} onClose={() => setOpen(false)} />
          </div>
        ) : null}
      </div>

      {/* Outside the panel so closing the chat can never tear down a live
          call — CallRoom is a full overlay of its own. */}
      {call ? (
        <CallRoom
          roomId={call.roomId}
          callId={call.callId}
          callType="audio"
          isCaller
          title={t("callLawyer")}
          float
          onEnd={() => setCall(null)}
        />
      ) : null}
    </>
  );
}
