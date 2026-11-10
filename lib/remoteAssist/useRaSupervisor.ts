"use client";

import { useEffect, useState } from "react";
import { loadRaMeta, raSupervisorOk } from "@/lib/services/remoteAssist";

// Whether the remote-assistance supervisor page will open for this user:
// undefined while GET /remote-assistance/meta is asked, then the page's own
// capability test. Not asked at all when `enabled` is false.
export function useRaSupervisor(enabled: boolean): boolean | undefined {
  const [ok, setOk] = useState<{ ok: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadRaMeta().then((meta) => {
      if (alive) setOk({ ok: meta.loaded && raSupervisorOk(meta) });
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  if (!enabled) return false;
  return ok ? ok.ok : undefined;
}
