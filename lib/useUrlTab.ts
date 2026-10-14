"use client";

import { useSearchParams } from "next/navigation";

export function useUrlTab<T extends string>(tabs: readonly T[], fallback: T): [T, (next: T) => void] {
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab = raw && (tabs as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const pick = (next: T) => {
    const url = new URL(window.location.href);
    if (next === fallback) url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  };
  return [tab, pick];
}
