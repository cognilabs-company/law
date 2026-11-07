"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/toast";
import { findUserByPhone, startClientMeeting } from "@/components/admin/CcMeetingButton";
import { prettyPhone } from "../now/feed";
import { IcBolt, IcMeeting, IcPhone } from "../icons";
import { QUICK_ID, type Active } from "./model";

export default function QuickStart({ onOpen }: { onOpen: (a: Active) => void }) {
  const t = useTranslations("admin.meetings");
  const x = useTranslations("admin.ccx.meetings");
  const { session } = useAuth();
  const uid = useId();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => () => notify.dismiss(QUICK_ID), []);

  async function go() {
    if (busy || !session) return;
    const raw = phone.trim();
    if (!raw) {
      setErr(x("quickNeedPhone"));
      return;
    }
    notify.dismiss(QUICK_ID);
    setBusy(true);
    try {
      const userId = await findUserByPhone(raw);
      if (!userId) {
        notify.error(t("ccFailed"), { id: QUICK_ID, body: t("ccNoUser") });
        return;
      }
      if (userId === session.id) {
        notify.error(t("ccFailed"), { id: QUICK_ID, body: t("ccSelf") });
        return;
      }
      const title = t("ccTitle", { name: prettyPhone(raw) });
      const ids = await startClientMeeting(userId, title);
      onOpen({ roomId: ids.roomId, callId: ids.callId, callType: "video", isCaller: true, title, lk: ids.lk });
      setPhone("");
    } catch (e) {
      const denied = t("noPermission");
      const missing = t("backendMissing");
      notify.error(t("ccFailed"), { id: QUICK_ID, error: e, map: { 402: denied, 403: denied, 404: missing, 405: missing, 501: missing } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="opx-mtg-box opx-mtg-quick" aria-labelledby={`${uid}-h`}>
      <header className="opx-mtg-box__head">
        <span className="opx-mtg-box__ic opx-mtg-box__ic--bolt" aria-hidden="true">
          <IcBolt size={20} />
        </span>
        <h3 id={`${uid}-h`}>{x("quickTitle")}</h3>
      </header>
      <form
        className="opx-mtg-quick__form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <div className={`opx-field${err ? " has-error" : ""}`}>
          <label htmlFor={`${uid}-ph`}>{x("quickPhone")}</label>
          <div className="opx-mtg-tel">
            <IcPhone size={16} />
            <input
              id={`${uid}-ph`}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              placeholder="+998 90 123 45 67"
              aria-invalid={Boolean(err)}
              aria-describedby={err ? `${uid}-e` : undefined}
              onChange={(e) => {
                setPhone(e.target.value);
                if (err) setErr("");
              }}
            />
          </div>
          {err ? (
            <p className="opx-ferr" id={`${uid}-e`} role="alert">
              {err}
            </p>
          ) : null}
        </div>
        <button type="submit" className="opx-mtg-go" disabled={busy} aria-busy={busy || undefined}>
          <IcMeeting size={20} />
          {busy ? t("starting") : x("quickGo")}
        </button>
      </form>
    </section>
  );
}
