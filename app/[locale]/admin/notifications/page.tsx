"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createNotification } from "@/lib/services/admin";
import type { NotificationDelivery } from "@/lib/services/backend";
import { AdminForm } from "@/components/admin/AdminBits";
import { DeliveryChips } from "@/components/portal/NotificationsPanel";

export default function AdminNotifications() {
  const t = useTranslations("admin");
  // Per-channel delivery the backend reported for the last send; channels
  // whose provider isn't connected yet come back queued (waiting).
  const [delivery, setDelivery] = useState<NotificationDelivery[] | null>(null);

  return (
    <div className="ppanel" style={{ maxWidth: 640 }}>
      <div className="ppanel__h"><b>{t("notifications.title")}</b></div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("notifications.lead")}</p>
      <AdminForm
        fields={[
          { name: "user_id", label: t("notifications.user"), type: "user", required: true, placeholder: t("notifications.selectUser") },
          {
            name: "channel",
            label: t("notifications.channel"),
            type: "select",
            options: [
              { value: "push", label: t("notifications.push") },
              { value: "telegram", label: t("notifications.telegram") },
              { value: "email", label: t("notifications.email") },
              { value: "sms", label: t("notifications.sms") },
            ],
          },
          { name: "title", label: t("form.title"), required: true },
          { name: "body", label: t("notifications.body"), type: "textarea", required: true },
        ]}
        onSubmit={async (v) => {
          setDelivery(null);
          const r = await createNotification({
            user_id: String(v.user_id),
            channel: String(v.channel || "push"),
            title: String(v.title),
            body: String(v.body),
          });
          setDelivery(r.deliveries);
        }}
        submitLabel={t("notifications.send")}
        busyLabel={t("notifications.sending")}
        okMsg={t("notifications.sent")}
        errMsg={t("form.error")}
      />
      {delivery?.length ? (
        <div style={{ marginTop: 12 }}>
          <DeliveryChips items={delivery} />
          {delivery.some((x) => x.tone === "pending") ? (
            <p className="advmuted" style={{ marginTop: 8 }}>{t("notifications.queuedNote")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
