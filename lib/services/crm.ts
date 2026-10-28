// LexGo CRM and the Operator AI Copilot (contract 2026-10-26, /crm/*).
// Customers and leads are separate: one customer, many leads. The UI is
// built from GET /crm/meta (permissions, scope, revenue, telephony, the
// status transition map) and each lead's `allowed_actions` — never from
// role names. Every lead write carries the lead's current lock_version;
// the backend answers 409 crm_lead_version_conflict when it moved on.
// Decisions branch on detail.code (ApiError.code), never on message text.
// Field names follow the production OpenAPI (32 /crm paths, 27 schemas).

import { ApiError, asArr, asDict, asStr, http, httpBlobNamed, type Dict } from "@/lib/http";

const enc = encodeURIComponent;
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const int = (v: unknown, d = 0): number => num(v) ?? d;
const bool = (v: unknown): boolean => v === true;
const qs = (q: Record<string, string | number | boolean | null | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

// ── Meta ───────────────────────────────────────────────────────────────

export const CRM_STATUSES = ["new", "contacted", "qualified", "proposal", "payment_pending", "won", "closed"] as const;
export type CrmStatus = (typeof CRM_STATUSES)[number];
export const CRM_PERMS = [
  "crm.customers.view",
  "crm.customers.manage",
  "crm.customers.merge",
  "crm.leads.view",
  "crm.leads.manage",
  "crm.leads.claim",
  "crm.leads.assign",
  "crm.analytics.self",
  "crm.analytics.global",
  "crm.revenue.view",
  "crm.ai.use",
  "crm.calls.start",
  "crm.calls.recordings.view",
  "crm.exports.create",
  "crm.templates.manage",
] as const;
export type CrmPerm = (typeof CRM_PERMS)[number];

export type CrmTelephony = { provider: string; enabled: boolean; recordingConsentRequired: boolean; liveTranscription: string; recordingAccess: boolean };
export type CrmMeta = {
  statuses: string[];
  transitions: Record<string, string[]>;
  scores: string[];
  languages: string[];
  contactTypes: string[];
  sources: string[];
  permissions: string[];
  scope: string;
  revenueVisible: boolean;
  telephony: CrmTelephony;
};

export function crmMetaOf(v: unknown): CrmMeta {
  const d = asDict(v);
  const rows = asArr(d.statuses).map(asDict);
  const transitions: Record<string, string[]> = {};
  for (const r of rows) transitions[asStr(r.key)] = asArr(r.transitions).map((x) => asStr(x)).filter(Boolean);
  const tel = asDict(d.telephony);
  return {
    statuses: rows.map((r) => asStr(r.key)).filter(Boolean),
    transitions,
    scores: asArr(d.scores).map((x) => asStr(x)),
    languages: asArr(d.languages).map((x) => asStr(x)),
    contactTypes: asArr(d.contact_types).map((x) => asStr(x)),
    sources: asArr(d.sources).map((x) => asStr(x)),
    permissions: asArr(d.permissions).map((x) => asStr(x)),
    scope: asStr(d.scope),
    revenueVisible: bool(d.revenue_visible),
    telephony: {
      provider: asStr(tel.provider),
      enabled: bool(tel.enabled),
      recordingConsentRequired: tel.recording_consent_required !== false,
      liveTranscription: asStr(tel.live_transcription),
      recordingAccess: bool(tel.recording_access),
    },
  };
}

export const crmCan = (meta: CrmMeta | null, perm: CrmPerm): boolean => !!meta && meta.permissions.includes(perm);
// Global analytics and paid revenue: both the permission and the flag (§8).
export const crmGlobalAnalytics = (meta: CrmMeta | null): boolean => crmCan(meta, "crm.analytics.global") && !!meta?.revenueVisible;
// The statuses a lead may move to next, from the backend's own map.
export const crmNextStatuses = (meta: CrmMeta | null, status: string): string[] => meta?.transitions[status] ?? [];

export async function getCrmMeta(signal?: AbortSignal): Promise<CrmMeta> {
  return crmMetaOf(await http("/crm/meta", { signal }));
}

// ── People ─────────────────────────────────────────────────────────────

export type CrmPerson = { id: string; name: string; lexgoId: string; role: string };
export function crmPersonOf(v: unknown): CrmPerson | null {
  const d = asDict(v);
  const id = asStr(d.id ?? d.user_id);
  const name = asStr(d.name ?? d.full_name).trim();
  if (!id && !name) return null;
  return { id, name, lexgoId: asStr(d.lexgo_id), role: asStr(d.role) };
}

export type CrmOperator = CrmPerson & { activeLeads: number };
export async function listCrmOperators(q = "", signal?: AbortSignal): Promise<CrmOperator[]> {
  const d = asDict(await http(`/crm/operators${qs({ q: q.trim(), limit: 100 })}`, { signal }));
  return asArr(d.items)
    .map((x) => {
      const p = crmPersonOf(x);
      return p ? { ...p, activeLeads: int(asDict(x).active_leads) } : null;
    })
    .filter((x): x is CrmOperator => !!x);
}

// ── Customers ──────────────────────────────────────────────────────────

// Contract 2026-10-27 (CRM customer/lead): the backend links the LexGo
// account by the verified phone and says so with is_lexgo_user and its own
// label; `userId` is kept only for internal links, never shown or sent.
export type CrmCustomerBrief = { id: string; publicId: string; userId: string; isLexgoUser: boolean; lexgoLabel: string; name: string; language: string; region: string; phone: string; telegram: string; email: string };
export type CrmCustomer = CrmCustomerBrief & { status: string; source: string; leadCount: number; activeLeadCount: number; createdAt: string; updatedAt: string };
export type CrmContact = { id: string; type: string; value: string; label: string; primary: boolean; verified: boolean; status: string; source: string; createdAt: string };
export type CrmOrderRef = { id: string; serviceId: string; serviceTitle: string; status: string; paymentStatus: string; createdAt: string };
export type CrmCustomerDetail = CrmCustomer & { notes: string; contacts: CrmContact[]; leads: CrmLead[]; orders: CrmOrderRef[]; activityCount: number; sections: DetailSection[] };

export function crmCustomerBriefOf(v: unknown): CrmCustomerBrief | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  return {
    id,
    publicId: asStr(d.public_id),
    userId: asStr(d.user_id),
    isLexgoUser: d.is_lexgo_user === true || (d.is_lexgo_user === undefined && !!asStr(d.user_id)),
    lexgoLabel: asStr(d.lexgo_user_label),
    name: asStr(d.name),
    language: asStr(d.preferred_language),
    region: asStr(d.region),
    phone: asStr(d.primary_phone),
    telegram: asStr(d.primary_telegram),
    email: asStr(d.primary_email),
  };
}
export function crmCustomerOf(v: unknown): CrmCustomer {
  const d = asDict(v);
  const b = crmCustomerBriefOf(d) ?? { id: "", publicId: "", userId: "", isLexgoUser: false, lexgoLabel: "", name: "", language: "", region: "", phone: "", telegram: "", email: "" };
  return { ...b, status: asStr(d.status), source: asStr(d.source), leadCount: int(d.lead_count), activeLeadCount: int(d.active_lead_count), createdAt: asStr(d.created_at), updatedAt: asStr(d.updated_at) };
}
export function crmContactOf(v: unknown): CrmContact {
  const d = asDict(v);
  return { id: asStr(d.id), type: asStr(d.contact_type), value: asStr(d.value), label: asStr(d.label), primary: bool(d.is_primary), verified: bool(d.is_verified), status: asStr(d.status) || "active", source: asStr(d.source), createdAt: asStr(d.created_at) };
}
export function crmCustomerDetailOf(v: unknown): CrmCustomerDetail {
  const d = asDict(v);
  return {
    ...crmCustomerOf(d),
    notes: asStr(d.notes),
    contacts: asArr(d.contacts).map(crmContactOf).filter((c) => c.id),
    leads: asArr(d.leads).map(crmLeadOf).filter((l) => l.id),
    orders: asArr(d.orders).map((x) => {
      const o = asDict(x);
      return { id: asStr(o.id), serviceId: asStr(o.service_id), serviceTitle: asStr(o.service_title), status: asStr(o.status), paymentStatus: asStr(o.payment_status), createdAt: asStr(o.created_at) };
    }),
    activityCount: int(d.activity_count),
    sections: detailSectionsOf(d.detail_sections),
  };
}

// ── detail_sections: the backend's readable view of a record ──
// Never raw JSON (contract §10): each section is a card of labelled values;
// a group nests, a list repeats. The values can still be codes, dates or
// ids — the UI translates, formats or drops them (DetailSections).
export type DetailItem = { key: string; label: string; type: "text" | "number" | "boolean" | "datetime" | "group" | "list"; value: unknown; items: DetailItem[] };
export type DetailSection = { key: string; title: string; items: DetailItem[] };
const DETAIL_TYPES = new Set(["text", "number", "boolean", "datetime", "group", "list"]);
function detailItemOf(v: unknown): DetailItem {
  const d = asDict(v);
  const type = asStr(d.value_type);
  return { key: asStr(d.key), label: asStr(d.label), type: (DETAIL_TYPES.has(type) ? type : "text") as DetailItem["type"], value: d.value ?? null, items: asArr(d.items).map(detailItemOf) };
}
export function detailSectionsOf(v: unknown): DetailSection[] {
  return asArr(v)
    .map((x) => {
      const d = asDict(x);
      return { key: asStr(d.key), title: asStr(d.title), items: asArr(d.items).map(detailItemOf) };
    })
    .filter((s) => s.items.length);
}

// ── The lead form's one customer source (contract §5) ──
// GET /crm/customers/select: paged, searched by name, phone, CRM ID or
// LexGo ID; display_label is the option's title.
export type CustomerOption = { id: string; publicId: string; name: string; region: string; phone: string; isLexgoUser: boolean; lexgoLabel: string; leadCount: number; label: string };
export function customerOptionOf(v: unknown): CustomerOption {
  const d = asDict(v);
  const name = asStr(d.name);
  return {
    id: asStr(d.id),
    publicId: asStr(d.public_id),
    name,
    region: asStr(d.region),
    phone: asStr(d.primary_phone),
    isLexgoUser: d.is_lexgo_user === true,
    lexgoLabel: asStr(d.lexgo_user_label),
    leadCount: int(d.lead_count),
    label: asStr(d.display_label) || [name, asStr(d.public_id), asStr(d.primary_phone)].filter(Boolean).join(" · "),
  };
}
export const SELECT_PAGE = 30;
export async function selectCrmCustomers(q: { q?: string; offset?: number; limit?: number }, signal?: AbortSignal): Promise<{ items: CustomerOption[]; total: number; hasMore: boolean }> {
  const limit = q.limit ?? SELECT_PAGE;
  const offset = q.offset ?? 0;
  const d = asDict(await http(`/crm/customers/select${qs({ q: q.q?.trim(), status: "active", limit, offset })}`, { signal }));
  const items = asArr(d.items).map(customerOptionOf).filter((c) => c.id);
  const total = int(d.total);
  return { items, total, hasMore: typeof d.has_more === "boolean" ? d.has_more : offset + items.length < total };
}
// A customer just created, as an option (no refetch, contract §14).
export const optionOfCustomer = (c: CrmCustomer): CustomerOption => ({ id: c.id, publicId: c.publicId, name: c.name, region: c.region, phone: c.phone, isLexgoUser: c.isLexgoUser, lexgoLabel: c.lexgoLabel, leadCount: c.leadCount, label: [c.name, c.publicId, c.phone].filter(Boolean).join(" · ") });

export type CrmPage<T> = { items: T[]; total: number; limit: number; offset: number };
export type CustomerQuery = { q?: string; region?: string; status?: string; limit?: number; offset?: number };
export async function listCrmCustomers(q: CustomerQuery = {}, signal?: AbortSignal): Promise<CrmPage<CrmCustomer>> {
  const d = asDict(await http(`/crm/customers${qs({ q: q.q?.trim(), region: q.region, status: q.status ?? "active", limit: q.limit ?? 50, offset: q.offset ?? 0 })}`, { signal }));
  return { items: asArr(d.items).map(crmCustomerOf).filter((c) => c.id), total: int(d.total), limit: int(d.limit, 50), offset: int(d.offset) };
}
export async function getCrmCustomer(id: string, signal?: AbortSignal): Promise<CrmCustomerDetail> {
  return crmCustomerDetailOf(await http(`/crm/customers/${enc(id)}`, { signal }));
}

export type ContactInput = { type: string; value: string; label?: string; primary?: boolean; verified?: boolean };
const contactBody = (c: ContactInput): Dict => ({ contact_type: c.type, value: c.value.trim(), label: (c.label ?? "").trim(), is_primary: !!c.primary, is_verified: !!c.verified, source: "operator" });
// No user_id: the backend links the LexGo account itself (contract §4).
export type CustomerInput = { name: string; language?: string; region?: string; source?: string; notes?: string; contacts?: ContactInput[] };
export const customerBody = (c: CustomerInput): Dict => ({
  name: c.name.trim(),
  preferred_language: c.language || "uz_latn",
  region: (c.region ?? "").trim(),
  source: c.source || "manual",
  notes: (c.notes ?? "").trim(),
  contacts: (c.contacts ?? []).filter((x) => x.value.trim()).map(contactBody),
});
export async function createCrmCustomer(c: CustomerInput): Promise<CrmCustomerDetail> {
  return crmCustomerDetailOf(await http("/crm/customers", { method: "POST", body: JSON.stringify(customerBody(c)) }));
}
export async function updateCrmCustomer(id: string, patch: Partial<{ name: string; language: string; region: string; status: string; notes: string }>): Promise<CrmCustomerDetail> {
  const body: Dict = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.language !== undefined) body.preferred_language = patch.language;
  if (patch.region !== undefined) body.region = patch.region.trim();
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.notes !== undefined) body.notes = patch.notes.trim();
  return crmCustomerDetailOf(await http(`/crm/customers/${enc(id)}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function addCrmContact(customerId: string, c: ContactInput): Promise<CrmContact> {
  return crmContactOf(await http(`/crm/customers/${enc(customerId)}/contacts`, { method: "POST", body: JSON.stringify(contactBody(c)) }));
}
export async function updateCrmContact(customerId: string, contactId: string, patch: Partial<{ value: string; label: string; primary: boolean; verified: boolean }>): Promise<CrmContact> {
  const body: Dict = {};
  if (patch.value !== undefined) body.value = patch.value.trim();
  if (patch.label !== undefined) body.label = patch.label.trim();
  if (patch.primary !== undefined) body.is_primary = patch.primary;
  if (patch.verified !== undefined) body.is_verified = patch.verified;
  return crmContactOf(await http(`/crm/customers/${enc(customerId)}/contacts/${enc(contactId)}`, { method: "PATCH", body: JSON.stringify(body) }));
}
// DELETE archives the contact (§4.2); it is never removed for good.
export async function archiveCrmContact(customerId: string, contactId: string): Promise<void> {
  await http(`/crm/customers/${enc(customerId)}/contacts/${enc(contactId)}`, { method: "DELETE" });
}
export async function mergeCrmCustomers(targetId: string, sourceIds: string[], reason: string): Promise<Dict> {
  return asDict(await http("/crm/customers/merge", { method: "POST", body: JSON.stringify({ target_customer_id: targetId, source_customer_ids: sourceIds, reason: reason.trim() }) }));
}

// ── Leads ──────────────────────────────────────────────────────────────

export const LEAD_ACTIONS = ["view_timeline", "add_activity", "run_ai", "claim", "edit", "change_status", "set_next_action", "manage_watchers", "prepare_conversion", "start_call", "assign", "transfer", "resolve_duplicate"] as const;

export type CrmLead = {
  id: string;
  workId: string;
  customerId: string;
  customer: CrmCustomerBrief | null;
  clientUserId: string;
  source: string;
  title: string;
  problem: string;
  category: string;
  region: string;
  urgency: string;
  score: string;
  status: string;
  language: string;
  operatorId: string;
  operator: CrmPerson | null;
  nextActionAt: string;
  claimedAt: string;
  duplicateStatus: string;
  // The backend's readable view (contract 2026-10-27 §12).
  sections: DetailSection[];
  duplicateOfId: string;
  convertedServiceId: string;
  convertedOrderId: string;
  lostReason: string;
  details: Dict;
  watchers: CrmPerson[];
  actions: string[];
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string;
};

export function crmLeadOf(v: unknown): CrmLead {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    workId: asStr(d.work_id),
    customerId: asStr(d.customer_id),
    customer: crmCustomerBriefOf(d.customer),
    clientUserId: asStr(d.client_user_id),
    source: asStr(d.source),
    title: asStr(d.title),
    problem: asStr(d.problem),
    category: asStr(d.category),
    region: asStr(d.region),
    urgency: asStr(d.urgency),
    score: asStr(d.score),
    status: asStr(d.status),
    language: asStr(d.preferred_language),
    operatorId: asStr(d.assigned_operator_user_id),
    operator: crmPersonOf(d.assigned_operator),
    nextActionAt: asStr(d.next_action_at),
    claimedAt: asStr(d.claimed_at),
    duplicateStatus: asStr(d.duplicate_status),
    sections: detailSectionsOf(d.detail_sections),
    duplicateOfId: asStr(d.duplicate_of_lead_id),
    convertedServiceId: asStr(d.converted_service_id),
    convertedOrderId: asStr(d.converted_order_id),
    lostReason: asStr(d.lost_reason),
    details: asDict(d.details),
    watchers: asArr(d.watchers)
      .map(crmPersonOf)
      .filter((x): x is CrmPerson => !!x),
    actions: asArr(d.allowed_actions).map((x) => asStr(x)),
    lockVersion: int(d.lock_version),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
    closedAt: asStr(d.closed_at),
  };
}

// Only what the backend allows on this very lead (§4.3).
export const leadCan = (lead: Pick<CrmLead, "actions"> | null, action: (typeof LEAD_ACTIONS)[number] | string): boolean => !!lead && lead.actions.includes(action);

export type LeadQuery = {
  status?: string;
  score?: string;
  source?: string;
  category?: string;
  region?: string;
  q?: string;
  operator?: string;
  queueOnly?: boolean;
  mineOnly?: boolean;
  nextFrom?: string;
  nextTo?: string;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
  offset?: number;
};
export type LeadPage = CrmPage<CrmLead> & { counts: Record<string, number> };

export const leadQueryString = (q: LeadQuery): string =>
  qs({
    status: q.status,
    score: q.score,
    source: q.source,
    category: q.category,
    region: q.region,
    q: q.q?.trim(),
    assigned_operator_user_id: q.operator,
    queue_only: q.queueOnly,
    mine_only: q.mineOnly,
    next_action_from: q.nextFrom,
    next_action_to: q.nextTo,
    created_from: q.createdFrom,
    created_to: q.createdTo,
    limit: q.limit ?? 50,
    offset: q.offset ?? 0,
  });

export async function listCrmLeads(q: LeadQuery = {}, signal?: AbortSignal): Promise<LeadPage> {
  const d = asDict(await http(`/crm/leads${leadQueryString(q)}`, { signal }));
  const c = asDict(d.counts);
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(c)) counts[k] = int(v);
  return { items: asArr(d.items).map(crmLeadOf).filter((l) => l.id), total: int(d.total), limit: int(d.limit, 50), offset: int(d.offset), counts };
}
export async function getCrmLead(id: string, signal?: AbortSignal): Promise<CrmLead> {
  return crmLeadOf(await http(`/crm/leads/${enc(id)}`, { signal }));
}

// Contract 2026-10-27 §7: always one CRM customer; no category, no
// client_user_id, no inline customer.
export type LeadInput = {
  customerId: string;
  source?: string;
  title: string;
  problem?: string;
  region?: string;
  urgency?: string;
  language?: string;
  nextActionAt?: string;
  operatorId?: string;
  forceCreate?: boolean;
};
export function leadCreateBody(l: LeadInput): Dict {
  const body: Dict = {
    customer_id: l.customerId,
    source: l.source || "manual",
    title: l.title.trim(),
    problem: (l.problem ?? "").trim(),
    region: (l.region ?? "").trim(),
    urgency: l.urgency || "normal",
    preferred_language: l.language || "uz_latn",
    details: {},
    next_action_at: l.nextActionAt || null,
    assigned_operator_user_id: l.operatorId || null,
    force_create: !!l.forceCreate,
  };
  return body;
}
export async function createCrmLead(l: LeadInput): Promise<CrmLead> {
  return crmLeadOf(await http("/crm/leads", { method: "POST", body: JSON.stringify(leadCreateBody(l)) }));
}

// Every write below carries the lead's lock_version as the backend last gave it.
type Locked = Pick<CrmLead, "id" | "lockVersion">;
const leadWrite = async (lead: Locked, path: string, body: Dict, method = "POST"): Promise<CrmLead> =>
  crmLeadOf(await http(`/crm/leads/${enc(lead.id)}${path}`, { method, body: JSON.stringify({ ...body, expected_lock_version: lead.lockVersion }) }));

export type LeadPatch = Partial<{ title: string; problem: string; region: string; urgency: string; score: string; language: string; nextActionAt: string | null }>;
export function leadPatchBody(p: LeadPatch): Dict {
  const body: Dict = {};
  if (p.title !== undefined) body.title = p.title.trim();
  if (p.problem !== undefined) body.problem = p.problem.trim();
  if (p.region !== undefined) body.region = p.region.trim();
  if (p.urgency !== undefined) body.urgency = p.urgency;
  if (p.score !== undefined) body.score = p.score;
  if (p.language !== undefined) body.preferred_language = p.language;
  if (p.nextActionAt !== undefined) body.next_action_at = p.nextActionAt || null;
  return body;
}
export const updateCrmLead = (lead: Locked, p: LeadPatch) => leadWrite(lead, "", leadPatchBody(p), "PATCH");
export const changeLeadStatus = (lead: Locked, status: string, reason: string, nextActionAt?: string | null) =>
  leadWrite(lead, "/status", { status, reason: reason.trim(), next_action_at: nextActionAt || null });
export const assignLead = (lead: Locked, operatorId: string, reason: string) => leadWrite(lead, "/assign", { operator_user_id: operatorId, reason: reason.trim() });
// A transfer always says why (§12).
export const transferLead = (lead: Locked, operatorId: string, reason: string) => {
  if (!reason.trim()) throw new ApiError(422, "transfer reason required", undefined, { code: "crm_transfer_reason_required" });
  return leadWrite(lead, "/transfer", { operator_user_id: operatorId, reason: reason.trim() });
};
// Atomic: 409 crm_lead_already_claimed when someone else was faster.
export async function claimCrmLead(id: string): Promise<CrmLead> {
  return crmLeadOf(await http(`/crm/leads/${enc(id)}/claim`, { method: "POST" }));
}
export async function resolveDuplicate(id: string, decision: "not_duplicate" | "duplicate", reason: string, duplicateOfId = ""): Promise<CrmLead> {
  const body: Dict = { decision, reason: reason.trim() };
  if (decision === "duplicate") body.duplicate_of_lead_id = duplicateOfId;
  return crmLeadOf(await http(`/crm/leads/${enc(id)}/duplicate-resolution`, { method: "POST", body: JSON.stringify(body) }));
}
export async function addLeadWatcher(id: string, userId: string): Promise<CrmLead> {
  return crmLeadOf(await http(`/crm/leads/${enc(id)}/watchers`, { method: "POST", body: JSON.stringify({ user_id: userId }) }));
}
export async function removeLeadWatcher(id: string, userId: string): Promise<CrmLead | null> {
  const d = await http(`/crm/leads/${enc(id)}/watchers/${enc(userId)}`, { method: "DELETE" });
  return asStr(asDict(d).id) ? crmLeadOf(d) : null;
}

// ── Timeline ───────────────────────────────────────────────────────────

export const ACTIVITY_TYPES = ["note", "call_note", "message", "meeting", "follow_up", "document", "system"] as const;
export type CrmActivity = { id: string; leadId: string; customerId: string; actorId: string; actor: CrmPerson | null; type: string; title: string; body: string; payload: Dict; visibility: string; createdAt: string };
export function crmActivityOf(v: unknown): CrmActivity {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    leadId: asStr(d.lead_id),
    customerId: asStr(d.customer_id),
    actorId: asStr(d.actor_user_id),
    actor: crmPersonOf(d.actor),
    type: asStr(d.activity_type),
    title: asStr(d.title),
    body: asStr(d.body),
    payload: asDict(d.payload),
    visibility: asStr(d.visibility),
    createdAt: asStr(d.created_at),
  };
}
// Live: a bare array; a paged object is read too.
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : asArr(asDict(v).items));
// Oldest first, whatever order arrives (§12: chronological).
export const chronological = (a: CrmActivity[]): CrmActivity[] => [...a].sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
export async function getLeadTimeline(id: string, signal?: AbortSignal): Promise<CrmActivity[]> {
  return chronological(listOf(await http(`/crm/leads/${enc(id)}/timeline?limit=100&offset=0`, { signal })).map(crmActivityOf));
}
export async function getCustomerTimeline(id: string, signal?: AbortSignal): Promise<CrmActivity[]> {
  return chronological(listOf(await http(`/crm/customers/${enc(id)}/timeline?limit=100&offset=0`, { signal })).map(crmActivityOf));
}
export async function addLeadActivity(id: string, a: { type: string; title?: string; body: string; payload?: Dict }): Promise<CrmActivity> {
  return crmActivityOf(await http(`/crm/leads/${enc(id)}/activities`, { method: "POST", body: JSON.stringify({ activity_type: a.type, title: (a.title ?? "").trim(), body: a.body.trim(), payload: a.payload ?? {} }) }));
}

// ── Conversion ─────────────────────────────────────────────────────────

// What a draft order is made of, chosen by name (never typed ids): a
// catalog service, the sellers offering it, a published package.
export type ConvOption = { id: string; title: string; sub: string };
const LOOKUP_PAGE = 30;
export async function lookupServices(q: string, offset: number, signal?: AbortSignal): Promise<{ items: ConvOption[]; hasMore: boolean }> {
  const d = await http(`/services${qs({ q: q.trim(), catalog_only: true, limit: LOOKUP_PAGE, offset })}`, { signal });
  const items = (Array.isArray(d) ? d : asArr(asDict(d).items))
    .map((v) => {
      const x = asDict(v);
      return { id: asStr(x.id), title: asStr(x.title ?? x.name), sub: [asStr(x.category_title), asStr(x.subcategory)].filter(Boolean).join(" · ") };
    })
    .filter((x) => x.id && x.title);
  return { items, hasMore: items.length >= LOOKUP_PAGE };
}
export async function lookupSellers(serviceId: string, q: string, offset: number, signal?: AbortSignal): Promise<{ items: ConvOption[]; hasMore: boolean }> {
  const d = asDict(await http(`/marketplace/lawyers${qs({ q: q.trim(), service_id: serviceId || undefined, verified: true, limit: LOOKUP_PAGE, offset })}`, { signal }));
  const items = asArr(d.items)
    .map((v) => {
      const x = asDict(v);
      const rating = Number(x.rating);
      return { id: asStr(x.user_id), title: asStr(x.display_name ?? x.name ?? x.lawyer_name), sub: [asStr(x.region || x.district), rating > 0 ? `★ ${rating.toFixed(1)}` : ""].filter(Boolean).join(" · ") };
    })
    .filter((x) => x.id && x.title);
  return { items, hasMore: offset + items.length < int(d.total) };
}
export async function lookupPackages(q: string, signal?: AbortSignal): Promise<{ items: ConvOption[]; hasMore: boolean }> {
  const d = await http(`/service-packages`, { signal });
  const needle = q.trim().toLowerCase();
  const items = (Array.isArray(d) ? d : asArr(asDict(d).items ?? asDict(d).packages))
    .map((v) => {
      const x = asDict(v);
      return { id: asStr(x.id), title: asStr(x.title ?? x.name), sub: asStr(x.tariff_title ?? x.subtitle ?? x.description).slice(0, 80) };
    })
    .filter((x) => x.id && x.title && (!needle || x.title.toLowerCase().includes(needle)));
  return { items, hasMore: false };
}

export type ConversionInput = { serviceId?: string; packageId?: string; sellerUserId?: string; price?: number | null; currency?: string; note?: string };
export async function prepareConversion(id: string, c: ConversionInput): Promise<Dict> {
  return asDict(
    await http(`/crm/leads/${enc(id)}/conversion`, {
      method: "POST",
      body: JSON.stringify({ service_id: c.serviceId || null, package_id: c.packageId || null, seller_user_id: c.sellerUserId || null, price: c.price ?? null, currency: c.currency || "UZS", note: (c.note ?? "").trim() }),
    }),
  );
}

// ── AI Copilot ─────────────────────────────────────────────────────────

export const AI_RUN_TYPES = ["full_analysis", "summary", "qualification", "service_match", "draft_reply", "call_script", "follow_up", "offer"] as const;
export const AI_LANGUAGES = ["auto", "uz_latn", "uz_cyrl", "ru"] as const;
export type CrmAiRun = { id: string; leadId: string; operatorId: string; runType: string; language: string; instruction: string; status: string; model: string; output: Dict; error: string; createdAt: string; completedAt: string };
export function crmAiRunOf(v: unknown): CrmAiRun {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    leadId: asStr(d.lead_id),
    operatorId: asStr(d.operator_user_id),
    runType: asStr(d.run_type),
    language: asStr(d.language),
    instruction: asStr(d.instruction),
    status: asStr(d.status),
    model: asStr(d.model),
    output: asDict(d.output),
    error: asStr(d.error),
    createdAt: asStr(d.created_at),
    completedAt: asStr(d.completed_at),
  };
}
export const aiRunDone = (r: Pick<CrmAiRun, "status"> | null): boolean => !!r && (r.status === "completed" || r.status === "failed");
export async function startAiRun(leadId: string, runType: string, language: string, instruction = ""): Promise<CrmAiRun> {
  return crmAiRunOf(await http(`/crm/leads/${enc(leadId)}/ai/runs`, { method: "POST", body: JSON.stringify({ run_type: runType, language, instruction: instruction.trim() }) }));
}
export async function getAiRun(id: string, signal?: AbortSignal): Promise<CrmAiRun> {
  return crmAiRunOf(await http(`/crm/ai/runs/${enc(id)}`, { signal }));
}
export async function listAiRuns(leadId: string, signal?: AbortSignal): Promise<CrmAiRun[]> {
  return listOf(await http(`/crm/leads/${enc(leadId)}/ai/runs?limit=20`, { signal })).map(crmAiRunOf);
}
// Only the paths the operator ticked, with their edits; the lead's lock.
export function aiApplyBody(selected: string[], overrides: Record<string, unknown>, lockVersion: number): Dict {
  const paths = [...new Set(selected)];
  const kept: Dict = {};
  for (const [k, v] of Object.entries(overrides)) if (paths.includes(k)) kept[k] = v;
  return { selected_paths: paths, overrides: kept, expected_lock_version: lockVersion };
}
export async function applyAiRun(runId: string, selected: string[], overrides: Record<string, unknown>, lockVersion: number): Promise<Dict> {
  return asDict(await http(`/crm/ai/runs/${enc(runId)}/apply`, { method: "POST", body: JSON.stringify(aiApplyBody(selected, overrides, lockVersion)) }));
}

// The suggestion cards a completed run offers, each with the path to apply.
// Drafts are text to copy/edit; they apply only to fields the backend owns.
export type AiCard = { path: string; kind: "text" | "chips" | "list" | "candidates" | "draft" | "number" | "next"; value: unknown; applicable: boolean };
const APPLICABLE = new Set(["summary", "category", "subcategory", "urgency", "next_action", "next_action.at", "next_action.note"]);
export function aiCardsOf(output: Dict): AiCard[] {
  const out: AiCard[] = [];
  const push = (path: string, kind: AiCard["kind"], value: unknown) => {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return;
    out.push({ path, kind, value, applicable: APPLICABLE.has(path) });
  };
  push("summary", "text", output.summary);
  push("category", "text", output.category);
  push("subcategory", "text", output.subcategory);
  push("urgency", "text", output.urgency);
  push("risk_flags", "chips", output.risk_flags);
  push("missing_information", "list", output.missing_information);
  push("questions", "list", output.questions);
  push("service_candidates", "candidates", output.service_candidates);
  push("specialist_candidates", "candidates", output.specialist_candidates);
  push("reply_drafts", "draft", output.reply_drafts);
  push("call_script", "draft", output.call_script);
  push("follow_up", "draft", output.follow_up);
  push("offer_draft", "draft", output.offer_draft);
  const next = asDict(output.next_action);
  if (Object.keys(next).length) {
    if (next.at) out.push({ path: "next_action.at", kind: "next", value: next.at, applicable: true });
    if (next.note ?? next.text ?? next.action) out.push({ path: "next_action.note", kind: "text", value: next.note ?? next.text ?? next.action, applicable: APPLICABLE.has("next_action.note") });
  } else push("next_action", "text", output.next_action);
  return out;
}

// ── Calls ──────────────────────────────────────────────────────────────

export type CrmCall = { id: string; status: string; direction: string; purpose: string; summary: string; startedAt: string; endedAt: string; durationSec: number | null; recordingUrl: string; transcript: unknown[]; createdAt: string };
export function crmCallOf(v: unknown, recordingAccess: boolean): CrmCall {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    status: asStr(d.status),
    direction: asStr(d.direction),
    purpose: asStr(d.purpose),
    summary: asStr(d.summary),
    startedAt: asStr(d.started_at),
    endedAt: asStr(d.ended_at ?? d.completed_at),
    durationSec: num(d.duration_seconds ?? d.duration_sec),
    // Never shown, never kept, without recording_access (§7).
    recordingUrl: recordingAccess ? asStr(d.recording_url) : "",
    transcript: recordingAccess ? asArr(d.transcript) : [],
    createdAt: asStr(d.created_at),
  };
}
export async function listLeadCalls(id: string, recordingAccess: boolean, signal?: AbortSignal): Promise<CrmCall[]> {
  return listOf(await http(`/crm/leads/${enc(id)}/calls`, { signal })).map((x) => crmCallOf(x, recordingAccess));
}
export async function startLeadCall(id: string, input: { contactId?: string; purpose: string }, recordingAccess: boolean): Promise<CrmCall> {
  return crmCallOf(await http(`/crm/leads/${enc(id)}/calls`, { method: "POST", body: JSON.stringify({ contact_id: input.contactId || null, direction: "outbound", purpose: input.purpose.trim() }) }), recordingAccess);
}

// ── Metrics and analytics ──────────────────────────────────────────────

export type CrmMetrics = { operator: CrmPerson | null; total: number; active: number; won: number; closed: number; conversion: number; firstResponseMin: number | null; overdue: number; statusCounts: Record<string, number> };
const countsOf = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(asDict(v))) out[k] = int(x);
  return out;
};
// Revenue is never read from this answer: operators never see it (§8).
export function crmMetricsOf(v: unknown): CrmMetrics {
  const d = asDict(v);
  return {
    operator: crmPersonOf(d.operator),
    total: int(d.total),
    active: int(d.active),
    won: int(d.won),
    closed: int(d.closed),
    conversion: num(d.conversion_percent) ?? 0,
    firstResponseMin: num(d.average_first_response_minutes),
    overdue: int(d.overdue_next_actions),
    statusCounts: countsOf(d.status_counts),
  };
}
export async function getMyCrmMetrics(range: { from?: string; to?: string } = {}, signal?: AbortSignal): Promise<CrmMetrics> {
  return crmMetricsOf(await http(`/crm/me/metrics${qs({ date_from: range.from, date_to: range.to })}`, { signal }));
}

export type CrmAnalytics = { totalLeads: number; statusCounts: Record<string, number>; sourceCounts: Record<string, number>; operators: { operator: CrmPerson | null; total: number; won: number; conversion: number }[]; paidRevenue: number | null; currency: string; revenueVisible: boolean };
export function crmAnalyticsOf(v: unknown): CrmAnalytics {
  const d = asDict(v);
  const visible = bool(d.revenue_visible);
  return {
    totalLeads: int(d.total_leads),
    statusCounts: countsOf(d.status_counts),
    sourceCounts: countsOf(d.source_counts),
    operators: asArr(d.operators).map((x) => {
      const o = asDict(x);
      return { operator: crmPersonOf(o.operator) ?? (asStr(o.operator_user_id) ? { id: asStr(o.operator_user_id), name: "", lexgoId: "", role: "" } : null), total: int(o.total), won: int(o.won), conversion: num(o.conversion_percent) ?? 0 };
    }),
    paidRevenue: visible ? num(d.paid_revenue) : null,
    currency: asStr(d.currency) || "UZS",
    revenueVisible: visible,
  };
}
export async function getCrmAnalytics(range: { from?: string; to?: string } = {}, signal?: AbortSignal): Promise<CrmAnalytics> {
  return crmAnalyticsOf(await http(`/crm/analytics${qs({ date_from: range.from, date_to: range.to })}`, { signal }));
}

// ── Exports ────────────────────────────────────────────────────────────

export const EXPORT_SCOPES = ["leads", "customers", "activities"] as const;
export type CrmExport = { id: string; scope: string; status: string; statusUrl: string; downloadUrl: string; error: string; createdAt: string; expiresAt: string; rows: number | null };
export function crmExportOf(v: unknown): CrmExport {
  const d = asDict(v);
  return { id: asStr(d.id ?? d.export_id), scope: asStr(d.scope), status: asStr(d.status) || "queued", statusUrl: asStr(d.status_url), downloadUrl: asStr(d.download_url), error: asStr(d.error), createdAt: asStr(d.created_at), expiresAt: asStr(d.expires_at), rows: num(d.row_count ?? d.rows) };
}
export const exportDone = (e: Pick<CrmExport, "status">): boolean => ["ready", "failed", "expired"].includes(e.status);
export type ExportInput = { scope: string; from?: string; to?: string; status?: string; source?: string; operator?: string; q?: string };
export async function createCrmExport(e: ExportInput): Promise<CrmExport> {
  return crmExportOf(
    await http("/crm/exports", {
      method: "POST",
      body: JSON.stringify({ scope: e.scope, date_from: e.from || null, date_to: e.to || null, status: e.status || null, source: e.source || null, assigned_operator_user_id: e.operator || null, q: e.q?.trim() || null }),
    }),
  );
}
export async function getCrmExport(id: string, signal?: AbortSignal): Promise<CrmExport> {
  return crmExportOf(await http(`/crm/exports/${enc(id)}`, { signal }));
}
export async function downloadCrmExport(id: string): Promise<{ blob: Blob; name: string }> {
  return httpBlobNamed(`/crm/exports/${enc(id)}/download`);
}

// ── Templates ──────────────────────────────────────────────────────────

export const TEMPLATE_TYPES = ["chat", "telegram", "sms", "call_script", "follow_up", "rejection", "offer"] as const;
export type CrmTemplate = { id: string; title: string; type: string; language: string; content: string; tags: string[]; status: string };
export function crmTemplateOf(v: unknown): CrmTemplate {
  const d = asDict(v);
  return { id: asStr(d.id), title: asStr(d.title), type: asStr(d.template_type), language: asStr(d.language), content: asStr(d.content), tags: asArr(d.tags).map((x) => asStr(x)), status: asStr(d.status) || "active" };
}
export async function listCrmTemplates(q: { type?: string; language?: string; q?: string } = {}, signal?: AbortSignal): Promise<CrmTemplate[]> {
  return listOf(await http(`/crm/operator-templates${qs({ template_type: q.type, language: q.language, q: q.q?.trim() })}`, { signal }))
    .map(crmTemplateOf)
    .filter((x) => x.id);
}
export async function createCrmTemplate(t: { title: string; type: string; language: string; content: string; tags?: string[] }): Promise<CrmTemplate> {
  return crmTemplateOf(await http("/crm/operator-templates", { method: "POST", body: JSON.stringify({ title: t.title.trim(), template_type: t.type, language: t.language, content: t.content, tags: t.tags ?? [], status: "active" }) }));
}

// ── Errors ─────────────────────────────────────────────────────────────

export const CRM_ERROR_CODES = [
  "crm_access_denied",
  "crm_permission_required",
  "crm_customer_not_found",
  "crm_lead_not_found",
  "crm_operator_scope_denied",
  "crm_operator_invalid",
  "crm_lead_already_claimed",
  "crm_lead_version_conflict",
  "crm_status_transition_invalid",
  "crm_duplicate_target_invalid",
  "crm_customer_account_required",
  "crm_ai_run_active",
  "crm_ai_run_not_completed",
  "crm_ai_path_invalid",
  "crm_export_scope_denied",
  "crm_export_not_ready",
  "crm_export_not_found",
  "crm_phone_contact_required",
  "crm_call_scope_denied",
] as const;
export const crmCode = (e: unknown): string => (e instanceof ApiError ? (e.code ?? "") : "");
export const isVersionConflict = (e: unknown): boolean => crmCode(e) === "crm_lead_version_conflict";
export const isClaimRace = (e: unknown): boolean => crmCode(e) === "crm_lead_already_claimed" || (e instanceof ApiError && e.status === 409 && !crmCode(e));
export const isCrmDenied = (e: unknown): boolean => e instanceof ApiError && (e.status === 403 || crmCode(e) === "crm_access_denied" || crmCode(e) === "crm_permission_required");

// ── Realtime ───────────────────────────────────────────────────────────

// What a /ws/users/me event means for the CRM screens (§10). Nothing is
// appended from an event: the named caches refetch.
export type CrmInvalidate = "all" | "queue" | "counts" | "lists" | "lead" | "metrics" | "customer" | "ai" | "export";
export type CrmEvent = { name: string; leadId: string; runId: string; exportId: string; customerId: string; invalidate: CrmInvalidate[] };
const pick = (ev: Dict, ...keys: string[]): string => {
  const pools = [ev, asDict(ev.data), asDict(ev.payload), asDict(asDict(ev.notification).data)];
  for (const k of keys) for (const p of pools) if (asStr(p[k])) return asStr(p[k]);
  return "";
};
export function crmEventOf(raw: unknown): CrmEvent | null {
  const ev = asDict(raw);
  let name = asStr(ev.event);
  if (name === "notification.created") name = asStr(asDict(asDict(ev.notification).data).event) || name;
  if (!name.startsWith("crm.")) return null;
  const base = { name, leadId: pick(ev, "lead_id"), runId: pick(ev, "run_id", "ai_run_id"), exportId: pick(ev, "export_id"), customerId: pick(ev, "customer_id") };
  const map: Record<string, CrmInvalidate[]> = {
    "crm.resync": ["all"],
    "crm.lead.created": ["queue", "counts", "lists", "customer"],
    "crm.lead.claimed": ["queue", "counts", "lists", "lead"],
    "crm.lead.assigned": ["lead", "lists", "counts", "metrics"],
    "crm.lead.transferred": ["lead", "lists", "counts", "metrics"],
    "crm.lead.status_changed": ["lead", "lists", "counts", "metrics"],
    "crm.lead.watcher_added": ["lead"],
    "crm.lead.next_action_due": ["lead", "lists", "metrics"],
    "crm.ai.completed": ["ai"],
    "crm.ai.failed": ["ai"],
    "crm.export.ready": ["export"],
  };
  return { ...base, invalidate: map[name] ?? (base.leadId ? ["lead", "lists"] : ["lists"]) };
}
