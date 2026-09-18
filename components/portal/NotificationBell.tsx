"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getUnreadCount } from "@/lib/services/backend";
import { NOTIF_READ_EVENT } from "./NotificationsPanel";
import { IconBell } from "../icons";

export default function NotificationBell({ role }: { role: string }) {
  const t = useTranslations("portal.notifications");
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      getUnreadCount()
        .then((c) => alive && setCount(c))
        .catch(() => {});
    };
    refresh();
    // Refresh the badge when notifications are read, on tab focus, and every 60s.
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener(NOTIF_READ_EVENT, refresh);
    document.addEventListener("visibilitychange", onFocus);
    const iv = setInterval(refresh, 60000);
    return () => {
      alive = false;
      window.removeEventListener(NOTIF_READ_EVENT, refresh);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(iv);
    };
  }, []);

  return (
    <Link href={`/portal/${role}/notifications`} className="ptop__bell" aria-label={t("aria")}>
      <IconBell />
      {count > 0 ? <span className="ptop__badge">{count > 9 ? "9+" : count}</span> : null}
    </Link>
  );
}
