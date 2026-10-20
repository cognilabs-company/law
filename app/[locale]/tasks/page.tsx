"use client";

import { useEffect } from "react";
import { hasAdminAccess, useAuth } from "@/lib/auth";
import { useRouter } from "@/i18n/navigation";

export default function TasksIndex() {
  const { session, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    const query = typeof window === "undefined" ? "" : window.location.search;
    if (!session) router.replace("/login");
    else router.replace(`${hasAdminAccess(session) ? "/admin" : `/portal/${session.role}`}/team-tasks${query}`);
  }, [ready, session, router]);
  return null;
}
