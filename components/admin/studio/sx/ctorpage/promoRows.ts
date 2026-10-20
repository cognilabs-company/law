"use client";

import { useEffect, useMemo, useState } from "react";
import { asArr, asDict, asStr, http, logApiError } from "@/lib/http";
import { getStudioReference, type StudioRecord, type StudioReferenceItem } from "@/lib/services/studio";
import { PLACEMENT_VALUES } from "./urlState";

export type PromoInfo = { id: string; placement: string; days: number | null; price: number | null; currency: string; status: string };

export const PROMO_REFERENCE = "/studio/reference/promotion-packages";
export const PROMO_EXTRA_STATUSES: readonly string[] = ["inactive", "archived"];
const EXTRA_TTL_MS = 5 * 60 * 1000;
const REF_LIMIT = 200;

type Extra = { at: number; promise: Promise<PromoInfo[]> };
const extraCache = new Map<string, Extra>();

function numberOf(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === null || v === undefined || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function promoInfoOf(raw: unknown): PromoInfo {
  const d = asDict(raw);
  const payload = asDict(d.payload);
  return {
    id: asStr(d.id ?? d.package_id ?? d.value).trim(),
    placement: asStr(d.placement ?? payload.placement).trim() || asStr(d.promotion_type ?? payload.promotion_type).trim(),
    days: numberOf(d.days, payload.days),
    price: numberOf(d.price, payload.price),
    currency: asStr(d.currency ?? payload.currency).trim() || "UZS",
    status: asStr(d.status ?? payload.status).trim().toLowerCase(),
  };
}

export function promoInfoFromReference(item: StudioReferenceItem): PromoInfo {
  const info = promoInfoOf(item.raw);
  return { ...info, id: info.id || item.id || item.value, status: info.status || "active" };
}

export function promoJoinId(rec: Pick<StudioRecord, "runtimeTargetId" | "recordId" | "id">): string {
  return rec.runtimeTargetId || rec.recordId || rec.id;
}

export function placementOrder(known: readonly string[]): string[] {
  const out: string[] = [...PLACEMENT_VALUES];
  for (const p of known) if (p && !out.includes(p)) out.push(p);
  return out;
}

export function placementRank(placement: string, order: readonly string[]): number {
  const i = placement ? order.indexOf(placement) : -1;
  return i < 0 ? order.length : i;
}

export function sortByPlacement<T>(rows: readonly T[], placementOf: (r: T) => string, order: readonly string[]): T[] {
  return rows
    .map((row, index) => ({ row, index, rank: placementRank(placementOf(row), order) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.row);
}

export function mergePromo(active: readonly PromoInfo[], extra: readonly PromoInfo[]): Map<string, PromoInfo> {
  const out = new Map<string, PromoInfo>();
  for (const p of extra) if (p.id) out.set(p.id, p);
  for (const p of active) if (p.id) out.set(p.id, { ...out.get(p.id), ...p });
  return out;
}

export function parsePromoList(raw: unknown): PromoInfo[] {
  const d = asDict(raw);
  const list = Array.isArray(raw) ? raw : asArr(d.items ?? d.packages ?? d.data ?? d.results);
  return list.map(promoInfoOf).filter((p) => p.id);
}

function loadExtra(status: string): Promise<PromoInfo[]> {
  const hit = extraCache.get(status);
  if (hit && Date.now() - hit.at < EXTRA_TTL_MS) return hit.promise;
  const promise = http(`/promotions/packages?status=${encodeURIComponent(status)}`).then(
    (raw) => parsePromoList(raw).map((p) => ({ ...p, status: p.status || status })),
    (e: unknown) => {
      logApiError("studio.promo.packages", e);
      extraCache.delete(status);
      return [] as PromoInfo[];
    },
  );
  extraCache.set(status, { at: Date.now(), promise });
  return promise;
}

export function clearPromoCache(): void {
  extraCache.clear();
}

type PromoState = { active: PromoInfo[]; extra: PromoInfo[]; ready: boolean };

export function usePromoInfo(enabled: boolean): { byId: ReadonlyMap<string, PromoInfo>; placements: readonly string[]; loading: boolean } {
  const [st, setSt] = useState<PromoState>({ active: [], extra: [], ready: false });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const ac = new AbortController();
    const active = getStudioReference(PROMO_REFERENCE, "", REF_LIMIT, ac.signal).then(
      (items) => items.map(promoInfoFromReference),
      (e: unknown) => {
        if (!ac.signal.aborted) logApiError("studio.promo.reference", e);
        return [] as PromoInfo[];
      },
    );
    const extra = Promise.all(PROMO_EXTRA_STATUSES.map(loadExtra)).then((lists) => lists.flat());
    void Promise.all([active, extra]).then(([a, x]) => {
      if (alive) setSt({ active: a, extra: x, ready: true });
    });
    return () => {
      alive = false;
      ac.abort();
    };
  }, [enabled]);

  return useMemo(() => {
    const byId = mergePromo(st.active, st.extra);
    const seen: string[] = [];
    for (const p of [...st.active, ...st.extra]) if (p.placement && !seen.includes(p.placement)) seen.push(p.placement);
    return { byId, placements: placementOrder(seen), loading: enabled && !st.ready };
  }, [st, enabled]);
}

