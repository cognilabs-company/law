"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeUnread, unreadCount, refreshUnread } from "@/lib/unread";
import { NOTIF_READ_EVENT } from "./NotificationsPanel";
import { IconBell } from "../icons";

// The badge is pushed, not polled: lib/unread keeps the count in sync from the
// user socket (LEXGO_REALTIME_NOTIFICATIONS_CALLS_FRONTEND.md) and reads
// /notifications/unread-count only on mount and after a reconnect. The old
// 60-second interval here was one of the three the backend asked us to drop.
export default function NotificationBell({ role }: { role: string }) {
  const t = useTranslations("portal.notifications");
  const [count, setCount] = useState(0);
  // A new arrival should catch the eye once, not animate forever.
  const [pop, setPop] = useState(false);
  const popRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastRef = useRef(0);

  useEffect(() => {
    lastRef.current = unreadCount();
    setCount(lastRef.current);
    // The previous value is kept in a ref, so the pop is decided when the new
    // number arrives from the socket rather than by an effect comparing two
    // renders — that extra render is exactly the cascade the lint rule warns
    // about, and the ref reads the same value without one.
    const off = subscribeUnread((n) => {
      if (n > lastRef.current) {
        clearTimeout(popRef.current);
        setPop(true);
        popRef.current = setTimeout(() => setPop(false), 700);
      }
      lastRef.current = n;
      setCount(n);
    });
    // Reading a notification elsewhere in this tab is a local action the
    // socket will confirm a moment later; ask once so the badge is never stale
    // while the user is looking straight at it.
    const onRead = () => refreshUnread();
    window.addEventListener(NOTIF_READ_EVENT, onRead);
    return () => {
      off();
      clearTimeout(popRef.current);
      window.removeEventListener(NOTIF_READ_EVENT, onRead);
    };
  }, []);

  return (
    <Link
      href={`/portal/${role}/notifications`}
      className={`ptop__bell${pop ? " ptop__bell--pop" : ""}`}
      aria-label={count > 0 ? t("ariaN", { n: count }) : t("aria")}
    >
      <IconBell />
      {count > 0 ? <span className="ptop__badge">{count > 9 ? "9+" : count}</span> : null}
    </Link>
  );
}
