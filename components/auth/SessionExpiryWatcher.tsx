"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";

// When a refresh session ends (inactivity → /auth/refresh 401), send anyone on
// an authenticated route to /login, where the "session expired" notice shows.
// PortalShell/AdminShell redirect on their own; this also covers shell-less
// routes such as /portal/chat/[roomId].
export default function SessionExpiryWatcher() {
  const { authNotice, session, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready || session || authNotice !== "sessionExpired") return;
    // /admin/bootstrap works without a session (first-admin setup).
    if (/^\/(portal|admin)(\/|$)/.test(pathname) && pathname !== "/admin/bootstrap") router.replace("/login");
  }, [ready, session, authNotice, pathname, router]);

  return null;
}
