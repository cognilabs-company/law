// Admin user directory (GET /admin/users — users.manage). Shared by the
// call-center assignment UI and the admin notifications recipient picker.
import { http, asDict, asStr, asArr } from "@/lib/http";

export type AdminUser = {
  id: string;
  lexgoId: string;
  role: string; // backend UserRole: client | yurist | advokat | advokat_tashkiloti | admin | manager | call_center | sales
  roles: string[]; // assigned extra roles (may be empty)
  name: string;
  phone: string;
  region: string;
  accountStatus: string;
  createdAt: string;
};

function normAdminUser(v: unknown): AdminUser {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    lexgoId: asStr(d.lexgo_id),
    role: asStr(d.role),
    roles: asArr(d.roles).map((r) => asStr(typeof r === "string" ? r : asDict(r).code ?? asDict(r).name)).filter(Boolean),
    name: asStr(d.name) || [asStr(d.last_name), asStr(d.first_name)].filter(Boolean).join(" "),
    phone: asStr(d.phone),
    region: asStr(d.region),
    accountStatus: asStr(d.account_status, "active"),
    createdAt: asStr(d.created_at),
  };
}

// role / status / q are applied by the backend (q matches name, phone, lexgo id).
export async function listAdminUsers(params: { role?: string; status?: string; q?: string } = {}): Promise<AdminUser[]> {
  const qs = new URLSearchParams();
  if (params.role) qs.set("role", params.role);
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  const raw = await http(`/admin/users${qs.toString() ? `?${qs}` : ""}`);
  const list = Array.isArray(raw) ? raw : asArr(asDict(raw).items ?? asDict(raw).users ?? asDict(raw).data);
  return list.map(normAdminUser);
}

// Call-center operators: primary role call_center, or the role assigned as an extra role.
export const isOperator = (u: AdminUser) => u.role === "call_center" || u.roles.includes("call_center") || u.roles.includes("call_center_lawyer");
export async function listOperators(): Promise<AdminUser[]> {
  const all = await listAdminUsers({ status: "active" });
  return all.filter(isOperator);
}
