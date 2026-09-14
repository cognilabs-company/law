// Admin API client (see /admin/* in the OpenAPI spec). All calls require an
// authenticated user with the right permissions; the bearer token is attached
// automatically by the shared http() layer.
import { http, asDict, asStr, asArr } from "@/lib/http";
import { normDeliveries, type NotificationDelivery } from "@/lib/services/backend";

export type Permission = { code: string; title: string };
export type AdminRole = {
  id: string;
  name: string;
  title: string;
  description: string;
  permissions: string[];
  createdAt: string;
};

function normRole(v: unknown): AdminRole {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    name: asStr(d.name),
    title: asStr(d.title),
    description: asStr(d.description),
    permissions: asArr(d.permissions).map((p) => asStr(p)),
    createdAt: asStr(d.created_at ?? d.createdAt),
  };
}

// ── Roles & permissions ──
export async function getPermissions(): Promise<Permission[]> {
  return asArr(await http("/admin/permissions")).map((v) => {
    const d = asDict(v);
    return { code: asStr(d.code), title: asStr(d.title) };
  });
}

export async function getRoles(): Promise<AdminRole[]> {
  return asArr(await http("/admin/roles")).map(normRole);
}

export async function createRole(input: {
  name: string;
  title: string;
  description?: string;
  permissions: string[];
}): Promise<AdminRole> {
  return normRole(
    await http("/admin/roles", { method: "POST", body: JSON.stringify(input) }),
  );
}

export async function assignRole(userId: string, roleId: string): Promise<AdminRole> {
  return normRole(
    await http("/admin/users/assign-role", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, role_id: roleId }),
    }),
  );
}

// ── Catalog ──
export async function createServiceCategory(input: {
  slug: string;
  title: string;
  description?: string;
}): Promise<unknown> {
  return http("/admin/service-categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createService(input: {
  category_id: string;
  slug: string;
  title: string;
  description?: string;
  base_price?: number; // whole so'm (legacy UZS), not tiyin (T0-16)
  currency?: string;
  delivery_minutes?: number;
  is_active?: boolean;
}): Promise<unknown> {
  return http("/admin/services", { method: "POST", body: JSON.stringify(input) });
}

// ── Subscription plans ──
export async function createSubscriptionPlan(input: {
  slug: string;
  title: string;
  description?: string;
  monthly_price?: number; // whole so'm (legacy UZS), not tiyin (T0-16)
  benefits?: string[];
  is_giftable?: boolean;
  is_active?: boolean;
}): Promise<unknown> {
  return http("/admin/subscription-plans", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ── Document templates ──
export async function createDocumentTemplate(input: {
  slug: string;
  title: string;
  category?: string;
  language?: string;
  description?: string;
  template_text: string;
  price?: number; // whole so'm (legacy UZS), not tiyin (T0-16)
  is_active?: boolean;
}): Promise<unknown> {
  return http("/admin/document-templates", {
    method: "POST",
    body: JSON.stringify({ fields: [], ...input }),
  });
}

export async function updateDocumentTemplate(
  id: string,
  input: Partial<{
    slug: string;
    title: string;
    category: string;
    language: string;
    description: string;
    template_text: string;
    price: number; // whole so'm (legacy UZS), not tiyin (T0-16)
    is_active: boolean;
  }>,
): Promise<unknown> {
  return http(`/admin/document-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteDocumentTemplate(id: string): Promise<unknown> {
  return http(`/admin/document-templates/${id}`, { method: "DELETE" });
}

// ── Notifications ──
// The backend creates the record and runs the delivery cascade; channels whose
// provider isn't configured come back "queued" (waiting for delivery).
export type NotificationSendResult = { id: string; deliveries: NotificationDelivery[] };
export async function createNotification(input: {
  user_id: string;
  channel?: string;
  title: string;
  body: string;
}): Promise<NotificationSendResult> {
  const raw = await http("/admin/notifications", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const d = asDict(raw);
  const top = normDeliveries(raw);
  return {
    id: asStr(d.id ?? asDict(d.notification).id),
    deliveries: top.length ? top : normDeliveries(d.notification ?? d, input.channel ?? ""),
  };
}

// ── Bootstrap ──
export async function bootstrapSuperadmin(
  phone: string,
  bootstrapKey: string,
): Promise<unknown> {
  return http("/admin/bootstrap-superadmin", {
    method: "POST",
    body: JSON.stringify({ phone, bootstrap_key: bootstrapKey }),
  });
}
