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

// The six fixed business statuses (CRM contract 13cb257 §6). Their title,
// colour, order and transitions come from GET /crm/meta; the keys never
// change and no other column exists.
export const CRM_STATUSES = ["new", "qualified", "proposal", "decision_pending", "won", "rejected"] as const;
export type CrmStatusInfo = { key: string; title: string; color: string; order: number; isFinal: boolean };
// §20: every permission the UI gates on.
export const CRM_PERMS = [
  "crm.customers.view",
  "crm.customers.manage",
  "crm.customers.merge",
  "crm.leads.view",
  "crm.leads.view_all",
  "crm.leads.manage",
  "crm.leads.claim",
  "crm.leads.assign",
  "crm.ai.use",
  "crm.calls.start",
  "crm.calls.recordings.view",
  "crm.live_calls.view",
  "crm.sms.manage",
  "crm.analytics.self",
  "crm.analytics.global",
  "crm.revenue.view",
  "crm.automation.manage",
  "crm.exports.create",
  "crm.templates.manage",
] as const;
export type CrmPerm = (typeof CRM_PERMS)[number];

export type CrmTelephony = { provider: string; enabled: boolean; recordingConsentRequired: boolean; liveTranscription: boolean; recordingAccess: boolean };
export type CrmMeta = {
  // Column keys in the board's order.
  statuses: string[];
  statusInfo: CrmStatusInfo[];
  transitions: Record<string, string[]>;
  scores: string[];
  languages: string[];
  contactTypes: string[];
  sources: string[];
  permissions: string[];
  scope: string;
  revenueVisible: boolean;
  telephony: CrmTelephony;
  lifecycles: string[];
  // Automation (§16): the actions the backend offers and the no-answer SMS delay.
  automationActions: string[];
  noAnswerSmsDelaySec: number | null;
  smsApprovalDefault: boolean;
};

export function crmMetaOf(v: unknown): CrmMeta {
  const d = asDict(v);
  const rows = asArr(d.statuses).map(asDict).filter((r) => asStr(r.key));
  const transitions: Record<string, string[]> = {};
  for (const r of rows) transitions[asStr(r.key)] = asArr(r.transitions).map((x) => asStr(x)).filter(Boolean);
  const statusInfo = rows.map(statusInfoOf).sort((a, b) => a.order - b.order);
  const tel = asDict(d.telephony);
  const auto = asDict(d.automation);
  return {
    statuses: statusInfo.map((x) => x.key),
    statusInfo,
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
      liveTranscription: tel.live_transcription === true,
      recordingAccess: bool(tel.recording_access),
    },
    lifecycles: asArr(d.customer_lifecycles).map((x) => asStr(x)).filter(Boolean),
    automationActions: asArr(auto.actions).map((x) => asStr(x)).filter(Boolean),
    noAnswerSmsDelaySec: num(auto.no_answer_sms_delay_seconds),
    smsApprovalDefault: auto.sms_operator_approval_default !== false,
  };
}

const HEX = /^#[0-9a-f]{3,8}$/i;
export function statusInfoOf(r: Dict, i = 0): CrmStatusInfo {
  const order = Number(r.order);
  return { key: asStr(r.key), title: asStr(r.title).trim(), color: HEX.test(asStr(r.color)) ? asStr(r.color) : "", order: Number.isFinite(order) ? order : (i + 1) * 10, isFinal: r.is_final === true };
}
export const isFinalStatus = (meta: CrmMeta | null, key: string): boolean => !!meta?.statusInfo.find((s) => s.key === key)?.isFinal;
// The journey a lead walks: the open columns in order, then where it ended.
export function journeyOf(meta: CrmMeta | null, status: string): string[] {
  const all = meta?.statusInfo ?? [];
  const open = all.filter((s) => !s.isFinal).map((s) => s.key);
  const end = all.find((s) => s.key === status && s.isFinal) ?? all.find((s) => s.isFinal);
  return end ? [...open, end.key] : open;
}

export const crmCan = (meta: CrmMeta | null, perm: CrmPerm): boolean => !!meta && meta.permissions.includes(perm);
// Global analytics: the permission (§18, §20); revenue inside it only with
// revenue_visible.
export const crmGlobalAnalytics = (meta: CrmMeta | null): boolean => crmCan(meta, "crm.analytics.global");
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
// lifecycle (§2): "prospect" until the first confirmed paid purchase, then
// "customer" (becameCustomerAt).
export type CrmCustomer = CrmCustomerBrief & { status: string; source: string; lifecycle: string; becameCustomerAt: string; leadCount: number; activeLeadCount: number; createdAt: string; updatedAt: string };
// Account linking (§8): automatic by verified phone; the backend says what
// the operator must do when it is not linked yet.
export type CrmLinking = { status: string; linked: boolean; automatic: boolean; requiredAction: string };
export type CrmContact = { id: string; type: string; value: string; label: string; primary: boolean; verified: boolean; status: string; source: string; createdAt: string };
export type CrmOrderRef = { id: string; workId: string; serviceId: string; serviceTitle: string; status: string; paymentStatus: string; createdAt: string };
export type CrmCustomerDetail = CrmCustomer & { notes: string; contacts: CrmContact[]; leads: CrmLead[]; orders: CrmOrderRef[]; activityCount: number; sections: DetailSection[]; reused: boolean; linking: CrmLinking };

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
  return { ...b, status: asStr(d.status), source: asStr(d.source), lifecycle: asStr(d.lifecycle) || "prospect", becameCustomerAt: asStr(d.became_customer_at), leadCount: int(d.lead_count), activeLeadCount: int(d.active_lead_count), createdAt: asStr(d.created_at), updatedAt: asStr(d.updated_at) };
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
      return { id: asStr(o.id), workId: asStr(o.work_id), serviceId: asStr(o.service_id), serviceTitle: asStr(o.service_title), status: asStr(o.status), paymentStatus: asStr(o.payment_status), createdAt: asStr(o.created_at) };
    }),
    activityCount: int(d.activity_count),
    sections: detailSectionsOf(d.detail_sections),
    // POST /crm/customers (gaps closed §19): whether an existing customer
    // came back, and what the operator must do to link the LexGo account.
    reused: d.reused === true,
    linking: linkingOf(d),
  };
}

function linkingOf(d: Dict): CrmLinking {
  const l = asDict(d.account_linking);
  const status = asStr(l.status) || (asStr(d.user_id) || d.is_lexgo_user === true ? "linked" : "unlinked");
  return { status, linked: status === "linked", automatic: l.automatic_by_verified_phone !== false, requiredAction: asStr(l.required_action).trim() };
}
// The last active contact of a customer cannot be archived (§8).
export const activeContacts = (cs: readonly CrmContact[]): CrmContact[] => cs.filter((c) => c.status !== "archived");
export const canArchiveContact = (cs: readonly CrmContact[], id: string): boolean => activeContacts(cs).some((c) => c.id === id) && activeContacts(cs).length > 1;

// ── detail_sections: the backend's readable view of a record ──
// Never raw JSON (contract §10): each section is a card of labelled values;
// a group nests, a list repeats. The values can still be codes, dates or
// ids — the UI translates, formats or drops them (DetailSections).
// "display" is the backend's ready text for the value (gaps closed §18);
// "value" stays the machine value.
export type DetailItem = { key: string; label: string; type: "text" | "number" | "boolean" | "datetime" | "group" | "list"; value: unknown; display: string; items: DetailItem[] };
export type DetailSection = { key: string; title: string; items: DetailItem[] };
const DETAIL_TYPES = new Set(["text", "number", "boolean", "datetime", "group", "list"]);
function detailItemOf(v: unknown): DetailItem {
  const d = asDict(v);
  const type = asStr(d.value_type);
  return { key: asStr(d.key), label: asStr(d.label), type: (DETAIL_TYPES.has(type) ? type : "text") as DetailItem["type"], value: d.value ?? null, display: asStr(d.display_value).trim(), items: asArr(d.items).map(detailItemOf) };
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
  // Lead cycles (§2): the current one and its number; old ones live in
  // GET …/history with their final status.
  cycleNumber: number;
  cycle: CrmCycle | null;
  // The prepared LexGo order and its payment state (§9, §12).
  order: CrmLeadOrder | null;
};
export type CrmCycle = { id: string; sequence: number; inquiry: string; source: string; status: string; initialStatus: string; terminalStatus: string; orderId: string; paymentId: string; openedAt: string; closedAt: string; reason: string };
export function crmCycleOf(v: unknown): CrmCycle | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  return { id, sequence: int(d.sequence, 1), inquiry: asStr(d.inquiry), source: asStr(d.source), status: asStr(d.status), initialStatus: asStr(d.initial_status), terminalStatus: asStr(d.terminal_status), orderId: asStr(d.order_id), paymentId: asStr(d.payment_id), openedAt: asStr(d.opened_at), closedAt: asStr(d.closed_at), reason: asStr(asDict(d.snapshot).reason) };
}
export type CrmLeadOrder = { id: string; workId: string; status: string; paymentStatus: string };
function leadOrderOf(d: Dict): CrmLeadOrder | null {
  const o = asDict(d.converted_order);
  const id = asStr(o.id) || asStr(d.converted_order_id);
  if (!id) return null;
  return { id, workId: asStr(o.work_id), status: asStr(o.status), paymentStatus: asStr(o.payment_status ?? o.payment_state) };
}

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
    cycleNumber: int(d.cycle_number, 1),
    cycle: crmCycleOf(d.cycle),
    order: leadOrderOf(d),
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
// §7: the same inquiry again reopens the lead as a new cycle; the old one
// stays in the history with its final status.
export type ReopenInput = { inquiry: string; source: string; reason: string; operatorId?: string; title?: string };
export const reopenBody = (r: ReopenInput): Dict => {
  const b: Dict = { inquiry: r.inquiry.trim(), source: r.source || "manual", reason: r.reason.trim() || "Yangi murojaat", assigned_operator_user_id: r.operatorId || null };
  if (r.title?.trim()) b.title = r.title.trim();
  return b;
};
export const reopenCrmLead = (lead: Locked, r: ReopenInput) => leadWrite(lead, "/reopen", reopenBody(r));
// GET …/history: every cycle (old ones with their final status) and the
// lead's status history.
export type CrmHistory = { cycleNumber: number; currentCycleId: string; cycles: CrmCycle[]; events: CrmActivity[] };
export async function getLeadHistory(id: string, signal?: AbortSignal): Promise<CrmHistory> {
  return crmHistoryOf(await http(`/crm/leads/${enc(id)}/history`, { signal }));
}
export function crmHistoryOf(v: unknown): CrmHistory {
  const d = asDict(v);
  return {
    cycleNumber: int(d.cycle_number, 1),
    currentCycleId: asStr(d.current_cycle_id),
    cycles: asArr(d.cycles)
      .map(crmCycleOf)
      .filter((c): c is CrmCycle => !!c)
      .sort((a, b) => b.sequence - a.sequence),
    events: asArr(d.status_history).map(crmActivityOf).filter((a) => a.id),
  };
}
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
// Gaps closed §21: filtered by the chosen service and the search on the server.
export async function lookupPackages(serviceId: string, q: string, signal?: AbortSignal): Promise<{ items: ConvOption[]; hasMore: boolean }> {
  const d = await http(`/service-packages${qs({ service_id: serviceId || undefined, q: q.trim() || undefined })}`, { signal });
  const items = (Array.isArray(d) ? d : asArr(asDict(d).items))
    .filter((v) => asDict(v).is_active !== false)
    .map((v) => {
      const x = asDict(v);
      return { id: asStr(x.id), title: asStr(x.title), sub: [asStr(x.category_title), asStr(x.duration)].filter(Boolean).join(" · ") };
    })
    .filter((x) => x.id && x.title);
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

// Calls (contract 13cb257 §14): the backend needs a phone contact and
// answers with the provider/call state; the Uzbek recording-consent text
// comes in its metadata. A live transcript grows segment by segment.
export const CALL_END_STATUSES = ["completed", "no_answer", "failed", "cancelled"] as const;
export type CallSegment = { speaker: string; text: string; startMs: number | null; endMs: number | null };
export type CrmCall = {
  id: string;
  status: string;
  direction: string;
  purpose: string;
  summary: string;
  contactId: string;
  provider: string;
  consentText: string;
  startedAt: string;
  endedAt: string;
  durationSec: number | null;
  recordingUrl: string;
  transcript: CallSegment[];
  aiRunId: string;
  createdAt: string;
};
export const callEnded = (c: Pick<CrmCall, "status">): boolean => (CALL_END_STATUSES as readonly string[]).includes(c.status);
const segmentOf = (v: unknown): CallSegment | null => {
  const d = asDict(v);
  const text = asStr(d.text).trim();
  return text ? { speaker: asStr(d.speaker) || "customer", text, startMs: num(d.started_at_ms), endMs: num(d.ended_at_ms) } : null;
};
// The consent text, wherever the metadata keeps it (Uzbek first).
function consentOf(meta: Dict): string {
  const c = asDict(meta.recording_consent ?? meta.consent);
  return asStr(meta.recording_consent_text ?? meta.consent_text ?? c.text_uz ?? c.uz ?? c.text ?? (typeof meta.recording_consent === "string" ? meta.recording_consent : "")).trim();
}
export function crmCallOf(v: unknown, recordingAccess: boolean): CrmCall {
  const d = asDict(v);
  const meta = asDict(d.metadata);
  return {
    id: asStr(d.id),
    status: asStr(d.status),
    direction: asStr(d.direction),
    purpose: asStr(d.purpose),
    summary: asStr(d.summary),
    contactId: asStr(d.contact_id),
    provider: asStr(d.provider ?? meta.provider),
    consentText: consentOf(meta),
    startedAt: asStr(d.started_at),
    endedAt: asStr(d.ended_at ?? d.completed_at),
    durationSec: num(d.duration_seconds ?? d.duration_sec),
    // Never shown, never kept, without the recordings permission (§20).
    recordingUrl: recordingAccess ? asStr(d.recording_url) : "",
    transcript: asArr(d.transcript ?? d.segments)
      .map(segmentOf)
      .filter((x): x is CallSegment => !!x),
    aiRunId: asStr(d.ai_run_id),
    createdAt: asStr(d.created_at),
  };
}
export async function listLeadCalls(id: string, recordingAccess: boolean, signal?: AbortSignal): Promise<CrmCall[]> {
  return listOf(await http(`/crm/leads/${enc(id)}/calls`, { signal })).map((x) => crmCallOf(x, recordingAccess));
}
export async function startLeadCall(id: string, input: { contactId: string; purpose: string; direction?: "outbound" | "inbound" }, recordingAccess: boolean): Promise<CrmCall> {
  return crmCallOf(await http(`/crm/leads/${enc(id)}/calls`, { method: "POST", body: JSON.stringify({ contact_id: input.contactId || null, direction: input.direction ?? "outbound", purpose: input.purpose.trim() }) }), recordingAccess);
}
export const callCompleteBody = (status: string, summary: string, transcript: CallSegment[]): Dict => ({
  status,
  summary: summary.trim(),
  transcript: transcript.map((s) => ({ speaker: s.speaker, text: s.text, started_at_ms: s.startMs, ended_at_ms: s.endMs })),
  recording_url: "",
  metadata: {},
});
export async function completeCall(callId: string, status: string, summary: string, transcript: CallSegment[], recordingAccess: boolean): Promise<CrmCall> {
  return crmCallOf(await http(`/crm/calls/${enc(callId)}/complete`, { method: "POST", body: JSON.stringify(callCompleteBody(status, summary, transcript)) }), recordingAccess);
}
// A live-transcript append; `aiRunId` is set when it started a live-assist
// run (the backend never runs two at once).
export async function appendTranscript(callId: string, segments: CallSegment[], requestAssist: boolean): Promise<{ aiRunId: string; call: CrmCall | null }> {
  const d = asDict(
    await http(`/crm/calls/${enc(callId)}/transcript`, {
      method: "POST",
      body: JSON.stringify({ segments: segments.map((s) => ({ speaker: s.speaker, text: s.text, started_at_ms: s.startMs, ended_at_ms: s.endMs })), language: "auto", request_ai_assist: requestAssist }),
    }),
  );
  const call = asStr(asDict(d.call).id) ? crmCallOf(d.call, false) : null;
  return { aiRunId: asStr(d.ai_run_id ?? asDict(d.ai_run).id), call };
}

// ── SMS (§15) ──
// Drafts need an operator's approval; the provider is not configured yet,
// so an approved SMS becomes provider_configuration_required — never shown
// as sent or delivered.
export const SMS_STATUSES = ["draft", "scheduled", "approved", "sent", "delivered", "cancelled", "failed", "provider_configuration_required"] as const;
export type CrmSms = { id: string; leadId: string; body: string; language: string; status: string; contactId: string; to: string; scheduledAt: string; sentAt: string; deliveredAt: string; error: string; origin: string; createdAt: string; updatedAt: string };
export function crmSmsOf(v: unknown): CrmSms {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    leadId: asStr(d.lead_id),
    body: asStr(d.body),
    language: asStr(d.language),
    status: asStr(d.status) || "draft",
    contactId: asStr(d.contact_id),
    to: asStr(d.phone ?? d.to ?? d.recipient ?? asDict(d.contact).value),
    scheduledAt: asStr(d.scheduled_at),
    sentAt: asStr(d.sent_at),
    deliveredAt: asStr(d.delivered_at),
    error: asStr(d.error ?? d.provider_error),
    // Where it came from: the automatic no-answer SMS, AI or the operator.
    origin: asStr(d.source ?? d.origin ?? asDict(d.metadata).source ?? asDict(d.metadata).trigger),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at),
  };
}
export const smsEditable = (s: Pick<CrmSms, "status">): boolean => s.status === "draft" || s.status === "scheduled";
export async function listLeadSms(leadId: string, signal?: AbortSignal): Promise<CrmSms[]> {
  return listOf(await http(`/crm/leads/${enc(leadId)}/sms`, { signal })).map(crmSmsOf).filter((x) => x.id);
}
export const smsBody = (s: { body: string; language: string; contactId: string; scheduledAt?: string }): Dict => ({ body: s.body.trim(), language: s.language || "uz_latn", contact_id: s.contactId || null, scheduled_at: s.scheduledAt || null });
export async function createLeadSms(leadId: string, s: { body: string; language: string; contactId: string; scheduledAt?: string }): Promise<CrmSms> {
  return crmSmsOf(await http(`/crm/leads/${enc(leadId)}/sms`, { method: "POST", body: JSON.stringify(smsBody(s)) }));
}
// Approve as it is, or with the operator's final text.
export async function approveSms(smsId: string, body?: string): Promise<CrmSms> {
  return crmSmsOf(await http(`/crm/sms/${enc(smsId)}/approve`, { method: "POST", body: JSON.stringify({ body: body === undefined ? null : body.trim() }) }));
}

// ── Metrics and analytics ──────────────────────────────────────────────

// Historical cycle metrics (§18): every cycle counts, so a won lead that was
// later reopened still shows as won here.
export type CrmCycleMetrics = { total: number; open: number; won: number; rejected: number; completed: number; conversion: number };
export const cycleMetricsOf = (v: unknown): CrmCycleMetrics => {
  const d = asDict(v);
  return { total: int(d.total), open: int(d.open), won: int(d.won), rejected: int(d.rejected), completed: int(d.completed), conversion: num(d.conversion_percent) ?? 0 };
};
export type CrmMetrics = { operator: CrmPerson | null; total: number; active: number; won: number; closed: number; conversion: number; firstResponseMin: number | null; overdue: number; statusCounts: Record<string, number>; cycles: CrmCycleMetrics };
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
    cycles: cycleMetricsOf(d.cycle_metrics),
  };
}
export async function getMyCrmMetrics(range: { from?: string; to?: string } = {}, signal?: AbortSignal): Promise<CrmMetrics> {
  return crmMetricsOf(await http(`/crm/me/metrics${qs({ date_from: range.from, date_to: range.to })}`, { signal }));
}

export type CrmAnalytics = { totalLeads: number; statusCounts: Record<string, number>; sourceCounts: Record<string, number>; cycles: CrmCycleMetrics; operators: { operator: CrmPerson | null; total: number; won: number; conversion: number; cycles: CrmCycleMetrics }[]; paidRevenue: number | null; currency: string; revenueVisible: boolean };
export function crmAnalyticsOf(v: unknown): CrmAnalytics {
  const d = asDict(v);
  const visible = bool(d.revenue_visible);
  return {
    totalLeads: int(d.total_leads),
    statusCounts: countsOf(d.status_counts),
    sourceCounts: countsOf(d.source_counts),
    cycles: cycleMetricsOf(d.cycle_metrics),
    operators: asArr(d.operators).map((x) => {
      const o = asDict(x);
      return { operator: crmPersonOf(o.operator) ?? (asStr(o.operator_user_id) ? { id: asStr(o.operator_user_id), name: "", lexgoId: "", role: "" } : null), total: int(o.total), won: int(o.won), conversion: num(o.conversion_percent) ?? 0, cycles: cycleMetricsOf(o.cycle_metrics) };
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

// Contract 13cb257 §22, plus the lock and claim codes of the earlier CRM
// contracts. Every one has its own translated text (crm.err.*).
export const CRM_ERROR_CODES = [
  "crm_permission_required",
  "crm_operator_scope_denied",
  "crm_operator_invalid",
  "crm_lead_not_found",
  "crm_customer_not_found",
  "crm_contact_not_found",
  "crm_last_contact_cannot_archive",
  "crm_customer_account_required",
  "crm_rejection_reason_required",
  "crm_paid_order_required",
  "crm_payment_confirmation_required",
  "crm_phone_contact_required",
  "crm_ai_lead_scope_denied",
  "crm_ai_run_active",
  "crm_ai_run_not_found",
  "crm_ai_run_not_completed",
  "crm_ai_path_invalid",
  "crm_ai_next_action_invalid",
  "crm_call_scope_denied",
  "crm_call_not_found",
  "crm_call_complete_denied",
  "crm_live_transcript_denied",
  "crm_sms_not_found",
  "crm_sms_not_approvable",
  "crm_automation_action_invalid",
  "crm_automation_rule_not_found",
  "crm_automation_context_not_found",
  "crm_export_scope_denied",
  "crm_export_not_found",
  "crm_export_not_ready",
  "crm_kanban_fixed_statuses_required",
  "crm_global_analytics_superadmin_only",
  "crm_access_denied",
  "crm_lead_already_claimed",
  "crm_lead_version_conflict",
  "crm_status_transition_invalid",
  "crm_duplicate_target_invalid",
  "crm_transfer_reason_required",
] as const;
export const crmCode = (e: unknown): string => (e instanceof ApiError ? (e.code ?? "") : "");
// A stale lock_version (§3, §22: 409 for stale state).
export const isVersionConflict = (e: unknown): boolean => {
  const c = crmCode(e);
  return c === "crm_lead_version_conflict" || (e instanceof ApiError && e.status === 409 && /version|stale|lock/.test(c));
};
export const isClaimRace = (e: unknown): boolean => crmCode(e) === "crm_lead_already_claimed" || (e instanceof ApiError && e.status === 409 && !crmCode(e));
export const isCrmDenied = (e: unknown): boolean => e instanceof ApiError && (e.status === 403 || crmCode(e) === "crm_access_denied" || crmCode(e) === "crm_permission_required");

// ── Realtime ───────────────────────────────────────────────────────────

// What a /ws/users/me event means for the CRM screens (§10). Nothing is
// appended from an event: the named caches refetch.
export type CrmInvalidate = "all" | "meta" | "queue" | "counts" | "lists" | "lead" | "metrics" | "customer" | "ai" | "export" | "call" | "sms" | "automation" | "live";
// §21: events match by lead_id, customer_id, call_id or run_id. A moved
// card also says where it went (to/status and position) so a board can
// move it before reconciling with the API.
export type CrmEvent = { name: string; leadId: string; runId: string; exportId: string; customerId: string; callId: string; toStatus: string; position: number; title: string; body: string; invalidate: CrmInvalidate[] };
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
  const moved = name === "crm.lead.moved" || name === "crm.lead.status_changed";
  const pos = Number(pick(ev, "position"));
  const base = {
    name,
    leadId: pick(ev, "lead_id"),
    runId: pick(ev, "run_id", "ai_run_id"),
    exportId: pick(ev, "export_id"),
    customerId: pick(ev, "customer_id"),
    callId: pick(ev, "call_id"),
    toStatus: moved ? pick(ev, "to", "to_status", "status") : "",
    position: Number.isFinite(pos) && pos >= 0 ? pos : 0,
    title: asStr(asDict(ev.notification).title) || pick(ev, "title"),
    body: asStr(asDict(ev.notification).body) || pick(ev, "body", "message"),
  };
  const map: Record<string, CrmInvalidate[]> = {
    "crm.resync": ["all"],
    "crm.lead.created": ["queue", "counts", "lists", "customer"],
    "crm.lead.claimed": ["queue", "counts", "lists", "lead"],
    "crm.lead.assigned": ["lead", "lists", "counts", "metrics"],
    "crm.lead.transferred": ["lead", "lists", "counts", "metrics"],
    "crm.lead.status_changed": ["lead", "lists", "counts", "metrics"],
    "crm.lead.reopened": ["lead", "lists", "counts", "queue", "customer"],
    "crm.lead.watcher_added": ["lead"],
    "crm.lead.next_action_due": ["lead", "lists", "metrics"],
    "crm.lead.payment_confirmed": ["lead", "lists", "counts", "customer", "metrics"],
    "crm.lead.moved": ["lead", "lists", "counts"],
    "crm.kanban.columns_updated": ["meta", "lists", "counts"],
    "crm.ai.completed": ["ai"],
    "crm.ai.failed": ["ai"],
    "crm.call.transcript_updated": ["call", "live"],
    "crm.call.completed": ["call", "live", "lead", "sms"],
    "crm.automation.notification": ["automation"],
    "crm.automation.escalated": ["automation", "lead"],
    "crm.export.ready": ["export"],
  };
  return { ...base, invalidate: map[name] ?? (base.leadId ? ["lead", "lists"] : ["lists"]) };
}

// ── Kanban (contract 13cb257 §6) ──
// GET /crm/kanban: the six fixed columns with their first `column_limit`
// leads each (in the backend's rank order), the count and has_more.
export type KanbanColumn = CrmStatusInfo & { count: number; hasMore: boolean; items: CrmLead[] };
export type CrmKanban = { columns: KanbanColumn[]; total: number; columnLimit: number; reorderSupported: boolean };
export const KANBAN_PAGE = 30;
export function crmKanbanOf(v: unknown): CrmKanban {
  const d = asDict(v);
  const columns = asArr(d.columns)
    .map(asDict)
    .filter((c) => asStr(c.key))
    .map((c, i) => {
      const items = asArr(c.items ?? c.leads)
        .map((x) => (asDict(x).lead ? asDict(x).lead : x))
        .map(crmLeadOf)
        .filter((l) => l.id);
      return { ...statusInfoOf(c, i), count: int(c.count, items.length), hasMore: c.has_more === true, items };
    })
    .sort((a, b) => a.order - b.order);
  return { columns, total: int(d.total), columnLimit: int(d.column_limit, KANBAN_PAGE), reorderSupported: d.reorder_supported !== false };
}
export async function getCrmKanban(q: { columnLimit?: number; q?: string; mineOnly?: boolean } = {}, signal?: AbortSignal): Promise<CrmKanban> {
  return crmKanbanOf(await http(`/crm/kanban${qs({ column_limit: q.columnLimit ?? KANBAN_PAGE, q: (q.q ?? "").trim(), mine_only: q.mineOnly })}`, { signal }));
}
// "Load more" in one column: the rank-ordered list of that status (§6).
export async function moreKanbanLeads(status: string, offset: number, q: { q?: string; mineOnly?: boolean } = {}, signal?: AbortSignal): Promise<{ items: CrmLead[]; total: number }> {
  const p = await listCrmLeads({ status, q: q.q, mineOnly: q.mineOnly, offset, limit: KANBAN_PAGE }, signal);
  return { items: p.items, total: p.total };
}
// Column settings: title, colour and order of the six fixed keys — all six
// always sent, none removable (crm.automation.manage).
export type KanbanColumnInput = { key: string; title: string; color: string };
export const kanbanColumnsBody = (cols: readonly KanbanColumnInput[]): Dict => ({ columns: cols.map((c, i) => ({ key: c.key, title: c.title.trim(), color: c.color, order: (i + 1) * 10 })) });
export async function saveKanbanColumns(cols: readonly KanbanColumnInput[]): Promise<void> {
  await http("/crm/kanban/columns", { method: "PUT", body: JSON.stringify(kanbanColumnsBody(cols)) });
}
// Where the dragged lead lands: before `beforeId` (or after `afterId`) in
// the column's order with the dragged lead taken out.
export function positionIn(order: readonly string[], leadId: string, beforeId: string | null, afterId: string | null): number {
  const rest = order.filter((id) => id !== leadId);
  if (beforeId) {
    const i = rest.indexOf(beforeId);
    if (i >= 0) return i;
  }
  if (afterId) {
    const i = rest.indexOf(afterId);
    if (i >= 0) return i + 1;
  }
  return beforeId ? 0 : rest.length;
}
// A new place inside the same status. The status body (§6) has no
// position, so the order goes through the board's move endpoint with the
// lead's lock_version; the status itself never changes here.
export async function reorderCrmLead(lead: Locked & Pick<CrmLead, "status">, position: number): Promise<CrmLead> {
  const d = asDict(await http(`/call-center/leads/${enc(lead.id)}/move`, { method: "PATCH", body: JSON.stringify({ column_key: lead.status, position: Math.max(0, Math.round(position)), expected_lock_version: lead.lockVersion }) }));
  return crmLeadOf(d.lead ?? d);
}
