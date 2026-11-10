// Who may send one notification to a whole role (POST /admin/notifications
// with audience_role). The backend gives notifications.manage to a duty
// lawyer too, and has no separate broadcast permission yet (asked in
// docs/LEXGO_FRONTEND_QUESTIONS_CALL_CENTER_2026_11_10.md), so a role-wide
// send stays with superadmin/admin, or anyone the backend grants
// "notifications.broadcast" once it exists.
export const BROADCAST_PERMISSION = "notifications.broadcast";
const BROADCAST_ROLES = ["superadmin", "admin"];

export function canBroadcastNotifications(roles: readonly string[], permissions: readonly string[]): boolean {
  return permissions.includes(BROADCAST_PERMISSION) || roles.some((r) => BROADCAST_ROLES.includes(r));
}
