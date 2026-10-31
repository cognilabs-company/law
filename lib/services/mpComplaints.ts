// Marketplace complaints for the call center (TSK-344069; backend contract
// FRONTEND_MONITORING_MARKETPLACE_GAPS_CLOSED §3–4): the queue with each
// complaint's order, parties and held settlement, evidence files, and the
// ruling. A complaint holds the seller's payout until it is ruled on; the
// backend moves the settlement by the action chosen.

import { asArr, asDict, asStr, http, httpBlobNamed, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// The backend enum MarketplaceComplaintAction, in the order an operator weighs them.
export const MP_COMPLAINT_ACTIONS = ["valid_rework", "partial_refund", "full_refund", "valid_refund", "invalid", "resolved"] as const;
export type MpComplaintAction = (typeof MP_COMPLAINT_ACTIONS)[number];

export type MpParty = { id: string; lexgoId: string; name: string; phone: string };
export type MpSettlement = {
  status: string;
  gross: number | null;
  held: number | null;
  refunded: number | null;
  pendingRefund: number | null;
  released: number | null;
  releasable: number | null;
  currency: string;
};
export type MpEvidence = { id: string; fileName: string; mimeType: string; visibility: string; downloadUrl: string };
export type MpComplaint = {
  id: string;
  status: string;
  title: string;
  reason: string;
  rating: number | null;
  resolution: string;
  resolutionNote: string;
  refundAmount: number | null;
  order: { id: string; workId: string; status: string; paymentStatus: string; price: number | null; currency: string };
  client: MpParty | null;
  seller: MpParty | null;
  evidence: MpEvidence[];
  settlement: MpSettlement | null;
  actions: MpComplaintAction[];
  createdAt: string;
};

const partyOf = (v: unknown): MpParty | null => {
  const d = asDict(v);
  return asStr(d.id) ? { id: asStr(d.id), lexgoId: asStr(d.lexgo_id), name: asStr(d.name ?? d.full_name), phone: asStr(d.phone) } : null;
};

export function settlementOf(v: unknown): MpSettlement | null {
  const d = asDict(v);
  if (!asStr(d.status)) return null;
  return {
    status: asStr(d.status),
    gross: num(d.gross_amount),
    held: num(d.held_amount),
    refunded: num(d.refunded_amount),
    pendingRefund: num(d.pending_refund_amount),
    released: num(d.released_amount),
    releasable: num(d.releasable_amount),
    currency: asStr(d.currency) || "UZS",
  };
}

export const evidenceOf = (v: unknown): MpEvidence => {
  const d = asDict(v);
  const id = asStr(d.id);
  return { id, fileName: asStr(d.file_name ?? d.name), mimeType: asStr(d.mime_type), visibility: asStr(d.visibility), downloadUrl: asStr(d.download_url) };
};

function actionsOf(v: unknown): MpComplaintAction[] {
  if (!Array.isArray(v)) return [...MP_COMPLAINT_ACTIONS];
  return v.map((x) => asStr(x)).filter((a): a is MpComplaintAction => (MP_COMPLAINT_ACTIONS as readonly string[]).includes(a));
}

export function mpComplaintOf(v: unknown): MpComplaint | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  const o = asDict(d.order);
  return {
    id,
    status: asStr(d.status),
    title: asStr(d.title),
    reason: asStr(d.reason),
    rating: num(d.rating),
    resolution: asStr(d.resolution),
    resolutionNote: asStr(d.resolution_note),
    refundAmount: num(d.refund_amount),
    order: { id: asStr(o.id), workId: asStr(o.work_id), status: asStr(o.status), paymentStatus: asStr(o.payment_status), price: num(o.price), currency: asStr(o.currency) || "UZS" },
    client: partyOf(d.client),
    seller: partyOf(d.seller),
    evidence: asArr(d.evidence).map(evidenceOf).filter((e) => e.id),
    settlement: settlementOf(d.settlement),
    // The live list sends `allowed_actions` (seen 26 Oct 2026); without
    // either list every decision is offered and the backend has the last word.
    actions: actionsOf(d.allowed_actions ?? d.available_actions),
    createdAt: asStr(d.created_at),
  };
}

export type MpPage<T> = { items: T[]; total: number; hasMore: boolean };

export async function listMpComplaints(opts: { status?: string; offset?: number; limit?: number } = {}, signal?: AbortSignal): Promise<MpPage<MpComplaint>> {
  const qs = new URLSearchParams({ limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) });
  if (opts.status) qs.set("status", opts.status);
  const d = asDict(await http(`/call-center/marketplace/complaints?${qs}`, { signal }));
  const items = asArr(d.items).map(mpComplaintOf).filter((x): x is MpComplaint => !!x);
  return { items, total: num(d.total) ?? items.length, hasMore: d.has_more === true };
}

export async function uploadMpComplaintEvidence(complaintId: string, file: File, visibility: "staff" | "parties"): Promise<MpEvidence> {
  const form = new FormData();
  form.append("file", file);
  form.append("visibility", visibility);
  return evidenceOf(await http(`/call-center/marketplace/complaints/${encodeURIComponent(complaintId)}/evidence`, { method: "POST", body: form }));
}

export async function downloadEvidence(ev: MpEvidence): Promise<void> {
  const { blob, name } = await httpBlobNamed(ev.downloadUrl.replace(/^https?:\/\/[^/]+/i, ""));
  saveBlob(blob, name || ev.fileName || ev.id);
}

export const MP_EVIDENCE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "video/mp4", "video/quicktime", "video/webm"] as const;
export const MP_EVIDENCE_MAX = 25 * 1024 * 1024;

export async function resolveMpComplaint(id: string, input: { action: MpComplaintAction; note: string; refundAmount?: number; evidenceIds: string[] }): Promise<Dict> {
  const body: Dict = { action: input.action, note: input.note.trim(), evidence_ids: input.evidenceIds };
  if (input.action === "partial_refund") body.refund_amount = input.refundAmount;
  return asDict(await http(`/call-center/marketplace/complaints/${encodeURIComponent(id)}/resolve`, { method: "POST", body: JSON.stringify(body) }));
}

// ── Warranty claims (§5) ───────────────────────────────────────────────

export const WARRANTY_RESOLUTIONS = ["replacement", "full_refund", "rejected"] as const;
export type WarrantyDecision = (typeof WARRANTY_RESOLUTIONS)[number];
export type WarrantyClaim = {
  id: string;
  status: string;
  kind: string;
  reason: string;
  resolution: string;
  note: string;
  order: { id: string; workId: string; status: string; paymentStatus: string; price: number | null; currency: string; serviceId: string };
  client: MpParty | null;
  seller: MpParty | null;
  settlement: MpSettlement | null;
  resolutions: WarrantyDecision[];
  createdAt: string;
  filesConsent: boolean | null;
};

export function warrantyClaimOf(v: unknown): WarrantyClaim | null {
  const root = asDict(v);
  const d = Object.keys(asDict(root.claim)).length ? { ...root, ...asDict(root.claim) } : root;
  const id = asStr(d.id ?? d.claim_id);
  if (!id) return null;
  const o = asDict(d.order ?? root.order);
  const avail = asArr(d.available_resolutions ?? root.available_resolutions)
    .map((x) => asStr(x))
    .filter((a): a is WarrantyDecision => (WARRANTY_RESOLUTIONS as readonly string[]).includes(a));
  return {
    id,
    status: asStr(d.status),
    kind: asStr(d.kind),
    reason: asStr(d.reason),
    resolution: asStr(d.resolution),
    note: asStr(d.resolution_note ?? d.note),
    order: { id: asStr(o.id ?? d.order_id), workId: asStr(o.work_id), status: asStr(o.status), paymentStatus: asStr(o.payment_status), price: num(o.price), currency: asStr(o.currency) || "UZS", serviceId: asStr(o.service_id) },
    client: partyOf(d.client ?? root.client),
    seller: partyOf(d.seller ?? root.seller),
    settlement: settlementOf(d.settlement ?? root.settlement),
    // Only the decisions the backend lists for this claim (§1.5): nothing
    // is added here — no rework, no rejection it did not offer.
    resolutions: [...new Set(avail)],
    createdAt: asStr(d.created_at),
    filesConsent: consentOf(d),
  };
}

// Whether the client allowed this order's files to go to a replacement
// seller; null when the claim does not say (the backend still decides).
function consentOf(d: Dict): boolean | null {
  const mt = asDict(d.material_transfer);
  const v = d.allow_material_transfer ?? d.material_transfer_allowed ?? d.material_transfer_consent ?? mt.allowed ?? mt.client_consent;
  return typeof v === "boolean" ? v : null;
}

export async function listWarrantyClaims(opts: { status?: string; offset?: number; limit?: number } = {}, signal?: AbortSignal): Promise<MpPage<WarrantyClaim>> {
  const qs = new URLSearchParams({ limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) });
  if (opts.status) qs.set("status", opts.status);
  const d = asDict(await http(`/call-center/marketplace/warranty?${qs}`, { signal }));
  const items = asArr(d.items).map(warrantyClaimOf).filter((x): x is WarrantyClaim => !!x);
  return { items, total: num(d.total) ?? items.length, hasMore: d.has_more === true };
}

export type WarrantyOutcome = { transferred: boolean; files: number | null };

export async function resolveWarrantyClaim(id: string, input: { resolution: WarrantyDecision; note: string; sellerUserId?: string; transferMaterials?: boolean }): Promise<WarrantyOutcome> {
  const body: Dict = { resolution: input.resolution, note: input.note.trim() };
  if (input.resolution === "replacement") {
    body.seller_user_id = input.sellerUserId;
    body.transfer_materials = input.transferMaterials === true;
  }
  const d = asDict(await http(`/call-center/marketplace/warranty/${encodeURIComponent(id)}/resolve`, { method: "POST", body: JSON.stringify(body) }));
  const mt = asDict(d.material_transfer ?? asDict(d.resolution).material_transfer);
  return { transferred: mt.authorized === true, files: num(mt.transferred_file_count) };
}
