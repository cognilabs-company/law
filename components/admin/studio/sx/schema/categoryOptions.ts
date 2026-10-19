"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CATEGORY_PATH_SEP, descendantIds, flattenCategoryTree, getCategoryTree, type CategoryRow } from "@/lib/services/categoryTree";
import type { StudioReferenceItem } from "@/lib/services/studio";
import { matchesSearch } from "@/lib/searchText";
import { fetchReferencePage, firstReferenceInfo, untilAborted, type SxOptionPage } from "../form/useReferenceOptions";
import { FolderOpenIcon } from "../icons";
import type { SxIcon, SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";

export type CategoryBinding = {
  loadOptions: (query: string, signal: AbortSignal) => Promise<SxOption[]>;
  loadPage: (query: string, offset: number, signal: AbortSignal) => Promise<SxOptionPage>;
  resolveOptions: (values: readonly string[], signal: AbortSignal) => Promise<SxOption[]>;
  indentOf: (o: SxOption) => number;
  leadingIcon: SxIcon;
};

export type CategoryOptionText = { inactive: string; cycle: string };
export type CategoryRef = { id: string; title: string; parentId: string; path: string[]; depth: number; active: boolean; slug: string };

const ALL_PAGES = 10;
const PAGE = 100;
const SEARCH_LIMIT = 100;

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

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

function pathOf(v: unknown): string[] {
  if (!Array.isArray(v)) return typeof v === "string" && v.trim() ? v.split(/\s*(?:›|>|\/)\s*/).filter(Boolean) : [];
  return v
    .map((p) => (p && typeof p === "object" ? text((p as Record<string, unknown>).title ?? (p as Record<string, unknown>).label ?? (p as Record<string, unknown>).name) : text(p)))
    .filter(Boolean);
}

export function categoryRefOf(item: StudioReferenceItem): CategoryRef {
  const r = item.raw ?? {};
  const title = text(r.title) || item.label || text(r.slug) || item.value;
  const depthRaw = typeof r.depth === "number" ? r.depth : Number(text(r.depth));
  let path = pathOf(r.path);
  if (path.length && path[path.length - 1] !== title) path = [...path, title];
  if (!path.length) path = [title];
  return {
    id: item.value,
    title,
    parentId: text(r.parent_id),
    path,
    depth: Number.isFinite(depthRaw) && depthRaw >= 0 ? depthRaw : Math.max(0, path.length - 1),
    active: r.is_active !== false,
    slug: text(r.slug),
  };
}

export function treeOrder(refs: readonly CategoryRef[]): CategoryRef[] {
  const ids = new Set(refs.map((r) => r.id));
  const kids = new Map<string, CategoryRef[]>();
  const roots: CategoryRef[] = [];
  for (const r of refs) {
    if (r.parentId && r.parentId !== r.id && ids.has(r.parentId)) {
      const list = kids.get(r.parentId) ?? [];
      list.push(r);
      kids.set(r.parentId, list);
    } else roots.push(r);
  }
  const out: CategoryRef[] = [];
  const seen = new Set<string>();
  const walk = (r: CategoryRef) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    out.push(r);
    for (const k of kids.get(r.id) ?? []) walk(k);
  };
  for (const r of roots) walk(r);
  for (const r of refs) walk(r);
  return out;
}

export function refDescendants(id: string, refs: readonly CategoryRef[]): Set<string> {
  const out = new Set<string>();
  const kids = new Map<string, string[]>();
  for (const r of refs) {
    if (!r.parentId) continue;
    const list = kids.get(r.parentId) ?? [];
    list.push(r.id);
    kids.set(r.parentId, list);
  }
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop() as string;
    if (out.has(next)) continue;
    out.add(next);
    stack.push(...(kids.get(next) ?? []));
  }
  return out;
}

export function categoryRefOptions(refs: readonly CategoryRef[], blocked: ReadonlySet<string>, words: CategoryOptionText): SxOption[] {
  return refs.map((r) => {
    const o: SxOption = { value: r.id, label: r.title, icon: FolderOpenIcon };
    const parents = r.path.slice(0, -1).join(CATEGORY_PATH_SEP);
    if (parents) o.description = parents;
    if (!r.active) o.code = words.inactive;
    if (blocked.has(r.id)) o.disabled = words.cycle;
    return o;
  });
}

async function allCategories(source: string, signal: AbortSignal): Promise<{ refs: CategoryRef[]; total: number | null; hasMore: boolean }> {
  const first = await untilAborted(firstReferenceInfo(source), signal);
  const items = [...first.items];
  let hasMore = first.hasMore;
  let pages = 1;
  while (hasMore && pages < ALL_PAGES && !signal.aborted) {
    const next = await fetchReferencePage(source, "", items.length, PAGE, signal);
    if (!next.items.length) break;
    items.push(...next.items);
    hasMore = next.hasMore;
    pages += 1;
  }
  return { refs: treeOrder(items.map(categoryRefOf)), total: first.total, hasMore };
}

async function treeRows(signal: AbortSignal): Promise<CategoryRow[]> {
  return flattenCategoryTree(await getCategoryTree({ includeInactive: true }, signal));
}

export function useCategoryOptions(opts: { source: string; selfId: string; guardCycle: boolean }): CategoryBinding {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const { source, selfId, guardCycle } = opts;
  return useMemo<CategoryBinding>(() => {
    const words: CategoryOptionText = { inactive: labels.status("inactive"), cycle: t("sx.form.cycle") };
    const depths = new Map<string, number>();
    const self = selfId.trim();
    const blockedOf = (refs: readonly CategoryRef[]): Set<string> => {
      if (!guardCycle || !self) return new Set();
      const out = refDescendants(self, refs);
      out.add(self);
      return out;
    };
    const fromTree = async (query: string, signal: AbortSignal): Promise<SxOptionPage> => {
      const rows = await treeRows(signal);
      for (const r of rows) depths.set(r.node.id, r.depth);
      const all = categoryOptionsFrom(rows, { selfId, guardCycle }, words);
      const q = query.trim();
      const options = q ? all.filter((_, i) => categoryRowMatches(rows[i], q)) : all;
      return { options, total: options.length, hasMore: false };
    };
    const fromRefs = async (query: string, signal: AbortSignal): Promise<SxOptionPage> => {
      const all = await allCategories(source, signal);
      for (const r of all.refs) depths.set(r.id, r.depth);
      const blocked = blockedOf(all.refs);
      const q = query.trim();
      if (!q) return { options: categoryRefOptions(all.refs, blocked, words), total: all.total ?? all.refs.length, hasMore: false };
      const found = await fetchReferencePage(source, q, 0, SEARCH_LIMIT, signal);
      return { options: categoryRefOptions(found.items.map(categoryRefOf), blocked, words), total: found.total, hasMore: false };
    };
    const loadPage = (query: string, offset: number, signal: AbortSignal): Promise<SxOptionPage> => {
      if (offset > 0) return Promise.resolve({ options: [], total: null, hasMore: false });
      return fromRefs(query, signal).catch((e: unknown) => {
        if (signal.aborted) throw e;
        return fromTree(query, signal);
      });
    };
    return {
      loadOptions: async (query, signal) => (await loadPage(query, 0, signal)).options,
      loadPage,
      resolveOptions: async (values, signal) => {
        const all = (await loadPage("", 0, signal)).options;
        const byValue = new Map(all.map((o) => [o.value, o]));
        return values.map((value) => byValue.get(value) ?? { value, label: labels.unknownRef(value) });
      },
      indentOf: (o) => depths.get(o.value) ?? 0,
      leadingIcon: FolderOpenIcon,
    };
  }, [t, labels, source, selfId, guardCycle]);
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
