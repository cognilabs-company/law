"use client";

import { useCallback } from "react";
import { useAuth } from "./auth";
import { can, type CanOptions } from "./permissions";

// `const canDo = useCan(); canDo("leads.manage") && <Button …/>` — the
// signed-in session's can() (lib/permissions.ts). Re-renders when the session
// (and so its permissions) changes, so a revoked action leaves the screen.
export function useCan(): (perm: string | readonly string[], opts?: CanOptions) => boolean {
  const { session } = useAuth();
  return useCallback((perm, opts) => can(session, perm, opts), [session]);
}
