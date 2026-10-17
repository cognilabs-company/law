import { ApiError, asArr, asDict, asNum, asStr, currentTokenOwner, http, type Dict } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents, type UserEvent } from "@/lib/userSocket";

export type CategoryNode = { id: string; parentId: string; slug: string; title: string; description: string; discoveryTerms: string[]; sortOrder: number; isActive: boolean; childrenCount: number; children: CategoryNode[] };
export type CategoryRow = { node: CategoryNode; depth: number; path: string[]; ancestors: string[] };

export const CATEGORY_TREE_PATH = "/marketplace/service-category-tree";
export const CATEGORY_PATH_SEP = " › ";

const MAX_DEPTH = 32;
const CACHE_MS = 5 * 60 * 1000;

function termsOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const d = asDict(x);
    const s = (typeof x === "string" || typeof x === "number" ? String(x) : asStr(d.value ?? d.term ?? d.text ?? d.label)).trim();
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function activeOf(d: Dict): boolean {
  const v = d.is_active ?? d.active ?? d.isActive;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return !/^(false|0|no|off|inactive)$/i.test(v.trim());
  return true;
}

function sortNodes(list: CategoryNode[]): CategoryNode[] {
  return list
    .map((node, at) => ({ node, at }))
    .sort((a, b) => a.node.sortOrder - b.node.sortOrder || a.at - b.at)
    .map((x) => x.node);
}

function nodeOf(v: unknown, parentId: string, depth: number, seen: Set<string>): CategoryNode | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Dict;
  const id = asStr(d.id ?? d.category_id ?? d.uuid).trim();
  if (!id || seen.has(id)) return null;
  seen.add(id);
  const raw = asArr(d.children ?? d.subcategories);
  const children = depth >= MAX_DEPTH ? [] : sortNodes(raw.map((c) => nodeOf(c, id, depth + 1, seen)).filter((c): c is CategoryNode => c !== null));
  const slug = asStr(d.slug).trim();
  const title = asStr(d.title ?? d.name ?? d.label).trim();
  const ownParent = asStr(d.parent_id ?? d.parentId).trim();
  return {
    id,
    parentId: ownParent && ownParent !== id ? ownParent : parentId,
    slug,
    title: title || slug || id,
    description: asStr(d.description).trim(),
    discoveryTerms: termsOf(d.discovery_terms ?? d.discoveryTerms),
    sortOrder: asNum(d.sort_order ?? d.sortOrder, 0),
    isActive: activeOf(d),
    childrenCount: Math.max(0, asNum(d.children_count ?? d.childrenCount, children.length)),
    children,
  };
}

function nestFlatRoots(roots: CategoryNode[]): CategoryNode[] {
  const byId = new Map(roots.map((n) => [n.id, n]));
  const reaches = (from: string, target: string): boolean => {
    const seen = new Set<string>();
    for (let cur = byId.get(from); cur && !seen.has(cur.id); cur = byId.get(cur.parentId)) {
      if (cur.id === target) return true;
      seen.add(cur.id);
    }
    return false;
  };
  const touched = new Set<CategoryNode>();
  const out: CategoryNode[] = [];
  for (const n of roots) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (!parent || parent === n || reaches(parent.id, n.id)) {
      out.push(n);
      continue;
    }
    parent.children.push(n);
    touched.add(parent);
  }
  for (const p of touched) {
    p.children = sortNodes(p.children);
    p.childrenCount = Math.max(p.childrenCount, p.children.length);
  }
  return out;
}

export function normCategoryTree(v: unknown): CategoryNode[] {
  const d = asDict(v);
  const list = Array.isArray(v) ? v : asArr(d.items ?? d.data ?? d.categories ?? d.results);
  const seen = new Set<string>();
  return nestFlatRoots(sortNodes(list.map((x) => nodeOf(x, "", 0, seen)).filter((x): x is CategoryNode => x !== null)));
}

function treeUrl(term: string, includeInactive: boolean): string {
  const qs = new URLSearchParams();
  if (term) qs.set("q", term);
  if (includeInactive) qs.set("include_inactive", "true");
  const s = qs.toString();
  return s ? `${CATEGORY_TREE_PATH}?${s}` : CATEGORY_TREE_PATH;
}

async function fetchTree(term: string, includeInactive: boolean, signal?: AbortSignal): Promise<CategoryNode[]> {
  return normCategoryTree(await http(treeUrl(term, includeInactive), { signal }));
}

function untilAborted<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new ApiError(0, "aborted"));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new ApiError(0, "aborted"));
    signal.addEventListener("abort", stop, { once: true });
    p.then(
      (value) => {
        signal.removeEventListener("abort", stop);
        resolve(value);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", stop);
        reject(e);
      },
    );
  });
}

let cached: { owner: string; at: number; nodes: CategoryNode[] } | null = null;
let pending: { owner: string; promise: Promise<CategoryNode[]> } | null = null;
let generation = 0;

export function invalidateCategoryTree(): void {
  cached = null;
  pending = null;
  generation += 1;
}

const TREE_EVENTS = new Set(["studio.object_published", "studio.object_archived", "studio.object_rollback", "studio.resync"]);

function eventCtorCode(e: UserEvent): string {
  const d = asDict(e.data);
  for (const src of [e, d, asDict(e.object), asDict(d.object)]) {
    const code = asStr(src.constructor_code ?? src.constructorCode).trim();
    if (code) return code.toUpperCase();
  }
  return "";
}

let watching = false;

function watchTreeChanges(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  subscribeUserEvents((e) => {
    if (!TREE_EVENTS.has(e.event)) return;
    const code = eventCtorCode(e);
    if (!code || code === "K01") invalidateCategoryTree();
  });
  onUserSocketResync(invalidateCategoryTree);
}

export async function getCategoryTree(q?: { q?: string; includeInactive?: boolean }, signal?: AbortSignal): Promise<CategoryNode[]> {
  const term = (q?.q ?? "").trim();
  const inactive = q?.includeInactive === true;
  if (!inactive || term) return fetchTree(term, inactive, signal);
  watchTreeChanges();
  const owner = currentTokenOwner();
  if (cached && cached.owner === owner && Date.now() - cached.at < CACHE_MS) return cached.nodes;
  if (!pending || pending.owner !== owner) {
    const gen = generation;
    const promise: Promise<CategoryNode[]> = fetchTree("", true).then(
      (nodes) => {
        if (gen === generation) cached = { owner, at: Date.now(), nodes };
        if (pending?.promise === promise) pending = null;
        return nodes;
      },
      (e: unknown) => {
        if (pending?.promise === promise) pending = null;
        throw e;
      },
    );
    pending = { owner, promise };
  }
  return untilAborted(pending.promise, signal);
}

export function flattenCategoryTree(nodes: readonly CategoryNode[]): CategoryRow[] {
  const rows: CategoryRow[] = [];
  const seen = new Set<string>();
  const walk = (list: readonly CategoryNode[], depth: number, path: string[], ancestors: string[]) => {
    for (const node of list) {
      if (!node || !node.id || seen.has(node.id)) continue;
      seen.add(node.id);
      const here = [...path, node.title];
      rows.push({ node, depth, path: here, ancestors });
      if (node.children.length && depth < MAX_DEPTH) walk(node.children, depth + 1, here, [...ancestors, node.id]);
    }
  };
  walk(nodes, 0, [], []);
  return rows;
}

export function descendantIds(id: string, rows: readonly CategoryRow[]): Set<string> {
  const out = new Set<string>();
  if (!id) return out;
  for (const r of rows) if (r.ancestors.includes(id)) out.add(r.node.id);
  return out;
}

export function categoryPathLabel(row: CategoryRow, format: (title: string) => string = (s) => s): string {
  return row.path.map(format).join(CATEGORY_PATH_SEP);
}
