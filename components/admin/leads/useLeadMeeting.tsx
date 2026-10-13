"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { canMakeCalls, useAuth } from "@/lib/auth";
import { leadUserId, type LeadX } from "@/lib/services/leads";
import type { LiveKitJoin } from "@/lib/services/backend";
import { notify } from "@/lib/toast";
import Modal from "@/components/admin/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import CallRoom from "@/components/chat/CallRoom";
import { findUserByPhone, startClientMeeting } from "@/components/admin/CcMeetingButton";

type AskState = "check" | "ready" | "missing" | "self" | "error";
type Ask = { lead: LeadX; uid: string; state: AskState; error?: unknown; seq: number };
type Active = { roomId: string; callId: string; lk: LiveKitJoin | null; title: string };

export type LeadMeeting = {
  can: (lead: LeadX) => boolean;
  start: (lead: LeadX) => void;
  busyId: string;
  node: ReactNode;
};

export function useLeadMeeting(): LeadMeeting {
  const t = useTranslations("admin.meetings");
  const tl = useTranslations("admin.leadCard");
  const tc = useTranslations("common.confirm");
  const tn = useTranslations("common.notify");
  const { session } = useAuth();
  const meId = session?.id ?? "";
  const [ask, setAsk] = useState<Ask | null>(null);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const seqRef = useRef(0);

  const can = (lead: LeadX) => {
    if (!session || !canMakeCalls(session)) return false;
    const uid = leadUserId(lead);
    return (!!uid || !!lead.phone) && uid !== meId;
  };

  const lookup = (lead: LeadX, seq: number) => {
    void findUserByPhone(lead.phone || "").then(
      (found) => setAsk((cur) => (cur && cur.seq === seq ? { ...cur, uid: found, state: !found ? "missing" : found === meId ? "self" : "ready" } : cur)),
      (e: unknown) => setAsk((cur) => (cur && cur.seq === seq ? { ...cur, state: "error", error: e } : cur)),
    );
  };

  const start = (lead: LeadX) => {
    if (ask || active || !can(lead)) return;
    const seq = (seqRef.current += 1);
    const uid = leadUserId(lead);
    if (uid) {
      setAsk({ lead, uid, state: uid === meId ? "self" : "ready", seq });
      return;
    }
    setAsk({ lead, uid: "", state: "check", seq });
    lookup(lead, seq);
  };

  const retry = () => {
    if (!ask) return;
    const seq = (seqRef.current += 1);
    setAsk({ ...ask, state: "check", error: undefined, seq });
    lookup(ask.lead, seq);
  };

  const close = () => {
    if (!saving) setAsk(null);
  };

  async function confirm() {
    if (!ask || ask.state !== "ready" || saving) return;
    const name = ask.lead.name.trim();
    const title = name ? t("ccTitle", { name }) : t("ccStart");
    setSaving(true);
    try {
      const ids = await startClientMeeting(ask.uid, title);
      setAsk(null);
      setActive({ ...ids, title });
    } catch (e) {
      const denied = t("noPermission");
      const missing = t("backendMissing");
      notify.error(t("ccFailed"), { id: "cc-meet", error: e, map: { 402: denied, 403: denied, 404: missing, 405: missing, 501: missing } });
    } finally {
      setSaving(false);
    }
  }

  const name = ask?.lead.name.trim() ?? "";
  const state = ask?.state;

  const node: ReactNode = (
    <>
      <Modal
        open={!!ask}
        onClose={close}
        title={name ? t("ccConfirmTitle", { name }) : t("ccConfirmTitleNoName")}
        size="sm"
        busy={saving}
        footer={
          <>
            <button type="button" className="btn btn--line" onClick={close} disabled={saving}>
              {tc("cancel")}
            </button>
            <button type="button" className="btn btn--pri" onClick={() => void confirm()} disabled={state !== "ready" || saving} aria-busy={saving || undefined}>
              {t("ccConfirmOk")}
            </button>
          </>
        }
      >
        <div className="lmeet">
          <p className="lmeet__t">{t("ccConfirmText")}</p>
          {state === "check" ? (
            <p className="lmeet__chk" role="status">
              <span className="lmeet__spin" aria-hidden="true" />
              {tl("meetChecking")}
            </p>
          ) : null}
          {state === "missing" ? (
            <InlineAlert tone="warn" compact>
              {tl("meetNoUser")}
            </InlineAlert>
          ) : null}
          {state === "self" ? (
            <InlineAlert tone="warn" compact>
              {t("ccSelf")}
            </InlineAlert>
          ) : null}
          {state === "error" ? (
            <InlineAlert tone="error" compact action={{ label: tn("retry"), onClick: retry }}>
              {tl("meetCheckFailed")}
            </InlineAlert>
          ) : null}
        </div>
      </Modal>
      {active && typeof document !== "undefined"
        ? createPortal(<CallRoom roomId={active.roomId} callId={active.callId} callType="video" isCaller title={active.title} lk={active.lk} onEnd={() => setActive(null)} />, document.body)
        : null}
    </>
  );

  return { can, start, busyId: ask?.lead.id ?? "", node };
}
