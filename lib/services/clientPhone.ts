import { asStr, type Dict } from "@/lib/http";

export const PHONE_PAYMENT_PENDING = "payment_pending";

export type PhoneGate = { visible: boolean | null; reason: string };

const dictOf = (v: unknown): Dict | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : null);

function readGate(d: Dict, visibleKey: string, reasonKey: string): PhoneGate | null {
  const reason = asStr(d[reasonKey]).trim();
  const flag = d[visibleKey];
  if (flag === false || (flag !== true && reason)) return { visible: false, reason };
  if (flag === true) return { visible: true, reason: "" };
  return null;
}

export function phoneGateOf(people: readonly unknown[], parents: readonly unknown[] = []): PhoneGate {
  const gates: PhoneGate[] = [];
  for (const p of people) {
    const d = dictOf(p);
    const g = d ? readGate(d, "phone_visible", "phone_hidden_reason") : null;
    if (g) gates.push(g);
  }
  for (const p of parents) {
    const d = dictOf(p);
    const g = d ? readGate(d, "client_phone_visible", "client_phone_hidden_reason") : null;
    if (g) gates.push(g);
  }
  const hidden = gates.filter((g) => g.visible === false);
  if (hidden.length) return { visible: false, reason: hidden.find((g) => g.reason)?.reason ?? "" };
  return { visible: gates.length ? true : null, reason: "" };
}

export function gatedPhone(gate: PhoneGate, ...candidates: unknown[]): string {
  if (gate.visible === false) return "";
  for (const c of candidates) {
    const s = typeof c === "string" || typeof c === "number" ? String(c).trim() : "";
    if (s) return s;
  }
  return "";
}

export function phoneWaitsForPayment(reason: string): boolean {
  return !reason || reason === PHONE_PAYMENT_PENDING;
}
