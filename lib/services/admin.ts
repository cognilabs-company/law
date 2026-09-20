// Admin API client (see /admin/* in the OpenAPI spec). All calls require an
// authenticated user with the right permissions; the bearer token is attached
// automatically by the shared http() layer.
import { http, asDict, asStr, asArr, asNum, type Dict } from "@/lib/http";
import { normDeliveries, type NotificationDelivery, type BackendService, type TemplateField } from "@/lib/services/backend";
import { uzsOpt } from "@/lib/money";

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

// Admin view of a service: the public BackendService shape plus the raw
// LegalServiceOut fields the admin UI edits and searches on (the three catalog
// titles, currency, delivery time, SLA/refund/AI codes). `hasMetadata` tells
// whether a legal_service_metadata row exists: PATCH /admin/services/{id}
// applies the `metadata` block only then (admin-created services have none).
export type AdminService = BackendService & {
  title: string; // raw backend title (what the admin typed), not the localized one
  titleUzCyrl: string;
  titleUzLatn: string;
  titleRu: string;
  basePrice?: number; // whole so'm (legacy UZS), not tiyin (T0-16)
  standardPrice?: number; // catalog metadata price, whole so'm
  currency: string;
  deliveryMinutes?: number;
  slaCode: string;
  refundCode: string;
  aiCategory: string;
  hasMetadata: boolean;
  createdAt: string;
  documentTemplateId?: string;
};

// Same localized-title preference as the public catalog normalizer.
function adminServiceName(d: Dict, locale: string): string {
  const byLocale = locale === "ru" ? d.title_ru : d.title_uz_latn;
  return asStr(byLocale ?? d.title ?? d.name);
}

export function normAdminService(v: unknown, locale = "uz"): AdminService {
  const d = asDict(v);
  const titleUzCyrl = asStr(d.title_uz_cyrl);
  const titleUzLatn = asStr(d.title_uz_latn);
  const titleRu = asStr(d.title_ru);
  const catalogCode = asStr(d.catalog_code);
  // service_to_out sets standard_price to the metadata value (an int, never
  // None) only when a metadata row exists; the codes are a fallback signal.
  const hasMetadata =
    (d.standard_price != null && d.standard_price !== "") ||
    Boolean(catalogCode || titleUzCyrl || titleUzLatn || titleRu || asStr(d.executor_type));
  return {
    id: asStr(d.id),
    name: adminServiceName(d, locale),
    slug: asStr(d.slug),
    categoryId: asStr(d.category_id ?? d.categoryId) || undefined,
    categoryTitle: asStr(d.category_title) || undefined,
    price: uzsOpt(d, "standard_price", "base_price"),
    description: asStr(d.description) || undefined,
    isActive: d.is_active !== false && d.is_active !== 0,
    catalogCode: catalogCode || undefined,
    executorType: asStr(d.executor_type) || undefined,
    advokatRequired: Boolean(d.advokat_required),
    pricingTier: asStr(d.pricing_tier) || undefined,
    title: asStr(d.title),
    titleUzCyrl,
    titleUzLatn,
    titleRu,
    basePrice: uzsOpt(d, "base_price"),
    standardPrice: hasMetadata ? uzsOpt(d, "standard_price") : undefined,
    currency: asStr(d.currency) || "UZS",
    deliveryMinutes: d.delivery_minutes == null ? undefined : asNum(d.delivery_minutes),
    slaCode: asStr(d.sla_code),
    refundCode: asStr(d.refund_code),
    aiCategory: asStr(d.ai_category),
    hasMetadata,
    createdAt: asStr(d.created_at),
    documentTemplateId: asStr(d.document_template_id) || undefined,
  };
}

// GET /admin/services (2026-09-19 backend): the real admin listing, unlike
// GET /services it includes inactive rows too — no more client-side
// "remembered locally" workaround for a deactivated service disappearing.
export type AdminServiceFilter = { categoryId?: string; q?: string; isActive?: boolean; executorType?: string };
export async function listAdminServices(locale = "uz", f?: AdminServiceFilter): Promise<AdminService[]> {
  const qs = new URLSearchParams();
  if (f?.categoryId) qs.set("category_id", f.categoryId);
  if (f?.q) qs.set("q", f.q);
  if (f?.isActive != null) qs.set("is_active", String(f.isActive));
  if (f?.executorType) qs.set("executor_type", f.executorType);
  const q = qs.toString();
  const data = await http(`/admin/services${q ? `?${q}` : ""}`);
  const d = asDict(data);
  const list = Array.isArray(data) ? data : asArr(d.services ?? d.items ?? d.data);
  return list.map((v) => normAdminService(v, locale));
}

// PATCH /admin/services/{id}. Every key is optional; the backend ignores keys
// that are absent or null. Numbers go as whole so'm (legacy UZS, T0-16).
// The metadata block is applied only when the service has a metadata row.
export type ServiceMetadataInput = Partial<{
  title_uz_cyrl: string;
  title_uz_latn: string;
  title_ru: string;
  executor_type: string;
  advokat_required: boolean;
  pricing_tier: string;
  standard_price: number;
  sla_code: string;
  refund_code: string;
  ai_category: string;
}>;
export type ServiceUpdateInput = Partial<{
  category_id: string;
  slug: string;
  title: string;
  description: string;
  base_price: number;
  currency: string;
  delivery_minutes: number;
  is_active: boolean;
  metadata: ServiceMetadataInput;
}>;

export async function updateService(
  id: string,
  input: ServiceUpdateInput,
  locale = "uz",
): Promise<AdminService> {
  const raw = await http(`/admin/services/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return normAdminService(raw, locale);
}

// DELETE /admin/services/{id} is a soft delete: the backend sets is_active=0
// and answers {deleted: true, id}. The row stays in the database.
export async function deleteService(id: string): Promise<{ deleted: boolean; id: string }> {
  const d = asDict(await http(`/admin/services/${encodeURIComponent(id)}`, { method: "DELETE" }));
  return { deleted: d.deleted !== false, id: asStr(d.id) || id };
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

// POST /admin/services/{service_id}/document-template (2026-09-20 backend):
// upload a real DOCX with {{field}} placeholders straight onto a service —
// unlike POST /admin/document-templates/import-docx above (which creates a
// free-floating template nothing links to), this one auto-attaches to the
// service so its "Xizmatlar" card gets a document builder for free.
export type ServiceDocTemplateUploadInput = {
  file: File;
  slug: string;
  title: string;
  category?: string;
  language?: string;
  visibility?: string;
  price?: number; // whole so'm (legacy UZS)
  is_active?: boolean;
};
export type ServiceDocTemplateUploadResult = { fields: TemplateField[]; fieldCount: number };
export async function uploadServiceDocumentTemplate(serviceId: string, input: ServiceDocTemplateUploadInput): Promise<ServiceDocTemplateUploadResult> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("slug", input.slug);
  form.append("title", input.title);
  form.append("category", input.category || "service_document");
  form.append("language", input.language || "uz-latn");
  form.append("visibility", input.visibility || "client");
  form.append("price", String(input.price ?? 0));
  form.append("is_active", String(input.is_active ?? true));
  const d = asDict(await http(`/admin/services/${encodeURIComponent(serviceId)}/document-template`, { method: "POST", body: form }));
  const fields = asArr(d.fields).map((f) => {
    const r = asDict(f);
    return { key: asStr(r.key ?? r.name), label: asStr(r.label ?? r.key), type: asStr(r.type, "text"), required: r.required !== false };
  });
  return { fields, fieldCount: asNum(d.field_count, fields.length) };
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
