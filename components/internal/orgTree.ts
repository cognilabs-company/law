import { asDict, asNum, asStr } from "@/lib/http";
import type { OrgBoard, OrgBoardNode } from "@/lib/services/internalHrm";

// The org board's flat nodes and edges turned back into the tree they
// describe: units branching under units, each unit's people under it.
export type Tree = { node: OrgBoardNode; units: Tree[]; people: OrgBoardNode[]; depth: number };

export function buildTree(board: OrgBoard): Tree[] {
  const units = board.nodes.filter((n) => n.type !== "employee");
  const people = board.nodes.filter((n) => n.type === "employee");
  const byId = new Map(units.map((n) => [n.id, n]));
  // Edges are the authority when present; a node's own parent_id otherwise.
  const parentOf = new Map<string, string>();
  for (const n of board.nodes) if (n.parentId) parentOf.set(n.id, n.parentId);
  for (const e of board.edges) parentOf.set(e.target, e.source);
  const kids = new Map<string, OrgBoardNode[]>();
  const staff = new Map<string, OrgBoardNode[]>();
  for (const u of units) {
    const p = parentOf.get(u.id);
    if (p && byId.has(p)) kids.set(p, [...(kids.get(p) ?? []), u]);
  }
  for (const person of people) {
    const p = parentOf.get(person.id);
    if (p) staff.set(p, [...(staff.get(p) ?? []), person]);
  }
  const order = (a: OrgBoardNode, b: OrgBoardNode) => asNum(a.raw.order) - asNum(b.raw.order) || a.label.localeCompare(b.label);
  const make = (n: OrgBoardNode, depth: number, seen: Set<string>): Tree => {
    seen.add(n.id);
    return {
      node: n,
      depth,
      units: (kids.get(n.id) ?? []).filter((c) => !seen.has(c.id)).sort(order).map((c) => make(c, depth + 1, seen)),
      people: (staff.get(n.id) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
    };
  };
  const seen = new Set<string>();
  return units.filter((u) => !parentOf.get(u.id) || !byId.has(parentOf.get(u.id)!)).sort(order).map((r) => make(r, 0, seen));
}

export const positionIdOf = (n: OrgBoardNode) => asStr(asDict(n.raw.position).id) || asStr(asDict(n.raw.assignment).position_id);

// One unit and everything under it.
export function subtreeOf(trees: Tree[], id: string): Tree[] {
  for (const t of trees) {
    if (t.node.id === id) return [t];
    const hit = subtreeOf(t.units, id);
    if (hit.length) return hit;
  }
  return [];
}

// Only the people holding one position, and the units on the way to them.
export function byPosition(trees: Tree[], positionId: string): Tree[] {
  const out: Tree[] = [];
  for (const t of trees) {
    const units = byPosition(t.units, positionId);
    const people = t.people.filter((p) => positionIdOf(p) === positionId);
    if (units.length || people.length) out.push({ ...t, units, people });
  }
  return out;
}

// Keep a unit when it, one of its people or anything below it matches.
export function filterTree(trees: Tree[], needle: string): Tree[] {
  if (!needle) return trees;
  const hit = (n: OrgBoardNode) => `${n.label} ${n.subtitle} ${asStr(n.raw.employee_code)}`.toLocaleLowerCase().includes(needle);
  const out: Tree[] = [];
  for (const t of trees) {
    const units = filterTree(t.units, needle);
    const people = t.people.filter(hit);
    if (hit(t.node) || units.length || people.length) out.push({ ...t, units, people: hit(t.node) ? t.people : people });
  }
  return out;
}

export const flatten = (trees: Tree[]): Tree[] => trees.flatMap((t) => [t, ...flatten(t.units)]);

