import { http, asDict, asStr, asArr, type Dict } from "@/lib/http";
import { normPackage, type BackendPackage } from "@/lib/services/backend";

export type SellerPackageStatus = "active" | "disabled";

export type SellerPackageEligibility = {
  eligible: boolean;
  extendedVerified: boolean;
  baseVerified: boolean;
  reasons: string[];
  missingServiceIds: string[];
};

export type SellerPackage = {
  id: string;
  pkg: BackendPackage;
  enabled: boolean;
  status: SellerPackageStatus;
  priceEditable: boolean;
  eligibility: SellerPackageEligibility;
};

const strs = (v: unknown) => asArr(v).map((s) => asStr(s)).filter(Boolean);

export function normSellerPackage(raw: unknown): SellerPackage {
  const x = asDict(raw);
  const nested = asDict(x.package ?? x.service_package);
  const pkg = normPackage(Object.keys(nested).length ? { ...nested, id: nested.id ?? x.package_id } : { ...x, id: x.package_id ?? x.id });
  const el = asDict(x.eligibility ?? x.package_eligibility);
  const enabled = x.enabled === true || x.is_enabled === true;
  const st = asStr(x.status ?? x.seller_status).toLowerCase();
  return {
    id: pkg.id || asStr(x.package_id ?? x.id),
    pkg,
    enabled,
    status: enabled && (st === "" || st === "active" || st === "enabled") ? "active" : "disabled",
    priceEditable: x.price_editable === true,
    eligibility: {
      eligible: el.eligible !== false,
      extendedVerified: el.extended_verified === true,
      baseVerified: el.base_verified === true,
      reasons: strs(el.reasons),
      missingServiceIds: strs(el.missing_service_ids),
    },
  };
}

function listOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const d = asDict(raw);
  return asArr(d.items ?? d.packages ?? d.data);
}

function itemOf(raw: unknown): SellerPackage | null {
  const d = asDict(raw);
  const inner: Dict = asDict(d.item ?? d.seller_package ?? d.result);
  const src = Object.keys(inner).length ? inner : d;
  if (!Object.keys(src).length || !("enabled" in src || "status" in src)) return null;
  const item = normSellerPackage(src);
  return item.id ? item : null;
}

export async function listMyPackages(signal?: AbortSignal): Promise<SellerPackage[]> {
  return listOf(await http("/lawyers/me/packages/manage", { signal })).map(normSellerPackage).filter((p) => p.id);
}

export async function enableMyPackage(packageId: string): Promise<SellerPackage | null> {
  return itemOf(await http(`/lawyers/me/packages/${encodeURIComponent(packageId)}/enable`, { method: "POST" }));
}

export async function setMyPackageStatus(packageId: string, status: SellerPackageStatus): Promise<SellerPackage | null> {
  return itemOf(
    await http(`/lawyers/me/packages/${encodeURIComponent(packageId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  );
}
