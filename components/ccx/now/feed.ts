import type { QueueItem } from "@/lib/services/backend";
import type { CockpitItem, CockpitQueue } from "@/lib/services/cockpit";
import { parseServerTime } from "@/lib/http";
import { formatUzPhone } from "@/lib/phone";

export type NowKind = "lead" | "order" | "urgent" | "other" | CockpitQueue;
export type NowTone = "hot" | "warn" | "ok";

export type NowJob = {
  key: string;
  kind: NowKind;
  id: string;
  code: string;
  title: string;
  clientUserId: string;
  clientName: string;
  ageMin: number;
  slaMin: number;
  leftMin: number | null;
  breached: boolean;
  hot: boolean;
  queue?: QueueItem;
  cockpit?: CockpitItem;
};

const KIND: Record<string, NowKind> = { lead: "lead", order: "order", urgent_advokat: "urgent" };
const GENERIC = new Set(["", "order", "lead", "buyurtma", "заказ"]);
const FAR = 1e9;

export const isGenericTitle = (title: string) => GENERIC.has(title.trim().toLowerCase());

const SELLER_KINDS = new Set<NowKind>(["payouts", "payout_recoveries", "experience", "achievements"]);
export const isSellerJob = (job: Pick<NowJob, "kind">) => SELLER_KINDS.has(job.kind);

export function jobsOf(queue: QueueItem[], cockpit: CockpitItem[], fetchedAt: number, now: number): NowJob[] {
  const drift = fetchedAt && now > fetchedAt ? (now - fetchedAt) / 60000 : 0;
  const fromQueue = queue.map((q): NowJob => {
    const age = q.ageMinutes + drift;
    const left = q.slaMinutes - age;
    return {
      key: `q:${q.type}:${q.id}`,
      kind: KIND[q.type] ?? "other",
      id: q.id,
      code: "",
      title: q.title,
      clientUserId: q.clientUserId ?? "",
      clientName: q.clientName ?? "",
      ageMin: age,
      slaMin: q.slaMinutes,
      leftMin: left,
      breached: q.slaBreached || left <= 0,
      hot: q.score === "hot" || q.urgency === "urgent" || q.type === "urgent_advokat",
      queue: q,
    };
  });
  const fromCockpit = cockpit.map((c): NowJob => {
    const at = parseServerTime(c.at);
    const age = Number.isFinite(at) && now > at ? (now - at) / 60000 : 0;
    return {
      key: `c:${c.queue}:${c.id}`,
      kind: c.queue,
      id: c.id,
      code: c.workId,
      title: c.title || c.docTitle,
      clientUserId: c.clientUserId,
      clientName: c.clientName || c.ownerName,
      ageMin: age,
      slaMin: 0,
      leftMin: null,
      breached: age >= 1440,
      hot: c.priority === "high" || c.queue === "assignments" || c.queue === "refunds",
      cockpit: c,
    };
  });
  return [...fromQueue, ...fromCockpit];
}

export function rankJobs(jobs: NowJob[], later: string[]): NowJob[] {
  const band = (j: NowJob) => (j.breached ? 0 : j.hot ? 1 : 2);
  const left = (j: NowJob) => (j.leftMin == null ? FAR : j.leftMin);
  return jobs.slice().sort((x, y) => {
    const lx = later.indexOf(x.key);
    const ly = later.indexOf(y.key);
    if (lx !== ly) {
      if (lx < 0) return -1;
      if (ly < 0) return 1;
      return lx - ly;
    }
    return band(x) - band(y) || left(x) - left(y) || y.ageMin - x.ageMin;
  });
}

export function toneOf(j: NowJob): NowTone {
  if (j.breached) return "hot";
  if (j.leftMin != null) return j.leftMin <= Math.max(5, j.slaMin * 0.25) ? "warn" : "ok";
  return j.ageMin >= 60 ? "warn" : "ok";
}

export const prettyPhone = (phone: string) => (/^\+?998\d{9}$/.test(phone.replace(/[^\d+]/g, "")) ? formatUzPhone(phone) : phone);

export function plainKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return false;
  const el = e.target instanceof HTMLElement ? e.target : null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
  if (el?.closest('[role="dialog"], [role="menu"], [aria-modal="true"]')) return false;
  return !document.querySelector('.amodal, .dock.on, .opx-intro, .opx-look, [aria-modal="true"], [role="menu"]');
}
