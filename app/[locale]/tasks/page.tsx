"use client";

import { useEffect } from "react";
import { hasAdminAccess, useAuth } from "@/lib/auth";
import { useRouter } from "@/i18n/navigation";
import { can } from "@/lib/permissions";

export default function TasksIndex() {
  const { session, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    const query = typeof window === "undefined" ? "" : window.location.search;
    if (!session) router.replace("/login");
    else {
      const home = hasAdminAccess(session) ? "/admin" : `/portal/${session.role}`;
      // Team tasks need tasks.view (the nav gates the page on it): without it
      // the link lands on the account's own home, not on a page it can't use.
      router.replace(can(session, "tasks.view") ? `${home}/team-tasks${query}` : home);
    }
  }, [ready, session, router]);
  return null;
}
