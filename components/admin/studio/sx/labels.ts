import type { SxNameCode, SxScope } from "./types";

const WORDS =
  "enabled audio fallback recording retention days reconnect provider providers environment secret reference timeout retry health check rate limit limits burst event mapping endpoint signature delivery policy status statuses capability primary conditions circuit breaker slug service services id ids visibility field fields operator placeholder audience quorum transitions roles role queue key terminal calendar timezone work hours region regions rules rule rating code placement preview window minutes seconds sanctions example backoff export idempotency schedule hero faq seo canonical url sla columns lead scoring watermark seller sellers type types budget experience widgets filters filter format permission permissions verification license profile completion account selling expiry minimum maximum price exceptions variants packages package deliverables requirements duration options frequency cap boost boosts availability starts ends at checkout steps payment gate approval approvals handoff cancellation refund refunds required documents document checks review reviews reverification eligibility formula moderation appeal complaint complaints redo client clients response discount usage scope capacity blackout dates online flag flags plans plan rollout percent job jobs handler parameters holidays data archive delete mode legal hold source joins formatting auto dashboard metrics drilldowns refresh object prefix length sequence checksum entity colors actions organization organizations unit skills assignment escalation index sorts synonyms normalization access email manual delegation self mb video virus scan the and of for to with by in on a an studio core webhook registry routing support workflow crm pipeline marketplace ranking feature scheduled promotion campaign admin manager center call lawyer lawyers viewer ceo content executive finance marketing moderator owner quality control sales head super superadmin test approve pay internal payroll hrm records create edit meetings manage end employee employees busy intervals trail grant temporary live office rooms activity advertising products product advocate corporate templates four eyes kpi structure feedback schedules attendance tasks execution replacement academy cases notifications payments users catalog orders state funded aid subscriptions open dispute chats reassign pending correction requests verify view all permitted analytics top search featured banner regional sponsored starter pro boost days";

export const EN_WORDS: ReadonlySet<string> = new Set(WORDS.split(/\s+/).filter(Boolean));

const CYRILLIC = /[Ѐ-ӿ]/;
const UZ_APOSTROPHE = /['ʻʼ‘’]/;

export function isEnglishLooking(label: string, key?: string): boolean {
  const text = String(label ?? "").trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  if (key) {
    const k = String(key).trim().toLowerCase();
    if (k && (lower === k || lower === k.replace(/[_-]+/g, " ").trim())) return true;
  }
  if (CYRILLIC.test(text) || UZ_APOSTROPHE.test(text)) return false;
  const tokens = lower.match(/[a-z]+/g) ?? [];
  return tokens.every((w) => EN_WORDS.has(w));
}

export function codeLike(value: string): boolean {
  const v = String(value ?? "").trim();
  return /^[a-z0-9]+([_.:/-][a-z0-9]+)+$/i.test(v) || /^[A-Z][A-Z0-9_]+$/.test(v);
}

const CODE_LABEL = /^\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)\s*[-–—:]\s+(.+)$/;

export function splitCodeLabel(label: string, knownCodes?: ReadonlySet<string>): SxNameCode {
  const text = String(label ?? "");
  const m = CODE_LABEL.exec(text);
  if (m) {
    const code = m[1];
    const name = m[2].trim();
    if (name && (knownCodes?.has(code) || /^[A-Z]+\d/.test(code))) return { code, name };
  }
  return { code: "", name: text.trim() };
}

const USER_LABEL = /^(.*?)\s*\((\+?\d[\d\s-]{6,})\)\s*$/;

export function splitUserLabel(label: string): { name: string; phone: string } {
  const text = String(label ?? "");
  const m = USER_LABEL.exec(text);
  if (m && m[1].trim()) return { name: m[1].trim(), phone: m[2].trim() };
  return { name: text.trim(), phone: "" };
}

export function fieldPath(path: string): string {
  return String(path ?? "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((s) => s.trim())
    .filter((s) => s && !/^\d+$/.test(s))
    .join("__");
}

export function scopedKeys(base: string, key: string, scope?: SxScope): string[] {
  const k = String(key ?? "").trim();
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  const ctor = scope?.ctor?.trim();
  const path = scope?.path?.trim() ?? "";
  if (ctor) {
    if (/[.[]/.test(path)) {
      const fp = fieldPath(path);
      if (fp) add(`${base}.${ctor}__${fp}`);
    }
    if (k) add(`${base}.${ctor}__${k}`);
  }
  if (k) add(`${base}.${k}`);
  return out;
}

export function groupedMoney(raw: string, separator: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const negative = text.startsWith("-");
  const body = text.replace(/-/g, "");
  const dot = body.indexOf(".");
  const whole = dot < 0 ? body : body.slice(0, dot);
  const fraction = dot < 0 ? "" : body.slice(dot);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return `${negative ? "-" : ""}${grouped}${fraction}`;
}
