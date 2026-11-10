"use client";

import "./profile1920.css";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  NOTIF_KEYS,
  type NotifPrefs,
} from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { aiId } from "@/lib/ai/ids";
import { Skeleton } from "./DataState";
import { IconBell } from "@/components/icons";

// The toggles in two groups, as the dashboard's chip cards: where the
// notifications arrive (channels) and what they are about (topics).
const CHANNELS: ReadonlySet<string> = new Set(["push", "sms", "telegram", "email"]);

// Notification channel and topic toggles (GET/PUT /notifications/preferences).
// PUT merges a partial update, so each toggle sends only its own key and
// reverts on failure. Shared by the client, advocate and lawyer portals.
export default function NotificationPrefsCard() {
  const t = useTranslations("portal.client.profile");
  const tc = useTranslations("portal.common");
  const tg = useTranslations("lxProfile.notif");
  const uid = useId();
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
    <div className="ppanel" data-ai-target="profile:notification-prefs" data-ai-id="profile.notification-prefs" data-ai-type="section">
      <div className="ppanel__h"><b className="ppanel__t"><span className="pico"><IconBell /></span>{t("notifPrefs")}</b></div>
      {prefs.status === "loading" ? (
        <Skeleton rows={2} />
      ) : !pf ? (
        <p className="advmuted">{tc("loadErrorText")}</p>
      ) : (
        <div className="prefs prefs--groups">
          {(["channels", "topics"] as const).map((g) => {
            const keys = NOTIF_KEYS.filter((k) => CHANNELS.has(k) === (g === "channels"));
            if (!keys.length) return null;
            return (
              <section className="prefs__group" key={g} aria-labelledby={`${uid}-${g}`}>
                <h3 className="cx-h4 prefs__gh" id={`${uid}-${g}`}>{tg(g)}</h3>
                <p className="prefs__gl">{tg(`${g}Lead`)}</p>
                <div className="prefs__rows">
                  {keys.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`prefs__row${pf[k] ? " on" : ""}`}
                      onClick={() => toggle(k)}
                      aria-pressed={pf[k]}
                      data-ai-id={aiId("profile.notification-prefs", k)}
                    >
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
              </section>
            );
          })}
        </div>
      )}
      {pf ? <p className="ppanel__note" style={{ marginTop: 10 }}>{t("notifSmsHint")}</p> : null}
    </div>
  );
}
