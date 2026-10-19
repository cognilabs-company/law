"use client";

import { useMemo } from "react";
import { asDict, http } from "@/lib/http";
import { isLocalStudioReference, loadStudioReference, studioReferenceKey, type StudioReferenceItem } from "@/lib/services/studio";
import { sourceIcon } from "../icons";
import type { SxIcon, SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";

export type SxOptionPage = { options: SxOption[]; total: number | null; hasMore: boolean };
export type SxReferencePage = { items: StudioReferenceItem[]; total: number | null; hasMore: boolean };

export type SxReferenceBinding = {
  loadOptions: (query: string, signal: AbortSignal) => Promise<SxOption[]>;
  loadPage: (query: string, offset: number, signal: AbortSignal) => Promise<SxOptionPage>;
  resolveOptions: (values: readonly string[], signal: AbortSignal) => Promise<SxOption[]>;
  leadingIcon: SxIcon;
};

const TTL_MS = 5 * 60 * 1000;
const FIRST_LIMIT = 100;
const QUERY_LIMIT = 50;
const MAX_LIMIT = 100;

type Entry = { at: number; page: Promise<SxReferencePage> };

const firstPages = new Map<string, Entry>();

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(abortError(signal));
    signal.addEventListener("abort", stop, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", stop);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", stop);
        reject(e);
      },
    );
  });
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const firstText = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = text(v);
    if (s) return s;
  }
  return "";
};
const count = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function referenceItemOf(value: unknown): StudioReferenceItem {
  const row = asDict(value);
  const valueOf = firstText(row.value, row.id, row.code, row.key);
  return { id: firstText(row.id, valueOf), value: valueOf, label: firstText(row.label, row.title, row.name, row.full_name, valueOf), raw: row };
}

export function referencePageOf(raw: unknown, offset: number, limit: number): SxReferencePage {
  const d = asDict(raw);
  const list = Array.isArray(raw) ? raw : ["items", "data", "results", "options"].map((k) => d[k]).find(Array.isArray) ?? [];
  const items = (list as unknown[]).map(referenceItemOf).filter((x) => x.value);
  const total = count(d.total);
  const flag = typeof d.has_more === "boolean" ? d.has_more : null;
  const hasMore = flag ?? (total !== null ? offset + list.length < total : list.length >= limit);
  return { items, total, hasMore };
}

export async function fetchReferencePage(source: string, q: string, offset: number, limit: number, signal?: AbortSignal): Promise<SxReferencePage> {
  if (isLocalStudioReference(source)) {
    const items = await loadStudioReference(source, q, MAX_LIMIT * 10, signal);
    const page = items.slice(offset, offset + limit);
    return { items: page, total: items.length, hasMore: offset + page.length < items.length };
  }
  const { key, params } = studioReferenceKey(source);
  const size = Math.min(MAX_LIMIT, Math.max(1, limit));
  params.set("q", q);
  params.set("limit", String(size));
  params.set("offset", String(Math.max(0, offset)));
  return referencePageOf(await http(`/studio/reference/${encodeURIComponent(key)}?${params}`, { signal }), offset, size);
}

export function firstReferenceInfo(source: string, now = Date.now()): Promise<SxReferencePage> {
  const hit = firstPages.get(source);
  if (hit && now - hit.at < TTL_MS) return hit.page;
  const page = fetchReferencePage(source, "", 0, FIRST_LIMIT);
  const entry: Entry = { at: now, page };
  firstPages.set(source, entry);
  page.catch(() => {
    if (firstPages.get(source) === entry) firstPages.delete(source);
  });
  return page;
}

export function firstReferencePage(source: string, now = Date.now()): Promise<StudioReferenceItem[]> {
  return firstReferenceInfo(source, now).then((p) => p.items);
}

export function dropReferenceCache(source?: string): void {
  if (source === undefined) firstPages.clear();
  else firstPages.delete(source);
}

export function useReferenceOptions(source: string): SxReferenceBinding {
  const labels = useStudioLabels();
  return useMemo<SxReferenceBinding>(() => {
    const toOptions = (items: readonly StudioReferenceItem[]) => items.map((item) => labels.refOption(source, item));
    const loadPage = async (query: string, offset: number, signal: AbortSignal): Promise<SxOptionPage> => {
      const q = query.trim();
      const page = !q && offset === 0 ? await untilAborted(firstReferenceInfo(source), signal) : await fetchReferencePage(source, q, offset, q ? QUERY_LIMIT : FIRST_LIMIT, signal);
      return { options: toOptions(page.items), total: page.total, hasMore: page.hasMore };
    };
    return {
      loadOptions: async (query, signal) => (await loadPage(query, 0, signal)).options,
      loadPage,
      resolveOptions: async (values, signal) => {
        const rows = toOptions(await untilAborted(firstReferencePage(source), signal));
        const byValue = new Map(rows.map((o) => [o.value, o]));
        return values.map((value) => byValue.get(value) ?? { value, label: labels.unknownRef(value) });
      },
      leadingIcon: sourceIcon(source),
    };
  }, [source, labels]);
}
