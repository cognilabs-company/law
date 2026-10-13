import type { Option } from "@/components/Select";
import { isLeadOperator, operatorName, type AdminUser } from "@/lib/services/users";

export type AssignLabels = {
  unknown: string;
  count: (n: number) => string;
  idle?: string;
  me?: string;
};

export type RankedOperator = {
  id: string;
  user: AdminUser;
  label: string;
  name: string;
  count: number;
  me: boolean;
};

export function leadLoadOf(leads: readonly { assignedTo: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of leads) if (l.assignedTo) m.set(l.assignedTo, (m.get(l.assignedTo) ?? 0) + 1);
  return m;
}

export function assignableOperators(ops: readonly AdminUser[]): AdminUser[] {
  const seen = new Set<string>();
  const out: AdminUser[] = [];
  for (const u of ops) {
    if (!u.id || seen.has(u.id) || !isLeadOperator(u)) continue;
    seen.add(u.id);
    out.push(u);
  }
  return out;
}

export function rankForAssign(ops: readonly AdminUser[], load: ReadonlyMap<string, number>, labels: AssignLabels, meId = ""): RankedOperator[] {
  const rows = assignableOperators(ops).map((u) => {
    const name = operatorName(u) || labels.unknown;
    const me = !!meId && u.id === meId;
    return { id: u.id, user: u, name, label: me && labels.me ? `${name} (${labels.me})` : name, count: Math.max(0, load.get(u.id) ?? 0), me };
  });
  rows.sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));
  return rows;
}

export function assignHint(count: number, labels: AssignLabels): string {
  return count > 0 ? labels.count(count) : (labels.idle ?? "");
}

export function assignOptions(ops: readonly AdminUser[], load: ReadonlyMap<string, number>, labels: AssignLabels, meId = ""): Option[] {
  return rankForAssign(ops, load, labels, meId).map((r) => {
    const hint = assignHint(r.count, labels);
    return hint ? { value: r.id, label: r.label, hint } : { value: r.id, label: r.label };
  });
}
