import { isForbidden } from "@/lib/http";
import { ensureStudioRegistry } from "@/lib/services/studio";

// Was a Studio action refused with 403? If so, the Studio roles
// (GET /studio/constructors user_roles) are read again quietly, so every
// role-gated action recomputes: a revoked grant takes its buttons with it.
// The global 403 net only re-reads /auth/me, which does not carry Studio
// grants. Call it from a catch, never while rendering.
export function studioDenied(e: unknown): boolean {
  if (!isForbidden(e)) return false;
  void ensureStudioRegistry(true);
  return true;
}
