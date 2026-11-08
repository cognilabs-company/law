"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { errDetail, isForbidden, logApiError } from "@/lib/http";
import { canMakeCalls, useAuth } from "@/lib/auth";
import { startCall } from "@/lib/services/backend";
import type { ReviewCallKind, ReviewRoom } from "@/lib/services/experience";
import { staffChatHref } from "@/components/admin/callcenter/cancellations/model";
import { Note } from "../../panel/bits";
import { IcMeeting, IcPhone, IcSupport } from "../../icons";

type RoomProps = {
  room: ReviewRoom | null;
  title: string;
  sellerId: string;
  pending: boolean;
  scope: string;
  open: () => Promise<ReviewRoom>;
  close: (room: ReviewRoom) => Promise<ReviewRoom>;
  onRoom: (room: ReviewRoom) => void;
};

export default function VerifyRoom({ room, title, sellerId, pending, scope, open, close, onRoom }: RoomProps) {
  const t = useTranslations("callCenter.verify");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState<ReviewCallKind | "">("");
  const [err, setErr] = useState("");
  // Starting calls follows meetings.manage (canMakeCalls); a 403 on the room
  // or a call takes those buttons away instead of offering them again.
  const hostCalls = canMakeCalls(useAuth().session);
  const [denied, setDenied] = useState<{ room?: boolean; call?: boolean }>({});
  const state = !room ? "none" : room.readOnly ? "closed" : "open";
  const href = room ? staffChatHref(room.roomId, "", title) : "";
  const showGo = Boolean(room && href);
  const showCalls = Boolean(room && !room.readOnly && room.callTypes.length) && hostCalls && !denied.call;
  // A room opens only while the record still waits for review.
  const showStart = !denied.room && !room && pending;
  const showClose = !denied.room && Boolean(room && !room.readOnly);

  async function act(closing: boolean) {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      onRoom(closing && room ? await close(room) : await open());
    } catch (e) {
      logApiError(`${scope}.room`, e);
      if (isForbidden(e)) setDenied((d) => ({ ...d, room: true }));
      setErr(errDetail(e) || t("roomFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function call(kind: ReviewCallKind) {
    if (!room || room.readOnly || calling) return;
    setCalling(kind);
    setErr("");
    try {
      const c = await startCall(room.roomId, kind, title || "LexGo", sellerId ? { participantUserIds: [sellerId] } : undefined);
      const to = staffChatHref(room.roomId, "", title);
      router.push(`${to}${to.includes("?") ? "&" : "?"}join=${encodeURIComponent(c.id)}`);
    } catch (e) {
      logApiError(`${scope}.call`, e);
      if (isForbidden(e)) setDenied((d) => ({ ...d, call: true }));
      setErr(errDetail(e) || t("room.callFailed"));
      setCalling("");
    }
  }

  return (
    <section className="opx-vrf-room" data-state={state} aria-label={t("room.none")}>
      <div className="opx-vrf-room__top">
        <span className="opx-vrf-room__ic" aria-hidden="true">
          <IcSupport size={20} />
        </span>
        <div className="opx-vrf-room__txt">
          <b>{state === "none" ? t("room.none") : state === "closed" ? t("room.closed") : t("room.open")}</b>
          <small>{state === "none" ? t("room.noneText") : state === "closed" ? t("room.closedText") : t("room.openText")}</small>
        </div>
      </div>
      {showGo || showCalls || showStart || showClose ? (
        <div className="opx-vrf-room__acts">
          {room && showGo ? (
            <Link className={`opx-pbtn opx-vrf-sm${room.readOnly ? "" : " opx-pbtn--blue"}`} href={href}>
              {room.readOnly ? t("room.history") : t("room.go")}
            </Link>
          ) : null}
          {room && showCalls
            ? room.callTypes.map((k) => (
                <button key={k} type="button" className="opx-pbtn opx-pbtn--call opx-vrf-sm" disabled={!!calling} aria-busy={calling === k} onClick={() => void call(k)}>
                  {k === "video" ? <IcMeeting size={15} /> : <IcPhone size={15} />}
                  {t(`room.call.${k}`)}
                </button>
              ))
            : null}
          {showStart ? (
            <button type="button" className="opx-pbtn opx-pbtn--call opx-vrf-sm" disabled={busy} aria-busy={busy} onClick={() => void act(false)}>
              <IcSupport size={15} />
              {t("room.start")}
            </button>
          ) : null}
          {showClose ? (
            <button type="button" className="opx-pbtn opx-pbtn--ghost opx-vrf-sm" disabled={busy} aria-busy={busy} onClick={() => void act(true)}>
              {t("room.close")}
            </button>
          ) : null}
        </div>
      ) : null}
      {err ? <Note tone="bad">{err}</Note> : null}
    </section>
  );
}
