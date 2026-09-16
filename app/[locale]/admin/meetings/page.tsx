"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { searchUsers, createSecureChat, startCall, listInvitedCalls } from "@/lib/services/backend";
import SearchSelect from "@/components/SearchSelect";
import CallRoom from "@/components/chat/CallRoom";
import { Notice } from "@/components/admin/AdminBits";
import { IconVideo } from "@/components/icons";

type Active = { roomId: string; callId: string; lk: { url: string; room: string; token: string } | null };

export default function AdminMeetings() {
  const t = useTranslations("admin.meetings");
  const { session } = useAuth();
  const [title, setTitle] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<Active | null>(null);

  // Resume an active meeting after a reload (the call is only in memory).
  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("lexgo_active_call"); } catch { raw = null; }
    if (!raw) return;
    let stored: { roomId?: string; callId?: string } | null = null;
    try { stored = JSON.parse(raw); } catch { stored = null; }
    if (!stored?.roomId || !stored?.callId) return;
    let alive = true;
    listInvitedCalls()
      .then((list) => {
        if (!alive) return;
        const c = list.find((x) => x.callId === stored!.callId);
        if (c && c.callStatus === "active" && c.status !== "removed" && c.status !== "left") {
          setActive({ roomId: stored!.roomId!, callId: stored!.callId!, lk: null });
        } else {
          try { sessionStorage.removeItem("lexgo_active_call"); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Search ANY platform user to invite (name / phone / LexGo ID).
  async function searchOptions(q: string) {
    const users = await searchUsers(q);
    return users
      .filter((u) => u.id)
      .map((u) => ({ value: u.id, label: u.name || u.phone || "—", sub: [u.phone, u.lexgoId].filter(Boolean).join(" · ") || undefined }));
  }

  async function start() {
    if (busy) return;
    // Backend allows a meeting with any count (even host-only); require at least
    // one invitee so the room has a counterpart.
    if (picks.length < 1) {
      setErr(t("needParticipants"));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      // A meeting lives under a secure-chat room; call-center/admin can open one
      // without payment. The host is one side, the first invitee the other; all
      // picks are invited into the call.
      const room = await createSecureChat({
        client_user_id: session?.id || picks[0],
        seller_user_id: picks[0],
      });
      const call = await startCall(room.id, "video", title.trim() || t("title"), {
        participantUserIds: picks,
        maxDurationMinutes: 60,
      });
      setActive({
        roomId: room.id,
        callId: call.id,
        lk: call.livekitToken ? { url: call.livekitUrl, room: call.livekitRoom, token: call.livekitToken } : null,
      });
    } catch {
      setErr(t("error"));
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    return (
      <CallRoom
        roomId={active.roomId}
        callId={active.callId}
        callType="video"
        isCaller
        title={title.trim() || undefined}
        lk={active.lk}
        onEnd={() => {
          setActive(null);
          setPicks([]);
          setTitle("");
        }}
      />
    );
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("subtitle")}</p>

      <div className="cform" style={{ maxWidth: 560 }}>
        <div>
          <label>{t("titleLabel")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePh")} />
        </div>
        <div>
          <label>{t("participants")}</label>
          <SearchSelect
            value={picks}
            onChange={setPicks}
            onSearch={searchOptions}
            placeholder={t("participantsPh")}
            searchPlaceholder={t("participantsSearch")}
            emptyText={t("participantsEmpty")}
            ariaLabel={t("participants")}
          />
        </div>
        <p className="advmuted" style={{ fontSize: ".82rem", margin: 0 }}>{t("hint")}</p>
        {err ? <Notice ok={false} msg={err} /> : null}
        <button className="btn btn--pri" type="button" onClick={start} disabled={busy}>
          <IconVideo />
          {busy ? t("starting") : t("start")}
        </button>
      </div>
    </div>
  );
}
