"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CATEGORY_PATH_SEP, descendantIds, flattenCategoryTree, getCategoryTree, type CategoryRow } from "@/lib/services/categoryTree";
import { matchesSearch } from "@/lib/searchText";
import { FolderOpenIcon } from "../icons";
import type { SxIcon, SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";

export type CategoryBinding = {
  loadOptions: (query: string, signal: AbortSignal) => Promise<SxOption[]>;
  resolveOptions: (values: readonly string[], signal: AbortSignal) => Promise<SxOption[]>;
  leadingIcon: SxIcon;
};

export type CategoryOptionText = { inactive: string; cycle: string };

export function categoryOptionsFrom(rows: readonly CategoryRow[], opts: { selfId: string; guardCycle: boolean }, text: CategoryOptionText): SxOption[] {
  const self = opts.selfId.trim();
  const blocked = opts.guardCycle && self ? descendantIds(self, rows) : new Set<string>();
  if (opts.guardCycle && self) blocked.add(self);
  return rows.map((row) => {
    const parents = row.path.slice(0, -1).join(CATEGORY_PATH_SEP);
    const o: SxOption = { value: row.node.id, label: row.node.title || row.node.slug || row.node.id, icon: FolderOpenIcon };
    if (parents) o.description = parents;
    if (!row.node.isActive) o.code = text.inactive;
    if (blocked.has(row.node.id)) o.disabled = text.cycle;
    return o;
  });
}

export function categoryRowMatches(row: CategoryRow, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return matchesSearch([row.node.title, row.node.slug, row.path.join(" "), row.node.discoveryTerms.join(" ")].join(" "), q);
}

async function treeRows(signal: AbortSignal): Promise<CategoryRow[]> {
  return flattenCategoryTree(await getCategoryTree({ includeInactive: true }, signal));
}

export function useCategoryOptions(opts: { selfId: string; guardCycle: boolean }): CategoryBinding {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const { selfId, guardCycle } = opts;
  return useMemo<CategoryBinding>(() => {
    const text: CategoryOptionText = { inactive: labels.status("inactive"), cycle: t("sx.form.cycle") };
    const build = (rows: readonly CategoryRow[]) => categoryOptionsFrom(rows, { selfId, guardCycle }, text);
    return {
      loadOptions: async (query, signal) => {
        const rows = await treeRows(signal);
        const all = build(rows);
        const q = query.trim();
        if (!q) return all;
        return all.filter((_, i) => categoryRowMatches(rows[i], q));
      },
      resolveOptions: async (values, signal) => {
        const all = build(await treeRows(signal));
        const byValue = new Map(all.map((o) => [o.value, o]));
        return values.map((value) => byValue.get(value) ?? { value, label: labels.unknownRef(value) });
      },
      leadingIcon: FolderOpenIcon,
    };
  }, [t, labels, selfId, guardCycle]);
}

export function useCategoryTitle(id: string): string {
  const [found, setFound] = useState<{ id: string; title: string }>({ id: "", title: "" });
  useEffect(() => {
    const want = id.trim();
    if (!want) return;
    const ctrl = new AbortController();
    treeRows(ctrl.signal).then(
      (rows) => {
        if (ctrl.signal.aborted) return;
        setFound({ id: want, title: rows.find((r) => r.node.id === want)?.node.title ?? "" });
      },
      () => {},
    );
    return () => ctrl.abort();
  }, [id]);
  return found.id === id.trim() ? found.title : "";
}
