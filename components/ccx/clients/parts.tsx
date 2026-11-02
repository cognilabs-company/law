import type { ReactNode } from "react";
import type { CcCall, CcClient } from "@/lib/services/backend";
import { humanize } from "@/lib/labels";

export type Tone = "ok" | "warn" | "hot" | "info" | "mute";
export type CallKind = "in" | "out" | "missed";
type Tr = ((key: string) => string) & { has: (key: string) => boolean };

export const digits = (s: string) => s.replace(/\D/g, "");

const OK = new Set(["active", "completed", "done", "paid", "resolved", "closed", "won", "answered", "accepted", "approved", "delivered", "success", "succeeded"]);
const HOT = new Set(["cancelled", "canceled", "rejected", "failed", "expired", "lost", "blocked", "banned", "suspended", "deleted", "missed", "disputed", "declined", "overdue", "wrong_number"]);
const WARN = new Set(["pending", "payment_pending", "pending_payment", "new", "open", "unpaid", "no_answer", "busy", "in_review", "decision_pending", "callback", "held", "partially_paid", "inactive", "draft", "created", "processing", "escalated", "waiting_info"]);

export function toneOf(status: string): Tone {
  const s = status.trim().toLowerCase();
  if (!s) return "mute";
  if (OK.has(s)) return "ok";
  if (HOT.has(s)) return "hot";
  if (WARN.has(s) || s.startsWith("await") || s.startsWith("waiting")) return "warn";
  if (s.includes("refund")) return "mute";
  return "info";
}

export function callKind(c: CcCall): CallKind {
  if (c.status === "missed") return "missed";
  return c.direction === "outgoing" ? "out" : "in";
}

export function exactOf(items: CcClient[], term: string): CcClient | undefined {
  const q = term.trim().toLowerCase();
  const d = digits(q);
  return items.find((c) => {
    if (c.lexgoId && c.lexgoId.trim().toLowerCase() === q) return true;
    const p = digits(c.phone);
    return d.length >= 9 && Boolean(p) && (p === d || p === `998${d}`);
  });
}

export function Pill({ tone, dot, children }: { tone: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`opx-cl-pill${dot ? " opx-cl-pill--dot" : ""}`} data-tone={tone}>
      {children}
    </span>
  );
}

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="opx-i"
      style={{ width: size, height: size }}
    >
      {children}
    </svg>
  );
}

const HANDSET = "M5 4h3.5l1.8 4.4-2.2 1.4a11 11 0 0 0 6.1 6.1l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z";

export function CallIcon({ kind, size = 18 }: { kind: CallKind; size?: number }) {
  const mark = kind === "out" ? "M15 9l6-6M16.5 3H21v4.5" : kind === "in" ? "M21 3l-6 6M15 4.5V9h4.5" : "M15.5 3.5l5 5M20.5 3.5l-5 5";
  return (
    <Svg size={size}>
      <path d={HANDSET} />
      <path d={mark} />
    </Svg>
  );
}

export function IcWallet({ size = 18 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path className="opx-i__t" d="M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18V7.5Z" />
      <path d="M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18V7.5ZM4 7.5l11.5-3.3a1 1 0 0 1 1.3 1v2.3" />
      <path className="opx-i__a" d="M16 13.5h2" />
    </Svg>
  );
}

export function IcPlus({ size = 18 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

const ACTIVITY_GROUPS: readonly [RegExp, string][] = [
  [/^marketplace_/, "marketplace"],
  [/^(document_|service_document_|custom_document|existing_document)/, "document"],
  [/^urgent_advokat_/, "urgent"],
  [/^(payment_|milestone_|upsell_)/, "payment"],
  [/^subscription/, "subscription"],
  [/^secure_chat_/, "chat"],
  [/^ai(_|$)/, "ai"],
  [/^call_/, "call"],
  [/^contract_/, "contract"],
  [/^support_/, "support"],
  [/^(login|logout|session_|totp_|password_|telegram_|identity_|notification_)/, "account"],
  [/^order_/, "order"],
];

export function activityLabel(t: Tr, action: string): string {
  const a = action.trim().toLowerCase();
  if (!a) return "";
  if (t.has(`actions.${a}`)) return t(`actions.${a}`);
  const group = ACTIVITY_GROUPS.find(([re]) => re.test(a))?.[1] ?? "other";
  return t.has(`actionGroups.${group}`) ? t(`actionGroups.${group}`) : humanize(a);
}

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HEX_ID_RE = /\b[0-9a-f]{24,}\b/gi;
const BOILERPLATE = new Set(["user logged in", "logged in", "order", "lead", "call-center call"]);

export function activityDetail(detail: string): string {
  const s = detail
    .replace(UUID_RE, "")
    .replace(HEX_ID_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:#·,;-]+|[\s:#·,;-]+$/g, "")
    .trim();
  if (!s || /^[a-z][a-z0-9_]*$/.test(s) || BOILERPLATE.has(s.toLowerCase())) return "";
  return s;
}
