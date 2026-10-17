"use client";

import { useMemo } from "react";
import { loadStudioReference, type StudioReferenceItem } from "@/lib/services/studio";
import { sourceIcon } from "../icons";
import type { SxIcon, SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";

export type SxReferenceBinding = {
  loadOptions: (query: string, signal: AbortSignal) => Promise<SxOption[]>;
  resolveOptions: (values: readonly string[], signal: AbortSignal) => Promise<SxOption[]>;
  leadingIcon: SxIcon;
};

const TTL_MS = 5 * 60 * 1000;
const FIRST_LIMIT = 100;
const QUERY_LIMIT = 50;

type Entry = { at: number; items: Promise<StudioReferenceItem[]> };

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

export function firstReferencePage(source: string, now = Date.now()): Promise<StudioReferenceItem[]> {
  const hit = firstPages.get(source);
  if (hit && now - hit.at < TTL_MS) return hit.items;
  const items = loadStudioReference(source, "", FIRST_LIMIT);
  const entry: Entry = { at: now, items };
  firstPages.set(source, entry);
  items.catch(() => {
    if (firstPages.get(source) === entry) firstPages.delete(source);
  });
  return items;
}

export function dropReferenceCache(source?: string): void {
  if (source === undefined) firstPages.clear();
  else firstPages.delete(source);
}

export function useReferenceOptions(source: string): SxReferenceBinding {
  const labels = useStudioLabels();
  return useMemo<SxReferenceBinding>(() => {
    const toOptions = (items: readonly StudioReferenceItem[]) => items.map((item) => labels.refOption(source, item));
    return {
      loadOptions: async (query, signal) => {
        const q = query.trim();
        if (!q) return toOptions(await untilAborted(firstReferencePage(source), signal));
        return toOptions(await loadStudioReference(source, q, QUERY_LIMIT, signal));
      },
      resolveOptions: async (values, signal) => {
        const rows = toOptions(await untilAborted(firstReferencePage(source), signal));
        const byValue = new Map(rows.map((o) => [o.value, o]));
        return values.map((value) => byValue.get(value) ?? { value, label: labels.unknownRef(value) });
      },
      leadingIcon: sourceIcon(source),
    };
  }, [source, labels]);
}
