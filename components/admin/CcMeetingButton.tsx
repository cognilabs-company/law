"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth, canMakeCalls } from "@/lib/auth";
import { createSecureChat, startCall, searchUsers } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import CallRoom from "@/components/chat/CallRoom";
import { IconVideo } from "@/components/icons";

export type CcMeetingButtonProps = {
  // The client (platform user id) to meet; they are invited and ring at once.
  // Leads often carry only a phone: pass it as `phone` and the user is looked
  // up (staff /users/search) on the first click.
  clientUserId?: string;
  phone?: string;
  // Shown in the button tooltip and used as the meeting title.
  clientName?: string;
  // Optional explicit meeting title (defaults to "Video meeting · <name>").
  title?: string;
  // Extra classes for the trigger (e.g. to fit a board card).
  className?: string;
  // Fires once the meeting is created (before the room opens).
  onStarted?: (ids: { roomId: string; callId: string }) => void;
};

type Active = { roomId: string; callId: string; lk: { url: string; room: string; token: string } | null };

// Opens a secure-chat room for the client (staff pay nothing) and starts a
// titled video meeting with them invited. Returns the ids for the caller.
export async function startClientMeeting(clientUserId: string, title: string): Promise<{ roomId: string; callId: string; lk: Active["lk"] }> {
  const room = await createSecureChat({ client_user_id: clientUserId });
  const call = await startCall(room.id, "video", title, { participantUserIds: [clientUserId], maxDurationMinutes: 60 });
  return {
    roomId: room.id,
    callId: call.id,
    lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken } : null,
  };
}

// Small camera button for call-center boards: one click starts a video
// meeting with this client and opens the room inline (fixed overlay).
// Hidden for accounts that cannot start calls (meetings.manage / call-center).
const digitsOf = (s: string) => s.replace(/\D/g, "");
// Resolve a lead's phone to a platform user id (exact digit match; last 9
// digits as a fallback for numbers stored without the country code).
export async function findUserByPhone(phone: string): Promise<string> {
  const d = digitsOf(phone);
  if (d.length < 7) return "";
  const users = await searchUsers(d.length > 9 ? "+" + d : d);
  const exact = users.find((u) => digitsOf(u.phone) === d);
  const tail = exact ?? users.find((u) => digitsOf(u.phone).endsWith(d.slice(-9)));
  return tail?.id ?? "";
}

export default function CcMeetingButton({ clientUserId, phone, clientName, title, className, onStarted }: CcMeetingButtonProps) {
  const t = useTranslations("admin.meetings");
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  if (!session || !canMakeCalls(session) || (!clientUserId && !phone) || clientUserId === session.id) return null;

  const name = clientName?.trim() || "";
  const meetTitle = title?.trim() || (name ? t("ccTitle", { name }) : t("ccStart"));

  async function start() {
    if (busy || active) return;
    setBusy(true);
    setErr(null);
    try {
      const uid = clientUserId || (await findUserByPhone(phone || ""));
      if (!uid) { setErr(t("ccNoUser")); return; }
      if (uid === session?.id) { setErr(t("ccSelf")); return; }
      const ids = await startClientMeeting(uid, meetTitle);
      onStarted?.({ roomId: ids.roomId, callId: ids.callId });
      setActive(ids);
    } catch (e) {
      const s = e instanceof ApiError ? e.status : 0;
      setErr(s === 402 || s === 403 ? t("noPermission") : s === 404 || s === 405 || s === 501 ? t("backendMissing") : t("ccError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`ccmeet${busy ? " busy" : ""}${className ? ` ${className}` : ""}`}
        onClick={start}
        disabled={busy}
        title={name ? t("ccStartWith", { name }) : t("ccStart")}
        aria-label={name ? t("ccStartWith", { name }) : t("ccStart")}
      >
        <IconVideo />
      </button>
      {err ? <span className="ccmeet__err" role="alert">{err}</span> : null}
      {active ? (
        <CallRoom
          roomId={active.roomId}
          callId={active.callId}
          callType="video"
          isCaller
          title={meetTitle}
          lk={active.lk}
          onEnd={() => setActive(null)}
        />
      ) : null}
    </>
  );
}
