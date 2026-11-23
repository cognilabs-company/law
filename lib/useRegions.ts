"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { asArr, asDict, asStr, http, logApiError } from "@/lib/http";
import { REGION_KEYS } from "@/lib/lawyers";

// GET /regions (public; 2026-11-21 contract §5.1): the 14 keys the backend
// accepts, each with labels {uz_latn, uz_cyrl, ru, en}. Every region select
// sends the key, never the label. Asked once per page load; until it answers,
// or when it fails, the same 14 keys under this site's own labels.
export type RegionRow = { key: string; labels: Record<string, string> };

export function regionsOf(raw: unknown): RegionRow[] {
  const items = Array.isArray(raw) ? raw : asArr(asDict(raw).items);
  return items
    .map((x) => {
      const d = asDict(x);
      const l = asDict(d.labels);
      const labels: Record<string, string> = {};
      for (const k of Object.keys(l)) if (asStr(l[k]).trim()) labels[k] = asStr(l[k]).trim();
      return { key: asStr(d.key).trim(), labels };
    })
    .filter((r) => r.key);
}

export const regionLabelIn = (r: RegionRow, locale: string): string => (locale === "ru" ? r.labels.ru : locale === "en" ? r.labels.en : r.labels.uz_latn) || r.labels.uz_latn || "";

let shared: Promise<RegionRow[]> | null = null;
export function loadRegions(): Promise<RegionRow[]> {
  shared ??= http("/regions")
    .then(regionsOf)
    .catch((e: unknown) => {
      logApiError("regions", e);
      shared = null;
      return [];
    });
  return shared;
}

export type RegionOption = { value: string; label: string };

export function useRegionOptions(): RegionOption[] {
  const locale = useLocale();
  const te = useTranslations("enums");
  const [rows, setRows] = useState<RegionRow[]>([]);
  useEffect(() => {
    let alive = true;
    void loadRegions().then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  const own = (k: string) => (te.has(`regions.${k}`) ? te(`regions.${k}`) : k);
  if (rows.length) return rows.map((r) => ({ value: r.key, label: regionLabelIn(r, locale) || own(r.key) }));
  return REGION_KEYS.map((k) => ({ value: k, label: own(k) }));
}
