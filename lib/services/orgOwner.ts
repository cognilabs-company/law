import { http, asDict, asStr, asNum, asArr, isAborted, type Dict } from "@/lib/http";
import { noteFeatureError } from "@/lib/endpointGate";
import type { Page } from "@/lib/usePaged";

export type OrgWorkload = { activeOrders: number; activeCases: number; urgentRequests: number };

export type OrgMemberRow = {
  userId: string;
  name: string;
  phone: string;
  title: string;
  role: string;
  membershipStatus: string;
  sellerType: string;
  specializations: string[];
  region: string;
  verificationStatus: string;
  rating: number;
  reviewsCount: number;
  workload: OrgWorkload;
};

export type OrgWorkItem = {
  id: string;
  workId: string;
  kind: string;
  title: string;
  status: string;
  memberUserId: string;
  memberName: string;
  clientName: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
};

export type OwnerDashboard = {
  organization: { id: string; name: string; ownerUserId: string };
  summary: { members: number; verifiedMembers: number; activeOrders: number; activeCases: number; urgentRequests: number };
  members: OrgMemberRow[];
  activeOrders: OrgWorkItem[];
  activeCases: OrgWorkItem[];
  urgentRequests: OrgWorkItem[];
};

const nameOf = (v: unknown) => {
  const d = asDict(v);
  return asStr(d.name ?? d.full_name ?? d.lawyer_name).trim();
};

function normWorkload(v: unknown): OrgWorkload {
  const d = asDict(v);
  return { activeOrders: asNum(d.active_orders), activeCases: asNum(d.active_cases), urgentRequests: asNum(d.urgent_requests) };
}

function normMemberRow(v: unknown): OrgMemberRow {
  const d = asDict(v);
  const m = asDict(d.membership);
  const u = asDict(d.user);
  return {
    userId: asStr(u.id ?? m.user_id ?? d.user_id),
    name: nameOf(u) || asStr(d.name).trim(),
    phone: asStr(u.phone),
    title: asStr(m.title).trim(),
    role: asStr(m.role ?? m.role_id ?? u.role),
    membershipStatus: asStr(m.status),
    sellerType: asStr(d.seller_type ?? u.role),
    specializations: asArr(d.specializations).map((x) => asStr(x)).filter(Boolean),
    region: asStr(d.region).trim(),
    verificationStatus: asStr(d.verification_status),
    rating: asNum(d.rating),
    reviewsCount: asNum(d.reviews_count),
    workload: normWorkload(d.workload),
  };
}

export function normWorkItem(v: unknown, kind = ""): OrgWorkItem {
  const d = asDict(v);
  const svc = asDict(d.service);
  const member = asDict(d.lawyer ?? d.seller ?? d.member ?? d.assignee);
  const client = asDict(d.client);
  return {
    id: asStr(d.id ?? d.order_id ?? d.case_id ?? d.request_id),
    workId: asStr(d.work_id ?? d.public_id),
    kind: asStr(d.kind ?? d.type ?? d.module ?? d.record_type, kind),
    title: asStr(d.title ?? d.service_title ?? svc.title ?? d.case_title ?? d.service_type).trim(),
    status: asStr(d.status),
    memberUserId: asStr(d.member_user_id ?? d.lawyer_user_id ?? d.seller_user_id ?? d.assigned_lawyer_user_id ?? member.id),
    memberName: asStr(d.member_name ?? d.lawyer_name).trim() || nameOf(member),
    clientName: asStr(d.client_name).trim() || nameOf(client),
    amount: asNum(d.amount ?? d.price ?? d.total_amount),
    createdAt: asStr(d.created_at),
    updatedAt: asStr(d.updated_at ?? d.created_at),
  };
}

export async function getOwnerDashboard(orgId: string, signal?: AbortSignal): Promise<OwnerDashboard> {
  try {
    const d = asDict(await http(`/organizations/${encodeURIComponent(orgId)}/owner/dashboard`, { signal }));
    const org = asDict(d.organization);
    const s = asDict(d.summary);
    return {
      organization: { id: asStr(org.id, orgId), name: asStr(org.name).trim(), ownerUserId: asStr(org.owner_user_id) },
      summary: {
        members: asNum(s.members_count),
        verifiedMembers: asNum(s.verified_members_count),
        activeOrders: asNum(s.active_orders),
        activeCases: asNum(s.active_cases),
        urgentRequests: asNum(s.urgent_requests),
      },
      members: asArr(d.members).map(normMemberRow),
      activeOrders: asArr(d.active_orders).map((x) => normWorkItem(x, "order")),
      activeCases: asArr(d.active_cases).map((x) => normWorkItem(x, "case")),
      urgentRequests: asArr(d.urgent_requests).map((x) => normWorkItem(x, "urgent")),
    };
  } catch (e) {
    if (!isAborted(e)) noteFeatureError("orgOwner", e);
    throw e;
  }
}

export async function listOwnerWorkload(
  orgId: string,
  opts: { memberUserId?: string; status?: string; offset: number; limit: number },
  signal?: AbortSignal,
): Promise<Page<OrgWorkItem>> {
  const qs = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, opts.limit))), offset: String(opts.offset) });
  if (opts.memberUserId) qs.set("member_user_id", opts.memberUserId);
  if (opts.status) qs.set("status", opts.status);
  try {
    const d: Dict = asDict(await http(`/organizations/${encodeURIComponent(orgId)}/owner/workload?${qs.toString()}`, { signal }));
    const items = asArr(d.items).map((x) => normWorkItem(x));
    const offset = asNum(d.offset, opts.offset);
    const total = asNum(d.total, offset + items.length);
    return { items, total, hasMore: typeof d.has_more === "boolean" ? d.has_more : offset + items.length < total };
  } catch (e) {
    if (!isAborted(e)) noteFeatureError("orgOwner", e);
    throw e;
  }
}
