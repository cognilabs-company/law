"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  NOTIF_KEYS,
  type NotifPrefs,
} from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { Skeleton } from "./DataState";
import { IconBell } from "@/components/icons";

// Notification channel and topic toggles (GET/PUT /notifications/preferences).
// PUT merges a partial update, so each toggle sends only its own key and
// reverts on failure. Shared by the client, advocate and lawyer portals.
export default function NotificationPrefsCard() {
  const t = useTranslations("portal.client.profile");
  const tc = useTranslations("portal.common");
  const { session } = useAuth();
  const prefs = useResourceOne(getNotificationPreferences, []);
  const [local, setLocal] = useState<NotifPrefs | null>(null);
  const pf = local ?? prefs.data ?? null;

  async function toggle(k: keyof NotifPrefs) {
    if (!pf) return;
    const next = { ...pf, [k]: !pf[k] };
    setLocal(next);
    try {
      await updateNotificationPreferences({ [k]: next[k] });
    } catch {
      setLocal(pf);
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h"><b className="ppanel__t"><span className="pico"><IconBell /></span>{t("notifPrefs")}</b></div>
      {prefs.status === "loading" ? (
        <Skeleton rows={2} />
      ) : !pf ? (
        <p className="advmuted">{tc("loadErrorText")}</p>
      ) : (
        <div className="prefs">
          {NOTIF_KEYS.map((k) => (
            <button key={k} type="button" className={`prefs__row${pf[k] ? " on" : ""}`} onClick={() => toggle(k)} aria-pressed={pf[k]}>
              <span>
                {t.has(`notif.${k}`) ? t(`notif.${k}`) : k}
                {/* Only when the link state is known to be off, never when unknown. */}
                {k === "telegram" && session?.telegramLinked === false ? (
                  <small className="prefs__hint">{t("notifTelegramHint")}</small>
                ) : null}
              </span>
              <span className="prefs__sw" />
            </button>
          ))}
        </div>
      )}
      {pf ? <p className="ppanel__note" style={{ marginTop: 10 }}>{t("notifSmsHint")}</p> : null}
    </div>
  );
}
