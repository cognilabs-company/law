import { ApiError, asArr, asDict, asStr, http } from "@/lib/http";
import { normStudioRecord, type StudioRecord, type StudioRecordQuery, type StudioRecordSource, type StudioRecords } from "@/lib/services/studio";

export type RecordMeta = { isTest: boolean | null; canReorder: boolean; position: number | null; reorderKey: string };
export type CtorRecord = StudioRecord & { meta?: RecordMeta };
export type CtorRecords = Omit<StudioRecords, "items"> & { items: CtorRecord[]; hasMore: boolean };
export type ReorderItem = { record_id: string; source: StudioRecordSource };

export const NOT_REORDERABLE = "studio_record_not_reorderable";

const enc = encodeURIComponent;
const CREATE_PREFIX = "/studio/constructors/";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(v: unknown): boolean | null {
  if (v === true || v === "true" || v === 1) return true;
  if (v === false || v === "false" || v === 0) return false;
  return null;
}

export function recordMetaOf(raw: unknown): RecordMeta {
  const d = asDict(raw);
  return {
    isTest: boolOrNull(d.is_test),
    canReorder: boolOrNull(d.can_reorder) === true,
    position: numOrNull(d.position),
    reorderKey: asStr(d.reorder_key),
  };
}

export function normCtorRecord(raw: unknown): CtorRecord {
  return { ...normStudioRecord(raw), meta: recordMetaOf(raw) };
}

export function rowKeyOf(r: Pick<StudioRecord, "source" | "id">): string {
  return `${r.source}-${r.id}`;
}

export function isTestRecord(r: CtorRecord): boolean | null {
  return r.meta?.isTest ?? null;
}

export function canReorderRecord(r: CtorRecord): boolean {
  return r.meta?.canReorder === true;
}

function createUrlOf(v: unknown): string {
  const u = asStr(v).trim();
  return u.startsWith(CREATE_PREFIX) && !u.includes("..") ? u : "";
}

export function normCtorRecords(raw: unknown): CtorRecords {
  const d = asDict(raw);
  const items = asArr(d.items).map(normCtorRecord).filter((r) => r.id);
  const total = numOrNull(d.total) ?? items.length;
  return {
    items,
    total,
    runtimeTotal: numOrNull(d.runtime_total) ?? 0,
    studioTotal: numOrNull(d.studio_total) ?? 0,
    createUrl: createUrlOf(d.create_url),
    hasMore: boolOrNull(d.has_more) ?? false,
  };
}

export async function fetchCtorRecords(code: string, q: StudioRecordQuery = {}, signal?: AbortSignal): Promise<CtorRecords> {
  const p = new URLSearchParams();
  if (q.q?.trim()) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  p.set("source", q.source || "all");
  p.set("limit", String(q.limit ?? 50));
  p.set("offset", String(q.offset ?? 0));
  return normCtorRecords(await http(`/studio/constructors/${enc(code)}/records?${p}`, { signal }));
}

export function reorderItemsOf(rows: readonly CtorRecord[]): ReorderItem[] {
  return rows.map((r) => ({ record_id: r.recordId || r.id, source: r.source }));
}

export async function reorderCtorRecords(code: string, items: readonly ReorderItem[]): Promise<CtorRecord[] | null> {
  const res = asDict(await http(`/studio/constructors/${enc(code)}/records/reorder`, { method: "PUT", body: JSON.stringify({ items }) }));
  const list = asArr(res.items);
  return list.length ? list.map(normCtorRecord).filter((r) => r.id) : null;
}

export function errorCodeOf(e: unknown): string {
  if (!(e instanceof ApiError)) return "";
  if (e.code) return e.code;
  const detail = asDict(e.data.detail);
  return asStr(detail.code || e.data.code);
}

export function isNotReorderable(e: unknown): boolean {
  return errorCodeOf(e) === NOT_REORDERABLE;
}
