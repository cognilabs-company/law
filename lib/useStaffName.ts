"use client";

import { useEffect, useState } from "react";
import { hasAdminAccess, isCallCenterUser, sessionRoles, useAuth, type Session } from "@/lib/auth";
import { loadOperators } from "@/lib/services/leads";
import { lookupPerson } from "@/lib/usePerson";

// The staff member behind a bare user id (reviewed_by_user_id,
// published_by_user_id — backend answers 2026-10-31 §3.1, §4.5 give no
// nested name yet). Resolved through what the viewer may already read: their
// own session, the cached staff directory (GET /admin/users, users.manage),
// or the call-centre user card. undefined while asking, "" when this viewer
// can't learn the name — the caller then shows a neutral word, never the id.

const canReadUsers = (s: Session | null) => !!s && ((s.permissions ?? []).some((p) => p === "users.manage" || p === "*") || sessionRoles(s).some((r) => r === "superadmin" || r === "admin"));

function resolve(id: string, s: Session | null): Promise<string> {
  if (canReadUsers(s)) return loadOperators().then((dir) => dir.people.get(id)?.name.trim() ?? "", () => "");
  if (isCallCenterUser(s) || hasAdminAccess(s)) return lookupPerson(id).then((p) => p?.name ?? "");
  return Promise.resolve("");
}

export function useStaffName(id: string | null | undefined, known = ""): string | undefined {
  const { session } = useAuth();
  const key = (id ?? "").trim();
  const own = !!key && key === session?.id;
  const ask = !known.trim() && !own && !!key;
  const [got, setGot] = useState<{ key: string; name: string } | null>(null);
  useEffect(() => {
    if (!ask) return;
    let alive = true;
    void resolve(key, session).then((name) => {
      if (alive) setGot({ key, name });
    });
    return () => {
      alive = false;
    };
    // The session object changes on every refresh; who is asking is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, key, session?.id]);
  if (known.trim()) return known.trim();
  if (own) return session?.name?.trim() ?? "";
  if (!key) return "";
  return got && got.key === key ? got.name : undefined;
}
