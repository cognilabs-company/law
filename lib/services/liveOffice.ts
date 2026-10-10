// Live office data: today's audit trail (GET /admin/audit-trail, users.manage)
// and the user directory (GET /admin/users) for names and roles. The backend
// has no presence endpoint, so "who is where" is read from the latest action.
import { parseServerTime } from "@/lib/http";
import { listAuditTrail } from "@/lib/services/backend";
import { listAdminUsers } from "@/lib/services/users";
import { dayWindow, type DirectoryUser, type RawEvent } from "@/lib/liveOffice/model";

export async function getOfficeEvents(now: number): Promise<RawEvent[]> {
  const w = dayWindow(now);
  const rows = await listAuditTrail({ dateFrom: w.dateFrom, dateTo: w.dateTo });
  const out: RawEvent[] = [];
  for (const r of rows) {
    const at = parseServerTime(r.createdAt);
    if (!r.userId || !Number.isFinite(at) || at < w.start) continue;
    out.push({ id: r.id, userId: r.userId, action: r.action, targetType: r.targetType ?? "", detail: r.detail, title: r.titleUz ?? "", at });
  }
  return out;
}

export async function getOfficeDirectory(): Promise<Map<string, DirectoryUser>> {
  const users = await listAdminUsers();
  return new Map(users.map((u) => [u.id, { id: u.id, name: u.name, role: u.role, roles: u.roles }]));
}
